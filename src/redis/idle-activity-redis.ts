import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
import { logger } from "../utils/logger";
import { IdleActivityIntervalElement } from "../managers/idle-managers/idle-manager-types";
import { MAX_CONCURRENT_IDLE_ACTIVITIES } from "../utils/config";

export async function storeIdleActivityQueueElements(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    userId: string,
    activities: IdleActivityIntervalElement[]
): Promise<void> {
    const redisKey = `user:${userId}:idleActivityQueueElements`;

    try {
        const pipeline = redisClient.multi(); // Start a Redis transaction

        // Add each activity to the pipeline
        activities.forEach((activity) => {
            // Create a plain object excluding callback functions
            const serializableActivity = {
                ...activity,
                activityInterval: undefined,
                activityCompleteCallback: undefined,
                activityStopCallback: undefined,
            };

            const activityJson = JSON.stringify(serializableActivity);
            pipeline.rPush(redisKey, activityJson);
        });

        // Execute the transaction
        await pipeline.exec();

        logger.info(`Stored ${activities.length} idle activity queue elements for user ${userId} in a single transaction.`);
    } catch (error) {
        logger.error(`Error storing idle activity queue elements for user ${userId}:`, error);
        throw error;
    }
}

export async function getIdleActivityQueueElements(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    userId: string
): Promise<IdleActivityIntervalElement[]> {
    const redisKey = `user:${userId}:idleActivityQueueElements`;

    try {
        // Retrieve all serialized activity strings from the Redis list
        const activityJsons = await redisClient.lRange(redisKey, 0, -1);

        // Deserialize each JSON string into an IdleActivityQueueElement object
        const activities: IdleActivityIntervalElement[] = activityJsons.map((json) => {
            const activity = JSON.parse(json) as IdleActivityIntervalElement;

            // Reassign default placeholder functions for callbacks
            if (activity.activity !== 'combat') activity.activityCompleteCallback = async () => { };

            activity.activityStopCallback = async () => { };

            return activity;
        });

        logger.info(`Retrieved ${activities.length} idle activity queue elements for user ${userId}.`);
        return activities;
    } catch (error) {
        logger.error(`Error retrieving idle activity queue elements for user ${userId}:`, error);
        throw error;
    }
}

export async function deleteAllIdleActivityQueueElements(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    userId: string
): Promise<void> {
    const redisKey = `user:${userId}:idleActivityQueueElements`;

    try {
        // Delete the Redis key for the user's idle activity queue
        const result = await redisClient.del(redisKey);

        if (result > 0) {
            logger.info(`Deleted all idle activity queue elements for user ${userId}.`);
        } else {
            logger.info(`No idle activity queue elements found to delete for user ${userId}.`);
        }
    } catch (error) {
        logger.error(`Error deleting idle activity queue elements for user ${userId}:`, error);
        throw error;
    }
}

export async function deleteAllIdleActivityQueueElementsForAllUsers(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
): Promise<void> {
    try {
        const pattern = "user:*:idleActivityQueueElements";
        const keys: string[] = [];

        // Use SCAN to avoid blocking Redis on large datasets
        let cursor = 0;
        do {
            const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = Number(reply.cursor);
            keys.push(...reply.keys);
        } while (cursor !== 0);

        if (keys.length === 0) {
            logger.info("No idle activity queue elements found to delete.");
            return;
        }

        // Delete all found keys
        const deletedCount = await redisClient.del(keys);

        logger.info(`Deleted ${deletedCount} idle activity queue keys for all users.`);
    } catch (error) {
        logger.error("Error deleting idle activity queue elements for all users:", error);
        throw error;
    }
}

export async function trimIdleActivitiesForAllUsers(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
): Promise<void> {
    try {
        const pattern = "user:*:idleActivityQueueElements";
        const keys: string[] = [];

        // Use SCAN to avoid blocking Redis
        let cursor = 0;
        do {
            const reply = await redisClient.scan(cursor, {
                MATCH: pattern,
                COUNT: 100,
            });
            cursor = Number(reply.cursor);
            keys.push(...reply.keys);
        } while (cursor !== 0);

        if (keys.length === 0) {
            logger.info("No idle activity keys found to trim.");
            return;
        }

        let totalTrimmed = 0;

        for (const key of keys) {
            const userIdMatch = key.match(/^user:(\d+):idleActivityQueueElements$/);
            if (!userIdMatch) continue;

            const userId = userIdMatch[1];
            const activities: IdleActivityIntervalElement[] = await getIdleActivityQueueElements(
                redisClient,
                userId
            );

            if (activities.length > MAX_CONCURRENT_IDLE_ACTIVITIES) {
                const trimmed = activities.slice(-MAX_CONCURRENT_IDLE_ACTIVITIES);
                await storeIdleActivityQueueElements(redisClient, userId, trimmed);
                logger.info(
                    `Trimmed idle activities for user ${userId}: kept ${trimmed.length}, removed ${activities.length - trimmed.length}`
                );
                totalTrimmed++;
            }
        }

        logger.info(`✅ Trimmed idle activities for ${totalTrimmed} user(s).`);
    } catch (error) {
        logger.error("❌ Error trimming idle activities for all users:", error);
        throw error;
    }
}