import { logger } from "./src/utils/logger"
import express from "express"
import { createServer } from "http"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts, createClient } from 'redis'
import { DefaultEventsMap, Server } from "socket.io"
import { setupSocketHandlers } from "./src/socket/socket-handlers"
import { setupGlobalErrorHandlers } from "./src/utils/global-error-handler"
import { PORT, SOCKET_ORIGIN, SOCKET_ORIGIN_DITTO_LEDGER, SOCKET_PATH, SOCKET_PATH_DITTO_LEDGER } from "./src/utils/config"
import { SocketManager } from "./src/socket/socket-manager"
import { IdleManager } from "./src/managers/idle-managers/idle-manager"
import { io } from 'socket.io-client'
import "@aws-sdk/crc64-nvme-crt";
import { ValidateLoginManager } from "./src/managers/validate-login/validate-login-manager"
import { IdleCombatManager } from "./src/managers/idle-managers/combat/combat-idle-manager"

require("@aws-sdk/crc64-nvme-crt");

async function main() {
    // Socket
    const app = express()
    const httpServer = createServer(app)
    const dqIo = new Server(httpServer, {
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

    // Connection to the ditto ledger socket server
    const dittoLedgerSocket = io(SOCKET_ORIGIN_DITTO_LEDGER, {
        path: SOCKET_PATH_DITTO_LEDGER,
        transports: ['websocket', 'polling'],
    });

    dittoLedgerSocket.on('connect', () => {
        logger.info('Connected to ditto ledger socket server')
    })

    // Redis
    const redisClient = createClient({
        url: 'redis://localhost:6379'
    })
    redisClient.on('error', (err) => logger.error(`Redis Client Error ${err}`))
    redisClient.connect().then(() => {
        logger.info('Connected to Redis')
    })

    // Socket manager
    const socketManager = new SocketManager(dqIo, dittoLedgerSocket)

    // Idle manager
    const combatManager = new IdleCombatManager(socketManager, dittoLedgerSocket)
    const idleManager = new IdleManager(redisClient, socketManager, dittoLedgerSocket)

    // Validate login manager
    const validateLoginManager = new ValidateLoginManager(dittoLedgerSocket, socketManager, idleManager, combatManager)

    await setupSocketHandlers(dqIo, dittoLedgerSocket, socketManager, idleManager, combatManager, validateLoginManager)

    setupGlobalErrorHandlers()

    httpServer.listen((PORT), () => {
        logger.info(`Server started on port ${PORT}`)
    })

    httpServer.on('error', (error) => {
        logger.error(`Server error: ${error}`)
    })

    process.on('SIGINT', () => gracefulShutdown(dqIo, redisClient, idleManager, socketManager))
    process.on('SIGTERM', () => gracefulShutdown(dqIo, redisClient, idleManager, socketManager))
}

async function gracefulShutdown(
    io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    idleManager: IdleManager,
    socketManager: SocketManager
) {
    await idleManager.saveAllUsersIdleActivities();

    socketManager.disconnectAllUsers();

    io.close(() => {
        logger.info('Socket server closed.')
    })

    await redisClient.quit()
    process.exit(0)
}

main()