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

        setupValidateLoginSocketHandlers(socket, dittoLedgerSocket, validateLoginManager, socketManager, idleManager)

        setupUserSocketHandlers(socket, idleManager, combatManager)

        setupItemsSocketHandlers(socket, socketManager, idleManager)

        setupCraftingSocketHandlers(socket, socketManager, idleManager)

        setupSlimeSocketHandlers(socket, socketManager, idleManager)

        setupCombatSocketHandlers(socket, socketManager, idleManager, combatManager)

        setupMissionSocketHandlers(socket, dittoLedgerSocket)

        setupDittoLedgerUserSocketHandlers(socket, dittoLedgerSocket)

        socket.on("disconnect", async () => {
            try {
                logger.info(`Adapter disconnected.`);
                const userIds = await socketManager.disconnectUsersBySocketId(socket.id);
                for (const userId of userIds) {
                    await idleManager.saveAllIdleActivitiesOnLogout(userId);
                }
            } catch (error) {
                logger.error(`Error disconnecting all users associated with adapter.`);
            }
        });
    })

    io.on('error', err => {
        logger.error(err)
    })
}
