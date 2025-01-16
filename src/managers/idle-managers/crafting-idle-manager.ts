import { SocketManager } from "../../socket/socket-manager";
import { getCraftingRecipeForEquipment } from "../../sql-services/crafting-service";
import { mintEquipmentToUser } from "../../sql-services/equipment-inventory-service";
import { deleteItemsFromUserInventory, doesUserOwnItems } from "../../sql-services/item-inventory-service";
import { addCraftingExp, getUserCraftingLevel } from "../../sql-services/user-service";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { logger } from "../../utils/logger";
import { IdleActivityQueueElement, IdleManager, ProgressUpdate } from "./idle-manager";

export class IdleCraftingManager {

    constructor() { }

    static async startCrafting(socketManager: SocketManager, idleManager: IdleManager, userId: number, equipmentId: number, startTimestamp: number) {
        try {
            const recipe = await getCraftingRecipeForEquipment(equipmentId);

            if (!(await doesUserOwnItems(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity)))) {
                throw new Error(`Unable to start idle crafting. User does not have all the required items.`);
            }

            if (!recipe) throw new Error('Crafting recipe not found');

            if ((await getUserCraftingLevel(userId) < recipe.craftingLevelRequired)) throw new Error('Insufficient crafting level');

            const idleCraftingActivity: IdleActivityQueueElement = {
                userId: userId,
                activity: 'crafting',
                equipmentId: recipe.equipmentId,
                name: recipe.equipmentName,
                startTimestamp: startTimestamp,
                durationS: recipe.durationS,
                nextTriggerTimestamp: startTimestamp + recipe.durationS * 1000,
                activityCompleteCallback: async () => await IdleCraftingManager.craftingCompleteCallback(socketManager, userId, equipmentId),
                activityStopCallback: async () => await IdleCraftingManager.craftingStopCallback(socketManager, userId, equipmentId)
            };

            idleManager.appendIdleActivityByUser(userId, idleCraftingActivity);
            idleManager.queueIdleActivityElement(idleCraftingActivity);

            logger.info(`Started idle crafting for user ${userId} for equipmentId: ${equipmentId}.`);
            logger.info(JSON.stringify(idleCraftingActivity, null, 2));
        } catch (error) {
            logger.error(`Error starting crafting ${userId}: ${error}`);
            socketManager.emitEvent(userId, 'crafting-stop', {
                userId: userId,
                payload: {
                    equipmentId: equipmentId,
                }
            });
        }
    }

    static stopCrafting(idleManager: IdleManager, userId: number, equipmentId: number) {
        idleManager.removeIdleActivityByUser(userId, 'crafting', equipmentId);
        idleManager.removeIdleActivityElementFromQueue(userId, 'crafting', equipmentId);
    }

    static async handleLoadedCraftingActivity(
        socketManager: SocketManager,
        idleManager: IdleManager,
        crafting: IdleActivityQueueElement,
        userId: number
    ): Promise<ProgressUpdate> {
        if (crafting.activity !== "crafting") {
            throw new Error("Invalid activity type. Expected crafting activity.");
        }

        if (!crafting.equipmentId) {
            throw new Error("Equipment id not found in crafting activity.");
        }

        if (!crafting.logoutTimestamp) {
            throw new Error("Logout timestamp not found in loaded crafting activity.");
        }

        logger.info(`Crafting activity loaded: ${JSON.stringify(crafting, null, 2)}`);

        const recipe = await getCraftingRecipeForEquipment(crafting.equipmentId);

        const now = Date.now();
        const maxProgressEndTimestamp = crafting.logoutTimestamp + MAX_OFFLINE_IDLE_PROGRESS_S * 1000;
        const progressEndTimestamp = Math.min(maxProgressEndTimestamp, now);

        let timestamp = crafting.startTimestamp;
        let repetitions = 0;
        let startCurrentRepetition = true;

        // Fast-forward to last rep before logoutTimestamp
        while (timestamp + crafting.durationS * 1000 < crafting.logoutTimestamp) {
            timestamp += crafting.durationS * 1000; // Add duration to timestamp
        }

        // Process crafting repetitions after logoutTimestamp up to now
        while (timestamp + crafting.durationS * 1000 <= progressEndTimestamp) {
            timestamp += crafting.durationS * 1000; // Add duration to timestamp

            if (timestamp <= now) {
                if ((await doesUserOwnItems(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity * repetitions + 1)))) {
                    repetitions++
                } else {
                    startCurrentRepetition = false;
                }
            }
        }

        // At this point, `timestamp` is the start of the next repetition
        let currentRepetitionStart = timestamp;

        // Handle partway-through repetition at progress end
        if (timestamp < progressEndTimestamp) {
            const elapsedWithinCurrentRepetition = progressEndTimestamp - timestamp;
            currentRepetitionStart = progressEndTimestamp - elapsedWithinCurrentRepetition;
        }

        logger.info(`Crafting rpetitions completed after logout: ${repetitions}`);
        logger.info(`Current repetition start timestamp: ${currentRepetitionStart}`);

        // Start current repetition
        if (startCurrentRepetition) {
            IdleCraftingManager.startCrafting(socketManager, idleManager, userId, recipe.equipmentId, currentRepetitionStart);
            socketManager.emitEvent(userId, 'crafting-start', {
                userId: userId,
                payload: {
                    equipmentId: recipe.equipmentId,
                    startTimestamp: currentRepetitionStart,
                    durationS: recipe.durationS
                }
            });
        }

        let expRes; 
        if (repetitions > 0) {
            // Logic for completed repetitions after logout
            await deleteItemsFromUserInventory(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity * repetitions));

            await mintEquipmentToUser(userId.toString(), recipe.equipmentId, repetitions);

            expRes = await addCraftingExp(userId, recipe.craftingExp * repetitions);
        }

        return {
            type: 'crafting',
            update: {
                items: recipe.requiredItems.map(item => ({
                    itemId: item.itemId,
                    itemName: item.itemName,
                    quantity: item.quantity * repetitions * -1,
                })),
                equipment: [{
                    equipmentId: recipe.equipmentId,
                    equipmentName: recipe.equipmentName,
                    quantity: repetitions
                }],
                craftingExpGained: (repetitions > 0) ? recipe.craftingExp * repetitions : undefined,
                craftingLevelsGained: expRes?.craftingLevelsGained
            },
        };
    }

    static async craftingCompleteCallback(
        socketManager: SocketManager,
        userId: number,
        equipmentId: number,
    ): Promise<void> {
        try {
            const recipe = await getCraftingRecipeForEquipment(equipmentId);

            const updatedItemsInv = await deleteItemsFromUserInventory(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity));
            const updatedEquipmentInv = await mintEquipmentToUser(userId.toString(), equipmentId);
            
            socketManager.emitEvent(userId, 'update-inventory', {
                userId: userId,
                payload: [...updatedItemsInv, updatedEquipmentInv]
            });

            const expRes = await addCraftingExp(userId, recipe.craftingExp);

            socketManager.emitEvent(userId, 'update-crafting-exp', {
                userId: userId,
                payload: expRes,
            });

            if (!(await doesUserOwnItems(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity)))) {
                throw new Error(`User does not have all the required items for subsequent iteration.`);
            }

        } catch (error) {
            logger.error(`Error during crafting complete callback for user ${userId}: ${error}`);
            socketManager.emitEvent(userId, 'crafting-stop', {
                userId: userId,
                payload: {
                    equipmentId: equipmentId,
                }
            });
        }
    }

    static async craftingStopCallback(
        socketManager: SocketManager,
        userId: number,
        equipmentId: number,
    ): Promise<void> {
        try {
            socketManager.emitEvent(userId, 'crafting-stop', {
                userId: userId,
                payload: {
                    equipmentId: equipmentId,
                }
            });
        } catch (err) {
            logger.error(`Error during crafting stop callback for user ${userId}: ${err}`);
        }
    }
}
