import { Item, ItemInventory, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { userExists } from './user-service';

// Function to check if a user owns all specified items with the required quantities
export async function doesUserOwnItems(telegramId: number, itemIds: number[], quantities: number[]): Promise<boolean> {
    try {
        if (itemIds.length !== quantities.length) {
            throw new Error('Item IDs and quantities arrays must have the same length.');
        }

        // Fetch all items from the user's inventory that match the provided itemIds
        const userInventory = await prisma.itemInventory.findMany({
            where: {
                userId: telegramId,
                itemId: {
                    in: itemIds
                }
            }
        });

        // Check if the user owns all items with the required quantities
        const ownsAllItems = itemIds.every((itemId, index) => {
            const requiredQuantity = quantities[index];
            const inventoryItem = userInventory.find(inv => inv.itemId === itemId);
            return inventoryItem && inventoryItem.quantity >= requiredQuantity;
        });

        if (ownsAllItems) {
            logger.info(`User ${telegramId} owns all requested items with sufficient quantities: ${itemIds.join(', ')}`);
        } else {
            const missingOrInsufficientItems = itemIds
                .filter((itemId, index) => {
                    const requiredQuantity = quantities[index];
                    const inventoryItem = userInventory.find(inv => inv.itemId === itemId);
                    return !inventoryItem || inventoryItem.quantity < requiredQuantity;
                })
                .map((itemId, index) => `${itemId} (required: ${quantities[index]})`);
            logger.info(`User ${telegramId} does not own these items with sufficient quantities: ${missingOrInsufficientItems.join(', ')}`);
        }

        return ownsAllItems;
    } catch (error) {
        logger.error(`Error checking if user ${telegramId} owns items ${itemIds.join(', ')} with required quantities: ${error}`);
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
    itemInventory: {
        id: number;
        itemId: number;
        quantity: number;
        item: {
            itemId: number;
            name: string;
            description: string;
            rarity: string;
        };
    };
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
                item: {
                    select: {
                        itemId: true,
                        name: true,
                        description: true,
                        rarity: true,
                    },
                },
            },
        });

        if (!userInventory) {
            logger.info(`Item ${itemId} not found in inventory for user ${telegramId}.`);
            return null;
        }

        logger.info(`Fetched item ${userInventory.item.name} for user ${telegramId}. Quantity: ${userInventory.quantity}`);

        return {
            itemInventory: userInventory,
        };
    } catch (error) {
        logger.error(`Failed to fetch item ${itemId} for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Function to mint item(s) to user's inventory
export async function mintItemToUser(telegramId: number, itemId: number, quantity: number = 1): Promise<ItemInventoryRes> {
    try {
        if (!(await userExists(telegramId))) throw new Error(`User does not exist.`);

        // Check if the user already has the item in their inventory
        let existingInventory = await prisma.itemInventory.findUnique({
            where: {
                userId_itemId: {
                    userId: telegramId,
                    itemId: itemId
                }
            },
            include: {
                item: {
                    select: {
                        itemId: true,
                        name: true,
                        description: true,
                        rarity: true,
                    },
                },
            },
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
                    item: {
                        select: {
                            itemId: true,
                            name: true,
                            description: true,
                            rarity: true,
                        },
                    },
                },
            });
            logger.info(`Item ${updatedInventory.item.name} quantity increased by ${quantity}. New quantity: ${updatedInventory.quantity}`);
            return {
                itemInventory: updatedInventory,
            };
        }

        // If the inventory entry doesn't exist, check the item existence before minting it
        const item = await prisma.item.findUnique({
            where: { itemId },
            select: {
                itemId: true,
                name: true,
                description: true,
                rarity: true,
            },
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
                item: {
                    select: {
                        itemId: true,
                        name: true,
                        description: true,
                        rarity: true,
                    },
                },
            },
        });
        logger.info(`Item ${newInventory.item.name} minted to user with telegramId ${telegramId}. Quantity: ${newInventory.quantity}`);

        return {
            itemInventory: newInventory,
        };

    } catch (error) {
        logger.error(`Failed to mint item to user: ${error}`);
        throw error;
    }
}

export async function deleteItemsFromUserInventory(
    telegramId: number,
    itemIds: number[],
    quantitiesToRemove: number[]
): Promise<ItemInventoryRes[]> {
    try {
        if (itemIds.length !== quantitiesToRemove.length) {
            throw new Error('itemIds and quantitiesToRemove arrays must have the same length.');
        }

        // Fetch all relevant items from the user's inventory in a single query
        const userInventory = await prisma.itemInventory.findMany({
            where: {
                userId: telegramId,
                itemId: {
                    in: itemIds
                }
            },
            include: {
                item: {
                    select: {
                        itemId: true,
                        name: true,
                        description: true,
                        rarity: true,
                    },
                },
            },
        });

        const results: ItemInventoryRes[] = [];
        const batchOperations: Prisma.PrismaPromise<any>[] = [];

        itemIds.forEach((itemId, index) => {
            const quantityToRemove = quantitiesToRemove[index];
            const inventoryItem = userInventory.find(inv => inv.itemId === itemId);

            if (!inventoryItem) {
                throw new Error(`Item with ID ${itemId} not found in inventory.`);
            }

            if (quantityToRemove > inventoryItem.quantity) {
                throw new Error(`Insufficient balance of item with ID ${itemId} in inventory.`);
            }

            if (inventoryItem.quantity > quantityToRemove) {
                // Create a PrismaPromise for updating the item and push it to the batch
                const updateOperation = prisma.itemInventory.update({
                    where: { id: inventoryItem.id },
                    data: {
                        quantity: {
                            decrement: quantityToRemove
                        }
                    },
                    include: {
                        item: {
                            select: {
                                itemId: true,
                                name: true,
                                description: true,
                                rarity: true,
                            },
                        },
                    },
                });
                batchOperations.push(updateOperation);

                results.push({
                    itemInventory: {
                        ...inventoryItem,
                        quantity: inventoryItem.quantity - quantityToRemove,
                    }
                });
            } else {
                // Create a PrismaPromise for deleting the item and push it to the batch
                const deleteOperation = prisma.itemInventory.delete({
                    where: { id: inventoryItem.id }
                });
                batchOperations.push(deleteOperation);

                results.push({
                    itemInventory: {
                        id: inventoryItem.id,
                        itemId: inventoryItem.itemId,
                        quantity: 0,
                        item: inventoryItem.item,
                    }
                });
            }
        });

        // Execute all operations as a transaction
        await prisma.$transaction(batchOperations);

        return results;
    } catch (error) {
        logger.error(`Failed to delete items from user inventory: ${error}`);
        throw error;
    }
}
