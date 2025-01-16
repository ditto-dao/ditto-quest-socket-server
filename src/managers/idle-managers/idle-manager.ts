import { logger } from '../../utils/logger';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { MAX_CONCURRENT_IDLE_ACTIVITIES } from '../../utils/config';
import { deleteAllIdleActivityQueueElements, getIdleActivityQueueElements, storeIdleActivityQueueElements } from '../../redis/idle-activity-redis';
import { IdleFarmingManager } from './farming-idle-manager';
import { SocketManager } from '../../socket/socket-manager';
import { IdleCraftingManager } from './crafting-idle-manager';
import { IdleBreedingManager } from './breeding-idle-manager';

export type IdleActivityLabel = 'crafting' | 'breeding' | 'farming' | 'combat';

export interface ProgressUpdate {
    type: IdleActivityLabel;
    update: {
        equipment?: {
            equipmentId: number;
            equipmentName: string;
            quantity: number;
        }[];
        items?: {
            itemId: number;
            itemName: string;
            quantity: number;
        }[];
        expGained?: number;
        slimes?: {
            slimeId: number;
        }[];
        farmingExpGained?: number;
        farmingLevelsGained?: number;
        craftingExpGained?: number;
        craftingLevelsGained?: number;
    };
}

export interface IdleActivityQueueElement {
    userId: number;
    activity: IdleActivityLabel;
    startTimestamp: number;
    durationS: number;
    nextTriggerTimestamp: number;
    activityCompleteCallback: () => Promise<void>;
    activityStopCallback: () => Promise<void>;
    equipmentId?: number;
    itemId?: number;
    sireId?: number;
    dameId?: number;
    name?: string;
    logoutTimestamp?: number;
}

export class IdleManager {
    private socketManager: SocketManager;
    private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

    private idleActivitiesQueueElementByUser: Record<number, IdleActivityQueueElement[]> = {};

    private globalTimeout: NodeJS.Timeout | null = null;
    private idleActivityQueue: IdleActivityQueueElement[] = [];

    constructor(
        redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>,
        socketManager: SocketManager
    ) {
        this.redisClient = redisClient;
        this.socketManager = socketManager;
    }

    // Append to queue
    queueIdleActivityElement(element: IdleActivityQueueElement) {
        try {
            if (this.idleActivityQueue.length === 0) {
                this.idleActivityQueue.push(element);
                this.setNextTimeout();
            } else {
                for (let i = 0; i < this.idleActivityQueue.length; i++) {
                    if (element.nextTriggerTimestamp < this.idleActivityQueue[i].nextTriggerTimestamp) {

                        // Insert the element at the current position
                        this.idleActivityQueue.splice(i, 0, element);

                        if (i === 0) {
                            this.clearGlobalTimeout();
                            this.setNextTimeout();
                        }

                        return; // Exit the function after inserting
                    }
                }

                // If no element with a higher timestamp is found, add it to the end
                this.idleActivityQueue.push(element);

                logger.info(`Successfully pushed idle activity to queue: ${JSON.stringify(this.idleActivityQueue, null, 2)}`);
            }
        } catch (err) {
            logger.error(`Error queueing idle activity element: ${err}`);
        }
    }

    // Append to user list
    appendIdleActivityByUser(userId: number, element: IdleActivityQueueElement) {
        try {
            const list = (this.idleActivitiesQueueElementByUser[userId]) ? this.idleActivitiesQueueElementByUser[userId] : [];
            if (list.length >= MAX_CONCURRENT_IDLE_ACTIVITIES) {
                const removedElement = list.shift();    // remove index 0 from user list
                if (removedElement) {
                    const keys = this.getPrimaryKeysFromIdleActivity(removedElement);
                    this.removeIdleActivityElementFromQueue(userId, removedElement!.activity, keys.primaryKey0, keys.primaryKey1);
                }
            }
            list.push(element);

            this.idleActivitiesQueueElementByUser[userId] = list;
        } catch (err) {
            logger.error(`Error appending idle activity for user ${userId}: ${err}`);
        }
    }

    // Remove element from queue
    removeIdleActivityElementFromQueue(
        userId: number,
        activity: IdleActivityLabel,
        primaryKey0?: number,
        primaryKey1?: number
    ): void {
        try {
            const indices = this.findAllIndicesByActivity(this.idleActivityQueue, userId, activity, primaryKey0, primaryKey1);

            // Sort indices in descending order to safely remove from the list
            indices.sort((a, b) => b - a);

            for (const index of indices) {
                this.idleActivityQueue[index].activityStopCallback();
                this.removeElementFromListByIndex(this.idleActivityQueue, index, 'queue');
            }

            if (this.idleActivityQueue.length === 0) this.clearGlobalTimeout();
        } catch (err) {
            logger.error(`Error removing ${activity} idle activity from queue for user ${userId}: ${err}`);
        }
    }

    // Remove element from user list
    removeIdleActivityByUser(
        userId: number,
        activity: IdleActivityLabel,
        primaryKey0?: number,
        primaryKey1?: number
    ): void {
        try {
            if (!this.idleActivitiesQueueElementByUser[userId]) {
                throw new Error('User has no idle activities.');
            }

            const indices = this.findAllIndicesByActivity(
                this.idleActivitiesQueueElementByUser[userId],
                userId,
                activity,
                primaryKey0,
                primaryKey1
            );

            // Sort indices in descending order to safely remove from the list
            indices.sort((a, b) => b - a);

            for (const index of indices) {
                this.removeElementFromListByIndex(this.idleActivitiesQueueElementByUser[userId], index, `user list for userId ${userId}`);
            }

        } catch (err) {
            logger.error(`Error removing ${activity} idle activity for user ${userId}: ${err}`);
        }
    }

    async saveAllIdleActivitiesOnLogout(userId: number): Promise<void> {
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
            for (const activity of userActivities) {
                const keys = this.getPrimaryKeysFromIdleActivity(activity);
                this.removeIdleActivityElementFromQueue(userId, activity.activity, keys.primaryKey0, keys.primaryKey1);
            }

            // Remove the user's activities from the in-memory list
            delete this.idleActivitiesQueueElementByUser[userId];

            logger.info(`Saved and cleared ${userActivities.length} idle activities for user ${userId}.`);
        } catch (error) {
            logger.error(`Error saving all idle activities for user ${userId}: ${error}`);
        }
    }

    async loadIdleActivitiesOnLogin(userId: number): Promise<void> {
        try {
            const activities = await getIdleActivityQueueElements(this.redisClient, userId);
            await deleteAllIdleActivityQueueElements(this.redisClient, userId);

            if (activities.length <= 0) return;

            const progressUpdates = await Promise.all(
                activities.map(async (activity) => {
                    if (activity.activity === 'farming') {
                        return IdleFarmingManager.handleLoadedFarmingActivity(this.socketManager, this, activity, userId);
                    } else if (activity.activity === 'crafting') {
                        return IdleCraftingManager.handleLoadedCraftingActivity(this.socketManager, this, activity, userId);
                    } else if (activity.activity === 'breeding') {
                        return IdleBreedingManager.handleLoadedBreedingActivity(this.socketManager, this, activity, userId);
                    }
                })
            );

            // Emit progress update
            this.socketManager.emitEvent(userId, 'idle-progress-update', {
                userId: userId,
                payload: progressUpdates
            });

            logger.info(`Emitted idle-progress-update: ${JSON.stringify(progressUpdates, null, 2)}`);
        } catch (err) {
            logger.error(`Error loading idle activities on login  for user ${userId}: ${err}`);
        }
    }

    private findAllIndicesByActivity(
        list: IdleActivityQueueElement[],
        userId: number,
        activity: IdleActivityLabel,
        primaryKey0?: number,
        primaryKey1?: number
    ): number[] {
        if (!primaryKey0 && (activity === 'farming' || activity === 'crafting')) {
            throw new Error('Primary key not found.');
        }
        if ((!primaryKey0 || !primaryKey1) && activity === 'breeding') {
            throw new Error('Primary key not found.');
        }

        return list
            .map((element, index) => {
                if (element.userId !== userId || element.activity !== activity) {
                    return null;
                }

                const isMatch = (() => {
                    switch (activity) {
                        case 'farming':
                            return 'itemId' in element && element.itemId === primaryKey0;
                        case 'crafting':
                            return 'equipmentId' in element && element.equipmentId === primaryKey0;
                        case 'breeding':
                            return (
                                'sireId' in element &&
                                element.sireId === primaryKey0 &&
                                'dameId' in element &&
                                element.dameId === primaryKey1
                            );
                        case 'combat':
                            throw new Error('Combat activity not supported yet.');
                        default:
                            throw new Error('Idle activity not recognized.');
                    }
                })();

                return isMatch ? index : null;
            })
            .filter((index) => index !== null) as number[];
    }

    private removeElementFromListByIndex(
        list: IdleActivityQueueElement[],
        index: number,
        logContext: string
    ): void {
        if (index !== -1) {
            list.splice(index, 1);
            logger.info(`Removed idle activity from ${logContext} at index ${index}`);
        } else {
            throw new Error(`Failed to remove idle activity from ${logContext}. Idle activity not found.`);
        }
    }

    // Pop idle activity queue element at index 0, run callback, set next timeout, and requeue idle activity
    private async popAndProcessIdleActivityQueue() {
        this.clearGlobalTimeout();

        if (this.idleActivityQueue.length <= 0) {
            throw new Error(`There are no idle activities in the queue`);
        }

        const activity = this.idleActivityQueue.shift();
        await activity!.activityCompleteCallback().catch(err => {
            logger.error(`Failed to run activity complete callback: ${err}`);
        });

        this.setNextTimeout();

        activity!.nextTriggerTimestamp = activity!.durationS * 1000 + Date.now();
        this.queueIdleActivityElement(activity!);
    }

    private async clearGlobalTimeout() {
        if (this.globalTimeout !== null) {
            clearTimeout(this.globalTimeout);
            this.globalTimeout = null; // Reset the reference
        }
    }

    // Start next timeout for index 0 of the queue
    private async setNextTimeout() {
        if (this.idleActivityQueue.length > 0) {
            this.globalTimeout = setTimeout(async () => {
                await this.popAndProcessIdleActivityQueue();
            }, Math.max(0, this.idleActivityQueue[0].nextTriggerTimestamp - Date.now()));
        }
    }

    private getPrimaryKeysFromIdleActivity(
        activity: IdleActivityQueueElement
    ): { primaryKey0: number; primaryKey1: number | undefined } {
        let primaryKey0: number | undefined = undefined;
        let primaryKey1: number | undefined = undefined;

        switch (activity.activity) {
            case 'crafting':
                if ('equipmentId' in activity) {
                    primaryKey0 = activity.equipmentId;
                }
                break;

            case 'farming':
                if ('itemId' in activity) {
                    primaryKey0 = activity.itemId;
                }
                break;

            case 'breeding':
                if ('sireId' in activity && 'dameId' in activity) {
                    primaryKey0 = activity.sireId;
                    primaryKey1 = activity.dameId;
                }
                break;

            case 'combat':
                throw new Error('Not supported yet.');

            default:
                throw new Error(`Unrecognized activity type: ${activity.activity}`);
        }

        if (!primaryKey0) throw new Error(`Primary key 1 not found for ${activity.activity} idle activity.`)

        return { primaryKey0, primaryKey1 };
    }

}
