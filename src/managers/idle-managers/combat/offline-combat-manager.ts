import { Combat, Equipment, Item } from "@prisma/client";
import { logger } from "../../../utils/logger";
import { CombatUpdate, IdleCombatActivityElement } from "../idle-manager-types";
import { DomainManager } from "./domain-manager";
import { FullMonster, getDomainById } from "../../../sql-services/combat-service";
import { getAtkCooldownFromAtkSpd, getBaseHpRegenRateFromHpLvl } from "./combat-helpers";
import { Battle } from "./battle";
import { DEVELOPMENT_FUNDS_KEY, MAX_OFFLINE_IDLE_PROGRESS_S } from "../../../utils/config";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { incrementExpAndHpExpAndCheckLevelUp, incrementUserGoldBalance } from "../../../sql-services/user-service";
import { LEDGER_UPDATE_BALANCE_EVENT } from "../../../socket/events";
import { mintItemToUser } from "../../../sql-services/item-inventory-service";
import { mintEquipmentToUser } from "../../../sql-services/equipment-inventory-service";
import { calculateHpExpGained } from "../../../utils/helpers";
import { CombatActivityInput, logCombatActivities } from "../../../sql-services/user-activity-log";

export type CurrentCombat = CurrentDomainCombat;

export interface CurrentDomainCombat {
  combatType: 'Domain',
  userId: string,
  userCombat: Combat,
  domainId: number,
  startTimestamp: number,
  monsterToStartWith: FullMonster
}

export class OfflineCombatManager {

  static SPEED_MULTIPLIER = 0.25;
  static DROP_NERF_MULTIPLIER = 0.25;
  static EXP_NERF_MULTIPLIER = 0.5;
  static USER_NERF_MULTIPLIER = 0.75;

  constructor() { }

  static async handleLoadedCombatActivity(
    dittoLedgerSocket: DittoLedgerSocket,
    activity: IdleCombatActivityElement,
  ): Promise<{
    combatUpdate: CombatUpdate | undefined;
    currentCombat: CurrentCombat | undefined;
  }> {
    if (activity.activity !== "combat") {
      throw new Error("Invalid activity type. Expected combat activity.");
    }

    if (!activity.logoutTimestamp) {
      throw new Error("Logout timestamp not found in loaded combat activity.");
    }

    logger.info(`Combat activity loaded for user ${activity.userId}: ${JSON.stringify(activity, null, 2)}`);

    switch (activity.mode) {
      case "domain":
        return await OfflineCombatManager.handleLoadedDomainCombat(dittoLedgerSocket, activity);

      case "dungeon":
        // Dungeon combat will be implemented later
        throw new Error("Dungeon combat loading not yet implemented.");

      default:
        throw new Error(`Unknown combat mode: ${activity.mode}`);
    }
  }

  static async handleLoadedDomainCombat(
    dittoLedgerSocket: DittoLedgerSocket,
    activity: IdleCombatActivityElement,
  ): Promise<{
    combatUpdate: CombatUpdate | undefined;
    currentCombat: CurrentCombat | undefined;
  }> {
    if (!activity.domainId) throw new Error(`Domain ID not found for idle combat activity`);

    const REAL_ELAPSED_MS = Date.now() - activity.logoutTimestamp!;
    const offlineMs = Math.min(
      REAL_ELAPSED_MS * OfflineCombatManager.SPEED_MULTIPLIER,
      MAX_OFFLINE_IDLE_PROGRESS_S * 1000
    );
    const tickMs = 100;
    const totalTicks = Math.floor(offlineMs / tickMs);

    const domain = await getDomainById(activity.domainId);
    if (!domain) throw new Error(`Domain not found: ${activity.domainId}`);

    let originalCombat = activity.userCombatState;
    let userCombat = OfflineCombatManager.cloneCombat(originalCombat);
    OfflineCombatManager.nerfUserCombat(userCombat);

    let monster = activity.monster;
    if (!monster || monster.combat.hp <= 0) monster = DomainManager.getRandomMonsterFromDomain(domain);
    if (!monster) throw new Error(`Failed to get monster from domain during offline sim.`);

    let userAtkCooldown = getAtkCooldownFromAtkSpd(userCombat.atkSpd) * 1000;
    let monsterAtkCooldown = getAtkCooldownFromAtkSpd(monster.combat.atkSpd) * 1000;
    let userNextAtk = userAtkCooldown;
    let monsterNextAtk = monsterAtkCooldown;

    let userRegenTimer = getBaseHpRegenRateFromHpLvl(userCombat.hpRegenRate) * 1000;
    let monsterRegenTimer = monster.combat.hpRegenRate * 1000;
    let userNextRegen = userRegenTimer;
    let monsterNextRegen = monsterRegenTimer;

    let totalExp = 0;
    let totalHpExp = 0;
    let totalGold = 0;
    let totalDitto = 0n;
    let userDied = false;

    const monsterKillCounts: Record<string, { name: string; uri: string; quantity: number }> = {};
    const itemDrops: { item: Item; quantity: number }[] = [];
    const equipmentDrops: { equipment: Equipment; quantity: number }[] = [];
    const combatActivities: CombatActivityInput[] = [];

    for (let t = 0; t < totalTicks; t++) {
      // User attacks
      if (userNextAtk <= 0) {
        const dmg = Battle.calculateDamage(userCombat, monster.combat);
        monster.combat.hp = Math.max(0, monster.combat.hp - dmg.dmg);
        userNextAtk = userAtkCooldown;

        if (monster.combat.hp === 0) {
          // Record kill
          const key = `${monster.name}-${monster.imgsrc}`;
          if (monsterKillCounts[key]) {
            monsterKillCounts[key].quantity += 1;
          } else {
            monsterKillCounts[key] = {
              name: monster.name,
              uri: monster.imgsrc,
              quantity: 1,
            };
          }

          // Record gains
          const exp = Math.floor(monster.exp * OfflineCombatManager.EXP_NERF_MULTIPLIER);
          const goldGained = Math.floor(Number(Battle.getAmountDrop(BigInt(monster.minGoldDrop), BigInt(monster.maxGoldDrop))) * OfflineCombatManager.DROP_NERF_MULTIPLIER);
          const dittoGained = Battle.roundWeiTo1DecimalPlace(
            OfflineCombatManager.scaleBigInt(
              Battle.getAmountDrop(BigInt(monster.minDittoDrop.toString()), BigInt(monster.maxDittoDrop.toString())),
              OfflineCombatManager.DROP_NERF_MULTIPLIER
            )
          );
          const currDrops: { itemId?: number; equipmentId?: number; quantity: number }[] = [];

          totalExp += exp
          totalHpExp += calculateHpExpGained(exp);
          totalGold += goldGained;
          totalDitto += dittoGained;

          for (const drop of monster.drops) {
            if (Math.random() <= drop.dropRate * OfflineCombatManager.DROP_NERF_MULTIPLIER) {
              if (drop.itemId) {
                const existing = itemDrops.find(d => d.item.id === drop.item!.id);
                if (existing) {
                  existing.quantity += drop.quantity;
                } else {
                  itemDrops.push({ item: drop.item!, quantity: drop.quantity });
                }

                currDrops.push({
                  itemId: drop.itemId,
                  quantity: drop.quantity,
                });
              } else if (drop.equipmentId) {
                const existing = equipmentDrops.find(d => d.equipment.id === drop.equipment!.id);
                if (existing) {
                  existing.quantity += drop.quantity;
                } else {
                  equipmentDrops.push({ equipment: drop.equipment!, quantity: drop.quantity });
                }

                currDrops.push({
                  equipmentId: drop.equipmentId,
                  quantity: drop.quantity,
                });
              }
            }
          }

          // inside monster defeated block
          combatActivities.push({
            userId: activity.userId,
            monsterId: monster.id,
            expGained: exp,
            goldEarned: goldGained,
            dittoEarned: dittoGained.toString(),
            drops: currDrops
          });

          // Replace monster
          monster = DomainManager.getRandomMonsterFromDomain(domain)!;
          if (!monster) break;

          monsterAtkCooldown = getAtkCooldownFromAtkSpd(monster.combat.atkSpd) * 1000;
          monsterNextAtk = monsterAtkCooldown;
          monsterRegenTimer = monster.combat.hpRegenRate * 1000;
          monsterNextRegen = monsterRegenTimer;
        }
      }

      // Monster attacks
      if (monsterNextAtk <= 0) {
        const dmg = Battle.calculateDamage(monster.combat, userCombat);
        userCombat.hp = Math.max(0, userCombat.hp - dmg.dmg);
        monsterNextAtk = monsterAtkCooldown;

        if (userCombat.hp === 0) {
          userDied = true;
          break;
        }
      }

      // Regen
      if (userNextRegen <= 0) {
        userCombat.hp = Math.min(userCombat.maxHp, userCombat.hp + userCombat.hpRegenAmount);
        userNextRegen = userRegenTimer;
      }

      if (monsterNextRegen <= 0) {
        monster.combat.hp = Math.min(monster.combat.maxHp, monster.combat.hp + monster.combat.hpRegenAmount);
        monsterNextRegen = monsterRegenTimer;
      }

      // Reduce timers
      userNextAtk -= tickMs;
      monsterNextAtk -= tickMs;
      userNextRegen -= tickMs;
      monsterNextRegen -= tickMs;
    }

    // handle increments in db
    const expRes = await incrementExpAndHpExpAndCheckLevelUp(activity.userId, totalExp);
    await incrementUserGoldBalance(activity.userId, totalGold);
    OfflineCombatManager.handleDittoDrop(dittoLedgerSocket, activity.userId, totalDitto);
    for (const itemDrop of itemDrops) {
      await mintItemToUser(activity.userId, itemDrop.item.id, itemDrop.quantity);
    }
    for (const equipmentDrop of equipmentDrops) {
      await mintEquipmentToUser(activity.userId, equipmentDrop.equipment.id, equipmentDrop.quantity);
    }

    await logCombatActivities(combatActivities);

    logger.info(`Offline combat simulation ended for user ${activity.userId}. UserDied=${userDied}, TotalTicks=${totalTicks}, Will resume=${!userDied}`);

    return {
      combatUpdate: {
        type: 'combat',
        update: {
          userDied,
          monstersKilled: Object.values(monsterKillCounts),
          items: itemDrops.map(drop => ({
            itemId: drop.item.id,
            itemName: drop.item.name,
            quantity: drop.quantity,
            uri: drop.item.imgsrc
          })),
          equipment: equipmentDrops.map(drop => ({
            equipmentId: drop.equipment.id,
            equipmentName: drop.equipment.name,
            quantity: drop.quantity,
            uri: drop.equipment.imgsrc
          })),
          expGained: totalExp,
          hpExpGained: totalHpExp,
          dittoGained: totalDitto.toString(),
          levelsGained: (expRes.levelUp) ? expRes.level - activity.userLevel : undefined,
          hpLevelsGained: (expRes.hpLevelUp) ? expRes.hpLevel - activity.userHpLevel : undefined,
          goldGained: totalGold
        }
      },
      currentCombat: (!userDied) ? {
        combatType: 'Domain',
        userId: activity.userId,
        userCombat: {
          ...originalCombat,
          hp: Math.floor(Math.min((userCombat.hp / userCombat.maxHp) * originalCombat.maxHp, originalCombat.maxHp))
        },
        domainId: domain.id,
        startTimestamp: activity.logoutTimestamp! + (totalTicks * tickMs),
        monsterToStartWith: monster?.combat.hp > 0
          ? monster
          : DomainManager.getRandomMonsterFromDomain(domain)
      } : undefined
    }
  }

  static handleDittoDrop(dittoLedgerSocket: DittoLedgerSocket, userId: string, amountDitto: bigint) {
    try {
      if (amountDitto > 0n) {
        dittoLedgerSocket.emit(LEDGER_UPDATE_BALANCE_EVENT, {
          sender: DEVELOPMENT_FUNDS_KEY,
          updates: [
            {
              userId: DEVELOPMENT_FUNDS_KEY,
              liveBalanceChange: (-amountDitto).toString(),
              accumulatedBalanceChange: "0",
              notes: "Deducted for monster DITTO drop",
            },
            {
              userId: userId,
              liveBalanceChange: (amountDitto).toString(),
              accumulatedBalanceChange: "0",
              notes: "Monster DITTO drop",
            }
          ]
        })
      }
    } catch (err) {
      logger.error(`Failed to handle ditto drop in battle.`)
    }
  }


  static nerfUserCombat(userCombat: Combat) {
    const multiplier = OfflineCombatManager.USER_NERF_MULTIPLIER;

    userCombat.atkSpd *= multiplier;
    userCombat.acc *= multiplier;
    userCombat.eva *= multiplier;
    userCombat.maxMeleeDmg *= multiplier;
    userCombat.maxRangedDmg *= multiplier;
    userCombat.maxMagicDmg *= multiplier;
    userCombat.critChance *= multiplier;
    userCombat.critMultiplier *= multiplier;
    userCombat.dmgReduction *= multiplier;
    userCombat.magicDmgReduction *= multiplier;
    userCombat.hpRegenRate /= multiplier;
    userCombat.hpRegenAmount *= multiplier;
    userCombat.maxHp *= multiplier;
    userCombat.hp = Math.floor(Math.min(userCombat.hp, userCombat.maxHp)); // clamp HP to new max
  }

  static cloneCombat(combat: Combat): Combat {
    return { ...combat };
  }

  static scaleBigInt(value: bigint, multiplier: number): bigint {
    return (value * BigInt(Math.round(multiplier * 1000))) / BigInt(1000);
  }
}