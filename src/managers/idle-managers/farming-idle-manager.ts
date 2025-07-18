import { Item } from "@prisma/client";
import { SocketManager } from "../../socket/socket-manager";
import { FARM_REPS_MULTIPLIER, MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { logger } from "../../utils/logger";
import { IdleManager } from "./idle-manager";
import { FarmingUpdate, IdleActivityIntervalElement, IdleFarmingIntervalElement, TimerHandle } from "./idle-manager-types";
import { emitMissionUpdate, updateFarmMission } from "../../sql-services/missions";
import { addFarmingExpMemory, getUserFarmingLevelMemory } from "../../operations/user-operations";
import { canUserMintItem, mintItemToUser } from "../../operations/item-inventory-operations";
import { logFarmingActivity } from "../../operations/user-activity-log-operations";
import { getUserDoubleResourceChanceMemory, getUserDoubleSkillExpChanceMemory, getUserFlatSkillExpBoostMemory, getUserSkillIntervalMultiplierMemory } from "../../operations/user-stats-operations";

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

            const currentFarmingLevel = await getUserFarmingLevelMemory(userId);
            if (currentFarmingLevel.farmingLevel < item.farmingLevelRequired) {
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

            const skillIntervalMul = await getUserSkillIntervalMultiplierMemory(userId);

            // Apply speed multiplier with minimum 1 second duration
            const adjustedDuration = Math.max(1, item.farmingDurationS * (1 - skillIntervalMul));

            timerHandle = await idleManager.startCustomInterval(
                userId,
                (startTimestamp + adjustedDuration * 1000) - Date.now(),
                adjustedDuration * 1000,
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

        // Get efficiency stats for interval adjustment
        const skillIntervalMul = await getUserSkillIntervalMultiplierMemory(userId);
        const adjustedDuration = Math.max(1, farming.durationS * (1 - skillIntervalMul));

        const now = Date.now();
        const maxProgressEndTimestamp = farming.logoutTimestamp + MAX_OFFLINE_IDLE_PROGRESS_S * 1000;
        const progressEndTimestamp = Math.min(maxProgressEndTimestamp, now);

        let timestamp = farming.startTimestamp;
        let repetitions = 0;

        // Ensure logoutTimestamp is defined and start processing after it
        if (farming.logoutTimestamp) {
            // Fast-forward to last rep before logoutTimestamp using adjusted duration
            while (timestamp + adjustedDuration * 1000 < farming.logoutTimestamp) {
                timestamp += adjustedDuration * 1000; // Add adjusted duration to timestamp
            }
        }

        // Process farming repetitions after logoutTimestamp up to now using adjusted duration
        while (timestamp + adjustedDuration * 1000 <= progressEndTimestamp) {
            timestamp += adjustedDuration * 1000; // Add adjusted duration to timestamp
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

        // Start current repetition with adjusted duration
        IdleFarmingManager.startFarming(socketManager, idleManager, userId, farming.item, currentRepetitionStart);

        socketManager.emitEvent(userId, 'farming-start', {
            userId: userId,
            payload: {
                itemId: farming.item.id,
                name: farming.item.name,
                imgsrc: farming.item.imgsrc,
                startTimestamp: currentRepetitionStart,
                durationS: adjustedDuration
            }
        });

        let expRes;
        if (repetitions > 0) {
            let totalItems = repetitions * FARM_REPS_MULTIPLIER;
            let bonusItems = 0;

            const baseFarmingExp = farming.item.farmingExp;
            const flatSkillExpBoost = await getUserFlatSkillExpBoostMemory(userId);

            // Base exp with flat boost multiplier applied
            let totalExp = Math.floor(baseFarmingExp * (1 + flatSkillExpBoost)) * repetitions;
            let bonusExp = 0;

            // Check for double resource chance on each repetition
            const doubleResourceChance = await getUserDoubleResourceChanceMemory(userId);
            for (let i = 0; i < repetitions; i++) {
                if (Math.random() < doubleResourceChance) {
                    bonusItems += FARM_REPS_MULTIPLIER;
                }
            }

            // Check for double skill exp chance on each repetition (applies only to base exp)
            const doubleSkillExpChance = await getUserDoubleSkillExpChanceMemory(userId);
            for (let i = 0; i < repetitions; i++) {
                if (Math.random() < doubleSkillExpChance) {
                    bonusExp += baseFarmingExp; // Only base exp, no flat boost multiplier
                }
            }

            // Mint base items
            await mintItemToUser(userId.toString(), farming.item.id, totalItems);

            // Mint bonus items if any
            if (bonusItems > 0) {
                await mintItemToUser(userId.toString(), farming.item.id, bonusItems);
                logger.info(`🎲 Offline double resource procs for user ${userId}! Bonus items: ${bonusItems}`);
            }

            // Add base exp (includes flat boost)
            expRes = await addFarmingExpMemory(userId, totalExp);

            // Add bonus exp if any
            if (bonusExp > 0) {
                await addFarmingExpMemory(userId, bonusExp);
                logger.info(`🎲 Offline double skill exp procs for user ${userId}! Bonus exp: ${bonusExp} (base only)`);
            }

            await logFarmingActivity(userId, farming.item.id, repetitions);
            await updateFarmMission(userId, farming.item.id, totalItems + bonusItems);
            await emitMissionUpdate(socketManager.getSocketByUserId(userId), userId);

            return {
                type: 'farming',
                update: {
                    items: [
                        {
                            itemId: farming.item.id,
                            itemName: farming.item.name || 'Item',
                            quantity: totalItems + bonusItems,
                            uri: farming.item.imgsrc
                        }
                    ],
                    farmingExpGained: totalExp + bonusExp,
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

            const baseFarmingExp = updatedItemsInv.item!.farmingExp!;
            const flatSkillExpBoost = await getUserFlatSkillExpBoostMemory(userId);

            // Apply flat boost multiplier to base exp
            let farmingExp = Math.floor(baseFarmingExp * (1 + flatSkillExpBoost));
            let bonusExp = 0;

            // Double chance applies only to base exp (not the boosted amount)
            const doubleSkillExpChance = await getUserDoubleSkillExpChanceMemory(userId);
            if (Math.random() < doubleSkillExpChance) {
                bonusExp = baseFarmingExp; // Only base exp, no flat boost multiplier
                logger.info(`🎲 Double skill exp proc for user ${userId}! Bonus exp: ${bonusExp} (base only)`);
            }

            await addFarmingExpMemory(userId, farmingExp);
            const inventoryUpdates = [updatedItemsInv];

            // Check for double resource chance
            const doubleResourceChance = await getUserDoubleResourceChanceMemory(userId);
            let doubleResourceSuccess = false;
            if (Math.random() < doubleResourceChance) {
                const bonusItemsInv = await mintItemToUser(userId.toString(), itemId, FARM_REPS_MULTIPLIER);
                inventoryUpdates.push(bonusItemsInv);
                logger.info(`🎲 Double resource proc for user ${userId}! Bonus items: ${FARM_REPS_MULTIPLIER}`);
                doubleResourceSuccess = true;
            }

            socketManager.emitEvent(userId, 'update-inventory', {
                userId: userId,
                payload: inventoryUpdates,
            });

            const bonusExpRes = await addFarmingExpMemory(userId, bonusExp);
            socketManager.emitEvent(userId, 'update-farming-exp', {
                userId: userId,
                payload: bonusExpRes,
            });

            await logFarmingActivity(userId, itemId, 1);
            await updateFarmMission(userId, itemId, FARM_REPS_MULTIPLIER * (doubleResourceSuccess ? 2 : 1));
            await emitMissionUpdate(socketManager.getSocketByUserId(userId), userId);

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
