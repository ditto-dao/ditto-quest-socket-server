import { Item, ItemInventory } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { userExists } from './user-service';

// Function to check if a user owns all specified items
export async function doesUserOwnItems(telegramId: number, itemIds: number[]): Promise<boolean> {
    try {
        // Fetch all items from the user's inventory that match the provided itemIds
        const userInventory = await prisma.itemInventory.findMany({
            where: {
                userId: telegramId,
                itemId: {
                    in: itemIds
                }
            }
        });

        // Check if the user owns all items (if the number of items in the inventory matches the provided itemIds)
        const ownsAllItems = userInventory.length === itemIds.length;

        if (ownsAllItems) {
            logger.info(`User ${telegramId} owns all requested items: ${itemIds.join(', ')}`);
        } else {
            const missingItems = itemIds.filter(id => !userInventory.some(inv => inv.itemId === id));
            logger.info(`User ${telegramId} does not own these items: ${missingItems.join(', ')}`);
        }

        return ownsAllItems;
    } catch (error) {
        logger.error(`Error checking if user ${telegramId} owns items ${itemIds.join(', ')}: ${error}`);
        throw error;
    }
}

// Function to get all items from the user's inventory
export async function getUserItemInventory(telegramId: number): Promise<(ItemInventory & { item: Item })[]> {
    try {
        // Fetch all items from the user's inventory
        const userInventory = await prisma.itemInventory.findMany({
            where: { userId: telegramId },
            include: {
                item: true // To include item details (name, rarity, etc.)
            }
        });

        if (!userInventory.length) {
            logger.info(`No items found in the inventory for user with telegramId ${telegramId}`);
            return [];
        }

        logger.info(`Fetched ${userInventory.length} items from the inventory for user with telegramId ${telegramId}`);
        return userInventory;

    } catch (error) {
        logger.error(`Failed to fetch user inventory: ${error}`);
        throw error;
    }
}

interface ItemInventoryRes {
    itemId: number,
    quantity: number
}

// Function to get a specific item from the user's inventory
export async function getUserSpecificItem(telegramId: number, itemId: number): Promise<ItemInventoryRes | null> {
    try {
        const userInventory = await prisma.itemInventory.findUnique({
            where: {
                userId_itemId: {
                    userId: telegramId,
                    itemId: itemId
                }
            },
            include: {
                item: true // To include item details like name and rarity
            }
        });

        if (!userInventory) {
            logger.info(`Item ${itemId} not found in inventory for user ${telegramId}.`);
            return null;
        }

        logger.info(`Fetched item ${userInventory.item.name} for user ${telegramId}. Quantity: ${userInventory.quantity}`);

        return {
            itemId: userInventory.itemId,
            quantity: userInventory.quantity,
        };
    } catch (error) {
        logger.error(`Failed to fetch item ${itemId} for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Function to mint item(s) to user's inventory
export async function mintItemToUser(telegramId: number, itemId: number, quantity: number = 1): Promise<ItemInventoryRes> {
    try {
        if ((await userExists(telegramId))) throw new Error(`User does not exist.`);

        // Check if the user already has the item in their inventory
        let existingInventory = await prisma.itemInventory.findUnique({
            where: {
                userId_itemId: {
                    userId: telegramId,
                    itemId: itemId
                }
            },
            include: {
                item: true // To include item details
            }
        });

        // If the item is already in the inventory, increment the quantity
        if (existingInventory) {
            const updatedInventory = await prisma.itemInventory.update({
                where: { id: existingInventory.id },
                data: {
                    quantity: {
                        increment: quantity
                    }
                },
                include: {
                    item: true
                }
            });
            logger.info(`Item ${updatedInventory.item.name} quantity increased by ${quantity}. New quantity: ${updatedInventory.quantity}`);
            return {
                itemId: updatedInventory.item.itemId,
                quantity: updatedInventory.quantity
            };
        }

        // If the inventory entry doesn't exist, check the item existence before minting it
        const item = await prisma.item.findUnique({
            where: { itemId }
        });

        if (!item) {
            throw new Error(`Item with itemId ${itemId} not found.`);
        }

        // Create a new entry in the inventory
        const newInventory = await prisma.itemInventory.create({
            data: {
                userId: telegramId,
                itemId: item.itemId,
                quantity: quantity
            },
            include: {
                item: true
            }
        });
        logger.info(`Item ${newInventory.item.name} minted to user with telegramId ${telegramId}. Quantity: ${newInventory.quantity}`);

        return {
            itemId: newInventory.item.itemId,
            quantity: newInventory.quantity
        };

    } catch (error) {
        logger.error(`Failed to mint item to user: ${error}`);
        throw error;
    }
}

// Function to delete item(s) from user's inventory
export async function deleteItemFromUserInventory(telegramId: number, itemId: number, quantityToRemove: number = 1): Promise<ItemInventoryRes> {
    try {
        // Fetch the user and item from their inventory
        const userInventory = await prisma.itemInventory.findUnique({
            where: {
                userId_itemId: {
                    userId: telegramId,
                    itemId: itemId
                }
            }
        });

        if (!userInventory) {
            throw new Error(`Item not found in inventory.`);
        }

        // Check the current quantity in the user's inventory
        const currentQuantity = userInventory.quantity;

        if (quantityToRemove > currentQuantity) {
            throw new Error(`Insufficient balance of item in inventory.`);
        }

        if (currentQuantity > quantityToRemove) {
            // If the current quantity is greater than the amount to remove, decrement the quantity
            const updatedInventory = await prisma.itemInventory.update({
                where: { id: userInventory.id },
                data: {
                    quantity: {
                        decrement: quantityToRemove
                    }
                }
            });
            const remainingQuantity = updatedInventory.quantity;
            logger.info(`Decremented item ${itemId} quantity by ${quantityToRemove} for user ${telegramId}. Remaining quantity: ${remainingQuantity}`);

            return {
                itemId: itemId,
                quantity: remainingQuantity
            };
        } else {
            // If the current quantity is equal to the amount to remove, delete the item from the inventory
            await prisma.itemInventory.delete({
                where: { id: userInventory.id }
            });
            logger.info(`Deleted item ${itemId} from user ${telegramId}'s inventory as the quantity is now 0.`);

            return {
                itemId: itemId,
                quantity: 0
            };
        }
    } catch (error) {
        logger.error(`Failed to delete item from user inventory: ${error}`);
        throw error;
    }
}