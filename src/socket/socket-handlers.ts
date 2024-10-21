import { Server as SocketServer } from "socket.io"
import { logger } from "../utils/logger"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"

export interface EventPayloadWithUserId {
    userId: number,
    payload: any
}

export async function setupSocketHandlers(
    io: SocketServer, 
): Promise<void> {

    io.on("connection", async (socket) => {
        logger.info("An adapter has connected")

        //setupValidateLoginSocketHandlers(socket, redisClient, socketManager, pm, balanceManager, clickManager, lm)

        socket.on("disconnect", async (socket) => {
            logger.info("An adapter has disconnected")
        })
    })

    io.on('error', err => {
        logger.error(err)
    })
}
