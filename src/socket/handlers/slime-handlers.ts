import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { burnSlime, slimeGachaPull } from "../../sql-services/slime"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { SocketManager } from "../socket-manager"
import { IdleBreedingManager } from "../../managers/idle-managers/breeding-idle-manager"

interface BurnSlimeRequest {
    userId: number,
    slimeId: number
}

interface BreedSlimeRequest {
    userId: number,
    sireId: number,
    dameId: number
}

export async function setupSlimeSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager
): Promise<void> {
    socket.on("mint-gen-0-slime", async (userId: number) => {
        try {
            logger.info(`Received mint-gen-0-slime event from user ${userId}`)

            const res = await slimeGachaPull(userId);

            socket.emit("update-slime-inventory", {
                userId: userId,
                payload: res.slime
            })

            socket.emit("slime-gacha-update", {
                userId: userId,
                payload: {
                    slime: res.slime,
                    rankPull: res.rankPull,
                    slimeNoBg: res.slimeNoBg
                }
            })
        } catch (error) {
            logger.error(`Error processing mint-gen-0-slime: ${error}`)
            socket.emit('error', {
                userId: userId,
                msg: 'Failed to mint gen 0 slime'
            })
        }
    })

    socket.on("burn-slime", async (data: BurnSlimeRequest) => {
        try {
            logger.info(`Received burn-slime event from user ${data.userId}`)

            const res = await burnSlime(data.userId.toString(), data.slimeId)

            socket.emit("slime-burn-update", {
                userId: data.userId,
                payload: res
            })
        } catch (error) {
            logger.error(`Error processing burn-slime: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to burn slime'
            })
        }
    })

    socket.on("breed-slimes", async (data: BreedSlimeRequest) => {
        try {
            logger.info(`Received breed-slimes event from user ${data.userId}`)

            IdleBreedingManager.startBreeding(socketManager, idleManager, data.userId, data.sireId, data.dameId, Date.now());

        } catch (error) {
            logger.error(`Error processing breed-slime: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to breed slime'
            })
        }
    })

    socket.on("stop-breed-slimes", async (data: BreedSlimeRequest) => {
        try {
            logger.info(`Received stop-breed-slimes event from user ${data.userId}`)

            IdleBreedingManager.stopBreeding(idleManager, data.userId, data.sireId, data.dameId);
        } catch (error) {
            logger.error(`Error processing breed-slime: ${error}`)
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to breed slime'
            })
        }
    })
}