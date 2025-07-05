import { Rarity } from '@prisma/client';
import { logger } from '../../utils/logger';
import { prismaBatchLogBreedingActivities, prismaBatchLogCraftingActivities, prismaBatchLogFarmingActivities, prismaLogCombatActivities } from '../../sql-services/user-activity-log';

interface FarmingActivity {
    userId: string;
    itemId: number;
    quantity: number;
    timestamp: Date;
}

interface CraftingActivity {
    userId: string;
    equipmentIdIn: number;
    quantityIn: number;
    consumedItems: {
        itemId: number;
        quantity: number;
    }[];
    timestamp: Date;
}

interface BreedingActivity {
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
}

interface CombatActivity {
    userId: string;
    monsterId: number;
    quantity: number;
    expGained: number;
    dittoEarned?: string;
    goldEarned?: number;
    drops?: {
        itemId?: number;
        equipmentId?: number;
        quantity: number;
    }[];
    timestamp: Date;
}

/**
 * ActivityLogMemoryManager - Buffers activity logs in memory for batch database writes
 * Stores activities in memory and flushes them to database periodically
 */
export class ActivityLogMemoryManager {
    private farmingActivities: FarmingActivity[] = [];
    private craftingActivities: CraftingActivity[] = [];
    private breedingActivities: BreedingActivity[] = [];
    private combatActivities: CombatActivity[] = [];

    private isInitialized: boolean = false;
    private maxBufferSize: number = 1000; // Max activities per type before force flush

    constructor() {
        this.isInitialized = true;
        logger.info("✅ ActivityLogMemoryManager initialized");
    }

    /**
     * Check if manager is ready
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Add farming activity to buffer
     */
    addFarmingActivity(userId: string, itemId: number, quantity: number): void {
        this.farmingActivities.push({
            userId,
            itemId,
            quantity,
            timestamp: new Date()
        });

        logger.debug(`🌾 Buffered farming activity for user ${userId}: Item ${itemId} x${quantity}`);

        if (this.farmingActivities.length >= this.maxBufferSize) {
            logger.warn(`⚠️ Farming buffer full (${this.maxBufferSize}), forcing flush`);
            this.flushFarmingActivities();
        }
    }

    /**
     * Add crafting activity to buffer
     */
    addCraftingActivity(
        userId: string,
        equipmentIdIn: number,
        quantityIn: number,
        consumedItems: { itemId: number; quantity: number }[]
    ): void {
        this.craftingActivities.push({
            userId,
            equipmentIdIn,
            quantityIn,
            consumedItems,
            timestamp: new Date()
        });

        logger.debug(`🔨 Buffered crafting activity for user ${userId}: Equipment ${equipmentIdIn} x${quantityIn}`);

        if (this.craftingActivities.length >= this.maxBufferSize) {
            logger.warn(`⚠️ Crafting buffer full (${this.maxBufferSize}), forcing flush`);
            this.flushCraftingActivities();
        }
    }

    /**
     * Add breeding activity to buffer
     */
    addBreedingActivity(activity: Omit<BreedingActivity, 'timestamp'>): void {
        this.breedingActivities.push({
            ...activity,
            timestamp: new Date()
        });

        logger.debug(`🥚 Buffered breeding activity for user ${activity.userId}: Child ${activity.childId}`);

        if (this.breedingActivities.length >= this.maxBufferSize) {
            logger.warn(`⚠️ Breeding buffer full (${this.maxBufferSize}), forcing flush`);
            this.flushBreedingActivities();
        }
    }

    /**
     * Add combat activity to buffer
     */
    addCombatActivity(activity: Omit<CombatActivity, 'timestamp'>): void {
        this.combatActivities.push({
            ...activity,
            timestamp: new Date()
        });

        logger.debug(`⚔️ Buffered combat activity for user ${activity.userId} vs monster ${activity.monsterId} (${activity.quantity} kills)`);

        if (this.combatActivities.length >= this.maxBufferSize) {
            logger.warn(`⚠️ Combat buffer full (${this.maxBufferSize}), forcing flush`);
            this.flushCombatActivities();
        }
    }

    /**
     * Flush all activity buffers to database
     */
    async flushAll(): Promise<void> {
        const promises = [
            this.flushFarmingActivities(),
            this.flushCraftingActivities(),
            this.flushBreedingActivities(),
            this.flushCombatActivities()
        ];

        await Promise.allSettled(promises);
    }

    /**
     * Flush farming activities to database
     */
    async flushFarmingActivities(): Promise<void> {
        if (this.farmingActivities.length === 0) return;

        const activities = [...this.farmingActivities];
        this.farmingActivities = []; // Clear buffer immediately

        try {
            await prismaBatchLogFarmingActivities(activities);
            logger.info(`✅ Flushed ${activities.length} farming activities to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush farming activities:`, error);
            // Re-add to buffer on failure (at the beginning to preserve order)
            this.farmingActivities = [...activities, ...this.farmingActivities];
            throw error;
        }
    }

    /**
     * Flush crafting activities to database
     */
    async flushCraftingActivities(): Promise<void> {
        if (this.craftingActivities.length === 0) return;

        const activities = [...this.craftingActivities];
        this.craftingActivities = []; // Clear buffer immediately

        try {
            await prismaBatchLogCraftingActivities(activities);
            logger.info(`✅ Flushed ${activities.length} crafting activities to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush crafting activities:`, error);
            this.craftingActivities = [...activities, ...this.craftingActivities];
            throw error;
        }
    }

    /**
     * Flush breeding activities to database
     */
    async flushBreedingActivities(): Promise<void> {
        if (this.breedingActivities.length === 0) return;

        const activities = [...this.breedingActivities];
        this.breedingActivities = []; // Clear buffer immediately

        try {
            await prismaBatchLogBreedingActivities(activities);
            logger.info(`✅ Flushed ${activities.length} breeding activities to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush breeding activities:`, error);
            this.breedingActivities = [...activities, ...this.breedingActivities];
            throw error;
        }
    }

    /**
     * Flush combat activities to database
     */
    async flushCombatActivities(): Promise<void> {
        if (this.combatActivities.length === 0) return;

        const activities = [...this.combatActivities];
        this.combatActivities = []; // Clear buffer immediately

        try {
            // Convert to the expected format
            const inputs = activities.map(activity => ({
                userId: activity.userId,
                monsterId: activity.monsterId,
                quantity: activity.quantity,
                expGained: activity.expGained,
                dittoEarned: activity.dittoEarned,
                goldEarned: activity.goldEarned,
                drops: activity.drops?.map(drop => ({
                    itemId: drop.itemId,
                    equipmentId: drop.equipmentId,
                    quantity: drop.quantity
                }))
            }));

            await prismaLogCombatActivities(inputs);

            const totalKills = activities.reduce((sum, activity) => sum + activity.quantity, 0);
            logger.info(`✅ Flushed ${activities.length} combat activities (representing ${totalKills} total kills) to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush combat activities:`, error);
            this.combatActivities = [...activities, ...this.combatActivities];
            throw error;
        }
    }

    /**
     * Get buffer statistics
     */
    getStats(): {
        farming: number;
        crafting: number;
        breeding: number;
        combat: number;
        combatKills: number;
        total: number;
    } {
        const combatKills = this.combatActivities.reduce((sum, activity) => sum + activity.quantity, 0);

        return {
            farming: this.farmingActivities.length,
            crafting: this.craftingActivities.length,
            breeding: this.breedingActivities.length,
            combat: this.combatActivities.length,
            combatKills,
            total: this.farmingActivities.length +
                this.craftingActivities.length +
                this.breedingActivities.length +
                this.combatActivities.length
        };
    }

    /**
     * Clear all buffers (use with caution!)
     */
    clear(): void {
        const stats = this.getStats();
        if (stats.total > 0) {
            logger.warn(`⚠️ Clearing ActivityLogMemoryManager with ${stats.total} unflushed activities!`);
        }

        this.farmingActivities = [];
        this.craftingActivities = [];
        this.breedingActivities = [];
        this.combatActivities = [];

        logger.info("🗑️ ActivityLogMemoryManager cleared");
    }

    /**
     * Set max buffer size per activity type
     */
    setMaxBufferSize(size: number): void {
        this.maxBufferSize = size;
        logger.info(`📏 Set max buffer size to ${size} per activity type`);
    }

    /**
     * Check if user has any activities buffered
     */
    hasUser(userId: string): boolean {
        return this.farmingActivities.some(a => a.userId === userId) ||
            this.craftingActivities.some(a => a.userId === userId) ||
            this.breedingActivities.some(a => a.userId === userId) ||
            this.combatActivities.some(a => a.userId === userId);
    }

    /**
     * Flush all activities for a specific user
     */
    async flushUser(userId: string): Promise<void> {
        const userFarmingActivities = this.farmingActivities.filter(a => a.userId === userId);
        const userCraftingActivities = this.craftingActivities.filter(a => a.userId === userId);
        const userBreedingActivities = this.breedingActivities.filter(a => a.userId === userId);
        const userCombatActivities = this.combatActivities.filter(a => a.userId === userId);

        if (userFarmingActivities.length === 0 &&
            userCraftingActivities.length === 0 &&
            userBreedingActivities.length === 0 &&
            userCombatActivities.length === 0) {
            return;
        }

        // Remove user activities from buffers
        this.farmingActivities = this.farmingActivities.filter(a => a.userId !== userId);
        this.craftingActivities = this.craftingActivities.filter(a => a.userId !== userId);
        this.breedingActivities = this.breedingActivities.filter(a => a.userId !== userId);
        this.combatActivities = this.combatActivities.filter(a => a.userId !== userId);

        try {
            const promises = [];

            if (userFarmingActivities.length > 0) {
                promises.push(prismaBatchLogFarmingActivities(userFarmingActivities));
            }

            if (userCraftingActivities.length > 0) {
                promises.push(prismaBatchLogCraftingActivities(userCraftingActivities));
            }

            if (userBreedingActivities.length > 0) {
                promises.push(prismaBatchLogBreedingActivities(userBreedingActivities));
            }

            if (userCombatActivities.length > 0) {
                const combatInputs = userCombatActivities.map(activity => ({
                    userId: activity.userId,
                    monsterId: activity.monsterId,
                    quantity: activity.quantity,
                    expGained: activity.expGained,
                    dittoEarned: activity.dittoEarned,
                    goldEarned: activity.goldEarned,
                    drops: activity.drops?.map(drop => ({
                        itemId: drop.itemId,
                        equipmentId: drop.equipmentId,
                        quantity: drop.quantity
                    }))
                }));
                promises.push(prismaLogCombatActivities(combatInputs));
            }

            await Promise.allSettled(promises);

            const totalActivities = userFarmingActivities.length +
                userCraftingActivities.length +
                userBreedingActivities.length +
                userCombatActivities.length;

            const totalKills = userCombatActivities.reduce((sum, activity) => sum + activity.quantity, 0);

            logger.info(`✅ Flushed ${totalActivities} activities for user ${userId} (including ${totalKills} total kills)`);
        } catch (error) {
            logger.error(`❌ Failed to flush activities for user ${userId}:`, error);

            // Re-add activities back to buffers on failure
            this.farmingActivities.push(...userFarmingActivities);
            this.craftingActivities.push(...userCraftingActivities);
            this.breedingActivities.push(...userBreedingActivities);
            this.combatActivities.push(...userCombatActivities);

            throw error;
        }
    }
}