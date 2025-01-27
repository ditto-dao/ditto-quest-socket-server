import { Rarity, TraitType } from "@prisma/client";
import { GACHA_PULL_ODDS, HP_EXP_PER_EXP } from "./config";
import { SlimeWithTraits } from "../sql-services/slime";

// Helper function to calculate experience needed for the next level
export function calculateExpForNextLevel(nextLevel: number): number {
    return Math.floor((1 / 4) * (nextLevel - 1 + 300 * Math.pow(2, (nextLevel - 1) / 7)));
}

// Helper function to calculate HP experience gained for given EXP gained
export function calculateHpExpGained(exp: number): number {
    return Math.round(exp * HP_EXP_PER_EXP);
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