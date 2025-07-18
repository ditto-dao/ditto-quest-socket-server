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
import { setupShopSocketHandlers } from "./handlers/shop-handlers"

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
    validateLoginManager: ValidateLoginManager,
): Promise<void> {

    setupDittoLedgerSocketServerHandlers(dittoLedgerSocket, validateLoginManager, socketManager, idleManager, combatManager);

    io.on("connection", async (socket) => {
        logger.info("An adapter has connected")

        setupValidateLoginSocketHandlers(socket, validateLoginManager)

        setupUserSocketHandlers(socket, idleManager, combatManager, dittoLedgerSocket)

        setupItemsSocketHandlers(socket, socketManager, idleManager)

        setupCraftingSocketHandlers(socket, socketManager, idleManager)

        setupSlimeSocketHandlers(socket, socketManager, idleManager)

        setupCombatSocketHandlers(socket, socketManager, idleManager, combatManager)

        setupMissionSocketHandlers(socket, dittoLedgerSocket)

        setupDittoLedgerUserSocketHandlers(socket, dittoLedgerSocket)

        setupShopSocketHandlers(socket, socketManager)

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

                // STEP 2: Process each user's cleanup using coordinated logout through ValidateLoginManager
                const cleanupPromises = userIds.map(async (userId) => {
                    try {
                        logger.info(`🚪 Processing cleanup for user ${userId} (adapter disconnect)`);

                        // Use ValidateLoginManager which handles UserSessionManager properly
                        const success = await validateLoginManager.handleLogoutRequest(
                            userId,
                            true // Force logout since adapter is disconnected
                        );

                        if (success) {
                            logger.info(`✅ Successfully cleaned up user ${userId} (adapter disconnect)`);
                        } else {
                            logger.warn(`⚠️ Partial cleanup for user ${userId} (adapter disconnect)`);
                        }
                    } catch (userErr) {
                        logger.error(`❌ Failed to cleanup user ${userId} during adapter disconnect: ${userErr}`);
                        // Emergency cleanup is already handled in coordinatedLogout
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
