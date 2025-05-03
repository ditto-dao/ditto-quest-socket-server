import { Socket } from "socket.io"
import { DefaultEventsMap } from "socket.io/dist/typed-events"
import { logger } from "../../utils/logger"
import { applySkillUpgradesOnly, equipEquipmentForUser, EquippedInventory, getEquipmentOrItemFromInventory, getEquippedByEquipmentType, getSimpleUserData, recalculateAndUpdateUserBaseStats, SkillUpgradeInput, unequipEquipmentForUser } from "../../sql-services/user-service";
import { EquipmentType } from "@prisma/client";
import { equipSlimeForUser, getEquippedSlimeWithTraits, getSlimeWithTraitsById, SlimeWithTraits, unequipSlimeForUser } from "../../sql-services/slime";
import { emitUserAndCombatUpdate } from "../../utils/helpers";
import { IdleCombatManager } from "../../managers/idle-managers/combat/combat-idle-manager";
import { IdleManager } from "../../managers/idle-managers/idle-manager";
import { USE_REFERRAL_CODE } from "../events";
import { applyReferralCode } from "../../sql-services/referrals";

interface EquipPayload {
    userId: string;
    inventoryId: number;
}

export async function setupUserSocketHandlers(
    socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>,
    idleManager: IdleManager,
    idleCombatManager: IdleCombatManager,
): Promise<void> {
    socket.on("equip-equipment", async (data: EquipPayload) => {
        logger.info(`Received equip-equipment event from user ${data.userId}`);

        try {
            const inventoryEl = await getEquipmentOrItemFromInventory(data.userId, data.inventoryId);
            if (!inventoryEl) throw new Error(`Inventory element not found`);

            const equipmentType = inventoryEl?.equipment?.type;
            const previouslyEquipped = equipmentType
                ? await getEquippedByEquipmentType(data.userId, equipmentType)
                : null;

            try {
                // Attempt to equip new item
                const res = await equipEquipmentForUser(data.userId.toString(), inventoryEl);
                idleCombatManager.updateUserCombatMidBattle(data.userId, res.combat);
                emitUserAndCombatUpdate(socket, data.userId, res);
            } catch (err) {
                logger.warn(`Equip failed, reverting to previous state...`);

                // Attempt to revert to previously equipped item
                if (previouslyEquipped) {
                    const revertRes = await equipEquipmentForUser(data.userId.toString(), previouslyEquipped);
                    if (revertRes) emitUserAndCombatUpdate(socket, data.userId, revertRes);
                } else if (inventoryEl.equipment) {
                    // If nothing was previously equipped, unequip the current type
                    const res = await unequipEquipmentForUser(data.userId, inventoryEl.equipment.type);
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

    socket.on("unequip-equipment", async (data: { userId: string; equipmentType: EquipmentType }) => {
        let currentEquipped: EquippedInventory | null = null;

        try {
            logger.info(`Received unequip-equipment event from user ${data.userId} for type ${data.equipmentType}`);

            // Store the currently equipped item before unequipping
            currentEquipped = await getEquippedByEquipmentType(data.userId.toString(), data.equipmentType);

            if (!currentEquipped) {
                logger.info(`Nothing to unequip for ${data.equipmentType} for user ${data.userId}`);
                return;
            }

            // Attempt to unequip
            const userDataAfterUnequip = await unequipEquipmentForUser(data.userId.toString(), data.equipmentType);

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
                    const revertRes = await equipEquipmentForUser(data.userId, currentEquipped);
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

    socket.on("equip-slime", async (data: { userId: string; slimeId: number }) => {
        logger.info(`Received equip-slime event from user ${data.userId} for slime ${data.slimeId}`);

        let previouslyEquippedSlime: SlimeWithTraits | null = null;

        try {
            previouslyEquippedSlime = await getEquippedSlimeWithTraits(data.userId);
            const nextEquippedSlime = await getSlimeWithTraitsById(data.slimeId);

            if (!nextEquippedSlime) throw new Error(`Slime of id ${data.slimeId} does not exist`);

            if (nextEquippedSlime.ownerId !== data.userId) throw new Error(`User ${data.userId} does not own slime ${data.slimeId}`);

            const newEquipped = await equipSlimeForUser(data.userId, nextEquippedSlime);
            idleCombatManager.updateUserCombatMidBattle(data.userId, newEquipped.combat);

            emitUserAndCombatUpdate(socket, data.userId, newEquipped);

        } catch (err) {
            logger.warn(`Equip slime failed, reverting...`);

            if (previouslyEquippedSlime) {
                try {
                    const revertRes = await equipSlimeForUser(data.userId, previouslyEquippedSlime);
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

    socket.on("unequip-slime", async (data: { userId: string }) => {
        let currentEquipped: SlimeWithTraits | null = null;

        try {
            logger.info(`Received unequip-slime event from user ${data.userId}`);

            currentEquipped = await getEquippedSlimeWithTraits(data.userId);
            if (!currentEquipped) {
                logger.info(`Nothing to unequip for user ${data.userId}`);
                return;
            }

            const unequipped = await unequipSlimeForUser(data.userId);

            idleCombatManager.stopCombat(idleManager, data.userId);

            emitUserAndCombatUpdate(socket, data.userId, unequipped);

        } catch (err) {
            logger.error(`Error during unequip-slime for user ${data.userId}: ${err}`);

            // Revert if something breaks
            if (currentEquipped) {
                try {
                    const revertRes = await equipSlimeForUser(data.userId, currentEquipped);
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

    socket.on("pump-stats", async (data: { userId: string, statsToUpgrade: SkillUpgradeInput }) => {
        try {
            logger.info(`Received pump-stats event from user ${data.userId}`);

            await applySkillUpgradesOnly(data.userId, data.statsToUpgrade);
            const updateRes = await recalculateAndUpdateUserBaseStats(data.userId);

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
            await getSimpleUserData(data.userId).then(res => {
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

    socket.on(USE_REFERRAL_CODE, async (data: { userId: string, referralCode: string }) => {
        try {
            logger.info(`Received USE_REFERRAL_CODE event from user ${data.userId}`);
            await applyReferralCode(data.userId, data.referralCode);
        } catch (err) {
            logger.error(`Error during USE_REFERRAL_CODE for user ${data.userId}: ${err}`);

            socket.emit("error", {
                userId: data.userId,
                msg: "Failed to use referral code",
            });
        } finally {
/*             socket.emit("pump-stats-complete", {
                userId: data.userId,
            }); */
        }
    });
}