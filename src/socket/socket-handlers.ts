import { Server as SocketServer } from "socket.io"
import { logger } from "../utils/logger"
import { setupValidateLoginSocketHandlers } from "./handlers/validate-login-socket-handlers"
import { SocketManager } from "./socket-manager"
import { setupItemsSocketHandlers } from "./handlers/items-socket-handlers"
import { setupCraftingSocketHandlers } from "./handlers/crafting-handlers"
import { setupSlimeSocketHandlers } from "./handlers/slime-handlers"
import { IdleManager } from "../managers/idle-managers/idle-manager"
import { setupUserSocketHandlers } from "./handlers/user-socket-handlers"
import { Socket } from "socket.io-client"
import { setupDittoLedgerSocketServerHandlers, setupDittoLedgerUserSocketHandlers } from "./handlers/ditto-ledger-socket-handlers"
import { ValidateLoginManager } from "../managers/validate-login/validate-login-manager"
import { IdleCombatManager } from "../managers/idle-managers/combat/combat-idle-manager"
import { setupCombatSocketHandlers } from "./handlers/combat-handlers"
import AsyncLock from "async-lock"
import { setupMissionSocketHandlers } from "./handlers/mission-handlers"
import { requireActivityLogMemoryManager, requireSnapshotRedisManager, requireUserMemoryManager } from "../managers/global-managers/global-managers"

export const globalIdleSocketUserLock = new AsyncLock()

export interface EventPayloadWithUserId {
    userId: string,
    payload: any
}

export async function setupSocketHandlers(
    io: SocketServer,
    dittoLedgerSocket: Socket,
    socketManager: SocketManager,
    idleManager: IdleManager,
    combatManager: IdleCombatManager,
    validateLoginManager: ValidateLoginManager
): Promise<void> {

    setupDittoLedgerSocketServerHandlers(dittoLedgerSocket, validateLoginManager, socketManager, idleManager, combatManager);

    io.on("connection", async (socket) => {
        logger.info("An adapter has connected")

        setupValidateLoginSocketHandlers(socket, dittoLedgerSocket, validateLoginManager, socketManager, idleManager, combatManager)

        setupUserSocketHandlers(socket, idleManager, combatManager, dittoLedgerSocket)

        setupItemsSocketHandlers(socket, socketManager, idleManager)

        setupCraftingSocketHandlers(socket, socketManager, idleManager)

        setupSlimeSocketHandlers(socket, socketManager, idleManager)

        setupCombatSocketHandlers(socket, socketManager, idleManager, combatManager)

        setupMissionSocketHandlers(socket, dittoLedgerSocket)

        setupDittoLedgerUserSocketHandlers(socket, dittoLedgerSocket)

        socket.on("disconnect", async () => {
            try {
                logger.info(`🔌 Adapter disconnected (socketId: ${socket.id})`);

                // STEP 1: Get all users connected through this adapter
                const userIds = await socketManager.disconnectUsersBySocketId(socket.id);

                if (userIds.length === 0) {
                    logger.info(`No users were connected through adapter ${socket.id}`);
                    return;
                }

                logger.info(`🧹 Cleaning up ${userIds.length} users from disconnected adapter: ${userIds.join(', ')}`);

                // STEP 2: Process each user's cleanup
                const cleanupPromises = userIds.map(async (userId) => {
                    try {
                        logger.info(`🚪 Processing cleanup for user ${userId} (adapter disconnect)`);

                        const userMemoryManager = requireUserMemoryManager();
                        const activityLogMemoryManager = requireActivityLogMemoryManager();

                        // Save idle activities first (time-sensitive)
                        await idleManager.saveAllIdleActivitiesOnLogout(userId);

                        try {
                            // Stop any active battles immediately
                            await combatManager.endActiveBattleByUser(userId, false);

                            // Clear any pending battle spawns
                            await combatManager.stopCombat(idleManager, userId);

                            logger.info(`✅ Ended all combat activities for user ${userId} before logout`);
                        } catch (battleErr) {
                            logger.warn(`⚠️ Failed to clean up battles for user ${userId}: ${battleErr}`);
                            // Continue with logout even if battle cleanup fails
                        }

                        // Flush any buffered activity logs for this user
                        if (activityLogMemoryManager.hasUser(userId)) {
                            await activityLogMemoryManager.flushUser(userId);
                        }

                        // SINGLE comprehensive logout (handles everything):
                        // - Flush all pending user updates to database
                        // - Generate fresh snapshot FROM memory
                        // - Remove from memory
                        await userMemoryManager.logoutUser(userId, true);

                        logger.info(`✅ Successfully cleaned up user ${userId} (adapter disconnect)`);
                    } catch (userErr) {
                        logger.error(`❌ Failed to cleanup user ${userId} during adapter disconnect: ${userErr}`);

                        // Emergency cleanup - try to at least generate snapshot
                        try {
                            const userMemoryManager = requireUserMemoryManager();
                            const user = userMemoryManager.getUser(userId);
                            if (user) {
                                const snapshotRedisManager = requireSnapshotRedisManager();
                                await snapshotRedisManager.storeSnapshot(userId, user);
                                logger.info(`🚨 Emergency snapshot generated for user ${userId}`);
                            }
                        } catch (emergencyErr) {
                            logger.error(`💥 Emergency snapshot failed for user ${userId}: ${emergencyErr}`);
                        }
                    }
                });

                // STEP 3: Wait for all user cleanups to complete
                await Promise.allSettled(cleanupPromises);

                logger.info(`🔌 Completed cleanup for adapter disconnect (${userIds.length} users processed)`);

            } catch (error) {
                logger.error(`❌ Critical error during adapter disconnect cleanup: ${error}`);

                // Try to at least get the userIds for emergency cleanup
                try {
                    const userIds = await socketManager.disconnectUsersBySocketId(socket.id);
                    logger.error(`⚠️ Emergency: ${userIds.length} users may have lost data due to cleanup failure`);
                } catch (emergencyErr) {
                    logger.error(`❌ Failed emergency user identification: ${emergencyErr}`);
                }
            }
        });
    })

    io.on('error', err => {
        logger.error(err)
    })
}
