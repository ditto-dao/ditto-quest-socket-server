import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { SocketManager } from "../socket-manager"
import { IdleBreedingManager } from "../../managers/idle-managers/breeding-idle-manager"
import { SLIME_GACHA_PRICE_GOLD } from "../../utils/transaction-config"
import { globalIdleSocketUserLock } from "../socket-handlers"
import { emitMissionUpdate, updateGachaMission } from "../../sql-services/missions"
import { getHighestDominantTraitRarity, getSlimeSellAmountGP } from "../../utils/helpers"
import { USER_UPDATE_EVENT } from "../events"
import { incrementUserGold } from "../../operations/user-operations"
import { burnSlimeMemory, getSlimeForUserById, slimeGachaPullMemory } from "../../operations/slime-operations"
import { SlimeWithTraits } from "../../sql-services/slime"
import { requireLoggedInUser } from "../auth-helper"

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

            if (!requireLoggedInUser(userId, socket)) return

            await incrementUserGold(userId, -SLIME_GACHA_PRICE_GOLD).catch(err => {
                logger.error(`Error deducting ${SLIME_GACHA_PRICE_GOLD} gold from user balance: ${err}`)
                socket.emit('mint-slime-error', {
                    userId: userId,
                    msg: `Failed to deduct gold. ${err}`
                })
                throw err
            })

            await slimeGachaPullMemory(userId).then(async (res) => {
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

                await updateGachaMission(userId, getHighestDominantTraitRarity(res.slime), 1)
                await emitMissionUpdate(socket, userId)
            }).catch(async err => {
                logger.error(`Error processing mint-gen-0-slime: ${err}`)
                socket.emit('mint-slime-error', {
                    userId: userId,
                    msg: `Failed to mint slime.`
                })
                await incrementUserGold(userId, SLIME_GACHA_PRICE_GOLD)
                throw err
            })
        } catch (error) {
            logger.error(`Error processing mint-gen-0-slime: ${error}`)
        }
    })

    socket.on("burn-slime", async (data: BurnSlimeRequest) => {
        let slime: SlimeWithTraits | null = null

        try {
            logger.info(`Received burn-slime event from user ${data.userId}`)

            if (!requireLoggedInUser(data.userId, socket)) return

            slime = await getSlimeForUserById(data.userId, data.slimeId)
            if (slime === null) throw new Error(`Slime not found`)

            if (idleManager.isSlimeInActiveBreeding(data.userId, data.slimeId)) {
                throw new Error("Cannot sell slime that is currently breeding")
            }

            await incrementUserGold(data.userId, getSlimeSellAmountGP(slime)).catch(err => {
                logger.error(`Error deducting ${SLIME_GACHA_PRICE_GOLD} gold from user balance: ${err}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: `Failed to increment gold balance`
                })
                throw err
            }).then(goldBalance => {
                socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                    userId: data.userId,
                    payload: {
                        goldBalance
                    }
                });
            })

            await burnSlimeMemory(data.userId.toString(), data.slimeId)
        } catch (error) {
            logger.error(`Error processing burn-slime: ${error}`)

            if (slime) {
                socket.emit("update-slime-inventory", {
                    userId: data.userId,
                    payload: slime
                })
            }

            // Provide specific error message based on error type
            const errorMsg = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' && error.message.toLowerCase().includes('breeding')
                ? 'Cannot sell slime that is currently breeding'
                : 'Failed to sell slime'

            socket.emit('error', {
                userId: data.userId,
                msg: errorMsg
            })
        }
    })

    socket.on("breed-slimes", async (data: BreedSlimeRequest) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received breed-slimes event from user ${data.userId}`)

                if (!requireLoggedInUser(data.userId, socket)) return

                const sire = await getSlimeForUserById(data.userId, data.sireId)
                const dame = await getSlimeForUserById(data.userId, data.dameId)

                if (!sire || !dame) throw new Error(`Unable to process breed-slimes. Slime not found`)

                IdleBreedingManager.startBreeding(socketManager, idleManager, data.userId, sire, dame, Date.now())

            } catch (error: any) {
                logger.error(`Error processing breed-slime: ${error}`)

                const errorMsg =
                    typeof error.message === 'string' && error.message.toLowerCase().includes('inventory full')
                        ? 'Your slime inventory is full. Please free up space before breeding.'
                        : 'Failed to breed slime'

                socket.emit('error', {
                    userId: data.userId,
                    msg: errorMsg
                })
            }
        })
    })

    socket.on("stop-breed-slimes", async (data: BreedSlimeRequest) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received stop-breed-slimes event from user ${data.userId}`)

                if (!requireLoggedInUser(data.userId, socket)) return

                IdleBreedingManager.stopBreeding(idleManager, data.userId)
            } catch (error) {
                logger.error(`Error processing breed-slime: ${error}`)
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to breed slime'
                })
            }
        })
    })
}