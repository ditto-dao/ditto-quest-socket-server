import { DefaultEventsMap, Socket } from "socket.io";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { SocketManager } from "../../socket/socket-manager";
import { IdleManager } from "../idle-managers/idle-manager";
import { BOT_TOKEN, LOGIN_TIMEOUT_MS } from "../../utils/config";
import { logger } from "../../utils/logger";
import { createUser, getUserData, userExists } from "../../sql-services/user-service";
import { DISCONNECT_USER_EVENT, FIRST_LOGIN_EVENT, LEDGER_INIT_USER_SOCKET_EVENT, LEDGER_READ_BALANCE_EVENT, LOGIN_INVALID_EVENT, LOGIN_VALIDATED_EVENT, USER_DATA_ON_LOGIN_EVENT } from "../../socket/events";
import * as crypto from 'crypto';
import { IdleCombatManager } from "../idle-managers/combat/combat-idle-manager";
import { getDomainById, getDungeonById } from "../../sql-services/combat-service";
import { slimeGachaPull } from "../../sql-services/slime";
import { mintItemToUser } from "../../sql-services/item-inventory-service";

interface ValidateLoginPayload {
    initData: string;
    userData: WebAppUser;
    socketId: string;
}

interface WebAppUser {
    id: number;
    username?: string;
    first_name?: string;
}

interface LoginQueueData {
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>;
    loginPayload: ValidateLoginPayload;
    isInitUserSocketInLedgerSuccess: boolean;
}

export class ValidateLoginManager {
    private dittoLedgerSocket: DittoLedgerSocket;
    private socketManager: SocketManager;
    private idleManager: IdleManager;
    private combatManager: IdleCombatManager;

    private loginQueue: Map<string, LoginQueueData> = new Map();
    private loginTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor(
        dittoLedgerSocket: DittoLedgerSocket,
        socketManager: SocketManager,
        idleManager: IdleManager,
        combatManager: IdleCombatManager
    ) {
        this.dittoLedgerSocket = dittoLedgerSocket;
        this.socketManager = socketManager;
        this.idleManager = idleManager;
        this.combatManager = combatManager;
    }

    async processUserLoginEvent(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, data: ValidateLoginPayload) {
        const initData = data.initData;
        const userData = data.userData;
        if (!this.isInitDataValid(initData, BOT_TOKEN)) {
            logger.error(`Init data invalid for user ${userData.id}`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: userData.id,
                msg: 'Login request invalid. Please use the Ditto Bot'
            });
        } else if (this.isUserAwaitingLogin(data.userData.id.toString())) {
            logger.warn(`User ${data.userData.id.toString()} is already in login queue.`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: userData.id,
                msg: 'User already attempting login. Disconnecting session'
            });
            this.socketManager.emitEvent(userData.id.toString(), DISCONNECT_USER_EVENT, userData.id);
        } else if (this.socketManager.isUserSocketCached(userData.id.toString())) {
            logger.warn(`User already logged in. Disconnecting previous session.`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: userData.id,
                msg: 'Disconnecting previous session. Please refresh TMA'
            });
            this.socketManager.emitEvent(userData.id.toString(), DISCONNECT_USER_EVENT, userData.id);
        } else {
            logger.info(`Valid login data: ${JSON.stringify(data, null, 2)}`);
            this.queueUserLogin(socket, data);
            this.dittoLedgerSocket.emit(LEDGER_INIT_USER_SOCKET_EVENT, data.userData);
        }
    }

    async confirmLedgerSocketInit(userId: string) {
        if (this.isUserAwaitingLogin(userId)) {
            const loginData = this.loginQueue.get(userId)!;
            loginData.isInitUserSocketInLedgerSuccess = true;
            this.loginQueue.set(userId, loginData);
            logger.info(`User socket successfully initialised in ledger server`);

            this.dittoLedgerSocket.emit(LEDGER_READ_BALANCE_EVENT, userId);
        } else {
            logger.warn(`User ${userId} tried to validate login but no queued login found.`);
        }
    }

    async validateUserLogin(userId: string,) {
        if (this.isUserAwaitingLogin(userId)) {
            clearTimeout(this.loginTimers.get(userId)!);
            this.loginTimers.delete(userId);

            const loginData = this.loginQueue.get(userId)!;
            this.loginQueue.delete(userId);

            this.processLogin(loginData);

            logger.info(`User ${userId} successfully validated.`);
        } else {
            logger.warn(`User ${userId} tried to validate login but no queued login found.`);
        }
    }

    isUserAwaitingLogin(userId: string) {
        return this.loginQueue.has(userId) && this.loginTimers.has(userId);
    }

    private async queueUserLogin(socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>, data: ValidateLoginPayload) {
        const userId = data.userData.id.toString();

        // If a previous login attempt exists, clear its timeout
        if (this.loginTimers.has(userId)) {
            clearTimeout(this.loginTimers.get(userId)!);
        }

        // Store login payload
        this.loginQueue.set(userId, {
            socket,
            loginPayload: data,
            isInitUserSocketInLedgerSuccess: false,
        });

        // Set a timeout to expire the login request
        const timeout = setTimeout(() => {
            this.handleLoginTimeout(userId);
        }, LOGIN_TIMEOUT_MS);

        this.loginTimers.set(userId, timeout);

        logger.info(`Queued login for user ${userId}. Waiting for response from ledger server.`);
    }

    private async processLogin(data: LoginQueueData) {
        this.socketManager.cacheSocketIdForUser(data.loginPayload.userData.id.toString(), data.socket.id);

        data.socket.emit(LOGIN_VALIDATED_EVENT, data.loginPayload.userData.id);

        let user;
        if (!(await userExists(data.loginPayload.userData.id.toString()))) {
            user = await createUser({ telegramId: data.loginPayload.userData.id.toString(), username: data.loginPayload.userData.username });

            // Free on first login
            const firstFreeSlime = await slimeGachaPull(user.telegramId);
            const secondFreeSlime = await slimeGachaPull(user.telegramId);
            const mintWood = await mintItemToUser(user.telegramId, 30, 30);

            data.socket.emit(FIRST_LOGIN_EVENT, {
                userId: data.loginPayload.userData.id,
                payload: {
                    freeSlimes: [firstFreeSlime, secondFreeSlime],
                    freeItems: [mintWood]
                }
            });

        } else {
            user = await getUserData(data.loginPayload.userData.id.toString());
        }

        if (!user) throw new Error(`Error processing login. User data not fetched or created.`);

        const currentCombat = await this.idleManager.loadIdleActivitiesOnLogin(data.loginPayload.userData.id.toString());
        if (currentCombat) {
            if (currentCombat.combatType === 'Domain') {
                const domain = await getDomainById(currentCombat.locationId);
                if (!domain) throw new Error(`Unable to find domain to load offline combat`);
                await this.combatManager.startDomainCombat(this.idleManager, currentCombat.userId, user, currentCombat.userCombat, domain, currentCombat.startTimestamp, currentCombat.monsterToStartWith);
            } else {
                const dungeon = await getDungeonById(currentCombat.locationId);
                if (!dungeon) throw new Error(`Unable to find dungeon to load offline combat`);
                await this.combatManager.startDungeonCombat(this.idleManager, currentCombat.userId, user, currentCombat.userCombat, dungeon, currentCombat.startTimestamp, currentCombat.monsterToStartWith, currentCombat.dungeonState);
            }
        }

        data.socket.emit(USER_DATA_ON_LOGIN_EVENT, {
            userId: data.loginPayload.userData.id,
            payload: await getUserData(data.loginPayload.userData.id.toString())
        });

        this.cleanUpQueueAndTimer(data.loginPayload.userData.id.toString());
    }

    private handleLoginTimeout(userId: string) {
        if (this.loginQueue.has(userId)) {
            logger.warn(`User ${userId} login attempt timed out.`);

            const loginQueueElement = this.loginQueue.get(userId)!;

            if (!loginQueueElement.isInitUserSocketInLedgerSuccess) {
                logger.error(`Ledger did not confirm socket for ${userId}. Login failed.`);
            }

            loginQueueElement.socket.emit(LOGIN_INVALID_EVENT, {
                userId: loginQueueElement.loginPayload.userData.id,
                msg: 'Login request timed out'
            })
            this.cleanUpQueueAndTimer(userId);
        }
    }

    private cleanUpQueueAndTimer(userId: string) {
        this.loginQueue.delete(userId);
        this.loginTimers.delete(userId);
    }

    private async isInitDataValid(telegramInitData: string, botToken: string): Promise<boolean> {
        // The data is a query string, which is composed of a series of field-value pairs.
        const encoded = decodeURIComponent(telegramInitData);

        // HMAC-SHA-256 signature of the bot's token with the constant string WebAppData used as a key.
        const secret = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken);

        // Data-check-string is a chain of all received fields'.
        const arr = encoded.split('&');
        const hashIndex = arr.findIndex(str => str.startsWith('hash='));
        const hash = arr.splice(hashIndex)[0].split('=')[1];
        // sorted alphabetically
        arr.sort((a, b) => a.localeCompare(b));
        // in the format key=<value> with a line feed character ('\n', 0x0A) used as separator
        // e.g., 'auth_date=<auth_date>\nquery_id=<query_id>\nuser=<user>
        const dataCheckString = arr.join('\n');

        // The hexadecimal representation of the HMAC-SHA-256 signature of the data-check-string with the secret key
        const _hash = crypto
            .createHmac('sha256', secret.digest())
            .update(dataCheckString)
            .digest('hex');

        // if hash are equal the data may be used on your server.
        // Complex data types are represented as JSON-serialized objects.
        return _hash === hash;
    }
}