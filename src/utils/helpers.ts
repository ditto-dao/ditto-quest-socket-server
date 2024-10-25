import { EquipmentType } from "@prisma/client";
import { HP_EXP_PER_EXP } from "./config";

// Helper function to calculate experience needed for the next level
export function calculateExpForNextLevel(nextLevel: number): number {
    return Math.floor((1 / 8) * (nextLevel - 1 + 300 * Math.pow(2, (nextLevel - 1) / 7)));
}

// Helper function to calculate HP experience gained for given EXP gained
export function calculateHpExpGained(exp: number): number {
    return Math.round(exp * HP_EXP_PER_EXP);
}

// Helper function to determine which user field corresponds to the equipment type
export function getEquipFieldByType(type: EquipmentType): string | null {
    switch (type) {
        case 'hat':
            return 'hatId';
        case 'armour':
            return 'armourId';
        case 'weapon':
            return 'weaponId';
        case 'shield':
            return 'shieldId';
        case 'cape':
            return 'capeId';
        case 'necklace':
            return 'necklaceId';
        case 'pet':
            return 'petId';
        case 'spellbook':
            return 'spellbookId';
        default:
            return null;
    }
}
