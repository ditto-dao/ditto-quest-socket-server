import { SocketManager } from "../../socket/socket-manager";
import { breedSlimes, getEquippedSlimeId, SlimeWithTraits } from "../../sql-services/slime";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { getBreedingTimesByGeneration } from "../../utils/helpers";
import { logger } from "../../utils/logger";
import { IdleManager } from "./idle-manager";
import { BreedingUpdate, IdleActivityIntervalElement, IdleBreedingIntervalElement, TimerHandle } from "./idle-manager-types";

export class IdleBreedingManager {

    constructor() { }

    static async startBreeding(
        socketManager: SocketManager,
        idleManager: IdleManager,
        userId: string,
        sire: SlimeWithTraits,
        dame: SlimeWithTraits,
        startTimestamp: number
    ) {
        let timerHandle: TimerHandle | undefined;

        try {
            // Remove existing activities for the same slimes
            await idleManager.removeBreedingActivitiesBySlimeId(userId, sire.id);
            await idleManager.removeBreedingActivitiesBySlimeId(userId, dame.id);

            const equippedSlimeId = await getEquippedSlimeId(userId);
            const breedingDurationS =
                getBreedingTimesByGeneration(sire.generation) +
                getBreedingTimesByGeneration(dame.generation);

            // Validation
            if (!sire || !dame) throw new Error("One or both slimes not found.");
            if (sire.ownerId !== dame.ownerId) throw new Error("Slimes must have same owner.");
            if (sire.ownerId !== userId.toString()) throw new Error("User does not own slimes.");
            if (
                sire.id === equippedSlimeId ||
                dame.id === equippedSlimeId
            ) throw new Error("Cannot breed equipped slime.");

            // Define callbacks
            const completeCallback = async () => {
                try {
                    await IdleBreedingManager.breedingCompleteCallback(socketManager, idleManager, userId, sire, dame);
                } catch (err) {
                    logger.error(`Breeding callback failed for user ${userId}, sire ${sire.id}, dame ${dame.id}: ${err}`);
                    await idleManager.removeBreedingActivity(userId, sire.id, dame.id);
                    IdleManager.clearCustomInterval(timerHandle!);
                }
            };

            const stopCallback = async () => {
                await IdleBreedingManager.breedingStopCallback(socketManager, userId, sire.id, dame.id);
            };

            // Append first without interval
            const activity: Omit<IdleBreedingIntervalElement, "activityInterval"> = {
                userId,
                activity: 'breeding',
                sire,
                dame,
                startTimestamp,
                durationS: breedingDurationS,
                activityCompleteCallback: completeCallback,
                activityStopCallback: stopCallback
            };

            await idleManager.appendIdleActivityByUser(userId, activity as IdleActivityIntervalElement);

            // Now start interval and patch
            timerHandle = IdleManager.startCustomInterval(
                (startTimestamp + breedingDurationS * 1000) - Date.now(),
                breedingDurationS * 1000,
                completeCallback
            );

            idleManager.patchIntervalActivity(
                userId,
                'breeding',
                (el) => el.activity === 'breeding' && el.sire.id === sire.id && el.dame.id === dame.id,
                timerHandle
            );

            logger.info(`Started idle breeding for user ${userId} with sire ${sire.id} and dame ${dame.id}.`);
        } catch (error) {
            logger.error(`Error starting breeding for user ${userId}: ${error}`);

            if (timerHandle) IdleManager.clearCustomInterval(timerHandle);
            await idleManager.removeBreedingActivity(userId, sire.id, dame.id);

            socketManager.emitEvent(userId, 'breeding-stop', {
                userId,
                payload: {
                    sireId: sire.id,
                    dameId: dame.id,
                }
            });
        }
    }

    static stopBreeding(idleManager: IdleManager, userId: string, sireId: number, dameId: number) {
        idleManager.removeBreedingActivity(userId, sireId, dameId);
    }

    static async handleLoadedBreedingActivity(
        socketManager: SocketManager,
        idleManager: IdleManager,
        breeding: IdleBreedingIntervalElement,
        userId: string
    ): Promise<BreedingUpdate | undefined> {
        if (breeding.activity !== "breeding") {
            throw new Error("Invalid activity type. Expected breeding activity.");
        }

        if (!breeding.sire.id || !breeding.dame.id) {
            throw new Error("Two slimes required for breeding.");
        }

        if (!breeding.logoutTimestamp) {
            throw new Error("Logout timestamp not found in loaded breeding activity.");
        }

        logger.info(`Breeding activity loaded: ${JSON.stringify(breeding, null, 2)}`);

        const breedingDurationS = getBreedingTimesByGeneration(breeding.sire.generation) + getBreedingTimesByGeneration(breeding.dame.generation);

        const now = Date.now();
        const maxProgressEndTimestamp = breeding.logoutTimestamp + MAX_OFFLINE_IDLE_PROGRESS_S * 1000;
        const progressEndTimestamp = Math.min(maxProgressEndTimestamp, now);

        let timestamp = breeding.startTimestamp;
        let repetitions = 0;

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

        logger.info(`Breeding repetition completed after logout: ${repetitions}`);
        logger.info(`Breeding repetition start timestamp: ${currentRepetitionStart}`);

        // Start current repetition
        IdleBreedingManager.startBreeding(socketManager, idleManager, userId, breeding.sire, breeding.dame, currentRepetitionStart);

        // Emit breeding-start before queueing activity
        socketManager.emitEvent(userId, 'breeding-start', {
            userId: userId,
            payload: {
                sireId: breeding.sire.id,
                dameId: breeding.dame.id,
                startTimestamp: currentRepetitionStart,
                durationS: breedingDurationS
            }
        });

        const mintedSlimes = [];
        if (repetitions > 0) {
            // Logic for completed repetitions after logout
            for (let i = 0; i < repetitions; i++) {
                mintedSlimes.push((await breedSlimes(breeding.sire.id, breeding.dame.id)));
            }

            return {
                type: 'breeding',
                update: {
                    slimes: mintedSlimes
                },
            };
        }
    }

    static async breedingCompleteCallback(
        socketManager: SocketManager,
        idleManager: IdleManager,
        userId: string,
        sire: SlimeWithTraits,
        dame: SlimeWithTraits,
    ): Promise<void> {
        try {
            const slime = await breedSlimes(sire.id, dame.id);

            socketManager.emitEvent(userId, 'update-slime-inventory', {
                userId: userId,
                payload: slime,
            });

        } catch (error) {
            logger.error(`Error during breeding complete callback for user ${userId}: ${error}`);

            await idleManager.removeBreedingActivity(userId, sire.id, dame.id);
            await idleManager.removeBreedingActivitiesBySlimeId(userId, sire.id);
            await idleManager.removeBreedingActivitiesBySlimeId(userId, dame.id);

            socketManager.emitEvent(userId, 'breeding-stop', {
                userId: userId,
                payload: {
                    sireId: sire.id,
                    dameId: dame.id,
                }
            });
            throw error;
        }
    }

    static async breedingStopCallback(
        socketManager: SocketManager,
        userId: string,
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
