import AsyncLock from "async-lock";
import { logger } from "../../utils/logger";
import { EfficiencyStatsRedisManager } from "../../redis/user-efficiency-stats-redis";
import { prismaFetchUserEfficiencyStats, prismaSetUserEfficiencyStats, UserEfficiencyStatsInput } from "../../sql-services/user-efficiency-stats";
import { UserEfficiencyStats } from "@prisma/client";
import { calculateEfficiencyStatsDelta } from "../../operations/user-stats-operations";

export interface UserEfficiencyStatsBuff {
    skillIntervalMultiplier?: number;
    doubleResourceChance?: number;
    doubleSkillExpChance?: number;
    doubleCombatExpChance?: number;
    flatSkillExpBoost?: number;
    flatCombatExpBoost?: number;
}

/**
 * UserEfficiencyStatsMemoryManager - Manages in-memory efficiency stats for O(1) access
 * This is the fastest tier of the 3-tier architecture:
 * 1. Memory (this) - Ultra-fast O(1) access for active users
 * 2. Redis - Fast cache backup
 * 3. Database - Source of truth
 */
export class UserEfficiencyStatsMemoryManager {
    private efficiencyStats: Map<string, UserEfficiencyStats>;
    private dirtyUsers: Set<string>;
    private isInitialized: boolean = false;
    private userOperationLocks: Map<string, AsyncLock> = new Map();

    constructor(private redisManager: EfficiencyStatsRedisManager) {
        this.efficiencyStats = new Map();
        this.dirtyUsers = new Set();
        this.isInitialized = true;
        logger.info("✅ UserEfficiencyStatsMemoryManager initialized");
    }

    /**
     * Check if manager is ready
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Get or create a lock for a specific user
     */
    private getUserLock(userId: string): AsyncLock {
        if (!this.userOperationLocks.has(userId)) {
            this.userOperationLocks.set(userId, new AsyncLock());
        }
        return this.userOperationLocks.get(userId)!;
    }

    /**
     * Get efficiency stats from memory - O(1) lookup
     */
    getEfficiencyStats(userId: string): UserEfficiencyStats | null {
        const stats = this.efficiencyStats.get(userId);
        if (stats) {
            logger.debug(`⚡ Retrieved efficiency stats for user ${userId} from memory`);
        }
        return stats || null;
    }

    /**
     * Set efficiency stats in memory
     */
    setEfficiencyStats(userId: string, stats: UserEfficiencyStats): void {
        this.efficiencyStats.set(userId, stats);
        logger.debug(`💾 Stored efficiency stats for user ${userId} in memory`);
    }

    /**
     * Load efficiency stats from Redis or DB, store in memory
     */
    async loadEfficiencyStats(userId: string): Promise<UserEfficiencyStats> {
        const userLock = this.getUserLock(userId);

        return await userLock.acquire('load_stats', async () => {
            // Check memory first
            const memoryStats = this.getEfficiencyStats(userId);
            if (memoryStats) {
                return memoryStats;
            }

            try {
                // Try Redis
                const redisStats = await this.redisManager.loadEfficiencyStats(userId);
                if (redisStats) {
                    this.setEfficiencyStats(userId, redisStats);
                    logger.info(`⚡ Loaded efficiency stats for user ${userId} from Redis`);
                    return redisStats;
                }

                // Try Database
                const dbStats = await prismaFetchUserEfficiencyStats(userId);
                this.setEfficiencyStats(userId, dbStats);

                // Store in Redis for faster future access
                await this.redisManager.storeEfficiencyStats(userId, dbStats);

                logger.info(`⚡ Loaded efficiency stats for user ${userId} from Database`);
                return dbStats;

            } catch (error) {
                logger.error(`❌ Failed to load efficiency stats for user ${userId}: ${error}`);

                // Return default stats as fallback
                const defaultStats = await this.createNewDefaultStats(userId);
                return defaultStats;
            }
        });
    }

    /**
     * Create default efficiency stats for new user - IMMEDIATELY save to DB to get real ID
     */
    private async createNewDefaultStats(userId: string): Promise<UserEfficiencyStats> {
        try {
            // Create in database immediately to get real ID
            const dbStats = await prismaSetUserEfficiencyStats(userId, {
                skillIntervalMultiplier: 0.0,
                doubleResourceChance: 0.0,
                doubleSkillExpChance: 0.0,
                doubleCombatExpChance: 0.0,
                flatSkillExpBoost: 0.0,
                flatCombatExpBoost: 0.0,
            });

            this.setEfficiencyStats(userId, dbStats);
            // Don't mark as dirty since we just saved to DB
            this.markClean(userId);

            // Store in Redis for future loads
            await this.redisManager.storeEfficiencyStats(userId, dbStats);

            logger.info(`⚡ Created default efficiency stats in DB for user ${userId} with ID ${dbStats.id}`);
            return dbStats;
        } catch (error) {
            logger.error(`❌ Failed to create default efficiency stats in DB for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Apply efficiency stats delta - MEMORY ONLY (follows combat pattern)
     */
    async applyEfficiencyStatsDelta(userId: string, delta: ReturnType<typeof calculateEfficiencyStatsDelta>): Promise<boolean> {
        const userLock = this.getUserLock(userId);

        return await userLock.acquire('apply_delta', async () => {
            const stats = this.getEfficiencyStats(userId);

            if (!stats) {
                logger.error(`Unable to apply efficienct stats delta. User efficiency stats not in memory.`);
                return false;
            }

            // Apply delta (reset to base then add equipment bonuses)
            stats.skillIntervalMultiplier = delta.efficiencySkillInterval;
            stats.doubleResourceChance = delta.efficiencyDoubleResource;
            stats.doubleSkillExpChance = delta.efficiencyDoubleSkillExp;
            stats.doubleCombatExpChance = delta.efficiencyDoubleCombatExp;
            stats.flatSkillExpBoost = delta.efficiencyFlatSkillExp;
            stats.flatCombatExpBoost = delta.efficiencyFlatCombatExp;

            this.setEfficiencyStats(userId, stats);
            this.markDirty(userId);

            return true;
        });
    }

    /**
     * Remove user from memory
     */
    removeUser(userId: string): void {
        this.efficiencyStats.delete(userId);
        this.dirtyUsers.delete(userId);
        this.userOperationLocks.delete(userId);
        logger.debug(`🗑️ Removed efficiency stats for user ${userId} from memory`);
    }

    /**
     * Check if user exists in memory
     */
    hasUser(userId: string): boolean {
        return this.efficiencyStats.has(userId);
    }

    /**
     * Mark user as dirty (needs sync)
     */
    markDirty(userId: string): void {
        this.dirtyUsers.add(userId);
        logger.debug(`🔄 Marked efficiency stats for user ${userId} as dirty`);
    }

    /**
     * Mark user as clean (synced)
     */
    markClean(userId: string): void {
        this.dirtyUsers.delete(userId);
        logger.debug(`✅ Marked efficiency stats for user ${userId} as clean`);
    }

    /**
     * Check if user is dirty
     */
    isDirty(userId: string): boolean {
        return this.dirtyUsers.has(userId);
    }

    /**
     * Get all dirty users
     */
    getDirtyUsers(): string[] {
        return Array.from(this.dirtyUsers);
    }

    /**
     * Flush efficiency stats to Redis and Database
     */
    async flushUser(userId: string): Promise<boolean> {
        const userLock = this.getUserLock(userId);

        return await userLock.acquire('flush_user', async () => {
            try {
                const stats = this.getEfficiencyStats(userId);
                if (!stats) {
                    logger.debug(`⚡ No efficiency stats to flush for user ${userId}`);
                    return true;
                }

                // Save to Database
                const dbInput: UserEfficiencyStatsInput = {
                    skillIntervalMultiplier: stats.skillIntervalMultiplier,
                    doubleResourceChance: stats.doubleResourceChance,
                    doubleSkillExpChance: stats.doubleSkillExpChance,
                    doubleCombatExpChance: stats.doubleCombatExpChance,
                    flatSkillExpBoost: stats.flatSkillExpBoost,
                    flatCombatExpBoost: stats.flatCombatExpBoost,
                };

                const updatedStats = await prismaSetUserEfficiencyStats(userId, dbInput);

                // Update memory with DB version (gets real ID)
                this.setEfficiencyStats(userId, updatedStats);

                // Save to Redis
                await this.redisManager.storeEfficiencyStats(userId, updatedStats);

                this.markClean(userId);

                logger.info(`✅ Flushed efficiency stats for user ${userId} to DB and Redis`);
                return true;

            } catch (error) {
                logger.error(`❌ Failed to flush efficiency stats for user ${userId}: ${error}`);
                return false;
            }
        });
    }

    /**
     * Flush all dirty users
     */
    async flushAllDirtyUsers(): Promise<void> {
        const dirtyUserIds = this.getDirtyUsers();
        if (dirtyUserIds.length === 0) return;

        logger.info(`🔄 Flushing efficiency stats for ${dirtyUserIds.length} dirty users`);

        for (const userId of dirtyUserIds) {
            try {
                await this.flushUser(userId);
            } catch (error) {
                logger.error(`❌ Failed to flush efficiency stats for user ${userId}: ${error}`);
            }
        }
    }

    /**
     * Logout user - flush data and optionally remove from memory
     */
    async logoutUser(userId: string, removeFromMemory: boolean = false): Promise<boolean> {
        const userLock = this.getUserLock(userId);

        return await userLock.acquire('logout', async () => {
            try {
                // Flush to DB and Redis
                const flushSuccess = await this.flushUser(userId);

                if (!flushSuccess) {
                    logger.warn(`⚠️ Failed to flush efficiency stats during logout for user ${userId}`);

                    // Try to at least save to Redis
                    try {
                        const stats = this.getEfficiencyStats(userId);
                        if (stats) {
                            await this.redisManager.storeEfficiencyStats(userId, stats);
                            logger.info(`📸 Emergency save to Redis for user ${userId} efficiency stats`);
                        }
                    } catch (redisError) {
                        logger.error(`❌ Emergency Redis save failed for user ${userId}: ${redisError}`);
                    }
                }

                if (removeFromMemory) {
                    if (flushSuccess) {
                        this.removeUser(userId);
                        logger.info(`🗑️ Removed efficiency stats for user ${userId} from memory after logout`);
                    } else {
                        this.markDirty(userId); // Keep for retry
                        logger.warn(`⚠️ Keeping efficiency stats for user ${userId} in memory - flush failed`);
                        return false;
                    }
                }

                return flushSuccess;

            } catch (error) {
                logger.error(`❌ Failed to logout efficiency stats for user ${userId}: ${error}`);
                return false;
            }
        });
    }

    /**
     * Clear all users from memory (use with caution!)
     */
    clear(): void {
        const hadDirty = this.dirtyUsers.size > 0;
        if (hadDirty) {
            logger.warn(`⚠️ Clearing UserEfficiencyStatsMemoryManager with ${this.dirtyUsers.size} dirty users!`);
        }

        this.efficiencyStats.clear();
        this.dirtyUsers.clear();
        this.userOperationLocks.clear();

        logger.info("🗑️ UserEfficiencyStatsMemoryManager cleared");
    }

    /**
     * Get memory usage stats
     */
    getStats(): {
        totalUsers: number;
        dirtyUsers: number;
        memoryUsageKB: number;
    } {
        const totalUsers = this.efficiencyStats.size;
        const dirtyUsers = this.dirtyUsers.size;

        // Rough estimate of memory usage
        const avgBytesPerUser = 200; // Approximate size of UserEfficiencyStats object
        const memoryUsageKB = Math.round((totalUsers * avgBytesPerUser) / 1024);

        return {
            totalUsers,
            dirtyUsers,
            memoryUsageKB
        };
    }
}