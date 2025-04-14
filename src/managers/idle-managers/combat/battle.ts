import { User, Combat, AttackType } from "@prisma/client";
import { getAtkCooldownFromAtkSpd, getBaseHpRegenRateFromHpLvl, getPercentageDmgReduct } from "./combat-helpers";
import { logger } from "../../../utils/logger";
import { SocketManager } from "../../../socket/socket-manager";
import { FullMonster, setLastBattleEndTimestamp, setUserCombatHpByTelegramId } from "../../../sql-services/combat-service";
import { COMBAT_EXP_UPDATE_EVENT, COMBAT_HP_CHANGE_EVENT, COMBAT_STARTED_EVENT, COMBAT_USER_DIED_EVENT, LEDGER_UPDATE_BALANCE_EVENT, USER_UPDATE_EVENT } from "../../../socket/events";
import { DEVELOPMENT_FUNDS_KEY, DITTO_DECIMALS } from "../../../utils/config";
import { incrementExpAndHpExpAndCheckLevelUp, incrementUserGoldBalance } from "../../../sql-services/user-service";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { randomBytes } from "crypto";
import { mintItemToUser } from "../../../sql-services/item-inventory-service";
import { mintEquipmentToUser } from "../../../sql-services/equipment-inventory-service";
import { emitUserAndCombatUpdate, sleep } from "../../../utils/helpers";

export class Battle {
  combatAreaType: 'Domain' | 'Dungeon';
  combatAreaId: number;

  socketManager: SocketManager;
  dittoLedgerSocket: DittoLedgerSocket;

  user: User;
  userCombat: Combat;
  monster: FullMonster;
  currentBattleStartTimestamp: number | null = null;

  onBattleEnd?: (() => Promise<void>);
  onNextBattle?: () => Promise<void>;

  battleEnded: boolean = false;
  tickFlags = {
    userAttack: false,
    monsterAttack: false,
    userRegen: false,
    monsterRegen: false
  };

  constructor(
    combatAreaType: 'Domain' | 'Dungeon',
    combatAreaId: number,
    socketManager: SocketManager,
    dittoLedgerSocket: DittoLedgerSocket,
    user: User,
    userCombat: Combat,
    monster: FullMonster,
    onBattleEnd?: () => Promise<void>,
    onNextBattle?: () => Promise<void>
  ) {
    this.combatAreaType = combatAreaType;
    this.combatAreaId = combatAreaId;
    this.socketManager = socketManager;
    this.dittoLedgerSocket = dittoLedgerSocket;
    this.user = user;
    this.userCombat = userCombat;
    this.monster = monster;

    this.onBattleEnd = onBattleEnd;
    this.onNextBattle = onNextBattle;
  }

  async startBattle() {
    logger.info(`🚀 Entered startBattle for ${this.user.telegramId}`);

    if (this.battleEnded) {
      logger.warn(`❌ Tried to start battle for ${this.user.telegramId} but it was already ended.`);
      return;
    }

    this.tickFlags = {
      userAttack: true,
      monsterAttack: true,
      userRegen: true,
      monsterRegen: true
    };
    logger.info(`✅ Reset tickFlags to true for ${this.user.telegramId}`);

    this.socketManager.emitEvent(this.user.telegramId, COMBAT_STARTED_EVENT, {
      userId: this.user.telegramId,
      payload: {
        monster: this.monster,
        combatAreaType: this.combatAreaType,
        combatAreaId: this.combatAreaId
      }
    });

    logger.info(`⚔️ Battle Start: User ${this.user.telegramId} vs ${this.monster.name}`);
    logger.info(`👤 user combat: ${JSON.stringify(this.userCombat, null, 2)}`);
    logger.info(`👾 monster combat: ${JSON.stringify(this.monster.combat, null, 2)}`);

    this.currentBattleStartTimestamp = Date.now();

    const atkDelayUser = getAtkCooldownFromAtkSpd(this.userCombat.atkSpd) * 1000;
    const atkDelayMonster = getAtkCooldownFromAtkSpd(this.monster.combat.atkSpd) * 1000;
    const regenDelayUser = this.userCombat.hpRegenRate * 1000;
    const regenDelayMonster = this.monster.combat.hpRegenRate * 1000;

    logger.info(`⏱️ Delays calculated — atkUser: ${atkDelayUser}ms, atkMonster: ${atkDelayMonster}ms, regenUser: ${regenDelayUser}ms, regenMonster: ${regenDelayMonster}ms`);

    if (this.battleEnded) {
      logger.warn(`❌ Battle already ended after delay setup for ${this.user.telegramId}. Aborting start.`);
      return;
    }

    logger.info(`✅ Starting battle loops for ${this.user.telegramId}`);
    this.tickUserAttackLoop(atkDelayUser);
    this.tickMonsterAttackLoop(atkDelayMonster);
    this.tickUserRegenLoop(regenDelayUser);
    this.tickMonsterRegenLoop(regenDelayMonster);
  }

  private async tickUserAttackLoop(delay: number) {
    while (!this.battleEnded && this.tickFlags.userAttack && this.userCombat.hp > 0) {
      await sleep(delay);
      if (this.battleEnded) break;
      try {
        await this.attack("user");
      } catch (err) {
        logger.error("Error in user attack loop: " + err);
      }
    }
  }

  private async tickMonsterAttackLoop(delay: number) {
    while (!this.battleEnded && this.tickFlags.monsterAttack && this.monster.combat.hp > 0) {
      await sleep(delay);
      if (this.battleEnded) break;
      try {
        await this.attack("monster");
      } catch (err) {
        logger.error("Error in monster attack loop: " + err);
      }
    }
  }

  private async tickUserRegenLoop(delay: number) {
    while (!this.battleEnded && this.tickFlags.userRegen) {
      await sleep(delay);
      if (this.battleEnded) break;
      try {
        await this.applyRegen(this.userCombat, 'user');
      } catch (err) {
        logger.error("Error in user regen loop: " + err);
      }
    }
  }

  private async tickMonsterRegenLoop(delay: number) {
    while (!this.battleEnded && this.tickFlags.monsterRegen) {
      await sleep(delay);
      if (this.battleEnded) break;
      try {
        await this.applyRegen(this.monster.combat, 'monster');
      } catch (err) {
        logger.error("Error in monster regen loop: " + err);
      }
    }
  }

  async endBattle() {
    logger.info(`Calling endBattle for user ${this.user.telegramId}. battleEnded = ${this.battleEnded}`);

    if (this.battleEnded) return;

    await sleep(800);

    this.socketManager.emitEvent(this.user.telegramId, COMBAT_STARTED_EVENT, {
      userId: this.user.telegramId,
      payload: { monster: null }
    });

    this.battleEnded = true;
    this.currentBattleStartTimestamp = null;
    this.tickFlags = { userAttack: false, monsterAttack: false, userRegen: false, monsterRegen: false };

    logger.info(`Ended battle for user ${this.user.telegramId}`);

    try {
      await setUserCombatHpByTelegramId(this.user.telegramId, this.userCombat.hp);
      logger.info(`Set user HP to ${this.userCombat.hp} / ${this.userCombat.maxHp}`);
    } catch (err) {
      logger.error(`Failed to set user HP: ${err}`);
    }

    try {
      const now = new Date();
      this.user.lastBattleEndTimestamp = now;
      await setLastBattleEndTimestamp(this.user.telegramId, now);
      logger.info(`Set user setLastBattleEndTimestamp to ${now.toLocaleString()}`);
    } catch (err) {
      logger.error(`Failed to set last battle end timestamp: ${err}`);
    }
  }

  refreshUserHp(restTimeS: number) {
    // Only allow if no regen loop is active
    if (!this.battleEnded && this.tickFlags.userRegen) {
      logger.info(`⛔ Skipping refreshUserHp — regen loop active for ${this.user.telegramId}`);
      return;
    }

    if (this.userCombat.hp === this.userCombat.maxHp) return;

    const regenIntervalS = getBaseHpRegenRateFromHpLvl(this.user.hpLevel);
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
  }

  updateUserCombat(userCombat: Combat, updatedHp?: number) {
    const currHp = (updatedHp) ? updatedHp : this.userCombat.hp;
    this.userCombat = {
      ...userCombat,
      hp: currHp
    };
  }

  /**
   * Handles attack logic between combatants.
   */
  async attack(attackerType: "user" | "monster") {
    if (this.battleEnded) return;

    const attacker = (attackerType === 'user') ? this.userCombat : this.monster.combat;
    const defender = (attackerType === 'user') ? this.monster.combat : this.userCombat;

    const damage = Battle.calculateDamage(attacker, defender);
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
        await this.handleGoldDrop();
        this.handleDittoDrop();
        await this.handleItemAndEquipmentDrop();

        await this.endBattle();

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

        await this.endBattle();

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
    if (this.battleEnded) return;

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
      if (this.battleEnded) return;

      const expRes = await incrementExpAndHpExpAndCheckLevelUp(this.user.telegramId, this.monster.exp);

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

  async handleGoldDrop() {
    try {
      if (this.battleEnded) return;

      const goldDrop = Battle.getAmountDrop(BigInt(this.monster.minGoldDrop), BigInt(this.monster.maxGoldDrop));
      if (goldDrop > 0n) {
        const goldBalance = await incrementUserGoldBalance(this.user.telegramId, Number(goldDrop));
        this.socketManager.emitEvent(this.user.telegramId, USER_UPDATE_EVENT, {
          userId: this.user.telegramId,
          payload: {
            goldBalance
          }
        });
      }
    } catch (err) {
      logger.error(`Failed to handle gold drop in battle.`)
    }
  }

  handleDittoDrop() {
    try {
      if (this.battleEnded) return;

      const dittoDrop = Battle.roundWeiTo1DecimalPlace(Battle.getAmountDrop(BigInt(this.monster.minDittoDrop.toString()), BigInt(this.monster.maxDittoDrop.toString())));
      if (dittoDrop > 0n) {
        this.dittoLedgerSocket.emit(LEDGER_UPDATE_BALANCE_EVENT, {
          sender: DEVELOPMENT_FUNDS_KEY,
          updates: [
            {
              userId: DEVELOPMENT_FUNDS_KEY,
              liveBalanceChange: (-dittoDrop).toString(),
              accumulatedBalanceChange: "0",
              notes: "Deducted for monster DITTO drop",
            },
            {
              userId: this.user.telegramId,
              liveBalanceChange: (dittoDrop).toString(),
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

  async handleItemAndEquipmentDrop() {
    if (this.battleEnded) return;

    const res = [];

    try {
      for (const drop of this.monster.drops) {
        const roll = Math.random(); // 0.0 to 1.0

        if (roll <= drop.dropRate) {
          try {
            if (drop.itemId) {
              const updateItemInv = await mintItemToUser(this.user.telegramId, drop.itemId, drop.quantity);
              res.push(updateItemInv);
            } else if (drop.equipmentId) {
              const updatedEquipmentInv = await mintEquipmentToUser(this.user.telegramId, drop.equipmentId, drop.quantity);
              res.push(updatedEquipmentInv);
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
}