import { Server as SocketServer } from "socket.io"
import { logger } from "../utils/logger"
//import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"
import { setupValidateLoginSocketHandlers } from "./handlers/validate-login-socket-handlers"
import { SocketManager } from "./socket-manager"
import { setupItemsSocketHandlers } from "./handlers/items-socket-handlers"
import { setupCraftingSocketHandlers } from "./handlers/crafting-handlers"
import { setupSlimeSocketHandlers } from "./handlers/slime-handlers"
import { IdleManager } from "../managers/idle-managers/idle-manager"
import { setupUserSocketHandlers } from "./handlers/user-socket-handlers"

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

        setupValidateLoginSocketHandlers(socket, socketManager, idleManager)

        setupUserSocketHandlers(socket)

        setupItemsSocketHandlers(socket, socketManager, idleManager)

        setupCraftingSocketHandlers(socket, socketManager, idleManager)

        setupSlimeSocketHandlers(socket, socketManager, idleManager)

        socket.on("disconnect", async (socket) => {
            logger.info("An adapter has disconnected")
        })
    })

    io.on('error', err => {
        logger.error(err)
    })
}
