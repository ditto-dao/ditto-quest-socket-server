import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { SocketManager } from "../socket-manager"
import { COMBAT_STOPPED_EVENT, DUNGEON_LB_UPDATE_EVENT, GET_DUNGEON_LB, START_COMBAT_DOMAIN_EVENT, START_COMBAT_DUNGEON_EVENT, STOP_COMBAT_EVENT, USER_UPDATE_EVENT } from "../events"
import { IdleCombatManager } from "../../managers/idle-managers/combat/combat-idle-manager"
import { IdleManager } from "../../managers/idle-managers/idle-manager"
import { globalIdleSocketUserLock } from "../socket-handlers"
import { getDomainById, getDungeonById } from "../../operations/combat-operations"
import { getUserData, incrementUserGold } from "../../operations/user-operations"
import { prismaFetchDungeonLeaderboardPage } from "../../sql-services/combat-service"

interface StartCombatPayload {
    userId: string,
    id: number
}

export async function setupCombatSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager,
    combatManager: IdleCombatManager
): Promise<void> {
    socket.on(START_COMBAT_DOMAIN_EVENT, async (data: StartCombatPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received START_COMBAT_DOMAIN_EVENT event from user ${data.userId}`);

                const domain = await getDomainById(data.id);
                if (!domain) throw new Error(`Unable to find domain of id: ${data.id}`);

                const entryPriceGp = domain.entryPriceGP;
                if (entryPriceGp) {
                    const goldBalance = await incrementUserGold(data.userId, -entryPriceGp);
                    socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                        userId: data.userId,
                        payload: {
                            goldBalance
                        }
                    });
                }

                const user = await getUserData(data.userId);
                if (!user) throw new Error(`Unable to find user of id: ${data.userId}`);

                await combatManager.startDomainCombat(idleManager, data.userId, user, user.combat, domain, Date.now());

            } catch (error) {
                logger.error(`Error processing START_COMBAT_DOMAIN_EVENT: ${error}`)
                socketManager.emitEvent(data.userId, COMBAT_STOPPED_EVENT, { userId: data.userId })
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to enter domain'
                })
            }
        });
    })

    socket.on(START_COMBAT_DUNGEON_EVENT, async (data: StartCombatPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received START_COMBAT_DUNGEON_EVENT event from user ${data.userId}`);

                const dungeon = await getDungeonById(data.id);

                if (!dungeon) throw new Error(`Unable to find dungeon of id: ${data.id}`);

                const entryPriceGp = dungeon.entryPriceGP;
                if (entryPriceGp) {
                    const goldBalance = await incrementUserGold(data.userId, -entryPriceGp);
                    socketManager.emitEvent(data.userId, USER_UPDATE_EVENT, {
                        userId: data.userId,
                        payload: {
                            goldBalance
                        }
                    });
                }

                const user = await getUserData(data.userId);
                if (!user) throw new Error(`Unable to find user of id: ${data.userId}`);

                await combatManager.startDungeonCombat(idleManager, data.userId, user, user.combat, dungeon, Date.now());

            } catch (error) {
                logger.error(`Error processing START_COMBAT_DUNGEON_EVENT: ${error}`);
                socketManager.emitEvent(data.userId, COMBAT_STOPPED_EVENT, { userId: data.userId });
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to enter dungeon'
                });
            }
        });
    })

    socket.on(STOP_COMBAT_EVENT, async (userId: string) => {
        await globalIdleSocketUserLock.acquire(userId, async () => {
            try {
                logger.info(`Received STOP_COMBAT_EVENT event for user ${userId}`);

                await combatManager.stopCombat(idleManager, userId);
            } catch (error) {
                logger.error(`Error stopping combat for user ${userId}: ${error}`);
                socket.emit('error', {
                    userId: userId,
                    msg: 'Failed to stop combat'
                });
            }
        });
    })

    socket.on(GET_DUNGEON_LB, async (data: {
        userId: string,
        dungeonId: number,
        limit: number,
        cursor?: { id: number }
    }) => {
        try {
            logger.info(`Received GET_DUNGEON_LB event for user ${data.userId}: ${JSON.stringify(data, null, 2)}`);

            const lb = await prismaFetchDungeonLeaderboardPage(data.dungeonId, data.limit, data.cursor);

            logger.info(`LB fetched: ${JSON.stringify(lb, null, 2)}`);

            socketManager.emitEvent(data.userId, DUNGEON_LB_UPDATE_EVENT, {
                userId: data.userId,
                payload: {
                    lb
                }
            });
        } catch (error) {
            logger.error(`Error retrieving dungeon leaderboard for user ${data.userId}: ${error}`);
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to retrieve dungeon leaderboard'
            });
        }
    })
}