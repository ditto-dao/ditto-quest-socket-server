import { EquipmentType, Rarity, TraitType } from "@prisma/client";
import { HP_EXP_PER_EXP } from "./config";

// Helper function to calculate experience needed for the next level
export function calculateExpForNextLevel(nextLevel: number): number {
    return Math.floor((1 / 8) * (nextLevel - 1 + 300 * Math.pow(2, (nextLevel - 1) / 7)));
}

// Helper function to calculate HP experience gained for given EXP gained
export function calculateHpExpGained(exp: number): number {
    return Math.round(exp * HP_EXP_PER_EXP);
}

export const rarities: Rarity[] = ['D', 'C', 'B', 'A', 'S'];

export const traitTypes: TraitType[] = ['Aura', 'Body', 'Core', 'Headpiece', 'Tail', 'Arms', 'Eyes', 'Mouth'];

export const probabiltyToPassDownTrait: number[] = [0.375, 0.094, 0.023, 0.008]

export function getMutationProbability(rarity: Rarity): number {
    switch (rarity) {
        case 'D':
        case 'C':
            return 0.25;
        case 'B':
        case 'A':
            return 0.125;
        default:
            return 0;
    }
}

export function getBreedingTimeSByGeneration(gen: number): number {
    if (gen < 1) {
        return 60;
    } else if (gen <= 3) {
        return 120;
    } else if (gen <= 5) {
        return 180;
    } else if (gen <= 7) {
        return 240;
    } else {
        return 300;
    }
}