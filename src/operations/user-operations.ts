import { logger } from '../utils/logger';
import { EquippedInventory, FullUserData, prismaFetchEquippedByEquipmentType, prismaFetchUserData, UserDataEquipped } from '../sql-services/user-service';
import { snapshotMetrics } from '../workers/snapshot/snapshot-metrics';
import { EquipmentType, Prisma, UserEfficiencyStats } from '@prisma/client';
import { MAX_INITIAL_SLIME_INVENTORY_SLOTS } from '../utils/config';
import { requireSnapshotRedisManager, requireUserEfficiencyStatsMemoryManager, requireUserMemoryManager } from '../managers/global-managers/global-managers';
import { calculateExpForNextSkillLevel } from '../utils/helpers';
import { recalculateAndUpdateUserEfficiencyStatsMemory, recalculateAndUpdateUserStatsMemory } from './user-stats-operations';

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
): Promise<{ user: UserDataEquipped, efficiency: UserEfficiencyStats }> {
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

            const userCombat = await recalculateAndUpdateUserStatsMemory(telegramId);
            const efficiency = await recalculateAndUpdateUserEfficiencyStatsMemory(telegramId);

            return { user: userCombat, efficiency };
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
): Promise<{ user: UserDataEquipped, efficiency: UserEfficiencyStats }> {

    try {
        const userMemoryManager = requireUserMemoryManager();
        const userEfficiencyStatsManager = requireUserEfficiencyStatsMemoryManager();

        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            const equipField = `${equipmentType}InventoryId` as keyof FullUserData;

            if (user[equipField] === null) {
                logger.info(`User ${telegramId} already has nothing equipped in the ${equipmentType} slot (MEMORY).`);
                return { user, efficiency: await userEfficiencyStatsManager.loadEfficiencyStats(telegramId) }
            }

            // Perform the unequip operation in memory
            await userMemoryManager.updateUserField(telegramId, equipField, null);
            await userMemoryManager.updateUserField(telegramId, equipmentType as keyof FullUserData, null);

            logger.info(`User ${telegramId} unequipped equipment of type ${equipmentType} (MEMORY).`);

            // Recalculate stats in memory
            const resultUser = await recalculateAndUpdateUserStatsMemory(telegramId);
            const resultEfficiency = await recalculateAndUpdateUserEfficiencyStatsMemory(telegramId);

            return { user: resultUser, efficiency: resultEfficiency };
        }

        throw new Error('User memory manager not available');
    } catch (error) {
        logger.error(`Failed to unequip equipment of type ${equipmentType} for user ${telegramId} (MEMORY): ${error}`);
        throw error;
    }
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