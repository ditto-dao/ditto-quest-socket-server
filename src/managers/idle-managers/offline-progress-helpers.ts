import { FullUserData } from "../../sql-services/user-service";
import { logger } from "../../utils/logger";
import { ProgressUpdate } from "./idle-manager-types";
import { ABILITY_POINTS_PER_LEVEL } from "../../utils/config";
import { addFarmingExpMemory, addCraftingExpMemory } from "../../operations/user-operations";
import { incrementExpAndHpExpAndCheckLevelUpMemory } from "../../operations/combat-operations";
import { mintItemToUser } from "../../operations/item-inventory-operations";
import { mintEquipmentToUser } from "../../operations/equipment-inventory-operations";
import { requireUserMemoryManager } from "../global-managers/global-managers";

export async function applyProgressUpdatesToUser(
    user: FullUserData,
    progressUpdates: ProgressUpdate[]
): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    const addedItems: { type: 'item' | 'equipment'; id: number }[] = [];

    for (const update of progressUpdates) {
        switch (update.type) {
            case 'farming':
                addedItems.push(...await applyFarmingUpdate(user, update.update));
                break;
            case 'crafting':
                addedItems.push(...await applyCraftingUpdate(user, update.update));
                break;
            case 'breeding':
                addedItems.push(...await applyBreedingUpdate(user, update.update));
                break;
            case 'combat':
                addedItems.push(...await applyCombatUpdate(user, update.update));
                break;
        }
    }

    return addedItems;
}

async function applyFarmingUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    const addedItems: { type: 'item' | 'equipment'; id: number }[] = [];

    // Apply farming exp and levels using memory function
    if (update.farmingExpGained) {
        try {
            const farmingResult = await addFarmingExpMemory(user.telegramId, update.farmingExpGained);

            // Update the user object with the results
            user.farmingExp = farmingResult.farmingExp;
            user.farmingLevel = farmingResult.farmingLevel;
            user.expToNextFarmingLevel = farmingResult.expToNextFarmingLevel;

            logger.debug(`📈 Applied farming exp: ${update.farmingExpGained} (levels gained: ${farmingResult.farmingLevelsGained})`);
        } catch (error) {
            logger.error(`❌ Failed to apply farming exp update: ${error}`);
            // Fallback to direct field updates
            user.farmingExp += update.farmingExpGained;
            if (update.farmingLevelsGained) {
                user.farmingLevel += update.farmingLevelsGained;
            }
        }
    }

    // Add items to inventory using memory functions
    if (update.items) {
        for (const item of update.items) {
            const wasAdded = await addItemToInventoryMemory(user, item.itemId, item.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'item', id: item.itemId });
            }
        }
    }

    return addedItems;
}

async function applyCraftingUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    const addedItems: { type: 'item' | 'equipment'; id: number }[] = [];

    // Apply crafting exp and levels using memory function
    if (update.craftingExpGained) {
        try {
            const craftingResult = await addCraftingExpMemory(user.telegramId, update.craftingExpGained);

            // Update the user object with the results
            user.craftingExp = craftingResult.craftingExp;
            user.craftingLevel = craftingResult.craftingLevel;
            user.expToNextCraftingLevel = craftingResult.expToNextCraftingLevel;

            logger.debug(`🔨 Applied crafting exp: ${update.craftingExpGained} (levels gained: ${craftingResult.craftingLevelsGained})`);
        } catch (error) {
            logger.error(`❌ Failed to apply crafting exp update: ${error}`);
            // Fallback to direct field updates
            user.craftingExp += update.craftingExpGained;
            if (update.craftingLevelsGained) {
                user.craftingLevel += update.craftingLevelsGained;
            }
        }
    }

    // Add equipment to inventory using memory functions
    if (update.equipment) {
        for (const equipment of update.equipment) {
            const wasAdded = await addEquipmentToInventoryMemory(user, equipment.equipmentId, equipment.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'equipment', id: equipment.equipmentId });
            }
        }
    }

    // Add items to inventory (crafting can consume/produce items)
    if (update.items) {
        for (const item of update.items) {
            const wasAdded = await addItemToInventoryMemory(user, item.itemId, item.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'item', id: item.itemId });
            }
        }
    }

    return addedItems;
}

async function applyBreedingUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    // Add new slimes using memory manager
    if (update.slimes) {
        for (const slime of update.slimes) {
            const userMemoryManager = requireUserMemoryManager();

            if (userMemoryManager.hasUser(user.telegramId)) {
                userMemoryManager.appendSlime(user.telegramId, slime);
                logger.debug(`🧪 Added slime ${slime.id} to memory for user ${user.telegramId}`);
            } else {
                // Fallback: add directly to user object
                user.slimes = user.slimes || [];
                user.slimes.push(slime);
            }
        }
    }

    return []; // Breeding doesn't add inventory items
}

async function applyCombatUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    const addedItems: { type: 'item' | 'equipment'; id: number }[] = [];

    // Apply combat exp and levels using the existing memory function
    if (update.expGained) {
        try {
            const combatResult = await incrementExpAndHpExpAndCheckLevelUpMemory(user.telegramId, update.expGained);

            // Update the user object with the results
            user.exp = combatResult.exp;
            user.level = combatResult.level;
            user.expToNextLevel = combatResult.expToNextLevel;
            user.outstandingSkillPoints = combatResult.outstandingSkillPoints;
            user.hpLevel = combatResult.hpLevel;
            user.expHp = combatResult.hpExp;
            user.expToNextHpLevel = combatResult.expToNextHpLevel;

            logger.debug(`⚔️ Applied combat exp: ${update.expGained} (level up: ${combatResult.levelUp}, HP level up: ${combatResult.hpLevelUp})`);
        } catch (error) {
            logger.error(`❌ Failed to apply combat exp update: ${error}`);
            // Fallback to direct field updates
            if (update.expGained) user.exp += update.expGained;
            if (update.levelsGained) {
                user.level += update.levelsGained;
                user.outstandingSkillPoints += update.levelsGained * ABILITY_POINTS_PER_LEVEL;
            }
            if (update.hpExpGained) user.expHp += update.hpExpGained;
            if (update.hpLevelsGained) user.hpLevel += update.hpLevelsGained;
        }
    }

    const userMemoryManager = requireUserMemoryManager();

    // Apply gold using memory manager
    if (update.goldGained) {
        if (userMemoryManager.hasUser(user.telegramId)) {
            userMemoryManager.updateUserField(user.telegramId, 'goldBalance', user.goldBalance + update.goldGained);
            user.goldBalance += update.goldGained;
        } else {
            // Fallback: direct field update
            user.goldBalance += update.goldGained;
        }
    }

    // Add items to inventory using memory functions
    if (update.items) {
        for (const item of update.items) {
            const wasAdded = await addItemToInventoryMemory(user, item.itemId, item.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'item', id: item.itemId });
            }
        }
    }

    // Add equipment to inventory using memory functions
    if (update.equipment) {
        for (const equipment of update.equipment) {
            const wasAdded = await addEquipmentToInventoryMemory(user, equipment.equipmentId, equipment.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'equipment', id: equipment.equipmentId });
            }
        }
    }

    // Handle user death using memory manager
    if (update.userDied && user.combat) {
        if (userMemoryManager.hasUser(user.telegramId)) {
            userMemoryManager.updateUserCombatField(user.telegramId, 'hp', user.maxHp);
            user.combat.hp = user.maxHp;
        } else {
            user.combat.hp = user.maxHp;
        }
    }

    return addedItems;
}

async function addItemToInventoryMemory(user: FullUserData, itemId: number, quantity: number): Promise<boolean> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        const existingItem = userMemoryManager.findInventoryByItemId(user.telegramId, itemId);
        const wasNewItem = !existingItem;

        await mintItemToUser(user.telegramId, itemId, quantity);

        return wasNewItem;
    } catch (error) {
        logger.error(`Error adding item ${itemId} to inventory: ${error}`);
        return false;
    }
}

async function addEquipmentToInventoryMemory(user: FullUserData, equipmentId: number, quantity: number): Promise<boolean> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        const existingEquipment = userMemoryManager.findInventoryByEquipmentId(user.telegramId, equipmentId);
        const wasNewEquipment = !existingEquipment;

        await mintEquipmentToUser(user.telegramId, equipmentId, quantity);

        return wasNewEquipment;
    } catch (error) {
        logger.error(`Error adding equipment ${equipmentId} to inventory: ${error}`);
        return false;
    }
}