import { Socket } from "socket.io"
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { SocketManager } from "../socket-manager"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { LEDGER_REMOVE_USER_SOCKET_EVENT, LOGOUT_USER_FROM_TMA_EVENT, TG_VALIDATE_ERROR_EVENT, VALIDATE_LOGIN_EVENT } from "../events";
import { ValidateLoginManager } from "../../managers/validate-login/validate-login-manager";

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

export async function setupValidateLoginSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    dittoLedgerSocket: DittoLedgerSocket,
    validateLoginManager: ValidateLoginManager,
    socketManager: SocketManager,
    idleManager: IdleManager
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
            socketManager.removeSocketIdCacheForUser(userId)
            await idleManager.saveAllIdleActivitiesOnLogout(userId)
            dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString())
        } catch (err) {
            logger.error(`Failed to logout user ${userId} in backend: ${err}`)
        }
    })
}