import { Server as SocketServer } from "socket.io"
import { logger } from "../utils/logger"
//import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"
import { setupValidateLoginSocketHandlers } from "./handlers/validate-login-socket-handlers"
import { SocketManager } from "./socket-manager"
import { setupItemsSocketHandlers } from "./handlers/items-socket-handlers"
import { IdleManager } from "../managers/idle-manager"
import { setupCraftingSocketHandlers } from "./handlers/crafting-handlers"
import { setupSlimeSocketHandlers } from "./handlers/slime-handlers"

export interface EventPayloadWithUserId {
    userId: number,
    payload: any
}

export async function setupSocketHandlers(
    io: SocketServer, 
    socketManager: SocketManager,
    idleManager: IdleManager
): Promise<void> {

    io.on("connection", async (socket) => {
        logger.info("An adapter has connected")

        setupValidateLoginSocketHandlers(socket, socketManager)

        setupItemsSocketHandlers(socket)

        setupCraftingSocketHandlers(socket, idleManager)

        setupSlimeSocketHandlers(socket)

        socket.on("disconnect", async (socket) => {
            logger.info("An adapter has disconnected")
        })
    })

    io.on('error', err => {
        logger.error(err)
    })
}
