import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { EquipmentType } from "@prisma/client";
import { emitUserAndCombatUpdate } from "../../utils/helpers";
import { IdleCombatManager } from "../../managers/idle-managers/combat/combat-idle-manager";
import { IdleManager } from "../../managers/idle-managers/idle-manager";
import { READ_REFERRAL_CODE, READ_REFERRAL_CODE_RES, READ_REFERRAL_STATS, READ_REFERRAL_STATS_RES, USE_REFERRAL_CODE, USE_REFERRAL_CODE_SUCCESS } from "../events";
import { applyReferralCode, getReferralStats, getReferrerDetails, getUserReferralCode, validateReferralCodeUsage } from "../../sql-services/referrals";
import { Socket as DittoLedgerSocket } from "socket.io-client";
import { getEquipmentOrItemFromInventory } from "../../operations/equipment-inventory-operations";
import { equipEquipmentForUserMemory, getEquippedByEquipmentTypeMemory, getUserData, recalculateAndUpdateUserBaseStatsMemory, unequipEquipmentForUserMemory } from "../../operations/user-operations";
import { EquippedInventory } from "../../sql-services/user-service";
import { SlimeWithTraits } from "../../sql-services/slime";
import { equipSlimeForUserMemory, getEquippedSlimeWithTraitsMemory, getSlimeForUserById, unequipSlimeForUserMemory } from "../../operations/slime-operations";
import { applySkillUpgradesMemory, SkillUpgradeInput } from "../../operations/combat-operations";
import { requireUserMemoryManager } from "../../managers/global-managers/global-managers";
import { globalIdleSocketUserLock } from "../socket-handlers";

interface EquipPayload {
    userId: string;
    inventoryId: number;
}

export async function setupUserSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    idleManager: IdleManager,
    idleCombatManager: IdleCombatManager,
    ledgerSocket: DittoLedgerSocket
): Promise<void> {
    socket.on("equip-equipment", async (data: EquipPayload) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            logger.info(`Received equip-equipment event from user ${data.userId}`);
            try {
                const inventoryEl = await getEquipmentOrItemFromInventory(data.userId, data.inventoryId);
                if (!inventoryEl) throw new Error(`Inventory element not found`);

                const equipmentType = inventoryEl?.equipment?.type;
                const previouslyEquipped = equipmentType
                    ? await getEquippedByEquipmentTypeMemory(data.userId, equipmentType)
                    : null;

                try {
                    // Attempt to equip new item
                    const res = await equipEquipmentForUserMemory(data.userId.toString(), inventoryEl);
                    idleCombatManager.updateUserCombatMidBattle(data.userId, res.combat);
                    emitUserAndCombatUpdate(socket, data.userId, res);
                } catch (err) {
                    logger.warn(`Equip failed, reverting to previous state...`);

                    // Attempt to revert to previously equipped item
                    if (previouslyEquipped) {
                        const revertRes = await equipEquipmentForUserMemory(data.userId.toString(), previouslyEquipped);
                        if (revertRes) emitUserAndCombatUpdate(socket, data.userId, revertRes);
                    } else if (inventoryEl.equipment) {
                        // If nothing was previously equipped, unequip the current type
                        const res = await unequipEquipmentForUserMemory(data.userId, inventoryEl.equipment.type);
                        if (res) emitUserAndCombatUpdate(socket, data.userId, res);
                    }

                    socket.emit("unequip-update", {
                        userId: data.userId,
                        payload: data.inventoryId
                    });

                    throw err;
                }
            } catch (error) {
                logger.error(`Error processing equip-equipment: ${error}`);
                socket.emit('error', {
                    userId: data.userId,
                    msg: 'Failed to equip equipment'
                });
            }
        });
    });

    socket.on("unequip-equipment", async (data: { userId: string; equipmentType: EquipmentType }) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            let currentEquipped: EquippedInventory | null = null;
            try {

                logger.info(`Received unequip-equipment event from user ${data.userId} for type ${data.equipmentType}`);

                // Store the currently equipped item before unequipping
                currentEquipped = await getEquippedByEquipmentTypeMemory(data.userId.toString(), data.equipmentType);

                if (!currentEquipped) {
                    logger.info(`Nothing to unequip for ${data.equipmentType} for user ${data.userId}`);
                    return;
                }

                // Attempt to unequip
                const userDataAfterUnequip = await unequipEquipmentForUserMemory(data.userId.toString(), data.equipmentType);

                if (!userDataAfterUnequip) {
                    throw new Error(`unequipEquipmentForUser returned null unexpectedly`);
                }

                idleCombatManager.updateUserCombatMidBattle(data.userId, userDataAfterUnequip.combat);

                logger.info(`Successfully unequipped ${data.equipmentType} for user ${data.userId}`);
                emitUserAndCombatUpdate(socket, data.userId, userDataAfterUnequip);

            } catch (error) {
                logger.error(`Error processing unequip-equipment for user ${data.userId}: ${error}`);

                // Revert logic: try to re-equip the previously equipped item
                if (currentEquipped) {
                    try {
                        logger.warn(`Reverting equipment for user ${data.userId}...`);
                        const revertRes = await equipEquipmentForUserMemory(data.userId, currentEquipped);
                        if (revertRes) {
                            emitUserAndCombatUpdate(socket, data.userId, revertRes);
                        }

                        socket.emit("equip-update", {
                            userId: data.userId,
                            payload: currentEquipped,
                        });
                    } catch (revertErr) {
                        logger.error(`Failed to revert equipment for user ${data.userId}: ${revertErr}`);
                    }
                }

                // Notify client of failure
                socket.emit("error", {
                    userId: data.userId,
                    msg: `Failed to unequip ${data.equipmentType}`,
                });
            }
        });
    });

    socket.on("equip-slime", async (data: { userId: string; slimeId: number }) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            logger.info(`Received equip-slime event from user ${data.userId} for slime ${data.slimeId}`);

            let previouslyEquippedSlime: SlimeWithTraits | null = null;

            try {
                previouslyEquippedSlime = await getEquippedSlimeWithTraitsMemory(data.userId);
                const nextEquippedSlime = await getSlimeForUserById(data.userId, data.slimeId);

                if (!nextEquippedSlime) throw new Error(`Slime of id ${data.slimeId} does not exist`);

                if (nextEquippedSlime.ownerId !== data.userId) throw new Error(`User ${data.userId} does not own slime ${data.slimeId}`);

                const newEquipped = await equipSlimeForUserMemory(data.userId, nextEquippedSlime);
                idleCombatManager.updateUserCombatMidBattle(data.userId, newEquipped.combat!);

                emitUserAndCombatUpdate(socket, data.userId, newEquipped);

                // After equipping, log the memory state:
                const userMemoryManager = requireUserMemoryManager();
                const user = userMemoryManager.getUser(data.userId)!;
                logger.info(`DEBUG: User ${data.userId} equippedSlimeId in memory: ${user.equippedSlimeId}`);

            } catch (err) {
                logger.warn(`Equip slime failed, reverting...`);

                if (previouslyEquippedSlime) {
                    try {
                        const revertRes = await equipSlimeForUserMemory(data.userId, previouslyEquippedSlime);
                        emitUserAndCombatUpdate(socket, data.userId, revertRes);
                        socket.emit("equip-slime-update", {
                            userId: data.userId,
                            payload: previouslyEquippedSlime
                        });
                    } catch (revertErr) {
                        logger.error(`Failed to revert slime equip for user ${data.userId}: ${revertErr}`);
                    }
                }

                socket.emit("error", {
                    userId: data.userId,
                    msg: "Failed to equip slime"
                });
            }
        });
    });

    socket.on("unequip-slime", async (data: { userId: string }) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            let currentEquipped: SlimeWithTraits | null = null;

            try {
                logger.info(`Received unequip-slime event from user ${data.userId}`);

                currentEquipped = await getEquippedSlimeWithTraitsMemory(data.userId);
                if (!currentEquipped) {
                    logger.info(`Nothing to unequip for user ${data.userId}`);
                    return;
                }

                const unequipped = await unequipSlimeForUserMemory(data.userId);

                idleCombatManager.stopCombat(idleManager, data.userId);

                emitUserAndCombatUpdate(socket, data.userId, unequipped);

            } catch (err) {
                logger.error(`Error during unequip-slime for user ${data.userId}: ${err}`);

                // Revert if something breaks
                if (currentEquipped) {
                    try {
                        const revertRes = await equipSlimeForUserMemory(data.userId, currentEquipped);
                        emitUserAndCombatUpdate(socket, data.userId, revertRes);
                        socket.emit("equip-slime-update", {
                            userId: data.userId,
                            payload: currentEquipped
                        });
                    } catch (revertErr) {
                        logger.error(`Failed to revert slime equip for user ${data.userId}: ${revertErr}`);
                    }
                }

                socket.emit("error", {
                    userId: data.userId,
                    msg: "Failed to unequip slime"
                });
            }
        });
    });

    socket.on("pump-stats", async (data: { userId: string, statsToUpgrade: SkillUpgradeInput }) => {
        await globalIdleSocketUserLock.acquire(data.userId, async () => {
            try {
                logger.info(`Received pump-stats event from user ${data.userId}`);

                await applySkillUpgradesMemory(data.userId, data.statsToUpgrade);
                const updateRes = await recalculateAndUpdateUserBaseStatsMemory(data.userId);

                logger.info(`pump-stats updateRes: ${JSON.stringify(updateRes)}`);

                idleCombatManager.updateUserCombatMidBattle(data.userId, updateRes.combat!);

                emitUserAndCombatUpdate(socket, data.userId, updateRes);
            } catch (err) {
                logger.error(`Error during pump-skill for user ${data.userId}: ${err}`);

                socket.emit("error", {
                    userId: data.userId,
                    msg: "Failed to pump stats",
                });

                // emit prev user stats
                await getUserData(data.userId).then(res => {
                    if (res) emitUserAndCombatUpdate(socket, data.userId, res);
                }).catch(err => {
                    logger.error(`Error emitting prev user stats after failed stat pump: ${err}`);
                });
            } finally {
                socket.emit("pump-stats-complete", {
                    userId: data.userId,
                });
            }
        });
    });


    // REFERRALS
    socket.on(READ_REFERRAL_CODE, async (data: { userId: string }) => {
        try {
            logger.info(`Received READ_REFERRAL_CODE event from user ${data.userId}`);
            const code = await getUserReferralCode(data.userId);
            socket.emit(READ_REFERRAL_CODE_RES, {
                userId: data.userId,
                payload: {
                    referralCode: code.code
                }
            });
        } catch (err) {
            logger.error(`Error during READ_REFERRAL_CODE for user ${data.userId}: ${err}`);

            socket.emit("error", {
                userId: data.userId,
                msg: "Failed to get user referral code",
            });
        }
    });

    socket.on(READ_REFERRAL_STATS, async (data: { userId: string }) => {
        try {
            logger.info(`Received READ_REFERRAL_STATS event from user ${data.userId}`);
            const referrerDetails = await getReferrerDetails(data.userId);
            const referralStats = await getReferralStats(data.userId);

            socket.emit(READ_REFERRAL_STATS_RES, {
                userId: data.userId,
                payload: {
                    referrerUserId: referrerDetails?.referrerUserId,
                    referrerExternal: referrerDetails?.referrerExternal,
                    referrerUsername: referrerDetails?.referrerUsername,
                    directRefereeCount: referralStats.directRefereeCount,
                    totalEarningsWei: referralStats.totalEarningsWei.toString(),
                }
            });
        } catch (err) {
            logger.error(`Error during READ_REFERRAL_STATS for user ${data.userId}: ${err}`);

            socket.emit("error", {
                userId: data.userId,
                msg: "Failed to read referral stats",
            });
        }
    });

    socket.on(USE_REFERRAL_CODE, async (data: { userId: string, referralCode: string }) => {
        try {
            logger.info(`Received USE_REFERRAL_CODE event from user ${data.userId}`);

            const validation = await validateReferralCodeUsage(data.userId, data.referralCode);
            if (!validation.valid) {
                logger.warn(`Referral code rejected for ${data.userId}: ${validation.reason}`);
                socket.emit("error", {
                    userId: data.userId,
                    msg: validation.reason,
                });
                return;
            }

            const res = await applyReferralCode(data.userId, data.referralCode);
            socket.emit(USE_REFERRAL_CODE_SUCCESS, {
                userId: data.userId,
                payload: {
                    referredBy: res.referredBy,
                    isUserReferrer: res.isUserReferrer
                }
            });
        } catch (err) {
            logger.error(`Error during USE_REFERRAL_CODE for user ${data.userId}: ${err}`);
            socket.emit("error", {
                userId: data.userId,
                msg: "Failed to use referral code",
            });
        }
    });

    // wallet
    socket.on("update-user-wallet-address", async (data: { userId: string, walletAddress: string }) => {
        try {
            logger.info(`Received update-user-wallet-address: ${JSON.stringify(data)}`)
            ledgerSocket.emit('ditto-ledger-update-user-wallet-address', { userId: data.userId.toString(), walletAddress: data.walletAddress.toString() })
        } catch (error) {
            logger.error(`Error updating wallet address for user ${data.userId}: ${error}`)
            socket.emit('update-user-wallet-address-error', {
                userId: data.userId,
                msg: 'Failed to update wallet address for user'
            })
        }
    })
}