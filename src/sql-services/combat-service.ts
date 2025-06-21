import { Combat, Domain, DomainMonster, Dungeon, DungeonMonsterSequence, Equipment, Item, Monster, MonsterDrop, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "./client";
import { DungeonState } from "../managers/idle-managers/combat/dungeon-manager";
import { Decimal } from "@prisma/client/runtime/library";
import { calculateExpForNextLevel, calculateHpExpGained } from "../utils/helpers";
import { prismaRecalculateAndUpdateUserBaseStats, UserStatsWithCombat } from "./user-service";
import { ABILITY_POINTS_PER_LEVEL } from "../utils/config";

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

export async function prismaSetUserCombatHp(telegramId: string, newHp: number): Promise<number> {
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
        const update = await prisma.user.update({
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

        return update.combat.hp;
    } catch (error) {
        console.error(`Error setting user combat HP for user ${telegramId}: ${error}`);
        throw error;
    }
}

export async function prismaSetLastBattleEndTimestamp(userId: string, timestamp: Date) {
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

export interface IncrementExpAndHpExpResponse {
    simpleUser: UserStatsWithCombat | null

    levelUp: boolean;
    level: number;
    exp: number;
    expToNextLevel: number;
    outstandingSkillPoints: number;

    hpLevelUp: boolean;
    hpLevel: number;
    hpExp: number;
    expToNextHpLevel: number;
}

export async function prismaIncrementExpAndHpExpAndCheckLevelUp(
    telegramId: string,
    expToAdd: number
): Promise<IncrementExpAndHpExpResponse> {
    try {
        const user = await prisma.user.findUnique({
            where: { telegramId },
            include: { combat: true }
        });

        if (!user) throw new Error("User not found.");
        if (!user.combat) throw new Error("User combat data not found.");

        // Level Logic
        let newExp = user.exp + expToAdd;
        let currLevel = user.level;
        let outstandingSkillPoints = user.outstandingSkillPoints;
        let expToNextLevel = user.expToNextLevel;
        let levelUp = false;

        while (newExp >= calculateExpForNextLevel(currLevel + 1)) {
            newExp -= calculateExpForNextLevel(currLevel + 1);
            currLevel++;
            outstandingSkillPoints += ABILITY_POINTS_PER_LEVEL;
            levelUp = true;
        }

        expToNextLevel = calculateExpForNextLevel(currLevel + 1); // only update once at end

        // HP Exp Logic
        let newHpExp = user.expHp + calculateHpExpGained(expToAdd);
        let currHpLevel = user.hpLevel;
        let expToNextHpLevel = user.expToNextHpLevel;
        let hpLevelUp = false;

        while (newHpExp >= calculateExpForNextLevel(currHpLevel + 1)) {
            newHpExp -= calculateExpForNextLevel(currHpLevel + 1);
            currHpLevel++;
            hpLevelUp = true;
        }

        expToNextHpLevel = calculateExpForNextLevel(currHpLevel + 1); // update after loop

        // Update database
        await prisma.user.update({
            where: { telegramId },
            data: {
                level: currLevel,
                exp: newExp,
                expToNextLevel,
                outstandingSkillPoints,
                hpLevel: currHpLevel,
                expHp: newHpExp,
                expToNextHpLevel,
            }
        });

        let hpLevelUpdatedUser;
        if (hpLevelUp) {
            hpLevelUpdatedUser = await prismaRecalculateAndUpdateUserBaseStats(telegramId);
        }

        logger.info(
            `User ${telegramId} → LVL ${currLevel}, EXP ${newExp}/${expToNextLevel} | HP LVL ${currHpLevel}, HP EXP ${newHpExp}/${expToNextHpLevel}`
        );

        return {
            simpleUser: (hpLevelUp && hpLevelUpdatedUser) ? hpLevelUpdatedUser : null,
            levelUp,
            level: currLevel,
            exp: newExp,
            expToNextLevel,
            outstandingSkillPoints,
            hpLevelUp,
            hpLevel: currHpLevel,
            hpExp: newHpExp,
            expToNextHpLevel
        };
    } catch (error) {
        logger.error(`Error in incrementExpAndHpExpAndCheckLevelUp: ${error}`);
        throw error;
    }
}

export interface SkillUpgradeInput {
    str?: number;
    def?: number;
    dex?: number;
    luk?: number;
    magic?: number;
    hpLevel?: number;
};

export interface SkillUpgradeInput {
    str?: number;
    def?: number;
    dex?: number;
    luk?: number;
    magic?: number;
    hpLevel?: number;
}

export async function prismaApplySkillUpgrades(
    userId: string,
    upgrades: SkillUpgradeInput,
) {
    const entries = Object.entries(upgrades).filter(([_, v]) => v !== undefined);

    if (entries.length === 0) {
        throw new Error(`No skill upgrades provided for user ${userId}`);
    }

    let totalPointsNeeded = 0;
    const updateData: Record<string, { increment: number }> = {};

    const validKeys = ["str", "def", "dex", "luk", "magic", "hpLevel"] as const;

    let isHpUpgrade = false;
    let hpLevelToAdd = 0;

    for (const [key, value] of entries) {
        if (!validKeys.includes(key as any)) {
            throw new Error(`Invalid skill key: "${key}"`);
        }

        if (typeof value !== "number" || value <= 0 || !Number.isInteger(value)) {
            throw new Error(
                `Invalid skill upgrade value for "${key}": must be a positive integer`
            );
        }

        updateData[key] = { increment: value };
        totalPointsNeeded += value;

        if (key === "hpLevel") {
            isHpUpgrade = true;
            hpLevelToAdd = value;
        }
    }

    const user = await prisma.user.findUnique({
        where: { telegramId: userId },
        select: {
            outstandingSkillPoints: true,
            hpLevel: true,
        },
    });

    if (!user) {
        throw new Error(`User not found: ${userId}`);
    }

    if (user.outstandingSkillPoints < totalPointsNeeded) {
        throw new Error(
            `User ${userId} has ${user.outstandingSkillPoints} skill points, but tried to use ${totalPointsNeeded}`
        );
    }

    const additionalHpFields = isHpUpgrade
        ? {
            expHp: 0,
            expToNextHpLevel: calculateExpForNextLevel(user.hpLevel + hpLevelToAdd),
        }
        : {};

    await prisma.user.update({
        where: { telegramId: userId },
        data: {
            ...updateData,
            ...additionalHpFields,
            outstandingSkillPoints: { decrement: totalPointsNeeded },
        },
    });

    logger.info(
        `✅ Applied raw skill upgrades to user ${userId} — used ${totalPointsNeeded} points`
    );

    await prismaRecalculateAndUpdateUserBaseStats(userId);

    return { totalPointsUsed: totalPointsNeeded };
}
