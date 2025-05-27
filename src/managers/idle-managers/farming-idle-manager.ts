import { Item } from "@prisma/client";
import { SocketManager } from "../../socket/socket-manager";
import { canUserMintItem, mintItemToUser } from "../../sql-services/item-inventory-service";
import { addFarmingExp, getUserFarmingLevel } from "../../sql-services/user-service";
import { FARM_REPS_MULTIPLIER, MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { logger } from "../../utils/logger";
import { IdleManager } from "./idle-manager";
import { FarmingUpdate, IdleActivityIntervalElement, IdleFarmingIntervalElement, TimerHandle } from "./idle-manager-types";
import { logFarmingActivity } from "../../sql-services/user-activity-log";

export class IdleFarmingManager {

    constructor() { }

    static async startFarming(
        socketManager: SocketManager,
        idleManager: IdleManager,
        userId: string,
        item: Item,
        startTimestamp: number
    ) {
        let timerHandle: TimerHandle | undefined;

        try {
            await idleManager.removeFarmingActivity(userId); // remove duplicate if any

            if (!item.farmingDurationS || !item.farmingExp || !item.farmingLevelRequired) {
                throw new Error('Item cannot be farmed');
            }

            const currentFarmingLevel = await getUserFarmingLevel(userId);
            if (currentFarmingLevel < item.farmingLevelRequired) {
                throw new Error("Insufficient farming level");
            }

            if (!(await canUserMintItem(userId, item.id))) {
                socketManager.emitEvent(userId, 'error', {
                    userId: userId,
                    msg: 'Inventory full. Please clear space or upgrade your slots'
                })
                throw new Error(`Insufficient inventory space to start farming`);
            }

            // Define callbacks
            const completeCallback = async () => {
                try {
                    await IdleFarmingManager.farmingCompleteCallback(socketManager, idleManager, userId, item.id);
                } catch (err) {
                    logger.error(`Farming callback failed for user ${userId}, item ${item.id}: ${err}`);
                    await idleManager.removeFarmingActivity(userId);
                    IdleManager.clearCustomInterval(timerHandle!);
                }
            };

            const stopCallback = async () => {
                await IdleFarmingManager.farmingStopCallback(socketManager, userId, item.id);
            };

            // Create and append activity with placeholder interval
            const activity: Omit<IdleFarmingIntervalElement, "activityInterval"> = {
                userId,
                activity: 'farming',
                item,
                startTimestamp,
                durationS: item.farmingDurationS,
                activityCompleteCallback: completeCallback,
                activityStopCallback: stopCallback
            };

            await idleManager.appendIdleActivityByUser(userId, activity as IdleActivityIntervalElement);

            // Start timer and patch
            timerHandle = await idleManager.startCustomInterval(
                userId,
                (startTimestamp + item.farmingDurationS * 1000) - Date.now(),
                item.farmingDurationS * 1000,
                completeCallback
            );

            idleManager.patchIntervalActivity(
                userId,
                'farming',
                (el) => el.activity === 'farming' && el.item.id === item.id,
                timerHandle
            );

        } catch (error) {
            logger.error(`Error starting farming for user ${userId}: ${error}`);

            if (timerHandle) IdleManager.clearCustomInterval(timerHandle);
            await idleManager.removeFarmingActivity(userId);

            socketManager.emitEvent(userId, 'farming-stop', {
                userId,
                payload: { itemId: item.id }
            });
        }
    }

    static stopFarming(idleManager: IdleManager, userId: string) {
        idleManager.removeFarmingActivity(userId);
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
                name: farming.item.name,
                imgsrc: farming.item.imgsrc,
                startTimestamp: currentRepetitionStart,
                durationS: farming.durationS
            }
        });

        let expRes;
        if (repetitions > 0) {
            await mintItemToUser(userId.toString(), farming.item.id, repetitions * FARM_REPS_MULTIPLIER);
            expRes = await addFarmingExp(userId, farming.item.farmingExp * repetitions);

            await logFarmingActivity(userId, farming.item.id, repetitions);

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
        idleManager: IdleManager,
        userId: string,
        itemId: number,
    ): Promise<void> {
        try {
            const updatedItemsInv = await mintItemToUser(userId.toString(), itemId, FARM_REPS_MULTIPLIER);
            const expRes = await addFarmingExp(userId, updatedItemsInv.item!.farmingExp!);

            socketManager.emitEvent(userId, 'update-inventory', {
                userId: userId,
                payload: [updatedItemsInv],
            });

            socketManager.emitEvent(userId, 'update-farming-exp', {
                userId: userId,
                payload: expRes,
            });

            await logFarmingActivity(userId, itemId, 1);

        } catch (error) {
            logger.error(`Error during farming complete callback for user ${userId}: ${error}`);

            await idleManager.removeFarmingActivity(userId);

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
