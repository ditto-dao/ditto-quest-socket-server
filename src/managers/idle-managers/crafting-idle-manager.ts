import { Equipment, Prisma } from "@prisma/client";
import { SocketManager } from "../../socket/socket-manager";
import { CraftingRecipeRes } from "../../sql-services/crafting-service";
import { mintEquipmentToUser } from "../../sql-services/equipment-inventory-service";
import { deleteItemsFromUserInventory, doesUserOwnItems } from "../../sql-services/item-inventory-service";
import { addCraftingExp, getUserCraftingLevel } from "../../sql-services/user-service";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { logger } from "../../utils/logger";
import { IdleManager } from "./idle-manager";
import { CraftingUpdate, IdleActivityIntervalElement, IdleCraftingIntervalElement, TimerHandle } from "./idle-manager-types";
import { logCraftingActivity } from "../../sql-services/user-activity-log";

export class IdleCraftingManager {

    constructor() { }

    static async startCrafting(
        socketManager: SocketManager,
        idleManager: IdleManager,
        userId: string,
        equipment: Equipment,
        recipe: CraftingRecipeRes,
        startTimestamp: number
    ) {
        let timerHandle: TimerHandle | undefined;

        try {
            await idleManager.removeCraftingActivity(userId); // no duplicates

            if (!recipe) throw new Error('Crafting recipe not found');
            if ((await getUserCraftingLevel(userId)) < recipe.craftingLevelRequired) {
                throw new Error('Insufficient crafting level');
            }

            const requiredItemIds = recipe.requiredItems.map(item => item.itemId);
            const requiredItemQuantities = recipe.requiredItems.map(item => item.quantity);
            const hasItems = await doesUserOwnItems(userId.toString(), requiredItemIds, requiredItemQuantities);
            if (!hasItems) throw new Error(`User does not have all required items`);

            // Define callbacks
            const completeCallback = async () => {
                try {
                    await IdleCraftingManager.craftingCompleteCallback(socketManager, idleManager, userId, recipe);
                } catch (err) {
                    logger.error(`Crafting callback failed for user ${userId}, equipment ${recipe.equipmentId}: ${err}`);
                    await idleManager.removeCraftingActivity(userId);
                    IdleManager.clearCustomInterval(timerHandle!);
                }
            };

            const stopCallback = async () => {
                await IdleCraftingManager.craftingStopCallback(socketManager, userId, equipment.id);
            };

            // Build activity without interval first
            const activity: Omit<IdleCraftingIntervalElement, "activityInterval"> = {
                userId,
                activity: 'crafting',
                equipment,
                recipe,
                startTimestamp,
                durationS: recipe.durationS,
                activityCompleteCallback: completeCallback,
                activityStopCallback: stopCallback
            };

            await idleManager.appendIdleActivityByUser(userId, activity as IdleActivityIntervalElement);

            // Start and patch interval
            timerHandle = await idleManager.startCustomInterval(
                userId,
                (startTimestamp + recipe.durationS * 1000) - Date.now(),
                recipe.durationS * 1000,
                completeCallback
            );

            idleManager.patchIntervalActivity(
                userId,
                'crafting',
                (el) => el.activity === 'crafting' && el.equipment.id === equipment.id,
                timerHandle
            );

            logger.info(`Started idle crafting for user ${userId} for equipmentId: ${equipment.id}.`);
        } catch (error) {
            logger.error(`Error starting crafting for user ${userId}: ${error}`);

            if (timerHandle) IdleManager.clearCustomInterval(timerHandle);
            await idleManager.removeCraftingActivity(userId);

            socketManager.emitEvent(userId, 'crafting-stop', {
                userId,
                payload: {
                    equipmentId: equipment.id,
                }
            });
        }
    }

    static stopCrafting(idleManager: IdleManager, userId: string) {
        idleManager.removeCraftingActivity(userId);
    }

    static async handleLoadedCraftingActivity(
        socketManager: SocketManager,
        idleManager: IdleManager,
        crafting: IdleCraftingIntervalElement,
        userId: string
    ): Promise<CraftingUpdate | undefined> {
        if (crafting.activity !== "crafting") {
            throw new Error("Invalid activity type. Expected crafting activity.");
        }

        if (!crafting.equipment) {
            throw new Error("Equipment not found in crafting activity.");
        }

        if (!crafting.logoutTimestamp) {
            throw new Error("Logout timestamp not found in loaded crafting activity.");
        }

        logger.info(`Crafting activity loaded: ${JSON.stringify(crafting, null, 2)}`);

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
                if ((await doesUserOwnItems(userId.toString(), crafting.recipe.requiredItems.map(item => item.itemId), crafting.recipe.requiredItems.map(item => item.quantity * repetitions + 1)))) {
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

        logger.info(`Crafting repetition completed after logout: ${repetitions}`);
        logger.info(`Current repetition start timestamp: ${currentRepetitionStart}`);

        // Start current repetition
        if (startCurrentRepetition) {
            IdleCraftingManager.startCrafting(socketManager, idleManager, userId, crafting.equipment, crafting.recipe, currentRepetitionStart);
            socketManager.emitEvent(userId, 'crafting-start', {
                userId: userId,
                payload: {
                    equipmentId: crafting.equipment.id,
                    name: crafting.equipment.name,
                    imgsrc: crafting.equipment.imgsrc,
                    startTimestamp: currentRepetitionStart,
                    durationS: crafting.recipe.durationS
                }
            });
        }

        let expRes;
        if (repetitions > 0) {
            // Logic for completed repetitions after logout
            await deleteItemsFromUserInventory(userId.toString(), crafting.recipe.requiredItems.map(item => item.itemId), crafting.recipe.requiredItems.map(item => item.quantity * repetitions));

            await mintEquipmentToUser(userId.toString(), crafting.equipment.id, repetitions);

            expRes = await addCraftingExp(userId, crafting.recipe.craftingExp * repetitions);

            await logCraftingActivity(
                userId,
                crafting.equipment.id,
                repetitions,
                crafting.recipe.requiredItems.map(item => ({
                    itemId: item.itemId,
                    quantity: item.quantity * repetitions,
                }))
            );

            return {
                type: 'crafting',
                update: {
                    items: crafting.recipe.requiredItems.map(item => ({
                        itemId: item.itemId,
                        itemName: item.itemName,
                        quantity: item.quantity * repetitions * -1,
                        uri: item.imgsrc
                    })),
                    equipment: [{
                        equipmentId: crafting.equipment.id,
                        equipmentName: crafting.recipe.equipmentName,
                        quantity: repetitions,
                        uri: crafting.equipment.imgsrc
                    }],
                    craftingExpGained: (repetitions > 0) ? crafting.recipe.craftingExp * repetitions : undefined,
                    craftingLevelsGained: expRes?.craftingLevelsGained
                },
            };
        }
    }

    static async craftingCompleteCallback(
        socketManager: SocketManager,
        idleManager: IdleManager,
        userId: string,
        recipe: CraftingRecipeRes,
    ): Promise<void> {
        try {
            const updatedItemsInv = await deleteItemsFromUserInventory(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity));
            const updatedEquipmentInv = await mintEquipmentToUser(userId.toString(), recipe.equipmentId);

            socketManager.emitEvent(userId, 'update-inventory', {
                userId: userId,
                payload: [...updatedItemsInv, updatedEquipmentInv]
            });

            const expRes = await addCraftingExp(userId, recipe.craftingExp);

            socketManager.emitEvent(userId, 'update-crafting-exp', {
                userId: userId,
                payload: expRes,
            });

            await logCraftingActivity(
                userId,
                recipe.equipmentId,
                1,
                recipe.requiredItems.map(item => ({
                    itemId: item.itemId,
                    quantity: item.quantity,
                }))
            );

            if (!(await doesUserOwnItems(userId.toString(), recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity)))) {
                throw new Error(`User does not have all the required items for subsequent iteration.`);
            }

        } catch (error) {
            logger.error(`Error during crafting complete callback for user ${userId}: ${error}`);

            await idleManager.removeCraftingActivity(userId);

            socketManager.emitEvent(userId, 'crafting-stop', {
                userId: userId,
                payload: {
                    equipmentId: recipe.equipmentId,
                }
            });

            throw error;
        }
    }

    static async craftingStopCallback(
        socketManager: SocketManager,
        userId: string,
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
