import { SocketManager } from "../../socket/socket-manager";
import { mintItemToUser } from "../../sql-services/item-inventory-service";
import { getItemById } from "../../sql-services/item-service";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { logger } from "../../utils/logger";
import { IdleActivityQueueElement, IdleManager, ProgressUpdate } from "./idle-manager";

export class IdleFarmingManager {

    constructor() { }

    static async startFarming(socketManager: SocketManager, idleManager: IdleManager, userId: number, itemId: number, startTimestamp: number) {
        try {
            const item = await getItemById(itemId);

            if (!item) throw new Error('Item not found');
    
            if (!item.farmingDurationS) throw new Error('Item cannot be farmed');
    
            const idleFarmingActivity: IdleActivityQueueElement = {
                userId: userId,
                activity: 'farming',
                itemId: item.id,
                name: item.name,
                startTimestamp: startTimestamp,
                durationS: item.farmingDurationS,
                nextTriggerTimestamp: startTimestamp + item.farmingDurationS * 1000,
                activityCompleteCallback: async () => await IdleFarmingManager.farmingCompleteCallback(socketManager, userId, itemId),
                activityStopCallback: async () => await IdleFarmingManager.farmingStopCallback(socketManager, userId, itemId)
            };
    
            idleManager.appendIdleActivityByUser(userId, idleFarmingActivity);
            idleManager.queueIdleActivityElement(idleFarmingActivity);
        } catch (error) {
            logger.error(`Error starting farming ${userId}: ${error}`);
            socketManager.emitEvent(userId, 'farming-stop', {
                userId: userId,
                payload: {
                    itemId: itemId,
                }
            });
        }
    }

    static stopFarming(idleManager: IdleManager, userId: number, itemId: number) {
        idleManager.removeIdleActivityByUser(userId, 'farming', itemId);
        idleManager.removeIdleActivityElementFromQueue(userId, 'farming', itemId);
    }

    static async handleLoadedFarmingActivity(
        socketManager: SocketManager,
        idleManager: IdleManager,
        farming: IdleActivityQueueElement,
        userId: number
    ): Promise<ProgressUpdate> {
        if (farming.activity !== "farming") {
            throw new Error("Invalid activity type. Expected farming activity.");
        }

        if (!farming.itemId) {
            throw new Error("Item id not found in farming activity.");
        }

        if (!farming.logoutTimestamp) {
            throw new Error("Logout timestamp not found in loaded farming activity.");
        }

        logger.info(`Farming activity loaded: ${JSON.stringify(farming, null, 2)}`);

        const now = Date.now();
        const maxProgressEndTimestamp = farming.logoutTimestamp + MAX_OFFLINE_IDLE_PROGRESS_S * 1000;
        const progressEndTimestamp = Math.min(maxProgressEndTimestamp, now);

        let timestamp = farming.startTimestamp;
        let repetitions = 0;

        // Ensure logoutTimestamp is defined and start processing after it
        if (farming.logoutTimestamp) {
            // Fast-forward to last rep before logoutTimestamp
            while (timestamp + farming.durationS * 1000 < farming.logoutTimestamp) {
                timestamp += farming.durationS * 1000; // Add duration to timestamp
            }
        }

        // Process farming repetitions after logoutTimestamp up to now
        while (timestamp + farming.durationS * 1000 <= progressEndTimestamp) {
            timestamp += farming.durationS * 1000; // Add duration to timestamp
            repetitions++;
        }

        // At this point, `timestamp` is the start of the next repetition
        let currentRepetitionStart = timestamp;

        // Handle partway-through repetition at progress end
        if (timestamp < progressEndTimestamp) {
            const elapsedWithinCurrentRepetition = progressEndTimestamp - timestamp;
            currentRepetitionStart = progressEndTimestamp - elapsedWithinCurrentRepetition;
        }

        logger.info(`Farming rpetitions completed after logout: ${repetitions}`);
        logger.info(`Current repetition start timestamp: ${currentRepetitionStart}`);

        // Start current repetition
        IdleFarmingManager.startFarming(socketManager, idleManager, userId, farming.itemId, currentRepetitionStart);

        socketManager.emitEvent(userId, 'farming-start', {
            userId: userId,
            payload: {
                itemId: farming.itemId,
                startTimestamp: currentRepetitionStart,
                durationS: farming.durationS
            }
        });

        if (repetitions > 0) await mintItemToUser(userId.toString(), farming.itemId, repetitions);

        return {
            type: 'farming',
            update: {
                items: [
                    {
                        itemId: farming.itemId,
                        itemName: farming.name || 'Item',
                        quantity: repetitions
                    }
                ]
            },
        };
    }

    static async farmingCompleteCallback(
        socketManager: SocketManager,
        userId: number,
        itemId: number,
    ): Promise<void> {
        try {
            const updatedItemsInv = await mintItemToUser(userId.toString(), itemId);

            socketManager.emitEvent(userId, 'update-inventory', {
                userId: userId,
                payload: [updatedItemsInv],
            });

        } catch (error) {
            logger.error(`Error during farming complete callback for user ${userId}: ${error}`);
            socketManager.emitEvent(userId, 'farming-stop', {
                userId: userId,
                payload: {
                    itemId: itemId,
                }
            });
        }
    }

    static async farmingStopCallback(
        socketManager: SocketManager,
        userId: number,
        itemId: number,
    ): Promise<void> {
        try {
            socketManager.emitEvent(userId, 'farming-stop', {
                userId: userId,
                payload: {
                    itemId: itemId,
                }
            });
        } catch (err) {
            logger.error(`Error during farming stop callback for user ${userId}: ${err}`);
        }
    }
}
