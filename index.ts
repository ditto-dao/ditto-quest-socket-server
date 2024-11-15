import { logger } from "./src/utils/logger"
import express from "express"
import { createServer } from "http"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts, createClient } from 'redis'
import { DefaultEventsMap, Server } from "socket.io"
import { setupSocketHandlers } from "./src/socket/socket-handlers"
import { setupGlobalErrorHandlers } from "./src/utils/global-error-handler"
import { PORT, SOCKET_ORIGIN, SOCKET_PATH } from "./src/utils/config"
import { SocketManager } from "./src/socket/socket-manager"
import { IdleManager } from "./src/managers/idle-manager"


async function main() {
    // Socket
    const app = express()
    const httpServer = createServer(app)
    const io = new Server(httpServer, {
        cors: {
            origin: SOCKET_ORIGIN.split(" "),
            methods: ["GET", "POST"],
            credentials: true
        },
        path: SOCKET_PATH,
        transports: ['websocket', 'polling'],
    })
    logger.info(`SOCKET_ORIGIN: ${SOCKET_ORIGIN}`)
    logger.info(`SOCKET_PATH: ${SOCKET_PATH}`)

/*     // Redis
    const redisClient = createClient({
        url: 'redis://localhost:6379'
    })
    redisClient.on('error', (err) => logger.error(`Redis Client Error ${err}`))
    redisClient.connect().then(() => {
        logger.info('Connected to Redis')
    }) */

    // Socket manager
    const socketManager = new SocketManager(io)

    // Idle manager
    const idleManager = new IdleManager(socketManager)

    await setupSocketHandlers(io, socketManager, idleManager)

    setupGlobalErrorHandlers()

    httpServer.listen((PORT), () => {
        logger.info(`Server started on port ${PORT}`)
    })

    httpServer.on('error', (error) => {
        logger.error(`Server error: ${error}`)
    })

    process.on('SIGINT', () => gracefulShutdown(io))
    process.on('SIGTERM', () => gracefulShutdown(io))
}

async function gracefulShutdown(
    io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    //redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>, 
) {
    io.close(() => {
        logger.info('Socket server closed.')
    })

    //await redisClient.quit()
    process.exit(0)
}

main()