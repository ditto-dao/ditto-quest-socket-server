import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Initialize Prisma Client
export const prisma = new PrismaClient();

// Graceful shutdown handling
process.on('SIGINT', async () => {
    try {
        await prisma.$disconnect();
        logger.info(`Prisma disconnected successfully`);
        process.exit(0);  // Exit gracefully
    } catch (error) {
        logger.error(`Error during Prisma disconnection: ${error}`);
        process.exit(1);  // Exit with an error code
    }
});

process.on('SIGTERM', async () => {
    try {
        await prisma.$disconnect();
        logger.info(`Prisma disconnected successfully`);
        process.exit(0);  // Exit gracefully
    } catch (error) {
        logger.error(`Error during Prisma disconnection: ${error}`);
        process.exit(1);  // Exit with an error code
    }
});
