import { Combat } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';

// Function to get user combat
export async function getUserCombat(userId: string): Promise<Combat> {
    try {
        // Fetch the combat record for the given userId
        const combat = await prisma.combat.findUnique({
            where: { userId }
        });

        if (!combat) {
            throw new Error(`Combat record not found.`)
        }

        // Return the combat record
        console.log(`Fetched combat stats for user ID ${userId}: ${JSON.stringify(combat)}`);

        return combat;
    } catch (error) {
        console.error(`Error fetching combat stats for user ${userId}: ${error}`);
        throw error;
    }
}

// Function to increment/decrement hp
export async function incrementHp(userId: string, amount: number): Promise<number> {
    try {
        // Fetch the current hp and hpLevel from the Combat record
        const combat = await prisma.combat.findUnique({
            where: { userId }
        });

        if (!combat) {
            throw new Error(`Combat record not found.`)
        }

        // Calculate the maximum allowed hp based on hpLevel
        const maxHp = combat.hpLevel * 10;

        // Calculate the new hp, ensuring it does not drop below 0 or exceed maxHp
        const newHp = Math.min(maxHp, Math.max(0, combat.hp + amount));

        // Update the Combat record with the new hp value
        await prisma.combat.update({
            where: { userId },
            data: { hp: newHp }
        });

        console.log(`HP incremented by ${amount} for user ID ${userId}. New HP: ${newHp}`);

        return newHp;
    } catch (error) {
        console.error(`Error incrementing HP for user ${userId}: ${error}`);
        throw error;
    }
}

// Function to update user's combat stats based on equipped items
export async function updateCombatStats(telegramId: string): Promise<Combat> {
    try {
        // Fetch the user's equipment inventory (only equipped items)
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                hat: { include: { equipment: true } },
                armour: { include: { equipment: true } },
                weapon: { include: { equipment: true } },
                shield: { include: { equipment: true } },
                cape: { include: { equipment: true } },
                necklace: { include: { equipment: true } },
                pet: { include: { equipment: true } },
                spellbook: { include: { equipment: true } },
            }
        });

        if (!user) {
            throw new Error(`User with telegramId ${telegramId} not found.`);
        }

        // Initialize the total stats based on the base user stats
        let totalStr = user.str;
        let totalDef = user.def;
        let totalDex = user.dex;
        let totalMagic = user.magic;
        let hpLevel = user.hpLevel;

        // List of all equipment slots to iterate over
        const equipmentSlots = ['hat', 'armour', 'weapon', 'shield', 'cape', 'necklace', 'pet', 'spellbook'];

        // Iterate through each equipment slot and add its stats to the total
        for (const slot of equipmentSlots) {
            const equipmentInventory = user[slot as keyof typeof user] as any; // Cast dynamically
            if (equipmentInventory && equipmentInventory.equipment) {
                const equipment = equipmentInventory.equipment;
                totalStr += equipment.str;
                totalDef += equipment.def;
                totalDex += equipment.dex;
                totalMagic += equipment.magic;
                hpLevel += equipment.hp;
            }
        }

        // Update the user's combat stats with the calculated totals
        const updatedCombat = await prisma.combat.update({
            where: { userId: telegramId },
            data: {
                str: totalStr,
                def: totalDef,
                dex: totalDex,
                magic: totalMagic,
                hpLevel: hpLevel,
            }
        });

        logger.info(`Updated combat stats for user ${telegramId}: STR: ${totalStr}, DEF: ${totalDef}, DEX: ${totalDex}, MAGIC: ${totalMagic}, HP_LEVEL: ${hpLevel}`);

        return updatedCombat

    } catch (error) {
        logger.error(`Failed to update combat stats for user ${telegramId}: ${error}`);
        throw error;
    }
}

