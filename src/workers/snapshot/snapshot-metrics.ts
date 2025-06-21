import { requireSnapshotRedisManager } from "../../managers/global-managers/global-managers";
import { prisma } from "../../sql-services/client";
import { logger } from "../../utils/logger";

interface SnapshotMetrics {
    snapshotHitRate: number;        // % of successful snapshot loads
    avgSnapshotLoadTime: number;    // ms
    avgFullQueryTime: number;       // ms  
    compressionRatio: number;       // compressed/uncompressed ratio
    totalUsers: number;
    totalSnapshots: number;
}

class SnapshotMetricsCollector {
    private metrics = {
        snapshotHits: 0,
        snapshotMisses: 0,
        snapshotLoadTimes: [] as number[],
        fullQueryTimes: [] as number[],
        compressionSamples: [] as { compressed: number; uncompressed: number }[]
    };

    // Call this from getUserDataWithSnapshot when snapshot loads successfully
    recordSnapshotHit(loadTimeMs: number) {
        this.metrics.snapshotHits++;
        this.metrics.snapshotLoadTimes.push(loadTimeMs);
    }

    // Call this when falling back to full database query
    recordSnapshotMiss(fullQueryTimeMs: number) {
        this.metrics.snapshotMisses++;
        this.metrics.fullQueryTimes.push(fullQueryTimeMs);
    }

    // Call this during snapshot storage for compression stats
    recordCompression(compressedSize: number, uncompressedSize: number) {
        this.metrics.compressionSamples.push({
            compressed: compressedSize,
            uncompressed: uncompressedSize
        });
    }

    async getMetrics(): Promise<SnapshotMetrics> {
        const [
            totalUsers,
            redisStats,
            compressionStats
        ] = await Promise.all([
            this.getTotalUsers(),
            this.getRedisStats(),
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
            compressionRatio: compressionStats.ratio,
            totalUsers,
            totalSnapshots: redisStats.totalSnapshots
        };
    }

    private async getTotalUsers(): Promise<number> {
        try {
            return await prisma.user.count();
        } catch (error) {
            logger.error(`Failed to get total users: ${error}`);
            return 0;
        }
    }

    private async getRedisStats(): Promise<{ totalSnapshots: number }> {
        try {
            const snapshotRedisManager = requireSnapshotRedisManager();
            return await snapshotRedisManager.getSnapshotStats();
        } catch (error) {
            logger.error(`Failed to get Redis stats: ${error}`);
            return { totalSnapshots: 0 };
        }
    }

    private getCompressionStats(): { ratio: number } {
        if (this.metrics.compressionSamples.length === 0) {
            return { ratio: 0 };
        }

        const totalCompressed = this.metrics.compressionSamples.reduce((sum, s) => sum + s.compressed, 0);
        const totalUncompressed = this.metrics.compressionSamples.reduce((sum, s) => sum + s.uncompressed, 0);

        const ratio = totalUncompressed > 0 ? totalCompressed / totalUncompressed : 0;
        return { ratio: Math.round(ratio * 100) / 100 };
    }

    // Reset metrics (call this hourly)
    reset() {
        this.metrics = {
            snapshotHits: 0,
            snapshotMisses: 0,
            snapshotLoadTimes: [],
            fullQueryTimes: [],
            compressionSamples: []
        };
    }

    // Log current metrics to console
    async logMetrics() {
        const metrics = await this.getMetrics();

        logger.info('📊 Snapshot System Metrics:');
        logger.info(`   Hit Rate: ${metrics.snapshotHitRate}%`);
        logger.info(`   Avg Snapshot Load: ${metrics.avgSnapshotLoadTime}ms`);
        logger.info(`   Avg Full Query: ${metrics.avgFullQueryTime}ms`);
        logger.info(`   Compression Ratio: ${metrics.compressionRatio}`);
        logger.info(`   Total Snapshots: ${metrics.totalSnapshots}`);
        logger.info(`   Total Users: ${metrics.totalUsers}`);

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
    }> {
        const metrics = await this.getMetrics();

        const speedImprovement = metrics.avgFullQueryTime > 0 && metrics.avgSnapshotLoadTime > 0
            ? metrics.avgFullQueryTime / metrics.avgSnapshotLoadTime
            : 0;

        const cacheEfficiency = metrics.snapshotHitRate;

        return {
            speedImprovement,
            cacheEfficiency
        };
    }
}

export const snapshotMetrics = new SnapshotMetricsCollector();