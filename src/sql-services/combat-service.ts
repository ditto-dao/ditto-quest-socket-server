import { Combat, Domain, DomainMonster, Dungeon, DungeonMonsterSequence, Equipment, Item, Monster, MonsterDrop, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "./client";
import { DungeonState } from "../managers/idle-managers/combat/dungeon-manager";
import { Decimal } from "@prisma/client/runtime/library";
import { snapshotManager, SnapshotTrigger } from "./snapshot-manager-service";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";

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
 * Updated Combat Service - Memory first with Prisma fallback
 * Monster/Domain/Dungeon functions try memory cache first, fallback to database
 * Other combat functions (user-specific) remain unchanged and use database
 */

/**
 * Fetch a monster by ID - memory first with database fallback
 */
export async function fetchMonsterById(monsterId: number): Promise<FullMonster | null> {
    try {
        // Try memory cache first - O(1) lookup
        if (GameCodexManager.isReady()) {
            const monster = GameCodexManager.getMonster(monsterId);
            if (monster) {
                logger.debug(`Retrieved monster ${monsterId} (${monster.name}) from memory cache`);
                return monster;
            }
        }
    } catch (error) {
        logger.warn(`Memory cache failed for fetchMonsterById(${monsterId}): ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for fetchMonsterById(${monsterId})`);

        const monster = await prisma.monster.findUnique({
            where: { id: monsterId },
            include: {
                combat: true,
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
            logger.warn(`Monster with ID ${monsterId} not found in database.`);
            return null;
        }

        logger.info(`Retrieved monster from database: ${monster.name}`);
        return monster;
    } catch (error) {
        logger.error(`Error fetching monster with ID ${monsterId} from database: ${error}`);
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
 * Fetches a domain by its ID - memory first with database fallback
 */
export async function getDomainById(domainId: number): Promise<DomainWithMonsters | null> {
    try {
        // Try memory cache first - O(1) lookup
        if (GameCodexManager.isReady()) {
            const domain = GameCodexManager.getDomain(domainId);
            if (domain) {
                logger.debug(`Retrieved domain ${domainId} (${domain.name}) from memory cache`);
                return domain;
            }
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getDomainById(${domainId}): ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getDomainById(${domainId})`);

        const domain = await prisma.domain.findUnique({
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

        if (domain) {
            logger.info(`Retrieved domain from database: ${domain.name}`);
        }
        return domain;
    } catch (error) {
        logger.error(`Error fetching domain with ID ${domainId} from database: ${error}`);
        throw error;
    }
}

export type DungeonWithMonsters = Dungeon & {
    monsterSequence: (DungeonMonsterSequence & {
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
 * Fetches a dungeon by its ID - memory first with database fallback
 */
export async function getDungeonById(dungeonId: number): Promise<DungeonWithMonsters | null> {
    try {
        // Try memory cache first - O(1) lookup
        if (GameCodexManager.isReady()) {
            const dungeon = GameCodexManager.getDungeon(dungeonId);
            if (dungeon) {
                logger.debug(`Retrieved dungeon ${dungeonId} (${dungeon.name}) from memory cache`);
                return dungeon;
            }
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getDungeonById(${dungeonId}): ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getDungeonById(${dungeonId})`);

        const dungeon = await prisma.dungeon.findUnique({
            where: { id: dungeonId },
            include: {
                monsterSequence: {
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

        if (dungeon) {
            logger.info(`Retrieved dungeon from database: ${dungeon.name}`);
        }
        return dungeon;
    } catch (error) {
        logger.error(`Error fetching dungeon with ID ${dungeonId} from database: ${error}`);
        throw error;
    }
}

export async function updateDungeonLeaderboard(
    userId: string,
    dungeonId: number,
    dungeonState: DungeonState,
    monstersPerFloor: number,
) {
    const monstersKilled = (dungeonState.floor - 1) * monstersPerFloor + dungeonState.monsterIndex;
    const damageDealt = dungeonState.totalDamageDealt;
    const damageTaken = dungeonState.totalDamageTaken;
    const timeElapsedMs = Date.now() - dungeonState.startTimestamp;

    const newScore =
        monstersKilled * 1000 +
        damageDealt * 0.5 -
        damageTaken * 0.25 -
        (timeElapsedMs / 1000) * 2;

    // Fetch the current leaderboard entry (if it exists)
    const existingEntry = await prisma.dungeonLeaderboard.findUnique({
        where: {
            userId_dungeonId: {
                userId,
                dungeonId,
            },
        },
    });

    // If the existing score is higher (or equal), do nothing
    if (existingEntry && existingEntry.score >= newScore) {
        logger.info(`⏩ Skipping leaderboard update for user ${userId} in dungeon ${dungeonId}. Current score (${existingEntry.score}) >= new score (${newScore})`);
        return;
    }

    // Otherwise, update or create the entry
    await prisma.dungeonLeaderboard.upsert({
        where: {
            userId_dungeonId: {
                userId,
                dungeonId,
            },
        },
        update: {
            monstersKilled,
            damageDealt,
            damageTaken,
            timeElapsedMs,
            score: newScore,
            runDate: new Date(),
        },
        create: {
            userId,
            dungeonId,
            monstersKilled,
            damageDealt,
            damageTaken,
            timeElapsedMs,
            score: newScore,
            runDate: new Date(),
        },
    });

    logger.info(`🏆 Upserted leaderboard for user ${userId} in dungeon ${dungeonId}. monstersKilled: ${monstersKilled}, damageDealt: ${damageDealt}, damageTaken: ${damageTaken}, timeElapsedMs: ${timeElapsedMs}, score: ${newScore}`);

    await snapshotManager.markStale(userId, SnapshotTrigger.LEADERBOARD_UPDATE);
}

export type DungeonLeaderboardEntry = {
    id: number;
    userId: string;
    dungeonId: number;
    monstersKilled: number;
    damageDealt: number;
    damageTaken: number;
    timeElapsedMs: number;
    runDate: Date;
    score: number;
    user: {
        telegramId: string;
        username: string | null;
        level: number;
        combat: {
            cp: Decimal;
        } | null;
        equippedSlime: {
            imageUri: string;
        } | null;
    };
};

export async function getDungeonLeaderboardPage(
    dungeonId: number,
    limit: number,
    cursor?: { id: number }
): Promise<DungeonLeaderboardEntry[]> {
    return await prisma.dungeonLeaderboard.findMany({
        where: { dungeonId },
        orderBy: { score: 'desc' },
        take: limit,
        ...(cursor ? { skip: 1, cursor } : {}),
        include: {
            user: {
                select: {
                    telegramId: true,
                    username: true,
                    level: true,
                    combat: {
                        select: {
                            cp: true,
                        },
                    },
                    equippedSlime: {
                        select: {
                            imageUri: true,
                        }
                    }
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