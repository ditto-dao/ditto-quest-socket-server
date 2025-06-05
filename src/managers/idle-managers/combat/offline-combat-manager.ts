import { Combat, Equipment, Item } from "@prisma/client";
import { logger } from "../../../utils/logger";
import { CombatUpdate, IdleCombatActivityElement } from "../idle-manager-types";
import { DomainManager } from "./domain-manager";
import { FullMonster, getDomainById, getDungeonById, updateDungeonLeaderboard } from "../../../sql-services/combat-service";
import { getAtkCooldownFromAtkSpd } from "./combat-helpers";
import { Battle } from "./battle";
import { DEVELOPMENT_FUNDS_KEY, MAX_OFFLINE_IDLE_PROGRESS_S, REFERRAL_BOOST, REFERRAL_COMBAT_CUT } from "../../../utils/config";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { getUserLevel, incrementExpAndHpExpAndCheckLevelUp, incrementUserGoldBalance } from "../../../sql-services/user-service";
import { LEDGER_UPDATE_BALANCE_EVENT } from "../../../socket/events";
import { canUserMintItem, mintItemToUser } from "../../../sql-services/item-inventory-service";
import { canUserMintEquipment, mintEquipmentToUser } from "../../../sql-services/equipment-inventory-service";
import { calculateHpExpGained } from "../../../utils/helpers";
import { CombatActivityInput, logCombatActivities } from "../../../sql-services/user-activity-log";
import { DungeonManager, DungeonState } from "./dungeon-manager";
import { getReferrer, logReferralEarning } from "../../../sql-services/referrals";
import { updateCombatMissions } from "../../../sql-services/missions";

export interface CurrentCombat {
  combatType: 'Domain' | 'Dungeon',
  userId: string,
  userCombat: Combat,
  locationId: number,
  startTimestamp: number,
  monsterToStartWith: FullMonster,
  dungeonState?: DungeonState,
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
        return await OfflineCombatManager.handleLoadedDungeonCombat(dittoLedgerSocket, activity);
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

    const userLevel = await getUserLevel(activity.userId);
    if (
      userLevel < (domain.minCombatLevel ?? -Infinity) ||
      userLevel > (domain.maxCombatLevel ?? Infinity)
    ) {
      logger.warn(`User ${activity.userId} does not meet domain level requirements. Skipping offline progress.`);

      return {
        combatUpdate: undefined,
        currentCombat: undefined
      };
    }

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

    let userRegenTimer = userCombat.hpRegenRate * 1000;
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
    const missionUpdates: { telegramId: string; monsterId: number; quantity: number }[] = [];

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

          missionUpdates.push({
            telegramId: activity.userId,
            monsterId: monster.id,
            quantity: 1
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

    await OfflineCombatManager.handleDittoDrop(dittoLedgerSocket, activity.userId, totalDitto);

    for (const itemDrop of itemDrops) {
      if (await canUserMintItem(activity.userId, itemDrop.item.id)) {
        await mintItemToUser(activity.userId, itemDrop.item.id, itemDrop.quantity);
      }
    }
    for (const equipmentDrop of equipmentDrops) {
      if (await canUserMintEquipment(activity.userId, equipmentDrop.equipment.id)) {
        await mintEquipmentToUser(activity.userId, equipmentDrop.equipment.id, equipmentDrop.quantity);
      }
    }

    await logCombatActivities(combatActivities);
    await updateCombatMissions(missionUpdates);

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
        locationId: domain.id,
        startTimestamp: activity.logoutTimestamp! + (totalTicks * tickMs),
        monsterToStartWith: monster?.combat.hp > 0
          ? monster
          : DomainManager.getRandomMonsterFromDomain(domain)
      } : undefined
    }
  }

  static async handleLoadedDungeonCombat(
    dittoLedgerSocket: DittoLedgerSocket,
    activity: IdleCombatActivityElement,
  ): Promise<{
    combatUpdate: CombatUpdate | undefined;
    currentCombat: CurrentCombat | undefined;
  }> {
    if (!activity.dungeonId) throw new Error(`Dungeon ID not found for idle combat activity`);

    const REAL_ELAPSED_MS = Date.now() - activity.logoutTimestamp!;
    const offlineMs = Math.min(
      REAL_ELAPSED_MS * OfflineCombatManager.SPEED_MULTIPLIER,
      MAX_OFFLINE_IDLE_PROGRESS_S * 1000
    );
    const tickMs = 100;
    const totalTicks = Math.floor(offlineMs / tickMs);

    const dungeon = await getDungeonById(activity.dungeonId);
    if (!dungeon) throw new Error(`Dungeon not found: ${activity.dungeonId}`);

    const userLevel = await getUserLevel(activity.userId);
    if (
      userLevel < (dungeon.minCombatLevel ?? -Infinity) ||
      userLevel > (dungeon.maxCombatLevel ?? Infinity)
    ) {
      logger.warn(`User ${activity.userId} does not meet dungeon level requirements. Skipping offline progress.`);

      return {
        combatUpdate: undefined,
        currentCombat: undefined
      };
    }

    let originalCombat = activity.userCombatState;
    let userCombat = OfflineCombatManager.cloneCombat(originalCombat);
    OfflineCombatManager.nerfUserCombat(userCombat);

    let monster = activity.monster;
    if (activity.currentMonsterIndex == null) throw new Error(`Current monster index not found in idle combat activity`);
    if (activity.currentFloor == null) throw new Error(`Current floor not found in idle combat activity`);
    if (activity.totalDamageDealt == null) throw new Error(`Total damage dealt not found in idle combat activity`);
    if (activity.totalDamageTaken == null) throw new Error(`Total damage taken not found in idle combat activity`);
    if (!monster || monster.combat.hp <= 0) monster = DungeonManager.getMonsterFromDungeonByIndex(dungeon, activity.currentMonsterIndex);
    if (!monster) throw new Error(`Failed to get monster from dungeon during offline sim.`);

    let userAtkCooldown = getAtkCooldownFromAtkSpd(userCombat.atkSpd) * 1000;
    let monsterAtkCooldown = getAtkCooldownFromAtkSpd(monster.combat.atkSpd) * 1000;
    let userNextAtk = userAtkCooldown;
    let monsterNextAtk = monsterAtkCooldown;

    let userRegenTimer = userCombat.hpRegenRate * 1000;
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
    const missionUpdates: { telegramId: string; monsterId: number; quantity: number }[] = [];

    for (let t = 0; t < totalTicks; t++) {
      // User attacks
      if (userNextAtk <= 0) {
        const dmg = Battle.calculateDamage(userCombat, monster.combat);
        activity.totalDamageDealt += Math.min(dmg.dmg, monster.combat.hp);

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

          missionUpdates.push({
            telegramId: activity.userId,
            monsterId: monster.id,
            quantity: 1
          });

          // handle monster and floor increment
          activity.currentMonsterIndex++;
          if (activity.currentMonsterIndex >= dungeon.monsterSequence.length) {
            activity.currentMonsterIndex = 0;
            activity.currentFloor++;
          }

          // Replace monster
          monster = DungeonManager.getMonsterFromDungeonByIndex(dungeon, activity.currentMonsterIndex);
          monster = DungeonManager.getBuffedFullMonster(monster, Math.pow(dungeon.monsterGrowthFactor, Math.max(1, activity.currentFloor - 1)));

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
        activity.totalDamageTaken += Math.min(dmg.dmg, userCombat.hp);

        userCombat.hp = Math.max(0, userCombat.hp - dmg.dmg);
        monsterNextAtk = monsterAtkCooldown;

        if (userCombat.hp === 0) {
          userDied = true;
          await updateDungeonLeaderboard(
            activity.userId,
            dungeon.id,
            {
              totalDamageDealt: activity.totalDamageDealt,
              totalDamageTaken: activity.totalDamageDealt,
              floor: activity.currentFloor,
              monsterIndex: activity.currentMonsterIndex,
              startTimestamp: activity.startTimestamp
            },
            dungeon.monsterSequence.length
          );
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
      if (await canUserMintItem(activity.userId, itemDrop.item.id)) {
        await mintItemToUser(activity.userId, itemDrop.item.id, itemDrop.quantity);
      }
    }
    for (const equipmentDrop of equipmentDrops) {
      if (await canUserMintEquipment(activity.userId, equipmentDrop.equipment.id)) {
        await mintEquipmentToUser(activity.userId, equipmentDrop.equipment.id, equipmentDrop.quantity);
      }
    }

    await logCombatActivities(combatActivities);
    await updateCombatMissions(missionUpdates);

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
        combatType: 'Dungeon',
        userId: activity.userId,
        userCombat: {
          ...originalCombat,
          hp: Math.floor(Math.min((userCombat.hp / userCombat.maxHp) * originalCombat.maxHp, originalCombat.maxHp))
        },
        locationId: dungeon.id,
        startTimestamp: activity.logoutTimestamp! + (totalTicks * tickMs),
        monsterToStartWith: monster?.combat.hp > 0
          ? monster
          : DungeonManager.getBuffedFullMonster(DungeonManager.getMonsterFromDungeonByIndex(dungeon, activity.currentMonsterIndex), activity.currentFloor),
        dungeonState: {
          floor: activity.currentFloor,
          monsterIndex: activity.currentMonsterIndex,
          totalDamageDealt: activity.totalDamageDealt,
          totalDamageTaken: activity.totalDamageTaken,
          startTimestamp: activity.startTimestamp
        }
      } : undefined
    }
  }

  static async handleDittoDrop(
    dittoLedgerSocket: DittoLedgerSocket,
    userId: string,
    amountDitto: bigint
  ) {
    try {
      const referrer = await getReferrer(userId);

      let dittoDrop = amountDitto;

      let referrerCut = 0n;

      if (referrer && referrer.referrerUserId) {
        dittoDrop = Battle.scaleBN(dittoDrop, REFERRAL_BOOST + 1); // e.g. 1.1x boost
        referrerCut = Battle.scaleBN(dittoDrop, REFERRAL_COMBAT_CUT);
      }

      if (dittoDrop > 0n) {
        const dittoDropUser = dittoDrop - referrerCut;
        const dittoDropUserRounded = Battle.roundWeiTo2DecimalPlaces(dittoDropUser);
        const referrerCutRounded = Battle.roundWeiTo5DecimalPlaces(referrerCut);

        const updates = [
          {
            userId: DEVELOPMENT_FUNDS_KEY,
            liveBalanceChange: (-dittoDropUserRounded).toString(),
            accumulatedBalanceChange: "0",
            notes: "Deducted for monster DITTO drop to user",
          },
          {
            userId: userId,
            liveBalanceChange: dittoDropUserRounded.toString(),
            accumulatedBalanceChange: "0",
            notes: "Monster DITTO drop",
          }
        ];

        if (
          referrer &&
          !referrer.referrerExternal &&
          referrer.referrerUserId &&
          referrerCut > 0n
        ) {
          updates.push(
            {
              userId: DEVELOPMENT_FUNDS_KEY,
              liveBalanceChange: (-referrerCutRounded).toString(),
              accumulatedBalanceChange: "0",
              notes: "Deducted for referral DITTO reward",
            },
            {
              userId: referrer.referrerUserId,
              liveBalanceChange: referrerCutRounded.toString(),
              accumulatedBalanceChange: "0",
              notes: `Referral earnings from user ${userId}`,
            }
          );

          await logReferralEarning({
            referrerId: referrer.referrerUserId,
            refereeId: userId,
            amountDittoWei: referrerCutRounded.toString(),
            tier: 1,
          });
        }

        dittoLedgerSocket.emit(LEDGER_UPDATE_BALANCE_EVENT, {
          sender: DEVELOPMENT_FUNDS_KEY,
          updates,
        });

        return dittoDropUserRounded;
      }
    } catch (err) {
      logger.error(`Failed to handle ditto drop in offline combat.`);
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