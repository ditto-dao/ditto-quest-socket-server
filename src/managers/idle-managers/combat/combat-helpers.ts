import { Combat } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * MAX HP = HPLVL * A
 */
export function getBaseMaxHpFromHpLvl(hpLvl: number): number {
    const A = 100;

    return hpLvl * A;
}

/**
 * HP REGEN RATE: SECONDS PER HEAL
 * 
 * For 1 ≤ REGEN FACTOR ≤ 150, Linear decrease from 20s → 5s
 * For REGEN FACTOR > 150, Decreasing rate from 5s → approaching 0s
 */
export function getBaseHpRegenRateFromHpLvlAndDef(hpLvl: number, def: number): number {
    const regenFactor = 0.5 * hpLvl + 0.5 * def;

    if (regenFactor < 1) return 20.0; // Prevents errors for invalid levels

    if (regenFactor >= 1 && regenFactor <= 150) {
        // Linear decrease from 20s to 5s
        return 20 - ((regenFactor - 1) / (150 - 1)) * (20 - 5);
    }

    // Smooth transition from 5s at level 150, decreasing towards 0.1s but never reaching 0
    return 0.1 + (4.9 * Math.exp(-0.017 * (regenFactor - 150)));
}

/**
 * HP REGEN AMT = A + (B * HP LEVEL) + (C * DEF)
 */
export function getBaseHpRegenAmtFromHpLvlAndDef(hpLvl: number, def: number): number {
    const A = 10;
    const B = 0.5;
    const C = 0.3;

    return A + (B * hpLvl) + (C * def);
}

/**
 * ATK SPD = LUK * A
 */
export function getBaseAtkSpdFromLuk(luk: number): number {
    const A = 10;

    return luk * A;
}

/**
 * 10 ≤ ASPD ≤ 300, Linear decrease from 2s → 1.5s
 * 300 ≤ ASPD ≤ 2000, Linear decrease from 1.5s → 0.75s
 * 2000 ≤ ASPD ≤ 3000, Linear decrease from 0.75s → 0.25s
 * ASPD > 3000, Decreasing rate from 0.25s → approaching 0.1s
 */
export function getAtkCooldownFromAtkOld(atkSpd: number): number {
    if (atkSpd < 10) return 2;

    if (atkSpd >= 10 && atkSpd <= 300) {
        return 2 - ((atkSpd - 10) / (300 - 10)) * (2 - 1.5);
    }

    if (atkSpd > 300 && atkSpd <= 2000) {
        return 1.5 - ((atkSpd - 300) / (2000 - 300)) * (1.5 - 0.75);
    }

    if (atkSpd > 2000 && atkSpd <= 3000) {
        return 0.75 - ((atkSpd - 2000) / (3000 - 2000)) * (0.75 - 0.25);
    }

    return 0.1 + (0.15 * Math.exp(-0.002 * (atkSpd - 3000)));
}

export function getAtkCooldownFromAtkSpd(atkSpd: number): number {
    if (atkSpd < 10) return 4;

    if (atkSpd <= 500) {
        return 4 - ((atkSpd - 10) / (500 - 10)) * (4 - 3.5); // 4 → 3.5
    }

    if (atkSpd <= 2000) {
        return 3.5 - ((atkSpd - 500) / (2000 - 500)) * (3.5 - 2.5); // 3.5 → 2.5
    }

    if (atkSpd <= 5000) {
        return 2.5 - ((atkSpd - 2000) / (5000 - 2000)) * (2.5 - 1.5); // 2.5 → 1.5
    }

    if (atkSpd <= 10000) {
        return 1.5 - ((atkSpd - 5000) / (10000 - 5000)) * (1.5 - 1.0); // 1.5 → 1.0
    }

    // Late game: 10k+ scales slowly toward 0.85s
    return 0.85 + 0.15 * Math.exp(-0.001 * (atkSpd - 10000));
}

/**
 * ACC = (LUK ^ A) * B
 */
export function getBaseAccFromLuk(luk: number): number {
    const A = 1.1;
    const B = 10;

    return Math.pow(luk, A) * B;
}

/**
 * EVA = (DEX ^ A) * B
 */
export function getBaseEvaFromDex(dex: number): number {
    const A = 1.05;
    const B = 10;

    return Math.pow(dex, A) * B;
}

/**
 * MAX DMG = A + B * (STR ^ C)
 * MAX MELEE DMG uses STR, MAX RANGE DMG uses DEX, MAX MAGIC DMG uses MAGIC
 */
export function getBaseMaxDmg(lvl: number): number {
    const A = 10;
    const B = 20;
    const C = 0.7;

    return A + B * Math.pow(lvl, C);
}

/**
 * CRIT CHANCE = LUK / (LUK + A)
 */
export function getBaseCritChanceFromLuk(luk: number): number {
    const A = 250;
    return luk / (luk + A);
}

/**
 * CRIT MULTIPLIER = A  + B * lg(LUK + 1)
 */
export function getBaseCritMulFromLuk(luk: number): number {
    const A = 1.2;
    const B = 0.3;

    return A + B * Math.log10(luk + 1);
}

/**
 * DMG REDUCTION = DEF * A + STR * B
 */
export function getBaseDmgReductionFromDefAndStr(def: number, str: number): number {
    const A = 10;
    const B = 5;

    return def * A + str * B;
}

/**
 * MAGIC DMG REDUCTION = (A * DEF) + (B * MAGIC)
 */
export function getBaseMagicDmgReductionFromDefAndMagic(def: number, magic: number): number {
    const A = 4;
    const B = 6;

    return A * def + B * magic;
}

export function getPercentageDmgReduct(dmgReduction: number): number {
    return 1 / (1 + dmgReduction / 5000);
}

export function calculateCombatPower(c: Combat): Decimal {
    const maxMeleeDmg = new Decimal(c.maxMeleeDmg);
    const maxRangedDmg = new Decimal(c.maxRangedDmg);
    const maxMagicDmg = new Decimal(c.maxMagicDmg);

    const atkSpd = new Decimal(c.atkSpd);
    const critChance = new Decimal(c.critChance);
    const critMultiplier = new Decimal(c.critMultiplier);
    const acc = new Decimal(c.acc);
    const eva = new Decimal(c.eva);
    const dmgReduction = new Decimal(c.dmgReduction);
    const magicDmgReduction = new Decimal(c.magicDmgReduction);
    const hpRegenRate = new Decimal(c.hpRegenRate);
    const hpRegenAmount = new Decimal(c.hpRegenAmount);
    const maxHp = new Decimal(c.maxHp);

    const relevantMaxDmg =
        c.attackType === "Melee"
            ? maxMeleeDmg
            : c.attackType === "Ranged"
                ? maxRangedDmg
                : c.attackType === "Magic"
                    ? maxMagicDmg
                    : new Decimal(0);

    // === OFFENSE SCORE ===
    const cooldown = new Decimal(getAtkCooldownFromAtkSpd(atkSpd.toNumber())); // seconds
    const attacksPerSecond = new Decimal(1).div(cooldown);
    const averageHitDmg = relevantMaxDmg.mul(Decimal.add(1, critChance.mul(critMultiplier.minus(1))));
    const dps = averageHitDmg.mul(attacksPerSecond);

    // === ACCURACY & EVASION SCORE ===
    const accuracyScore = acc.sqrt();
    const evasionScore = eva.sqrt();

    // === DEFENSE SCORE ===
    const physMitigation = new Decimal(1).minus(
        new Decimal(getPercentageDmgReduct(dmgReduction.toNumber()))
    );
    const magicMitigation = new Decimal(1).minus(
        new Decimal(getPercentageDmgReduct(magicDmgReduction.toNumber()))
    );
    const avgMitigation = physMitigation.plus(magicMitigation).div(2);
    const defenseScore = avgMitigation.mul(100); // scale to readable number

    // === SUSTAIN SCORE ===
    const sustainScore = hpRegenAmount.div(hpRegenRate); // heals per second

    // === HP SCORE ===
    const hpScore = maxHp.sqrt();

    // === FINAL SCORE ===
    const totalScore = dps.mul(10)
        .plus(accuracyScore.mul(5))
        .plus(evasionScore.mul(5))
        .plus(defenseScore.mul(3))
        .plus(sustainScore.mul(3))
        .plus(hpScore.mul(2));

    return totalScore.round();
}