import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { equipEquipmentForUser, getEquippedByEquipmentType, unequipEquipmentForUser } from "../../sql-services/user-service";
import { EquipmentType } from "@prisma/client";

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
            await equipEquipmentForUser(data.userId.toString(), data.inventoryId).catch(err => {
                socket.emit("unequip-update", {
                    userId: data.userId,
                    payload: data.inventoryId
                });
                throw err
            });
        } catch (error) {
            logger.error(`Error processing equip-equipment: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to equip equipment'
            })
        }
    })

    socket.on("unequip-equipment", async (data: { userId: number; equipmentType: EquipmentType }) => {
        try {
            logger.info(`Received unequip-equipment event from user ${data.userId} for type ${data.equipmentType}`);

            // Store the currently equipped item before attempting to unequip
            const currentEquipped = await getEquippedByEquipmentType(data.userId.toString(), data.equipmentType);

            // Attempt to unequip the item
            const success = await unequipEquipmentForUser(data.userId.toString(), data.equipmentType);

            if (success) {
                logger.info(`Successfully unequipped ${data.equipmentType} for user ${data.userId}`);
            } else {
                logger.info(`Nothing to unequip for ${data.equipmentType} for user ${data.userId}`);
            }

            // If unequip fails, emit the current equipped state to the frontend to undo changes
            if (!success && currentEquipped) {
                socket.emit("equip-update", {
                    userId: data.userId,
                    payload: currentEquipped,
                });
            }
        } catch (error) {
            logger.error(`Error processing unequip-equipment: ${error}`);

            // On error, emit the current equipped state to the frontend to undo changes
            const currentEquipped = await getEquippedByEquipmentType(data.userId.toString(), data.equipmentType);

            socket.emit("equip-update", {
                userId: data.userId,
                payload: currentEquipped,
            });

            // Additionally, send an error message
            socket.emit("error", {
                userId: data.userId,
                msg: `Failed to unequip ${data.equipmentType}`,
            });
        }
    });


}