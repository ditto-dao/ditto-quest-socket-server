import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { SnapshotRedisManager } from '../../redis/snapshot-redis';
import { logger } from '../../utils/logger';
import { getUserData } from '../../operations/user-operations';

class SnapshotWorker {
    private isRunning = false;
    private intervalId: NodeJS.Timeout | null = null;
    private snapshotRedis: SnapshotRedisManager;

    constructor(redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) {
        this.snapshotRedis = new SnapshotRedisManager(redisClient);
    }

    start(intervalMs: number = 30000) { // Run every 30 seconds
        if (this.isRunning) return;

        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.processQueue().catch(err => {
                logger.error(`📸 Snapshot worker error: ${err}`);
            });
        }, intervalMs);

        logger.info('📸 Snapshot worker started (Redis-based)');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('📸 Snapshot worker stopped');
    }

    private async processQueue() {
        try {
            // Get stale snapshots that need regeneration from Redis
            const staleSnapshots = await this.snapshotRedis.getStaleSnapshots(20);

            if (staleSnapshots.length === 0) return;

            logger.info(`📸 Processing ${staleSnapshots.length} stale snapshots from Redis`);

            for (const snapshotMeta of staleSnapshots) {
                try {
                    // Mark as regenerating to prevent duplicate processing
                    await this.snapshotRedis.updateSnapshotStatus(snapshotMeta.userId, 'regenerating');

                    const freshUserData = await getUserData(snapshotMeta.userId);

                    if (freshUserData) {
                        // Store the fresh snapshot in Redis
                        await this.snapshotRedis.storeSnapshot(snapshotMeta.userId, freshUserData, 'fresh');
                        logger.info(`✅ Regenerated snapshot for user ${snapshotMeta.userId} (memory-first approach)`);
                    } else {
                        logger.warn(`⚠️ No user data found for ${snapshotMeta.userId}, marking snapshot stale`);
                        await this.snapshotRedis.updateSnapshotStatus(snapshotMeta.userId, 'stale_session');
                    }
                } catch (error) {
                    logger.error(`❌ Failed to regenerate snapshot for user ${snapshotMeta.userId}: ${error}`);
                    await this.snapshotRedis.updateSnapshotStatus(snapshotMeta.userId, 'stale_session');
                }
            }

            // Log processing stats
            const stats = await this.snapshotRedis.getSnapshotStats();
            logger.info(`📊 Snapshot stats: ${stats.freshSnapshots} fresh, ${stats.staleSnapshots} stale, ${stats.totalSnapshots} total`);

        } catch (error) {
            logger.error(`📸 Snapshot worker queue processing failed: ${error}`);
        }
    }

    // Force regenerate a specific user's snapshot
    async regenerateUserSnapshot(userId: string): Promise<boolean> {
        try {
            logger.info(`🔄 Force regenerating snapshot for user ${userId}`);

            await this.snapshotRedis.updateSnapshotStatus(userId, 'regenerating');

            const freshUserData = await getUserData(userId);

            if (freshUserData) {
                await this.snapshotRedis.storeSnapshot(userId, freshUserData, 'fresh');
                logger.info(`✅ Force regenerated snapshot for user ${userId}`);
                return true;
            } else {
                await this.snapshotRedis.updateSnapshotStatus(userId, 'stale_session');
                logger.warn(`⚠️ No user data found for ${userId} during force regeneration`);
                return false;
            }
        } catch (error) {
            logger.error(`❌ Failed to force regenerate snapshot for user ${userId}: ${error}`);
            await this.snapshotRedis.updateSnapshotStatus(userId, 'stale_session');
            return false;
        }
    }

    // Get worker status and stats
    async getWorkerStats() {
        try {
            const snapshotStats = await this.snapshotRedis.getSnapshotStats();

            return {
                isRunning: this.isRunning,
                ...snapshotStats
            };
        } catch (error) {
            logger.error(`❌ Failed to get worker stats: ${error}`);
            return {
                isRunning: this.isRunning,
                totalSnapshots: 0,
                staleSnapshots: 0,
                freshSnapshots: 0
            };
        }
    }
}

// Export factory function to create worker with Redis client
export function createSnapshotWorker(redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) {
    return new SnapshotWorker(redisClient);
}

// For backward compatibility with existing code
export let snapshotWorker: SnapshotWorker;