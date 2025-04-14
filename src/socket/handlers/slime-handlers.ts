import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { burnSlime, fetchSlimeObjectWithTraits, slimeGachaPull } from "../../sql-services/slime"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { SocketManager } from "../socket-manager"
import { IdleBreedingManager } from "../../managers/idle-managers/breeding-idle-manager"
import { SLIME_GACHA_PRICE_GOLD } from "../../utils/transaction-config"
import { incrementUserGoldBalance } from "../../sql-services/user-service"

interface BurnSlimeRequest {
    userId: string,
    slimeId: number
}

interface BreedSlimeRequest {
    userId: string,
    sireId: number,
    dameId: number
}

export async function setupSlimeSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager
): Promise<void> {

    socket.on("mint-gen-0-slime", async (userId: string) => {
        try {
            logger.info(`Received mint-gen-0-slime event from user ${userId}`)

            await incrementUserGoldBalance(userId, -SLIME_GACHA_PRICE_GOLD).catch(err => {
                logger.error(`Error deducting ${SLIME_GACHA_PRICE_GOLD} gold from user balance: ${err}`)
                socket.emit('mint-slime-error', {
                    userId: userId,
                    msg: `Failed to deduct gold. ${err}`
                })
                throw err
            })

            await slimeGachaPull(userId).then(res => {
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
            }).catch(async err => {
                logger.error(`Error processing mint-gen-0-slime: ${err}`)
                socket.emit('mint-slime-error', {
                    userId: userId,
                    msg: `Failed to mint slime.`
                })
                await incrementUserGoldBalance(userId, SLIME_GACHA_PRICE_GOLD)
                throw err
            })
        } catch (error) {
            logger.error(`Error processing mint-gen-0-slime: ${error}`)
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

            const sire = await fetchSlimeObjectWithTraits(data.sireId);
            const dame = await fetchSlimeObjectWithTraits(data.dameId);

            IdleBreedingManager.startBreeding(socketManager, idleManager, data.userId, sire, dame, Date.now());

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