import { breedSlimesMemory, getEquippedSlimeWithTraitsMemory } from "../../operations/slime-operations";
import { logBreedingActivity } from "../../operations/user-activity-log-operations";
import { canUserMintSlimeMemory } from "../../operations/user-operations";
import { SocketManager } from "../../socket/socket-manager";
import { emitMissionUpdate, updateBreedMission } from "../../sql-services/missions";
import { SlimeWithTraits } from "../../sql-services/slime";
import { MAX_OFFLINE_IDLE_PROGRESS_S } from "../../utils/config";
import { getBreedingTimesByGeneration, getHighestDominantTraitRarity } from "../../utils/helpers";
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
            await idleManager.removeBreedingActivity(userId);

            const equippedSlimeId = (await getEquippedSlimeWithTraitsMemory(userId))?.id;
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
            if (!(await canUserMintSlimeMemory(sire.ownerId))) {
                throw new Error(`Slime inventory full. Please clear space or upgrade your slots`);
            }

            // Define callbacks
            const completeCallback = async () => {
                try {
                    await IdleBreedingManager.breedingCompleteCallback(socketManager, idleManager, userId, sire, dame);
                } catch (err) {
                    logger.error(`Breeding callback failed for user ${userId}, sire ${sire.id}, dame ${dame.id}: ${err}`);
                    await idleManager.removeBreedingActivity(userId);
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
            timerHandle = await idleManager.startCustomInterval(
                userId,
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
            await idleManager.removeBreedingActivity(userId);

            socketManager.emitEvent(userId, 'breeding-stop', {
                userId,
                payload: {
                    sireId: sire.id,
                    dameId: dame.id,
                }
            });
        }
    }

    static stopBreeding(idleManager: IdleManager, userId: string) {
        idleManager.removeBreedingActivity(userId);
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

        // Process breeding repetitions after logoutTimestamp up to now
        while (timestamp + breeding.durationS * 1000 <= progressEndTimestamp) {
            // Check inventory space before allowing completion
            if (!(await canUserMintSlimeMemory(userId))) {
                logger.info(`User ${userId} slime inventory full, stopping breeding progression at ${repetitions} repetitions`);
                break;
            }

            //Increment timestamp first, then check completion
            timestamp += breeding.durationS * 1000;

            // Only count as completed if the breeding cycle actually finished within our time window
            if (timestamp <= progressEndTimestamp) {
                repetitions++;
            } else {
                // Breeding cycle would extend beyond our progress window, don't count it
                timestamp -= breeding.durationS * 1000; // Revert timestamp
                break;
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

        // Start current repetition (only if there's space)
        if (await canUserMintSlimeMemory(userId)) {
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
        } else {
            logger.info(`User ${userId} slime inventory full, not starting new breeding cycle`);
        }

        const mintedSlimes = [];
        if (repetitions > 0) {
            // Logic for completed repetitions after logout
            for (let i = 0; i < repetitions; i++) {
                try {
                    // Double-check space before each mint (in case something changed)
                    if (!(await canUserMintSlimeMemory(userId))) {
                        logger.warn(`User ${userId} ran out of slime inventory space during breeding completion at slime ${i + 1}/${repetitions}`);
                        break;
                    }

                    const slime = await breedSlimesMemory(userId, breeding.sire.id, breeding.dame.id);
                    mintedSlimes.push(slime);

                    await logBreedingActivity({
                        userId: userId,
                        dameId: breeding.dame.id,
                        dameGeneration: breeding.dame.generation,
                        dameRarity: getHighestDominantTraitRarity(breeding.dame),
                        sireId: breeding.sire.id,
                        sireGeneration: breeding.sire.generation,
                        sireRarity: getHighestDominantTraitRarity(breeding.sire),
                        childId: slime.id,
                        childGeneration: slime.generation,
                        childRarity: getHighestDominantTraitRarity(slime),
                    });

                    await updateBreedMission(userId, getHighestDominantTraitRarity(slime), 1);
                    await emitMissionUpdate(socketManager.getSocketByUserId(userId), userId);
                } catch (err) {
                    logger.error(`Failed to breed slime ${i + 1}/${repetitions} in loaded breeding activity: ${err}`);
                    // Continue with other slimes instead of breaking completely
                }
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
            if (!(await canUserMintSlimeMemory(userId))) {
                socketManager.emitEvent(userId, 'error', {
                    userId: userId,
                    msg: 'Slime inventory full. Please clear space or upgrade your slots'
                })
                throw new Error(`Insufficient slime inventory space to complete breeding`);
            }

            const slime = await breedSlimesMemory(userId, sire.id, dame.id);

            socketManager.emitEvent(userId, 'update-slime-inventory', {
                userId: userId,
                payload: slime,
            });

            await logBreedingActivity({
                userId: userId,
                dameId: dame.id,
                dameGeneration: dame.generation,
                dameRarity: getHighestDominantTraitRarity(dame),
                sireId: sire.id,
                sireGeneration: sire.generation,
                sireRarity: getHighestDominantTraitRarity(sire),
                childId: slime.id,
                childGeneration: slime.generation,
                childRarity: getHighestDominantTraitRarity(slime),
            });
            await updateBreedMission(userId, getHighestDominantTraitRarity(slime), 1);
            await emitMissionUpdate(socketManager.getSocketByUserId(userId), userId);

        } catch (error) {
            logger.error(`Error during breeding complete callback for user ${userId}: ${error}`);

            await idleManager.removeBreedingActivity(userId);

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
