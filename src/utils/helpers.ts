import { Prisma, Rarity, TraitType } from "@prisma/client";
import { HP_EXP_PER_EXP } from "./config";
import { SlimeWithTraits } from "../sql-services/slime";
import { COMBAT_UPDATE_EVENT, USER_UPDATE_EVENT } from "../socket/events";
import { FullUserData, UserDataEquipped } from "../sql-services/user-service";
import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { UserStatsWithCombat } from "../operations/combat-operations";

export function calculateExpForNextSkillLevel(nextLevel: number): number {
    const a = 450;
    const b = 1.15;
    const c = 120;
    const d = 1.87;

    const baseExp = a * Math.pow(nextLevel, b) + c * Math.pow(nextLevel, d);

    // Apply 10% increase per level above 100
    const levelModifier = nextLevel > 100 ? 1 + 0.1 * (nextLevel - 100) : 1;

    return Math.floor(baseExp * levelModifier);
}

export function calculateExpForNextCombatLevel(nextLevel: number): number {
    const a = 450;
    const b = 1.15;
    const c = 120;
    const d = 1.87;

    const baseExp = 2 * (a * Math.pow(nextLevel, b) + c * Math.pow(nextLevel, d));

    // Apply 10% increase per level above 100
    const levelModifier = nextLevel > 100 ? 1 + 0.1 * (nextLevel - 100) : 1;

    return Math.floor(baseExp * levelModifier);
}

// Helper function to calculate HP experience gained for given EXP gained
export function calculateHpExpGained(exp: number): number {
    return Math.floor(exp * HP_EXP_PER_EXP);
}

export const rarities: Rarity[] = ['D', 'C', 'B', 'A', 'S'];

export const traitTypes: TraitType[] = ['Body', 'Pattern', 'PrimaryColour', 'Accent', 'Detail', 'EyeColour', 'EyeShape', 'Mouth'];

export const probabiltyToPassDownTrait: number[] = [0.375, 0.094, 0.023, 0.008]

export function getMutationProbability(rarity: Rarity): number {
    switch (rarity) {
        case 'D':
        case 'C':
            return 0.25;
        case 'B':
        case 'A':
        case 'S':
            return 0.125;
        default:
            return 0;
    }
}

export function getBreedingTimesByGeneration(gen: number): number {
    if (gen < 1) {
        return 1800;
    } else if (gen <= 3) {
        return 2700;
    } else if (gen <= 5) {
        return 3600;
    } else if (gen <= 7) {
        return 7200;
    } else {
        return 10800;
    }
}

export function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
    const trimmedHex = hex.startsWith("#") ? hex.slice(1) : hex;

    // Parse the RGB values from the hex string
    const r = parseInt(trimmedHex.slice(0, 2), 16);
    const g = parseInt(trimmedHex.slice(2, 4), 16);
    const b = parseInt(trimmedHex.slice(4, 6), 16);

    return { r, g, b, alpha: 1 }; // Set alpha to 1 (fully opaque)
}

export function getHighestDominantTraitRarity(slime: SlimeWithTraits): Rarity {
    // Map rarity values to a rank for comparison
    const rarityRank: Record<Rarity, number> = {
        [Rarity.S]: 5,
        [Rarity.A]: 4,
        [Rarity.B]: 3,
        [Rarity.C]: 2,
        [Rarity.D]: 1,
    };

    // Collect all dominant traits
    const dominantTraits = [
        slime.BodyDominant,
        slime.PatternDominant,
        slime.PrimaryColourDominant,
        slime.AccentDominant,
        slime.DetailDominant,
        slime.EyeColourDominant,
        slime.EyeShapeDominant,
        slime.MouthDominant,
    ];

    // Find the highest rarity among the dominant traits
    const highestRarity = dominantTraits.reduce<Rarity>((highest, trait) => {
        return rarityRank[trait.rarity] > rarityRank[highest] ? trait.rarity : highest;
    }, Rarity.D); // Start with the lowest rarity as the initial value

    return highestRarity;
}

export function getSRankDominantTraitCount(slime: SlimeWithTraits): number {
    const rarityRank: Record<Rarity, number> = {
        [Rarity.S]: 5,
        [Rarity.A]: 4,
        [Rarity.B]: 3,
        [Rarity.C]: 2,
        [Rarity.D]: 1,
    };

    const dominantTraits = [
        slime.BodyDominant,
        slime.PatternDominant,
        slime.PrimaryColourDominant,
        slime.AccentDominant,
        slime.DetailDominant,
        slime.EyeColourDominant,
        slime.EyeShapeDominant,
        slime.MouthDominant,
    ];

    let sRankCount = 0;

    for (const trait of dominantTraits) {
        if (trait.rarity === Rarity.S) sRankCount++;
    }

    return sRankCount;
}

export function getSlimeSellAmountGP(slime: SlimeWithTraits) {
    const rarity = getHighestDominantTraitRarity(slime);
    if (rarity == "S") {
        if (getSRankDominantTraitCount(slime) >= 3) return 50000;
        else return 25000;
    }
    else if (rarity == "A") return 10000;
    else if (rarity == "B") return 5000;
    else if (rarity == "C") return 2500;
    else if (rarity == "D") return 1000;
    else return 0;
}

export function toCamelCase(input: string): string {
    return input
        .toLowerCase() // Convert the string to lowercase
        .split(" ") // Split the string into words
        .map((word, index) => {
            if (index === 0) {
                return word; // Keep the first word in lowercase
            }
            // Capitalize the first letter of subsequent words
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(""); // Join the words back into a single string
}

export function getColourHexByRarity(rarity: Rarity): string {
    const BG_COLOUR_HEX = { [Rarity.D]: "#b0b0b0", [Rarity.C]: "#8fbf71", [Rarity.B]: "#5b9eea", [Rarity.A]: "#ba78f9", [Rarity.S]: "#f6b74c" };

    const colourHex = BG_COLOUR_HEX[rarity];
    if (!colourHex) {
        throw new Error(`No colour hex defined for rarity: ${rarity}`);
    }
    return colourHex;
}

export function emitUserAndCombatUpdate(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, userId: string, res: Partial<FullUserData> | UserDataEquipped | Prisma.UserGetPayload<{ include: { combat: true } }> | UserStatsWithCombat) {
    socket.emit(USER_UPDATE_EVENT, {
        userId: userId,
        payload: {
            str: res.str,
            def: res.def,
            dex: res.dex,
            luk: res.luk,
            magic: res.magic,
            hpLevel: res.hpLevel,
            expHp: res.expHp,
            expToNextHpLevel: res.expToNextHpLevel,
            maxHp: res.maxHp,
            atkSpd: res.atkSpd,
            acc: res.acc,
            eva: res.eva,
            maxMeleeDmg: res.maxMeleeDmg,
            maxRangedDmg: res.maxRangedDmg,
            maxMagicDmg: res.maxMagicDmg,
            critChance: res.critChance,
            critMultiplier: res.critMultiplier,
            dmgReduction: res.dmgReduction,
            magicDmgReduction: res.magicDmgReduction,
            hpRegenRate: res.hpRegenRate,
            hpRegenAmount: res.hpRegenAmount,
            outstandingSkillPoints: res.outstandingSkillPoints,
            doubleResourceOdds: res.doubleResourceOdds,
            skillIntervalReductionMultiplier: res.skillIntervalReductionMultiplier,
        }
    });

    if (res.combat) {
        socket.emit(COMBAT_UPDATE_EVENT, {
            userId: userId,
            payload: {
                attackType: res.combat.attackType,
                cp: res.combat.cp,
                hp: res.combat.hp,
                maxHp: res.combat.maxHp,
                atkSpd: res.combat.atkSpd,
                acc: res.combat.acc,
                eva: res.combat.eva,
                maxMeleeDmg: res.combat.maxMeleeDmg,
                maxRangedDmg: res.combat.maxRangedDmg,
                maxMagicDmg: res.combat.maxMagicDmg,
                critChance: res.combat.critChance,
                critMultiplier: res.combat.critMultiplier,
                dmgReduction: res.combat.dmgReduction,
                magicDmgReduction: res.combat.magicDmgReduction,
                hpRegenRate: res.combat.hpRegenRate,
                hpRegenAmount: res.combat.hpRegenAmount,
                meleeFactor: res.combat.meleeFactor,
                rangeFactor: res.combat.rangeFactor,
                magicFactor: res.combat.magicFactor,
                reinforceAir: res.combat.reinforceAir,
                reinforceWater: res.combat.reinforceWater,
                reinforceEarth: res.combat.reinforceEarth,
                reinforceFire: res.combat.reinforceFire
            }
        });
    }
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}