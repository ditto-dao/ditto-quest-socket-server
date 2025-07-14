import { logger } from "../utils/logger";
import { requireUserEfficiencyStatsMemoryManager, requireUserMemoryManager } from "../managers/global-managers/global-managers";
import { Combat, StatEffect, User, UserEfficiencyStats } from "@prisma/client";
import { calculateCombatPower, getBaseAccFromLuk, getBaseAtkSpdFromLuk, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseDmgReductionFromDefAndStr, getBaseEvaFromDex, getBaseHpRegenAmtFromHpLvlAndDef, getBaseHpRegenRateFromHpLvlAndDef, getBaseMagicDmgReductionFromDefAndMagic, getBaseMaxDmg, getBaseMaxHpFromHpLvl } from "../managers/idle-managers/combat/combat-helpers";
import { FullUserData, prismaRecalculateAndUpdateUserBaseStats, prismaRecalculateAndUpdateUserStats, UserDataEquipped } from '../sql-services/user-service';
import { UserStatsWithCombat } from "./combat-operations";

export async function getUserSkillIntervalMultiplierMemory(telegramId: string): Promise<number> {
    try {
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (efficiencyStatsManager.hasUser(telegramId)) {
            const stats = efficiencyStatsManager.getEfficiencyStats(telegramId)!;
            return stats.skillIntervalMultiplier;
        }

        throw new Error('User efficiency stats not in memory');

    } catch (error) {
        logger.error(`❌ Failed to get skill interval multiplier for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserDoubleResourceChanceMemory(telegramId: string): Promise<number> {
    try {
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (efficiencyStatsManager.hasUser(telegramId)) {
            const stats = efficiencyStatsManager.getEfficiencyStats(telegramId)!;
            return stats.doubleResourceChance;
        }

        throw new Error('User efficiency stats not in memory');

    } catch (error) {
        logger.error(`❌ Failed to get double resource chance for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserDoubleSkillExpChanceMemory(telegramId: string): Promise<number> {
    try {
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (efficiencyStatsManager.hasUser(telegramId)) {
            const stats = efficiencyStatsManager.getEfficiencyStats(telegramId)!;
            return stats.doubleSkillExpChance;
        }

        throw new Error('User efficiency stats not in memory');

    } catch (error) {
        logger.error(`❌ Failed to get double skill exp chance for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserDoubleCombatExpChanceMemory(telegramId: string): Promise<number> {
    try {
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (efficiencyStatsManager.hasUser(telegramId)) {
            const stats = efficiencyStatsManager.getEfficiencyStats(telegramId)!;
            return stats.doubleCombatExpChance;
        }

        throw new Error('User efficiency stats not in memory');

    } catch (error) {
        logger.error(`❌ Failed to get double combat exp chance for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserFlatSkillExpBoostMemory(telegramId: string): Promise<number> {
    try {
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (efficiencyStatsManager.hasUser(telegramId)) {
            const stats = efficiencyStatsManager.getEfficiencyStats(telegramId)!;
            return stats.flatSkillExpBoost;
        }

        throw new Error('User efficiency stats not in memory');

    } catch (error) {
        logger.error(`❌ Failed to get flat skill exp boost for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserFlatCombatExpBoostMemory(telegramId: string): Promise<number> {
    try {
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (efficiencyStatsManager.hasUser(telegramId)) {
            const stats = efficiencyStatsManager.getEfficiencyStats(telegramId)!;
            return stats.flatCombatExpBoost;
        }

        throw new Error('User efficiency stats not in memory');

    } catch (error) {
        logger.error(`❌ Failed to get flat combat exp boost for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
 * Recalculate and update user stats (Memory version)
 */
export async function recalculateAndUpdateUserStatsMemory(
    telegramId: string
): Promise<UserDataEquipped> {
    const userMemoryManager = requireUserMemoryManager();
    try {
        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.combat) throw new Error(`Combat not found for ${telegramId}`);

            logger.info(`Recalculating stats for user ${telegramId} (MEMORY)`);

            // Create fresh combat object based on user base stats
            const userCombat: Combat = {
                ...user.combat,
                hp: user.maxHp,
                maxHp: user.maxHp,
                atkSpd: user.atkSpd,
                acc: user.acc,
                eva: user.eva,
                maxMeleeDmg: user.maxMeleeDmg,
                maxRangedDmg: user.maxRangedDmg,
                maxMagicDmg: user.maxMagicDmg,
                critChance: user.critChance,
                critMultiplier: user.critMultiplier,
                dmgReduction: user.dmgReduction,
                magicDmgReduction: user.magicDmgReduction,
                hpRegenRate: user.hpRegenRate,
                hpRegenAmount: user.hpRegenAmount,
                meleeFactor: 0,
                rangeFactor: 0,
                magicFactor: 0,
                reinforceAir: 0,
                reinforceWater: 0,
                reinforceEarth: 0,
                reinforceFire: 0,
            };

            const statEffects: StatEffect[] = [];

            // Collect equipment stat effects
            const equippedItems = [
                user.hat,
                user.armour,
                user.weapon,
                user.shield,
                user.cape,
                user.necklace,
            ];

            let updatedAttackType = false;

            for (const item of equippedItems) {
                const effect = item?.equipment?.statEffect;
                if (effect) {
                    statEffects.push(effect);
                }

                if (item?.equipment?.attackType && !updatedAttackType) {
                    userCombat.attackType = item.equipment.attackType;
                    updatedAttackType = true;
                }
            }

            if (!updatedAttackType) {
                userCombat.attackType = 'Melee';
            }

            // Add equipped slime dominant traits
            if (user.equippedSlime) {
                const dominantTraits = [
                    user.equippedSlime.BodyDominant,
                    user.equippedSlime.PatternDominant,
                    user.equippedSlime.PrimaryColourDominant,
                    user.equippedSlime.AccentDominant,
                    user.equippedSlime.DetailDominant,
                    user.equippedSlime.EyeColourDominant,
                    user.equippedSlime.EyeShapeDominant,
                    user.equippedSlime.MouthDominant,
                ];

                for (const trait of dominantTraits) {
                    if (trait?.statEffect) statEffects.push(trait.statEffect);
                }
            }

            // Calculate and apply stat deltas
            const delta = calculateNetStatDelta(user, statEffects);
            applyDelta(userCombat, delta);

            // Calculate combat power
            const cp = calculateCombatPower(userCombat);
            userCombat.cp = cp;

            // Update user and combat in memory
            await userMemoryManager.updateUserField(telegramId, 'combat', userCombat);

            logger.info(`✅ Stats recalculated for user ${telegramId} (MEMORY)`);

            // Right before the return:
            logger.info(`🔍 RETURN DEBUG - weapon: ${(user.weapon as any)?.equipment?.name || 'null'}`);
            logger.info(`🔍 RETURN DEBUG - weaponInventoryId: ${user.weaponInventoryId}`);

            return {
                ...user,
                combat: userCombat,
            };
        }

        // Fallback to database version
        return await prismaRecalculateAndUpdateUserStats(telegramId);

    } catch (error) {
        logger.error(`❌ Failed to recalculate stats for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
 * Recalculate and update user base stats (Memory version)
 */
export async function recalculateAndUpdateUserBaseStatsMemory(
    telegramId: string
): Promise<UserStatsWithCombat> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            const { str, def, dex, luk, magic, hpLevel } = user;

            const newBaseStats = {
                maxHp: getBaseMaxHpFromHpLvl(hpLevel),
                atkSpd: getBaseAtkSpdFromLuk(luk),
                acc: getBaseAccFromLuk(luk),
                eva: getBaseEvaFromDex(dex),
                maxMeleeDmg: getBaseMaxDmg(str),
                maxRangedDmg: getBaseMaxDmg(dex),
                maxMagicDmg: getBaseMaxDmg(magic),
                critChance: getBaseCritChanceFromLuk(luk),
                critMultiplier: getBaseCritMulFromLuk(luk),
                dmgReduction: getBaseDmgReductionFromDefAndStr(def, str),
                magicDmgReduction: getBaseMagicDmgReductionFromDefAndMagic(def, magic),
                hpRegenRate: getBaseHpRegenRateFromHpLvlAndDef(hpLevel, def),
                hpRegenAmount: getBaseHpRegenAmtFromHpLvlAndDef(hpLevel, def),
            };

            // Update base stats in memory
            for (const [key, value] of Object.entries(newBaseStats)) {
                await userMemoryManager.updateUserField(telegramId, key as keyof FullUserData, value);
            }

            // Recalculate full stats with equipment/slime bonuses
            const userDataEquipped = await recalculateAndUpdateUserStatsMemory(telegramId);

            logger.info(`✅ Recalculated base stats for user ${telegramId} (MEMORY)`);

            return {
                ...newBaseStats,
                outstandingSkillPoints: user.outstandingSkillPoints,
                hpLevel: user.hpLevel,
                expToNextHpLevel: user.expToNextHpLevel,
                expHp: user.expHp,
                str: user.str,
                def: user.def,
                dex: user.dex,
                luk: user.luk,
                magic: user.magic,
                combat: userDataEquipped.combat
            };
        }

        // Fallback to database version
        return await prismaRecalculateAndUpdateUserBaseStats(telegramId);

    } catch (error) {
        logger.error(`❌ Failed to recalculate base stats for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export function calculateNetStatDelta(user: User, effects: StatEffect[]) {
    const base = {
        maxHp: user.maxHp, atkSpd: user.atkSpd, acc: user.acc, eva: user.eva,
        maxMeleeDmg: user.maxMeleeDmg, maxRangedDmg: user.maxRangedDmg, maxMagicDmg: user.maxMagicDmg,
        critChance: user.critChance, critMultiplier: user.critMultiplier,
        dmgReduction: user.dmgReduction, magicDmgReduction: user.magicDmgReduction,
        hpRegenRate: user.hpRegenRate, hpRegenAmount: user.hpRegenAmount,
    };

    const result = {
        maxHp: 0, atkSpd: 0, acc: 0, eva: 0, maxMeleeDmg: 0, maxRangedDmg: 0, maxMagicDmg: 0,
        critChance: 0, critMultiplier: 0, dmgReduction: 0, magicDmgReduction: 0,
        hpRegenRate: 0, hpRegenAmount: 0, meleeFactor: 0, rangeFactor: 0, magicFactor: 0,
        reinforceAir: 0, reinforceWater: 0, reinforceEarth: 0, reinforceFire: 0,
        doubleResourceOdds: 0, skillIntervalReductionMultiplier: 0,
    };

    const additive = {} as Record<keyof typeof base, number>;
    const multiplicative = {} as Record<keyof typeof base, number[]>;

    // Init base keys
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
        additive[key] = 0;
        multiplicative[key] = [];
    }

    const apply = (mod: number | null | undefined, effect: 'add' | 'mul' | null | undefined, key: keyof typeof base) => {
        if (mod == null || effect == null) return;
        if (effect === 'add') additive[key] += mod;
        else multiplicative[key].push(mod); // expects full multiplier value like 0.9 or 1.1
    };

    for (const e of effects) {
        apply(e.maxHpMod, e.maxHpEffect, 'maxHp');
        apply(e.atkSpdMod, e.atkSpdEffect, 'atkSpd');
        apply(e.accMod, e.accEffect, 'acc');
        apply(e.evaMod, e.evaEffect, 'eva');
        apply(e.maxMeleeDmgMod, e.maxMeleeDmgEffect, 'maxMeleeDmg');
        apply(e.maxRangedDmgMod, e.maxRangedDmgEffect, 'maxRangedDmg');
        apply(e.maxMagicDmgMod, e.maxMagicDmgEffect, 'maxMagicDmg');
        apply(e.critChanceMod, e.critChanceEffect, 'critChance');
        apply(e.critMultiplierMod, e.critMultiplierEffect, 'critMultiplier');
        apply(e.dmgReductionMod, e.dmgReductionEffect, 'dmgReduction');
        apply(e.magicDmgReductionMod, e.magicDmgReductionEffect, 'magicDmgReduction');
        apply(e.hpRegenRateMod, e.hpRegenRateEffect, 'hpRegenRate');
        apply(e.hpRegenAmountMod, e.hpRegenAmountEffect, 'hpRegenAmount');

        // Simple additive values
        result.meleeFactor += e.meleeFactor ?? 0;
        result.rangeFactor += e.rangeFactor ?? 0;
        result.magicFactor += e.magicFactor ?? 0;
        result.reinforceAir += e.reinforceAir ?? 0;
        result.reinforceWater += e.reinforceWater ?? 0;
        result.reinforceEarth += e.reinforceEarth ?? 0;
        result.reinforceFire += e.reinforceFire ?? 0;

    }

    // Apply all stats with additive then multiplicative chaining
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
        const baseVal = base[key];
        const add = additive[key];
        const mulChain = multiplicative[key].reduce((acc, val) => acc * val, 1);
        result[key] = (baseVal + add) * mulChain - baseVal;
    }

    return result;
}

export function applyDelta(combat: Combat, delta: ReturnType<typeof calculateNetStatDelta>) {
    combat.maxHp = Math.round(combat.maxHp + delta.maxHp);

    if (combat.hp > combat.maxHp) {
        combat.hp = combat.maxHp;
        logger.debug(`⚕️ Capped HP to new maxHP for user: ${combat.hp}/${combat.maxHp}`);
    }

    combat.atkSpd = Math.round(combat.atkSpd + delta.atkSpd);
    combat.acc = Math.round(combat.acc + delta.acc);
    combat.eva = Math.round(combat.eva + delta.eva);
    combat.maxMeleeDmg = Math.round(combat.maxMeleeDmg + delta.maxMeleeDmg);
    combat.maxRangedDmg = Math.round(combat.maxRangedDmg + delta.maxRangedDmg);
    combat.maxMagicDmg = Math.round(combat.maxMagicDmg + delta.maxMagicDmg);
    combat.critChance += delta.critChance;
    const bonusCrit = Math.max(combat.critMultiplier - 1, 0.29);
    combat.critMultiplier = 1 + bonusCrit * (1 + delta.critMultiplier);
    combat.dmgReduction = Math.round(combat.dmgReduction + delta.dmgReduction);
    combat.magicDmgReduction = Math.round(combat.magicDmgReduction + delta.magicDmgReduction);
    combat.hpRegenRate += delta.hpRegenRate;
    combat.hpRegenAmount = Math.round(combat.hpRegenAmount + delta.hpRegenAmount);
    combat.meleeFactor = Math.round(combat.meleeFactor + delta.meleeFactor);
    combat.rangeFactor = Math.round(combat.rangeFactor + delta.rangeFactor);
    combat.magicFactor = Math.round(combat.magicFactor + delta.magicFactor);
    combat.reinforceAir = Math.round(combat.reinforceAir + delta.reinforceAir);
    combat.reinforceWater = Math.round(combat.reinforceWater + delta.reinforceWater);
    combat.reinforceEarth = Math.round(combat.reinforceEarth + delta.reinforceEarth);
    combat.reinforceFire = Math.round(combat.reinforceFire + delta.reinforceFire);
}

/**
 * Calculate efficiency stats delta from equipment and slime effects
 */
export function calculateEfficiencyStatsDelta(effects: StatEffect[]) {
    const result = {
        efficiencySkillInterval: 0,
        efficiencyDoubleResource: 0,
        efficiencyDoubleSkillExp: 0,
        efficiencyDoubleCombatExp: 0,
        efficiencyFlatSkillExp: 0,
        efficiencyFlatCombatExp: 0,
    };

    // All efficiency stats are additive
    for (const e of effects) {
        result.efficiencySkillInterval += e.efficiencySkillIntervalMod ?? 0;
        result.efficiencyDoubleResource += e.efficiencyDoubleResourceMod ?? 0;
        result.efficiencyDoubleSkillExp += e.efficiencyDoubleSkillExpMod ?? 0;
        result.efficiencyDoubleCombatExp += e.efficiencyDoubleCombatExpMod ?? 0;
        result.efficiencyFlatSkillExp += e.efficiencyFlatSkillExpMod ?? 0;
        result.efficiencyFlatCombatExp += e.efficiencyFlatCombatExpMod ?? 0;
    }

    return result;
}

/**
 * Recalculate user efficiency stats from equipment and slime bonuses
 */
export async function recalculateAndUpdateUserEfficiencyStatsMemory(telegramId: string): Promise<UserEfficiencyStats> {
    try {
        const userMemoryManager = requireUserMemoryManager();
        const efficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            logger.info(`⚡ Recalculating efficiency stats for user ${telegramId} (MEMORY)`);

            // Collect all stat effects from equipment
            const statEffects: StatEffect[] = [];

            const equippedItems = [
                user.hat,
                user.armour,
                user.weapon,
                user.shield,
                user.cape,
                user.necklace,
            ];

            // Add equipment stat effects
            for (const item of equippedItems) {
                const effect = item?.equipment?.statEffect;
                if (effect) {
                    statEffects.push(effect);
                    logger.debug(`⚡ Adding equipment effect from ${item.equipment?.name}`);
                }
            }

            // Add equipped slime dominant trait effects
            if (user.equippedSlime) {
                const dominantTraits = [
                    user.equippedSlime.BodyDominant,
                    user.equippedSlime.PatternDominant,
                    user.equippedSlime.PrimaryColourDominant,
                    user.equippedSlime.AccentDominant,
                    user.equippedSlime.DetailDominant,
                    user.equippedSlime.EyeColourDominant,
                    user.equippedSlime.EyeShapeDominant,
                    user.equippedSlime.MouthDominant,
                ];

                for (const trait of dominantTraits) {
                    if (trait?.statEffect) {
                        statEffects.push(trait.statEffect);
                        logger.debug(`⚡ Adding slime trait effect from ${trait.name}`);
                    }
                }
            }

            // Calculate efficiency stats delta
            const delta = calculateEfficiencyStatsDelta(statEffects);

            await efficiencyStatsManager.applyEfficiencyStatsDelta(telegramId, delta);

            return await efficiencyStatsManager.loadEfficiencyStats(telegramId);
        } else {
            throw new Error(`User not found in memory.`)
        }

    } catch (error) {
        logger.error(`❌ Failed to recalculate efficiency stats for user ${telegramId} (MEMORY): ${error}`);
        throw error;
    }
}

