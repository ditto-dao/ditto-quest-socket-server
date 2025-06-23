import { Combat, Domain, DomainMonster, Dungeon, DungeonMonsterSequence, Equipment, Item, Monster, MonsterDrop, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "./client";
import { DungeonState } from "../managers/idle-managers/combat/dungeon-manager";
import { Decimal } from "@prisma/client/runtime/library";

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

export async function prismaFetchMonsterById(monsterId: number): Promise<FullMonster | null> {
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

export async function prismaFetchDomainById(domainId: number): Promise<DomainWithMonsters | null> {
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

export async function prismaFetchDungeonById(dungeonId: number): Promise<DungeonWithMonsters | null> {
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

export async function prismaUpdateDungeonLeaderboard(
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

export async function prismaFetchDungeonLeaderboardPage(
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