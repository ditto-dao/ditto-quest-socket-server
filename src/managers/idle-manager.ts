import { CraftingRecipeRes } from '../sql-services/crafting-service';
import { mintEquipmentToUser } from '../sql-services/equipment-inventory-service';
import { deleteItemsFromUserInventory, doesUserOwnItems } from '../sql-services/item-inventory-service';
import { logger } from '../utils/logger';
import { SocketManager } from '../socket/socket-manager';

export type IdleActivity = 'crafting' | 'combat';

export class IdleManager {
    private socketManager: SocketManager;
    private currentIdleActivityByUser: Record<number, IdleActivity> = {};
    private idleActivityIntervalByUser: Record<number, NodeJS.Timeout> = {};
    private idleStopCallbacksByUser: Record<number, () => void> = {}; // Store user-specific callbacks

    constructor(socketManager: SocketManager) {
        this.socketManager = socketManager;
    }

    async startIdleCraftingForUser(userId: number, recipe: CraftingRecipeRes) {
        if (!(await doesUserOwnItems(userId, recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity)))) {
            throw new Error(`User does not have all the required items`);
        }

        // Stop any existing idle activity for this user
        this.stopIdleActivityForUser(userId);

        // Emit crafting-start before setting up the interval
        this.socketManager.emitEvent(userId, 'crafting-start', {
            userId: userId,
            payload: {
                equipmentId: recipe.equipmentId,
                startTimestamp: Date.now(),
            }
        });

        // Store the interval for continuous crafting
        this.idleActivityIntervalByUser[userId] = setInterval(async () => {
            try {
                const updatedItemsInv = await deleteItemsFromUserInventory(userId, recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity));
                const updatedEquipmentInv = await mintEquipmentToUser(userId, recipe.equipmentId);

                this.socketManager.emitEvent(userId, 'update-item-inventory', {
                    userId: userId,
                    payload: updatedItemsInv,
                });

                this.socketManager.emitEvent(userId, 'update-equipment-inventory', {
                    userId: userId,
                    payload: [{
                        equipmentInventory: updatedEquipmentInv,
                        remove: false,
                    }]
                });

                // Execute the crafting logic directly within the interval
                if (!(await doesUserOwnItems(userId, recipe.requiredItems.map(item => item.itemId), recipe.requiredItems.map(item => item.quantity)))) {
                    throw new Error(`User does not have all the required items`);
                }

                // Emit crafting-start for the next cycle
                this.socketManager.emitEvent(userId, 'crafting-start', {
                    userId: userId,
                    payload: {
                        equipmentId: recipe.equipmentId,
                        startTimestamp: Date.now(),
                    }
                });

            } catch (error) {
                logger.error(`Error during crafting for user ${userId}: ${error}`);
                this.stopIdleActivityForUser(userId);
            }
        }, recipe.durationS * 1000);

        this.currentIdleActivityByUser[userId] = 'crafting';
        this.idleStopCallbacksByUser[userId] = () => {
            this.socketManager.emitEvent(userId, 'crafting-stop', {
                userId: userId,
                payload: {
                    equipmentId: recipe.equipmentId,
                }
            });
        };

        logger.info(`Started idle crafting for user ${userId} for equipment: ${recipe.equipmentName}, equipmentId: ${recipe.equipmentId}.`);
    }

    stopCraftingForUser(userId: number) {
        if (this.currentIdleActivityByUser[userId] == 'crafting') this.stopIdleActivityForUser(userId);
    }

    private stopIdleActivityForUser(userId: number) {
        if (this.idleActivityIntervalByUser[userId]) {
            // Clear the interval
            clearInterval(this.idleActivityIntervalByUser[userId]);

            // Clear current idle activity
            delete this.currentIdleActivityByUser[userId]

            // Run the stored callback function if it exists
            if (this.idleStopCallbacksByUser[userId]) {
                this.idleStopCallbacksByUser[userId]();
                delete this.idleStopCallbacksByUser[userId]; // Remove the callback after running it
            }

            // Remove the interval from the record
            delete this.idleActivityIntervalByUser[userId];

            logger.info(`Idle activity for user ${userId} has been stopped.`);
        } else {
            logger.info(`No idle activity found for user ${userId}.`);
        }
    }
}
