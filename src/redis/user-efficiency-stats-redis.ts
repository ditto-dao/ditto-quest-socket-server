import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
import { logger } from "../utils/logger";
import { UserEfficiencyStats } from "@prisma/client";

// Redis key patterns
const EFFICIENCY_STATS_KEY = (userId: string) => `user:efficiency_stats:${userId}`;

export class EfficiencyStatsRedisManager {
    constructor(private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) { }

    /**
     * Store efficiency stats in Redis
     */
    async storeEfficiencyStats(userId: string, stats: UserEfficiencyStats): Promise<void> {
        try {
            const jsonData = JSON.stringify(stats);

            // Store both data and metadata
            const pipeline = this.redisClient.multi();
            pipeline.set(EFFICIENCY_STATS_KEY(userId), jsonData);
            await pipeline.exec();

            logger.debug(`⚡ Stored efficiency stats for user ${userId}`);
        } catch (error) {
            logger.error(`❌ Failed to store efficiency stats for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Load efficiency stats from Redis
     */
    async loadEfficiencyStats(userId: string): Promise<UserEfficiencyStats | null> {
        try {
            const statsData = await this.redisClient.get(EFFICIENCY_STATS_KEY(userId));

            if (!statsData) {
                logger.debug(`⚡ No efficiency stats found for user ${userId}`);
                return null;
            }

            const parsedStats = JSON.parse(statsData) as UserEfficiencyStats;
            logger.debug(`⚡ Loaded efficiency stats for user ${userId}`);

            return parsedStats;
        } catch (error) {
            logger.error(`❌ Failed to load efficiency stats for user ${userId}: ${error}`);
            return null;
        }
    }
}