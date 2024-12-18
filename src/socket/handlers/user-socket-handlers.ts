import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { equipEquipmentForUser } from "../../sql-services/user-service";

interface EquipPayload {
    userId: number;
    inventoryId: number;
}

export async function setupUserSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
): Promise<void> {
    socket.on("equip-equipment", async (data: EquipPayload) => {
        try {
            logger.info(`Received equip-equipment event from user ${data.userId}`)
            const res = await equipEquipmentForUser(data.userId.toString(), data.inventoryId);

            socket.emit("equipped-update", {
                userId: data.userId,
                payload: res
            });

        } catch (error) {
            logger.error(`Error processing equip-equipment: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to equip equipment'
            })
        }
    })

}