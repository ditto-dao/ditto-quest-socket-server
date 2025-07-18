import { Combat, Domain, DomainMonster, Dungeon, DungeonMonsterSequence, Equipment, Item, Monster, MonsterDrop, Prisma, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";
import { FullUserData } from "../sql-services/user-service";
import { calculateExpForNextCombatLevel, calculateHpExpGained } from "../utils/helpers";
import { ABILITY_POINTS_PER_LEVEL } from "../utils/config";
import { requireUserMemoryManager } from "../managers/global-managers/global-managers";
import { prismaFetchDomainById, prismaFetchDungeonById, prismaFetchMonsterById } from "../sql-services/combat-service";
import { recalculateAndUpdateUserBaseStatsMemory } from "./user-stats-operations";

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
    return await prismaFetchMonsterById(monsterId);
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
    return await prismaFetchDomainById(domainId);
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
    return await prismaFetchDungeonById(dungeonId);
}

/**
 * Update user combat HP
 */
export async function setUserCombatHp(telegramId: string, newHp: number): Promise<number> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            const clampedHp = Math.max(0, Math.min(newHp, user.combat.maxHp));
            userMemoryManager.updateUserCombatField(telegramId, 'hp', clampedHp);
            return clampedHp;
        }

        throw new Error('User memory manager not available');
    } catch (error) {
        logger.error(`❌ Failed to update combat HP for user ${telegramId}:`, error);
        throw error;
    }
}

/**
 * Update last battle timestamp
 */
export async function setLastBattleTimestamp(telegramId: string, timestamp: Date): Promise<void> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Update in memory if available
        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            await userMemoryManager.updateUserField(telegramId, 'lastBattleEndTimestamp', timestamp);
        } else {
            throw new Error('User memory manager not available');
        }

        logger.debug(`⏰ Updated last battle timestamp for user ${telegramId}`);
    } catch (error) {
        logger.error(`❌ Failed to update battle timestamp for user ${telegramId}:`, error);
        throw error;
    }
}

// Type for the specific return object you want
export type UserStatsWithCombat = {
    // Base stats (from newBaseStats)
    maxHp: number;
    atkSpd: number;
    acc: number;
    eva: number;
    maxMeleeDmg: number;
    maxRangedDmg: number;
    maxMagicDmg: number;
    critChance: number;
    critMultiplier: number;
    dmgReduction: number;
    magicDmgReduction: number;
    hpRegenRate: number;
    hpRegenAmount: number;

    // User fields
    outstandingSkillPoints: number;
    hpLevel: number;
    expToNextHpLevel: number;
    expHp: number;
    str: number;
    def: number;
    dex: number;
    luk: number;
    magic: number;

    // Combat relation
    combat: Prisma.CombatGetPayload<{}> | null;
};

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

export async function incrementExpAndHpExpAndCheckLevelUpMemory(
    telegramId: string,
    expToAdd: number
): Promise<IncrementExpAndHpExpResponse> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            if (!user.combat) throw new Error("User combat data not found.");

            // Level Logic
            let newExp = user.exp + expToAdd;
            let currLevel = user.level;
            let outstandingSkillPoints = user.outstandingSkillPoints;
            let expToNextLevel = user.expToNextLevel;
            let levelUp = false;

            while (newExp >= calculateExpForNextCombatLevel(currLevel + 1)) {
                newExp -= calculateExpForNextCombatLevel(currLevel + 1);
                currLevel++;
                outstandingSkillPoints += ABILITY_POINTS_PER_LEVEL;
                levelUp = true;
            }
            expToNextLevel = calculateExpForNextCombatLevel(currLevel + 1);

            // HP Exp Logic
            let newHpExp = user.expHp + calculateHpExpGained(expToAdd);
            let currHpLevel = user.hpLevel;
            let expToNextHpLevel = user.expToNextHpLevel;
            let hpLevelUp = false;

            while (newHpExp >= calculateExpForNextCombatLevel(currHpLevel + 1)) {
                newHpExp -= calculateExpForNextCombatLevel(currHpLevel + 1);
                currHpLevel++;
                hpLevelUp = true;
            }
            expToNextHpLevel = calculateExpForNextCombatLevel(currHpLevel + 1);

            // Update memory
            await userMemoryManager.updateUserField(telegramId, 'level', currLevel);
            await userMemoryManager.updateUserField(telegramId, 'exp', newExp);
            await userMemoryManager.updateUserField(telegramId, 'expToNextLevel', expToNextLevel);
            await userMemoryManager.updateUserField(telegramId, 'outstandingSkillPoints', outstandingSkillPoints);
            await userMemoryManager.updateUserField(telegramId, 'hpLevel', currHpLevel);
            await userMemoryManager.updateUserField(telegramId, 'expHp', newHpExp);
            await userMemoryManager.updateUserField(telegramId, 'expToNextHpLevel', expToNextHpLevel);

            let hpLevelUpdatedUser = null;
            if (hpLevelUp) {
                hpLevelUpdatedUser = await recalculateAndUpdateUserBaseStatsMemory(telegramId);
            }

            logger.info(
                `User ${telegramId} (MEMORY) → LVL ${currLevel}, EXP ${newExp}/${expToNextLevel} | HP LVL ${currHpLevel}, HP EXP ${newHpExp}/${expToNextHpLevel}`
            );

            return {
                simpleUser: hpLevelUpdatedUser,
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
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Error in incrementExpAndHpExpAndCheckLevelUpMemory: ${error}`);
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
}

export async function applySkillUpgradesMemory(
    userId: string,
    upgrades: SkillUpgradeInput,
) {
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.hasUser(userId)) {
            const user = userMemoryManager.getUser(userId)!;

            const entries = Object.entries(upgrades).filter(([_, v]) => v !== undefined && v !== 0);
            if (entries.length === 0) {
                throw new Error(`No skill upgrades provided for user ${userId}`);
            }

            let totalPositiveChanges = 0;  // For skill point consumption
            let totalNegativeChanges = 0;  // For reset point consumption
            const validKeys = ["str", "def", "dex", "luk", "magic", "hpLevel"] as const;
            let isHpChange = false;
            let hpLevelChange = 0;

            // Validate inputs and calculate totals
            for (const [key, value] of entries) {
                if (!validKeys.includes(key as any)) {
                    throw new Error(`Invalid skill key: "${key}"`);
                }
                if (typeof value !== "number" || !Number.isInteger(value)) {
                    throw new Error(
                        `Invalid skill upgrade value for "${key}": must be an integer`
                    );
                }

                const currentStatValue = user[key as keyof typeof user] as number;

                if (value > 0) {
                    // Positive = pumping stats (costs skill points)
                    totalPositiveChanges += value;
                } else if (value < 0) {
                    // Negative = resetting stats (costs reset points)
                    totalNegativeChanges += Math.abs(value);

                    // Check if user has enough points in this stat to reset
                    if (currentStatValue + value < 1) {
                        throw new Error(
                            `Cannot reduce "${key}" by ${Math.abs(value)}: would result in ${currentStatValue + value} (minimum is 1)`
                        );
                    }
                }

                if (key === "hpLevel") {
                    isHpChange = true;
                    hpLevelChange = value;
                }
            }

            // Check if user has enough skill points for positive changes
            if (totalPositiveChanges > user.outstandingSkillPoints) {
                throw new Error(
                    `User ${userId} has ${user.outstandingSkillPoints} skill points, but tried to use ${totalPositiveChanges}`
                );
            }

            // Check if user has enough reset points for negative changes
            if (totalNegativeChanges > user.statResetPoints) {
                throw new Error(
                    `User ${userId} has ${user.statResetPoints} reset points, but tried to use ${totalNegativeChanges}`
                );
            }

            // Apply upgrades/resets to memory
            for (const [key, value] of entries) {
                const currentValue = user[key as keyof typeof user] as number;
                await userMemoryManager.updateUserField(userId, key as keyof FullUserData, currentValue + value);
            }

            // Handle HP level specific updates
            if (isHpChange) {
                const newHpLevel = user.hpLevel + hpLevelChange;
                await userMemoryManager.updateUserField(userId, 'expHp', 0);
                await userMemoryManager.updateUserField(userId, 'expToNextHpLevel', calculateExpForNextCombatLevel(newHpLevel));
            }

            // Update skill points and reset points
            const newSkillPoints = user.outstandingSkillPoints - totalPositiveChanges + totalNegativeChanges;
            const newResetPoints = user.statResetPoints - totalNegativeChanges;

            await userMemoryManager.updateUserField(userId, 'outstandingSkillPoints', newSkillPoints);
            await userMemoryManager.updateUserField(userId, 'statResetPoints', newResetPoints);

            logger.info(
                `✅ Applied skill changes to user ${userId} (MEMORY) — used ${totalPositiveChanges} skill points, ${totalNegativeChanges} reset points`
            );

            const userUpdatedStats = await recalculateAndUpdateUserBaseStatsMemory(userId);

            return {
                totalPointsUsed: totalPositiveChanges,
                totalResetPointsUsed: totalNegativeChanges,
                newResetPoints,
                userUpdatedStats,
            };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Error in applySkillUpgradesMemory: ${error}`);
        throw error;
    }
}