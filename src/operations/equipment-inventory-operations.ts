import { logger } from '../utils/logger';
import { prismaDoesUserOwnEquipments, prismaMintEquipmentToUser, prismaDeleteEquipmentFromUserInventory, prismaCanUserMintEquipment, prismaFetchEquipmentOrItemFromInventory } from '../sql-services/equipment-inventory-service';
import { UserInventoryItem } from '../managers/memory/user-memory-manager';
import { Prisma } from '@prisma/client';
import { getNextInventoryOrderMemory } from './user-operations';
import { getEquipmentById } from './equipment-operations';
import { requireUserMemoryManager } from '../managers/global-managers/global-managers';

export async function doesUserOwnEquipments(
    telegramId: string,
    equipmentIds: number[],
    quantities: number[]
): Promise<boolean> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Validation
        if (equipmentIds.length !== quantities.length) {
            throw new Error("Equipment IDs and quantities arrays must have the same length.");
        }

        if (equipmentIds.length === 0) {
            logger.info(`No equipment IDs provided to check ownership for user ${telegramId}.`);
            return true;
        }

        // Try memory first
        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.inventory) return false;

            // Create equipment quantity map for checking duplicates
            const equipmentQuantityMap = new Map<number, number>();
            equipmentIds.forEach((id, index) => {
                const requiredQuantity = quantities[index];
                equipmentQuantityMap.set(id, (equipmentQuantityMap.get(id) || 0) + requiredQuantity);
            });

            // Check if user owns all equipment with required quantities
            const ownsAll = Array.from(equipmentQuantityMap.entries()).every(([equipmentId, requiredQuantity]) => {
                const inventoryItem = user.inventory!.find(inv =>
                    inv.equipmentId === equipmentId &&
                    inv.itemId === null
                );
                const userQuantity = inventoryItem?.quantity || 0;
                return userQuantity >= requiredQuantity;
            });

            logger.debug(`🔍 Checked equipment ownership for user ${telegramId} in memory: ${ownsAll}`);
            return ownsAll;
        }

        // Fallback to database
        return await prismaDoesUserOwnEquipments(telegramId, equipmentIds, quantities);
    } catch (error) {
        logger.error(`Error checking if user ${telegramId} owns equipment with required quantities: ${error}`);
        throw error;
    }
}

export async function canUserMintEquipment(
    telegramId: string,
    equipmentId: number
): Promise<boolean> {
    try {
        // Try memory first
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.inventory) return true;

            // Check if equipment already exists (stacking allowed)
            const existingItem = userMemoryManager.findInventoryByEquipmentId(telegramId, equipmentId);
            if (existingItem) return true; // Already owned = no new slot needed

            // Check free slots using actual user data
            const usedSlots = user.inventory.length;
            const maxSlots = user.maxInventorySlots;

            return usedSlots < maxSlots;
        }

        // Fallback to database
        return await prismaCanUserMintEquipment(telegramId, equipmentId);
    } catch (error) {
        logger.error(`Error checking if user can mint equipment: ${error}`);
        throw error;
    }
}

type PrismaEquipmentWithStatEffect = Prisma.InventoryGetPayload<{ include: { equipment: { include: { statEffect: true } } } }>;
type PrismaEquipmentInventory = Prisma.InventoryGetPayload<{ include: { equipment: true } }>;

export async function mintEquipmentToUser(
    telegramId: string,
    equipmentId: number,
    quantity: number = 1
): Promise<PrismaEquipmentWithStatEffect> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const existingItem = userMemoryManager.findInventoryByEquipmentId(telegramId, equipmentId);

            // ✅ DEBUG: Log what we found
            logger.info(`🔍 DEBUG: Looking for equipment ${equipmentId} for user ${telegramId}, found: ${existingItem ? `ID ${existingItem.id} with qty ${existingItem.quantity}` : 'NONE'}`);

            if (existingItem) {
                // Update existing item quantity
                const newQuantity = existingItem.quantity + quantity;
                const updateSuccess = userMemoryManager.updateInventoryQuantity(telegramId, existingItem.id, newQuantity);

                if (!updateSuccess) {
                    logger.error(`❌ Failed to update equipment ${equipmentId} quantity for user ${telegramId}`);
                    throw new Error(`Equipment quantity update failed`);
                }

                logger.info(`📦 Updated equipment ${equipmentId} quantity for user ${telegramId} in memory (${existingItem.quantity} -> ${newQuantity})`);

                return {
                    id: existingItem.id,
                    itemId: existingItem.itemId,
                    equipmentId: existingItem.equipmentId,
                    quantity: newQuantity,
                    order: existingItem.order,
                    createdAt: existingItem.createdAt,
                    equipment: existingItem.equipment
                } as PrismaEquipmentWithStatEffect;
            } else {
                const uniqueId = -(Date.now() * 1000 + Math.floor(Math.random() * 10000) + equipmentId);

                // Create new inventory item with temporary ID
                const newInventoryItem: UserInventoryItem = {
                    id: uniqueId,
                    itemId: null,
                    equipmentId: equipmentId,
                    quantity: quantity,
                    order: await getNextInventoryOrderMemory(telegramId),
                    createdAt: new Date(),
                    equipment: await getEquipmentById(equipmentId),
                    item: null
                };

                userMemoryManager.appendInventory(telegramId, newInventoryItem);

                logger.info(`📦 Added new equipment ${equipmentId} (qty: ${quantity}) to user ${telegramId} in memory with temp ID ${uniqueId}`);

                return {
                    id: newInventoryItem.id,
                    itemId: newInventoryItem.itemId,
                    equipmentId: newInventoryItem.equipmentId,
                    quantity: newInventoryItem.quantity,
                    order: newInventoryItem.order,
                    createdAt: newInventoryItem.createdAt,
                    equipment: newInventoryItem.equipment
                } as PrismaEquipmentWithStatEffect;
            }
        }

        // Fallback to database
        return await prismaMintEquipmentToUser(telegramId, equipmentId, quantity);
    } catch (error) {
        logger.error(`Error minting equipment to user: ${error}`);
        throw error;
    }
}

export async function deleteEquipmentFromUserInventory(
    telegramId: string,
    equipmentIds: number[],
    quantitiesToRemove: number[]
): Promise<PrismaEquipmentInventory[]> {
    try {
        // Validate input lengths
        if (equipmentIds.length !== quantitiesToRemove.length) {
            throw new Error("Equipment IDs and quantities arrays must have the same length.");
        }

        // Try memory first
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            const updatedInventories: PrismaEquipmentInventory[] = [];

            for (let i = 0; i < equipmentIds.length; i++) {
                const equipmentId = equipmentIds[i];
                const quantityToRemove = quantitiesToRemove[i];

                const existingItem = userMemoryManager.findInventoryByEquipmentId(telegramId, equipmentId);

                if (!existingItem) {
                    logger.warn(`Equipment ${equipmentId} not found for user ${telegramId}`);
                    continue;
                }

                if (existingItem.quantity > quantityToRemove) {
                    // Reduce quantity
                    const newQuantity = existingItem.quantity - quantityToRemove;
                    userMemoryManager.updateInventoryQuantity(telegramId, existingItem.id, newQuantity);

                    updatedInventories.push({
                        id: existingItem.id,
                        itemId: existingItem.itemId,
                        equipmentId: existingItem.equipmentId,
                        quantity: newQuantity,
                        order: existingItem.order,
                        createdAt: existingItem.createdAt,
                        equipment: existingItem.equipment
                    } as PrismaEquipmentInventory);
                } else {
                    // Remove completely
                    userMemoryManager.removeInventory(telegramId, existingItem.id);

                    updatedInventories.push({
                        id: existingItem.id,
                        itemId: existingItem.itemId,
                        equipmentId: existingItem.equipmentId,
                        quantity: 0,
                        order: existingItem.order,
                        createdAt: existingItem.createdAt,
                        equipment: existingItem.equipment
                    } as PrismaEquipmentInventory);
                }
            }

            logger.info(`🗑️ Removed equipment from user ${telegramId} inventory in memory`);
            return updatedInventories;
        }

        // Fallback to database
        return await prismaDeleteEquipmentFromUserInventory(telegramId, equipmentIds, quantitiesToRemove);
    } catch (error) {
        logger.error(`Error deleting equipment from user inventory: ${error}`);
        throw error;
    }
}

export type PrismaInventoryWithEquipment = Prisma.InventoryGetPayload<{ include: { equipment: true } }>;

export async function getEquipmentOrItemFromInventory(
    telegramId: string,
    inventoryId: number
): Promise<PrismaInventoryWithEquipment | undefined> {
    try {
        // Try memory first
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (user.inventory) {
                // Handle temporary IDs for newly created items that haven't been synced to DB yet
                let actualInventoryId = inventoryId;

                // Check if this is a temporary ID (negative) that has been remapped
                if (inventoryId < 0) {
                    const remap = userMemoryManager.inventoryIdRemap.get(telegramId);
                    if (remap && remap.has(inventoryId)) {
                        actualInventoryId = remap.get(inventoryId)!;
                        logger.debug(`📦 Remapped temporary inventory ID ${inventoryId} to real ID ${actualInventoryId} for user ${telegramId}`);
                    }
                }

                // Find the inventory item in memory (check both original and remapped IDs)
                const inventoryItem = user.inventory.find(inv =>
                    inv.id === inventoryId || inv.id === actualInventoryId
                );

                if (inventoryItem) {
                    // Verify it has equipment (not an item)
                    if (!inventoryItem.equipment) {
                        throw new Error(`Inventory object with ID ${inventoryId} is not an equipment`);
                    }

                    logger.debug(`📦 Retrieved inventory item ${inventoryId} from memory for user ${telegramId}`);

                    // Cast to match Prisma return type
                    return {
                        id: inventoryItem.id,
                        userId: telegramId,
                        itemId: inventoryItem.itemId,
                        equipmentId: inventoryItem.equipmentId,
                        quantity: inventoryItem.quantity,
                        order: inventoryItem.order,
                        createdAt: inventoryItem.createdAt,
                        equipment: inventoryItem.equipment
                    } as PrismaInventoryWithEquipment;
                }

                // If not found in memory and it's a temporary ID, it might not exist yet
                if (inventoryId < 0) {
                    throw new Error(`Temporary inventory ID ${inventoryId} not found in memory for user ${telegramId}`);
                }
            }
        }

        // Fallback to database
        logger.debug(`📦 Falling back to database for inventory item ${inventoryId} for user ${telegramId}`);
        return await prismaFetchEquipmentOrItemFromInventory(telegramId, inventoryId);

    } catch (error) {
        logger.error(`❌ Error fetching inventory item ${inventoryId} for user ${telegramId}: ${error}`);
        throw error;
    }
}