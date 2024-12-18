import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { IdleCraftingManager } from "../../managers/idle-managers/crafting-idle-manager"
import { IdleManager } from "../../managers/idle-managers/idle-manager";
import { SocketManager } from "../socket-manager";

interface CraftEquipmentPayload {
    userId: number;
    equipmentId: number
}

export async function setupCraftingSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager
): Promise<void> {
    socket.on("craft-equipment", async (data: CraftEquipmentPayload) => {
        try {
            logger.info(`Received craft-equipment event from user ${data.userId}`)

            IdleCraftingManager.startCrafting(socketManager, idleManager, data.userId, data.equipmentId, Date.now());

        } catch (error) {
            logger.error(`Error processing craft-equipment: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to craft equipment'
            })
        }
    })

    socket.on("stop-craft-equipment", async (data: CraftEquipmentPayload) => {
        try {
            logger.info(`Received stop-craft-equipment event from user ${data.userId}`)
            
            IdleCraftingManager.stopCrafting(idleManager, data.userId, data.equipmentId);

        } catch (error) {
            logger.error(`Error processing stop-craft-equipment: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to stop crafting equipment'
            })
        }
    })

}