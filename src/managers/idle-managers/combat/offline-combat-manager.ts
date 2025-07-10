import { Combat, Equipment, Item } from "@prisma/client";
import { logger } from "../../../utils/logger";
import { CombatUpdate, IdleCombatActivityElement } from "../idle-manager-types";
import { DomainManager } from "./domain-manager";
import { getAtkCooldownFromAtkSpd } from "./combat-helpers";
import { Battle } from "./battle";
import { DEVELOPMENT_FUNDS_KEY, MAX_OFFLINE_IDLE_PROGRESS_S, REFERRAL_BOOST, REFERRAL_COMBAT_CUT } from "../../../utils/config";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { LEDGER_UPDATE_BALANCE_EVENT } from "../../../socket/events";
import { calculateHpExpGained } from "../../../utils/helpers";
import { DungeonManager, DungeonState } from "./dungeon-manager";
import { getReferrer, logReferralEarning } from "../../../sql-services/referrals";
import { emitMissionUpdate, updateCombatMissions } from "../../../sql-services/missions";
import { FullMonster, prismaUpdateDungeonLeaderboard } from "../../../sql-services/combat-service";
import { getDomainById, getDungeonById, incrementExpAndHpExpAndCheckLevelUpMemory, setUserCombatHp } from "../../../operations/combat-operations";
import { getUserLevelMemory, incrementUserGold } from "../../../operations/user-operations";
import { canUserMintItem, mintItemToUser } from "../../../operations/item-inventory-operations";
import { canUserMintEquipment, mintEquipmentToUser } from "../../../operations/equipment-inventory-operations";
import { logCombatActivity } from "../../../operations/user-activity-log-operations";
import { SocketManager } from "../../../socket/socket-manager";
import { incrementTotalCombatDittoByTelegramId } from "../../../redis/intract";
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis'
import { requireUserMemoryManager } from "../../global-managers/global-managers";

export interface CurrentCombat {
  combatType: 'Domain' | 'Dungeon',
  userId: string,
  userCombat: Combat,
  locationId: number,
  startTimestamp: number,
  monsterToStartWith: FullMonster,
  dungeonState?: DungeonState,
}

interface CombatStats {
  totalExp: number;
  totalHpExp: number;
  totalGold: number;
  totalDitto: bigint;
  userDied: boolean;
  monsterKillCounts: Record<string, { name: string; uri: string; quantity: number }>;
  itemDrops: { item: Item; quantity: number }[];
  equipmentDrops: { equipment: Equipment; quantity: number }[];
  missionUpdates: { telegramId: string; monsterId: number; quantity: number }[];
  combatActivitiesByMonster: Record<number, {
    monsterId: number;
    killCount: number;
    totalExp: number;
    totalGold: number;
    totalDitto: bigint;
    drops: { itemId?: number; equipmentId?: number; quantity: number }[];
  }>;
}

interface CombatSimulation {
  userCombat: Combat;
  monster: FullMonster;
  userAtkCooldown: number;
  monsterAtkCooldown: number;
  userNextAtk: number;
  monsterNextAtk: number;
  userRegenTimer: number;
  monsterRegenTimer: number;
  userNextRegen: number;
  monsterNextRegen: number;
  stats: CombatStats;
}

export class OfflineCombatManager {
  static DROP_NERF_MULTIPLIER = 0.25;
  static EXP_NERF_MULTIPLIER = 0.5;
  static USER_NERF_MULTIPLIER = 0.5;

  constructor() { }

  static async handleLoadedCombatActivity(
    dittoLedgerSocket: DittoLedgerSocket,
    activity: IdleCombatActivityElement,
    socketManager: SocketManager,
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
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

    // Log activity with full userCombatState but only monster name and id
    const logActivity = {
      ...activity,
      monster: activity.monster ? {
        id: activity.monster.id,
        name: activity.monster.name
      } : undefined
    };

    logger.info(`Combat activity loaded for user ${activity.userId}: ${JSON.stringify(logActivity, null, 2)}`);

    switch (activity.mode) {
      case "domain":
        return await this.handleCombat(dittoLedgerSocket, activity, socketManager, redisClient, {
          getLocation: (id) => getDomainById(id),
          getInitialMonster: (location, activity) => {
            if (activity.monster && activity.monster.combat.hp > 0) return activity.monster;
            return DomainManager.getRandomMonsterFromDomain(location as any);
          },
          getNextMonster: (location) => DomainManager.getRandomMonsterFromDomain(location as any),
          onMonsterDeath: () => { }, // No special handling for domains
          onUserDeath: async () => { }, // No special handling for domains
          trackDamage: false,
          combatType: 'Domain'
        });

      case "dungeon":
        return await this.handleCombat(dittoLedgerSocket, activity, socketManager, redisClient, {
          getLocation: (id) => getDungeonById(id),
          getInitialMonster: (location, activity) => {
            if (activity.monster && activity.monster.combat.hp > 0) return activity.monster;
            return DungeonManager.getMonsterFromDungeonByIndex(location as any, activity.currentMonsterIndex!);
          },
          getNextMonster: (location, activity) => {
            const dungeon = location as any;
            activity.currentMonsterIndex!++;
            if (activity.currentMonsterIndex! >= dungeon.monsterSequence.length) {
              activity.currentMonsterIndex = 0;
              activity.currentFloor!++;
            }
            const baseMonster = DungeonManager.getMonsterFromDungeonByIndex(dungeon, activity.currentMonsterIndex!);
            return DungeonManager.getBuffedFullMonster(baseMonster, Math.pow(dungeon.monsterGrowthFactor, Math.max(1, activity.currentFloor! - 1)));
          },
          onMonsterDeath: () => { }, // Progress tracking handled in getNextMonster
          onUserDeath: async (location, activity) => {
            const dungeon = location as any;
            await prismaUpdateDungeonLeaderboard(
              activity.userId,
              dungeon.id,
              {
                totalDamageDealt: activity.totalDamageDealt!,
                totalDamageTaken: activity.totalDamageTaken!,
                floor: activity.currentFloor!,
                monsterIndex: activity.currentMonsterIndex!,
                startTimestamp: activity.startTimestamp
              },
              dungeon.monsterSequence.length
            );
          },
          trackDamage: true,
          combatType: 'Dungeon'
        });

      default:
        throw new Error(`Unknown combat mode: ${activity.mode}`);
    }
  }

  private static async handleCombat(
    dittoLedgerSocket: DittoLedgerSocket,
    activity: IdleCombatActivityElement,
    socketManager: SocketManager,
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    config: {
      getLocation: (id: number) => Promise<any>;
      getInitialMonster: (location: any, activity: IdleCombatActivityElement) => FullMonster | null;
      getNextMonster: (location: any, activity: IdleCombatActivityElement) => FullMonster | null;
      onMonsterDeath: (location: any, activity: IdleCombatActivityElement) => void;
      onUserDeath: (location: any, activity: IdleCombatActivityElement) => Promise<void>;
      trackDamage: boolean;
      combatType: 'Domain' | 'Dungeon';
    }
  ) {
    // Setup
    const locationId = activity.domainId || activity.dungeonId;
    if (!locationId) throw new Error(`Location ID not found for idle combat activity`);

    const location = await config.getLocation(locationId);
    if (!location) throw new Error(`Location not found: ${locationId}`);

    // Validate level requirements
    const userLevel = await getUserLevelMemory(activity.userId);
    if (!this.checkLevelRequirements(userLevel, location)) {
      logger.warn(`User ${activity.userId} does not meet ${config.combatType.toLowerCase()} level requirements. Skipping offline progress.`);
      return { combatUpdate: undefined, currentCombat: undefined };
    }

    // Validate dungeon-specific fields
    if (config.trackDamage) {
      if (activity.currentMonsterIndex == null) throw new Error(`Current monster index not found in idle combat activity`);
      if (activity.currentFloor == null) throw new Error(`Current floor not found in idle combat activity`);
      if (activity.totalDamageDealt == null) throw new Error(`Total damage dealt not found in idle combat activity`);
      if (activity.totalDamageTaken == null) throw new Error(`Total damage taken not found in idle combat activity`);
    }

    // Initialize simulation
    const REAL_ELAPSED_MS = Date.now() - activity.logoutTimestamp!;
    const offlineMs = Math.min(REAL_ELAPSED_MS, MAX_OFFLINE_IDLE_PROGRESS_S * 1000);
    const tickMs = 100;
    const totalTicks = Math.floor(offlineMs / tickMs);

    const simulation = this.initializeSimulation(activity, location, config);
    if (!simulation) throw new Error(`Failed to initialize combat simulation`);

    // Run simulation
    await this.runSimulation(simulation, totalTicks, tickMs, location, activity, config);

    // Process results
    const { originalCombat, expRes } = await this.processResults(
      activity,
      simulation.stats,
      dittoLedgerSocket,
      socketManager,
      redisClient
    );

    logger.info(`Offline combat simulation ended for user ${activity.userId}. UserDied=${simulation.stats.userDied}, TotalTicks=${totalTicks}, Will resume=${!simulation.stats.userDied}`);

    return {
      combatUpdate: this.createCombatUpdate(simulation.stats, expRes, activity),
      currentCombat: simulation.stats.userDied ? undefined : this.createCurrentCombat(
        activity,
        originalCombat,
        location,
        simulation.monster,
        totalTicks,
        tickMs,
        config
      )
    };
  }

  private static checkLevelRequirements(userLevel: number, location: any): boolean {
    return userLevel >= (location.minCombatLevel ?? -Infinity) &&
      userLevel <= (location.maxCombatLevel ?? Infinity);
  }

  private static initializeSimulation(
    activity: IdleCombatActivityElement,
    location: any,
    config: any
  ): CombatSimulation | null {
    const originalCombat = activity.userCombatState;
    const userCombat = this.cloneCombat(originalCombat);
    this.nerfUserCombat(userCombat);

    const monster = config.getInitialMonster(location, activity);
    if (!monster) return null;

    const userAtkCooldown = getAtkCooldownFromAtkSpd(userCombat.atkSpd) * 1000;
    const monsterAtkCooldown = getAtkCooldownFromAtkSpd(monster.combat.atkSpd) * 1000;
    const userRegenTimer = userCombat.hpRegenRate * 1000;
    const monsterRegenTimer = monster.combat.hpRegenRate * 1000;

    return {
      userCombat,
      monster,
      userAtkCooldown,
      monsterAtkCooldown,
      userNextAtk: userAtkCooldown,
      monsterNextAtk: monsterAtkCooldown,
      userRegenTimer,
      monsterRegenTimer,
      userNextRegen: userRegenTimer,
      monsterNextRegen: monsterRegenTimer,
      stats: {
        totalExp: 0,
        totalHpExp: 0,
        totalGold: 0,
        totalDitto: 0n,
        userDied: false,
        monsterKillCounts: {},
        itemDrops: [],
        equipmentDrops: [],
        missionUpdates: [],
        combatActivitiesByMonster: {}
      }
    };
  }

  private static async runSimulation(
    simulation: CombatSimulation,
    totalTicks: number,
    tickMs: number,
    location: any,
    activity: IdleCombatActivityElement,
    config: any
  ) {
    for (let t = 0; t < totalTicks; t++) {
      // User attacks
      if (simulation.userNextAtk <= 0) {
        const dmg = Battle.calculateDamage(simulation.userCombat, simulation.monster.combat);

        if (config.trackDamage) {
          activity.totalDamageDealt! += Math.min(dmg.dmg, simulation.monster.combat.hp);
        }

        simulation.monster.combat.hp = Math.max(0, simulation.monster.combat.hp - dmg.dmg);
        simulation.userNextAtk = simulation.userAtkCooldown;

        if (simulation.monster.combat.hp === 0) {
          this.processMonsterDeath(simulation, location, activity, config);

          const nextMonster = config.getNextMonster(location, activity);
          if (!nextMonster) break;

          simulation.monster = nextMonster;
          simulation.monsterAtkCooldown = getAtkCooldownFromAtkSpd(simulation.monster.combat.atkSpd) * 1000;
          simulation.monsterNextAtk = simulation.monsterAtkCooldown;
          simulation.monsterRegenTimer = simulation.monster.combat.hpRegenRate * 1000;
          simulation.monsterNextRegen = simulation.monsterRegenTimer;
        }
      }

      // Monster attacks
      if (simulation.monsterNextAtk <= 0) {
        const dmg = Battle.calculateDamage(simulation.monster.combat, simulation.userCombat);

        if (config.trackDamage) {
          activity.totalDamageTaken! += Math.min(dmg.dmg, simulation.userCombat.hp);
        }

        simulation.userCombat.hp = Math.max(0, simulation.userCombat.hp - dmg.dmg);
        simulation.monsterNextAtk = simulation.monsterAtkCooldown;

        if (simulation.userCombat.hp === 0) {
          simulation.stats.userDied = true;
          await config.onUserDeath(location, activity);
          break;
        }
      }

      // Regeneration
      if (simulation.userNextRegen <= 0) {
        simulation.userCombat.hp = Math.min(simulation.userCombat.maxHp, simulation.userCombat.hp + simulation.userCombat.hpRegenAmount);
        simulation.userNextRegen = simulation.userRegenTimer;
      }

      if (simulation.monsterNextRegen <= 0) {
        simulation.monster.combat.hp = Math.min(simulation.monster.combat.maxHp, simulation.monster.combat.hp + simulation.monster.combat.hpRegenAmount);
        simulation.monsterNextRegen = simulation.monsterRegenTimer;
      }

      // Reduce timers
      simulation.userNextAtk -= tickMs;
      simulation.monsterNextAtk -= tickMs;
      simulation.userNextRegen -= tickMs;
      simulation.monsterNextRegen -= tickMs;
    }
  }

  private static processMonsterDeath(
    simulation: CombatSimulation,
    location: any,
    activity: IdleCombatActivityElement,
    config: any
  ) {
    const monster = simulation.monster;

    // Record kill for UI
    const key = `${monster.name}-${monster.imgsrc}`;
    if (simulation.stats.monsterKillCounts[key]) {
      simulation.stats.monsterKillCounts[key].quantity += 1;
    } else {
      simulation.stats.monsterKillCounts[key] = {
        name: monster.name,
        uri: monster.imgsrc,
        quantity: 1,
      };
    }

    // Calculate rewards
    const exp = Math.floor(monster.exp * this.EXP_NERF_MULTIPLIER);
    const goldGained = Math.floor(Number(Battle.getAmountDrop(BigInt(monster.minGoldDrop), BigInt(monster.maxGoldDrop))) * this.DROP_NERF_MULTIPLIER);
    const dittoGained = Battle.roundWeiTo1DecimalPlace(
      this.scaleBigInt(
        Battle.getAmountDrop(BigInt(monster.minDittoDrop.toString()), BigInt(monster.maxDittoDrop.toString())),
        this.DROP_NERF_MULTIPLIER
      )
    );

    // Update totals
    simulation.stats.totalExp += exp;
    simulation.stats.totalHpExp += calculateHpExpGained(exp);
    simulation.stats.totalGold += goldGained;
    simulation.stats.totalDitto += dittoGained;

    // Aggregate by monster ID for database
    if (!simulation.stats.combatActivitiesByMonster[monster.id]) {
      simulation.stats.combatActivitiesByMonster[monster.id] = {
        monsterId: monster.id,
        killCount: 0,
        totalExp: 0,
        totalGold: 0,
        totalDitto: 0n,
        drops: []
      };
    }

    const monsterActivity = simulation.stats.combatActivitiesByMonster[monster.id];
    monsterActivity.killCount += 1;
    monsterActivity.totalExp += exp;
    monsterActivity.totalGold += goldGained;
    monsterActivity.totalDitto += dittoGained;

    // Process drops
    this.processDrops(monster, simulation.stats, monsterActivity);

    config.onMonsterDeath(location, activity);
  }

  private static processDrops(
    monster: FullMonster,
    stats: CombatStats,
    monsterActivity: any
  ) {
    for (const drop of monster.drops) {
      if (Math.random() <= drop.dropRate * this.DROP_NERF_MULTIPLIER) {
        if (drop.itemId) {
          // UI aggregation
          const existing = stats.itemDrops.find(d => d.item.id === drop.item!.id);
          if (existing) {
            existing.quantity += drop.quantity;
          } else {
            stats.itemDrops.push({ item: drop.item!, quantity: drop.quantity });
          }

          // Database aggregation
          const existingActivityDrop = monsterActivity.drops.find((d: any) => d.itemId === drop.itemId);
          if (existingActivityDrop) {
            existingActivityDrop.quantity += drop.quantity;
          } else {
            monsterActivity.drops.push({ itemId: drop.itemId, quantity: drop.quantity });
          }
        } else if (drop.equipmentId) {
          // UI aggregation
          const existing = stats.equipmentDrops.find(d => d.equipment.id === drop.equipment!.id);
          if (existing) {
            existing.quantity += drop.quantity;
          } else {
            stats.equipmentDrops.push({ equipment: drop.equipment!, quantity: drop.quantity });
          }

          // Database aggregation
          const existingActivityDrop = monsterActivity.drops.find((d: any) => d.equipmentId === drop.equipmentId);
          if (existingActivityDrop) {
            existingActivityDrop.quantity += drop.quantity;
          } else {
            monsterActivity.drops.push({ equipmentId: drop.equipmentId, quantity: drop.quantity });
          }
        }
      }
    }
  }

  private static async processResults(
    activity: IdleCombatActivityElement,
    stats: CombatStats,
    dittoLedgerSocket: DittoLedgerSocket,
    socketManager: SocketManager,
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
  ) {
    // Log combat activities
    for (const monsterActivity of Object.values(stats.combatActivitiesByMonster)) {
      try {
        await logCombatActivity({
          userId: activity.userId,
          monsterId: monsterActivity.monsterId,
          quantity: monsterActivity.killCount,
          expGained: monsterActivity.totalExp,
          goldEarned: monsterActivity.totalGold,
          dittoEarned: monsterActivity.totalDitto.toString(),
          drops: monsterActivity.drops
        });

        stats.missionUpdates.push({
          telegramId: activity.userId,
          monsterId: monsterActivity.monsterId,
          quantity: monsterActivity.killCount
        });
      } catch (error) {
        logger.error(`Failed to log combat activity for monster ${monsterActivity.monsterId}: ${error}`);
      }
    }

    // Handle experience and level ups
    const { expRes, updatedCombat } = await this.handleExperienceAndLevelUps(
      activity.userId,
      stats.totalExp,
      activity.userCombatState
    );

    // Handle rewards
    await incrementUserGold(activity.userId, stats.totalGold);
    await this.handleDittoDrop(dittoLedgerSocket, activity.userId, stats.totalDitto, redisClient);

    // Handle drops
    for (const itemDrop of stats.itemDrops) {
      if (await canUserMintItem(activity.userId, itemDrop.item.id)) {
        await mintItemToUser(activity.userId, itemDrop.item.id, itemDrop.quantity);
      }
    }

    for (const equipmentDrop of stats.equipmentDrops) {
      if (await canUserMintEquipment(activity.userId, equipmentDrop.equipment.id)) {
        await mintEquipmentToUser(activity.userId, equipmentDrop.equipment.id, equipmentDrop.quantity);
      }
    }

    // Handle missions
    await updateCombatMissions(stats.missionUpdates);
    await emitMissionUpdate(socketManager.getSocketByUserId(activity.userId), activity.userId);

    return { originalCombat: updatedCombat, expRes };
  }

  private static async handleExperienceAndLevelUps(
    userId: string,
    totalExp: number,
    originalCombat: Combat
  ): Promise<{ expRes: any; updatedCombat: Combat }> {
    const expRes = await incrementExpAndHpExpAndCheckLevelUpMemory(userId, totalExp);
    let updatedCombat = originalCombat;

    if (expRes.hpLevelUp || expRes.levelUp) {
      const userMemoryManager = requireUserMemoryManager();
      if (userMemoryManager.hasUser(userId)) {
        const updatedUser = userMemoryManager.getUser(userId);
        if (updatedUser?.combat) {
          if (expRes.levelUp) {
            updatedCombat = { ...updatedUser.combat, hp: updatedUser.combat.maxHp };

            // Update the user's HP in memory to match battle init using existing function
            await setUserCombatHp(userId, updatedUser.combat.maxHp);

          } else {
            updatedCombat = { ...updatedUser.combat, hp: originalCombat.hp };

            // Update HP in memory to preserve original HP for HP-only level ups
            await setUserCombatHp(userId, originalCombat.hp);
          }
        }
      }
    }

    return { expRes, updatedCombat };
  }

  private static createCombatUpdate(
    stats: CombatStats,
    expRes: any,
    activity: IdleCombatActivityElement
  ): CombatUpdate {
    return {
      type: 'combat',
      update: {
        userDied: stats.userDied,
        monstersKilled: Object.values(stats.monsterKillCounts),
        items: stats.itemDrops.map(drop => ({
          itemId: drop.item.id,
          itemName: drop.item.name,
          quantity: drop.quantity,
          uri: drop.item.imgsrc
        })),
        equipment: stats.equipmentDrops.map(drop => ({
          equipmentId: drop.equipment.id,
          equipmentName: drop.equipment.name,
          quantity: drop.quantity,
          uri: drop.equipment.imgsrc
        })),
        expGained: stats.totalExp,
        hpExpGained: stats.totalHpExp,
        dittoGained: stats.totalDitto.toString(),
        levelsGained: (expRes.levelUp) ? expRes.level - activity.userLevel : undefined,
        hpLevelsGained: (expRes.hpLevelUp) ? expRes.hpLevel - activity.userHpLevel : undefined,
        goldGained: stats.totalGold
      }
    };
  }

  private static createCurrentCombat(
    activity: IdleCombatActivityElement,
    originalCombat: Combat,
    location: any,
    monster: FullMonster,
    totalTicks: number,
    tickMs: number,
    config: any
  ): CurrentCombat {
    const currentCombat: CurrentCombat = {
      combatType: config.combatType,
      userId: activity.userId,
      userCombat: originalCombat,
      locationId: location.id,
      startTimestamp: activity.logoutTimestamp! + (totalTicks * tickMs),
      monsterToStartWith: monster?.combat.hp > 0 ? monster : config.getNextMonster(location, activity)
    };

    if (config.combatType === 'Dungeon') {
      currentCombat.dungeonState = {
        floor: activity.currentFloor!,
        monsterIndex: activity.currentMonsterIndex!,
        totalDamageDealt: activity.totalDamageDealt!,
        totalDamageTaken: activity.totalDamageTaken!,
        startTimestamp: activity.startTimestamp
      };
    }

    return currentCombat;
  }

  static async handleDittoDrop(
    dittoLedgerSocket: DittoLedgerSocket,
    userId: string,
    amountDitto: bigint,
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
  ) {
    try {
      const referrer = await getReferrer(userId);

      let dittoDrop = amountDitto;
      let referrerCut = 0n;

      if (referrer && referrer.referrerUserId) {
        dittoDrop = Battle.scaleBN(dittoDrop, REFERRAL_BOOST + 1);
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

        if (referrer && !referrer.referrerExternal && referrer.referrerUserId && referrerCut > 0n) {
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

        await incrementTotalCombatDittoByTelegramId(redisClient, userId, dittoDrop);

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
    userCombat.hp = Math.floor(Math.min(userCombat.hp, userCombat.maxHp));
  }

  static cloneCombat(combat: Combat): Combat {
    return { ...combat };
  }

  static scaleBigInt(value: bigint, multiplier: number): bigint {
    return (value * BigInt(Math.round(multiplier * 1000))) / BigInt(1000);
  }
}