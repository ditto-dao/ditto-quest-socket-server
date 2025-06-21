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
import { prismaSaveUser } from "../../sql-services/user-service";
import { slimeGachaPullMemory } from "../../operations/slime-operations";
import { mintItemToUser } from "../../operations/item-inventory-operations";
import { requireActivityLogMemoryManager, requireUserMemoryManager } from "../global-managers/global-managers";

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
        if (!this.isInitDataValid(data.initData)) {
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

        this.userMemoryManager.setUser(userId, user);

        // Generate starter rewards using memory-optimized functions
        const [firstSlime, secondSlime, starterWood, isBetaTester] = await Promise.all([
            slimeGachaPullMemory(userId, true),
            slimeGachaPullMemory(userId, true),
            mintItemToUser(userId, 26, 30),
            isUnclaimedBetaTester(userId)
        ]);

        // Send first login rewards (using fake IDs for now)
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

        // Flush pending operations with proper ID remapping
        if (this.userMemoryManager.hasUser(userId) && this.userMemoryManager.hasPendingChanges(userId)) {
            logger.info(`💾 Flushing new user data to database with ID remapping`);

            // Flush slimes first (creates real IDs and remapping)
            await this.userMemoryManager.flushUserSlimes(userId);

            // Flush inventory (creates real IDs and remapping)
            await this.userMemoryManager.flushUserInventory(userId);

            if (this.userMemoryManager.inventoryIdRemap.has(userId)) {
                const invRemap = this.userMemoryManager.inventoryIdRemap.get(userId)!;
                logger.info(`🔄 Inventory ID remapping: ${invRemap.size} items remapped`);
            }
        }

        // Load complete user data using 3-tier system (now with real IDs)
        const freshUser = await getUserDataWithSnapshot(userId);
        if (!freshUser) throw new Error(`Failed to reload user data after creation`);

        return freshUser;
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
                    currentCombat.monsterToStartWith
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
                    currentCombat.dungeonState
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

    /**
     * Handle user disconnect - cleanup across all memory managers
     */
    async handleUserDisconnect(userId: string) {
        try {
            if (!this.userMemoryManager) throw new Error(`User memory manager not available`);
            if (!this.activityLogMemoryManager) throw new Error(`Activity log memory manager not available`);

            logger.info(`👋 User ${userId} disconnecting`);

            // Check if user has any pending changes that need to be saved
            if (this.userMemoryManager.hasUser(userId)) {
                const isDirty = this.userMemoryManager.isDirty(userId);
                const hasPending = this.userMemoryManager.hasPendingChanges(userId);

                if (isDirty || hasPending) {
                    logger.info(`💾 Flushing user ${userId} on disconnect (dirty: ${isDirty}, pending: ${hasPending})`);

                    // Use targeted flushing based on what actually changed
                    if (this.userMemoryManager.pendingCreateSlimes.has(userId) || this.userMemoryManager.pendingBurnSlimeIds.has(userId)) {
                        await this.userMemoryManager.flushUserSlimes(userId);
                        logger.debug(`🧪 Flushed slime changes for user ${userId}`);
                    }

                    if (this.userMemoryManager.pendingCreateInventory.has(userId) || this.userMemoryManager.pendingBurnInventoryIds.has(userId)) {
                        await this.userMemoryManager.flushUserInventory(userId);
                        logger.debug(`📦 Flushed inventory changes for user ${userId}`);
                    }

                    // Flush any remaining user field changes
                    if (isDirty) {
                        const user = this.userMemoryManager.getUser(userId);
                        if (user) {
                            await prismaSaveUser(user);
                            this.userMemoryManager.markClean(userId);
                            logger.debug(`👤 Flushed user field changes for user ${userId}`);
                        }
                    }
                }

                // Remove from memory after grace period (allows quick reconnects)
                setTimeout(() => {
                    if (!this.userMemoryManager) throw new Error(`User memory manager not available`);

                    if (this.userMemoryManager.hasUser(userId)) {
                        // Check one more time if user is still inactive and clean
                        const lastActivity = this.userMemoryManager.getLastActivity(userId);
                        const now = Date.now();

                        // Only remove if user hasn't been active and has no pending changes
                        if (lastActivity && (now - lastActivity) > 25000 && !this.userMemoryManager.hasPendingChanges(userId)) {
                            this.userMemoryManager.removeUser(userId);
                            logger.info(`🗑️ Removed inactive user ${userId} from memory`);
                        } else {
                            logger.debug(`⏳ Keeping user ${userId} in memory (recently active or has pending changes)`);
                        }
                    }
                }, 30000); // 30 second grace period
            }

            // Flush any pending activity logs
            if (this.activityLogMemoryManager.hasUser(userId)) {
                await this.activityLogMemoryManager.flushUser(userId);
                logger.info(`📝 Flushed activity logs for user ${userId}`);
            }

        } catch (error) {
            logger.error(`❌ Error handling disconnect for user ${userId}: ${error}`);
        }
    }
}