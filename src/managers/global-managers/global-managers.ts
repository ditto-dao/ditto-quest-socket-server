import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { SnapshotRedisManager } from '../../redis/snapshot-redis';
import { logger } from '../../utils/logger';
import { ActivityLogMemoryManager } from '../memory/activity-log-memory-manager';
import { UserMemoryManager } from '../memory/user-memory-manager';
import { SlimeIDManager, slimeIdManager } from '../slime-id-memory-manager.ts/slime-id-memory-manager';
import { UserSessionManager } from '../memory/user-session-manager';
import { EfficiencyStatsRedisManager } from '../../redis/user-efficiency-stats-redis';
import { UserEfficiencyStatsMemoryManager } from '../memory/efficiency-stats-memory-manager';

// Global manager instances
let snapshotRedisManager: SnapshotRedisManager | null = null;
let userMemoryManager: UserMemoryManager | null = null;
let activityLogMemoryManager: ActivityLogMemoryManager | null = null;
let userSessionManager: UserSessionManager | null = null;
let efficiencyStatsRedisManager: EfficiencyStatsRedisManager | null = null;
let userEfficiencyStatsMemoryManager: UserEfficiencyStatsMemoryManager | null = null;

/**
 * Initialize all global managers
 */
export async function initializeGlobalManagers(redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) {
    logger.info('🔧 Initializing global managers...');

    // Initialize User Session Manager FIRST (it coordinates everything)
    userSessionManager = new UserSessionManager();

    // Initialize User memory manager
    userMemoryManager = new UserMemoryManager();

    // Initialize User activity log memory manager
    activityLogMemoryManager = new ActivityLogMemoryManager();

    // Initialize Redis managers
    snapshotRedisManager = new SnapshotRedisManager(redisClient);
    efficiencyStatsRedisManager = new EfficiencyStatsRedisManager(redisClient);

    // Initialize efficiency stats memory manager (depends on Redis manager)
    userEfficiencyStatsMemoryManager = new UserEfficiencyStatsMemoryManager(efficiencyStatsRedisManager);

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
 * Get user session manager (safe for use in other modules)
 */
export function getUserSessionManager(): UserSessionManager | null {
    return userSessionManager;
}

/**
 * Get efficiency stats redis manager (safe for use in other modules)
 */
export function getEfficiencyStatsRedisManager(): EfficiencyStatsRedisManager | null {
    return efficiencyStatsRedisManager;
}

/**
 * Get user efficiency stats memory manager (safe for use in other modules)
 */
export function getUserEfficiencyStatsMemoryManager(): UserEfficiencyStatsMemoryManager | null {
    return userEfficiencyStatsMemoryManager;
}

/**
 * Get Slime ID manager (safe for use in other modules)
 */
export function getSlimeIDManager(): SlimeIDManager {
    return slimeIdManager;
}

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
 * Require user session manager (safe for use in other modules)
 */
export function requireUserSessionManager(): UserSessionManager {
    if (!userSessionManager) {
        throw new Error('UserSessionManager not initialized');
    }
    return userSessionManager;
}

/**
 * Require efficiency stats redis manager (safe for use in other modules)
 */
export function requireEfficiencyStatsRedisManager(): EfficiencyStatsRedisManager {
    if (!efficiencyStatsRedisManager) {
        throw new Error('EfficiencyStatsRedisManager not initialized');
    }
    return efficiencyStatsRedisManager;
}

/**
 * Require user efficiency stats memory manager (safe for use in other modules)
 */
export function requireUserEfficiencyStatsMemoryManager(): UserEfficiencyStatsMemoryManager {
    if (!userEfficiencyStatsMemoryManager) {
        throw new Error('UserEfficiencyStatsMemoryManager not initialized');
    }
    return userEfficiencyStatsMemoryManager;
}

/**
 * Cleanup all managers (for graceful shutdown)
 */
export async function cleanupGlobalManagers(): Promise<void> {
    logger.info('🧹 Final cleanup of global managers...');

    try {
        // Emergency cleanup all sessions first
        if (userSessionManager) {
            logger.info("🚨 Emergency cleanup of all user sessions...");
            await userSessionManager.emergencyCleanupAllSessions(async (userId) => {
                // Simple cleanup - just return true since memory manager will handle the rest
                return true;
            });
        }

        // Only clear memory - flushing and snapshots should be done before this
        if (userMemoryManager) {
            logger.info("🗑️ Clearing user memory manager...");
            userMemoryManager.clear();
        }

        if (activityLogMemoryManager) {
            logger.info("🗑️ Clearing activity log memory manager...");
            activityLogMemoryManager.clear();
        }

        if (userEfficiencyStatsMemoryManager) {
            logger.info("🗑️ Clearing user efficiency stats memory manager...");
            userEfficiencyStatsMemoryManager.clear();
        }

        logger.info('✅ Global managers cleanup complete');
    } catch (error) {
        logger.error('❌ Error during manager cleanup:', error);
        throw error;
    }
}