import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';
import AsyncLock from 'async-lock';

export class SlimeIDManager {
    private highestSlimeId: number = 0;
    private isInitialized: boolean = false;
    private lock = new AsyncLock();

    constructor() { }

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
     * Generate next real slime ID (race-condition safe)
     */
    async getNextSlimeId(): Promise<number> {
        if (!this.isInitialized) {
            throw new Error('IDManager not initialized');
        }

        return await this.lock.acquire('slime-id', () => {
            this.highestSlimeId++;
            const newId = this.highestSlimeId;
            logger.debug(`🆔 Generated slime ID: ${newId}`);
            return newId;
        });
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
}

export const slimeIdManager = new SlimeIDManager();