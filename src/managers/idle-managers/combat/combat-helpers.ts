import { Combat } from "@prisma/client";

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
 * For 1 ≤ HP LVL ≤ 150, Linear decrease from 20s → 5s
 * For HP LVL > 150, Decreasing rate from 5s → approaching 0s
 */
export function getBaseHpRegenRateFromHpLvl(hpLvl: number): number {
    if (hpLvl < 1) return 20.0; // Prevents errors for invalid levels

    if (hpLvl >= 1 && hpLvl <= 150) {
        // Linear decrease from 20s to 5s
        return 20 - ((hpLvl - 1) / (150 - 1)) * (20 - 5);
    }

    // Smooth transition from 5s at level 150, decreasing towards 0.1s but never reaching 0
    return 0.1 + (4.9 * Math.exp(-0.017 * (hpLvl - 150)));
}

/**
 * HP REGEN AMT = A + (B * HP LEVEL) + (C * STR)
 */
export function getBaseHpRegenAmtFromHpLvl(hpLvl: number, str: number): number {
    const A = 10;
    const B = 0.5;
    const C = 0.3;

    return A + (B * hpLvl) + (C * str);
}

/**
 * ATK SPD = DEX * A
 */
export function getBaseAtkSpdFromDex(dex: number): number {
    const A = 10;

    return dex * A;
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
 * ACC = (DEX ^ A) * B
 */
export function getBaseAccFromDex(dex: number): number {
    const A = 1.1;
    const B = 100;

    return Math.pow(dex, A) * B;
}

/**
 * EVA = (DEX ^ A) * B
 */
export function getBaseEvaFromDex(dex: number): number {
    const A = 1.05;
    const B = 100;

    return Math.pow(dex, A) * B;
}

/**
 * MAX DMG = A + B * (STR ^ C)
 * MAX RANGE DMG uses DEX, MAX MAGIC DMG uses MAGIC
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
 * DMG REDUCTION = DEF * A
 */
export function getBaseDmgReductionFromDef(def: number): number {
    const A = 10;

    return def * A;
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