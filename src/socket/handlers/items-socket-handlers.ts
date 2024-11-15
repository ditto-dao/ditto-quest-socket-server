import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"
import { logger } from "../../utils/logger"
import { mintItemToUser } from "../../sql-services/item-inventory-service"

interface MintItemPayload {
    userId: number,
    itemId: number,
    quantity: number
}

export async function setupItemsSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    //redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
): Promise<void> {
    socket.on("mint-item", async (data: MintItemPayload) => {
        try {
            logger.info(`Received mint-item event from user ${data.userId}`)

            const res = await mintItemToUser(data.userId, data.itemId, data.quantity)

            socket.emit("update-item-inventory", {
                userId: data.userId,
                payload: [{
                    ...res,
                    qtyReceived: data.quantity
                }]
            })
        } catch (error) {
            logger.error(`Error processing mint-item: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to mint item'
            })
        }
    })

}