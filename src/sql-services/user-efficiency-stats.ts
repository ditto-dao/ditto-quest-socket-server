import { StatEffect, UserEfficiencyStats } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "./client";
import { calculateEfficiencyStatsDelta } from "../operations/user-stats-operations";

export interface UserEfficiencyStatsInput {
    skillIntervalMultiplier?: number;
    doubleResourceChance?: number;
    doubleSkillExpChance?: number;
    doubleCombatExpChance?: number;
    flatSkillExpBoost?: number;
    flatCombatExpBoost?: number;
}

/**
 * Create or update user efficiency stats
 * Uses upsert to handle both creation and updates
 */
export async function prismaSetUserEfficiencyStats(
    userId: string,
    stats: UserEfficiencyStatsInput
): Promise<UserEfficiencyStats> {
    try {
        const result = await prisma.userEfficiencyStats.upsert({
            where: { userId },
            update: {
                ...stats,
                updatedAt: new Date()
            },
            create: {
                userId,
                skillIntervalMultiplier: stats.skillIntervalMultiplier ?? 0.0,
                doubleResourceChance: stats.doubleResourceChance ?? 0.0,
                doubleSkillExpChance: stats.doubleSkillExpChance ?? 0.0,
                doubleCombatExpChance: stats.doubleCombatExpChance ?? 0.0,
                flatSkillExpBoost: stats.flatSkillExpBoost ?? 0,
                flatCombatExpBoost: stats.flatCombatExpBoost ?? 0,
            }
        });

        logger.info(`⚡ Set efficiency stats for user ${userId}`);
        return result;
    } catch (error) {
        logger.error(`❌ Failed to set efficiency stats for user ${userId}: ${error}`);
        throw error;
    }
}

/**
 * Get user efficiency stats, create default if doesn't exist
 */
export async function prismaFetchUserEfficiencyStats(userId: string): Promise<UserEfficiencyStats> {
    try {
        const stats = await prisma.userEfficiencyStats.findUnique({
            where: { userId }
        });

        if (!stats) {
            // Create default stats if they don't exist
            return await prismaSetUserEfficiencyStats(userId, {});
        }

        return stats;
    } catch (error) {
        logger.error(`❌ Failed to get efficiency stats for user ${userId}: ${error}`);
        throw error;
    }
}

/**
 * Delete user efficiency stats
 */
export async function prismaDeleteUserEfficiencyStats(userId: string): Promise<void> {
    try {
        await prisma.userEfficiencyStats.delete({
            where: { userId }
        });

        logger.info(`⚡ Deleted efficiency stats for user ${userId}`);
    } catch (error) {
        logger.error(`❌ Failed to delete efficiency stats for user ${userId}: ${error}`);
        throw error;
    }
}

export async function prismaRecalculateAndUpdateUserEfficiencyStats(telegramId: string): Promise<UserEfficiencyStats> {
    try {
        logger.info(`⚡ Recalculating efficiency stats for user ${telegramId} (DATABASE)`);

        // Fetch user with all equipment and slime
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: {
                hat: { include: { equipment: { include: { statEffect: true } } } },
                armour: { include: { equipment: { include: { statEffect: true } } } },
                weapon: { include: { equipment: { include: { statEffect: true } } } },
                shield: { include: { equipment: { include: { statEffect: true } } } },
                cape: { include: { equipment: { include: { statEffect: true } } } },
                necklace: { include: { equipment: { include: { statEffect: true } } } },
                equippedSlime: {
                    include: {
                        BodyDominant: { include: { statEffect: true } },
                        PatternDominant: { include: { statEffect: true } },
                        PrimaryColourDominant: { include: { statEffect: true } },
                        AccentDominant: { include: { statEffect: true } },
                        DetailDominant: { include: { statEffect: true } },
                        EyeColourDominant: { include: { statEffect: true } },
                        EyeShapeDominant: { include: { statEffect: true } },
                        MouthDominant: { include: { statEffect: true } },
                    }
                }
            }
        });

        if (!user) {
            throw new Error(`User ${telegramId} not found`);
        }

        // Collect all stat effects from equipment
        const statEffects: StatEffect[] = [];

        const equippedItems = [
            user.hat,
            user.armour,
            user.weapon,
            user.shield,
            user.cape,
            user.necklace,
        ];

        // Add equipment stat effects
        for (const item of equippedItems) {
            const effect = item?.equipment?.statEffect;
            if (effect) {
                statEffects.push(effect);
                logger.debug(`⚡ Adding equipment effect from ${item.equipment?.name}`);
            }
        }

        // Add equipped slime dominant trait effects
        if (user.equippedSlime) {
            const dominantTraits = [
                user.equippedSlime.BodyDominant,
                user.equippedSlime.PatternDominant,
                user.equippedSlime.PrimaryColourDominant,
                user.equippedSlime.AccentDominant,
                user.equippedSlime.DetailDominant,
                user.equippedSlime.EyeColourDominant,
                user.equippedSlime.EyeShapeDominant,
                user.equippedSlime.MouthDominant,
            ];

            for (const trait of dominantTraits) {
                if (trait?.statEffect) {
                    statEffects.push(trait.statEffect);
                    logger.debug(`⚡ Adding slime trait effect from ${trait.name}`);
                }
            }
        }

        // Calculate efficiency stats delta
        const delta = calculateEfficiencyStatsDelta(statEffects);

        // Update efficiency stats in database
        const updatedStats = await prismaSetUserEfficiencyStats(telegramId, {
            skillIntervalMultiplier: delta.efficiencySkillInterval,
            doubleResourceChance: delta.efficiencyDoubleResource,
            doubleSkillExpChance: delta.efficiencyDoubleSkillExp,
            doubleCombatExpChance: delta.efficiencyDoubleCombatExp,
            flatSkillExpBoost: delta.efficiencyFlatSkillExp,
            flatCombatExpBoost: delta.efficiencyFlatCombatExp,
        });

        logger.info(`✅ Recalculated efficiency stats for user ${telegramId} (DATABASE): ${JSON.stringify(delta)}`);
        return updatedStats;

    } catch (error) {
        logger.error(`❌ Failed to recalculate efficiency stats for user ${telegramId} (DATABASE): ${error}`);
        throw error;
    }
}