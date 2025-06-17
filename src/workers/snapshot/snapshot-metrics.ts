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
}

class SnapshotMetricsCollector {
    private metrics = {
        snapshotHits: 0,
        snapshotMisses: 0,
        snapshotLoadTimes: [] as number[],
        fullQueryTimes: [] as number[],
        compressionSamples: [] as { compressed: number; uncompressed: number }[]
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

    async getMetrics(): Promise<SnapshotMetrics> {
        const [
            queueBacklog,
            dailyRegens,
            totalUsers,
            snapshotsStored,
            compressionStats
        ] = await Promise.all([
            this.getQueueBacklog(),
            this.getDailyRegenerations(),
            this.getTotalUsers(),
            this.getSnapshotsStored(),
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
            dailyRegenerations: dailyRegens,
            queueBacklog,
            compressionRatio: compressionStats.ratio,
            totalUsers,
            snapshotsStored
        };
    }

    private async getQueueBacklog(): Promise<number> {
        return await prisma.userSnapshot.count({
            where: {
                status: { in: ['stale_immediate', 'stale_session', 'stale_periodic'] }
            }
        });
    }

    private async getDailyRegenerations(): Promise<number> {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        return await prisma.userSnapshot.count({
            where: {
                lastRegeneration: {
                    gte: yesterday
                }
            }
        });
    }

    private async getTotalUsers(): Promise<number> {
        return await prisma.user.count();
    }

    private async getSnapshotsStored(): Promise<number> {
        return await prisma.userSnapshot.count();
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

    // Reset metrics (call this daily/hourly)
    reset() {
        this.metrics = {
            snapshotHits: 0,
            snapshotMisses: 0,
            snapshotLoadTimes: [],
            fullQueryTimes: [],
            compressionSamples: []
        };
    }

    // Log current metrics to console/dashboard
    async logMetrics() {
        const metrics = await this.getMetrics();

        logger.info('📊 Snapshot System Metrics:');
        logger.info(`   Hit Rate: ${metrics.snapshotHitRate}%`);
        logger.info(`   Avg Snapshot Load: ${metrics.avgSnapshotLoadTime}ms`);
        logger.info(`   Avg Full Query: ${metrics.avgFullQueryTime}ms`);
        logger.info(`   Daily Regenerations: ${metrics.dailyRegenerations}`);
        logger.info(`   Queue Backlog: ${metrics.queueBacklog}`);
        logger.info(`   Compression Ratio: ${metrics.compressionRatio}`);
        logger.info(`   Users: ${metrics.snapshotsStored}/${metrics.totalUsers} have snapshots`);
    }
}

export const snapshotMetrics = new SnapshotMetricsCollector();