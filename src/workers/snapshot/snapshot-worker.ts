import { prisma } from '../../sql-services/client';
import { snapshotManager } from '../../sql-services/snapshot-manager-service';
import { logger } from '../../utils/logger';

class SnapshotWorker {
    private isRunning = false;
    private intervalId: NodeJS.Timeout | null = null;

    start(intervalMs: number = 30000) { // Run every 30 seconds
        if (this.isRunning) return;

        this.isRunning = true;
        this.intervalId = setInterval(() => {
            this.processQueue().catch(err => {
                logger.error(`Snapshot worker error: ${err}`);
            });
        }, intervalMs);

        logger.info('📸 Snapshot worker started');
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('📸 Snapshot worker stopped');
    }

    private async processQueue() {
        try {
            // Get stale snapshots that need regeneration
            const staleSnapshots = await prisma.userSnapshot.findMany({
                where: {
                    status: { in: ['stale_immediate', 'stale_session', 'stale_periodic'] }
                },
                orderBy: [
                    { priorityScore: 'desc' },
                    { staleSince: 'asc' }
                ],
                take: 20 // Process in batches
            });

            if (staleSnapshots.length === 0) return;

            logger.info(`📸 Processing ${staleSnapshots.length} stale snapshots`);

            for (const snapshot of staleSnapshots) {
                try {
                    await snapshotManager.regenerateSnapshot(snapshot.userId);
                } catch (error) {
                    logger.error(`Failed to regenerate snapshot for user ${snapshot.userId}: ${error}`);
                }
            }
        } catch (error) {
            logger.error(`Snapshot worker queue processing failed: ${error}`);
        }
    }
}

export const snapshotWorker = new SnapshotWorker();