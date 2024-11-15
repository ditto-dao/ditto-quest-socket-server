import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from "redis"
import * as crypto from 'crypto'
import { logger } from "../../utils/logger"
import { SocketManager } from "../socket-manager"
import { BOT_TOKEN } from "../../utils/config"
import { createUser, getUserData, userExists } from "../../sql-services/user-service"

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
    //redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
    socketManager: SocketManager,
): Promise<void> {
    socket.on("validate-login", async (data: ValidateLoginPayload) => {
        try {
            logger.info(`Received validate-login event from user ${data.userData.first_name}`)
            const initData = data.initData
            const userData = data.userData
            if (!isInitDataValid(initData, BOT_TOKEN) && !isInitDataValid(initData, BOT_TOKEN)) {
                socket.emit('login-invalid', {
                    userId: userData.id,
                    msg: 'Telegram Init Data invalid'
                })
            } else if (socketManager.isUserSocketCached(userData.id)) {
                logger.info(`User already logged in. Disconnecting previous session.`)
                socket.emit('login-invalid', {
                    userId: userData.id,
                    msg: 'Disconnecting previous session. Please refresh TMA'
                })
                socketManager.emitEvent(userData.id, 'disconnect-user', userData.id)
            } else {
                logger.info(`Valid login data: ${JSON.stringify(data, null, 2)}`)
                socketManager.cacheSocketIdForUser(userData.id, socket.id)
                socket.emit('login-validated', userData.id)
                await handleUserData(socket, userData.id, userData.username)
            }

        } catch (error) {
            logger.error(`Error validating telegram init data: ${error}`)
            socket.emit('tele-validate-error', {
                userId: data.userData.id,
                msg: 'Failed to validate telegram init data'
            })
        }
    })

    socket.on("logout-user", async (userId: number) => {
        socketManager.removeSocketIdCacheForUser(userId)
    })
}

const isInitDataValid = async (telegramInitData: string, botToken: string): Promise<boolean> => {
    // The data is a query string, which is composed of a series of field-value pairs.
    const encoded = decodeURIComponent(telegramInitData)

    // HMAC-SHA-256 signature of the bot's token with the constant string WebAppData used as a key.
    const secret = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)

    // Data-check-string is a chain of all received fields'.
    const arr = encoded.split('&')
    const hashIndex = arr.findIndex(str => str.startsWith('hash='))
    const hash = arr.splice(hashIndex)[0].split('=')[1]
    // sorted alphabetically
    arr.sort((a, b) => a.localeCompare(b))
    // in the format key=<value> with a line feed character ('\n', 0x0A) used as separator
    // e.g., 'auth_date=<auth_date>\nquery_id=<query_id>\nuser=<user>
    const dataCheckString = arr.join('\n')

    // The hexadecimal representation of the HMAC-SHA-256 signature of the data-check-string with the secret key
    const _hash = crypto
        .createHmac('sha256', secret.digest())
        .update(dataCheckString)
        .digest('hex')

    // if hash are equal the data may be used on your server.
    // Complex data types are represented as JSON-serialized objects.
    return _hash === hash
}

const handleUserData = async (socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, userId: number, username?: string): Promise<void> => {
    let user
    if (!(await userExists(userId))) {
        user = await createUser({ telegramId: userId, username: username })
    } else {
        user = await getUserData(userId)
    }

    logger.info(JSON.stringify(user, null, 2))
    socket.emit('user-data-on-login', {
        userId: userId,
        payload: user
    })
}