/* import { CraftingRecipeRes } from '../sql-services/crafting-service';
import { mintEquipmentToUser } from '../sql-services/equipment-inventory-service';
import { deleteItemsFromUserInventory, doesUserOwnItems } from '../sql-services/item-inventory-service';
import { logger } from '../utils/logger';
import { SocketManager } from '../socket/socket-manager';
import { RedisClientType, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { MAX_CONCURRENT_IDLE_ACTIVITIES, MAX_OFFLINE_IDLE_PROGRESS_S } from '../utils/config';
import { deleteAllIdleActivities, getIdleActivities, storeIdleActivities } from '../redis/idle-activity-redis';
import { breedSlimes, fetchSlimeObjectWithTraits, SlimeWithTraits } from '../sql-services/slime';
import { getBreedingTimeSByGeneration } from '../utils/helpers';

export type IdleActivityLabel = 'crafting' | 'breeding' | 'farming' | 'combat';

export type IdleActivity = IdleCraftingActivity | IdleBreedingActivity;

export interface IdleCraftingActivity {
    activity: IdleActivityLabel;
    startTimestamp: number;
    durationS: number;
    equipmentId: number;
    equipmentName: string;
    requiredItems: {
        itemId: number;
        itemName: string;
        quantity: number;
    }[];
    logoutTimestamp?: number;
}

export interface IdleBreedingActivity {
    activity: IdleActivityLabel;
    startTimestamp: number;
    durationS: number;
    sireId: number;
    dameId: number;
    logoutTimestamp?: number;
}

export interface IdleActivityUpdate {
    change: '+' | '-',
}

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
        slime?: {
            slimeId: number;
        };
    };
}

interface IdleActivityQueueElement {
    userId: number;
    activity: IdleActivityLabel;
    startTimestamp: number;
    durationS: number;
    nextTriggerTimestamp: number;
    activityCompleteCallback: () => Promise<void>;
    activityStopCallback: () => Promise<void>;
}

export class IdleManager {
    private socketManager: SocketManager;
    private redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>;

    private idleActivitiesByUser: Record<number, IdleActivity[]> = {};

    private globalTimeout: NodeJS.Timeout | null = null;
    private idleActivityQueue: IdleActivityQueueElement[] = [];

    constructor(
        socketManager: SocketManager,
        redisClient: RedisClientType<RedisModules, RedisFunctions, RedisScripts>
    ) {
        this.socketManager = socketManager;
        this.redisClient = redisClient;
    }

    async startIdleCraftingForUser(userId: number, recipe: CraftingRecipeRes) {
        const now = Date.now();

        const idleCraftingActivity: IdleCraftingActivity = {
            activity: 'crafting',
            startTimestamp: now,
            durationS: recipe.durationS,
            equipmentId: recipe.equipmentId,
            equipmentName: recipe.equipmentName,
            requiredItems: recipe.requiredItems
        }

        await this.startIdleCraftingFromIdleCraftingActivity(userId, idleCraftingActivity);
    }

    stopCraftingForUser(userId: number, equipmentId: number) {
        const userActivities = this.idleActivitiesByUser[userId] || [];

        // Find the index of the element in the list
        const craftingActivityIndex = userActivities.findIndex(
            (element) =>
                element.activity === 'crafting' &&
                'equipmentId' in element && // Ensure it's an IdleCraftingActivity
                element.equipmentId === equipmentId
        );

        if (craftingActivityIndex !== -1) {
            // Remove the element from the list
            const removedElement = userActivities.splice(craftingActivityIndex, 1)[0];

            if (removedElement) this.removeElementFromIdleActivityQueue(userId, removedElement!.activity, removedElement!.startTimestamp);

            // Update the user's activity list
            this.idleActivitiesByUser[userId] = userActivities;

            logger.info(`Removed crafting idle activity for user ${userId}`);
        } else {
            logger.error(
                `Idle crafting activity not found in activity queue. userId: ${userId}, equipmentId: ${equipmentId}`
            );
        }
    }

    async startIdleBreedingForUser(userId: number, sireId: number, dameId: number) {
        try {
            const now = Date.now();

            const sire: SlimeWithTraits = await fetchSlimeObjectWithTraits(sireId);
            const dame: SlimeWithTraits = await fetchSlimeObjectWithTraits(dameId);

            if (!sire || !dame) throw new Error("One or both of the specified slimes do not exist.");
            if (sire.ownerId !== dame.ownerId) throw new Error("Both slimes must have the same owner.");
            if (sire.ownerId !== userId) throw new Error("User does not own slimes.");

            const idleBreedingActivity: IdleBreedingActivity = {
                activity: 'breeding',
                startTimestamp: now,
                durationS: getBreedingTimeSByGeneration(sire.generation) + getBreedingTimeSByGeneration(dame.generation),
                sireId: sireId,
                dameId: dameId
            }

            // Emit breeding-start before queueing activity
            this.socketManager.emitEvent(userId, 'breeding-start', {
                userId: userId,
                payload: {
                    sireId: sireId,
                    dameId: dameId,
                    startTimestamp: now,
                    durationS: getBreedingTimeSByGeneration(sire.generation) + getBreedingTimeSByGeneration(dame.generation)
                }
            });

            this.appendIdleActivityByUser(idleBreedingActivity, userId);
            this.queueIdleActivityElement({
                userId: userId,
                activity: 'breeding',
                startTimestamp: idleBreedingActivity.startTimestamp,
                durationS: idleBreedingActivity.durationS,
                nextTriggerTimestamp: idleBreedingActivity.startTimestamp + idleBreedingActivity.durationS * 1000,
                activityCompleteCallback: async () => await this.breedingCompleteCallback(userId, sireId, dameId, idleBreedingActivity.startTimestamp),
                activityStopCallback: async () => this.breedingStopCallback(userId, sireId, dameId),
            })

            logger.info(`Started idle breeding for user ${userId} for sireId: ${sireId} and dameId: ${dameId}.`);
        } catch (err) {
            logger.error(`Failed to start idle breeding: ${err}`);
        }
    }

    stopIdleBreedingForUser(userId: number, sireId: number, dameId: number) {
        const userActivities = this.idleActivitiesByUser[userId] || [];

        // Find the index of the element in the list
        const breedingActivityIndex = userActivities.findIndex(
            (element) =>
                element.activity === 'breeding' &&
                'sireId' in element && 
                element.sireId === sireId &&
                'dameId' in element && 
                element.dameId === dameId
        );

        if (breedingActivityIndex !== -1) {
            // Remove the element from the list
            const removedElement = userActivities.splice(breedingActivityIndex, 1)[0];

            if (removedElement) this.removeElementFromIdleActivityQueue(userId, removedElement!.activity, removedElement!.startTimestamp);

            // Update the user's activity list
            this.idleActivitiesByUser[userId] = userActivities;

            logger.info(`Removed breeding idle activity for user ${userId}`);
        } else {
            logger.error(
                `Idle breeding activity not found in activity queue. userId: ${userId}, sireId: ${sireId}, dameId: ${dameId}`
            );
        }
    }

    async saveIdleActivityOnLogout(
        userId: number
    ) {
        try {
            const list = this.idleActivitiesByUser[userId];

            // Store each activity in Redis
            if (list.length > 0) await storeIdleActivities(this.redisClient, userId, list);

            logger.info(`Idle activities saved for user ${userId} on log out: ${userId}: ${JSON.stringify(this.idleActivitiesByUser[userId], null, 2)}`);

            const now = Date.now();

            for (let i = 0; i < list.length; i++) {
                list[i].logoutTimestamp = now;

                // Remove from queue
                this.removeElementFromIdleActivityQueue(userId, list[i].activity, list[i].startTimestamp);
            }

        } catch (error) {
            logger.error(`Error saving idle activities for user ${userId}: ${error}`);
            throw error;
        }
    }

    async loadIdleActivityOnLogin(userId: number) {
        try {
            const list = await getIdleActivities(this.redisClient, userId);
            await deleteAllIdleActivities(this.redisClient, userId);

            if (list.length <= 0) return;

            const progressUpdates: ProgressUpdate[] = [];

            list.forEach(async (activity) => {
                if (activity.activity === 'crafting') {
                    progressUpdates.push(await this.handleLoadedCraftingActivity(activity, userId));
                } else if (activity.activity === 'breeding') {
                    progressUpdates.push(await this.handleLoadedCraftingActivity(activity, userId));
                }
            });

            // Emit progress update
            this.socketManager.emitEvent(userId, 'idle-progress-update', {
                userId: userId,
                payload: progressUpdates
            });

            logger.info(`Emitted idle-progress-update: ${JSON.stringify(progressUpdates, null, 2)}`);

        } catch (error) {
            logger.error(`Error loading idle activities for user ${userId}: ${error}`);
            throw error;
        }
    }

    async handleLoadedCraftingActivity(crafting: IdleActivity, userId: number): Promise<ProgressUpdate> {
        if (crafting.activity !== "crafting") {
            throw new Error("Invalid activity type. Expected crafting activity.");
        }

        const craftingActivity = crafting as IdleCraftingActivity;

        logger.info(`crafting activity: ${JSON.stringify(craftingActivity, null, 2)}`);

        const now = Date.now();
        const maxProgressEndTimestamp = craftingActivity.logoutTimestamp! + MAX_OFFLINE_IDLE_PROGRESS_S * 1000;
        const progressEndTimestamp = Math.min(maxProgressEndTimestamp, now);

        let timestamp = craftingActivity.startTimestamp;
        let repetitions = 0;
        let startCurrentRepetition = true;

        // Ensure logoutTimestamp is defined and start processing after it
        if (craftingActivity.logoutTimestamp) {
            // Fast-forward to last rep before logoutTimestamp
            while (timestamp + craftingActivity.durationS * 1000 < craftingActivity.logoutTimestamp) {
                timestamp += craftingActivity.durationS * 1000; // Add duration to timestamp
            }
        }

        // Process crafting repetitions after logoutTimestamp up to now
        while (timestamp + craftingActivity.durationS * 1000 <= progressEndTimestamp) {
            timestamp += craftingActivity.durationS * 1000; // Add duration to timestamp

            if (timestamp <= now) {
                if ((await doesUserOwnItems(userId, craftingActivity.requiredItems.map(item => item.itemId), craftingActivity.requiredItems.map(item => item.quantity * repetitions + 1)))) {
                    repetitions++
                } else {
                    startCurrentRepetition = false;
                }
            }
        }

        // At this point, `timestamp` is the start of the next repetition
        let currentRepetitionStart = timestamp;

        // Handle partway-through repetition at progress end
        if (timestamp < progressEndTimestamp) {
            const elapsedWithinCurrentRepetition = progressEndTimestamp - timestamp;
            currentRepetitionStart = progressEndTimestamp - elapsedWithinCurrentRepetition;
        }

        logger.info(`Crafting rpetitions completed after logout: ${repetitions}`);
        logger.info(`Current repetition start timestamp: ${currentRepetitionStart}`);

        if (repetitions > 0) {
            // Logic for completed repetitions after logout
            await deleteItemsFromUserInventory(userId, craftingActivity.requiredItems.map(item => item.itemId), craftingActivity.requiredItems.map(item => item.quantity * repetitions));

            for (let i = 0; i < repetitions; i++) {
                await mintEquipmentToUser(userId, craftingActivity.equipmentId);
            }
        }

        // Start current repetition
        if (startCurrentRepetition) {
            this.startIdleCraftingFromIdleCraftingActivity(userId, {
                activity: craftingActivity.activity,
                startTimestamp: currentRepetitionStart,
                durationS: craftingActivity.durationS,
                equipmentId: craftingActivity.equipmentId,
                equipmentName: craftingActivity.equipmentName,
                requiredItems: craftingActivity.requiredItems
            })
        }

        return {
            type: 'crafting',
            update: {
                items: craftingActivity.requiredItems.map(item => ({
                    itemId: item.itemId,
                    itemName: item.itemName,
                    quantity: item.quantity * repetitions * -1,
                })),
                equipment: [{
                    equipmentId: craftingActivity.equipmentId,
                    equipmentName: craftingActivity.equipmentName,
                    quantity: repetitions
                }]
            },
        };
    }

    async handleLoadedBreedingActivity(breeding: IdleActivity, userId: number): Promise<ProgressUpdate> {
        if (breeding.activity !== "breeding") {
            throw new Error("Invalid activity type. Expected breeding activity.");
        }

        const breedingActivity = breeding as IdleBreedingActivity;

        logger.info(`breeding activity: ${JSON.stringify(breedingActivity, null, 2)}`);


        return {
            type: 'breeding',
            update: {
                slime: {
                    slimeId: -1
                }
            },
        };
    }

    private queueIdleActivityElement(element: IdleActivityQueueElement) {
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

            logger.info(`idle activity queue: ${JSON.stringify(this.idleActivityQueue, null, 2)}`);
        }
    }

    private removeElementFromIdleActivityQueue(userId: number, activity: IdleActivityLabel, startTimestamp: number) {
        const pseudoElement: IdleActivityQueueElement = {
            userId: userId,
            activity: activity,
            startTimestamp: startTimestamp,
            durationS: 0,
            nextTriggerTimestamp: 0,
            activityCompleteCallback: async () => { },
            activityStopCallback: async () => { },
        }

        const index = this.idleActivityQueue.findIndex((activity) => this.areQueueElementsEqual(activity, pseudoElement));
        if (index !== -1) {
            // Remove the element from the list
            const removedElement = this.idleActivityQueue.splice(index, 1)[0];

            // Call activity stop callback
            removedElement!.activityStopCallback();

            if (this.idleActivityQueue.length === 0) this.clearGlobalTimeout();

            logger.info(`Removed idle activity for user ${pseudoElement.userId} from activity queue`);

            // Find the index of the element in the list by user
            const toRemoveIndex = this.idleActivitiesByUser[userId].findIndex(
                (element) =>
                    element.activity === activity &&
                    element.startTimestamp === startTimestamp
            );
            this.idleActivitiesByUser[userId].splice(toRemoveIndex, 1);

        } else {
            logger.error(
                `Idle activity not found in activity queue. userId: ${userId}, activity: ${activity}, startTimestamp: ${startTimestamp}`
            );
        }

        logger.info(`idle activity queue: ${JSON.stringify(this.idleActivityQueue, null, 2)}`);
    }

    private async popAndProcessIdleActivityQueue() {
        this.clearGlobalTimeout();

        if (this.idleActivityQueue.length <= 0) {
            throw new Error(`There are no idle activities in the queue`);
        }

        const activity = this.idleActivityQueue.shift();
        await activity!.activityCompleteCallback();

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

    private async setNextTimeout() {
        if (this.idleActivityQueue.length > 0) {
            this.globalTimeout = setTimeout(async () => {
                await this.popAndProcessIdleActivityQueue();
            }, Math.max(0, this.idleActivityQueue[0].nextTriggerTimestamp - Date.now()));
        }
    }

    private appendIdleActivityByUser(element: IdleActivity, userId: number) {
        const list = (this.idleActivitiesByUser[userId]) ? this.idleActivitiesByUser[userId] : [];
        if (list.length >= MAX_CONCURRENT_IDLE_ACTIVITIES) {
            const removedElement = list.shift();
            if (removedElement) this.removeElementFromIdleActivityQueue(userId, removedElement!.activity, removedElement!.startTimestamp);
        }
        list.push(element);

        this.idleActivitiesByUser[userId] = list;
    }

    private areQueueElementsEqual(element0: IdleActivityQueueElement, element1: IdleActivityQueueElement): boolean {
        return (
            element0.userId === element1.userId &&
            element0.activity === element1.activity &&
            element0.startTimestamp === element1.startTimestamp
        );
    }

    private async craftingCompleteCallback(
        userId: number,
        startTimestamp: number,
        equipmentId: number,
        durationS: number,
        requiredItems: {
            itemId: number;
            itemName: string;
            quantity: number;
        }[]
    ): Promise<void> {
        try {
            const updatedItemsInv = await deleteItemsFromUserInventory(userId, requiredItems.map(item => item.itemId), requiredItems.map(item => item.quantity));
            const updatedEquipmentInv = await mintEquipmentToUser(userId, equipmentId);

            this.socketManager.emitEvent(userId, 'update-item-inventory', {
                userId: userId,
                payload: updatedItemsInv,
            });

            this.socketManager.emitEvent(userId, 'update-equipment-inventory', {
                userId: userId,
                payload: [{
                    equipmentInventory: updatedEquipmentInv,
                    remove: false,
                }]
            });

            // Execute the crafting logic directly within the interval
            if (!(await doesUserOwnItems(userId, requiredItems.map(item => item.itemId), requiredItems.map(item => item.quantity)))) {
                throw new Error(`User does not have all the required items`);
            }

            // Emit crafting-start for the next cycle
            this.socketManager.emitEvent(userId, 'crafting-start', {
                userId: userId,
                payload: {
                    equipmentId: equipmentId,
                    startTimestamp: Date.now(),
                    durationS: durationS
                }
            });

        } catch (error) {
            logger.error(`Error during crafting for user ${userId}: ${error}`);
            this.removeElementFromIdleActivityQueue(userId, 'crafting', startTimestamp);
        }
    }

    private async craftingStopCallback(
        userId: number,
        equipmentId: number,
    ): Promise<void> {
        try {
            this.socketManager.emitEvent(userId, 'crafting-stop', {
                userId: userId,
                payload: {
                    equipmentId: equipmentId,
                }
            });
        } catch (err) {
            logger.error(`Error during crafting stop callback for user ${userId}: ${err}`);
        }
    }

    async startIdleCraftingFromIdleCraftingActivity(userId: number, craftingActivity: IdleCraftingActivity) {
        try {
            if (!(await doesUserOwnItems(userId, craftingActivity.requiredItems.map(item => item.itemId), craftingActivity.requiredItems.map(item => item.quantity)))) {
                throw new Error(`User does not have all the required items`);
            }

            // Emit crafting-start before queueing activity
            this.socketManager.emitEvent(userId, 'crafting-start', {
                userId: userId,
                payload: {
                    equipmentId: craftingActivity.equipmentId,
                    startTimestamp: craftingActivity.startTimestamp,
                    durationS: craftingActivity.durationS
                }
            });

            this.appendIdleActivityByUser(craftingActivity, userId);
            this.queueIdleActivityElement({
                userId: userId,
                activity: 'crafting',
                startTimestamp: craftingActivity.startTimestamp,
                durationS: craftingActivity.durationS,
                nextTriggerTimestamp: craftingActivity.startTimestamp + craftingActivity.durationS * 1000,
                activityCompleteCallback: async () => await this.craftingCompleteCallback(userId, craftingActivity.startTimestamp, craftingActivity.equipmentId, craftingActivity.durationS, craftingActivity.requiredItems),
                activityStopCallback: async () => this.craftingStopCallback(userId, craftingActivity.equipmentId),
            })

            logger.info(`Started idle crafting for user ${userId} for equipmentId: ${craftingActivity.equipmentId}.`);
        } catch (err) {
            logger.error(`Failed to start idle crafting from idle crafting activity: ${err}`);
        }
    }

    private async breedingCompleteCallback(
        userId: number,
        sireId: number,
        dameId: number,
        startTimestamp: number,
    ): Promise<void> {
        try {
            const slime = await breedSlimes(sireId, dameId);

            this.socketManager.emitEvent(userId, 'update-slime-inventory', {
                userId: userId,
                payload: slime,
            });
        } catch (error) {
            logger.error(`Error during breeding for user ${userId}: ${error}`);
            this.removeElementFromIdleActivityQueue(userId, 'breeding', startTimestamp);
        }
    }

    private async breedingStopCallback(
        userId: number,
        sireId: number,
        dameId: number,
    ): Promise<void> {
        try {
            this.socketManager.emitEvent(userId, 'breeding-stop', {
                userId: userId,
                payload: {
                    sireId: sireId,
                    dameId: dameId,
                }
            });
        } catch (err) {
            logger.error(`Error during breeding stop callback for user ${userId}: ${err}`);
        }
    }
}
 */