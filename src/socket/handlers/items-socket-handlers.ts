import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { IdleFarmingManager } from "../../managers/idle-managers/farming-idle-manager"
import { SocketManager } from "../socket-manager"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { globalIdleSocketUserLock } from "../socket-handlers"
import { USER_UPDATE_EVENT } from "../events"
import { deleteItemsFromUserInventory, mintItemToUser } from "../../operations/item-inventory-operations"
import { getItemById } from "../../operations/item-operations"
import { incrementUserGold } from "../../operations/user-operations"

interface MintItemPayload {
    userId: string,
    itemId: number,
    quantity: number
}

interface FarmItemPayload {
    userId: string;
    itemId: number
}

interface SellItemPayload {
    userId: string;
    itemId: number;
    quantity: number;
}

export async function setupItemsSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager
): Promise<void> {
    socket.on("mint-item", async (data: MintItemPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received mint-item event from user ${data.userId}`)

                const res = await mintItemToUser(data.userId.toString(), data.itemId, data.quantity)

                socket.emit("update-inventory", {
                    userId: data.userId,
                    payload: [res]
                })

            } catch (error) {
                logger.error(`Error processing mint-item: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to mint item'
                })
            }
        });
    })

    socket.on("farm-item", async (data: FarmItemPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received farm-item event: ${JSON.stringify(data)}`);

                const item = await getItemById(data.itemId);

                if (!item) throw new Error(`Item not found.`);

                IdleFarmingManager.startFarming(socketManager, idleManager, data.userId, item, Date.now());
            } catch (error) {
                logger.error(`Error processing farm-item: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to farm item'
                })
            }
        });
    })

    socket.on("stop-farm-item", async (data: FarmItemPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received stop-farm-item event from user ${data.userId}`)

                IdleFarmingManager.stopFarming(idleManager, data.userId);

            } catch (error) {
                logger.error(`Error processing stop-craft-equipment: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to stop farm item'
                })
            }
        })
    });

    socket.on("sell-item", async (data: SellItemPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received sell-item event from user ${data.userId}`);

                const item = await getItemById(data.itemId);
                if (!item) throw new Error(`Unable to find item`);

                const goldBalance = await incrementUserGold(data.userId, item.sellPriceGP * data.quantity);

                const inv = await deleteItemsFromUserInventory(data.userId, [data.itemId], [data.quantity]);

                socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                    userId: data.userId,
                    payload: {
                        goldBalance
                    }
                });

                socket.emit("update-inventory", {
                    userId: data.userId,
                    payload: inv
                });
            } catch (error) {
                logger.error(`Error processing sell-item: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to sell items'
                })
            }
        })
    });
}