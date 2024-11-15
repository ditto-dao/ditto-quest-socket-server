import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"
import { logger } from "../../utils/logger"
import { burnSlime, generateRandomGen0Slime } from "../../sql-services/slime"
import { GEN_0_SLIME_TRAIT_PROBABILITIES } from "../../utils/config"

interface BurnSlimeRequest {
    userId: number,
    slimeId: number
}

export async function setupSlimeSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    //redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
): Promise<void> {
    socket.on("mint-gen-0-slime", async (userId: number) => {
        try {
            logger.info(`Received mint-gen-0-slime event from user ${userId}`)

            const slime = await generateRandomGen0Slime(userId, GEN_0_SLIME_TRAIT_PROBABILITIES)

            socket.emit("slime-mint-update", {
                userId: userId,
                payload: slime
            })
        } catch (error) {
            logger.error(`Error processing mint-gen-0-slime: ${error}`)
            socket.emit('error', {
                userId: userId,
                msg: 'Failed to mint gen 0 slime'
            })
        }
    })

    socket.on("burn-slime", async (data: BurnSlimeRequest) => {
        try {
            logger.info(`Received burn-slime event from user ${data.userId}`)

            const res = await burnSlime(data.userId, data.slimeId)

            socket.emit("slime-burn-update", {
                userId: data.userId,
                payload: res
            })
        } catch (error) {
            logger.error(`Error processing burn-slime: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to burn slime'
            })
        }
    })

}