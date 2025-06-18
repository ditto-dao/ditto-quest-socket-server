import { FullUserData, getNextInventoryOrder } from "../../sql-services/user-service";
import { getItemById } from "../../sql-services/item-service";
import { getEquipmentById } from "../../sql-services/equipment-service";
import { logger } from "../../utils/logger";
import { ProgressUpdate } from "./idle-manager-types";
import { ABILITY_POINTS_PER_LEVEL } from "../../utils/config";

let tempIdCounter = -1; // Global counter for temporary IDs

// Extended type for temporary inventory items
interface TemporaryInventoryItem {
    id: number;
    itemId: number | null;
    equipmentId: number | null;
    quantity: number;
    order: number;
    createdAt: Date;
    item: any;
    equipment: any;
    isTemporary: boolean;
}

export async function applyProgressUpdatesToUser(user: FullUserData, progressUpdates: ProgressUpdate[]): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
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

    // Apply farming exp and levels
    if (update.farmingExpGained) {
        user.farmingExp += update.farmingExpGained;
    }

    if (update.farmingLevelsGained) {
        user.farmingLevel += update.farmingLevelsGained;
    }

    // Add items to inventory
    if (update.items) {
        for (const item of update.items) {
            const wasAdded = await addItemToInventory(user, item.itemId, item.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'item', id: item.itemId });
            }
        }
    }

    return addedItems;
}

async function applyCraftingUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    const addedItems: { type: 'item' | 'equipment'; id: number }[] = [];

    // Apply crafting exp and levels
    if (update.craftingExpGained) {
        user.craftingExp += update.craftingExpGained;
    }

    if (update.craftingLevelsGained) {
        user.craftingLevel += update.craftingLevelsGained;
    }

    // Add equipment to inventory
    if (update.equipment) {
        for (const equipment of update.equipment) {
            const wasAdded = await addEquipmentToInventory(user, equipment.equipmentId, equipment.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'equipment', id: equipment.equipmentId });
            }
        }
    }

    // Add items to inventory (crafting can consume/produce items)
    if (update.items) {
        for (const item of update.items) {
            const wasAdded = await addItemToInventory(user, item.itemId, item.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'item', id: item.itemId });
            }
        }
    }

    return addedItems;
}

async function applyBreedingUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    // Add new slimes
    if (update.slimes) {
        for (const slime of update.slimes) {
            user.slimes = user.slimes || [];
            user.slimes.push(slime);
        }
    }

    return []; // Breeding doesn't add inventory items
}

async function applyCombatUpdate(user: FullUserData, update: any): Promise<{ type: 'item' | 'equipment'; id: number }[]> {
    const addedItems: { type: 'item' | 'equipment'; id: number }[] = [];

    // Apply combat exp and levels
    if (update.expGained) {
        user.exp += update.expGained;
    }

    if (update.levelsGained) {
        user.level += update.levelsGained;
        user.outstandingSkillPoints += update.levelsGained * ABILITY_POINTS_PER_LEVEL
    }

    // Apply HP exp and levels
    if (update.hpExpGained) {
        user.expHp += update.hpExpGained;
    }

    if (update.hpLevelsGained) {
        user.hpLevel += update.hpLevelsGained;
    }

    // Apply gold
    if (update.goldGained) {
        user.goldBalance += update.goldGained;
    }

    // Add items to inventory
    if (update.items) {
        for (const item of update.items) {
            const wasAdded = await addItemToInventory(user, item.itemId, item.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'item', id: item.itemId });
            }
        }
    }

    // Add equipment to inventory
    if (update.equipment) {
        for (const equipment of update.equipment) {
            const wasAdded = await addEquipmentToInventory(user, equipment.equipmentId, equipment.quantity);
            if (wasAdded) {
                addedItems.push({ type: 'equipment', id: equipment.equipmentId });
            }
        }
    }

    // Handle user death (restore HP to full or whatever the logic is)
    if (update.userDied && user.combat) {
        user.combat.hp = user.maxHp; // Restore to full HP after death
    }

    return addedItems;
}

async function addItemToInventory(user: FullUserData, itemId: number, quantity: number): Promise<boolean> {
    const existingItem = user.inventory.find(inv => inv.itemId === itemId && inv.equipmentId === null);

    if (existingItem) {
        // Just increment quantity if item already exists
        existingItem.quantity += quantity;
        return false; // Not a new item
    } else {
        // For new items, use the proper service function
        try {
            const item = await getItemById(itemId);

            if (!item) {
                logger.error(`Item ${itemId} not found when adding to inventory in memory`);
                return false;
            }

            const newInventoryItem: TemporaryInventoryItem = {
                id: tempIdCounter--, // Use negative counter to avoid conflicts with real DB IDs
                itemId: itemId,
                equipmentId: null,
                quantity: quantity,
                order: await getNextInventoryOrder(user.telegramId),
                createdAt: new Date(),
                item: item,
                equipment: null,
                isTemporary: true // Flag for frontend logic
            };
            user.inventory.push(newInventoryItem as any);
            return true; // New item added
        } catch (error) {
            logger.error(`Error fetching item ${itemId} for in-memory inventory update: ${error}`);
            return false;
        }
    }
}

async function addEquipmentToInventory(user: FullUserData, equipmentId: number, quantity: number): Promise<boolean> {
    const existingEquipment = user.inventory.find(inv => inv.equipmentId === equipmentId && inv.itemId === null);

    if (existingEquipment) {
        // Just increment quantity if equipment already exists
        existingEquipment.quantity += quantity;
        return false; // Not new equipment
    } else {
        // For new equipment, use the proper service function
        try {
            const equipment = await getEquipmentById(equipmentId);

            if (!equipment) {
                logger.error(`Equipment ${equipmentId} not found when adding to inventory in memory`);
                return false;
            }

            const newInventoryItem: TemporaryInventoryItem = {
                id: tempIdCounter--, // Use negative counter to avoid conflicts with real DB IDs
                itemId: null,
                equipmentId: equipmentId,
                quantity: quantity,
                order: await getNextInventoryOrder(user.telegramId),
                createdAt: new Date(),
                item: null,
                equipment: equipment,
                isTemporary: true // Flag for frontend logic
            };
            user.inventory.push(newInventoryItem as any);
            return true; // New equipment added
        } catch (error) {
            logger.error(`Error fetching equipment ${equipmentId} for in-memory inventory update: ${error}`);
            return false;
        }
    }
}