import { requireActivityLogMemoryManager } from '../managers/global-managers/global-managers';
import { prismaLogBreedingActivity, prismaLogCombatActivity, prismaLogCraftingActivity, prismaLogFarmingActivity } from '../sql-services/user-activity-log';
import { logger } from '../utils/logger';
import { Rarity } from '@prisma/client';

/**
 * Log farming activity - buffers in memory
 */
export async function logFarmingActivity(userId: string, itemId: number, quantity: number): Promise<void> {
    try {
        const activityLogMemoryManager = requireActivityLogMemoryManager();

        if (activityLogMemoryManager.isReady()) {
            // Buffer in memory
            activityLogMemoryManager.addFarmingActivity(userId, itemId, quantity);
        } else {
            // Fallback to direct database write if memory manager not ready
            await prismaLogFarmingActivity(userId, itemId, quantity);
            logger.warn(`⚠️ ActivityLogMemoryManager not ready, wrote farming activity directly to DB`);
        }
    } catch (error) {
        logger.error(`❌ Failed to log farming activity for user ${userId}:`, error);
        throw error;
    }
}

/**
 * Log crafting activity - buffers in memory
 */
export async function logCraftingActivity(
    userId: string,
    equipmentIdIn: number,
    quantityIn: number,
    consumedItems: { itemId: number; quantity: number }[]
): Promise<void> {
    try {
        const activityLogMemoryManager = requireActivityLogMemoryManager();

        if (activityLogMemoryManager.isReady()) {
            // Buffer in memory
            activityLogMemoryManager.addCraftingActivity(userId, equipmentIdIn, quantityIn, consumedItems);
        } else {
            // Fallback to direct database write
            await prismaLogCraftingActivity(userId, equipmentIdIn, quantityIn, consumedItems);
            logger.warn(`⚠️ ActivityLogMemoryManager not ready, wrote crafting activity directly to DB`);
        }
    } catch (error) {
        logger.error(`❌ Failed to log crafting activity for user ${userId}:`, error);
        throw error;
    }
}

/**
 * Log breeding activity - buffers in memory
 */
export async function logBreedingActivity(input: {
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
}): Promise<void> {
    try {
        const activityLogMemoryManager = requireActivityLogMemoryManager();

        if (activityLogMemoryManager.isReady()) {
            // Buffer in memory
            activityLogMemoryManager.addBreedingActivity(input);
        } else {
            // Fallback to direct database write
            await prismaLogBreedingActivity(input);
            logger.warn(`⚠️ ActivityLogMemoryManager not ready, wrote breeding activity directly to DB`);
        }
    } catch (error) {
        logger.error(`❌ Failed to log breeding activity for user ${input.userId}:`, error);
        throw error;
    }
}

/**
 * Log combat activity - buffers in memory
 */
export async function logCombatActivity(input: {
    userId: string;
    monsterId: number;
    expGained: number;
    dittoEarned?: string;
    goldEarned?: number;
    drops?: {
        itemId?: number;
        equipmentId?: number;
        quantity: number;
    }[];
}): Promise<void> {
    try {
        const activityLogMemoryManager = requireActivityLogMemoryManager();

        if (activityLogMemoryManager.isReady()) {
            // Buffer in memory
            activityLogMemoryManager.addCombatActivity(input);
        } else {
            // Fallback to direct database write
            await prismaLogCombatActivity(input);
            logger.warn(`⚠️ ActivityLogMemoryManager not ready, wrote combat activity directly to DB`);
        }
    } catch (error) {
        logger.error(`❌ Failed to log combat activity for user ${input.userId}:`, error);
        throw error;
    }
}

/**
 * Force flush all activity logs to database
 * Useful for admin commands or before shutdown
 */
export async function forceFlushActivityLogs(): Promise<void> {
    try {
        const activityLogMemoryManager = requireActivityLogMemoryManager();

        await activityLogMemoryManager.flushAll();
        logger.info(`✅ Force flushed all activity logs to database`);
    } catch (error) {
        logger.error(`❌ Failed to force flush activity logs:`, error);
        throw error;
    }
}