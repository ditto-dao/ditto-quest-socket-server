import { DefaultEventsMap, Socket } from "socket.io";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { SocketManager } from "../../socket/socket-manager";
import { IdleManager } from "../idle-managers/idle-manager";
import { BOT_TOKEN, LOGIN_TIMEOUT_MS } from "../../utils/config";
import { logger } from "../../utils/logger";
import { FullUserData, prismaCreateUser, prismaUserExists } from "../../sql-services/user-service";
import {
    BETA_TESTER_LOGIN_EVENT,
    DISCONNECT_USER_EVENT,
    FIRST_LOGIN_EVENT,
    LEDGER_INIT_USER_SOCKET_EVENT,
    LEDGER_READ_BALANCE_EVENT,
    LEDGER_REMOVE_USER_SOCKET_EVENT,
    LOGIN_INVALID_EVENT,
    LOGIN_VALIDATED_EVENT,
    MISSION_UPDATE,
    USER_DATA_ON_LOGIN_EVENT
} from "../../socket/events";
import * as crypto from 'crypto';
import { IdleCombatManager } from "../idle-managers/combat/combat-idle-manager";
import { handleBetaTesterClaim, isUnclaimedBetaTester } from "../../sql-services/beta-testers";
import { generateNewMission, getUserMissionByUserId } from "../../sql-services/missions";
import { mintEquipmentToUser } from "../../operations/equipment-inventory-operations";
import { getUserDataWithSnapshot } from "../../operations/user-operations";
import { getDomainById, getDungeonById } from "../../operations/combat-operations";
import { slimeGachaPullMemory } from "../../operations/slime-operations";
import { mintItemToUser } from "../../operations/item-inventory-operations";
import { requireActivityLogMemoryManager, requireUserMemoryManager, requireUserSessionManager } from "../global-managers/global-managers";
import { UserSessionState } from "../memory/user-session-manager";

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
    sessionManager = requireUserSessionManager();
    activityLogMemoryManager = requireActivityLogMemoryManager();
    userMemoryManager = requireUserMemoryManager();

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

    async processUserLoginEvent(socket: Socket, data: ValidateLoginPayload) {
        const userId = data.userData.id.toString();

        // SIMPLIFIED: Let UserSessionManager handle all session state checking
        const currentState = this.sessionManager.getSessionState(userId);
        const ongoingOp = this.sessionManager.getOngoingOperation(userId);

        logger.info(`🚪 Processing login for user ${userId}`);
        logger.info(`   Current state: ${currentState}, Ongoing: ${ongoingOp || 'none'}`);

        // Early validation checks
        if (this.isUserAwaitingLogin(userId)) {
            logger.warn(`User ${userId} is already in login queue.`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.userData.id,
                msg: 'User already attempting login. Disconnecting session'
            });
            this.socketManager.emitEvent(userId, DISCONNECT_USER_EVENT, data.userData.id);
            return;
        }

        // Handle existing logged-in user - use session replacement
        if (this.socketManager.isUserSocketCached(userId) || currentState === UserSessionState.LOGGED_IN) {
            logger.warn(`User already logged in. Starting session replacement.`);

            // Use UserSessionManager for session replacement
            const replacementSuccess = await this.sessionManager.coordinatedSessionReplacement(
                userId,
                // Logout operation
                async () => {
                    try {
                        // Force cleanup the stale cache entry
                        this.socketManager.removeSocketIdCacheForUser(userId);
                        this.dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());

                        // If user is in memory, do coordinated logout
                        if (this.userMemoryManager?.hasUser(userId)) {
                            return await this.userMemoryManager.coordinatedLogout(
                                userId,
                                this.combatManager,
                                this.idleManager,
                                this.activityLogMemoryManager,
                                this.socketManager,
                                this.dittoLedgerSocket,
                                true // Skip socket cleanup since we already did it
                            );
                        }
                        return true;
                    } catch (error) {
                        logger.error(`Error during session replacement logout: ${error}`);
                        return false;
                    }
                },
                // Login operation
                async () => {
                    return await this.executeLoginProcess(socket, data);
                }
            );

            if (!replacementSuccess) {
                socket.emit(LOGIN_INVALID_EVENT, {
                    userId: data.userData.id,
                    msg: 'Session replacement failed. Please try again.'
                });
            }
            return;
        }

        // Most expensive check last
        if (!this.isInitDataValid(data.initData)) {
            logger.error(`Init data invalid for user ${userId}`);
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.userData.id,
                msg: 'Login request invalid. Please use the Ditto Bot'
            });
            return;
        }

        logger.info(`Valid login data for user ${userId}`);

        // Use UserSessionManager for coordinated login
        const loginSuccess = await this.sessionManager.coordinatedLogin(
            userId,
            async () => {
                return await this.executeLoginProcess(socket, data);
            }
        );

        if (!loginSuccess) {
            socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.userData.id,
                msg: 'Login failed. Please try again.'
            });
        }
    }

    /**
     * Extract the actual login logic into a separate method
     */
    private async executeLoginProcess(socket: Socket, data: ValidateLoginPayload): Promise<boolean> {
        const userId = data.userData.id.toString();

        try {
            // Queue the login and wait for ledger
            this.queueUserLogin(socket, data);
            this.dittoLedgerSocket.emit(LEDGER_INIT_USER_SOCKET_EVENT, data.userData);

            // Return true since the actual validation happens in validateUserLogin
            return true;

        } catch (error) {
            logger.error(`Login execution failed for user ${userId}: ${error}`);
            this.cleanupLoginQueue(userId);
            return false;
        }
    }

    /**
     * Method to handle logout requests from external sources
     */
    async handleLogoutRequest(userId: string, forceLogout: boolean = false): Promise<boolean> {
        return await this.sessionManager.coordinatedLogout(
            userId,
            async () => {
                return await this.userMemoryManager.coordinatedLogout(
                    userId,
                    this.combatManager,
                    this.idleManager,
                    this.activityLogMemoryManager,
                    this.socketManager,
                    this.dittoLedgerSocket
                );
            },
            forceLogout
        );
    }

    /**
     * NEW: Get session debug info through the manager
     */
    getSessionDebugInfo() {
        return this.sessionManager.getSessionDebugInfo();
    }

    /**
     * NEW: Clean up session data through the manager
     */
    cleanupUserSession(userId: string) {
        this.sessionManager.cleanupUserSession(userId);
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

    private async queueUserLogin(socket: Socket, data: ValidateLoginPayload) {
        const userId = data.userData.id.toString();

        // Clear any existing timeout
        if (this.loginTimers.has(userId)) {
            clearTimeout(this.loginTimers.get(userId)!);
        }

        // Store login payload
        this.loginQueue.set(userId, {
            socket,
            loginPayload: data,
            isInitUserSocketInLedgerSuccess: false,
        });

        // Set timeout for login expiration
        const timeout = setTimeout(() => {
            this.handleLoginTimeout(userId);
        }, LOGIN_TIMEOUT_MS);

        this.loginTimers.set(userId, timeout);
        logger.info(`Queued login for user ${userId}. Waiting for ledger response.`);
    }

    private async processLogin(data: LoginQueueData) {
        const userId = data.loginPayload.userData.id.toString();

        try {
            // Cache socket connection
            this.socketManager.cacheSocketIdForUser(userId, data.socket.id);
            data.socket.emit(LOGIN_VALIDATED_EVENT, data.loginPayload.userData.id);

            let user: FullUserData | null = null;
            const isNewUser = !(await prismaUserExists(userId));

            if (isNewUser) {
                user = await this.handleNewUserCreation(data);
            } else {
                user = await this.handleExistingUserLogin(userId);
            }

            if (!user) throw new Error(`Failed to load user data for ${userId}`);

            // Process offline activities and idle progress
            await this.processOfflineProgress(userId, user, data);

            // Send mission data (delayed, non-blocking)
            this.sendMissionData(userId, data.socket);

        } catch (error) {
            logger.error(`❌ Login processing failed for user ${userId}: ${error}`);
            data.socket.emit(LOGIN_INVALID_EVENT, {
                userId: data.loginPayload.userData.id,
                msg: 'Login processing failed. Please try again.'
            });
        } finally {
            this.cleanupLoginQueue(userId);
        }
    }

    private async handleNewUserCreation(data: LoginQueueData): Promise<FullUserData> {
        if (!this.userMemoryManager) throw new Error(`User memory manager not available`);

        const userId = data.loginPayload.userData.id.toString();
        logger.info(`🆕 Creating new user: ${userId}`);

        // Create user in database
        const user = await prismaCreateUser({
            telegramId: userId,
            username: data.loginPayload.userData.username
        });

        // Load user into memory
        this.userMemoryManager.setUser(userId, user);

        // Generate starter rewards using memory-optimized functions
        const [firstSlime, secondSlime, starterWood, isBetaTester] = await Promise.all([
            slimeGachaPullMemory(userId, true),
            slimeGachaPullMemory(userId, true),
            mintItemToUser(userId, 26, 30),
            isUnclaimedBetaTester(userId)
        ]);

        // Send first login rewards (frontend works fine with temp IDs)
        data.socket.emit(FIRST_LOGIN_EVENT, {
            userId,
            payload: {
                freeSlimes: [firstSlime, secondSlime],
                freeItems: [starterWood]
            }
        });

        // Handle beta tester rewards
        if (isBetaTester) {
            await Promise.all([
                mintEquipmentToUser(userId, 111),
                handleBetaTesterClaim(userId)
            ]);

            data.socket.emit(BETA_TESTER_LOGIN_EVENT, { userId });
        }

        // Return current memory state (temp IDs will be resolved on first logout)
        const currentUser = this.userMemoryManager.getUser(userId);
        if (!currentUser) throw new Error(`Failed to get user ${userId} from memory after creation`);

        return currentUser;
    }

    private async handleExistingUserLogin(userId: string): Promise<FullUserData> {
        logger.info(`👤 Loading existing user: ${userId}`);

        // Use optimized 3-tier loading: Memory → Snapshot → Database
        const user = await getUserDataWithSnapshot(userId);
        if (!user) throw new Error(`Failed to load existing user data`);

        return user;
    }

    private async processOfflineProgress(userId: string, user: FullUserData, data: LoginQueueData) {
        if (!this.userMemoryManager) throw new Error(`User memory manager not available`);

        logger.info(`⏰ Processing offline progress for user ${userId}`);

        // Load idle activities and calculate offline progress
        const { currentCombat, progressUpdates, offlineProgressMs } =
            await this.idleManager.loadIdleActivitiesOnLogin(userId);

        // Apply progress updates to user data using memory-first approach
        if (progressUpdates?.length > 0) {
            logger.info(`📈 Applying ${progressUpdates.length} offline progress updates for user ${userId}`);

            // Check if we have pending changes that need flushing
            if (this.userMemoryManager.hasPendingChanges(userId)) {
                logger.info(`💾 User has pending changes from offline progress, queued for next flush cycle`);
            }
        }

        // Restore combat session if user was in combat
        if (currentCombat) {
            await this.restoreCombatSession(currentCombat, user);
        }

        // Send updated user data to frontend (includes all offline progress)
        data.socket.emit(USER_DATA_ON_LOGIN_EVENT, {
            userId: data.loginPayload.userData.id,
            payload: user
        });

        // Send idle progress update
        data.socket.emit("idle-progress-update", {
            userId: data.loginPayload.userData.id,
            payload: {
                offlineProgressMs,
                updates: progressUpdates,
            },
        });
    }

    private async restoreCombatSession(currentCombat: any, user: any) {
        try {
            if (currentCombat.combatType === 'Domain') {
                const domain = await getDomainById(currentCombat.locationId);
                if (!domain) throw new Error(`Domain not found: ${currentCombat.locationId}`);

                await this.combatManager.startDomainCombat(
                    this.idleManager,
                    currentCombat.userId,
                    user,
                    currentCombat.userCombat,
                    domain,
                    currentCombat.startTimestamp,
                    currentCombat.monsterToStartWith,
                    true
                );
            } else {
                const dungeon = await getDungeonById(currentCombat.locationId);
                if (!dungeon) throw new Error(`Dungeon not found: ${currentCombat.locationId}`);

                await this.combatManager.startDungeonCombat(
                    this.idleManager,
                    currentCombat.userId,
                    user,
                    currentCombat.userCombat,
                    dungeon,
                    currentCombat.startTimestamp,
                    currentCombat.monsterToStartWith,
                    currentCombat.dungeonState,
                    true
                );
            }
            logger.info(`⚔️ Restored ${currentCombat.combatType} combat session for user ${currentCombat.userId}`);
        } catch (error) {
            logger.error(`❌ Failed to restore combat session: ${error}`);
        }
    }

    private async sendMissionData(userId: string, socket: Socket) {
        try {
            let mission = await getUserMissionByUserId(userId);
            if (!mission) {
                mission = await generateNewMission(userId, mission);
            }

            if (mission && mission.round < 6) {
                setTimeout(() => {
                    socket.emit(MISSION_UPDATE, {
                        userId: parseInt(userId),
                        payload: {
                            ...mission,
                            rewardDitto: mission.rewardDitto?.toString(),
                        },
                    });
                }, 5000);
            }
        } catch (error) {
            logger.error(`❌ Error loading mission data for user ${userId}: ${error}`);
        }
    }

    private handleLoginTimeout(userId: string) {
        if (!this.loginQueue.has(userId)) return;

        logger.warn(`⏰ Login timeout for user ${userId}`);

        const loginData = this.loginQueue.get(userId)!;

        if (!loginData.isInitUserSocketInLedgerSuccess) {
            logger.error(`❌ Ledger socket init failed for user ${userId}`);
        }

        loginData.socket.emit(LOGIN_INVALID_EVENT, {
            userId: loginData.loginPayload.userData.id,
            msg: 'Login request timed out'
        });

        this.dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId);
        this.cleanupLoginQueue(userId);
    }

    private cleanupLoginQueue(userId: string) {
        this.loginQueue.delete(userId);
        this.loginTimers.delete(userId);
    }

    private isInitDataValid(telegramInitData: string): boolean {
        try {
            const encoded = decodeURIComponent(telegramInitData);
            const arr = encoded.split('&');
            const hashIndex = arr.findIndex(str => str.startsWith('hash='));

            if (hashIndex === -1) return false;

            const hash = arr.splice(hashIndex)[0].split('=')[1];
            arr.sort((a, b) => a.localeCompare(b));
            const dataCheckString = arr.join('\n');

            const computedHash = crypto
                .createHmac('sha256', this.secretKey)
                .update(dataCheckString)
                .digest('hex');

            return computedHash === hash;
        } catch (error) {
            logger.error(`❌ Init data validation error: ${error}`);
            return false;
        }
    }
}