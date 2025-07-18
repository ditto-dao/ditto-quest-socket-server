import express from 'express';
import { logger } from '../../utils/logger';
import { handleShopPurchase } from '../../operations/shop-operations';
import { GameCodexManager } from '../../managers/game-codex/game-codex-manager';
import { SocketManager } from '../../socket/socket-manager';
import { USER_UPDATE_EVENT } from '../../socket/events';

export function createStarsPaymentRouter(socketManager: SocketManager) {
    const router = express.Router();

    router.get('/test', (req, res) => {
        logger.info('🧪 Test endpoint hit!');
        res.json({ status: 'Stars payment router is working', timestamp: new Date().toISOString() });
    });

    router.get('/payment-success', (req, res) => {
        res.status(200).json({ ok: true });
    });

    router.post('/payment-success', async (req, res) => {
        try {
            logger.info(`📡 POST received on /payment-success: ${req.method}`);

            const update = req.body;
            logger.info(`📡 Received update: ${JSON.stringify(update)}`);

            if (update.message && update.message.successful_payment) {
                const successfulPayment = update.message.successful_payment;
                logger.info(`💫 Processing successful payment: ${JSON.stringify(successfulPayment)}`);

                try {
                    const payload = JSON.parse(successfulPayment.invoice_payload);
                    const { userId, shopItemId, quantity } = payload;

                    logger.info(`💫 Processing Stars payment for user ${userId}: ${quantity}x shop item ${shopItemId}`);

                    const shopItem = GameCodexManager.getShopItem(shopItemId);
                    if (!shopItem) {
                        throw new Error(`Shop item ${shopItemId} not found`);
                    }

                    // Process the purchase and collect service updates
                    const serviceUpdates = await handleShopPurchase(userId, shopItem, quantity, socketManager);

                    // EMIT USER_UPDATE_EVENT with service updates (if any)
                    if (Object.keys(serviceUpdates).length > 0) {
                        socketManager.emitEvent(userId, USER_UPDATE_EVENT, {
                            userId,
                            payload: serviceUpdates
                        });
                    }

                    logger.info(`✅ Successfully processed Stars payment for user ${userId}`);
                } catch (paymentError) {
                    logger.error(`❌ Error processing successful payment: ${paymentError}`);
                    // Consider implementing refund logic here if needed
                }
            }

            // Always respond with 200 OK to Telegram
            res.status(200).json({ ok: true });
        } catch (error) {
            if (error instanceof Error) {
                logger.error(`❌ Error processing Stars payment webhook: ${error.name}: ${error.message}`);
                logger.error(error.stack);
            } else {
                logger.error(`❌ Unknown error: ${JSON.stringify(error)}`);
            }

            // Always respond with 200 OK to Telegram to avoid webhook retries
            res.status(200).json({ ok: true });
        }
    });

    return router;
}