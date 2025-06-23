import { Combat, Domain, DomainMonster, Dungeon, DungeonMonsterSequence, Equipment, Item, Monster, MonsterDrop, Prisma, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";
import { FullUserData } from "../sql-services/user-service";
import { calculateExpForNextLevel, calculateHpExpGained } from "../utils/helpers";
import { recalculateAndUpdateUserBaseStatsMemory } from "./user-operations";
import { ABILITY_POINTS_PER_LEVEL } from "../utils/config";
import { requireUserMemoryManager } from "../managers/global-managers/global-managers";
import { prismaFetchDomainById, prismaFetchDungeonById, prismaFetchMonsterById } from "../sql-services/combat-service";

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

        // Try memory first
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
            userMemoryManager.updateUserField(telegramId, 'lastBattleEndTimestamp', timestamp);
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

    doubleResourceOdds: number;
    skillIntervalReductionMultiplier: number;

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
        // Try memory first
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

            while (newExp >= calculateExpForNextLevel(currLevel + 1)) {
                newExp -= calculateExpForNextLevel(currLevel + 1);
                currLevel++;
                outstandingSkillPoints += ABILITY_POINTS_PER_LEVEL;
                levelUp = true;
            }
            expToNextLevel = calculateExpForNextLevel(currLevel + 1);

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
            expToNextHpLevel = calculateExpForNextLevel(currHpLevel + 1);

            // Update memory
            userMemoryManager.updateUserField(telegramId, 'level', currLevel);
            userMemoryManager.updateUserField(telegramId, 'exp', newExp);
            userMemoryManager.updateUserField(telegramId, 'expToNextLevel', expToNextLevel);
            userMemoryManager.updateUserField(telegramId, 'outstandingSkillPoints', outstandingSkillPoints);
            userMemoryManager.updateUserField(telegramId, 'hpLevel', currHpLevel);
            userMemoryManager.updateUserField(telegramId, 'expHp', newHpExp);
            userMemoryManager.updateUserField(telegramId, 'expToNextHpLevel', expToNextHpLevel);

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
        // Try memory first
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.hasUser(userId)) {
            const user = userMemoryManager.getUser(userId)!;

            const entries = Object.entries(upgrades).filter(([_, v]) => v !== undefined);
            if (entries.length === 0) {
                throw new Error(`No skill upgrades provided for user ${userId}`);
            }

            let totalPointsNeeded = 0;
            const validKeys = ["str", "def", "dex", "luk", "magic", "hpLevel"] as const;
            let isHpUpgrade = false;
            let hpLevelToAdd = 0;

            // Validate inputs and calculate totals
            for (const [key, value] of entries) {
                if (!validKeys.includes(key as any)) {
                    throw new Error(`Invalid skill key: "${key}"`);
                }
                if (typeof value !== "number" || value <= 0 || !Number.isInteger(value)) {
                    throw new Error(
                        `Invalid skill upgrade value for "${key}": must be a positive integer`
                    );
                }
                totalPointsNeeded += value;
                if (key === "hpLevel") {
                    isHpUpgrade = true;
                    hpLevelToAdd = value;
                }
            }

            // Check if user has enough skill points
            if (user.outstandingSkillPoints < totalPointsNeeded) {
                throw new Error(
                    `User ${userId} has ${user.outstandingSkillPoints} skill points, but tried to use ${totalPointsNeeded}`
                );
            }

            // Apply upgrades to memory
            for (const [key, value] of entries) {
                const currentValue = user[key as keyof typeof user] as number;
                userMemoryManager.updateUserField(userId, key as keyof FullUserData, currentValue + value);
            }

            // Handle HP level specific updates
            if (isHpUpgrade) {
                userMemoryManager.updateUserField(userId, 'expHp', 0);
                userMemoryManager.updateUserField(userId, 'expToNextHpLevel', calculateExpForNextLevel(user.hpLevel + hpLevelToAdd));
            }

            // Deduct skill points
            userMemoryManager.updateUserField(userId, 'outstandingSkillPoints', user.outstandingSkillPoints - totalPointsNeeded);

            logger.info(
                `✅ Applied skill upgrades to user ${userId} (MEMORY) — used ${totalPointsNeeded} points`
            );

            await recalculateAndUpdateUserBaseStatsMemory(userId);

            return { totalPointsUsed: totalPointsNeeded };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Error in applySkillUpgradesOnlyMemory: ${error}`);
        throw error;
    }
}