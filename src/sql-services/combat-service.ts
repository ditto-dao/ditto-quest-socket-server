import { Combat, Domain, DomainMonster, Equipment, Item, Monster, MonsterDrop, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "./client";

/**
 * Type representing a full Monster with all its nested data.
 */
export type FullMonster = Monster & {
    combat: Combat;
    statEffects: StatEffect[];
    drops: (MonsterDrop & {
        item: Item | null;
        equipment: Equipment | null;
    })[];
};

/**
 * Fetch a monster by ID, including its combat stats.
 * @param {number} monsterId - The ID of the monster to fetch.
 * @returns {Promise<Monster>} - The monster with its combat stats and drop objects.
 */
export async function fetchMonsterById(monsterId: number): Promise<FullMonster | null> {
    try {
        logger.info(`Fetching monster with ID: ${monsterId}`);

        const monster = await prisma.monster.findUnique({
            where: { id: monsterId },
            include: {
                combat: true, // Include combat stats
                statEffects: true,
                drops: {
                    include: {
                        item: true,
                        equipment: true,
                    }
                }
            },
        });

        if (!monster) {
            logger.warn(`Monster with ID ${monsterId} not found.`);
            return null;
        }

        logger.info(`Retrieved monster: ${monster.name}`);
        return monster;
    } catch (error) {
        logger.error(`Error fetching monster with ID ${monsterId}: ${error}`);
        throw error;
    }
}

/**
 * Type representing a Domain with all nested monsters and their data.
 */
export type DomainWithMonsters = Domain & {
    monsters: (DomainMonster & {
        monster: Monster & {
            combat: Combat;
            statEffects: StatEffect[];
            drops: (MonsterDrop & {
                item: Item | null;
                equipment: Equipment | null;
            })[];
        };
    })[];
};

/**
 * Fetches a domain by its ID, including nested monster data.
 *
 * This function returns a full `DomainWithMonsters` object from the database, along with:
 * - All `DomainMonster` entries related to it
 * - Each associated `Monster`'s data
 * - Each `Monster`'s `combat` stats
 * - Each `Monster`'s attached `statEffects`
 * - Each `Monster`'s `drops`, including nested `item` or `equipment`
 *
 * @param domainId - The ID of the domain to fetch
 * @returns A `DomainWithMonsters` object or `null` if not found
 */
export async function getDomainById(domainId: number): Promise<DomainWithMonsters | null> {
    return await prisma.domain.findUnique({
        where: { id: domainId },
        include: {
            monsters: {
                include: {
                    monster: {
                        include: {
                            combat: true,
                            statEffects: true,
                            drops: {
                                include: {
                                    item: true,
                                    equipment: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
}

/**
 * Increment or decrement a user's base stats.
 * @param {string} userId - The Telegram ID of the user.
 * @param {Partial<{ str: number; def: number; dex: number; luk: number; magic: number; hpLevel: number }>} changes - The stat changes.
 * @returns {Promise<void>}
 */
export async function updateUserStats(
    userId: string,
    changes: Partial<{ str: number; def: number; dex: number; luk: number; magic: number; hpLevel: number }>
) {
    try {
        logger.info(`Updating stats for user: ${userId}`);

        // Ensure at least one change is provided
        if (Object.keys(changes).length === 0) {
            throw new Error("No stat changes provided.");
        }

        // Update the user stats dynamically
        await prisma.user.update({
            where: { telegramId: userId },
            data: {
                str: { increment: changes.str ?? 0 },
                def: { increment: changes.def ?? 0 },
                dex: { increment: changes.dex ?? 0 },
                luk: { increment: changes.luk ?? 0 },
                magic: { increment: changes.magic ?? 0 },
                hpLevel: { increment: changes.hpLevel ?? 0 },
            },
        });

        logger.info(`Successfully updated stats for user: ${userId}`);
    } catch (error) {
        logger.error(`Error updating user stats: ${error}`);
        throw error;
    }
}

/**
 * Updates a user's combat HP by telegramId using a nested update.
 *
 * This avoids fetching the combatId manually by using Prisma's relational updates.
 *
 * @param telegramId - The user's Telegram ID
 * @param newHp - The new HP value to set
 * @returns The updated Combat object
 */
export async function setUserCombatHpByTelegramId(telegramId: string, newHp: number) {
    try {
        // First, get the user's combat maxHp
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                combat: { select: { maxHp: true } },
            },
        });

        if (!user || !user.combat) {
            throw new Error(`User or combat record not found for telegramId ${telegramId}`);
        }

        const clampedHp = Math.max(0, Math.min(newHp, user.combat.maxHp));

        // Now perform nested update
        return await prisma.user.update({
            where: { telegramId },
            data: {
                combat: {
                    update: {
                        hp: clampedHp,
                    },
                },
            },
            select: {
                combat: true,
            },
        });
    } catch (error) {
        console.error(`Error setting user combat HP for user ${telegramId}: ${error}`);
        throw error;
    }
}

/**
 * Updates the lastBattleEndTimestamp for a user by their userId.
 *
 * @param userId - The telegramId of the user
 * @param timestamp - The Date to set as the last battle end time
 * @returns The updated user object
 */
export async function setLastBattleEndTimestamp(userId: string, timestamp: Date) {
    try {
        const updatedUser = await prisma.user.update({
            where: { telegramId: userId },
            data: {
                lastBattleEndTimestamp: timestamp,
            },
        });

        return updatedUser;
    } catch (error) {
        console.error(`Error updating lastBattleEndTimestamp for user ${userId}: ${error}`);
        throw error;
    }
}