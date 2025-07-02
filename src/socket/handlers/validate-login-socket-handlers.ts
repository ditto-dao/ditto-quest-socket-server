import { Socket } from "socket.io"
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { SocketManager } from "../socket-manager"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { LEDGER_REMOVE_USER_SOCKET_EVENT, LOGOUT_USER_FROM_TMA_EVENT, STORE_FINGERPRINT_EVENT, TG_VALIDATE_ERROR_EVENT, VALIDATE_LOGIN_EVENT } from "../events";
import { ValidateLoginManager } from "../../managers/validate-login/validate-login-manager";
import { storeFingerprint } from "../../sql-services/user-fingerprint";
import { requireActivityLogMemoryManager, requireSnapshotRedisManager, requireUserMemoryManager } from "../../managers/global-managers/global-managers";
import { IdleCombatManager } from "../../managers/idle-managers/combat/combat-idle-manager";

interface ValidateLoginPayload {
    initData: string
    userData: WebAppUser
    socketId: string
}

interface WebAppUser {
    id: number
    username?: string
    first_name?: string
}

interface StoreFingerprintPayload {
    userId: string;
    fingerprint: string;
    ip: string;
}

export async function setupValidateLoginSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    dittoLedgerSocket: DittoLedgerSocket,
    validateLoginManager: ValidateLoginManager,
    socketManager: SocketManager,
    idleManager: IdleManager,
    combatManager: IdleCombatManager
): Promise<void> {
    socket.on(VALIDATE_LOGIN_EVENT, async (data: ValidateLoginPayload) => {
        try {
            logger.info(`Received validate-login event from user ${data.userData.first_name}`)
            await validateLoginManager.processUserLoginEvent(socket, data)
        } catch (error) {
            logger.error(`Error validating telegram init data: ${error}`)
            socket.emit(TG_VALIDATE_ERROR_EVENT, {
                userId: data.userData.id,
                msg: 'Failed to validate telegram login'
            })
        }
    })

    socket.on(LOGOUT_USER_FROM_TMA_EVENT, async (userId: string) => {
        try {
            logger.info(`🚪 Processing logout for user ${userId}`);

            const userMemoryManager = requireUserMemoryManager();
            const activityLogMemoryManager = requireActivityLogMemoryManager();

            // Check if user is actually in memory first
            if (!userMemoryManager.hasUser(userId)) {
                logger.warn(`⚠️ User ${userId} not in memory during logout - likely already logged out`);

                // Still clean up socket since they triggered logout
                socketManager.removeSocketIdCacheForUser(userId);
                dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());

                logger.info(`✅ Cleaned up socket for already-logged-out user ${userId}`);
                return;
            }

            // STEP 1: Save all idle activities first (this is time-sensitive)
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

            // STEP 2: Flush activity logs for this user (before user data flush)
            if (activityLogMemoryManager.hasUser(userId)) {
                await activityLogMemoryManager.flushUser(userId);
                logger.info(`✅ Flushed activity logs for user ${userId}`);
            }

            // STEP 3: SINGLE comprehensive logout (handles flush + snapshot + memory removal)
            // This already includes:
            // - Flush all pending user updates (slimes, inventory, user fields)
            // - Generate fresh snapshot from memory
            // - Remove from memory
            const logoutSuccess = await userMemoryManager.logoutUser(userId, true);

            if (!logoutSuccess) {
                logger.warn(`⚠️ Logout partially failed for user ${userId} - user kept in memory`);

                try {
                    const user = userMemoryManager.getUser(userId);
                    if (user) {
                        const snapshotRedisManager = requireSnapshotRedisManager();
                        await snapshotRedisManager.storeSnapshot(userId, user);
                        logger.info(`🚨 Generated emergency snapshot for failed logout: ${userId}`);
                    }
                } catch (emergencyErr) {
                    logger.error(`Failed emergency snapshot: ${emergencyErr}`);
                }
            }

            // STEP 4: Clean up socket cache and notify ledger (ALWAYS do this)
            socketManager.removeSocketIdCacheForUser(userId);
            dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());

            logger.info(`✅ Successfully logged out user ${userId}`);
        } catch (err) {
            logger.error(`❌ Failed to logout user ${userId} in backend: ${err}`);

            // Even if something fails, still clean up socket cache to prevent issues
            try {
                socketManager.removeSocketIdCacheForUser(userId);
                dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());
            } catch (cleanupErr) {
                logger.error(`❌ Failed to cleanup socket for user ${userId}: ${cleanupErr}`);
            }
        }
    })

    socket.on(STORE_FINGERPRINT_EVENT, async (data: StoreFingerprintPayload) => {
        try {
            await storeFingerprint(data.userId, data.fingerprint, data.ip);
        } catch (err) {
            logger.error(`Failed to store fingerprint for user ${data.userId} in backend: ${err}`)
        }
    })
}