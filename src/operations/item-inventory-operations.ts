import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import {
    prismaDoesUserOwnItems,
    prismaMintItemToUser,
    prismaDeleteItemsFromUserInventory,
    prismaCanUserMintItem,
} from '../sql-services/item-inventory-service';
import { UserInventoryItem } from '../managers/memory/user-memory-manager';
import { getNextInventoryOrderMemory } from './user-operations';
import { getItemById } from './item-operations';
import { requireSnapshotRedisManager, requireUserMemoryManager } from '../managers/global-managers/global-managers';

// Define proper return types to match Prisma functions
type PrismaItemWithStatEffect = Prisma.InventoryGetPayload<{ include: { item: { include: { statEffect: true } } } }>;
type PrismaItemInventory = Prisma.InventoryGetPayload<{ include: { item: true } }>;

export async function doesUserOwnItems(
    telegramId: string,
    itemIds: number[],
    quantities: number[]
): Promise<boolean> {
    try {
        // Validation
        if (itemIds.length !== quantities.length) {
            throw new Error("Item IDs and quantities arrays must have the same length.");
        }

        if (itemIds.length === 0) {
            logger.info(`No items to check for user ${telegramId}.`);
            return true;
        }

        // Try memory first
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.inventory) return false;

            // Create item quantity map for checking duplicates
            const itemQuantityMap = new Map<number, number>();
            itemIds.forEach((id, index) => {
                const requiredQuantity = quantities[index];
                itemQuantityMap.set(id, (itemQuantityMap.get(id) || 0) + requiredQuantity);
            });

            // Check if user owns all items with required quantities
            const ownsAll = Array.from(itemQuantityMap.entries()).every(([itemId, requiredQuantity]) => {
                const inventoryItem = user.inventory!.find(inv =>
                    inv.itemId === itemId &&
                    inv.equipmentId === null
                );
                const userQuantity = inventoryItem?.quantity || 0;
                return userQuantity >= requiredQuantity;
            });

            logger.debug(`🔍 Checked item ownership for user ${telegramId} in memory: ${ownsAll}`);
            return ownsAll;
        }

        // Fallback to database
        return await prismaDoesUserOwnItems(telegramId, itemIds, quantities);
    } catch (error) {
        logger.error(`Error checking if user ${telegramId} owns items with required quantities: ${error}`);
        throw error;
    }
}

export async function mintItemToUser(
    telegramId: string,
    itemId: number,
    quantity: number = 1
): Promise<PrismaItemWithStatEffect> {
    try {
        // Try memory first
        const userMemoryManager = requireUserMemoryManager();
        const snapshotRedisManager = requireSnapshotRedisManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.inventory) user.inventory = [];

            // Check if item already exists
            const existingItem = userMemoryManager.findInventoryByItemId(telegramId, itemId);

            if (existingItem) {
                // Update existing quantity
                const newQuantity = existingItem.quantity + quantity;
                userMemoryManager.updateInventoryQuantity(telegramId, existingItem.id, newQuantity);

                if (snapshotRedisManager) await snapshotRedisManager.markSnapshotStale(telegramId, 'stale_session', 15);

                logger.info(`📦 Updated item ${itemId} quantity for user ${telegramId} in memory`);

                // Cast to match Prisma return type
                return {
                    id: existingItem.id,
                    itemId: existingItem.itemId,
                    equipmentId: existingItem.equipmentId,
                    quantity: newQuantity,
                    order: existingItem.order,
                    createdAt: existingItem.createdAt,
                    item: existingItem.item
                } as PrismaItemWithStatEffect;
            } else {
                // Create new inventory item with temporary ID
                const newInventoryItem: UserInventoryItem = {
                    id: -(Date.now() * 1000 + Math.floor(Math.random() * 1000)),
                    itemId: itemId,
                    equipmentId: null,
                    quantity: quantity,
                    order: await getNextInventoryOrderMemory(telegramId),
                    createdAt: new Date(),
                    equipment: null,
                    item: await getItemById(itemId)
                };

                userMemoryManager.appendInventory(telegramId, newInventoryItem);

                await snapshotRedisManager.markSnapshotStale(telegramId, 'stale_session', 15);
                logger.info(`📦 Added new item ${itemId} to user ${telegramId} in memory`);

                // Cast to match Prisma return type
                return {
                    id: newInventoryItem.id,
                    itemId: newInventoryItem.itemId,
                    equipmentId: newInventoryItem.equipmentId,
                    quantity: newInventoryItem.quantity,
                    order: newInventoryItem.order,
                    createdAt: newInventoryItem.createdAt,
                    item: newInventoryItem.item
                } as PrismaItemWithStatEffect;
            }
        }

        // Fallback to database
        return await prismaMintItemToUser(telegramId, itemId, quantity);
    } catch (error) {
        logger.error(`Error minting item to user: ${error}`);
        throw error;
    }
}

export async function deleteItemsFromUserInventory(
    telegramId: string,
    itemIds: number[],
    quantitiesToRemove: number[]
): Promise<PrismaItemInventory[]> {
    try {
        // Validate input lengths
        if (itemIds.length !== quantitiesToRemove.length) {
            throw new Error("Item IDs and quantities arrays must have the same length.");
        }

        // Try memory first
        const userMemoryManager = requireUserMemoryManager();
        const snapshotRedisManager = requireSnapshotRedisManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;
            const updatedInventories: PrismaItemInventory[] = [];

            for (let i = 0; i < itemIds.length; i++) {
                const itemId = itemIds[i];
                const quantityToRemove = quantitiesToRemove[i];

                const existingItem = userMemoryManager.findInventoryByItemId(telegramId, itemId);

                if (!existingItem) {
                    logger.warn(`Item ${itemId} not found for user ${telegramId}`);
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
                        item: existingItem.item
                    } as PrismaItemInventory);
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
                        item: existingItem.item
                    } as PrismaItemInventory);
                }
            }

            await snapshotRedisManager.markSnapshotStale(telegramId, 'stale_session', 15);

            logger.info(`🗑️ Removed items from user ${telegramId} inventory in memory`);

            return updatedInventories;
        }

        // Fallback to database
        return await prismaDeleteItemsFromUserInventory(telegramId, itemIds, quantitiesToRemove);
    } catch (error) {
        logger.error(`Error deleting items from user inventory: ${error}`);
        throw error;
    }
}

export async function canUserMintItem(
    telegramId: string,
    itemId: number
): Promise<boolean> {
    try {
        // Try memory first
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            if (!user.inventory) return true;

            // Check if item already exists (stacking allowed)
            const existingItem = userMemoryManager.findInventoryByItemId(telegramId, itemId);
            if (existingItem) return true; // Already owned = no new slot needed

            // Check free slots using actual user data
            const usedSlots = user.inventory.length;
            const maxSlots = user.maxInventorySlots;

            return usedSlots < maxSlots;
        }

        // Fallback to database
        return await prismaCanUserMintItem(telegramId, itemId);
    } catch (error) {
        logger.error(`Error checking if user can mint item: ${error}`);
        throw error;
    }
}