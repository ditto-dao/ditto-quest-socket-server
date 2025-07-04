import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { IdleCraftingManager } from "../../managers/idle-managers/crafting-idle-manager"
import { IdleManager } from "../../managers/idle-managers/idle-manager";
import { SocketManager } from "../socket-manager";
import { globalIdleSocketUserLock } from "../socket-handlers"
import { USER_UPDATE_EVENT } from "../events";
import { getEquipmentById } from "../../operations/equipment-operations";
import { getCraftingRecipeForEquipment } from "../../operations/crafting-operations";
import { getEquippedByEquipmentTypeMemory, incrementUserGold } from "../../operations/user-operations";
import { deleteEquipmentFromUserInventory } from "../../operations/equipment-inventory-operations";
import { requireUserMemoryManager } from "../../managers/global-managers/global-managers";

interface CraftEquipmentPayload {
    userId: string;
    equipmentId: number
}

interface SellEquipmentPayload {
    userId: string;
    equipmentId: number;
    quantity: number;
}

export async function setupCraftingSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager
): Promise<void> {
    socket.on("craft-equipment", async (data: CraftEquipmentPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received craft-equipment event from user ${data.userId}`)

                const equipment = await getEquipmentById(data.equipmentId);

                if (!equipment) throw new Error(`Equipment of ID ${data.equipmentId} not found.`)

                const recipe = await getCraftingRecipeForEquipment(data.equipmentId);

                IdleCraftingManager.startCrafting(socketManager, idleManager, data.userId, equipment, recipe, Date.now());

            } catch (error) {
                logger.error(`Error processing craft-equipment: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to craft equipment'
                })
            }
        });
    })

    socket.on("sell-equipment", async (data: SellEquipmentPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received sell-equipment event from user ${data.userId}`);

                const equipment = await getEquipmentById(data.equipmentId);
                if (!equipment) throw new Error(`Unable to find equipment`);

                const equippedItem = await getEquippedByEquipmentTypeMemory(data.userId, equipment.type);
                const isEquipped = equippedItem && equippedItem.equipmentId === data.equipmentId;

                const userMemoryManager = requireUserMemoryManager();
                const inventoryItem = userMemoryManager.findInventoryByEquipmentId(data.userId, data.equipmentId);

                if (!inventoryItem) {
                    throw new Error(`Equipment not found in inventory`);
                }

                if (isEquipped && inventoryItem.quantity <= data.quantity) {
                    throw new Error(`Cannot sell equipped item - unequip first or keep at least 1 in inventory`);
                }

                const goldBalance = await incrementUserGold(data.userId, equipment.sellPriceGP * data.quantity);
                const inv = await deleteEquipmentFromUserInventory(data.userId, [data.equipmentId], [data.quantity]);

                socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                    userId: data.userId,
                    payload: { goldBalance }
                });

                socket.emit("update-inventory", {
                    userId: data.userId,
                    payload: inv
                });
            } catch (error) {
                logger.error(`Error processing sell-equipment: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: `Failed to sell equipment: ${(error as Error).message}`
                })
            }
        })
    });

    socket.on("stop-craft-equipment", async (data: CraftEquipmentPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received stop-craft-equipment event from user ${data.userId}`)

                IdleCraftingManager.stopCrafting(idleManager, data.userId);

            } catch (error) {
                logger.error(`Error processing stop-craft-equipment: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to stop crafting equipment'
                })
            }
        })
    });
}