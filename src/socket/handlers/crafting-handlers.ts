import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"
import { logger } from "../../utils/logger"
import { IdleManager } from "../../managers/idle-manager"
import { getCraftingRecipeForEquipment } from "../../sql-services/crafting-service"

interface CraftEquipmentPayload {
    userId: number,
    equipmentId: number
}

export async function setupCraftingSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    //redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    idleManager: IdleManager
): Promise<void> {
    socket.on("craft-equipment", async (data: CraftEquipmentPayload) => {
        try {
            logger.info(`Received craft-equipment event from user ${data.userId}`)

            const recipe = await getCraftingRecipeForEquipment(data.equipmentId);

            idleManager.startIdleCraftingForUser(data.userId, recipe);

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
            
            idleManager.stopCraftingForUser(data.userId);

        } catch (error) {
            logger.error(`Error processing stop-craft-equipment: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to stop crafting equipment'
            })
        }
    })

}