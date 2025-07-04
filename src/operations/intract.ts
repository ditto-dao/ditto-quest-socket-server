import { requireSnapshotRedisManager, requireUserMemoryManager } from "../managers/global-managers/global-managers";
import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

export async function peekUserLevel(telegramId: string): Promise<number | null> {
    try {
        const userMemoryManager = requireUserMemoryManager();
        const snapshotRedisManager = requireSnapshotRedisManager();

        // 1. Check memory first (if user already loaded)
        if (userMemoryManager.isReady()) {
            const memoryUser = userMemoryManager.getUser(telegramId);
            if (memoryUser) {
                logger.debug(`✅ User ${telegramId} level from memory: ${memoryUser.level}`);
                return memoryUser.level;
            }
        }

        // 2. Try snapshot (read-only, don't store)
        const snapshotStart = Date.now();
        const snapshotData = await snapshotRedisManager.loadSnapshot(telegramId);

        if (snapshotData) {
            const loadTime = Date.now() - snapshotStart;
            logger.debug(`📸 Peeked user ${telegramId} level from snapshot in ${loadTime}ms: ${snapshotData.level}`);
            // DON'T store in memory - just return the level
            return snapshotData.level;
        }

        // 3. Fallback to DB query (level only)
        const queryStart = Date.now();
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: { level: true }
        });
        const queryTime = Date.now() - queryStart;

        if (user) {
            logger.debug(`💾 Peeked user ${telegramId} level from DB in ${queryTime}ms: ${user.level}`);
            return user.level;
        }

        logger.debug(`❌ User ${telegramId} not found`);
        return null;

    } catch (error) {
        logger.error(`❌ Failed to peek user level for ${telegramId}:`, error);
        return null;
    }
}