import { logger } from '../utils/logger'
import { Server as SocketServer } from "socket.io"
import { DISCONNECT_USER_EVENT } from './events'

export class SocketManager {
    private io: SocketServer
    private socketIdByUser: Record<string, string> = {}
    private botIds: string[] = []

    constructor(io: SocketServer) {
        this.io = io
    }

    isUserSocketCached(userId: string) {
        if (userId in this.socketIdByUser) {
            return true
        } else {
            return false
        }
    }

    getSocketByUserId(userId: string) {
        const socketId = this.socketIdByUser[userId];
        if (!socketId) {
            logger.warn(`No socket ID cached for user ${userId}`);
            return null;
        }

        const socket = this.io.sockets.sockets.get(socketId);
        if (!socket) {
            logger.warn(`Socket not found for user ${userId} (socketId: ${socketId})`);
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

    disconnectAllUsers() {
        for (const userId of Object.keys(this.socketIdByUser)) {
            this.emitEvent(userId, DISCONNECT_USER_EVENT, userId);
            this.removeSocketIdCacheForUser(userId);
        }
    }

    disconnectUsersBySocketId(socketId: string) {
        // Find and remove userId from cache
        const userId = Object.entries(this.socketIdByUser).find(([, sid]) => sid === socketId)?.[0];
        if (userId) {
            this.emitEvent(userId, DISCONNECT_USER_EVENT, userId);
            this.removeSocketIdCacheForUser(userId);
            logger.info(`Removed socketId cache for user ${userId} during disconnect.`);
        }
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
