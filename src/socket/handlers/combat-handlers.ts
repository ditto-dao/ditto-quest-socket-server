import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { IdleFarmingManager } from "../../managers/idle-managers/farming-idle-manager"
import { SocketManager } from "../socket-manager"
import { getItemById } from "../../sql-services/item-service"
import { COMBAT_STOPPED_EVENT, START_COMBAT_DOMAIN_EVENT, STOP_COMBAT_EVENT } from "../events"
import { IdleCombatManager } from "../../managers/idle-managers/combat/combat-idle-manager"
import { getDomainById } from "../../sql-services/combat-service"
import { getSimpleUserData } from "../../sql-services/user-service"
import { IdleManager } from "../../managers/idle-managers/idle-manager"

interface StartCombatDomainPayload {
    userId: string,
    domainId: number
}

export async function setupCombatSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    socketManager: SocketManager,
    idleManager: IdleManager,
    combatManager: IdleCombatManager
): Promise<void> {
    socket.on(START_COMBAT_DOMAIN_EVENT, async (data: StartCombatDomainPayload) => {
        try {
            logger.info(`Received START_COMBAT_DOMAIN_EVENT event from user ${data.userId}`)

            const domain = await getDomainById(data.domainId);
            if (!domain) throw new Error(`Unable to find domain of id: ${data.domainId}`);
            const user = await getSimpleUserData(data.userId);
            if (!user) throw new Error(`Unable to find user of id: ${data.userId}`);

            await combatManager.startDomainCombat(idleManager,data.userId, user, user.combat, domain, Date.now());

        } catch (error) {
            logger.error(`Error processing START_COMBAT_DOMAIN_EVENT: ${error}`)
            socketManager.emitEvent(data.userId, COMBAT_STOPPED_EVENT, { userId: data.userId })
            socket.emit('error', {
                userId: data.userId,
                msg: 'Failed to enter domain'
            })
        }
    })

    socket.on(STOP_COMBAT_EVENT, async (userId: string) => {
        try {
            logger.info(`Received STOP_COMBAT_EVENT event for user ${userId}`);

            await combatManager.stopCombat(idleManager, userId);
        } catch (error) {
            logger.error(`Error stopping combat for user ${userId}\: ${error}`)
            socket.emit('error', {
                userId: userId,
                msg: 'Failed to stop combat'
            })
        }
    })
}