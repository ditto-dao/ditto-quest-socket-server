import { logger } from '../../utils/logger';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { MAX_CONCURRENT_IDLE_ACTIVITIES, MAX_OFFLINE_IDLE_PROGRESS_S } from '../../utils/config';
import { deleteAllIdleActivityQueueElements, getIdleActivityQueueElements, storeIdleActivityQueueElements } from '../../redis/idle-activity-redis';
import { IdleFarmingManager } from './farming-idle-manager';
import { SocketManager } from '../../socket/socket-manager';
import { IdleCraftingManager } from './crafting-idle-manager';
import { IdleBreedingManager } from './breeding-idle-manager';
import { IdleActivityIntervalElement, IntervalActivity, ProgressUpdate, TimerHandle } from './idle-manager-types';
import { CurrentCombat, OfflineCombatManager } from './combat/offline-combat-manager';
import { Socket as DittoLedgerSocket } from "socket.io-client";
import AsyncLock from 'async-lock';

export class IdleManager {
    private socketManager: SocketManager;
    private dittoLedgerSocket: DittoLedgerSocket;
    private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

    private idleActivitiesQueueElementByUser: Record<string, IdleActivityIntervalElement[]> = {};

    private lock = new AsyncLock();

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
        await this.lock.acquire(userId, async () => {
            try {
                let queueLength = this.idleActivitiesQueueElementByUser[userId]?.length ?? 0;
                logger.info(`📥 Attempting to append ${element.activity} for user ${userId}. Current queue length: ${queueLength}`);

                while (queueLength >= MAX_CONCURRENT_IDLE_ACTIVITIES) {
                    logger.info(`🔁 Queue too long for user ${userId} (len=${queueLength}), popping oldest activity...`);
                    await this.popIdleActivityByUser(userId);
                    queueLength = this.idleActivitiesQueueElementByUser[userId]?.length ?? 0;
                    logger.info(`🔄 Queue length after pop: ${queueLength}`);
                }

                const list = this.idleActivitiesQueueElementByUser[userId] ||= [];
                list.push(element);

                const newQueue = list.map(a => a.activity).join(", ");
                logger.info(`➕ Appended ${element.activity} for user ${userId}. New queue: [${newQueue}]`);

                const activeCount = Object.values(this.idleActivitiesQueueElementByUser).flat().length;
                logger.info(`📊 Post-append active interval count: ${activeCount}`);
            } catch (err) {
                logger.error(`❌ Error appending idle activity (${element.activity}) for user ${userId}:`, err);
                if (element.activity !== 'combat') IdleManager.clearCustomInterval(element.activityInterval);
            }
        });
    }

    // Remove element from user list
    private async popIdleActivityByUser(userId: string): Promise<void> {
        const queue = this.idleActivitiesQueueElementByUser[userId];

        logger.info(`🔽 Attempting to pop idle activity for user ${userId}, queue is too long... current length: ${queue.length}`);

        if (!queue || queue.length === 0) {
            logger.warn(`⚠️ No idle activity found for user ${userId}`);
            return;
        }

        const popped = queue.shift();

        if (popped) {
            logger.info(`🧹 Popped activity: ${popped.activity} for user ${userId}`);

            if (popped.activity !== 'combat') {
                logger.info(`🧼 Clearing interval for non-combat activity: ${popped.activity}`);
                IdleManager.clearCustomInterval(popped.activityInterval);
            }

            try {
                await popped.activityStopCallback();
                logger.info(`✅ Successfully stopped ${popped.activity} activity for user ${userId}`);
            } catch (err) {
                logger.error(`❌ Error while stopping ${popped.activity} activity for user ${userId}:`, err);
            }
        } else {
            logger.warn(`⚠️ Queue not empty but shift() returned undefined for user ${userId}`);
        }

        if (queue.length === 0) {
            delete this.idleActivitiesQueueElementByUser[userId];
            logger.info(`📭 Cleared queue mapping for user ${userId} as queue is now empty`);
        } else {
            logger.info(`📋 Remaining activities for user ${userId}: ${queue.map(a => a.activity).join(", ")}`);
        }

        const activeCount = Object.values(this.idleActivitiesQueueElementByUser).flat().length;
        logger.info(`📊 Post-pop active interval count: ${activeCount}`);
    }

    // Removes all farming interval elements by userId
    async removeFarmingActivity(userId: string): Promise<void> {
        await this.lock.acquire(userId, async () => {
            const list = this.idleActivitiesQueueElementByUser[userId];
            if (!list) return;

            const remaining: IdleActivityIntervalElement[] = [];

            for (const el of list) {
                if (el.activity === 'farming') {
                    IdleManager.clearCustomInterval(el.activityInterval);

                    await el.activityStopCallback().catch((err) =>
                        logger.error(`Error stopping farming activity for user ${userId}:`, err)
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

            logger.info(`Removed all farming activities. New queue length for user ${userId}: ${remaining.length}`);
            logger.info(`Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
        });
    }

    // Removes all crafting interval elements by userId
    async removeCraftingActivity(userId: string): Promise<void> {
        await this.lock.acquire(userId, async () => {
            const list = this.idleActivitiesQueueElementByUser[userId];
            if (!list) return;

            const remaining: IdleActivityIntervalElement[] = [];

            for (const el of list) {
                if (el.activity === 'crafting') {
                    IdleManager.clearCustomInterval(el.activityInterval);

                    await el.activityStopCallback().catch((err) =>
                        logger.error(`Error stopping crafting activity for user ${userId}:`, err)
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

            logger.info(`Removed all crafting activities. New queue length for user ${userId}: ${remaining.length}`);
            logger.info(`Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
        });
    }

    // Removes all breeding interval elements by userId
    async removeBreedingActivity(userId: string): Promise<void> {
        await this.lock.acquire(userId, async () => {
            const list = this.idleActivitiesQueueElementByUser[userId];
            if (!list) return;

            const remaining: IdleActivityIntervalElement[] = [];

            for (const el of list) {
                if (el.activity === 'breeding') {
                    IdleManager.clearCustomInterval(el.activityInterval);

                    await el.activityStopCallback().catch((err) =>
                        logger.error(`Error stopping breeding activity for user ${userId}:`, err)
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

            logger.info(`Removed all breeding activities. New queue length for user ${userId}: ${remaining.length}`);
            logger.info(`Active interval count: ${Object.values(this.idleActivitiesQueueElementByUser).flat().length}`);
        });
    }

    async removeAllCombatActivities(userId: string): Promise<void> {
        await this.lock.acquire(userId, async () => {
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
        });
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
        await this.lock.acquire(userId, async () => {
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
        });
    }

    async loadIdleActivitiesOnLogin(userId: string): Promise<{ currentCombat?: CurrentCombat, progressUpdates: ProgressUpdate[], offlineProgressMs: number }> {
        return await this.lock.acquire(userId, async () => {
            try {
                const activities = await getIdleActivityQueueElements(this.redisClient, userId);
                await deleteAllIdleActivityQueueElements(this.redisClient, userId);

                if (activities.length <= 0) {
                    return { progressUpdates: [], offlineProgressMs: 0 };
                }

                const progressUpdates: { update?: ProgressUpdate, currentCombat?: CurrentCombat }[] = [];

                for (const activity of activities) {
                    if (activity.activity === 'farming') {
                        logger.info(`Offline farming activity found.`)
                        const update = await IdleFarmingManager.handleLoadedFarmingActivity(this.socketManager, this, activity, userId);
                        progressUpdates.push({ update });
                    } else if (activity.activity === 'crafting') {
                        logger.info(`Offline crafting activity found.`)
                        const update = await IdleCraftingManager.handleLoadedCraftingActivity(this.socketManager, this, activity, userId);
                        progressUpdates.push({ update });
                    } else if (activity.activity === 'breeding') {
                        logger.info(`Offline breeding activity found.`)
                        const update = await IdleBreedingManager.handleLoadedBreedingActivity(this.socketManager, this, activity, userId);
                        progressUpdates.push({ update });
                    } else if (activity.activity === 'combat') {
                        logger.info(`Offline combat activity found.`)
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

                const offlineProgressMs = Math.min(
                    Date.now() - activities[0].logoutTimestamp!,
                    MAX_OFFLINE_IDLE_PROGRESS_S * 1000
                );

                // Return the data for login manager to emit
                return {
                    currentCombat: progressUpdates.find((entry) => entry.currentCombat !== undefined)?.currentCombat,
                    progressUpdates: updatesOnly,
                    offlineProgressMs
                };
            } catch (err) {
                logger.error(`Error loading idle activities on login for user ${userId}: ${err}`);
                return { progressUpdates: [], offlineProgressMs: 0 };
            }
        });
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

    async startCustomInterval(
        userId: string,
        firstDelay: number,
        repeatDelay: number,
        callback: () => Promise<void>
    ): Promise<TimerHandle> {
        return await this.lock.acquire(userId, async () => {
            let cancelled = false;

            const handle: TimerHandle = {
                timeout: undefined,
                interval: undefined,
                cancel: () => {
                    cancelled = true;
                }
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
                if (cancelled) {
                    logger.warn(`[first] interval setup skipped because handle was cancelled early`);
                    return;
                }

                try {
                    await intervalFn("first", true);

                    if (cancelled) {
                        logger.warn(`[first] interval not started — cancelled after first tick`);
                        return;
                    }

                    handle.interval = setInterval(() => intervalFn("interval"), repeatDelay);
                    logger.info(`[interval] repeating interval started.`);
                } catch (err) {
                    logger.error(`[first] error in first callback, not starting interval: ${err}`);
                    IdleManager.clearCustomInterval(handle);
                }
            }, firstDelay);

            return handle;
        });
    }

    static clearCustomInterval(handle: TimerHandle): void {
        if (!handle) return;

        if (handle.cancel) handle.cancel(); // cancel flag

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

    patchIntervalActivity(
        userId: string,
        activityType: IntervalActivity["activity"],
        matchFn: (el: IntervalActivity) => boolean,
        interval: TimerHandle
    ) {
        const list = this.idleActivitiesQueueElementByUser[userId];
        if (!list) return;

        for (const el of list) {
            if (el.activity === activityType && matchFn(el as IntervalActivity)) {
                (el as IntervalActivity).activityInterval = interval;
                logger.info(`🛠 Patched interval on ${activityType} for user ${userId}`);
                break;
            }
        }
    }
}
