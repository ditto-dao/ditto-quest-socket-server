import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { SnapshotRedisManager } from '../../redis/snapshot-redis';
import { logger } from '../../utils/logger';
import { ActivityLogMemoryManager } from '../memory/activity-log-memory-manager';
import { UserMemoryManager } from '../memory/user-memory-manager';
import { SlimeIDManager, slimeIdManager } from '../slime-id-memory-manager.ts/slime-id-memory-manager';

// Global manager instances
let snapshotRedisManager: SnapshotRedisManager | null = null;
let userMemoryManager: UserMemoryManager | null = null;
let activityLogMemoryManager: ActivityLogMemoryManager | null = null;

/**
 * Initialize all global managers
 */
export async function initializeGlobalManagers(redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) {
    logger.info('🔧 Initializing global managers...');

    // Initialize User memory manager
    userMemoryManager = new UserMemoryManager();

    // Initialize User activity log memory manager
    activityLogMemoryManager = new ActivityLogMemoryManager();

    // Initialize Redis managers
    snapshotRedisManager = new SnapshotRedisManager(redisClient);

    // Initialize Slime ID manager first
    await slimeIdManager.initialize();

    logger.info('✅ Global managers initialized');
}

/**
 * Get snapshot redis manager (safe for use in other modules)
 */
export function getSnapshotRedisManager(): SnapshotRedisManager | null {
    return snapshotRedisManager;
}

/**
 * Get user memory manager (safe for use in other modules)
 */
export function getUserMemoryManager(): UserMemoryManager | null {
    return userMemoryManager;
}

/**
 * Get activity log memory manager (safe for use in other modules)
 */
export function getActivityLogMemoryManager(): ActivityLogMemoryManager | null {
    return activityLogMemoryManager;
}

/**
 * Get Slime ID manager (safe for use in other modules)
 */
export function getSlimeIDManager(): SlimeIDManager {
    return slimeIdManager;
}

// Add these helper functions to global-managers.ts
export function requireActivityLogMemoryManager(): ActivityLogMemoryManager {
    if (!activityLogMemoryManager) {
        throw new Error('ActivityLogMemoryManager not initialized');
    }
    return activityLogMemoryManager;
}

export function requireUserMemoryManager(): UserMemoryManager {
    if (!userMemoryManager) {
        throw new Error('UserMemoryManager not initialized');
    }
    return userMemoryManager;
}

export function requireSnapshotRedisManager(): SnapshotRedisManager {
    if (!snapshotRedisManager) {
        throw new Error('SnapshotRedisManager not initialized');
    }
    return snapshotRedisManager;
}

/**
 * Cleanup all managers (for graceful shutdown)
 */
export async function cleanupGlobalManagers(): Promise<void> {
    logger.info('🧹 Final cleanup of global managers...');

    try {
        // Only clear memory - flushing and snapshots should be done before this
        if (userMemoryManager) {
            logger.info("🗑️ Clearing user memory manager...");
            userMemoryManager.clear();
        }

        if (activityLogMemoryManager) {
            logger.info("🗑️ Clearing activity log memory manager...");
            activityLogMemoryManager.clear();
        }

        logger.info('✅ Global managers cleanup complete');
    } catch (error) {
        logger.error('❌ Error during manager cleanup:', error);
        throw error;
    }
}