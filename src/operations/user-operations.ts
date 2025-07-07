import { logger } from '../utils/logger';
import { EquippedInventory, FullUserData, prismaFetchEquippedByEquipmentType, prismaFetchUserData, prismaRecalculateAndUpdateUserBaseStats, prismaRecalculateAndUpdateUserStats, UserDataEquipped } from '../sql-services/user-service';
import { snapshotMetrics } from '../workers/snapshot/snapshot-metrics';
import { Combat, EquipmentType, Prisma, StatEffect, User } from '@prisma/client';
import { calculateCombatPower, getBaseAccFromLuk, getBaseAtkSpdFromLuk, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseDmgReductionFromDefAndStr, getBaseEvaFromDex, getBaseHpRegenAmtFromHpLvlAndDef, getBaseHpRegenRateFromHpLvlAndDef, getBaseMagicDmgReductionFromDefAndMagic, getBaseMaxDmg, getBaseMaxHpFromHpLvl } from '../managers/idle-managers/combat/combat-helpers';
import { MAX_INITIAL_SLIME_INVENTORY_SLOTS } from '../utils/config';
import { requireSnapshotRedisManager, requireUserMemoryManager } from '../managers/global-managers/global-managers';
import { UserStatsWithCombat } from './combat-operations';
import { calculateExpForNextSkillLevel } from '../utils/helpers';

/**
 * Get user data - Memory first, then Redis, then Database
 * This is the main entry point for getting user data
 */
export async function getUserData(telegramId: string): Promise<FullUserData | null> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // 1. Try Memory first - O(1) lookup
        if (userMemoryManager.isReady()) {
            const memoryUser = userMemoryManager.getUser(telegramId);
            if (memoryUser) {
                logger.debug(`✅ User ${telegramId} retrieved from memory`);
                return memoryUser;
            }
        }

        // 2. Fallback to database
        logger.info(`📚 User ${telegramId} not in cache, loading from database`);
        const dbUser = await prismaFetchUserData(telegramId);

        return dbUser;
    } catch (error) {
        logger.error(`❌ Failed to get user data for ${telegramId}:`, error);
        return null;
    }
}

/**
 * Get user data with snapshot - tries memory → snapshot → database
 */
export async function getUserDataWithSnapshot(telegramId: string): Promise<FullUserData | null> {
    try {
        const userMemoryManager = requireUserMemoryManager();
        const snapshotRedisManager = requireSnapshotRedisManager();

        // Check memory first
        if (userMemoryManager.isReady()) {
            const memoryUser = userMemoryManager.getUser(telegramId);
            if (memoryUser) {
                logger.debug(`✅ User ${telegramId} retrieved from memory (skipping snapshot)`);
                return memoryUser;
            }
        }

        // Try snapshot for fast initial load
        const snapshotStart = Date.now();
        const snapshotData = await snapshotRedisManager.loadSnapshot(telegramId);

        if (snapshotData) {
            const loadTime = Date.now() - snapshotStart;
            logger.info(`📸 Loaded user ${telegramId} from snapshot in ${loadTime}ms`);
            snapshotMetrics.recordSnapshotHit(loadTime);

            // Store in memory for future O(1) access
            if (userMemoryManager.isReady()) {
                userMemoryManager.setUser(telegramId, snapshotData);
            }

            // ✅ No type assertion needed anymore!
            return snapshotData;
        }

        // Fallback to full DB query
        const queryStart = Date.now();
        const fullUserData = await getUserData(telegramId);
        const queryTime = Date.now() - queryStart;

        snapshotMetrics.recordSnapshotMiss(queryTime);

        // Store in memory if successful
        if (fullUserData && userMemoryManager.isReady()) {
            userMemoryManager.setUser(telegramId, fullUserData);
        }

        // Generate snapshot in background
        if (fullUserData) {
            setTimeout(() => {
                snapshotRedisManager.storeSnapshot(telegramId, fullUserData).catch(err => {
                    logger.error(`Background snapshot generation failed: ${err}`);
                });
            }, 100);
        }

        return fullUserData;
    } catch (error) {
        logger.error(`❌ Failed to get user data with snapshot for ${telegramId}:`, error);
        return null;
    }
}

/**
 * Add farming experience
 */
export async function addFarmingExpMemory(telegramId: string, expToAdd: number): Promise<{
    farmingLevel: number;
    farmingLevelsGained: number;
    farmingExp: number;
    expToNextFarmingLevel: number;
}> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            let farmingExp = user.farmingExp + expToAdd;
            let farmingLevel = user.farmingLevel;
            let farmingLevelsGained = 0;
            let expToNextFarmingLevel = user.expToNextFarmingLevel;

            // Check for level-ups
            while (farmingExp >= expToNextFarmingLevel) {
                farmingExp -= expToNextFarmingLevel;
                farmingLevel++;
                farmingLevelsGained++;
                expToNextFarmingLevel = calculateExpForNextSkillLevel(farmingLevel + 1);
            }

            // Update memory
            await userMemoryManager.updateUserField(telegramId, 'farmingExp', farmingExp);
            await userMemoryManager.updateUserField(telegramId, 'farmingLevel', farmingLevel);
            await userMemoryManager.updateUserField(telegramId, 'expToNextFarmingLevel', expToNextFarmingLevel);

            logger.info(`✅ Added farming exp for user ${telegramId} (MEMORY): +${expToAdd} exp, level ${farmingLevel}`);

            return { farmingLevel, farmingLevelsGained, farmingExp, expToNextFarmingLevel };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`❌ Failed to add farming exp for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
 * Add crafting experience
 */
export async function addCraftingExpMemory(telegramId: string, expToAdd: number): Promise<{
    craftingLevel: number;
    craftingLevelsGained: number;
    craftingExp: number;
    expToNextCraftingLevel: number;
}> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            let craftingExp = user.craftingExp + expToAdd;
            let craftingLevel = user.craftingLevel;
            let craftingLevelsGained = 0;
            let expToNextCraftingLevel = user.expToNextCraftingLevel;

            // Check for level-ups
            while (craftingExp >= expToNextCraftingLevel) {
                craftingExp -= expToNextCraftingLevel;
                craftingLevel++;
                craftingLevelsGained++;
                expToNextCraftingLevel = calculateExpForNextSkillLevel(craftingLevel + 1);
            }

            // Update memory
            await userMemoryManager.updateUserField(telegramId, 'craftingExp', craftingExp);
            await userMemoryManager.updateUserField(telegramId, 'craftingLevel', craftingLevel);
            await userMemoryManager.updateUserField(telegramId, 'expToNextCraftingLevel', expToNextCraftingLevel);

            logger.info(`✅ Added crafting exp for user ${telegramId} (MEMORY): +${expToAdd} exp, level ${craftingLevel}`);

            return { craftingLevel, craftingLevelsGained, craftingExp, expToNextCraftingLevel };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`❌ Failed to add crafting exp for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
* Get user inventory slot info (Memory version)
*/
export async function getUserInventorySlotInfoMemory(telegramId: string): Promise<{
    usedSlots: number;
    maxSlots: number;
}> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            const usedSlots = user.inventory.length;
            const maxSlots = user.maxInventorySlots;

            return { usedSlots, maxSlots };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Error getting inventory slot info for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
* Get user level (Memory version)
*/
export async function getUserLevelMemory(telegramId: string): Promise<number> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            return user.level;
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Error getting user level for ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserFarmingLevelMemory(telegramId: string): Promise<{
    farmingLevel: number;
    farmingExp: number;
    expToNextFarmingLevel: number;
}> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            return {
                farmingLevel: user.farmingLevel,
                farmingExp: user.farmingExp,
                expToNextFarmingLevel: user.expToNextFarmingLevel
            };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`❌ Failed to get farming level for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function getUserCraftingLevelMemory(telegramId: string): Promise<{
    craftingLevel: number;
    craftingExp: number;
    expToNextCraftingLevel: number;
}> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            return {
                craftingLevel: user.craftingLevel,
                craftingExp: user.craftingExp,
                expToNextCraftingLevel: user.expToNextCraftingLevel
            };
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`❌ Failed to get crafting level for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
* Get next inventory order (Memory version)
*/
export async function getNextInventoryOrderMemory(telegramId: string): Promise<number> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.inventory || user.inventory.length === 0) {
                return 0; // Start from 0 if no inventory
            }

            // Find the maximum order value in memory
            const maxOrder = Math.max(...user.inventory.map(inv => inv.order));
            return maxOrder + 1;
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Failed to get next inventory order for user ${telegramId} (MEMORY): ${error}`);
        throw error;
    }
}

/**
 * Check if user can mint slime
 */
export async function canUserMintSlimeMemory(ownerId: string): Promise<boolean> {
    // do not async lock SLIME_OPERATIONS
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (!userMemoryManager.hasUser(ownerId)) {
            logger.error(`❌ User ${ownerId} not found in memory for slime inventory check`);

            // 🔥 FIX: Try to load user data if not in memory
            logger.info(`🔄 Attempting to load user ${ownerId} for slime inventory check`);
            const userData = await getUserDataWithSnapshot(ownerId);
            if (!userData) {
                throw new Error('Failed to load user data for slime inventory check');
            }
            userMemoryManager.setUser(ownerId, userData);
        }

        const user = userMemoryManager.getUser(ownerId)!;

        // Check if slimes array is properly initialized
        if (user.slimes === null || user.slimes === undefined) {
            logger.error(`❌ User ${ownerId} has null/undefined slimes array`);
            throw new Error('User slimes not properly initialized');
        }

        const currentSlimeCount = user.slimes.length;
        const maxSlots = user.maxSlimeInventorySlots ?? MAX_INITIAL_SLIME_INVENTORY_SLOTS;
        const canMint = currentSlimeCount < maxSlots;

        // Debug logging only when there might be an issue
        if (!canMint || currentSlimeCount >= maxSlots - 1) {
            logger.info(`🚨 SLIME INVENTORY CHECK - User ${ownerId}:`);
            logger.info(`   Current slimes: ${currentSlimeCount}/${maxSlots}`);
            logger.info(`   Can mint: ${canMint}`);
        }

        return canMint;
    } catch (error) {
        logger.error(`Failed to check if user can mint slime (MEMORY): ${error}`);
        throw error;
    }
}

export async function incrementUserGold(userId: string, amount: number): Promise<number> {
    const userMemoryManager = requireUserMemoryManager();

    let newBalance;

    // Try memory first
    if (userMemoryManager.hasUser(userId)) {
        const user = userMemoryManager.getUser(userId)!;
        const currentBalance = user.goldBalance || 0;
        newBalance = currentBalance + amount;

        // Ensure balance doesn't go negative
        if (newBalance < 0) {
            throw new Error(`Insufficient gold balance (Balance: ${currentBalance} < ${Math.abs(amount)})`);
        }

        await userMemoryManager.updateUserField(userId, 'goldBalance', newBalance);
        userMemoryManager.markDirty(userId);
    } else {
        throw new Error('User memory manager not available');
    }

    return newBalance;
}

export async function getEquippedByEquipmentTypeMemory(
    telegramId: string,
    equipmentType: EquipmentType
): Promise<EquippedInventory | null> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            // Get the equipped item from memory
            const equipped = user[equipmentType];
            if (equipped && "equipment" in equipped) {
                return equipped as unknown as EquippedInventory;
            }
            return null;
        }

        // Fallback to database version
        return await prismaFetchEquippedByEquipmentType(telegramId, equipmentType);

    } catch (error) {
        console.error(`Error fetching equipped item for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export async function equipEquipmentForUserMemory(
    telegramId: string,
    equipmentInventory: Prisma.InventoryGetPayload<{ include: { equipment: true } }>
): Promise<UserDataEquipped> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!equipmentInventory.equipment) {
                throw new Error(`Equip equipment failed. Input inventory element is not an equipment.`);
            }

            const equipmentType = equipmentInventory.equipment.type;
            const equipField = `${equipmentType}InventoryId` as keyof FullUserData;

            // Check level requirements
            if (equipmentInventory.equipment.requiredLvlCombat > user.level) {
                throw new Error(`User does not meet level requirements`);
            }

            let realInventoryId = equipmentInventory.id;

            // Handle fake IDs - check if we need to map to real ID
            if (equipmentInventory.id < 0) {
                logger.info(`🔍 Equipment has fake ID ${equipmentInventory.id}, checking for real ID mapping`);

                // Check if we have a mapping from previous flush
                const idRemap = userMemoryManager.inventoryIdRemap.get(telegramId);
                if (idRemap && idRemap.has(equipmentInventory.id)) {
                    realInventoryId = idRemap.get(equipmentInventory.id)!;
                    logger.info(`✅ Found mapped real ID: ${equipmentInventory.id} -> ${realInventoryId}`);
                } else {
                    // We need to flush first to get real IDs
                    logger.info(`⚠️ No mapping found for fake ID ${equipmentInventory.id}, flushing inventory first`);

                    if (userMemoryManager.hasPendingChanges(telegramId)) {
                        await userMemoryManager.flushUserInventory(telegramId);

                        // Check mapping again after flush
                        const updatedRemap = userMemoryManager.inventoryIdRemap.get(telegramId);
                        if (updatedRemap && updatedRemap.has(equipmentInventory.id)) {
                            realInventoryId = updatedRemap.get(equipmentInventory.id)!;
                            logger.info(`✅ After flush, mapped: ${equipmentInventory.id} -> ${realInventoryId}`);
                        } else {
                            throw new Error(`Unable to resolve fake inventory ID ${equipmentInventory.id} to real ID`);
                        }
                    } else {
                        // Try the ensureRealId fallback
                        realInventoryId = await ensureRealId(telegramId, equipmentInventory.id, 'inventory');
                    }
                }
            }

            // Verify the real ID exists in user's inventory
            const inventoryItem = user.inventory?.find(inv => inv.id === realInventoryId);
            if (!inventoryItem) {
                throw new Error(`Inventory item with ID ${realInventoryId} not found in user's inventory`);
            }

            // If ID changed, update the equipment inventory object
            if (equipmentInventory.id !== realInventoryId) {
                equipmentInventory.id = realInventoryId;
                logger.info(`✅ Updated equipment inventory to use real ID: ${realInventoryId}`);
            }

            // Update equipment ID in memory
            await userMemoryManager.updateUserField(telegramId, equipField, realInventoryId);
            const typedEquipmentInventory = equipmentInventory as any;

            await userMemoryManager.updateUserField(telegramId, equipmentType as keyof FullUserData, typedEquipmentInventory);

            const result = await recalculateAndUpdateUserStatsMemory(telegramId);

            return result;
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(
            `Failed to equip equipment for user ${telegramId} (MEMORY): ${error}`
        );
        throw error;
    }
}

export async function unequipEquipmentForUserMemory(
    telegramId: string,
    equipmentType: EquipmentType
): Promise<UserDataEquipped | undefined> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            const equipField = `${equipmentType}InventoryId` as keyof FullUserData;

            if (user[equipField] === null) {
                logger.info(`User ${telegramId} already has nothing equipped in the ${equipmentType} slot (MEMORY).`);
                return;
            }

            // Perform the unequip operation in memory
            await userMemoryManager.updateUserField(telegramId, equipField, null);
            await userMemoryManager.updateUserField(telegramId, equipmentType as keyof FullUserData, null);

            logger.info(`User ${telegramId} unequipped equipment of type ${equipmentType} (MEMORY).`);

            // Recalculate stats in memory
            const result = await recalculateAndUpdateUserStatsMemory(telegramId);

            return result;
        }

        throw new Error('User memory manager not available');
    } catch (error) {
        logger.error(`Failed to unequip equipment of type ${equipmentType} for user ${telegramId} (MEMORY): ${error}`);
        throw error;
    }
}

/**
 * Recalculate and update user stats (Memory version)
 */
export async function recalculateAndUpdateUserStatsMemory(
    telegramId: string
): Promise<UserDataEquipped> {
    const userMemoryManager = requireUserMemoryManager();
    try {
        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.combat) throw new Error(`Combat not found for ${telegramId}`);

            logger.info(`Recalculating stats for user ${telegramId} (MEMORY)`);

            // Create fresh combat object based on user base stats
            const userCombat: Combat = {
                ...user.combat,
                hp: user.maxHp,
                maxHp: user.maxHp,
                atkSpd: user.atkSpd,
                acc: user.acc,
                eva: user.eva,
                maxMeleeDmg: user.maxMeleeDmg,
                maxRangedDmg: user.maxRangedDmg,
                maxMagicDmg: user.maxMagicDmg,
                critChance: user.critChance,
                critMultiplier: user.critMultiplier,
                dmgReduction: user.dmgReduction,
                magicDmgReduction: user.magicDmgReduction,
                hpRegenRate: user.hpRegenRate,
                hpRegenAmount: user.hpRegenAmount,
                meleeFactor: 0,
                rangeFactor: 0,
                magicFactor: 0,
                reinforceAir: 0,
                reinforceWater: 0,
                reinforceEarth: 0,
                reinforceFire: 0,
            };

            const statEffects: StatEffect[] = [];

            // Collect equipment stat effects
            const equippedItems = [
                user.hat,
                user.armour,
                user.weapon,
                user.shield,
                user.cape,
                user.necklace,
            ];

            let updatedAttackType = false;

            for (const item of equippedItems) {
                const effect = item?.equipment?.statEffect;
                if (effect) {
                    statEffects.push(effect);
                }

                if (item?.equipment?.attackType && !updatedAttackType) {
                    userCombat.attackType = item.equipment.attackType;
                    updatedAttackType = true;
                }
            }

            if (!updatedAttackType) {
                userCombat.attackType = 'Melee';
            }

            // Add equipped slime dominant traits
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
                    if (trait?.statEffect) statEffects.push(trait.statEffect);
                }
            }

            // Calculate and apply stat deltas
            const delta = calculateNetStatDelta(user, statEffects);
            applyDelta(user, userCombat, delta);

            // Calculate combat power
            const cp = calculateCombatPower(userCombat);
            userCombat.cp = cp;

            // Update user and combat in memory
            await userMemoryManager.updateUserField(telegramId, 'combat', userCombat);

            logger.info(`✅ Stats recalculated for user ${telegramId} (MEMORY)`);

            // Right before the return:
            logger.info(`🔍 RETURN DEBUG - weapon: ${(user.weapon as any)?.equipment?.name || 'null'}`);
            logger.info(`🔍 RETURN DEBUG - weaponInventoryId: ${user.weaponInventoryId}`);

            return {
                ...user,
                combat: userCombat,
            };
        }

        // Fallback to database version
        return await prismaRecalculateAndUpdateUserStats(telegramId);

    } catch (error) {
        logger.error(`❌ Failed to recalculate stats for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

/**
 * Recalculate and update user base stats (Memory version)
 */
export async function recalculateAndUpdateUserBaseStatsMemory(
    telegramId: string
): Promise<UserStatsWithCombat> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            const { str, def, dex, luk, magic, hpLevel } = user;

            const newBaseStats = {
                maxHp: getBaseMaxHpFromHpLvl(hpLevel),
                atkSpd: getBaseAtkSpdFromLuk(luk),
                acc: getBaseAccFromLuk(luk),
                eva: getBaseEvaFromDex(dex),
                maxMeleeDmg: getBaseMaxDmg(str),
                maxRangedDmg: getBaseMaxDmg(dex),
                maxMagicDmg: getBaseMaxDmg(magic),
                critChance: getBaseCritChanceFromLuk(luk),
                critMultiplier: getBaseCritMulFromLuk(luk),
                dmgReduction: getBaseDmgReductionFromDefAndStr(def, str),
                magicDmgReduction: getBaseMagicDmgReductionFromDefAndMagic(def, magic),
                hpRegenRate: getBaseHpRegenRateFromHpLvlAndDef(hpLevel, def),
                hpRegenAmount: getBaseHpRegenAmtFromHpLvlAndDef(hpLevel, def),
                doubleResourceOdds: user.doubleResourceOdds,
                skillIntervalReductionMultiplier: user.skillIntervalReductionMultiplier,
            };

            // Update base stats in memory
            for (const [key, value] of Object.entries(newBaseStats)) {
                await userMemoryManager.updateUserField(telegramId, key as keyof FullUserData, value);
            }

            // Recalculate full stats with equipment/slime bonuses
            const userDataEquipped = await recalculateAndUpdateUserStatsMemory(telegramId);

            logger.info(`✅ Recalculated base stats for user ${telegramId} (MEMORY)`);

            return {
                ...newBaseStats,
                outstandingSkillPoints: user.outstandingSkillPoints,
                hpLevel: user.hpLevel,
                expToNextHpLevel: user.expToNextHpLevel,
                expHp: user.expHp,
                str: user.str,
                def: user.def,
                dex: user.dex,
                luk: user.luk,
                magic: user.magic,
                combat: userDataEquipped.combat
            };
        }

        // Fallback to database version
        return await prismaRecalculateAndUpdateUserBaseStats(telegramId);

    } catch (error) {
        logger.error(`❌ Failed to recalculate base stats for user ${telegramId} (MEMORY):`, error);
        throw error;
    }
}

export function calculateNetStatDelta(user: User, effects: StatEffect[]) {
    const base = {
        maxHp: user.maxHp, atkSpd: user.atkSpd, acc: user.acc, eva: user.eva,
        maxMeleeDmg: user.maxMeleeDmg, maxRangedDmg: user.maxRangedDmg, maxMagicDmg: user.maxMagicDmg,
        critChance: user.critChance, critMultiplier: user.critMultiplier,
        dmgReduction: user.dmgReduction, magicDmgReduction: user.magicDmgReduction,
        hpRegenRate: user.hpRegenRate, hpRegenAmount: user.hpRegenAmount,
    };

    const result = {
        maxHp: 0, atkSpd: 0, acc: 0, eva: 0, maxMeleeDmg: 0, maxRangedDmg: 0, maxMagicDmg: 0,
        critChance: 0, critMultiplier: 0, dmgReduction: 0, magicDmgReduction: 0,
        hpRegenRate: 0, hpRegenAmount: 0, meleeFactor: 0, rangeFactor: 0, magicFactor: 0,
        reinforceAir: 0, reinforceWater: 0, reinforceEarth: 0, reinforceFire: 0,
        doubleResourceOdds: 0, skillIntervalReductionMultiplier: 0,
    };

    const additive = {} as Record<keyof typeof base, number>;
    const multiplicative = {} as Record<keyof typeof base, number[]>;

    // Init base keys
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
        additive[key] = 0;
        multiplicative[key] = [];
    }

    const apply = (mod: number | null | undefined, effect: 'add' | 'mul' | null | undefined, key: keyof typeof base) => {
        if (mod == null || effect == null) return;
        if (effect === 'add') additive[key] += mod;
        else multiplicative[key].push(mod); // expects full multiplier value like 0.9 or 1.1
    };

    for (const e of effects) {
        apply(e.maxHpMod, e.maxHpEffect, 'maxHp');
        apply(e.atkSpdMod, e.atkSpdEffect, 'atkSpd');
        apply(e.accMod, e.accEffect, 'acc');
        apply(e.evaMod, e.evaEffect, 'eva');
        apply(e.maxMeleeDmgMod, e.maxMeleeDmgEffect, 'maxMeleeDmg');
        apply(e.maxRangedDmgMod, e.maxRangedDmgEffect, 'maxRangedDmg');
        apply(e.maxMagicDmgMod, e.maxMagicDmgEffect, 'maxMagicDmg');
        apply(e.critChanceMod, e.critChanceEffect, 'critChance');
        apply(e.critMultiplierMod, e.critMultiplierEffect, 'critMultiplier');
        apply(e.dmgReductionMod, e.dmgReductionEffect, 'dmgReduction');
        apply(e.magicDmgReductionMod, e.magicDmgReductionEffect, 'magicDmgReduction');
        apply(e.hpRegenRateMod, e.hpRegenRateEffect, 'hpRegenRate');
        apply(e.hpRegenAmountMod, e.hpRegenAmountEffect, 'hpRegenAmount');

        // Simple additive values
        result.meleeFactor += e.meleeFactor ?? 0;
        result.rangeFactor += e.rangeFactor ?? 0;
        result.magicFactor += e.magicFactor ?? 0;
        result.reinforceAir += e.reinforceAir ?? 0;
        result.reinforceWater += e.reinforceWater ?? 0;
        result.reinforceEarth += e.reinforceEarth ?? 0;
        result.reinforceFire += e.reinforceFire ?? 0;

        result.doubleResourceOdds += e.doubleResourceOddsMod ?? 0;
        result.skillIntervalReductionMultiplier += e.skillIntervalReductionMultiplierMod ?? 0;
    }

    // Apply all stats with additive then multiplicative chaining
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
        const baseVal = base[key];
        const add = additive[key];
        const mulChain = multiplicative[key].reduce((acc, val) => acc * val, 1);
        result[key] = (baseVal + add) * mulChain - baseVal;
    }

    return result;
}

export function applyDelta(user: User, combat: Combat, delta: ReturnType<typeof calculateNetStatDelta>) {
    user.doubleResourceOdds += delta.doubleResourceOdds;
    user.skillIntervalReductionMultiplier += delta.skillIntervalReductionMultiplier;

    combat.maxHp = Math.round(combat.maxHp + delta.maxHp);

    if (combat.hp > combat.maxHp) {
        combat.hp = combat.maxHp;
        logger.debug(`⚕️ Capped HP to new maxHP for user: ${combat.hp}/${combat.maxHp}`);
    }

    combat.atkSpd = Math.round(combat.atkSpd + delta.atkSpd);
    combat.acc = Math.round(combat.acc + delta.acc);
    combat.eva = Math.round(combat.eva + delta.eva);
    combat.maxMeleeDmg = Math.round(combat.maxMeleeDmg + delta.maxMeleeDmg);
    combat.maxRangedDmg = Math.round(combat.maxRangedDmg + delta.maxRangedDmg);
    combat.maxMagicDmg = Math.round(combat.maxMagicDmg + delta.maxMagicDmg);
    combat.critChance += delta.critChance;
    const bonusCrit = Math.max(combat.critMultiplier - 1, 0.29);
    combat.critMultiplier = 1 + bonusCrit * (1 + delta.critMultiplier);
    combat.dmgReduction = Math.round(combat.dmgReduction + delta.dmgReduction);
    combat.magicDmgReduction = Math.round(combat.magicDmgReduction + delta.magicDmgReduction);
    combat.hpRegenRate += delta.hpRegenRate;
    combat.hpRegenAmount = Math.round(combat.hpRegenAmount + delta.hpRegenAmount);
    combat.meleeFactor = Math.round(combat.meleeFactor + delta.meleeFactor);
    combat.rangeFactor = Math.round(combat.rangeFactor + delta.rangeFactor);
    combat.magicFactor = Math.round(combat.magicFactor + delta.magicFactor);
    combat.reinforceAir = Math.round(combat.reinforceAir + delta.reinforceAir);
    combat.reinforceWater = Math.round(combat.reinforceWater + delta.reinforceWater);
    combat.reinforceEarth = Math.round(combat.reinforceEarth + delta.reinforceEarth);
    combat.reinforceFire = Math.round(combat.reinforceFire + delta.reinforceFire);
}

export async function ensureRealId(
    userId: string,
    entityId: number,
    entityType: 'slime' | 'inventory'
): Promise<number> {
    const userMemoryManager = requireUserMemoryManager();

    // If already a real ID, return as-is
    if (entityId > 0) return entityId;

    // Handle temporary IDs
    if (entityType === 'slime') {
        return entityId;
    } else if (entityType === 'inventory') {
        // Check if already mapped
        const existingMap = userMemoryManager.inventoryIdRemap.get(userId)?.get(entityId);
        if (existingMap) return existingMap;

        // Flush and get real ID
        await userMemoryManager.flushUserInventory(userId);
        const newMap = userMemoryManager.inventoryIdRemap.get(userId)?.get(entityId);

        if (!newMap) {
            throw new Error(`Failed to get real ID for temporary inventory ${entityId}`);
        }

        return newMap;
    }

    throw new Error(`Unknown entity type: ${entityType}`);
}