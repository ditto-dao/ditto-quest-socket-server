import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { LOGOUT_USER_FROM_TMA_EVENT, STORE_FINGERPRINT_EVENT, TG_VALIDATE_ERROR_EVENT, VALIDATE_LOGIN_EVENT } from "../events";
import { ValidateLoginManager } from "../../managers/validate-login/validate-login-manager";
import { storeFingerprint } from "../../sql-services/user-fingerprint";

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
    validateLoginManager: ValidateLoginManager,
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
            logger.info(`🚪 Processing manual logout request for user ${userId}`);

            // Use the validateLoginManager which properly handles session state
            const success = await validateLoginManager.handleLogoutRequest(userId, false);

            if (!success) {
                logger.warn(`⚠️ Manual logout failed for user ${userId}`);
            } else {
                logger.info(`✅ Manual logout completed for user ${userId}`);
            }
        } catch (err) {
            logger.error(`❌ Failed to logout user ${userId}: ${err}`);
        }
    });


    socket.on(STORE_FINGERPRINT_EVENT, async (data: StoreFingerprintPayload) => {
        try {
            await storeFingerprint(data.userId, data.fingerprint, data.ip);
        } catch (err) {
            logger.error(`Failed to store fingerprint for user ${data.userId} in backend: ${err}`)
        }
    })
}