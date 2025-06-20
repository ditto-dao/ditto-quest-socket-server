import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
import { logger } from "../utils/logger";
import { gzip as gzipCallback, gunzip as gunzipCallback } from 'zlib';
import { promisify } from 'util';
import { FullUserData } from "../sql-services/user-service";

const gzipAsync = promisify(gzipCallback);
const gunzipAsync = promisify(gunzipCallback);

export type SnapshotStatus = 'fresh' | 'stale_immediate' | 'stale_session' | 'stale_periodic' | 'regenerating';

export interface SnapshotMetadata {
    userId: string;
    status: SnapshotStatus;
    staleSince: number | null; // timestamp
    lastRegeneration: number; // timestamp
    priorityScore: number;
    version: number;
    uncompressedSize?: number;
    isCompressed: boolean;
}

export interface SnapshotData {
    metadata: SnapshotMetadata;
    userData: string; // JSON string of user data
}

// Redis key patterns
const SNAPSHOT_KEY = (userId: string) => `user:snapshot:${userId}`;
const SNAPSHOT_META_KEY = (userId: string) => `user:snapshot:meta:${userId}`;
const STALE_SNAPSHOTS_SET = 'snapshots:stale'; // Set of userIds with stale snapshots

export class SnapshotRedisManager {
    constructor(private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) { }

    /**
     * Store a snapshot in Redis with compression if large enough
     */
    async storeSnapshot(userId: string, userData: any, status: SnapshotStatus = 'fresh'): Promise<void> {
        try {
            const jsonData = JSON.stringify(userData);
            let dataToStore = jsonData;
            let isCompressed = false;
            let uncompressedSize: number | undefined;

            // Compress if larger than 10KB
            if (jsonData.length > 10000) {
                const compressed = await gzipAsync(jsonData);
                dataToStore = compressed.toString('base64');
                isCompressed = true;
                uncompressedSize = jsonData.length;
            }

            // ✅ Convert all metadata values to strings for Redis
            const metadata = {
                userId: userId,
                status: status,
                staleSince: status.startsWith('stale') ? Date.now().toString() : '',
                lastRegeneration: Date.now().toString(),
                priorityScore: '0',
                version: '1',
                uncompressedSize: uncompressedSize ? uncompressedSize.toString() : '',
                isCompressed: isCompressed.toString()
            };

            // Store both data and metadata
            const pipeline = this.redisClient.multi();
            pipeline.set(SNAPSHOT_KEY(userId), dataToStore);
            pipeline.hSet(SNAPSHOT_META_KEY(userId), metadata);  // ✅ Now all strings

            // If stale, add to stale set
            if (status.startsWith('stale')) {
                pipeline.sAdd(STALE_SNAPSHOTS_SET, userId);
            } else {
                pipeline.sRem(STALE_SNAPSHOTS_SET, userId);
            }

            await pipeline.exec();

            logger.info(`📸 Stored snapshot for user ${userId} (${jsonData.length} chars, compressed: ${isCompressed})`);
        } catch (error) {
            logger.error(`❌ Failed to store snapshot for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Load a snapshot from Redis
     */
    async loadSnapshot(userId: string): Promise<FullUserData | null> {
        try {
            const [snapshotData, metadataObj] = await Promise.all([
                this.redisClient.get(SNAPSHOT_KEY(userId)),
                this.redisClient.hGetAll(SNAPSHOT_META_KEY(userId))
            ]);

            if (!snapshotData || !metadataObj || Object.keys(metadataObj).length === 0) {
                logger.info(`📸 No snapshot found for user ${userId}`);
                return null;
            }

            // Parse metadata
            const metadata: SnapshotMetadata = {
                userId: metadataObj.userId,
                status: metadataObj.status as SnapshotStatus,
                staleSince: metadataObj.staleSince ? parseInt(metadataObj.staleSince) : null,
                lastRegeneration: parseInt(metadataObj.lastRegeneration),
                priorityScore: parseInt(metadataObj.priorityScore),
                version: parseInt(metadataObj.version),
                uncompressedSize: metadataObj.uncompressedSize ? parseInt(metadataObj.uncompressedSize) : undefined,
                isCompressed: metadataObj.isCompressed === 'true'
            };

            // Return null if snapshot is not fresh
            if (metadata.status !== 'fresh') {
                logger.info(`📸 Snapshot for user ${userId} is ${metadata.status}, skipping load`);
                return null;
            }

            // Decompress if needed
            let userData: string;
            if (metadata.isCompressed) {
                const compressedBuffer = Buffer.from(snapshotData, 'base64');
                const decompressed = await gunzipAsync(compressedBuffer);
                userData = decompressed.toString();
            } else {
                userData = snapshotData;
            }

            const parsedData = JSON.parse(userData) as FullUserData;
            logger.info(`📸 Loaded snapshot for user ${userId} (${userData.length} chars)`);

            return parsedData;
        } catch (error) {
            logger.error(`❌ Failed to load snapshot for user ${userId}: ${error}`);
            return null;
        }
    }

    /**
     * Mark a snapshot as stale with specific priority
     */
    async markSnapshotStale(userId: string, status: SnapshotStatus, priorityScore: number): Promise<void> {
        try {
            const metadata = await this.redisClient.hGetAll(SNAPSHOT_META_KEY(userId));

            if (Object.keys(metadata).length === 0) {
                // Create new metadata if it doesn't exist
                const newMetadata = {
                    userId: userId,
                    status: status,
                    staleSince: Date.now().toString(),
                    lastRegeneration: Date.now().toString(),
                    priorityScore: priorityScore.toString(),
                    version: '1',
                    isCompressed: 'false'
                };

                await this.redisClient.hSet(SNAPSHOT_META_KEY(userId), newMetadata);
            } else {
                // Update existing metadata
                await this.redisClient.hSet(SNAPSHOT_META_KEY(userId), {
                    status: status,
                    staleSince: Date.now().toString(),       // ✅ Convert to string
                    priorityScore: priorityScore.toString()  // ✅ Convert to string
                });
            }

            // Add to stale set
            await this.redisClient.sAdd(STALE_SNAPSHOTS_SET, userId);

            logger.info(`📸 Marked snapshot stale for user ${userId} (${status}, priority: ${priorityScore})`);
        } catch (error) {
            logger.error(`❌ Failed to mark snapshot stale for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Get all stale snapshots ordered by priority and staleness
     */
    async getStaleSnapshots(limit: number = 20): Promise<SnapshotMetadata[]> {
        try {
            const staleUserIds = await this.redisClient.sMembers(STALE_SNAPSHOTS_SET);

            if (staleUserIds.length === 0) {
                return [];
            }

            // Get metadata for all stale users
            const metadataPromises = staleUserIds.map(userId =>
                this.redisClient.hGetAll(SNAPSHOT_META_KEY(userId))
            );

            const metadataResults = await Promise.all(metadataPromises);

            // Parse and filter valid metadata
            const staleSnapshots: SnapshotMetadata[] = [];
            for (let i = 0; i < staleUserIds.length; i++) {
                const metadataObj = metadataResults[i];
                if (Object.keys(metadataObj).length === 0) continue;

                const metadata: SnapshotMetadata = {
                    userId: staleUserIds[i],
                    status: metadataObj.status as SnapshotStatus,
                    staleSince: metadataObj.staleSince ? parseInt(metadataObj.staleSince) : null,
                    lastRegeneration: parseInt(metadataObj.lastRegeneration),
                    priorityScore: parseInt(metadataObj.priorityScore),
                    version: parseInt(metadataObj.version),
                    uncompressedSize: metadataObj.uncompressedSize ? parseInt(metadataObj.uncompressedSize) : undefined,
                    isCompressed: metadataObj.isCompressed === 'true'
                };

                // Only include if actually stale
                if (metadata.status.startsWith('stale')) {
                    staleSnapshots.push(metadata);
                }
            }

            // Sort by priority (desc) then by staleSince (asc - oldest first)
            staleSnapshots.sort((a, b) => {
                if (a.priorityScore !== b.priorityScore) {
                    return b.priorityScore - a.priorityScore; // Higher priority first
                }
                const aStale = a.staleSince || 0;
                const bStale = b.staleSince || 0;
                return aStale - bStale; // Older first
            });

            return staleSnapshots.slice(0, limit);
        } catch (error) {
            logger.error(`❌ Failed to get stale snapshots: ${error}`);
            return [];
        }
    }

    /**
     * Update snapshot status after regeneration
     */
    async updateSnapshotStatus(userId: string, status: SnapshotStatus): Promise<void> {
        try {
            const updates: any = {
                status,
                lastRegeneration: Date.now().toString()
            };

            if (status === 'fresh') {
                updates.staleSince = '';
                updates.priorityScore = '0';
            } else if (status.startsWith('stale')) {
                updates.staleSince = Date.now().toString();
            }

            await this.redisClient.hSet(SNAPSHOT_META_KEY(userId), updates);

            // Update stale set
            if (status === 'fresh') {
                await this.redisClient.sRem(STALE_SNAPSHOTS_SET, userId);
            } else if (status.startsWith('stale')) {
                await this.redisClient.sAdd(STALE_SNAPSHOTS_SET, userId);
            }

            logger.info(`📸 Updated snapshot status for user ${userId}: ${status}`);
        } catch (error) {
            logger.error(`❌ Failed to update snapshot status for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Delete a snapshot completely
     */
    async deleteSnapshot(userId: string): Promise<void> {
        try {
            const pipeline = this.redisClient.multi();
            pipeline.del(SNAPSHOT_KEY(userId));
            pipeline.del(SNAPSHOT_META_KEY(userId));
            pipeline.sRem(STALE_SNAPSHOTS_SET, userId);
            await pipeline.exec();

            logger.info(`📸 Deleted snapshot for user ${userId}`);
        } catch (error) {
            logger.error(`❌ Failed to delete snapshot for user ${userId}: ${error}`);
            throw error;
        }
    }

    /**
     * Get snapshot metadata without loading the actual data
     */
    async getSnapshotMetadata(userId: string): Promise<SnapshotMetadata | null> {
        try {
            const metadataObj = await this.redisClient.hGetAll(SNAPSHOT_META_KEY(userId));

            if (Object.keys(metadataObj).length === 0) {
                return null;
            }

            return {
                userId: metadataObj.userId,
                status: metadataObj.status as SnapshotStatus,
                staleSince: metadataObj.staleSince ? parseInt(metadataObj.staleSince) : null,
                lastRegeneration: parseInt(metadataObj.lastRegeneration),
                priorityScore: parseInt(metadataObj.priorityScore),
                version: parseInt(metadataObj.version),
                uncompressedSize: metadataObj.uncompressedSize ? parseInt(metadataObj.uncompressedSize) : undefined,
                isCompressed: metadataObj.isCompressed === 'true'
            };
        } catch (error) {
            logger.error(`❌ Failed to get snapshot metadata for user ${userId}: ${error}`);
            return null;
        }
    }

    /**
     * Get stats about the snapshot system
     */
    async getSnapshotStats(): Promise<{
        totalSnapshots: number;
        staleSnapshots: number;
        freshSnapshots: number;
    }> {
        try {
            const staleCount = await this.redisClient.sCard(STALE_SNAPSHOTS_SET);

            // Get all snapshot metadata keys
            const metaKeys = await this.redisClient.keys('user:snapshot:meta:*');
            const totalSnapshots = metaKeys.length;
            const freshSnapshots = totalSnapshots - staleCount;

            return {
                totalSnapshots,
                staleSnapshots: staleCount,
                freshSnapshots
            };
        } catch (error) {
            logger.error(`❌ Failed to get snapshot stats: ${error}`);
            return { totalSnapshots: 0, staleSnapshots: 0, freshSnapshots: 0 };
        }
    }
}