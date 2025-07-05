import { Rarity } from '@prisma/client';
import { logger } from '../../utils/logger';
import { prismaBatchLogBreedingActivities, prismaBatchLogCraftingActivities, prismaBatchLogFarmingActivities, prismaLogCombatActivities } from '../../sql-services/user-activity-log';

// Types matching your Prisma schema
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
    quantity: number; // ADD THIS LINE
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

// New aggregated interface for batching combat activities
interface AggregatedCombatActivity {
    userId: string;
    monsterId: number;
    killCount: number;
    totalExpGained: number;
    totalDittoEarned: bigint;
    totalGoldEarned: number;
    aggregatedDrops: Map<string, { itemId?: number; equipmentId?: number; quantity: number }>;
    firstKillTimestamp: Date;
    lastKillTimestamp: Date;
}

/**
 * ActivityLogMemoryManager - Buffers activity logs in memory for batch database writes
 * Now includes aggregated combat logging to reduce database load
 */
export class ActivityLogMemoryManager {
    private farmingActivities: FarmingActivity[] = [];
    private craftingActivities: CraftingActivity[] = [];
    private breedingActivities: BreedingActivity[] = [];
    private combatActivities: CombatActivity[] = [];

    // New aggregated combat activities - keyed by userId-monsterId
    private aggregatedCombatActivities: Map<string, AggregatedCombatActivity> = new Map();

    private isInitialized: boolean = false;
    private maxBufferSize: number = 1000; // Max activities per type before force flush
    private maxAggregatedCombatEntries: number = 500; // Max aggregated entries before force flush

    constructor() {
        this.isInitialized = true;
        logger.info("✅ ActivityLogMemoryManager initialized with aggregated combat logging");
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
     * Add combat activity to buffer - Legacy method for individual kills
     * Still supported for backward compatibility
     */
    addCombatActivity(activity: Omit<CombatActivity, 'timestamp'>): void {
        this.combatActivities.push({
            ...activity,
            timestamp: new Date()
        });

        logger.debug(`⚔️ Buffered combat activity for user ${activity.userId} vs monster ${activity.monsterId}`);

        if (this.combatActivities.length >= this.maxBufferSize) {
            logger.warn(`⚠️ Combat buffer full (${this.maxBufferSize}), forcing flush`);
            this.flushCombatActivities();
        }
    }

    /**
     * Add aggregated combat activity - New method for batching kills
     * This should be used for offline combat processing
     */
    addAggregatedCombatActivity(input: {
        userId: string;
        monsterId: number;
        expGained: number;
        dittoEarned?: bigint;
        goldEarned?: number;
        drops?: { itemId?: number; equipmentId?: number; quantity: number }[];
    }): void {
        const key = `${input.userId}-${input.monsterId}`;
        const existing = this.aggregatedCombatActivities.get(key);
        const now = new Date();

        if (existing) {
            // Aggregate with existing entry
            existing.killCount += 1;
            existing.totalExpGained += input.expGained;
            existing.totalDittoEarned += input.dittoEarned || 0n;
            existing.totalGoldEarned += input.goldEarned || 0;
            existing.lastKillTimestamp = now;

            // Aggregate drops
            if (input.drops) {
                for (const drop of input.drops) {
                    const dropKey = drop.itemId ? `item-${drop.itemId}` : `equipment-${drop.equipmentId}`;
                    const existingDrop = existing.aggregatedDrops.get(dropKey);

                    if (existingDrop) {
                        existingDrop.quantity += drop.quantity;
                    } else {
                        existing.aggregatedDrops.set(dropKey, { ...drop });
                    }
                }
            }
        } else {
            // Create new aggregated entry
            const aggregatedDrops = new Map<string, { itemId?: number; equipmentId?: number; quantity: number }>();

            if (input.drops) {
                for (const drop of input.drops) {
                    const dropKey = drop.itemId ? `item-${drop.itemId}` : `equipment-${drop.equipmentId}`;
                    aggregatedDrops.set(dropKey, { ...drop });
                }
            }

            this.aggregatedCombatActivities.set(key, {
                userId: input.userId,
                monsterId: input.monsterId,
                killCount: 1,
                totalExpGained: input.expGained,
                totalDittoEarned: input.dittoEarned || 0n,
                totalGoldEarned: input.goldEarned || 0,
                aggregatedDrops,
                firstKillTimestamp: now,
                lastKillTimestamp: now
            });
        }

        logger.debug(`⚔️ Aggregated combat activity for user ${input.userId} vs monster ${input.monsterId} (${this.aggregatedCombatActivities.get(key)?.killCount} total kills)`);

        // Force flush if we have too many aggregated entries
        if (this.aggregatedCombatActivities.size >= this.maxAggregatedCombatEntries) {
            logger.warn(`⚠️ Aggregated combat buffer full (${this.maxAggregatedCombatEntries}), forcing flush`);
            this.flushAggregatedCombatActivities();
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
            this.flushCombatActivities(),
            this.flushAggregatedCombatActivities()
        ];

        await Promise.allSettled(promises);
    }

    /**
     * Flush farming activities to database
     */
    async flushFarmingActivities(): Promise<void> {
        if (this.farmingActivities.length === 0) return;

        const activities = [...this.farmingActivities];
        this.farmingActivities = [];

        try {
            await prismaBatchLogFarmingActivities(activities);
            logger.info(`✅ Flushed ${activities.length} farming activities to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush farming activities:`, error);
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
        this.craftingActivities = [];

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
        this.breedingActivities = [];

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
     * Flush legacy combat activities to database
     */
    async flushCombatActivities(): Promise<void> {
        if (this.combatActivities.length === 0) return;

        const activities = [...this.combatActivities];
        this.combatActivities = [];

        try {
            const inputs = activities.map(activity => ({
                userId: activity.userId,
                monsterId: activity.monsterId,
                quantity: activity.quantity, // ADD THIS LINE
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
            logger.info(`✅ Flushed ${activities.length} legacy combat activities to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush combat activities:`, error);
            this.combatActivities = [...activities, ...this.combatActivities];
            throw error;
        }
    }

    /**
     * Flush aggregated combat activities to database
     * This creates fewer database entries by combining multiple kills per monster
     */
    async flushAggregatedCombatActivities(): Promise<void> {
        if (this.aggregatedCombatActivities.size === 0) return;

        const activities = Array.from(this.aggregatedCombatActivities.values());
        this.aggregatedCombatActivities.clear();

        try {
            const inputs = activities.map(activity => ({
                userId: activity.userId,
                monsterId: activity.monsterId,
                quantity: activity.killCount, // ADD THIS LINE - use killCount as quantity
                expGained: activity.totalExpGained,
                dittoEarned: activity.totalDittoEarned.toString(),
                goldEarned: activity.totalGoldEarned,
                // Add kill count and timing info as metadata in a custom field if needed
                // For now, we'll aggregate all drops into a single entry
                drops: Array.from(activity.aggregatedDrops.values()).map(drop => ({
                    itemId: drop.itemId,
                    equipmentId: drop.equipmentId,
                    quantity: drop.quantity
                }))
            }));

            await prismaLogCombatActivities(inputs);

            const totalKills = activities.reduce((sum, activity) => sum + activity.killCount, 0);
            logger.info(`✅ Flushed ${activities.length} aggregated combat activities (representing ${totalKills} total kills) to database`);
        } catch (error) {
            logger.error(`❌ Failed to flush aggregated combat activities:`, error);
            // Re-add activities back to buffer on failure
            for (const activity of activities) {
                const key = `${activity.userId}-${activity.monsterId}`;
                this.aggregatedCombatActivities.set(key, activity);
            }
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
        aggregatedCombat: number;
        aggregatedCombatKills: number;
        total: number;
    } {
        const aggregatedKills = Array.from(this.aggregatedCombatActivities.values())
            .reduce((sum, activity) => sum + activity.killCount, 0);

        return {
            farming: this.farmingActivities.length,
            crafting: this.craftingActivities.length,
            breeding: this.breedingActivities.length,
            combat: this.combatActivities.length,
            aggregatedCombat: this.aggregatedCombatActivities.size,
            aggregatedCombatKills: aggregatedKills, // FIX: Use the variable name
            total: this.farmingActivities.length +
                this.craftingActivities.length +
                this.breedingActivities.length +
                this.combatActivities.length +
                this.aggregatedCombatActivities.size
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
        this.aggregatedCombatActivities.clear();

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
     * Set max aggregated combat entries before force flush
     */
    setMaxAggregatedCombatEntries(size: number): void {
        this.maxAggregatedCombatEntries = size;
        logger.info(`📏 Set max aggregated combat entries to ${size}`);
    }

    /**
     * Check if user has any activities buffered
     */
    hasUser(userId: string): boolean {
        const hasInRegularBuffers = this.farmingActivities.some(a => a.userId === userId) ||
            this.craftingActivities.some(a => a.userId === userId) ||
            this.breedingActivities.some(a => a.userId === userId) ||
            this.combatActivities.some(a => a.userId === userId);

        const hasInAggregatedBuffer = Array.from(this.aggregatedCombatActivities.values())
            .some(a => a.userId === userId);

        return hasInRegularBuffers || hasInAggregatedBuffer;
    }

    /**
     * Flush all activities for a specific user
     */
    async flushUser(userId: string): Promise<void> {
        const userFarmingActivities = this.farmingActivities.filter(a => a.userId === userId);
        const userCraftingActivities = this.craftingActivities.filter(a => a.userId === userId);
        const userBreedingActivities = this.breedingActivities.filter(a => a.userId === userId);
        const userCombatActivities = this.combatActivities.filter(a => a.userId === userId);
        const userAggregatedCombatActivities = Array.from(this.aggregatedCombatActivities.entries())
            .filter(([key, activity]) => activity.userId === userId);

        if (userFarmingActivities.length === 0 &&
            userCraftingActivities.length === 0 &&
            userBreedingActivities.length === 0 &&
            userCombatActivities.length === 0 &&
            userAggregatedCombatActivities.length === 0) {
            return;
        }

        // Remove user activities from buffers
        this.farmingActivities = this.farmingActivities.filter(a => a.userId !== userId);
        this.craftingActivities = this.craftingActivities.filter(a => a.userId !== userId);
        this.breedingActivities = this.breedingActivities.filter(a => a.userId !== userId);
        this.combatActivities = this.combatActivities.filter(a => a.userId !== userId);

        // Remove user's aggregated combat activities
        for (const [key, activity] of userAggregatedCombatActivities) {
            this.aggregatedCombatActivities.delete(key);
        }

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
                    quantity: activity.quantity, // ADD THIS LINE
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

            if (userAggregatedCombatActivities.length > 0) {
                const aggregatedInputs = userAggregatedCombatActivities.map(([key, activity]) => ({
                    userId: activity.userId,
                    monsterId: activity.monsterId,
                    quantity: activity.killCount, // ADD THIS LINE - use killCount as quantity
                    expGained: activity.totalExpGained,
                    dittoEarned: activity.totalDittoEarned.toString(),
                    goldEarned: activity.totalGoldEarned,
                    drops: Array.from(activity.aggregatedDrops.values()).map(drop => ({
                        itemId: drop.itemId,
                        equipmentId: drop.equipmentId,
                        quantity: drop.quantity
                    }))
                }));
                promises.push(prismaLogCombatActivities(aggregatedInputs));
            }

            await Promise.allSettled(promises);

            const totalActivities = userFarmingActivities.length +
                userCraftingActivities.length +
                userBreedingActivities.length +
                userCombatActivities.length +
                userAggregatedCombatActivities.length;

            const totalKills = userAggregatedCombatActivities.reduce((sum, [key, activity]) => sum + activity.killCount, 0);

            logger.info(`✅ Flushed ${totalActivities} activities for user ${userId} (including ${totalKills} aggregated kills)`);
        } catch (error) {
            logger.error(`❌ Failed to flush activities for user ${userId}:`, error);

            // Re-add activities back to buffers on failure
            this.farmingActivities.push(...userFarmingActivities);
            this.craftingActivities.push(...userCraftingActivities);
            this.breedingActivities.push(...userBreedingActivities);
            this.combatActivities.push(...userCombatActivities);

            for (const [key, activity] of userAggregatedCombatActivities) {
                this.aggregatedCombatActivities.set(key, activity);
            }

            throw error;
        }
    }
}