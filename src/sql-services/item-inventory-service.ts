import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { getNextInventoryOrder } from './user-service';

// Function to check if a user owns all specified items with the required quantities
export async function doesUserOwnItems(
    telegramId: number,
    itemIds: number[],
    quantities: number[]
): Promise<boolean> {
    try {
        // Validate input
        if (itemIds.length !== quantities.length) {
            throw new Error("Item IDs and quantities arrays must have the same length.");
        }

        if (itemIds.length === 0) {
            logger.info(`No items to check for user ${telegramId}.`);
            return true; // No items to check; trivially true
        }

        // Deduplicate itemIds and ensure unique IDs only
        const uniqueItemQuantities = new Map<number, number>();
        itemIds.forEach((id, index) => {
            const quantity = quantities[index];
            uniqueItemQuantities.set(id, (uniqueItemQuantities.get(id) || 0) + quantity);
        });

        // Fetch all items matching the unique item IDs
        const userInventory = await prisma.inventory.findMany({
            where: {
                userId: telegramId,
                itemId: { in: Array.from(uniqueItemQuantities.keys()) },
            },
            select: {
                itemId: true,
                quantity: true,
            },
        });

        // Map user inventory to a lookup table
        const inventoryMap = new Map<number, number>();
        userInventory.forEach((inv) => {
            inventoryMap.set(inv.itemId!, inv.quantity);
        });

        // Check if the user owns all items with the required quantities
        const missingOrInsufficientItems: string[] = [];
        const ownsAllItems = Array.from(uniqueItemQuantities.entries()).every(([itemId, requiredQuantity]) => {
            const userQuantity = inventoryMap.get(itemId) || 0;
            if (userQuantity < requiredQuantity) {
                missingOrInsufficientItems.push(`${itemId} (required: ${requiredQuantity}, owned: ${userQuantity})`);
                return false;
            }
            return true;
        });

        // Logging
        if (ownsAllItems) {
            logger.info(
                `User ${telegramId} owns all requested items with sufficient quantities: ${Array.from(uniqueItemQuantities.keys()).join(", ")}`
            );
        } else {
            logger.info(
                `User ${telegramId} does not own these items with sufficient quantities: ${missingOrInsufficientItems.join(", ")}`
            );
        }

        return ownsAllItems;
    } catch (error) {
        logger.error(
            `Error checking if user ${telegramId} owns items with required quantities: ${error}`
        );
        throw error;
    }
}

export async function mintItemToUser(
    telegramId: number,
    itemId: number,
    quantity: number = 1
): Promise<Prisma.InventoryGetPayload<{ include: { item: true } }>> {
    try {
        // Check if the item already exists in the user's inventory
        const existingInventory = await prisma.inventory.findFirst({
            where: {
                userId: telegramId,
                itemId: itemId,
                equipmentId: null, // Ensure it's specifically an item
            },
        });

        if (existingInventory) {
            // Case 1: Item exists → Increment the quantity
            const updatedInventory = await prisma.inventory.update({
                where: { id: existingInventory.id },
                data: {
                    quantity: {
                        increment: quantity,
                    },
                },
                include: {
                    item: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            imgsrc: true,
                            rarity: true,
                            consumableId: true,       // Include these missing fields
                            farmingDurationS: true,   // Include these missing fields
                        },
                    },
                },
            });

            logger.info(
                `Updated quantity for item ${updatedInventory.item?.name}. New quantity: ${updatedInventory.quantity}`
            );
            return updatedInventory;
        } else {
            // Case 2: Item does not exist → Create a new entry
            const nextOrder = await getNextInventoryOrder(telegramId); // Get the next order index

            const newInventory = await prisma.inventory.create({
                data: {
                    userId: telegramId,
                    itemId: itemId,
                    equipmentId: null, // Ensure null for non-equipment entries
                    quantity: quantity,
                    order: nextOrder
                },
                include: {
                    item: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            imgsrc: true,
                            rarity: true,
                            consumableId: true,       // Include these missing fields
                            farmingDurationS: true,   // Include these missing fields
                        },
                    },
                },
            });

            logger.info(
                `Added new item ${newInventory.item?.name} to user ${telegramId}. Quantity: ${newInventory.quantity}`
            );
            return newInventory;
        }
    } catch (error) {
        logger.error(`Error minting item to user: ${error}`);
        throw error;
    }
}

export async function deleteItemsFromUserInventory(
    telegramId: number,
    itemIds: number[],
    quantitiesToRemove: number[]
): Promise<Prisma.InventoryGetPayload<{ include: { item: true } }>[]> {
    if (itemIds.length !== quantitiesToRemove.length) {
        throw new Error("Item IDs and quantities arrays must have the same length.");
    }

    try {
        // Fetch the user's inventory entries for the given itemIds
        const userInventory = await prisma.inventory.findMany({
            where: {
                userId: telegramId,
                itemId: { in: itemIds },
            },
            include: {
                item: true, // Include item details
            },
        });

        const updatedInventories: Prisma.InventoryGetPayload<{ include: { item: true } }>[] = [];

        // Map through each itemId and process the removal
        for (let i = 0; i < itemIds.length; i++) {
            const itemId = itemIds[i];
            const quantityToRemove = quantitiesToRemove[i];

            // Find the inventory entry for the current itemId
            const inventoryEntry = userInventory.find(inv => inv.itemId === itemId);

            if (!inventoryEntry) {
                throw new Error(`Item with ID ${itemId} not found in user inventory.`);
            }

            let updatedInventory;

            if (inventoryEntry.quantity > quantityToRemove) {
                // Decrement the quantity
                updatedInventory = await prisma.inventory.update({
                    where: { id: inventoryEntry.id },
                    data: {
                        quantity: {
                            decrement: quantityToRemove,
                        },
                    },
                    include: {
                        item: true, // Include updated item details
                    },
                });

                logger.info(
                    `Decremented ${quantityToRemove} of item ID ${itemId} from user ${telegramId}. New quantity: ${updatedInventory.quantity}`
                );
            } else {
                // Simulate quantity 0 before deletion
                updatedInventory = {
                    ...inventoryEntry,
                    quantity: 0,
                };

                // Remove the item entirely
                await prisma.inventory.delete({
                    where: { id: inventoryEntry.id },
                });

                logger.info(
                    `Deleted item ID ${itemId} from user ${telegramId}'s inventory due to insufficient quantity.`
                );
            }

            // Add the updated/deleted inventory to the result array
            updatedInventories.push(updatedInventory);
        }

        logger.info(`Successfully updated inventory for user ${telegramId}.`);
        return updatedInventories;
    } catch (error) {
        logger.error(`Failed to delete items from user inventory: ${error}`);
        throw error;
    }
}
