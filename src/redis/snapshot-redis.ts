import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis";
import { logger } from "../utils/logger";
import { gzip as gzipCallback, gunzip as gunzipCallback } from 'zlib';
import { promisify } from 'util';
import { FullUserData } from "../sql-services/user-service";

const gzipAsync = promisify(gzipCallback);
const gunzipAsync = promisify(gunzipCallback);

export interface SnapshotMetadata {
    userId: string;
    lastUpdated: number; // timestamp
    version: number;
    uncompressedSize?: number;
    isCompressed: boolean;
}

// Redis key patterns
const SNAPSHOT_KEY = (userId: string) => `user:snapshot:${userId}`;
const SNAPSHOT_META_KEY = (userId: string) => `user:snapshot:meta:${userId}`;

export class SnapshotRedisManager {
    constructor(private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) { }

    /**
     * Store a snapshot in Redis with compression if large enough
     */
    async storeSnapshot(userId: string, userData: any): Promise<void> {
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

            // Simple metadata - no stale tracking
            const metadata = {
                userId: userId,
                lastUpdated: Date.now().toString(),
                version: '1',
                uncompressedSize: uncompressedSize ? uncompressedSize.toString() : '',
                isCompressed: isCompressed.toString()
            };

            // Store both data and metadata
            const pipeline = this.redisClient.multi();
            pipeline.set(SNAPSHOT_KEY(userId), dataToStore);
            pipeline.hSet(SNAPSHOT_META_KEY(userId), metadata);
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
                lastUpdated: parseInt(metadataObj.lastUpdated),
                version: parseInt(metadataObj.version),
                uncompressedSize: metadataObj.uncompressedSize ? parseInt(metadataObj.uncompressedSize) : undefined,
                isCompressed: metadataObj.isCompressed === 'true'
            };

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
     * Delete a snapshot completely
     */
    async deleteSnapshot(userId: string): Promise<void> {
        try {
            const pipeline = this.redisClient.multi();
            pipeline.del(SNAPSHOT_KEY(userId));
            pipeline.del(SNAPSHOT_META_KEY(userId));
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
                lastUpdated: parseInt(metadataObj.lastUpdated),
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
    }> {
        try {
            // Get all snapshot metadata keys
            const metaKeys = await this.redisClient.keys('user:snapshot:meta:*');
            const totalSnapshots = metaKeys.length;

            return {
                totalSnapshots
            };
        } catch (error) {
            logger.error(`❌ Failed to get snapshot stats: ${error}`);
            return { totalSnapshots: 0 };
        }
    }
}