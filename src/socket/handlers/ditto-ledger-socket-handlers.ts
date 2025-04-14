import { logger } from "../../utils/logger";
import { Socket as UserSocket, DefaultEventsMap } from "socket.io";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { LEDGER_BALANCE_ERROR_RES_EVENT, LEDGER_BALANCE_UPDATE_RES_EVENT, LEDGER_INIT_USER_SOCKET_SUCCESS_EVENT, LEDGER_REVERT_TRX_EVENT, LEDGER_UPDATE_BALANCE_EVENT, LEDGER_USER_ERROR_RES_EVENT } from "../events";
import { ValidateLoginManager } from "../../managers/validate-login/validate-login-manager";
import { SocketManager } from "../socket-manager";
import { SLIME_GACHA_PRICE_DITTO_WEI, SLIME_GACHA_PULL_TRX_NOTE } from "../../utils/transaction-config";
import { slimeGachaPull } from "../../sql-services/slime";
import { DEVELOPMENT_FUNDS_KEY, LEVERAGE_POOL_KEY } from "../../utils/config";

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
}

export async function setupDittoLedgerSocketServerHandlers(
    ledgerSocket: DittoLedgerSocket,
    validateLoginManager: ValidateLoginManager,
    socketManager: SocketManager
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
        try {
            logger.info(`Received LEDGER_BALANCE_UPDATE_RES_EVENT for ${res.userId}: ${JSON.stringify(res.payload, null, 2)}`);
            if (validateLoginManager.isUserAwaitingLogin(res.userId)) validateLoginManager.validateUserLogin(res.userId);

            // Logic to run in socket server after successful ledger trx
            if (res.payload.notes === SLIME_GACHA_PULL_TRX_NOTE) {
                await handleMintSlime(res.userId, res.payload, socketManager, ledgerSocket);
            }

            socketManager.emitEvent(res.userId, LEDGER_BALANCE_UPDATE_RES_EVENT, res);
        } catch (error) {
            logger.error(`Error forwarding balance update to ${res.userId}: ${error}`);
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
            socketManager.disconnectAllUsers();
        } catch (error) {
            logger.error(`Error disconnecting all users`);
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
        const res = await slimeGachaPull(userId);

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
    } catch (err) {
        logger.error(`Error minting gen 0 slime: ${err}`);
        socketManager.emitEvent(userId, 'mint-slime-error', {
            userId: userId,
            msg: `Failed to mint slime.`
        });

        revertTrxToLedger(ledgerSocket, userId, DEVELOPMENT_FUNDS_KEY, payload);
    }
}

async function revertTrxToLedger(ledgerSocket: DittoLedgerSocket, userId: string, refundTo: string, balanceUpdate: UserBalanceUpdateRes) {
    try {
        logger.info(`revertTrxToLedger:: ledgerSocket: ${ledgerSocket.id}, userId: ${userId}, refundTo: ${refundTo}, balanceUpdate: ${JSON.stringify(balanceUpdate, null , 2)}`);

        if (refundTo !== DEVELOPMENT_FUNDS_KEY && refundTo !== LEVERAGE_POOL_KEY) {
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