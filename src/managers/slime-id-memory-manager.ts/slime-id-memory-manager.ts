import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

export class SlimeIDManager {
    private highestSlimeId: number = 0;
    private isInitialized: boolean = false;

    constructor() {}

    /**
     * Initialize by fetching highest IDs from database
     */
    async initialize(): Promise<void> {
        try {
            logger.info('🔢 Initializing IDManager...');

            // Get highest slime ID
            const highestSlime = await prisma.slime.findFirst({
                select: { id: true },
                orderBy: { id: 'desc' }
            });

            this.highestSlimeId = highestSlime?.id || 0;
            this.isInitialized = true;

            logger.info(`✅ IDManager initialized - Slime: ${this.highestSlimeId}`);
        } catch (error) {
            logger.error('❌ Failed to initialize IDManager:', error);
            throw error;
        }
    }

    /**
     * Check if manager is ready
     */
    isReady(): boolean {
        return this.isInitialized;
    }

    /**
     * Generate next real slime ID
     */
    getNextSlimeId(): number {
        if (!this.isInitialized) {
            throw new Error('IDManager not initialized');
        }

        this.highestSlimeId++;
        logger.debug(`🆔 Generated slime ID: ${this.highestSlimeId}`);
        return this.highestSlimeId;
    }

    /**
     * Update highest slime ID (call after batch DB operations)
     */
    updateHighestSlimeId(id: number): void {
        if (id > this.highestSlimeId) {
            this.highestSlimeId = id;
            logger.debug(`📈 Updated highest slime ID to: ${this.highestSlimeId}`);
        }
    }

    /**
     * Get current highest IDs (for debugging)
     */
    getStats(): {
        highestSlimeId: number;
        isInitialized: boolean;
    } {
        return {
            highestSlimeId: this.highestSlimeId,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Sync with database (call periodically or after bulk operations)
     */
    async syncWithDatabase(): Promise<void> {
        try {
            const [highestSlime, highestInventory] = await Promise.all([
                prisma.slime.findFirst({
                    select: { id: true },
                    orderBy: { id: 'desc' }
                }),
                prisma.inventory.findFirst({
                    select: { id: true },
                    orderBy: { id: 'desc' }
                })
            ]);

            const dbSlimeId = highestSlime?.id || 0;

            if (dbSlimeId > this.highestSlimeId) {
                logger.info(`🔄 Synced slime ID: ${this.highestSlimeId} -> ${dbSlimeId}`);
                this.highestSlimeId = dbSlimeId;
            }

        } catch (error) {
            logger.error('❌ Failed to sync IDManager with database:', error);
        }
    }
}

export const slimeIdManager = new SlimeIDManager();