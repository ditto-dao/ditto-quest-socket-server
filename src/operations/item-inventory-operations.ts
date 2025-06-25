import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { UserInventoryItem } from '../managers/memory/user-memory-manager';
import { getNextInventoryOrderMemory } from './user-operations';
import { getItemById } from './item-operations';
import { requireUserMemoryManager } from '../managers/global-managers/global-managers';
import { USER_LOCK_KEYS } from './user-lock-keys';

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

        throw new Error('User memory manager not available');

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
    const userMemoryManager = requireUserMemoryManager();
    const userLock = userMemoryManager.getUserLock(telegramId);

    return await userLock.acquire(USER_LOCK_KEYS.INVENTORY_OPERATIONS, async () => {
        try {
            if (userMemoryManager.isReady() && userMemoryManager.hasUser(telegramId)) {
                const user = userMemoryManager.getUser(telegramId)!;

                if (!user.inventory) user.inventory = [];

                // Check if item already exists
                const existingItem = userMemoryManager.findInventoryByItemId(telegramId, itemId);

                if (existingItem) {
                    // Update existing quantity
                    const newQuantity = existingItem.quantity + quantity;
                    const updateSuccess = userMemoryManager.updateInventoryQuantity(telegramId, existingItem.id, newQuantity);

                    if (!updateSuccess) {
                        logger.error(`❌ Failed to update item ${itemId} quantity for user ${telegramId}`);
                        throw new Error(`Item quantity update failed`);
                    }

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
                    const uniqueId = -(Date.now() * 1000 + Math.floor(Math.random() * 10000) + itemId);

                    // Create new inventory item with temporary ID
                    const newInventoryItem: UserInventoryItem = {
                        id: uniqueId,
                        itemId: itemId,
                        equipmentId: null,
                        quantity: quantity,
                        order: await getNextInventoryOrderMemory(telegramId),
                        createdAt: new Date(),
                        equipment: null,
                        item: await getItemById(itemId)
                    };

                    userMemoryManager.appendInventory(telegramId, newInventoryItem);

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

            throw new Error('User memory manager not available');

        } catch (error) {
            logger.error(`Error minting item to user: ${error}`);
            throw error;
        }
    });
}

export async function deleteItemsFromUserInventory(
    telegramId: string,
    itemIds: number[],
    quantitiesToRemove: number[]
): Promise<PrismaItemInventory[]> {
    const userMemoryManager = requireUserMemoryManager();
    const userLock = userMemoryManager.getUserLock(telegramId);

    return await userLock.acquire(USER_LOCK_KEYS.INVENTORY_OPERATIONS, async () => {
        try {
            // Validate input lengths
            if (itemIds.length !== quantitiesToRemove.length) {
                throw new Error("Item IDs and quantities arrays must have the same length.");
            }

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

                logger.info(`🗑️ Removed items from user ${telegramId} inventory in memory`);

                return updatedInventories;
            }

            throw new Error('User memory manager not available');

        } catch (error) {
            logger.error(`Error deleting items from user inventory: ${error}`);
            throw error;
        }
    });
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

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Error checking if user can mint item: ${error}`);
        throw error;
    }
}