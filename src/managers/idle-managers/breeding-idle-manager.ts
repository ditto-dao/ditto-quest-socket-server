import { SocketManager } from "../../socket/socket-manager";
import { breedSlimes, fetchSlimeObjectWithTraits, SlimeWithTraits } from "../../sql-services/slime";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { getBreedingTimeSByGeneration } from "../../utils/helpers";
import { logger } from "../../utils/logger";
import { IdleActivityQueueElement, IdleManager, ProgressUpdate } from "./idle-manager";

export class IdleBreedingManager {

    constructor() { }

    static async startBreeding(socketManager: SocketManager, idleManager: IdleManager, userId: number, sireId: number, dameId: number, startTimestamp: number) {
        const now = Date.now();

        const sire: SlimeWithTraits = await fetchSlimeObjectWithTraits(sireId);
        const dame: SlimeWithTraits = await fetchSlimeObjectWithTraits(dameId);
        const breedingDurationS = getBreedingTimeSByGeneration(sire.generation) + getBreedingTimeSByGeneration(dame.generation);

        if (!sire || !dame) throw new Error("One or both of the specified slimes do not exist.");
        if (sire.ownerId !== dame.ownerId) throw new Error("Both slimes must have the same owner.");
        if (sire.ownerId !== userId.toString()) throw new Error("User does not own slimes.");

        const idleBreedingActivity: IdleActivityQueueElement = {
            userId: userId,
            activity: 'breeding',
            sireId: sire.id,
            dameId: dame.id,
            name: '',
            startTimestamp: startTimestamp,
            durationS: breedingDurationS,
            nextTriggerTimestamp: startTimestamp + breedingDurationS * 1000,
            activityCompleteCallback: async () => await IdleBreedingManager.breedingCompleteCallback(socketManager, userId, sire.id, dame.id, breedingDurationS),
            activityStopCallback: async () => await IdleBreedingManager.breedingStopCallback(socketManager, userId, sire.id, dame.id)
        }

        // Emit breeding-start before queueing activity
        socketManager.emitEvent(userId, 'breeding-start', {
            userId: userId,
            payload: {
                sireId: sireId,
                dameId: dameId,
                startTimestamp: now,
                durationS: breedingDurationS
            }
        });

        idleManager.appendIdleActivityByUser(userId, idleBreedingActivity);
        idleManager.queueIdleActivityElement(idleBreedingActivity);

        logger.info(`Started idle breeding for user ${userId} for sireId: ${sireId} and dameId: ${dameId}.`);
    }

    static stopBreeding(idleManager: IdleManager, userId: number, sireId: number, dameId: number) {
        idleManager.removeIdleActivityByUser(userId, 'breeding', sireId, dameId);
        idleManager.removeIdleActivityElementFromQueue(userId, 'breeding', sireId, dameId);
    }

    static async handleLoadedBreedingActivity(
        socketManager: SocketManager,
        idleManager: IdleManager,
        breeding: IdleActivityQueueElement,
        userId: number
    ): Promise<ProgressUpdate> {
        if (breeding.activity !== "breeding") {
            throw new Error("Invalid activity type. Expected breeding activity.");
        }

        if (!breeding.sireId || !breeding.dameId) {
            throw new Error("Two slimes required for breeding.");
        }

        if (!breeding.logoutTimestamp) {
            throw new Error("Logout timestamp not found in loaded breeding activity.");
        }

        logger.info(`Breeding activity loaded: ${JSON.stringify(breeding, null, 2)}`);

        const now = Date.now();
        const maxProgressEndTimestamp = breeding.logoutTimestamp + MAX_OFFLINE_IDLE_PROGRESS_S * 1000;
        const progressEndTimestamp = Math.min(maxProgressEndTimestamp, now);

        let timestamp = breeding.startTimestamp;
        let repetitions = 0;
        let startCurrentRepetition = true;

        // Fast-forward to last rep before logoutTimestamp
        while (timestamp + breeding.durationS * 1000 < breeding.logoutTimestamp) {
            timestamp += breeding.durationS * 1000; // Add duration to timestamp
        }

        // Process breeeding repetitions after logoutTimestamp up to now
        while (timestamp + breeding.durationS * 1000 <= progressEndTimestamp) {
            timestamp += breeding.durationS * 1000; // Add duration to timestamp

            if (timestamp <= now) {
                repetitions++
            }
        }

        // At this point, `timestamp` is the start of the next repetition
        let currentRepetitionStart = timestamp;

        // Handle partway-through repetition at progress end
        if (timestamp < progressEndTimestamp) {
            const elapsedWithinCurrentRepetition = progressEndTimestamp - timestamp;
            currentRepetitionStart = progressEndTimestamp - elapsedWithinCurrentRepetition;
        }

        logger.info(`Breeding rpetitions completed after logout: ${repetitions}`);
        logger.info(`Breeding repetition start timestamp: ${currentRepetitionStart}`);

        // Start current repetition
        if (startCurrentRepetition) {
            IdleBreedingManager.startBreeding(socketManager, idleManager, userId, breeding.sireId, breeding.dameId, currentRepetitionStart);
        }

        const mintedSlimeIds = [];
        if (repetitions > 0) {
            // Logic for completed repetitions after logout
            for (let i = 0; i < repetitions; i++) {
                mintedSlimeIds.push((await breedSlimes(breeding.sireId, breeding.dameId)).id);
            }
        }

        return {
            type: 'breeding',
            update: {
                slimes: mintedSlimeIds.map(slimeId => ({
                    slimeId: slimeId
                }))
            },
        };
    }

    static async breedingCompleteCallback(
        socketManager: SocketManager,
        userId: number,
        sireId: number,
        dameId: number,
        breedingDurationS: number
    ): Promise<void> {
        try {
            const slime = await breedSlimes(sireId, dameId);

            socketManager.emitEvent(userId, 'update-slime-inventory', {
                userId: userId,
                payload: slime,
            });

            // Emit breeding-start before queueing activity
            socketManager.emitEvent(userId, 'breeding-start', {
                userId: userId,
                payload: {
                    sireId: sireId,
                    dameId: dameId,
                    startTimestamp: Date.now(),
                    durationS: breedingDurationS
                }
            });
        } catch (error) {
            logger.error(`Error during breeding complete callback for user ${userId}: ${error}`);
        }
    }

    static async breedingStopCallback(
        socketManager: SocketManager,
        userId: number,
        sireId: number,
        dameId: number,
    ): Promise<void> {
        try {
            socketManager.emitEvent(userId, 'breeding-stop', {
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
