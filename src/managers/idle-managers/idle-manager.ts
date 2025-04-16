import { logger } from '../../utils/logger';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { MAX_CONCURRENT_IDLE_ACTIVITIES, MAX_OFFLINE_IDLE_PROGRESS_S } from '../../utils/config';
import { deleteAllIdleActivityQueueElements, getIdleActivityQueueElements, storeIdleActivityQueueElements } from '../../redis/idle-activity-redis';
import { IdleFarmingManager } from './farming-idle-manager';
import { SocketManager } from '../../socket/socket-manager';
import { IdleCraftingManager } from './crafting-idle-manager';
import { IdleBreedingManager } from './breeding-idle-manager';
import { IdleActivityIntervalElement, ProgressUpdate, TimerHandle } from './idle-manager-types';
import { CurrentCombat, OfflineCombatManager } from './combat/offline-combat-manager';
import { Socket as DittoLedgerSocket } from "socket.io-client";

export class IdleManager {
    private socketManager: SocketManager;
    private dittoLedgerSocket: DittoLedgerSocket;
    private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

    private idleActivitiesQueueElementByUser: Record<string, IdleActivityIntervalElement[]> = {};

    constructor(
        redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
        socketManager: SocketManager,
        dittoLedgerSocket: DittoLedgerSocket,
    ) {
        this.redisClient = redisClient;
        this.socketManager = socketManager;
        this.dittoLedgerSocket = dittoLedgerSocket;
    }

    // Append to user list
    async appendIdleActivityByUser(userId: string, element: IdleActivityIntervalElement) {
        try {
            let queueLength = this.idleActivitiesQueueElementByUser[userId]?.length ?? 0;

            while (queueLength >= MAX_CONCURRENT_IDLE_ACTIVITIES) {
                logger.info(`Popping because queue is too long... current length: ${queueLength}`);
                await this.popIdleActivityByUser(userId);
                queueLength = this.idleActivitiesQueueElementByUser[userId]?.length ?? 0;
            }

            const list = this.idleActivitiesQueueElementByUser[userId] ||= [];
            list.push(element);

            logger.info(`Appended. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
        } catch (err) {
            logger.error(`Error appending idle activity for user ${userId}: ${err}`);
            if (element.activity !== 'combat') IdleManager.clearCustomInterval(element.activityInterval);
        }
    }

    // Remove element from user list
    async popIdleActivityByUser(userId: string): Promise<void> {
        const queue = this.idleActivitiesQueueElementByUser[userId];

        if (!queue || queue.length === 0) {
            logger.warn(`No idle activity found for user ${userId}`);
            return;
        }

        const lastActivity = queue.shift();

        if (lastActivity) {
            if (lastActivity.activity !== 'combat') IdleManager.clearCustomInterval(lastActivity.activityInterval);

            try {
                await lastActivity.activityStopCallback();
                logger.info(`Stopped ${lastActivity.activity} idle activity for user ${userId}`);
            } catch (err) {
                logger.error(`Error while stopping idle activity for user ${userId}:`, err);
            }
        }

        if (queue.length === 0) {
            delete this.idleActivitiesQueueElementByUser[userId];
        }

        logger.info(`Popped. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
    }

    // Removes a specific farming interval element by userId and itemId
    async removeFarmingActivity(userId: string, itemId: number): Promise<void> {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list) return;

        const index = list.findIndex(
            (el) => el.activity === 'farming' && el.item.id === itemId
        );

        if (index !== -1) {
            const [removed] = list.splice(index, 1);

            if (removed.activity !== 'farming') throw new Error(`Tried to remove an unexpected idle activity !== farming.`);

            IdleManager.clearCustomInterval(removed.activityInterval);

            await removed.activityStopCallback().catch((err) =>
                logger.error(`Error stopping farming activity for user ${userId}:`, err)
            );

            if (list.length === 0) {
                delete this.idleActivitiesQueueElementByUser[userId];
            }
        }

        logger.info(`Removed idle farming activity. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
    }

    // Removes a specific crafting interval element by userId and equipmentId
    async removeCraftingActivity(userId: string, equipmentId: number): Promise<void> {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list) return;

        const index = list.findIndex(
            (el) => el.activity === 'crafting' && el.equipment.id === equipmentId
        );

        if (index !== -1) {
            const [removed] = list.splice(index, 1);

            if (removed.activity !== 'crafting') throw new Error(`Tried to remove an unexpected idle activity !== crafting.`);

            IdleManager.clearCustomInterval(removed.activityInterval);

            await removed.activityStopCallback().catch((err) =>
                logger.error(`Error stopping crafting activity for user ${userId}:`, err)
            );

            if (list.length === 0) {
                delete this.idleActivitiesQueueElementByUser[userId];
            }
        }

        logger.info(`Removed idle crafting activity. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
    }

    // Removes a specific breeding interval element by userId, sireId, and dameId
    async removeBreedingActivity(userId: string, sireId: number, dameId: number): Promise<void> {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list) return;

        const index = list.findIndex(
            (el) =>
                el.activity === 'breeding' &&
                el.sire.id === sireId &&
                el.dame.id === dameId
        );

        if (index !== -1) {
            const [removed] = list.splice(index, 1);

            if (removed.activity !== 'breeding') throw new Error(`Tried to remove an unexpected idle activity !== breeding.`);

            IdleManager.clearCustomInterval(removed.activityInterval);

            await removed.activityStopCallback().catch((err) =>
                logger.error(`Error stopping breeding activity for user ${userId}:`, err)
            );

            if (list.length === 0) {
                delete this.idleActivitiesQueueElementByUser[userId];
            }
        }

        logger.info(`Removed idle breeding activity. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
    }

    // Removes all breeding activities for a user that involve a specific sire or dame
    async removeBreedingActivitiesBySlimeId(userId: string, slimeId: number): Promise<void> {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list) return;

        const remaining: IdleActivityIntervalElement[] = [];

        for (const el of list) {
            if (
                el.activity === 'breeding' &&
                (el.sire.id === slimeId || el.dame.id === slimeId)
            ) {
                IdleManager.clearCustomInterval(el.activityInterval);
                await el.activityStopCallback().catch((err) =>
                    logger.error(`Error stopping breeding activity (slimeId=${slimeId}) for user ${userId}:`, err)
                );
            } else {
                remaining.push(el);
            }
        }

        if (remaining.length > 0) {
            this.idleActivitiesQueueElementByUser[userId] = remaining;
        } else {
            delete this.idleActivitiesQueueElementByUser[userId];
        }

        logger.info(`Removed breeding activities involving slimeId=${slimeId}. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
    }

    async removeAllCombatActivities(userId: string): Promise<void> {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list || list.length === 0) return;

        const filtered: IdleActivityIntervalElement[] = [];

        for (const activity of list) {
            if (activity.activity === 'combat') {
                try {
                    await activity.activityStopCallback();
                } catch (err) {
                    logger.error(`Error stopping combat activity for user ${userId}: ${err}`);
                    filtered.push(activity);
                }
            } else {
                filtered.push(activity);
            }
        }

        if (filtered.length > 0) {
            this.idleActivitiesQueueElementByUser[userId] = filtered;
        } else {
            delete this.idleActivitiesQueueElementByUser[userId];
        }

        logger.info(`Removed all combat activities for user ${userId}. Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
    }

    updateCombatActivity(userId: string, updates: Partial<IdleActivityIntervalElement>) {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list) return;

        const activity = list.find((el) => el.activity === 'combat');
        if (!activity) return;

        Object.assign(activity, updates);
        logger.info(`Updated combat activity for user ${userId} with: ${JSON.stringify(updates)}`);
    }

    async saveAllIdleActivitiesOnLogout(userId: string): Promise<void> {
        try {
            // Retrieve all activities for the user from memory
            const userActivities = this.idleActivitiesQueueElementByUser[userId] || [];

            if (userActivities.length === 0) {
                logger.info(`No idle activities found for user ${userId} to save.`);
                return;
            }

            const now = Date.now();
            for (const element of userActivities) {
                element.logoutTimestamp = now;
            }

            // Store activities in Redis using the imported function
            await storeIdleActivityQueueElements(this.redisClient, userId, userActivities);

            // Clear all activities from the queue and user list
            const queue = this.idleActivitiesQueueElementByUser[userId];
            if (queue) {
                while (queue.length > 0) {
                    await this.popIdleActivityByUser(userId);
                }
            }

            // Remove the user's activities from the in-memory list
            logger.info(`Saved and cleared ${userActivities.length} idle activities for user ${userId}.`);
        } catch (error) {
            logger.error(`Error saving all idle activities for user ${userId}: ${error}`);
        }
    }

    async loadIdleActivitiesOnLogin(userId: string): Promise<CurrentCombat | undefined> {
        try {
            const activities = await getIdleActivityQueueElements(this.redisClient, userId);
            await deleteAllIdleActivityQueueElements(this.redisClient, userId);

            if (activities.length <= 0) {
                this.socketManager.emitEvent(userId, "idle-progress-update", {
                    userId: userId,
                    payload: {
                    },
                });
            };

            const progressUpdates: { update?: ProgressUpdate, currentCombat?: CurrentCombat }[] = [];

            for (const activity of activities) {
                if (activity.activity === 'farming') {
                    const update = await IdleFarmingManager.handleLoadedFarmingActivity(this.socketManager, this, activity, userId);
                    progressUpdates.push({ update });
                } else if (activity.activity === 'crafting') {
                    const update = await IdleCraftingManager.handleLoadedCraftingActivity(this.socketManager, this, activity, userId);
                    progressUpdates.push({ update });
                } else if (activity.activity === 'breeding') {
                    const update = await IdleBreedingManager.handleLoadedBreedingActivity(this.socketManager, this, activity, userId);
                    progressUpdates.push({ update });
                } else if (activity.activity === 'combat') {
                    const combatUpdate = await OfflineCombatManager.handleLoadedCombatActivity(this.dittoLedgerSocket, activity);
                    progressUpdates.push({
                        update: combatUpdate.combatUpdate,
                        currentCombat: combatUpdate.currentCombat
                    });
                } else {
                    throw new Error(`Unexpected offline activity.`);
                }
            }

            const updatesOnly = progressUpdates
                .map((entry) => entry.update)
                .filter((u): u is ProgressUpdate => u !== undefined);

            logger.info(`idle progress update: ${JSON.stringify(updatesOnly, null, 2)}`);

            this.socketManager.emitEvent(userId, "idle-progress-update", {
                userId: userId,
                payload: {
                    offlineProgressMs: Math.min(
                        Date.now() - activities[0].logoutTimestamp!,
                        MAX_OFFLINE_IDLE_PROGRESS_S * 1000
                    ),
                    updates: updatesOnly,
                },
            });

            return progressUpdates.find((entry) => entry.currentCombat !== undefined)?.currentCombat;
        } catch (err) {
            logger.error(`Error loading idle activities on login for user ${userId}: ${err}`);
        }
    }

    async saveAllUsersIdleActivities(): Promise<void> {
        const userIds = Object.keys(this.idleActivitiesQueueElementByUser);

        if (userIds.length === 0) {
            logger.info('No active idle activities to save before shutdown.');
            return;
        }

        logger.info(`Saving idle activities for ${userIds.length} user(s) before shutdown.`);

        const now = Date.now();

        for (const userId of userIds) {
            const activities = this.idleActivitiesQueueElementByUser[userId];

            if (!activities || activities.length === 0) continue;

            for (const element of activities) {
                element.logoutTimestamp = now;
            }

            try {
                await storeIdleActivityQueueElements(this.redisClient, userId, activities);
                logger.info(`Saved ${activities.length} idle activities for user ${userId}`);
            } catch (err) {
                logger.error(`Failed to save idle activities for user ${userId}: ${err}`);
            }

            delete this.idleActivitiesQueueElementByUser[userId];
        }

        logger.info('✅ Finished saving all cached idle activities.');
    }

    static startCustomInterval(
        firstDelay: number,
        repeatDelay: number,
        callback: () => Promise<void>
    ): TimerHandle {
        const handle: TimerHandle = {
            timeout: undefined,
            interval: undefined
        };

        let isRunning = false;

        const intervalFn = async (source: "first" | "interval", rethrowError = false) => {
            if (isRunning) {
                logger.debug(`[${source}] interval already running, skipping tick.`);
                return;
            }

            isRunning = true;
            logger.info(`[${source}] interval executing callback.`);

            try {
                await callback();
                logger.info(`[${source}] callback finished.`);
            } catch (err) {
                logger.error(`[${source}] error in interval callback: ${err}`);
                if (rethrowError) throw err;
            } finally {
                isRunning = false;
            }
        };

        logger.info(`[first] interval scheduled to start in ${firstDelay}ms and repeat every ${repeatDelay}ms.`);

        handle.timeout = setTimeout(async () => {
            try {
                await intervalFn("first", true); // will throw if callback fails
                handle.interval = setInterval(() => intervalFn("interval"), repeatDelay);
                logger.info(`[interval] repeating interval started.`);
            } catch (err) {
                logger.error(`[first] error in first callback, not starting interval: ${err}`);
                IdleManager.clearCustomInterval(handle);
            }
        }, firstDelay);

        return handle;
    }

    static clearCustomInterval(handle: TimerHandle): void {
        if (handle.timeout) {
            clearTimeout(handle.timeout);
            logger.info(`Cleared timeout`);
        }

        if (handle.interval) {
            clearInterval(handle.interval);
            logger.info(`Cleared interval`);
        }

        logger.info(`Cleared: timeout=${!!handle.timeout}, interval=${!!handle.interval}`);
    }
}
