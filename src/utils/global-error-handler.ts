import { logger } from "../utils/logger";

export function setupGlobalErrorHandlers(): void {
    process.on('uncaughtException', (error) => {
        logger.error(`Uncaught Exception: ${error}`);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    });
}
