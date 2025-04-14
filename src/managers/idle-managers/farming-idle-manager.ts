import { Item } from "@prisma/client";
import { SocketManager } from "../../socket/socket-manager";
import { mintItemToUser } from "../../sql-services/item-inventory-service";
import { addFarmingExp, getUserFarmingLevel } from "../../sql-services/user-service";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { logger } from "../../utils/logger";
import { IdleManager } from "./idle-manager";
import { FarmingUpdate, IdleFarmingIntervalElement, TimerHandle } from "./idle-manager-types";

export class IdleFarmingManager {

    constructor() { }

    static async startFarming(socketManager: SocketManager, idleManager: IdleManager, userId: string, item: Item, startTimestamp: number) {
        let timerHandle: TimerHandle | undefined;

        try {
            await idleManager.removeFarmingActivity(userId, item.id); // no duplicates

            if (!item.farmingDurationS || !item.farmingExp || !item.farmingLevelRequired) throw new Error('Item cannot be farmed');

            if ((await getUserFarmingLevel(userId)) < item.farmingLevelRequired) throw new Error("Insufficient farming level");

            const completeCallback = async () => {
                try {
                    await IdleFarmingManager.farmingCompleteCallback(socketManager, userId, item.id);
                } catch (err) {
                    logger.error(`Farming callback failed for user ${userId}, item ${item.id}: ${err}`);
                    await idleManager.removeFarmingActivity(userId, item.id);
                }
            };

            timerHandle = IdleManager.startCustomInterval((startTimestamp + (item.farmingDurationS * 1000)) - Date.now(), item.farmingDurationS * 1000, completeCallback);

            const idleFarmingActivity: IdleFarmingIntervalElement = {
                userId: userId,
                activity: 'farming',
                item: item,
                startTimestamp: startTimestamp,
                durationS: item.farmingDurationS,
                activityCompleteCallback: completeCallback,
                activityStopCallback: async () => await IdleFarmingManager.farmingStopCallback(socketManager, userId, item.id),
                activityInterval: timerHandle
            };

            await idleManager.appendIdleActivityByUser(userId, idleFarmingActivity);
        } catch (error) {
            logger.error(`Error starting farming ${userId}: ${error}`);

            if (timerHandle) IdleManager.clearCustomInterval(timerHandle);

            socketManager.emitEvent(userId, 'farming-stop', {
                userId: userId,
                payload: {
                    itemId: item.id,
                }
            });
        }
    }

    static stopFarming(idleManager: IdleManager, userId: string, itemId: number) {
        idleManager.removeFarmingActivity(userId, itemId);
    }

    static async handleLoadedFarmingActivity(
        socketManager: SocketManager,
        idleManager: IdleManager,
        farming: IdleFarmingIntervalElement,
        userId: string
    ): Promise<FarmingUpdate | undefined> {
        if (farming.activity !== "farming") {
            throw new Error("Invalid activity type. Expected farming activity.");
        }

        if (!farming.item) {
            throw new Error("Item not found in farming activity.");
        }

        if (!farming.logoutTimestamp) {
            throw new Error("Logout timestamp not found in loaded farming activity.");
        }

        logger.info(`Farming activity loaded: ${JSON.stringify(farming, null, 2)}`);

        if (!farming.item || !farming.item.farmingExp) {
            throw new Error(`Item cannot be farmed.`);
        }

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

        logger.info(`Farming repetition completed after logout: ${repetitions}`);
        logger.info(`Current repetition start timestamp: ${currentRepetitionStart}`);

        // Start current repetition
        IdleFarmingManager.startFarming(socketManager, idleManager, userId, farming.item, currentRepetitionStart);

        socketManager.emitEvent(userId, 'farming-start', {
            userId: userId,
            payload: {
                itemId: farming.item.id,
                startTimestamp: currentRepetitionStart,
                durationS: farming.durationS
            }
        });

        let expRes;
        if (repetitions > 0) {
            await mintItemToUser(userId.toString(), farming.item.id, repetitions);
            expRes = await addFarmingExp(userId, farming.item.farmingExp * repetitions);
            return {
                type: 'farming',
                update: {
                    items: [
                        {
                            itemId: farming.item.id,
                            itemName: farming.item.name || 'Item',
                            quantity: repetitions,
                            uri: farming.item.imgsrc
                        }
                    ],
                    farmingExpGained: (repetitions > 0) ? farming.item.farmingExp * repetitions : undefined,
                    farmingLevelsGained: expRes?.farmingLevelsGained
                },
            };
        }
    }

    static async farmingCompleteCallback(
        socketManager: SocketManager,
        userId: string,
        itemId: number,
    ): Promise<void> {
        try {
            const updatedItemsInv = await mintItemToUser(userId.toString(), itemId);
            const expRes = await addFarmingExp(userId, updatedItemsInv.item!.farmingExp!);

            socketManager.emitEvent(userId, 'update-inventory', {
                userId: userId,
                payload: [updatedItemsInv],
            });

            socketManager.emitEvent(userId, 'update-farming-exp', {
                userId: userId,
                payload: expRes,
            });

        } catch (error) {
            logger.error(`Error during farming complete callback for user ${userId}: ${error}`);
            socketManager.emitEvent(userId, 'farming-stop', {
                userId: userId,
                payload: {
                    itemId: itemId,
                }
            });
            throw error;
        }
    }

    static async farmingStopCallback(
        socketManager: SocketManager,
        userId: string,
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
