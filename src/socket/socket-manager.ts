import { logger } from '../utils/logger'
import { Server as SocketServer } from "socket.io"

export class SocketManager {
    private io: SocketServer
    private socketIdByUser: Record<number, string> = {}
    private botIds: number[] = []

    constructor(io: SocketServer) {
        this.io = io
    }

    isUserSocketCached(userId: number) {
        if (userId in this.socketIdByUser) {
            return true
        } else {
            return false
        }
    }

    cacheSocketIdForBot(userId: number, socketId: string) {
        this.socketIdByUser[userId] = socketId
        this.botIds.push(userId)
        logger.info(`Cached socket ID for bot ${userId}.`)
        logger.info(`Total bots: ${this.botIds.length}`)
    }

    cacheSocketIdForUser(userId: number, socketId: string) {
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

    removeSocketIdCacheForUser(userId: number) {
        if (this.socketIdByUser[userId]) {
            delete this.socketIdByUser[userId]
            logger.info(`Deleted cache of socket ID for user ${userId}.`)
        }
    }

    emitEvent(userId: number, name: string, params: any) {
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
