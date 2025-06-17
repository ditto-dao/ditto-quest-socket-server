import { prisma } from './client';
import { logger } from '../utils/logger';
import { FullUserData, getUserData } from './user-service';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { snapshotMetrics } from '../workers/snapshot/snapshot-metrics';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export enum SnapshotTrigger {
    // Immediate (1-5 seconds)
    EQUIPMENT_EQUIPPED = 'equipment_equipped',
    EQUIPMENT_UNEQUIPPED = 'equipment_unequipped',
    SLIME_EQUIPPED = 'slime_equipped',
    SLIME_UNEQUIPPED = 'slime_unequipped',
    LEVEL_UP = 'level_up',
    SKILL_POINTS_SPENT = 'skill_points_spent',
    HP_LEVEL_UP = 'hp_level_up',

    // Session (30-60 seconds)
    COMBAT_REWARDS = 'combat_rewards',
    CRAFTING_COMPLETE = 'crafting_complete',
    FARMING_COMPLETE = 'farming_complete',
    INVENTORY_CHANGE = 'inventory_change',
    GOLD_CHANGE = 'gold_change',
    EXP_GAIN = 'exp_gain',
    SLIME_GACHA = 'slime_gacha',
    SLIME_BREEDING = 'slime_breeding',

    // Periodic (5-15 minutes)
    MISSION_PROGRESS = 'mission_progress',
    LEADERBOARD_UPDATE = 'leaderboard_update',
    REFERRAL_EARNINGS = 'referral_earnings',
    ACCOMPLISHMENT_PROGRESS = 'accomplishment_progress',

    // Logout (immediate)
    SESSION_END = 'session_end',
    FORCED_REFRESH = 'forced_refresh'
}

interface TriggerConfig {
    delay: number;
    priority: number;
    status: string;
}

const TRIGGER_CONFIGS: Record<SnapshotTrigger, TriggerConfig> = {
    // Immediate triggers
    [SnapshotTrigger.EQUIPMENT_EQUIPPED]: { delay: 2000, priority: 100, status: 'stale_immediate' },
    [SnapshotTrigger.EQUIPMENT_UNEQUIPPED]: { delay: 2000, priority: 100, status: 'stale_immediate' },
    [SnapshotTrigger.SLIME_EQUIPPED]: { delay: 2000, priority: 95, status: 'stale_immediate' },
    [SnapshotTrigger.SLIME_UNEQUIPPED]: { delay: 2000, priority: 95, status: 'stale_immediate' },
    [SnapshotTrigger.LEVEL_UP]: { delay: 1000, priority: 90, status: 'stale_immediate' },
    [SnapshotTrigger.SKILL_POINTS_SPENT]: { delay: 2000, priority: 85, status: 'stale_immediate' },
    [SnapshotTrigger.HP_LEVEL_UP]: { delay: 1000, priority: 90, status: 'stale_immediate' },

    // Session triggers
    [SnapshotTrigger.COMBAT_REWARDS]: { delay: 30000, priority: 50, status: 'stale_session' },
    [SnapshotTrigger.CRAFTING_COMPLETE]: { delay: 45000, priority: 40, status: 'stale_session' },
    [SnapshotTrigger.FARMING_COMPLETE]: { delay: 60000, priority: 35, status: 'stale_session' },
    [SnapshotTrigger.INVENTORY_CHANGE]: { delay: 30000, priority: 30, status: 'stale_session' },
    [SnapshotTrigger.GOLD_CHANGE]: { delay: 45000, priority: 25, status: 'stale_session' },
    [SnapshotTrigger.EXP_GAIN]: { delay: 30000, priority: 40, status: 'stale_session' },
    [SnapshotTrigger.SLIME_GACHA]: { delay: 15000, priority: 60, status: 'stale_session' },
    [SnapshotTrigger.SLIME_BREEDING]: { delay: 15000, priority: 55, status: 'stale_session' },

    // Periodic triggers
    [SnapshotTrigger.MISSION_PROGRESS]: { delay: 300000, priority: 15, status: 'stale_periodic' },
    [SnapshotTrigger.LEADERBOARD_UPDATE]: { delay: 600000, priority: 10, status: 'stale_periodic' },
    [SnapshotTrigger.REFERRAL_EARNINGS]: { delay: 900000, priority: 5, status: 'stale_periodic' },
    [SnapshotTrigger.ACCOMPLISHMENT_PROGRESS]: { delay: 300000, priority: 12, status: 'stale_periodic' },

    // Immediate logout triggers
    [SnapshotTrigger.SESSION_END]: { delay: 0, priority: 200, status: 'stale_immediate' },
    [SnapshotTrigger.FORCED_REFRESH]: { delay: 0, priority: 150, status: 'stale_immediate' }
};

class SnapshotManager {

    async markStale(userId: string, trigger: SnapshotTrigger): Promise<void> {
        try {
            const config = TRIGGER_CONFIGS[trigger];

            await prisma.userSnapshot.upsert({
                where: { userId },
                update: {
                    status: config.status,
                    staleSince: new Date(),
                    priorityScore: config.priority
                },
                create: {
                    userId,
                    snapshotData: '{}', // Will be populated on first regen
                    status: config.status,
                    staleSince: new Date(),
                    priorityScore: config.priority
                }
            });

            // Schedule regeneration if not immediate
            if (config.delay > 0) {
                setTimeout(() => this.scheduleRegeneration(userId), config.delay);
            } else {
                // Immediate regeneration
                await this.regenerateSnapshot(userId);
            }

            logger.info(`📸 Marked snapshot stale for user ${userId}, trigger: ${trigger}`);
        } catch (error) {
            logger.error(`❌ Failed to mark snapshot stale: ${error}`);
        }
    }

    private parseUserDataDates(userData: FullUserData): FullUserData {
        // Convert string dates back to Date objects
        if (userData.lastBattleEndTimestamp && typeof userData.lastBattleEndTimestamp === 'string') {
            userData.lastBattleEndTimestamp = new Date(userData.lastBattleEndTimestamp);
        }

        // Parse createdAt dates in inventory
        if (userData.inventory) {
            userData.inventory.forEach(item => {
                if (item.createdAt && typeof item.createdAt === 'string') {
                    item.createdAt = new Date(item.createdAt);
                }
            });
        }

        // Parse createdAt dates in equipped items
        const equippedItems = [userData.hat, userData.armour, userData.weapon, userData.shield, userData.cape, userData.necklace];
        equippedItems.forEach(item => {
            if (item?.createdAt && typeof item.createdAt === 'string') {
                item.createdAt = new Date(item.createdAt);
            }
        });

        return userData;
    }

    async loadUserSnapshot(userId: string): Promise<FullUserData | null> {
        try {
            const snapshot = await prisma.userSnapshot.findUnique({
                where: { userId }
            });

            if (!snapshot || snapshot.status !== 'fresh') {
                logger.info(`📸 No fresh snapshot for user ${userId}, falling back to full query`);
                return null;
            }

            // Try compressed first, then uncompressed
            let userData: string;
            if (snapshot.compressedData) {
                const decompressed = await gunzipAsync(snapshot.compressedData);
                userData = decompressed.toString();
            } else {
                userData = snapshot.snapshotData;
            }

            const parsedData = JSON.parse(userData) as FullUserData;

            // ✅ FIX: Parse dates before returning
            const fixedData = this.parseUserDataDates(parsedData);

            logger.info(`📸 Loaded user ${userId} from snapshot (${userData.length} chars)`);

            return fixedData;
        } catch (error) {
            logger.error(`❌ Failed to load snapshot for user ${userId}: ${error}`);
            return null;
        }
    }

    async regenerateSnapshot(userId: string): Promise<void> {
        try {
            // Mark as regenerating
            await prisma.userSnapshot.update({
                where: { userId },
                data: { status: 'regenerating' }
            });

            // Get full user data (expensive operation)
            const fullUserData = await getUserData(userId);
            if (!fullUserData) {
                throw new Error(`User ${userId} not found during snapshot regeneration`);
            }

            // Serialize
            const jsonData = JSON.stringify(fullUserData);

            // Compress if large enough
            let compressedData: Buffer | null = null;
            let uncompressedSize: number | null = null;

            if (jsonData.length > 10000) { // Compress if > 10KB
                compressedData = await gzipAsync(jsonData);
                uncompressedSize = jsonData.length;
            }

            // Store snapshot
            await prisma.userSnapshot.update({
                where: { userId },
                data: {
                    snapshotData: compressedData ? '' : jsonData, // Empty if compressed
                    compressedData,
                    uncompressedSize,
                    status: 'fresh',
                    lastRegeneration: new Date(),
                    priorityScore: 0,
                    version: { increment: 1 }
                }
            });

            if (compressedData && uncompressedSize) {
                snapshotMetrics.recordCompression(compressedData.length, uncompressedSize);
            }

            logger.info(`📸 Regenerated snapshot for user ${userId} (${jsonData.length} chars, compressed: ${!!compressedData})`);
        } catch (error) {
            // Reset status on failure
            await prisma.userSnapshot.update({
                where: { userId },
                data: { status: 'stale_session' }
            });
            logger.error(`❌ Failed to regenerate snapshot for user ${userId}: ${error}`);
            throw error;
        }
    }

    private async scheduleRegeneration(userId: string): Promise<void> {
        // Add to background job queue
        // For now, just regenerate immediately
        await this.regenerateSnapshot(userId);
    }
}

export const snapshotManager = new SnapshotManager();