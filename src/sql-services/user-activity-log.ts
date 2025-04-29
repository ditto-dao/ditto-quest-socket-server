import { Rarity } from '@prisma/client';
import { prisma } from './client';
import { logger } from '../utils/logger';

export async function logFarmingActivity(userId: string, itemId: number, quantity: number) {
    try {
        await prisma.farmingActivityLog.create({
            data: {
                userId,
                itemId,
                quantity,
                // timestamp will auto-default to now()
            },
        });
        logger.info(`✅ Farming activity logged for user ${userId}: Item ${itemId} x${quantity}`);
    } catch (error) {
        logger.error(`❌ Error logging farming activity for user ${userId}:`, error);
        throw error;
    }
}

interface ConsumedItemInput {
    itemId: number;
    quantity: number;
}

export async function logCraftingActivity(
    userId: string,
    equipmentIdIn: number,
    quantityIn: number,
    consumedItems: ConsumedItemInput[]
) {
    try {
        await prisma.craftingActivityLog.create({
            data: {
                userId,
                equipmentIdIn,
                quantityIn,
                consumedItems: {
                    create: consumedItems.map((item) => ({
                        itemId: item.itemId,
                        quantity: item.quantity,
                    })),
                },
            },
        });
        logger.info(`✅ Crafting activity logged for user ${userId}: Equipment ${equipmentIdIn} x${quantityIn}`);
    } catch (error) {
        logger.error(`❌ Error logging crafting activity for user ${userId}:`, error);
        throw error;
    }
}

interface BreedingActivityInput {
    userId: string;
    dameId: number;
    dameGeneration: number;
    dameRarity: Rarity;
    sireId: number;
    sireGeneration: number;
    sireRarity: Rarity;
    childId: number;
    childGeneration: number;
    childRarity: Rarity;
}

export async function logBreedingActivity(input: BreedingActivityInput) {
    try {
        await prisma.breedingActivityLog.create({
            data: {
                userId: input.userId,
                dameId: input.dameId,
                dameGeneration: input.dameGeneration,
                dameRarity: input.dameRarity,
                sireId: input.sireId,
                sireGeneration: input.sireGeneration,
                sireRarity: input.sireRarity,
                childId: input.childId,
                childGeneration: input.childGeneration,
                childRarity: input.childRarity,
            },
        });
        logger.info(`✅ Breeding activity logged for user ${input.userId}: Child Slime ${input.childId}`);
    } catch (error) {
        logger.error(`❌ Error logging breeding activity for user ${input.userId}:`, error);
        throw error;
    }
}

export interface CombatDropInput {
    itemId?: number;
    equipmentId?: number;
    quantity: number;
}

export interface CombatActivityInput {
    userId: string;
    monsterId: number;
    expGained: number;
    dittoEarned?: string;
    goldEarned?: number;
    drops?: CombatDropInput[];
}

export async function logCombatActivity(input: CombatActivityInput) {
    try {
        await prisma.combatActivityLog.create({
            data: {
                userId: input.userId,
                monsterId: input.monsterId,
                expGained: input.expGained,
                ...(input.dittoEarned ? { dittoEarned: input.dittoEarned } : {}),
                ...(input.goldEarned ? { goldEarned: input.goldEarned } : {}),
                drops: {
                    create: input.drops?.map((drop) => ({
                        itemId: drop.itemId ?? null,
                        equipmentId: drop.equipmentId ?? null,
                        quantity: drop.quantity,
                    })) || [],
                },
            },
        });
        logger.info(`✅ Logged combat activity for user ${input.userId} vs monster ${input.monsterId}`);
    } catch (error) {
        logger.error(`❌ Failed to log combat activity for user ${input.userId}:`, error);
        throw error;
    }
}