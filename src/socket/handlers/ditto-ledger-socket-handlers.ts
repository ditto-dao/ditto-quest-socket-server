import { logger } from "../../utils/logger";
import { Socket as UserSocket, DefaultEventsMap } from "socket.io";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { COMBAT_STOPPED_EVENT, LEDGER_BALANCE_ERROR_RES_EVENT, LEDGER_BALANCE_UPDATE_RES_EVENT, LEDGER_INIT_USER_SOCKET_SUCCESS_EVENT, LEDGER_REVERT_TRX_EVENT, LEDGER_UPDATE_BALANCE_EVENT, LEDGER_USER_ERROR_RES_EVENT, ON_CHAIN_PRICE_UPDATE_RES_EVENT, READ_ON_CHAIN_PRICE_EVENT } from "../events";
import { ValidateLoginManager } from "../../managers/validate-login/validate-login-manager";
import { SocketManager } from "../socket-manager";
import { ENTER_DOMAIN_TRX_NOTE, ENTER_DUNGEON_TRX_NOTE, SLIME_GACHA_PRICE_DITTO_WEI, SLIME_GACHA_PULL_TRX_NOTE } from "../../utils/transaction-config";
import { DEVELOPMENT_FUNDS_KEY } from "../../utils/config";
import { IdleCombatManager } from "../../managers/idle-managers/combat/combat-idle-manager";
import { IdleManager } from "../../managers/idle-managers/idle-manager";
import AsyncLock from 'async-lock';
import { emitMissionUpdate, updateGachaMission } from "../../sql-services/missions";
import { getHighestDominantTraitRarity } from "../../utils/helpers";
import { slimeGachaPullMemory } from "../../operations/slime-operations";
import { getDomainById, getDungeonById } from "../../operations/combat-operations";
import { getUserData } from "../../operations/user-operations";
import { requireActivityLogMemoryManager, requireSnapshotRedisManager, requireUserEfficiencyStatsMemoryManager, requireUserMemoryManager } from "../../managers/global-managers/global-managers";

const lock = new AsyncLock();

export interface UserBalanceUpdate {
    userId: string;
    liveBalanceChange: string;
    accumulatedBalanceChange: string;
    notes?: string;
}

export interface UserBalanceUpdateRes {
    liveBalance: string;
    accumulatedBalance: string;
    isBot: boolean;
    isAdmin: boolean;
    liveBalanceChange: string;
    accumulatedBalanceChange: string;
    updatedAt?: Date; // if notes, must have updatedAt
    notes?: string;
}

export async function setupDittoLedgerUserSocketHandlers(
    userSocket: UserSocket<DefaultEventsMap, DefaultEventsMap>,
    ledgerSocket: DittoLedgerSocket,
): Promise<void> {
    userSocket.on(LEDGER_UPDATE_BALANCE_EVENT, (data: { sender: string, updates: UserBalanceUpdate[] }) => {
        try {
            logger.info(`Received LEDGER_UPDATE_BALANCE_EVENT for ${JSON.stringify(data, null, 2)}`);
            ledgerSocket.emit(LEDGER_UPDATE_BALANCE_EVENT, data);
        } catch (error) {
            logger.error(`Failed to forward LEDGER_UPDATE_BALANCE_EVENT event: ${error}`);
        }
    });

    userSocket.on(READ_ON_CHAIN_PRICE_EVENT, (userId: string) => {
        try {
            logger.info(`Received READ_ON_CHAIN_PRICE_EVENT for ${userId}`);
            ledgerSocket.emit(READ_ON_CHAIN_PRICE_EVENT, userId);
        } catch (error) {
            logger.error(`Failed to forward READ_ON_CHAIN_PRICE_EVENT event: ${error}`);
        }
    });
}

export async function setupDittoLedgerSocketServerHandlers(
    ledgerSocket: DittoLedgerSocket,
    validateLoginManager: ValidateLoginManager,
    socketManager: SocketManager,
    idleManager: IdleManager,
    combatManager: IdleCombatManager,
): Promise<void> {
    ledgerSocket.on(LEDGER_INIT_USER_SOCKET_SUCCESS_EVENT, (userId: string) => {
        try {
            logger.info(`Received LEDGER_INIT_USER_SOCKET_SUCCESS_EVENT for ${userId}`);
            validateLoginManager.confirmLedgerSocketInit(userId);
        } catch (error) {
            logger.error(`Failed to confirm ledger socket init for user ${userId}: ${error}`);
        }
    });

    ledgerSocket.on(LEDGER_BALANCE_UPDATE_RES_EVENT, async (res: { userId: string, payload: UserBalanceUpdateRes }) => {
        return await lock.acquire(res.userId, async () => {
            try {
                logger.info(`Received LEDGER_BALANCE_UPDATE_RES_EVENT for ${res.userId}: ${JSON.stringify(res.payload, null, 2)}`);
                if (validateLoginManager.isUserAwaitingLogin(res.userId)) validateLoginManager.validateUserLogin(res.userId);

                // Logic to run in socket server after successful ledger trx
                if (res.payload.notes === SLIME_GACHA_PULL_TRX_NOTE) {
                    await handleMintSlime(res.userId, res.payload, socketManager, ledgerSocket);
                } else if (res.payload.notes && res.payload.notes.includes(ENTER_DUNGEON_TRX_NOTE)) {
                    logger.info(`Entering dungeon after paying DITTO fee.`);
                    const dungeonId = res.payload.notes.split(" ").pop();
                    await handleDungeonEntry(combatManager, idleManager, socketManager, ledgerSocket, res.payload, res.userId, Number(dungeonId));
                } else if (res.payload.notes && res.payload.notes.includes(ENTER_DOMAIN_TRX_NOTE)) {
                    logger.info(`Entering domain after paying DITTO fee.`);
                    const domainId = res.payload.notes.split(" ").pop();
                    await handleDomainEntry(combatManager, idleManager, socketManager, ledgerSocket, res.payload, res.userId, Number(domainId));
                }

                socketManager.emitEvent(res.userId, LEDGER_BALANCE_UPDATE_RES_EVENT, res);
            } catch (error) {
                logger.error(`Error forwarding balance update to ${res.userId}: ${error}`);
            }
        });
    });

    ledgerSocket.on(ON_CHAIN_PRICE_UPDATE_RES_EVENT, (res: { userId: string, payload: any }) => {
        try {
            logger.info(`Received ON_CHAIN_PRICE_UPDATE_RES_EVENT for ${res.userId}`);
            socketManager.emitEvent(res.userId, ON_CHAIN_PRICE_UPDATE_RES_EVENT, res);
        } catch (error) {
            logger.error(`Failed to forward on-chain price from ledger socket for user ${res.userId}: ${error}`);
        }
    });

    ledgerSocket.on(LEDGER_BALANCE_ERROR_RES_EVENT, (res: { userId: string, msg: string }) => {
        try {
            logger.error(`Balance error response from ledger server for user: ${res.userId}. ${res.msg}`);
            socketManager.emitEvent(res.userId, 'error', res);
        } catch (error) {
            logger.error(`Error forwarding error msg to ${res.userId}: ${error}`);
        }
    });

    ledgerSocket.on(LEDGER_USER_ERROR_RES_EVENT, (res: { userId: string, msg: string }) => {
        try {
            logger.error(`User error response from ledger server for user: ${res.userId}. ${res.msg}`);
            socketManager.emitEvent(res.userId, 'error', res);
        } catch (error) {
            logger.error(`Error forwarding error msg to ${res.userId}: ${error}`);
        }
    });

    ledgerSocket.on("disconnect", async () => {
        try {
            logger.error('🔌 Disconnected from ditto ledger socket server - initiating full cleanup');

            const userMemoryManager = requireUserMemoryManager();

            // Get all active users from memory
            const activeUsers = userMemoryManager.getActiveUsers();
            logger.info(`🧹 Cleaning up ${activeUsers.length} active users due to ledger disconnect`);

            if (activeUsers.length > 0) {
                // Use ValidateLoginManager for proper session state handling
                // Process each user individually to avoid race conditions
                const cleanupPromises = activeUsers.map(async (userId) => {
                    try {
                        // Use ValidateLoginManager which handles UserSessionManager properly
                        const success = await validateLoginManager.handleLogoutRequest(
                            userId,
                            true // Force logout due to ledger disconnect
                        );

                        if (success) {
                            logger.info(`✅ Cleaned up user ${userId} due to ledger disconnect`);
                        } else {
                            logger.warn(`⚠️ Partial cleanup for user ${userId} due to ledger disconnect`);
                        }
                    } catch (userErr) {
                        logger.error(`❌ Failed to cleanup user ${userId} during ledger disconnect: ${userErr}`);
                        // Emergency snapshot is already handled in coordinatedLogout
                    }
                });

                // Wait for all individual cleanups
                await Promise.allSettled(cleanupPromises);

                // Clear remaining memory (should be mostly empty now)
                userMemoryManager.clear();

                const activityLogMemoryManager = requireActivityLogMemoryManager();
                activityLogMemoryManager.clear();

                // After clearing other managers
                const efficiencyStatsMemoryManager = requireUserEfficiencyStatsMemoryManager();
                efficiencyStatsMemoryManager.clear();
            }

            // Disconnect all user sockets (do this after user cleanup)
            socketManager.disconnectAllUsers();

            logger.error('🚨 All users disconnected due to ledger socket failure');

        } catch (error) {
            logger.error(`❌ Critical error during ledger disconnect cleanup: ${error}`);

            // Emergency fallback
            try {
                logger.error('⚠️ Attempting emergency user disconnection...');
                socketManager.disconnectAllUsers();
            } catch (emergencyErr) {
                logger.error(`❌ Emergency disconnection failed: ${emergencyErr}`);
            }
        }
    });
}

async function handleMintSlime(userId: string, payload: UserBalanceUpdateRes, socketManager: SocketManager, ledgerSocket: DittoLedgerSocket): Promise<void> {
    logger.info(`Handling slime gacha pull for ${userId}`);

    if (BigInt(payload.accumulatedBalanceChange) + BigInt(payload.liveBalanceChange) > BigInt(-SLIME_GACHA_PRICE_DITTO_WEI)) {
        logger.error(`Insufficient DITTO deducted to mint slime.`);
        await revertTrxToLedger(ledgerSocket, userId, DEVELOPMENT_FUNDS_KEY, payload);
        return;
    }

    try {
        const res = await slimeGachaPullMemory(userId);

        socketManager.emitEvent(userId, "update-slime-inventory", {
            userId: userId,
            payload: res.slime
        });

        socketManager.emitEvent(userId, "slime-gacha-update", {
            userId: userId,
            payload: {
                slime: res.slime,
                rankPull: res.rankPull,
                slimeNoBg: res.slimeNoBg
            }
        });

        await updateGachaMission(userId, getHighestDominantTraitRarity(res.slime), 1);
        await emitMissionUpdate(socketManager.getSocketByUserId(userId), userId);
    } catch (error: any) {
        logger.error(`Error minting gen 0 slime: ${error}`);

        const errorMsg =
            typeof error.message === 'string' && error.message.toLowerCase().includes('inventory full')
                ? 'Your slime inventory is full. Please free up some space.'
                : 'Failed to mint slime'

        socketManager.emitEvent(userId, 'mint-slime-error', {
            userId: userId,
            msg: errorMsg
        });

        revertTrxToLedger(ledgerSocket, userId, DEVELOPMENT_FUNDS_KEY, payload);
    }
}

async function handleDomainEntry(
    combatManager: IdleCombatManager,
    idleManager: IdleManager,
    socketManager: SocketManager,
    ledgerSocket: DittoLedgerSocket,
    balanceUpdate: UserBalanceUpdateRes,
    userId: string,
    domainId: number
): Promise<void> {
    try {
        const domain = await getDomainById(domainId);
        if (!domain) throw new Error(`Unable to find domain of id: ${domainId}`);

        if (domain.entryPriceDittoWei) {
            const entryPrice = BigInt(domain.entryPriceDittoWei.toString());
            const paidAmount = (BigInt(balanceUpdate.liveBalanceChange) + BigInt(balanceUpdate.accumulatedBalanceChange)) * BigInt(-1); // Convert negative deduction to positive

            if (paidAmount < entryPrice) {
                throw new Error(`Insufficient DITTO deducted for domain entry. 
                    Required: ${entryPrice}, Paid: ${paidAmount}`);
            }
        }

        const user = await getUserData(userId);
        if (!user) throw new Error(`Unable to find user of id: ${userId}`);

        await combatManager.startDomainCombat(idleManager, userId, user, user.combat, domain, Date.now());
    } catch (err) {
        logger.error(`Error entering domain with DITTO fee: ${err}`);
        socketManager.emitEvent(userId, 'error', {
            userId: userId,
            msg: `Failed to enter domain. ${(err as Error).message.includes('Insufficient DITTO') ? ' Insufficient DITTO paid.' : ''}`
        });
        socketManager.emitEvent(userId, COMBAT_STOPPED_EVENT, { userId: userId });

        revertTrxToLedger(ledgerSocket, userId, DEVELOPMENT_FUNDS_KEY, balanceUpdate);
    }
}

async function handleDungeonEntry(
    combatManager: IdleCombatManager,
    idleManager: IdleManager,
    socketManager: SocketManager,
    ledgerSocket: DittoLedgerSocket,
    balanceUpdate: UserBalanceUpdateRes,
    userId: string,
    dungeonId: number
): Promise<void> {
    try {
        const dungeon = await getDungeonById(dungeonId);

        if (!dungeon) throw new Error(`Unable to find dungeon of id: ${dungeonId}`);
        if (dungeon.entryPriceDittoWei) {
            const entryPrice = BigInt(dungeon.entryPriceDittoWei.toString());
            const paidAmount = (BigInt(balanceUpdate.liveBalanceChange) + BigInt(balanceUpdate.accumulatedBalanceChange)) * BigInt(-1); // Convert negative deduction to positive

            if (paidAmount < entryPrice) {
                throw new Error(`Insufficient DITTO deducted for dungeon entry. 
                    Required: ${entryPrice}, Paid: ${paidAmount}`);
            }
        }

        const user = await getUserData(userId);
        if (!user) throw new Error(`Unable to find user of id: ${userId}`);

        await combatManager.startDungeonCombat(idleManager, userId, user, user.combat, dungeon, Date.now());
    } catch (err) {
        logger.error(`Error entering dungeon with DITTO fee: ${err}`);
        socketManager.emitEvent(userId, 'error', {
            userId: userId,
            msg: `Failed to enter dungeon. ${(err as Error).message.includes('Insufficient DITTO') ? ' Insufficient DITTO paid.' : ''}`
        });
        socketManager.emitEvent(userId, COMBAT_STOPPED_EVENT, { userId: userId });

        revertTrxToLedger(ledgerSocket, userId, DEVELOPMENT_FUNDS_KEY, balanceUpdate);
    }
}

async function revertTrxToLedger(ledgerSocket: DittoLedgerSocket, userId: string, refundTo: string, balanceUpdate: UserBalanceUpdateRes) {
    try {
        logger.info(`revertTrxToLedger:: ledgerSocket: ${ledgerSocket.id}, userId: ${userId}, refundTo: ${refundTo}, balanceUpdate: ${JSON.stringify(balanceUpdate, null, 2)}`);

        if (refundTo !== DEVELOPMENT_FUNDS_KEY) {
            throw new Error(`Invalid refund recipient: ${refundTo}`);
        }

        const updates = [
            {
                userId: userId,
                liveBalanceChange: (balanceUpdate.liveBalanceChange).toString(),
                accumulatedBalanceChange: (balanceUpdate.accumulatedBalanceChange).toString(),
                notes: balanceUpdate.notes,
                updatedAt: new Date(balanceUpdate.updatedAt!).toISOString()
            }, {
                userId: refundTo,
                liveBalanceChange: (BigInt(-balanceUpdate.liveBalanceChange) + BigInt(-balanceUpdate.accumulatedBalanceChange)).toString(),
                accumulatedBalanceChange: "0",
                notes: balanceUpdate.notes,
                updatedAt: new Date(balanceUpdate.updatedAt!).toISOString()
            }
        ];

        logger.info(`updates: ${JSON.stringify(updates, null, 2)}`);

        ledgerSocket.emit(LEDGER_REVERT_TRX_EVENT, {
            sender: refundTo,
            updates: updates
        });
    } catch (err) {
        logger.error(`Error reverting trx to ditto ledger ${err}`)
    }
}