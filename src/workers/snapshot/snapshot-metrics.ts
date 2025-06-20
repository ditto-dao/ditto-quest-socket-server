import { requireSnapshotRedisManager } from "../../managers/global-managers/global-managers";
import { prisma } from "../../sql-services/client";
import { logger } from "../../utils/logger";

interface SnapshotMetrics {
    snapshotHitRate: number;        // % of successful snapshot loads
    avgSnapshotLoadTime: number;    // ms
    avgFullQueryTime: number;       // ms  
    dailyRegenerations: number;     // count
    queueBacklog: number;           // pending snapshots
    compressionRatio: number;       // compressed/uncompressed ratio
    totalUsers: number;
    snapshotsStored: number;
    redisStats: {
        totalSnapshots: number;
        staleSnapshots: number;
        freshSnapshots: number;
    };
}

class SnapshotMetricsCollector {
    private metrics = {
        snapshotHits: 0,
        snapshotMisses: 0,
        snapshotLoadTimes: [] as number[],
        fullQueryTimes: [] as number[],
        compressionSamples: [] as { compressed: number; uncompressed: number }[],
        regenerationsToday: 0,
        regenerationStartTime: new Date()
    };

    // Call this from getUserDataWithSnapshot
    recordSnapshotHit(loadTimeMs: number) {
        this.metrics.snapshotHits++;
        this.metrics.snapshotLoadTimes.push(loadTimeMs);
    }

    // Call this when falling back to full query
    recordSnapshotMiss(fullQueryTimeMs: number) {
        this.metrics.snapshotMisses++;
        this.metrics.fullQueryTimes.push(fullQueryTimeMs);
    }

    // Call this during snapshot regeneration
    recordCompression(compressedSize: number, uncompressedSize: number) {
        this.metrics.compressionSamples.push({
            compressed: compressedSize,
            uncompressed: uncompressedSize
        });
    }

    // Call this when a snapshot is regenerated
    recordRegeneration() {
        this.metrics.regenerationsToday++;
    }

    async getMetrics(): Promise<SnapshotMetrics> {
        const [
            redisStats,
            totalUsers,
            compressionStats
        ] = await Promise.all([
            this.getRedisStats(),
            this.getTotalUsers(),
            this.getCompressionStats()
        ]);

        const totalAttempts = this.metrics.snapshotHits + this.metrics.snapshotMisses;
        const hitRate = totalAttempts > 0 ? (this.metrics.snapshotHits / totalAttempts) * 100 : 0;

        const avgSnapshotTime = this.metrics.snapshotLoadTimes.length > 0
            ? this.metrics.snapshotLoadTimes.reduce((a, b) => a + b, 0) / this.metrics.snapshotLoadTimes.length
            : 0;

        const avgFullQueryTime = this.metrics.fullQueryTimes.length > 0
            ? this.metrics.fullQueryTimes.reduce((a, b) => a + b, 0) / this.metrics.fullQueryTimes.length
            : 0;

        return {
            snapshotHitRate: Math.round(hitRate * 100) / 100,
            avgSnapshotLoadTime: Math.round(avgSnapshotTime * 100) / 100,
            avgFullQueryTime: Math.round(avgFullQueryTime * 100) / 100,
            dailyRegenerations: this.getDailyRegenerations(),
            queueBacklog: redisStats.staleSnapshots, // Stale snapshots are the backlog
            compressionRatio: compressionStats.ratio,
            totalUsers,
            snapshotsStored: redisStats.totalSnapshots,
            redisStats
        };
    }

    private async getRedisStats(): Promise<{
        totalSnapshots: number;
        staleSnapshots: number;
        freshSnapshots: number;
    }> {
        try {
            // Get stats from Redis manager
            const snapshotRedisManager = requireSnapshotRedisManager();

            return await snapshotRedisManager.getSnapshotStats();
        } catch (error) {
            logger.error('❌ Failed to get Redis stats:', error);
            return { totalSnapshots: 0, staleSnapshots: 0, freshSnapshots: 0 };
        }
    }

    private getDailyRegenerations(): number {
        // Check if we need to reset daily counter
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfRecordedDay = new Date(
            this.metrics.regenerationStartTime.getFullYear(),
            this.metrics.regenerationStartTime.getMonth(),
            this.metrics.regenerationStartTime.getDate()
        );

        // If it's a new day, reset the counter
        if (startOfToday > startOfRecordedDay) {
            this.metrics.regenerationsToday = 0;
            this.metrics.regenerationStartTime = now;
        }

        return this.metrics.regenerationsToday;
    }

    private async getTotalUsers(): Promise<number> {
        return await prisma.user.count();
    }

    private async getCompressionStats(): Promise<{ ratio: number }> {
        if (this.metrics.compressionSamples.length === 0) {
            return { ratio: 0 };
        }

        const totalCompressed = this.metrics.compressionSamples.reduce((sum, s) => sum + s.compressed, 0);
        const totalUncompressed = this.metrics.compressionSamples.reduce((sum, s) => sum + s.uncompressed, 0);

        const ratio = totalUncompressed > 0 ? totalCompressed / totalUncompressed : 0;
        return { ratio: Math.round(ratio * 100) / 100 };
    }

    // Reset metrics (call this hourly, but preserve daily regenerations)
    reset() {
        const dailyRegens = this.metrics.regenerationsToday;
        const regenStartTime = this.metrics.regenerationStartTime;

        this.metrics = {
            snapshotHits: 0,
            snapshotMisses: 0,
            snapshotLoadTimes: [],
            fullQueryTimes: [],
            compressionSamples: [],
            regenerationsToday: dailyRegens, // Preserve daily count
            regenerationStartTime: regenStartTime // Preserve start time
        };
    }

    // Log current metrics to console/dashboard
    async logMetrics() {
        const metrics = await this.getMetrics();

        logger.info('📊 Snapshot System Metrics (Redis-based):');
        logger.info(`   Hit Rate: ${metrics.snapshotHitRate}%`);
        logger.info(`   Avg Snapshot Load: ${metrics.avgSnapshotLoadTime}ms`);
        logger.info(`   Avg Full Query: ${metrics.avgFullQueryTime}ms`);
        logger.info(`   Daily Regenerations: ${metrics.dailyRegenerations}`);
        logger.info(`   Queue Backlog: ${metrics.queueBacklog}`);
        logger.info(`   Compression Ratio: ${metrics.compressionRatio}`);
        logger.info(`   Redis Stats:`);
        logger.info(`     - Total Snapshots: ${metrics.redisStats.totalSnapshots}`);
        logger.info(`     - Fresh: ${metrics.redisStats.freshSnapshots}`);
        logger.info(`     - Stale: ${metrics.redisStats.staleSnapshots}`);
        logger.info(`   Users: ${metrics.snapshotsStored}/${metrics.totalUsers} have snapshots`);

        // Performance comparison
        if (metrics.avgSnapshotLoadTime > 0 && metrics.avgFullQueryTime > 0) {
            const speedup = metrics.avgFullQueryTime / metrics.avgSnapshotLoadTime;
            logger.info(`   🚀 Speedup: ${speedup.toFixed(2)}x faster with snapshots`);
        }
    }

    // Helper method to get performance summary
    async getPerformanceSummary(): Promise<{
        speedImprovement: number;
        cacheEfficiency: number;
        backlogStatus: 'healthy' | 'warning' | 'critical';
    }> {
        const metrics = await this.getMetrics();

        const speedImprovement = metrics.avgFullQueryTime > 0 && metrics.avgSnapshotLoadTime > 0
            ? metrics.avgFullQueryTime / metrics.avgSnapshotLoadTime
            : 0;

        const cacheEfficiency = metrics.snapshotHitRate;

        let backlogStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
        if (metrics.queueBacklog > 100) backlogStatus = 'warning';
        if (metrics.queueBacklog > 500) backlogStatus = 'critical';

        return {
            speedImprovement,
            cacheEfficiency,
            backlogStatus
        };
    }
}

export const snapshotMetrics = new SnapshotMetricsCollector();