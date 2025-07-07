import { User, Combat, AttackType } from "@prisma/client";
import { getAtkCooldownFromAtkSpd, getPercentageDmgReduct } from "./combat-helpers";
import { logger } from "../../../utils/logger";
import { SocketManager } from "../../../socket/socket-manager";
import { COMBAT_EXP_UPDATE_EVENT, COMBAT_HP_CHANGE_EVENT, COMBAT_STARTED_EVENT, COMBAT_STOPPED_EVENT, COMBAT_USER_DIED_EVENT, LEDGER_UPDATE_BALANCE_EVENT, USER_UPDATE_EVENT } from "../../../socket/events";
import { DEVELOPMENT_FUNDS_KEY, DITTO_DECIMALS, REFERRAL_BOOST, REFERRAL_COMBAT_CUT } from "../../../utils/config";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { randomBytes } from "crypto";
import { emitUserAndCombatUpdate, sleep } from "../../../utils/helpers";
import { DungeonManager } from "./dungeon-manager";
import { getReferrer, logReferralEarning } from "../../../sql-services/referrals";
import { emitMissionUpdate, updateCombatMission } from "../../../sql-services/missions";
import { FullMonster } from "../../../sql-services/combat-service";
import { getUserLevelMemory, incrementUserGold } from "../../../operations/user-operations";
import { incrementExpAndHpExpAndCheckLevelUpMemory, setLastBattleTimestamp, setUserCombatHp } from "../../../operations/combat-operations";
import { logCombatActivity } from "../../../operations/user-activity-log-operations";
import { CombatDropInput } from "../../../sql-services/user-activity-log";
import { canUserMintItem, mintItemToUser } from "../../../operations/item-inventory-operations";
import { canUserMintEquipment, mintEquipmentToUser } from "../../../operations/equipment-inventory-operations";
import { requireUserMemoryManager } from "../../global-managers/global-managers";
import { incrementTotalCombatDittoByTelegramId } from "../../../redis/intract";
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis'

export class Battle {
  combatAreaType: 'Domain' | 'Dungeon';
  combatAreaId: number;

  minCombatLevel: number | null;
  maxCombatLevel: number | null;

  socketManager: SocketManager;
  dittoLedgerSocket: DittoLedgerSocket;

  user: User;
  userCombat: Combat;
  monster: FullMonster;
  currentBattleStartTimestamp: number | null = null;

  onBattleEnd?: (() => Promise<void>);
  onNextBattle?: () => Promise<void>;

  battleEnded: boolean = false;
  battleStopRequested: boolean = false;

  // Tick system properties
  private tickMs: number = 100; // 100ms tick rate (10 FPS)
  private mainTickInterval: NodeJS.Timeout | null = null;

  // Cooldown timers (in milliseconds)
  private userNextAttack: number = 0;
  private monsterNextAttack: number = 0;
  private userNextRegen: number = 0;
  private monsterNextRegen: number = 0;

  // Cooldown intervals (calculated once at battle start)
  private userAttackCooldown: number = 0;
  private monsterAttackCooldown: number = 0;
  private userRegenInterval: number = 0;
  private monsterRegenInterval: number = 0;

  // intract
  private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

  constructor(
    combatAreaType: 'Domain' | 'Dungeon',
    combatAreaId: number,
    minCombatLevel: number | null,
    maxCombatLevel: number | null,
    socketManager: SocketManager,
    dittoLedgerSocket: DittoLedgerSocket,
    user: User,
    userCombat: Combat,
    monster: FullMonster,

    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,

    onBattleEnd?: () => Promise<void>,
    onNextBattle?: () => Promise<void>,
  ) {
    this.combatAreaType = combatAreaType;
    this.combatAreaId = combatAreaId;
    this.minCombatLevel = minCombatLevel;
    this.maxCombatLevel = maxCombatLevel;
    this.socketManager = socketManager;
    this.dittoLedgerSocket = dittoLedgerSocket;
    this.user = user;
    this.userCombat = userCombat;
    this.monster = monster;

    this.redisClient = redisClient;

    this.onBattleEnd = onBattleEnd;
    this.onNextBattle = onNextBattle;
  }

  async startBattle() {
    try {
      logger.info(`🚀 Entered startBattle for ${this.user.telegramId}`);

      const userLevel = await getUserLevelMemory(this.user.telegramId);

      if (this.battleEnded || this.battleStopRequested) {
        logger.warn(`❌ Tried to start battle for ${this.user.telegramId} but it was already ended.`);
        return;
      }

      this.socketManager.emitEvent(this.user.telegramId, COMBAT_STARTED_EVENT, {
        userId: this.user.telegramId,
        payload: {
          monster: this.monster,
          combatAreaType: this.combatAreaType,
          combatAreaId: this.combatAreaId
        }
      });

      logger.info(`⚔️ Battle Start: User ${this.user.telegramId} vs ${this.monster.name}`);

      this.currentBattleStartTimestamp = Date.now();

      // Calculate cooldowns in milliseconds
      this.userAttackCooldown = getAtkCooldownFromAtkSpd(this.userCombat.atkSpd) * 1000;
      this.monsterAttackCooldown = getAtkCooldownFromAtkSpd(this.monster.combat.atkSpd) * 1000;
      this.userRegenInterval = this.userCombat.hpRegenRate * 1000;
      this.monsterRegenInterval = this.monster.combat.hpRegenRate * 1000;

      // Initialize next action timers
      this.userNextAttack = this.userAttackCooldown;
      this.monsterNextAttack = this.monsterAttackCooldown;
      this.userNextRegen = this.userRegenInterval;
      this.monsterNextRegen = this.monsterRegenInterval;

      logger.info(`⏱️ Cooldowns calculated — userAtk: ${this.userAttackCooldown}ms, monsterAtk: ${this.monsterAttackCooldown}ms, userRegen: ${this.userRegenInterval}ms, monsterRegen: ${this.monsterRegenInterval}ms`);

      if (this.battleEnded || this.battleStopRequested) {
        logger.warn(`❌ Battle already ended after delay setup for ${this.user.telegramId}. Aborting start.`);
        return;
      }

      logger.info(`✅ Starting tick-based battle loop for ${this.user.telegramId}`);
      this.startTickLoop();

    } catch (err) {
      logger.error(`Error in Battle.startBattle: ${err}`);

      await this.endBattle(true);

      // Disable next battle to avoid race
      this.onNextBattle = async () => {
        logger.info(`🚫 onNextBattle skipped: user does not meet battle level requirements for ${this.user.telegramId}`);
      };

      // Call cleanup hook
      if (this.onBattleEnd) {
        logger.info(`calling this.onBattleEnd in catch block.`)
        await this.onBattleEnd();
      } else {
        logger.error(`this.onBattleEnd is not defined`);
      }
    }
  }

  private startTickLoop() {
    this.mainTickInterval = setInterval(async () => {
      try {
        await this.processTick();
      } catch (err) {
        logger.error(`Error in tick processing for user ${this.user.telegramId}: ${err}`);
        await this.endBattle(true);

        // Disable next battle to avoid race
        this.onNextBattle = async () => {
          logger.info(`🚫 onNextBattle skipped: error in tick processing for ${this.user.telegramId}`);
        };

        if (this.onBattleEnd) await this.onBattleEnd();
      }
    }, this.tickMs);
  }

  private async processTick() {
    if (this.battleEnded || this.battleStopRequested) {
      return;
    }

    // Process user attack
    if (this.userCombat.hp > 0 && this.userNextAttack <= 0) {
      await this.attack("user");
      this.userNextAttack = this.userAttackCooldown;
    }

    // Process monster attack
    if (this.monster.combat.hp > 0 && this.monsterNextAttack <= 0) {
      await this.attack("monster");
      this.monsterNextAttack = this.monsterAttackCooldown;
    }

    // Process user regeneration
    if (this.userCombat.hp > 0 && this.userNextRegen <= 0) {
      await this.applyRegen(this.userCombat, 'user');
      this.userNextRegen = this.userRegenInterval;
    }

    // Process monster regeneration
    if (this.monster.combat.hp > 0 && this.monsterNextRegen <= 0) {
      await this.applyRegen(this.monster.combat, 'monster');
      this.monsterNextRegen = this.monsterRegenInterval;
    }

    // Reduce all timers
    this.userNextAttack -= this.tickMs;
    this.monsterNextAttack -= this.tickMs;
    this.userNextRegen -= this.tickMs;
    this.monsterNextRegen -= this.tickMs;
  }

  async endBattle(emitStopEvent: boolean = false) {
    logger.info(`Calling endBattle for user ${this.user.telegramId}. battleEnded = ${this.battleEnded}`);

    if (this.battleEnded || this.battleStopRequested) return;
    this.battleStopRequested = true;

    // Clear the tick interval
    if (this.mainTickInterval) {
      clearInterval(this.mainTickInterval);
      this.mainTickInterval = null;
    }

    await sleep(800);

    this.socketManager.emitEvent(this.user.telegramId, COMBAT_STARTED_EVENT, {
      userId: this.user.telegramId,
      payload: { monster: null }
    });

    this.battleEnded = true;
    this.currentBattleStartTimestamp = null;

    logger.info(`Ended battle for user ${this.user.telegramId}`);

    const userMemoryManager = requireUserMemoryManager();
    const userStillInMemory = userMemoryManager.isReady() && userMemoryManager.hasUser(this.user.telegramId);

    if (userStillInMemory) {
      // User is still in memory - safe to update combat state
      try {
        await setUserCombatHp(this.user.telegramId, this.userCombat.hp);
        logger.info(`Set user HP to ${this.userCombat.hp} / ${this.userCombat.maxHp}`);
      } catch (err) {
        logger.error(`Failed to set user HP: ${err}`);
      }

      try {
        const now = new Date();
        this.user.lastBattleEndTimestamp = now;
        await setLastBattleTimestamp(this.user.telegramId, now);
        logger.info(`Set user setLastBattleEndTimestamp to ${now.toLocaleString()}`);
      } catch (err) {
        logger.error(`Failed to set last battle end timestamp: ${err}`);
      }
    } else {
      // User no longer in memory (likely during logout) - skip combat updates
      logger.debug(`⚠️ User ${this.user.telegramId} no longer in memory - skipping combat state updates (likely during logout)`);
    }

    if (emitStopEvent) {
      this.socketManager.emitEvent(this.user.telegramId, COMBAT_STOPPED_EVENT, {
        userId: this.user.telegramId
      });
    }
  }

  async refreshUserHp(restTimeS: number) {
    try {
      if (this.userCombat.hp === this.userCombat.maxHp) return;

      const regenIntervalS = this.userCombat.hpRegenRate;
      const hpPerTick = Math.floor(this.userCombat.hpRegenAmount);

      const ratio = restTimeS / regenIntervalS;
      const totalRecovered = Math.floor(ratio * hpPerTick);

      if (totalRecovered <= 0) return;

      const prevHp = this.userCombat.hp;
      this.userCombat.hp = Math.min(this.userCombat.maxHp, this.userCombat.hp + totalRecovered);

      this.socketManager.emitEvent(this.user.telegramId, COMBAT_HP_CHANGE_EVENT, {
        userId: this.user.telegramId,
        payload: {
          target: 'user',
          hp: this.userCombat.hp,
          maxHp: this.userCombat.maxHp,
          dmg: this.userCombat.hp - prevHp
        }
      });

      logger.info(
        `🛏️ User ${this.user.telegramId} rested for ${restTimeS}s — recovered ${totalRecovered} HP. Current HP: ${this.userCombat.hp} / ${this.userCombat.maxHp}`
      );
    } catch (err) {
      logger.error(`Error in Battle.refreshUserHp: ${err}`);

      await this.endBattle(true);

      // Disable next battle to avoid race
      this.onNextBattle = async () => {
        logger.info(`🚫 onNextBattle skipped: user does not meet battle level requirements for ${this.user.telegramId}`);
      };

      if (this.onBattleEnd) await this.onBattleEnd();
    }
  }

  updateUserCombat(userCombat: Combat, updatedHp?: number) {
    const currHp = (updatedHp) ? updatedHp : this.userCombat.hp;
    this.userCombat = {
      ...userCombat,
      hp: currHp
    };

    // Recalculate user combat-related cooldowns when combat stats change
    this.userAttackCooldown = getAtkCooldownFromAtkSpd(this.userCombat.atkSpd) * 1000;
    this.userRegenInterval = this.userCombat.hpRegenRate * 1000;
  }

  /**
   * Handles attack logic between combatants.
   */
  async attack(attackerType: "user" | "monster") {
    if (this.battleEnded || this.battleStopRequested) return;

    const attacker = (attackerType === 'user') ? this.userCombat : this.monster.combat;
    const defender = (attackerType === 'user') ? this.monster.combat : this.userCombat;

    const damage = Battle.calculateDamage(attacker, defender);
    if (attackerType == 'user') {
      DungeonManager.updateDamage(this.user.telegramId, Math.min(damage.dmg, defender.hp), 0);
    } else {
      DungeonManager.updateDamage(this.user.telegramId, 0, Math.min(damage.dmg, defender.hp));
    }

    defender.hp = Math.max(0, defender.hp - damage.dmg); // Ensure HP does not drop below 0

    // emit damage event
    this.socketManager.emitEvent(this.user.telegramId, COMBAT_HP_CHANGE_EVENT, {
      userId: this.user.telegramId,
      payload: {
        target: (attackerType === 'user') ? 'monster' : 'user',
        hp: defender.hp,
        maxHp: defender.maxHp,
        dmg: damage.dmg * -1,
        crit: damage.crit
      }
    });

    if (damage.dmg === 0) {
      logger.info(`🔵 ${attackerType === "user" ? `User ${this.user.telegramId}` : this.monster.name} dealt ${damage.dmg} damage`);
    } else {
      logger.info(`🔴 ${attackerType === "user" ? `User ${this.user.telegramId}` : this.monster.name} dealt ${damage.dmg} damage`);
    }

    logger.info(`❤️  ${attackerType === "monster" ? `User ${this.user.telegramId}` : this.monster.name} HP: ${defender.hp} / ${defender.maxHp}`);

    if (defender.hp <= 0) {
      if (attackerType === 'user') {
        logger.info(`⚔️  User ${this.user.telegramId} has defeated ${this.monster.name}`);

        await this.handleExpGain();
        const goldDrop = await this.handleGoldDrop();
        const dittoDrop = await this.handleDittoDrop();
        const drops = await this.handleItemAndEquipmentDrop();

        if (this.monster && drops) {
          await logCombatActivity({
            userId: this.user.telegramId,
            monsterId: this.monster.id,
            quantity: 1,
            expGained: this.monster.exp,
            goldEarned: (goldDrop && goldDrop > 0) ? goldDrop : undefined,
            dittoEarned: (dittoDrop && dittoDrop > 0n) ? dittoDrop.toString() : undefined,
            drops: drops,
          });

          await updateCombatMission(this.user.telegramId, this.monster.id, 1);

          await emitMissionUpdate(this.socketManager.getSocketByUserId(this.user.telegramId), this.user.telegramId);
        }

        await this.endBattle(false);

        // Call cleanup hook
        if (this.onNextBattle) {
          await this.onNextBattle()
        };
      } else {
        logger.info(`⚰️  User ${this.user.telegramId} has been defeated by ${this.monster.name}`);

        // handle dead
        this.userCombat.hp = this.userCombat.maxHp;

        // emit dead
        logger.info(`Emitting COMBAT_USER_DIED_EVENT event.`)
        this.socketManager.emitEvent(this.user.telegramId, COMBAT_USER_DIED_EVENT, {
          userId: this.user.telegramId,
        });

        await this.endBattle(true);

        // Disable next battle to avoid race
        this.onNextBattle = async () => {
          logger.info(`🚫 onNextBattle skipped: user died for ${this.user.telegramId}`);
        };

        // Call cleanup hook
        if (this.onBattleEnd) await this.onBattleEnd();
      }
    }
  }

  /**
   * Applies health regeneration.
   */
  async applyRegen(combatant: Combat, attackerType: "user" | "monster") {
    if (this.battleEnded || this.battleStopRequested) return;

    if (combatant.hp > 0) {
      const healAmount = Math.floor(combatant.hpRegenAmount);
      combatant.hp = Math.min(combatant.maxHp, combatant.hp + healAmount);

      try {
        this.socketManager.emitEvent(this.user.telegramId, COMBAT_HP_CHANGE_EVENT, {
          userId: this.user.telegramId,
          payload: {
            target: attackerType,
            hp: combatant.hp,
            maxHp: combatant.maxHp,
            dmg: healAmount
          }
        });
      } catch (err) {
        logger.error(`Error emitting regen event for ${attackerType}: ${err}`);
      }

      logger.info(`🟢 ${attackerType === "user" ? `User ${this.user.telegramId}` : this.monster.name} regenerated HP: +${healAmount}, HP: ${combatant.hp} / ${combatant.maxHp}`);
    }
  }

  /**
   * Calculates damage.
   */
  static calculateDamage(attacker: Combat, defender: Combat): { dmg: number, crit: boolean } {
    const { attackType } = attacker;
    //logger.info(`[DMG CALC] Attack Type: ${attackType}`);

    // Hit chance
    const hitChance = 0.5 + (attacker.acc - defender.eva) / (2 * (attacker.acc + defender.eva));
    const clampedHitChance = Math.max(0.2, Math.min(0.95, hitChance));
    const didHit = Math.random() <= clampedHitChance;
    //logger.info(`[DMG CALC] Hit Chance: ${hitChance.toFixed(4)}, Did Hit: ${didHit}`);
    if (!didHit) return { dmg: 0, crit: false };

    // Determine base damage range based on attack type
    let baseDamage = 0;
    let maxDmg = 0;
    switch (attackType) {
      case "Melee":
        maxDmg = attacker.maxMeleeDmg;
        baseDamage = this.getRandomDamage(maxDmg);
        break;
      case "Ranged":
        maxDmg = attacker.maxRangedDmg;
        baseDamage = this.getRandomDamage(maxDmg);
        break;
      case "Magic":
        maxDmg = attacker.maxMagicDmg;
        baseDamage = this.getRandomDamage(maxDmg);
        break;
    }
    //logger.info(`[DMG CALC] Base Damage (pre-crit): ${baseDamage.toFixed(2)} / Max Possible: ${maxDmg}`);

    // Crit?
    const isCrit = Math.random() <= attacker.critChance;
    if (isCrit) {
      baseDamage *= attacker.critMultiplier;
      //logger.info(`[DMG CALC] CRITICAL HIT! New Damage: ${baseDamage.toFixed(2)}`);
    }

    // Combat triangle
    const triangleScaling = this.getCombatTriangleMultiplier(attackType, defender);
    baseDamage *= triangleScaling;
    //logger.info(`[DMG CALC] Combat Triangle Multiplier: ${triangleScaling.toFixed(4)}, After Triangle: ${baseDamage.toFixed(2)}`);

    // Elemental buff
    const elementalBuff = this.getElementalMultiplier(attacker, defender);
    baseDamage *= elementalBuff;
    //logger.info(`[DMG CALC] Elemental Multiplier: ${elementalBuff.toFixed(4)}, After Elemental: ${baseDamage.toFixed(2)}`);

    // Damage reduction
    const reduction = attackType === "Magic" ? defender.magicDmgReduction : defender.dmgReduction;
    const percentageDmgReduct = getPercentageDmgReduct(reduction);
    baseDamage *= percentageDmgReduct;
    //logger.info(`[DMG CALC] Damage Reduction Applied (${((1 - percentageDmgReduct) * 100).toFixed(2)}%), Final Damage: ${baseDamage.toFixed(2)}`);

    return {
      dmg: Math.max(0, Math.floor(baseDamage)),
      crit: isCrit
    };
  }

  static getRandomDamage(max: number): number {
    const min = 0.4 * max;

    // Average of 2 random numbers for a triangular distribution
    const t = (Math.random() + Math.random()) / 2;

    return min + t * (max - min);
  }

  static getCombatTriangleMultiplier(attackType: AttackType, defender: Combat): number {
    const { meleeFactor, rangeFactor, magicFactor } = defender;

    let weakestFactor = 0;
    let strongestFactor = 0;

    switch (attackType) {
      case "Melee":
        weakestFactor = rangeFactor;
        strongestFactor = magicFactor;
        break;
      case "Ranged":
        weakestFactor = magicFactor;
        strongestFactor = meleeFactor;
        break;
      case "Magic":
        weakestFactor = meleeFactor;
        strongestFactor = rangeFactor;
        break;
      default:
        return 1; // fallback
    }

    const multiplier = 1 + 0.5 * ((weakestFactor - strongestFactor) / ((meleeFactor + rangeFactor + magicFactor) + 1));

    return this.clamp(multiplier, 0.7, 1.3);
  }

  static getElementalMultiplier(attacker: Combat, defender: Combat): number {

    function capitalize(s: string): string {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    const a = attacker;
    const d = defender;

    // Elemental advantage map: who beats who
    // water > fire > air > earth > water
    const advantage = {
      water: 'fire',
      fire: 'air',
      air: 'earth',
      earth: 'water',
    };

    const elements = ['water', 'fire', 'air', 'earth'] as const;

    let netAdvantage = 0;

    for (const elem of elements) {
      const beats = advantage[elem]; // the one this element beats

      const attackerValue = a[`reinforce${capitalize(elem)}` as keyof Combat] as number;
      const attackerBeats = a[`reinforce${capitalize(beats)}` as keyof Combat] as number;

      const defenderValue = d[`reinforce${capitalize(elem)}` as keyof Combat] as number;
      const defenderBeats = d[`reinforce${capitalize(beats)}` as keyof Combat] as number;

      const advantageScore = (attackerBeats - defenderValue);
      const disadvantageScore = (defenderBeats - attackerValue);

      netAdvantage += advantageScore - disadvantageScore;
    }

    let multiplier = 1 + 0.05 * netAdvantage;
    multiplier = this.clamp(multiplier, 0.75, 1.25);

    return multiplier;
  }

  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  async handleExpGain() {
    try {
      if (this.battleEnded || this.battleStopRequested) return;

      const expRes = await incrementExpAndHpExpAndCheckLevelUpMemory(this.user.telegramId, this.monster.exp);

      this.socketManager.emitEvent(this.user.telegramId, COMBAT_EXP_UPDATE_EVENT, {
        userId: this.user.telegramId,
        payload: expRes
      });

      if (expRes.simpleUser) {
        const userSocket = this.socketManager.getSocketByUserId(this.user.telegramId);
        if (userSocket) emitUserAndCombatUpdate(userSocket, this.user.telegramId, expRes.simpleUser);
        if (!expRes.simpleUser.combat) {
          logger.error(`No combat found in exp res for user HP LVL up. Unable to update user combat in battle`);
          return;
        }
        this.updateUserCombat(expRes.simpleUser.combat);
      }
    } catch (err) {
      logger.error(`Failed to handle user exp increment in battle.`)
    }
  }

  async handleGoldDrop(): Promise<number | undefined> {
    try {
      if (this.battleEnded || this.battleStopRequested) return;

      const goldDrop = Battle.getAmountDrop(BigInt(this.monster.minGoldDrop), BigInt(this.monster.maxGoldDrop));
      if (goldDrop > 0n) {
        const goldBalance = await incrementUserGold(this.user.telegramId, Number(goldDrop));
        this.socketManager.emitEvent(this.user.telegramId, USER_UPDATE_EVENT, {
          userId: this.user.telegramId,
          payload: {
            goldBalance
          }
        });
      }

      return Number(goldDrop);
    } catch (err) {
      logger.error(`Failed to handle gold drop in battle.`)
    }
  }

  async handleDittoDrop(): Promise<bigint | undefined> {
    try {
      if (this.battleEnded || this.battleStopRequested) return;

      const referrer = await getReferrer(this.user.telegramId);

      let dittoDrop = Battle.getAmountDrop(
        BigInt(this.monster.minDittoDrop.toString()),
        BigInt(this.monster.maxDittoDrop.toString())
      );

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
            userId: this.user.telegramId,
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
              notes: `Referral earnings from user ${this.user.telegramId}`,
            }
          );

          await logReferralEarning({
            referrerId: referrer.referrerUserId,
            refereeId: this.user.telegramId,
            amountDittoWei: referrerCutRounded.toString(),
            tier: 1,
          });
        }

        this.dittoLedgerSocket.emit(LEDGER_UPDATE_BALANCE_EVENT, {
          sender: DEVELOPMENT_FUNDS_KEY,
          updates,
        });

        // intract
        await incrementTotalCombatDittoByTelegramId(this.redisClient, this.user.telegramId, dittoDrop);

        return dittoDropUserRounded;
      }
    } catch (err) {
      logger.error(`Failed to handle ditto drop in battle.`);
    }
  }

  async handleItemAndEquipmentDrop(): Promise<CombatDropInput[] | undefined> {
    if (this.battleEnded || this.battleStopRequested) return;

    const res = [];

    try {
      for (const drop of this.monster.drops) {
        const roll = Math.random(); // 0.0 to 1.0

        if (roll <= drop.dropRate) {
          try {
            if (drop.itemId) {
              if (await canUserMintItem(this.user.telegramId, drop.itemId)) {
                const updateItemInv = await mintItemToUser(this.user.telegramId, drop.itemId, drop.quantity);
                res.push(updateItemInv);
              }
            } else if (drop.equipmentId) {
              if (await canUserMintEquipment(this.user.telegramId, drop.equipmentId)) {
                const updatedEquipmentInv = await mintEquipmentToUser(this.user.telegramId, drop.equipmentId, drop.quantity);
                res.push(updatedEquipmentInv);
              }
            } else {
              throw new Error(`Drop has neither itemId nor equipmentId`);
            }
          } catch (dropErr) {
            logger.error(`Error minting drop for user ${this.user.telegramId}: ${dropErr}`);
          }
        }
      }

      this.socketManager.emitEvent(this.user.telegramId, "update-inventory", {
        userId: this.user.telegramId,
        payload: res,
      });

      return res.map(entry => ({
        itemId: entry.itemId ?? undefined,
        equipmentId: entry.equipmentId ?? undefined,
        quantity: entry.quantity,
      }));

    } catch (err) {
      logger.error(`Failed to handle item/equipment drops for user ${this.user.telegramId}: ${err}`);
    }
  }

  /**
   * Returns a randomized drop amount based on min and max range.
   * Ensures it's always between the given range.
   */
  static getAmountDrop(min: bigint, max: bigint): bigint {
    if (min > max) {
      logger.warn(`[AmountDrop] min > max. Returning min.`);
      return min;
    }

    const range = max - min + 1n;
    const bitLength = range.toString(2).length;
    const byteLength = Math.ceil(bitLength / 8);

    let randomBigInt: bigint;

    do {
      const bytes = randomBytes(byteLength);
      randomBigInt = BigInt('0x' + bytes.toString('hex'));
    } while (randomBigInt >= (1n << BigInt(bitLength)) - ((1n << BigInt(bitLength)) % range));

    return (min + (randomBigInt % range));
  }

  static roundWeiTo1DecimalPlace(wei: bigint): bigint {
    const fullUnit = BigInt(10) ** BigInt(DITTO_DECIMALS);        // 1 DITTO in wei
    const tenthUnit = fullUnit / BigInt(10);                      // 0.1 DITTO in wei
    const tenths = wei / tenthUnit;                               // how many 0.1 DITTOs
    return tenths * tenthUnit;                                    // round down to nearest 0.1 DITTO (in wei)
  }

  static roundWeiTo2DecimalPlaces(wei: bigint): bigint {
    const fullUnit = BigInt(10) ** BigInt(DITTO_DECIMALS);        // 1 DITTO in wei
    const hundredthUnit = fullUnit / BigInt(100);                 // 0.01 DITTO in wei
    const hundredths = wei / hundredthUnit;                       // how many 0.01 DITTOs
    return hundredths * hundredthUnit;                            // round down to nearest 0.01 DITTO (in wei)
  }

  static roundWeiTo5DecimalPlaces(wei: bigint): bigint {
    const fullUnit = BigInt(10) ** BigInt(DITTO_DECIMALS);          // 1 DITTO in wei
    const unitAt5dp = fullUnit / BigInt(100000);                    // 0.00001 DITTO in wei
    const units = wei / unitAt5dp;                                  // how many 0.00001 DITTOs
    return units * unitAt5dp;                                       // round down to nearest 0.00001 DITTO (in wei)
  }

  static scaleBN(input: bigint, multiplier: number): bigint {
    if (multiplier <= 0) throw new Error("Multiplier musst be greater than 0");

    const SCALE = 1_000_000; // 6 decimal precision
    const scaledMultiplier = Math.round(multiplier * SCALE);

    return (input * BigInt(scaledMultiplier)) / BigInt(SCALE);
  }
}