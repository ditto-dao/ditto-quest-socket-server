import { logger } from '../utils/logger'
import { Server as SocketServer } from "socket.io"
import { DISCONNECT_USER_EVENT, LEDGER_REMOVE_USER_SOCKET_EVENT } from './events'
import { Socket as DittoLedgerSocket } from "socket.io-client"

export class SocketManager {
    private io: SocketServer
    private dittoLedgerSocket: DittoLedgerSocket

    private socketIdByUser: Record<string, string> = {}
    private botIds: string[] = []

    constructor(io: SocketServer, dittoLedgerSocket: DittoLedgerSocket) {
        this.io = io
        this.dittoLedgerSocket = dittoLedgerSocket
    }

    isUserSocketCached(userId: string): boolean {
        if (!(userId in this.socketIdByUser)) {
            return false;
        }

        const socketId = this.socketIdByUser[userId];
        const socket = this.io.sockets.sockets.get(socketId);

        // If socket (adapter) doesn't exist, clean up the cache
        if (!socket) {
            logger.warn(`Cleaning up stale socket cache for user ${userId} - adapter no longer exists`);
            this.removeSocketIdCacheForUser(userId);
            return false;
        }

        return true;
    }

    getSocketByUserId(userId: string) {
        const socketId = this.socketIdByUser[userId];
        if (!socketId) {
            logger.warn(`No socket ID cached for user ${userId}`);
            return null;
        }

        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
            logger.warn(`Socket not found for user ${userId} (socketId: ${socketId}), cleaning up cache`);
            this.removeSocketIdCacheForUser(userId);
            return null;
        }

        return socket;
    }

    cacheSocketIdForBot(userId: string, socketId: string) {
        this.socketIdByUser[userId] = socketId
        this.botIds.push(userId)
        logger.info(`Cached socket ID for bot ${userId}.`)
        logger.info(`Total bots: ${this.botIds.length}`)
    }

    cacheSocketIdForUser(userId: string, socketId: string) {
        this.socketIdByUser[userId] = socketId
        logger.info(`Cached socket ID for user ${userId}.`)
        //logger.info(`Cached sockets: ${JSON.stringify(this.socketIdByUser, null, 2)}`)
        logger.info(`Total current users: ${Object.keys(this.socketIdByUser).length - this.botIds.length}`)
    }

    removeSocketIdCacheForBots() {
        for (const botId of this.botIds) {
            if (this.isUserSocketCached(botId)) {
                delete this.socketIdByUser[botId];
                logger.info(`Deleted cache of socket ID for bot ${botId}.`);
            } else {
                logger.info(`No cache found for bot ${botId}, nothing to delete.`);
            }
        }
        this.botIds = [];
        logger.info(`Cleared all bot IDs and their associated socket IDs.`);
    }

    removeSocketIdCacheForUser(userId: string) {
        if (this.socketIdByUser[userId]) {
            delete this.socketIdByUser[userId]
            logger.info(`Deleted cache of socket ID for user ${userId}.`)
        }
    }

    async disconnectAllUsers() {
        for (const userId of Object.keys(this.socketIdByUser)) {
            this.emitEvent(userId, DISCONNECT_USER_EVENT, userId);
            this.removeSocketIdCacheForUser(userId);
            this.dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString())
        }
    }

    async disconnectUsersBySocketId(socketId: string) {
        // Find all userIds matching this socketId
        const userIds = Object.entries(this.socketIdByUser)
            .filter(([, sid]) => sid === socketId)
            .map(([userId]) => userId);

        if (userIds.length === 0) {
            logger.warn(`No users found for socketId ${socketId}`);
            return [];
        }

        for (const userId of userIds) {
            try {
                this.emitEvent(userId, DISCONNECT_USER_EVENT, userId);
                this.removeSocketIdCacheForUser(userId);
                this.dittoLedgerSocket.emit(LEDGER_REMOVE_USER_SOCKET_EVENT, userId.toString());
                logger.info(`Removed socketId cache for user ${userId} during disconnect.`);
            } catch (err) {
                logger.error(`Failed to disconnect user ${userId} for socketId ${socketId}: ${err}`);
            }
        }

        return userIds;
    }

    emitEvent(userId: string, name: string, params: any) {
        try {
            if (this.isUserSocketCached(userId)) {
                this.io.to(this.socketIdByUser[userId]).emit(name, params)
            }
        } catch (err) {
            logger.error(`Error emitting ${name} event to user ${userId}`)
        }
    }

    emitEventToAll(name: string, params: any) {
        try {
            this.io.emit(name, params)
        } catch (err) {
            logger.error(`Error emitting ${name} event to all users`)
        }
    }

}
