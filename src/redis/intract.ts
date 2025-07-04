import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
import { logger } from "../utils/logger";
import { formatUnits, parseUnits } from "ethers";
import { DITTO_DECIMALS } from "../utils/config";

const CACHE_TTL = 1814400; // 3 weeks
const KEY_PREFIX = 'combat_ditto_total';

/**
 * Get total combat ditto earned for a user by telegram ID
 */
export async function getTotalCombatDitto(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    telegramId: string
): Promise<number | null> {
    try {
        const redisKey = `${KEY_PREFIX}:tg:${telegramId}`;
        const dittoWei = await redisClient.get(redisKey);
        
        if (!dittoWei) {
            logger.debug(`💰 No cached combat ditto found for telegram ${telegramId}`);
            return null;
        }

        const totalDitto = parseFloat(formatUnits(dittoWei, DITTO_DECIMALS));
        logger.debug(`💰 Retrieved cached combat ditto for telegram ${telegramId}: ${totalDitto}`);
        return totalDitto;
    } catch (error) {
        logger.error(`❌ Failed to get total combat ditto for telegram ${telegramId}:`, error);
        return null;
    }
}

/**
 * Increment total combat ditto for a user by telegram ID
 */
export async function incrementTotalCombatDittoByTelegramId(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    telegramId: string,
    dittoAmount: bigint
): Promise<number> {
    try {
        const redisKey = `${KEY_PREFIX}:tg:${telegramId}`;
        const dittoWei = parseUnits(dittoAmount.toString(), DITTO_DECIMALS).toString();
        
        // Get current value or 0 if not exists
        const currentWei = await redisClient.get(redisKey) || '0';
        const newWei = (BigInt(currentWei) + BigInt(dittoWei)).toString();
        
        // Store new value with fresh TTL
        await redisClient.setEx(redisKey, CACHE_TTL, newWei);
        
        const newTotal = parseFloat(formatUnits(newWei, DITTO_DECIMALS));
        logger.debug(`💰 Incremented combat ditto for telegram ${telegramId}: +${dittoAmount} = ${newTotal} total`);
        
        return newTotal;
    } catch (error) {
        logger.error(`❌ Failed to increment total combat ditto for telegram ${telegramId}:`, error);
        throw error;
    }
}

/**
 * Clear all cached combat ditto data
 */
export async function clearAllCombatDittoCache(
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
): Promise<void> {
    try {
        const keys = await redisClient.keys(`${KEY_PREFIX}:*`);
        if (keys.length > 0) {
            await redisClient.del(keys);
            logger.info(`🧹 Cleared ${keys.length} cached combat ditto entries`);
        }
    } catch (error) {
        logger.error(`❌ Failed to clear combat ditto cache:`, error);
        throw error;
    }
}