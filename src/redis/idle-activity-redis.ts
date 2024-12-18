import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
import { logger } from "../utils/logger";
import { IdleActivityQueueElement } from "../managers/idle-managers/idle-manager";

export async function storeIdleActivityQueueElements(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    userId: number,
    activities: IdleActivityQueueElement[]
): Promise<void> {
    const redisKey = `user:${userId}:idleActivityQueueElements`;

    try {
        const pipeline = redisClient.multi(); // Start a Redis transaction

        // Add each activity to the pipeline
        activities.forEach((activity) => {
            // Create a plain object excluding callback functions
            const serializableActivity = {
                ...activity,
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
    userId: number
): Promise<IdleActivityQueueElement[]> {
    const redisKey = `user:${userId}:idleActivityQueueElements`;

    try {
        // Retrieve all serialized activity strings from the Redis list
        const activityJsons = await redisClient.lRange(redisKey, 0, -1);

        // Deserialize each JSON string into an IdleActivityQueueElement object
        const activities: IdleActivityQueueElement[] = activityJsons.map((json) => {
            const activity = JSON.parse(json) as IdleActivityQueueElement;

            // Reassign default placeholder functions for callbacks
            activity.activityCompleteCallback = async () => { };

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
    userId: number
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
