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
import { snapshotMetrics } from "./src/workers/snapshot/snapshot-metrics"
import { GameCodexManager } from "./src/managers/game-codex/game-codex-manager"
import { getActivityLogMemoryManager, getUserMemoryManager, initializeGlobalManagers, requireActivityLogMemoryManager, requireSnapshotRedisManager, requireUserMemoryManager } from "./src/managers/global-managers/global-managers"
import { IntractVerificationAPI } from "./src/intract/intract-verification"

require("@aws-sdk/crc64-nvme-crt");

async function main() {
    logger.info('🚀 Starting Ditto Quest Server with Memory-First Architecture...');

    // ========== STEP 1: INITIALIZE GAME CODEX (CRITICAL - BEFORE EVERYTHING ELSE) ==========
    try {
        logger.info('📚 Initializing Game Codex in-memory cache...');
        await GameCodexManager.initialize();
        logger.info('✅ Game Codex ready - all static data loaded into memory');
    } catch (error) {
        logger.error('❌ CRITICAL: Game Codex initialization failed');
        logger.error('🚨 Server cannot start without game data');
        logger.error(`Error: ${error}`);
        process.exit(1);
    }

    // ========== STEP 2: SETUP SERVER INFRASTRUCTURE ==========

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
    await redisClient.connect();
    logger.info('✅ Connected to Redis')

    // ========== STEP 3: INITIALIZE GLOBAL MANAGERS ==========
    await initializeGlobalManagers(redisClient);

    // ========== STEP 4: INITIALIZE GAME MANAGERS ==========

    // Socket manager
    const socketManager = new SocketManager(dqIo, dittoLedgerSocket)

    // Idle manager
    const combatManager = new IdleCombatManager(socketManager, dittoLedgerSocket, redisClient)
    const idleManager = new IdleManager(redisClient, socketManager, dittoLedgerSocket)

    // Validate login manager
    const validateLoginManager = new ValidateLoginManager(dittoLedgerSocket, socketManager, idleManager, combatManager)

    // ========== STEP 5: SETUP SOCKET HANDLERS ==========
    await setupSocketHandlers(dqIo, dittoLedgerSocket, socketManager, idleManager, combatManager, validateLoginManager, requireUserMemoryManager(), requireActivityLogMemoryManager());

    setupGlobalErrorHandlers()

    // ========== STEP 6: SETUP PERIODIC TASKS ==========

    // Flush activity logs every 60 seconds
    setInterval(async () => {
        try {
            const activityManager = getActivityLogMemoryManager();
            if (activityManager) {
                await activityManager.flushAll();
            }
        } catch (error) {
            logger.error("❌ Failed to flush activity logs:", error);
        }
    }, 60000);

    // Auto-logout inactive users with proper cleanup every 10 minutes  
    setInterval(async () => {
        try {
            const userMemoryManager = requireUserMemoryManager();
            const activityLogMemoryManager = requireActivityLogMemoryManager();

            if (userMemoryManager) {
                const loggedOut = await userMemoryManager.autoLogoutInactiveUsers(
                    1800000,                    // 30 minutes inactive = logout
                    socketManager,
                    dittoLedgerSocket,
                    idleManager,
                    activityLogMemoryManager
                );

                if (loggedOut > 0) {
                    logger.info(`🧹 Auto-logged out ${loggedOut} inactive users with full cleanup`);
                }
            }
        } catch (error) {
            logger.error("❌ Failed to auto-logout inactive users:", error);
        }
    }, 600000); // Check every 10 minutes

    // Flush all dirty users every 5 minutes
    setInterval(async () => {
        try {
            const userManager = getUserMemoryManager();
            if (userManager) {
                await userManager.flushAllDirtyUsers();
                logger.info("✅ Flushed all dirty users to database");
            }
        } catch (error) {
            logger.error("❌ Failed to flush dirty users:", error);
        }
    }, 300000);

    // Metrics logging
    setInterval(async () => {
        await snapshotMetrics.logMetrics();
        snapshotMetrics.reset();
    }, 3600000);

    // ========== STEP 7: SETUP ADMIN ENDPOINTS ==========

    // Setup Intract API routes
    setupIntractRoutes(app, redisClient);

    // Health check route
    app.get('/', async (req, res) => {
        try {
            const snapshotManager = requireSnapshotRedisManager();
            const snapshotStats = snapshotManager ? await snapshotManager.getSnapshotStats() : null;

            res.status(200).json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                gameCodexReady: GameCodexManager.isReady(),
                gameCodexStats: GameCodexManager.getStats(),
                snapshotWorker: snapshotStats ? {
                    totalSnapshots: snapshotStats.totalSnapshots,
                } : null
            });
        } catch (error) {
            res.status(503).json({
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    // Game Codex stats endpoint
    app.get('/admin/game-codex', (req, res) => {
        try {
            const stats = GameCodexManager.getStats();
            res.json({
                success: true,
                ...stats
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to get game codex stats',
                details: error
            });
        }
    });

    // Snapshot metrics
    app.get('/admin/snapshot-metrics', async (req, res) => {
        try {
            const metrics = await snapshotMetrics.getMetrics();
            const snapshotManager = requireSnapshotRedisManager();
            const redisStats = snapshotManager ? await snapshotManager.getSnapshotStats() : null;

            res.json({
                ...metrics,
                redis: redisStats
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get snapshot metrics' });
        }
    });

    // ========== STEP 8: START SERVER ==========

    httpServer.listen((PORT), () => {
        logger.info(`🎉 Server started successfully on port ${PORT}`)
        logger.info(`📊 Game Codex Status: ${GameCodexManager.isReady() ? 'READY' : 'NOT READY'}`)

        const stats = GameCodexManager.getStats();
        logger.info(`📈 Total Game Data Entries: ${Object.values(stats.counts).reduce((a, b) => a + b, 0)}`)
        logger.info(`🚀 Memory-First Architecture: ACTIVE`)
        logger.info(`📸 Snapshot System: REDIS-BASED`)
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
    logger.info('🛑 Graceful shutdown initiated...');

    try {
        const userMemoryManager = getUserMemoryManager();
        const activityLogMemoryManager = getActivityLogMemoryManager();

        if (!userMemoryManager || !activityLogMemoryManager) {
            logger.warn('⚠️ Memory managers not available during shutdown');
            return;
        }

        // STEP 1: Save all idle activities (time-sensitive)
        logger.info('⏰ Saving all idle activities...');
        await idleManager.saveAllUsersIdleActivities();

        // STEP 2: Flush all pending user data from memory to database
        logger.info("💾 Flushing all dirty users before shutdown...");
        await userMemoryManager.flushAllDirtyUsers();

        // STEP 3: Flush all activity logs
        logger.info("📝 Flushing all activity logs...");
        await activityLogMemoryManager.flushAll();

        // STEP 4: Generate snapshots for all active users (CRITICAL - BEFORE clearing memory)
        logger.info("📸 Generating snapshots for all active users...");
        const activeUsers = userMemoryManager.getActiveUsers();

        if (activeUsers.length > 0) {
            const snapshotRedisManager = requireSnapshotRedisManager();
            let snapshotCount = 0;

            const snapshotPromises = activeUsers.map(async (userId) => {
                try {
                    const user = userMemoryManager.getUser(userId);
                    if (user) {
                        await snapshotRedisManager.storeSnapshot(userId, user);
                        snapshotCount++;
                        logger.debug(`📸 Generated snapshot for user ${userId}`);
                    }
                } catch (snapErr) {
                    logger.error(`❌ Failed to generate shutdown snapshot for user ${userId}: ${snapErr}`);
                }
            });

            // Wait for all snapshots to complete
            await Promise.allSettled(snapshotPromises);
            logger.info(`📸 Generated ${snapshotCount}/${activeUsers.length} user snapshots`);
        }

        // STEP 5: Disconnect all users AFTER data is safely persisted
        logger.info("🔌 Disconnecting all users...");
        socketManager.disconnectAllUsers();

        // STEP 6: NOW safe to clear memory managers
        logger.info("🧹 Clearing memory managers...");
        userMemoryManager.clear();
        activityLogMemoryManager.clear();

        // Close socket server
        io.close(() => {
            logger.info('🔌 Socket server closed.')
        })

        // Close Redis connection
        await redisClient.quit()
        logger.info('🔴 Redis connection closed')

        logger.info('✅ Graceful shutdown complete - all data safely persisted');
        process.exit(0)

    } catch (error) {
        logger.error('❌ Error during shutdown:', error);

        // Emergency cleanup attempt
        try {
            logger.info('🚨 Attempting emergency cleanup...');
            socketManager.disconnectAllUsers();
            await redisClient.quit();
        } catch (emergencyErr) {
            logger.error('💥 Emergency cleanup failed:', emergencyErr);
        }

        process.exit(1)
    }
}

function setupIntractRoutes(app: express.Application, redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>): void {
    logger.info('🎯 Setting up Intract API routes...');

    // Add JSON middleware FIRST
    app.use(express.json());

    const router = express.Router();
    const intractAPI = new IntractVerificationAPI(redisClient);

    // Health check endpoints
    router.get('/health', (req, res) => intractAPI.healthCheck(req, res));
    router.get('/ping', (req, res) => intractAPI.healthCheck(req, res));

    // Task verification endpoints
    router.post('/verify/ditto-200', (req, res) => intractAPI.verifyDitto200Task(req, res));
    router.post('/verify/combat-level-10', (req, res) => intractAPI.verifyCombatLevel10Task(req, res));

    // Mount the router
    app.use('/api/intract', router);

    logger.info('✅ Intract API routes configured');
}

main()