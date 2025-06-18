import { DefaultEventsMap, Socket } from "socket.io";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { SocketManager } from "../../socket/socket-manager";
import { IdleManager } from "../idle-managers/idle-manager";
import { BOT_TOKEN, LOGIN_TIMEOUT_MS } from "../../utils/config";
import { logger } from "../../utils/logger";
import { createUser, FullUserData, getUserDataWithSnapshot, userExists } from "../../sql-services/user-service";
import { BETA_TESTER_LOGIN_EVENT, DISCONNECT_USER_EVENT, FIRST_LOGIN_EVENT, LEDGER_INIT_USER_SOCKET_EVENT, LEDGER_READ_BALANCE_EVENT, LEDGER_REMOVE_USER_SOCKET_EVENT, LOGIN_INVALID_EVENT, LOGIN_VALIDATED_EVENT, MISSION_UPDATE, USER_DATA_ON_LOGIN_EVENT } from "../../socket/events";
import * as crypto from 'crypto';
import { IdleCombatManager } from "../idle-managers/combat/combat-idle-manager";
import { getDomainById, getDungeonById } from "../../sql-services/combat-service";
import { slimeGachaPull } from "../../sql-services/slime";
import { getNewInventoryEntries, mintItemToUser } from "../../sql-services/item-inventory-service";
import { handleBetaTesterClaim, isUnclaimedBetaTester } from "../../sql-services/beta-testers";
import { mintEquipmentToUser } from "../../sql-services/equipment-inventory-service";
import { generateNewMission, getUserMissionByUserId } from "../../sql-services/missions";
import { snapshotManager, SnapshotTrigger } from "../../sql-services/snapshot-manager-service";
import { applyProgressUpdatesToUser } from "../idle-managers/offline-progress-helpers";

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

    // Cache HMAC key to avoid recalculating on every login
    private secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();

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
        const userId = data.userData.id.toString();

        // Early validation checks (fastest to slowest)
        if (this.isUserAwaitingLogin(userId)) {
            logger.warn(`User ${userId} is already in login queue.`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.userData.id,
                msg: 'User already attempting login. Disconnecting session'
            });
            this.socketManager.emitEvent(userId, DISCONNECT_USER_EVENT, data.userData.id);
            return;
        }

        if (this.socketManager.isUserSocketCached(userId)) {
            logger.warn(`User already logged in. Disconnecting previous session.`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.userData.id,
                msg: 'Disconnecting previous session. Please refresh TMA'
            });
            this.socketManager.emitEvent(userId, DISCONNECT_USER_EVENT, data.userData.id);
            return;
        }

        // Most expensive check last
        if (!this.isInitDataValid(data.initData, BOT_TOKEN)) {
            logger.error(`Init data invalid for user ${userId}`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.userData.id,
                msg: 'Login request invalid. Please use the Ditto Bot'
            });
            return;
        }

        logger.info(`Valid login data for user ${userId}`);
        this.queueUserLogin(socket, data);
        this.dittoLedgerSocket.emit(LEDGER_INIT_USER_SOCKET_EVENT, data.userData);
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

    async validateUserLogin(userId: string) {
        if (!this.isUserAwaitingLogin(userId)) {
            logger.warn(`User ${userId} tried to validate login but no queued login found.`);
            return;
        }

        clearTimeout(this.loginTimers.get(userId)!);
        this.loginTimers.delete(userId);

        const loginData = this.loginQueue.get(userId)!;
        this.loginQueue.delete(userId);

        await this.processLogin(loginData);
        logger.info(`User ${userId} successfully validated.`);
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
        const userId = data.loginPayload.userData.id.toString();
        try {
            this.socketManager.cacheSocketIdForUser(userId, data.socket.id);
            data.socket.emit(LOGIN_VALIDATED_EVENT, data.loginPayload.userData.id);
            let user: FullUserData | null = null;
            const isNewUser = !(await userExists(userId));
            if (isNewUser) {
                // New user flow
                user = await this.handleNewUserLogin(data);
            } else {
                // Existing user flow - use snapshot (benefits from cached data)
                user = await getUserDataWithSnapshot(userId);
                if (!user) {
                    throw new Error(`Failed to fetch existing user data for ${userId}`);
                }
            }
            if (user === null) throw new Error(`Failed to fetch user data.`);
            logger.info(`Loading offline idle activity for user ${userId}`);

            // Process offline progress and get both combat data and updates
            const { currentCombat, progressUpdates, offlineProgressMs } = await this.idleManager.loadIdleActivitiesOnLogin(userId);

            // Apply progress updates to user object in memory
            if (progressUpdates && progressUpdates.length > 0) {
                const addedItems = await applyProgressUpdatesToUser(user, progressUpdates);

                // Only fetch new inventory items that were added (with temporary IDs)
                if (addedItems.length > 0) {
                    await this.refreshNewInventoryItems(user, addedItems);
                }
            }

            // Handle combat restoration if needed
            if (currentCombat) {
                await this.restoreCombatSession(currentCombat, user);
            }

            // Send the updated user data to frontend (includes all offline progress with real IDs)
            data.socket.emit(USER_DATA_ON_LOGIN_EVENT, {
                userId: data.loginPayload.userData.id,
                payload: user
            });

            // NOW emit the idle progress update - after everything is ready
            data.socket.emit("idle-progress-update", {
                userId: data.loginPayload.userData.id,
                payload: {
                    offlineProgressMs,
                    updates: progressUpdates,
                },
            });

            // Mark snapshot stale for background regeneration (since user state changed)
            if (progressUpdates && progressUpdates.length > 0) {
                await snapshotManager.markStale(userId, SnapshotTrigger.SESSION_END);
            }

            // Load and send mission data (non-blocking with delay)
            const currMission = await this.loadUserMission(userId);
            if (currMission && currMission.round < 6) {
                setTimeout(() => {
                    data.socket.emit(MISSION_UPDATE, {
                        userId: data.loginPayload.userData.id,
                        payload: {
                            ...currMission,
                            rewardDitto: currMission.rewardDitto?.toString(),
                        },
                    });
                }, 5000); // 5 seconds
            }
        } catch (error) {
            logger.error(`Error processing login for user ${userId}: ${error}`);
            data.socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.loginPayload.userData.id,
                msg: 'Login processing failed. Please try again.'
            });
        } finally {
            this.cleanUpQueueAndTimer(userId);
        }
    }

    private async refreshNewInventoryItems(user: FullUserData, addedItems: { type: 'item' | 'equipment'; id: number }[]) {
        try {
            // Get unique item and equipment IDs that were added
            const newItemIds = addedItems.filter(item => item.type === 'item').map(item => item.id);
            const newEquipmentIds = addedItems.filter(item => item.type === 'equipment').map(item => item.id);

            // Fetch only the new inventory entries from DB using proper service function
            const newInventoryEntries = await getNewInventoryEntries(user.telegramId, newItemIds, newEquipmentIds);

            // Replace temporary inventory items with real DB entries
            for (const newEntry of newInventoryEntries) {
                // Find and remove the temporary entry
                const tempIndex = user.inventory.findIndex(inv => {
                    // Type-safe check for temporary flag
                    const isTemp = (inv as any).isTemporary === true;
                    const matchesItem = newEntry.itemId && inv.itemId === newEntry.itemId;
                    const matchesEquipment = newEntry.equipmentId && inv.equipmentId === newEntry.equipmentId;

                    return isTemp && (matchesItem || matchesEquipment);
                });

                if (tempIndex !== -1) {
                    // Replace temporary entry with real DB entry
                    user.inventory[tempIndex] = newEntry as any;
                }
            }

            logger.info(`Refreshed ${newInventoryEntries.length} new inventory items with real DB IDs`);
        } catch (error) {
            logger.error(`Error refreshing new inventory items: ${error}`);
        }
    }

    private async handleNewUserLogin(data: LoginQueueData) {
        const userId = data.loginPayload.userData.id.toString();

        // Create user
        const user = await createUser({
            telegramId: userId,
            username: data.loginPayload.userData.username
        });

        // Parallel free item generation for new users
        const [firstFreeSlime, secondFreeSlime, mintWood, isBetaTester] = await Promise.all([
            slimeGachaPull(user.telegramId, true),
            slimeGachaPull(user.telegramId, true),
            mintItemToUser(user.telegramId, 26, 30),
            isUnclaimedBetaTester(user.telegramId)
        ]);

        // Send first login rewards
        data.socket.emit(FIRST_LOGIN_EVENT, {
            userId: user.telegramId,
            payload: {
                freeSlimes: [firstFreeSlime, secondFreeSlime],
                freeItems: [mintWood]
            }
        });

        // Handle beta tester rewards
        if (isBetaTester) {
            await Promise.all([
                mintEquipmentToUser(user.telegramId, 111),
                handleBetaTesterClaim(user.telegramId)
            ]);

            data.socket.emit(BETA_TESTER_LOGIN_EVENT, {
                userId: user.telegramId,
            });
        }

        // Return fresh user data (don't use snapshot for brand new users)
        return await getUserDataWithSnapshot(userId);
    }

    private async restoreCombatSession(currentCombat: any, user: any) {
        if (currentCombat.combatType === 'Domain') {
            const domain = await getDomainById(currentCombat.locationId);
            if (!domain) throw new Error(`Unable to find domain to load offline combat`);

            await this.combatManager.startDomainCombat(
                this.idleManager,
                currentCombat.userId,
                user,
                currentCombat.userCombat,
                domain,
                currentCombat.startTimestamp,
                currentCombat.monsterToStartWith
            );
        } else {
            const dungeon = await getDungeonById(currentCombat.locationId);
            if (!dungeon) throw new Error(`Unable to find dungeon to load offline combat`);

            await this.combatManager.startDungeonCombat(
                this.idleManager,
                currentCombat.userId,
                user,
                currentCombat.userCombat,
                dungeon,
                currentCombat.startTimestamp,
                currentCombat.monsterToStartWith,
                currentCombat.dungeonState
            );
        }
    }

    private async loadUserMission(userId: string) {
        let currMission = await getUserMissionByUserId(userId);
        if (!currMission) {
            currMission = await generateNewMission(userId, currMission);
        }
        return currMission;
    }

    private handleLoginTimeout(userId: string) {
        if (!this.loginQueue.has(userId)) return;

        logger.warn(`User ${userId} login attempt timed out.`);

        const loginQueueElement = this.loginQueue.get(userId)!;

        if (!loginQueueElement.isInitUserSocketInLedgerSuccess) {
            logger.error(`Ledger did not confirm socket for ${userId}. Login failed.`);
        }

        loginQueueElement.socket.emit(LOGIN_INVALID_EVENT, {
            userId: loginQueueElement.loginPayload.userData.id,
            msg: 'Login request timed out'
        });

        this.dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId);
        this.cleanUpQueueAndTimer(userId);
    }

    private cleanUpQueueAndTimer(userId: string) {
        this.loginQueue.delete(userId);
        this.loginTimers.delete(userId);
    }

    private isInitDataValid(telegramInitData: string, botToken: string): boolean {
        try {
            // The data is a query string, which is composed of a series of field-value pairs.
            const encoded = decodeURIComponent(telegramInitData);

            // Data-check-string is a chain of all received fields'.
            const arr = encoded.split('&');
            const hashIndex = arr.findIndex(str => str.startsWith('hash='));

            if (hashIndex === -1) return false;

            const hash = arr.splice(hashIndex)[0].split('=')[1];

            // sorted alphabetically
            arr.sort((a, b) => a.localeCompare(b));

            // in the format key=<value> with a line feed character ('\n', 0x0A) used as separator
            const dataCheckString = arr.join('\n');

            // The hexadecimal representation of the HMAC-SHA-256 signature with the cached secret key
            const _hash = crypto
                .createHmac('sha256', this.secretKey)
                .update(dataCheckString)
                .digest('hex');

            return _hash === hash;
        } catch (error) {
            logger.error(`Error validating init data: ${error}`);
            return false;
        }
    }
}