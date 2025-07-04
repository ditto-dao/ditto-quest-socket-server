import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getUserDataWithSnapshot } from '../operations/user-operations';
import { getTotalCombatDitto } from '../redis/intract';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis'

export interface IntractVerificationRequest {
    telegram?: string;
    address?: string;
    twitter?: string;
    discord?: string;
    email?: string;
    startTimestamp?: string;
    endTimestamp?: string;
}

export interface IntractVerificationResponse {
    error: {
        code: number;
        message: string;
    };
    data: {
        result: boolean;
    };
}

export class IntractVerificationAPI {

    private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

    constructor(redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>) {
        this.redisClient = redisClient;
        logger.info('Intract Verification API initialized');
    }

    /**
     * Health check endpoint for Intract testing
     */
    async healthCheck(req: Request, res: Response): Promise<void> {
        try {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                service: 'ditto-quest-intract-verification'
            });
        } catch (error) {
            logger.error(`Health check failed: ${error}`);
            res.status(200).json({
                status: 'error',
                timestamp: new Date().toISOString(),
                error: 'Health check failed'
            });
        }
    }

    /**
     * Verify 200 Ditto task completion
     * Checks combat activity in memory + database and sums to see if >= 200
     */
    async verifyDitto200Task(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        
        try {
            const payload: IntractVerificationRequest = req.body;
            
            // Validate required fields
            if (!payload.telegram) {
                logger.warn('Ditto 200 verification request missing telegram ID');
                res.status(200).json(this.createErrorResponse(400, 'Missing telegram ID'));
                return;
            }

            const telegramId = payload.telegram;
            logger.info(`Verifying Ditto 200 task for Telegram ID: ${telegramId}`);

            // Check if user has earned >= 200 ditto from combat activities
            const totalCombatDitto = await this.getTotalCombatDittoEarned(telegramId);
            const isCompleted = totalCombatDitto >= 200;
            
            const response: IntractVerificationResponse = {
                error: {
                    code: 0,
                    message: ''
                },
                data: {
                    result: isCompleted
                }
            };

            const processingTime = Date.now() - startTime;
            logger.info(`Ditto 200 verification completed for ${telegramId}: ${isCompleted} (total: ${totalCombatDitto} ditto) (${processingTime}ms)`);

            res.status(200).json(response);

        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error(`Error verifying Ditto 200 task (${processingTime}ms): ${error}`);
            
            res.status(200).json(this.createErrorResponse(500, 'Internal server error'));
        }
    }

    /**
     * Verify Combat Level 10 task completion
     * Simple check: get user and calculate combat level from combatExp
     */
    async verifyCombatLevel10Task(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        
        try {
            const payload: IntractVerificationRequest = req.body;
            
            // Validate required fields
            if (!payload.telegram) {
                logger.warn('Combat Level 10 verification request missing telegram ID');
                res.status(200).json(this.createErrorResponse(400, 'Missing telegram ID'));
                return;
            }

            const telegramId = payload.telegram;
            logger.info(`Verifying Combat Level 10 task for Telegram ID: ${telegramId}`);

            // Get user and check combat level
            const user = await getUserDataWithSnapshot(telegramId);
            
            if (!user) {
                logger.warn(`User not found for Telegram ID: ${telegramId}`);
                res.status(200).json({
                    error: { code: 0, message: '' },
                    data: { result: false }
                });
                return;
            }

            // Calculate combat level (assuming 1000 exp per level)
            const isCompleted = user.level >= 10;
            
            const response: IntractVerificationResponse = {
                error: {
                    code: 0,
                    message: ''
                },
                data: {
                    result: isCompleted
                }
            };

            const processingTime = Date.now() - startTime;
            logger.info(`Combat Level 10 verification completed for ${telegramId}: ${isCompleted} (level: ${user.level}) (${processingTime}ms)`);

            res.status(200).json(response);

        } catch (error) {
            const processingTime = Date.now() - startTime;
            logger.error(`Error verifying Combat Level 10 task (${processingTime}ms): ${error}`);
            
            res.status(200).json(this.createErrorResponse(500, 'Internal server error'));
        }
    }

    /**
     * Get total combat ditto earned by checking memory + database
     */
    private async getTotalCombatDittoEarned(telegramId: string): Promise<number> {
        try {
            // Get total from database (all-time combat activity)
            const totalDitto = await getTotalCombatDitto(this.redisClient, telegramId);
            
            logger.info(`Total combat ditto for ${telegramId}: ${totalDitto}`);
            
            return (totalDitto) ? totalDitto : 0;

        } catch (error) {
            logger.error(`Error getting total combat ditto for ${telegramId}: ${error}`);
            return 0;
        }
    }

    /**
     * Create error response in Intract format
     */
    private createErrorResponse(code: number, message: string): IntractVerificationResponse {
        return {
            error: {
                code,
                message
            },
            data: {
                result: false
            }
        };
    }
}