import { Rarity } from '@prisma/client';
import { prisma } from './client';
import { logger } from '../utils/logger';

export async function prismaLogFarmingActivity(userId: string, itemId: number, quantity: number) {
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

export async function prismaLogCraftingActivity(
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

export async function prismaLogBreedingActivity(input: BreedingActivityInput) {
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

export async function prismaLogCombatActivity(input: CombatActivityInput) {
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

export async function prismaLogCombatActivities(inputs: CombatActivityInput[]) {
    if (inputs.length === 0) return;

    try {
        // Step 1: Insert CombatActivityLogs inside transaction to get IDs
        const createdLogs = await prisma.$transaction(
            inputs.map((input) =>
                prisma.combatActivityLog.create({
                    data: {
                        userId: input.userId,
                        monsterId: input.monsterId,
                        expGained: input.expGained,
                        dittoEarned: input.dittoEarned ? input.dittoEarned : undefined,
                        goldEarned: input.goldEarned,
                    },
                })
            )
        );

        // Step 2: Flatten all drops and attach their corresponding activityLogId
        const dropsToInsert = [];

        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const log = createdLogs[i];

            if (!input.drops || input.drops.length === 0) continue;

            for (const drop of input.drops) {
                dropsToInsert.push({
                    combatActivityLogId: log.id,
                    itemId: drop.itemId ?? undefined,
                    equipmentId: drop.equipmentId ?? undefined,
                    quantity: drop.quantity,
                });
            }
        }

        // Step 3: Insert all drops
        if (dropsToInsert.length > 0) {
            await prisma.combatDrop.createMany({
                data: dropsToInsert,
                skipDuplicates: true,
            });
            logger.info(`📦 Logged ${dropsToInsert.length} combat drops.`);
        }

        logger.info(`✅ Batch logged ${inputs.length} combat activities.`);
    } catch (error) {
        logger.error(`❌ Failed to batch log combat activities:`, error);
        throw error;
    }
}

/**
 * Batch insert farming activities
 */
export async function prismaBatchLogFarmingActivities(activities: {
    userId: string;
    itemId: number;
    quantity: number;
    timestamp: Date;
}[]): Promise<void> {
    if (activities.length === 0) return;

    try {
        await prisma.farmingActivityLog.createMany({
            data: activities,
            skipDuplicates: true
        });

        logger.info(`✅ Batch logged ${activities.length} farming activities`);
    } catch (error) {
        logger.error(`❌ Failed to batch log farming activities:`, error);
        throw error;
    }
}

/**
 * Batch insert crafting activities with consumed items
 */
export async function prismaBatchLogCraftingActivities(activities: {
    userId: string;
    equipmentIdIn: number;
    quantityIn: number;
    consumedItems: {
        itemId: number;
        quantity: number;
    }[];
    timestamp: Date;
}[]): Promise<void> {
    if (activities.length === 0) return;

    try {
        // Need to use transaction since we have related consumed items
        await prisma.$transaction(async (tx) => {
            // Insert all crafting logs
            for (const activity of activities) {
                await tx.craftingActivityLog.create({
                    data: {
                        userId: activity.userId,
                        timestamp: activity.timestamp,
                        equipmentIdIn: activity.equipmentIdIn,
                        quantityIn: activity.quantityIn,
                        consumedItems: {
                            create: activity.consumedItems.map(item => ({
                                itemId: item.itemId,
                                quantity: item.quantity
                            }))
                        }
                    }
                });
            }
        });

        logger.info(`✅ Batch logged ${activities.length} crafting activities`);
    } catch (error) {
        logger.error(`❌ Failed to batch log crafting activities:`, error);
        throw error;
    }
}

/**
 * Batch insert breeding activities
 */
export async function prismaBatchLogBreedingActivities(activities: {
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
    timestamp: Date;
}[]): Promise<void> {
    if (activities.length === 0) return;

    try {
        await prisma.breedingActivityLog.createMany({
            data: activities,
            skipDuplicates: true
        });

        logger.info(`✅ Batch logged ${activities.length} breeding activities`);
    } catch (error) {
        logger.error(`❌ Failed to batch log breeding activities:`, error);
        throw error;
    }
}