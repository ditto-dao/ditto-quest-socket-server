// equip/unequip and change combat
//  Adjusts user attributes such as str, def, dex, and magic, potentially as a result of equipping or unequipping items or using consumable items.

import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { getNextInventoryOrder } from './user-service';

// Function to check if a user owns all specified equipment with required quantities
export async function doesUserOwnEquipments(
    telegramId: number,
    equipmentIds: number[],
    quantities: number[]
): Promise<boolean> {
    try {
        // Validation: Ensure equipmentIds and quantities match in length
        if (equipmentIds.length !== quantities.length) {
            throw new Error("Equipment IDs and quantities arrays must have the same length.");
        }

        // Early return for empty input
        if (equipmentIds.length === 0) {
            logger.info(`No equipment IDs provided to check ownership for user ${telegramId}.`);
            return true; // Trivially true
        }

        // Combine equipmentIds and quantities into a Map to handle duplicates
        const equipmentQuantityMap = new Map<number, number>();
        equipmentIds.forEach((id, index) => {
            const requiredQuantity = quantities[index];
            equipmentQuantityMap.set(id, (equipmentQuantityMap.get(id) || 0) + requiredQuantity);
        });

        // Fetch the user's inventory for the specified equipment IDs
        const userInventory = await prisma.inventory.findMany({
            where: {
                userId: telegramId,
                equipmentId: {
                    in: Array.from(equipmentQuantityMap.keys())
                }
            },
            select: {
                equipmentId: true,
                quantity: true
            }
        });

        // Map the user's inventory to a lookup table
        const inventoryMap = new Map<number, number>();
        userInventory.forEach((inv) => {
            inventoryMap.set(inv.equipmentId!, inv.quantity);
        });

        // Check if the user owns all equipment with required quantities
        const missingOrInsufficientEquipment: string[] = [];
        const ownsAllEquipments = Array.from(equipmentQuantityMap.entries()).every(([equipmentId, requiredQuantity]) => {
            const userQuantity = inventoryMap.get(equipmentId) || 0;
            if (userQuantity < requiredQuantity) {
                missingOrInsufficientEquipment.push(
                    `Equipment ${equipmentId} (required: ${requiredQuantity}, owned: ${userQuantity})`
                );
                return false;
            }
            return true;
        });

        // Logging
        if (ownsAllEquipments) {
            logger.info(
                `User ${telegramId} owns all requested equipment with sufficient quantities: ${Array.from(equipmentQuantityMap.keys()).join(", ")}`
            );
        } else {
            logger.info(
                `User ${telegramId} does not own these equipment with sufficient quantities: ${missingOrInsufficientEquipment.join(", ")}`
            );
        }

        return ownsAllEquipments;
    } catch (error) {
        logger.error(
            `Error checking if user ${telegramId} owns equipment with required quantities: ${error}`
        );
        throw error;
    }
}

export async function mintEquipmentToUser(
    telegramId: number,
    equipmentId: number,
    quantity: number = 1
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: true } }>> {
    try {
        // Check if the equipment already exists in the user's inventory
        const existingInventory = await prisma.inventory.findFirst({
            where: {
                userId: telegramId,
                equipmentId: equipmentId,
                itemId: null, // Ensure this is specifically an equipment entry
            },
        });

        if (existingInventory) {
            // Case 1: Equipment exists → Increment the quantity
            const updatedInventory = await prisma.inventory.update({
                where: { id: existingInventory.id },
                data: {
                    quantity: {
                        increment: quantity,
                    },
                },
                include: {
                    equipment: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            imgsrc: true,
                            str: true,
                            def: true,
                            dex: true,
                            magic: true,
                            hp: true,
                            rarity: true,
                            type: true,
                        },
                    },
                },
            });

            logger.info(
                `Updated quantity for equipment ${updatedInventory.equipment?.name}. New quantity: ${updatedInventory.quantity}`
            );
            return updatedInventory;
        } else {
            // Case 2: Equipment does not exist → Create a new entry
            const nextOrder = await getNextInventoryOrder(telegramId); // Get the next order index

            const newInventory = await prisma.inventory.create({
                data: {
                    userId: telegramId,
                    equipmentId: equipmentId,
                    itemId: null, // Ensure null for non-item entries
                    quantity: quantity,
                    order: nextOrder
                },
                include: {
                    equipment: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            imgsrc: true,
                            str: true,
                            def: true,
                            dex: true,
                            magic: true,
                            hp: true,
                            rarity: true,
                            type: true,
                        },
                    },
                },
            });

            logger.info(
                `Added new equipment ${newInventory.equipment?.name} to user ${telegramId}. Quantity: ${newInventory.quantity}`
            );
            return newInventory;
        }
    } catch (error) {
        logger.error(`Error minting equipment to user: ${error}`);
        throw error;
    }
}

// Function to delete equipment from user's inventory
export async function deleteEquipmentFromUserInventory(
    telegramId: number,
    equipmentIds: number[],
    quantitiesToRemove: number[]
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: true } }>[]> {
    try {
        // Validate input lengths
        if (equipmentIds.length !== quantitiesToRemove.length) {
            throw new Error("Equipment IDs and quantities arrays must have the same length.");
        }

        const updatedInventories: Prisma.InventoryGetPayload<{ include: { equipment: true } }>[] = [];

        for (let i = 0; i < equipmentIds.length; i++) {
            const equipmentId = equipmentIds[i];
            const quantityToRemove = quantitiesToRemove[i];

            // Fetch the current inventory for the user
            const existingInventory = await prisma.inventory.findFirst({
                where: {
                    userId: telegramId,
                    equipmentId: equipmentId,
                    itemId: null, // Ensure it's specifically equipment
                },
                include: {
                    equipment: true, // Include equipment details
                },
            });

            if (!existingInventory) {
                logger.warn(
                    `Equipment with ID ${equipmentId} not found in user ${telegramId}'s inventory. Skipping.`
                );
                continue; // Skip to the next equipment
            }

            let updatedInventory;

            if (existingInventory.quantity > quantityToRemove) {
                // Case 1: Reduce quantity
                updatedInventory = await prisma.inventory.update({
                    where: { id: existingInventory.id },
                    data: {
                        quantity: {
                            decrement: quantityToRemove,
                        },
                    },
                    include: {
                        equipment: true,
                    },
                });

                logger.info(
                    `Reduced quantity of equipment ID ${equipmentId} for user ${telegramId}. New quantity: ${updatedInventory.quantity}`
                );
            } else {
                // Case 2: Prepare to delete and return object with quantity: 0
                updatedInventory = {
                    ...existingInventory,
                    quantity: 0, // Simulate the quantity reaching 0
                };

                // Delete the inventory entry
                await prisma.inventory.delete({
                    where: { id: existingInventory.id },
                });

                logger.info(
                    `Removed equipment ID ${equipmentId} from user ${telegramId}'s inventory.`
                );
            }

            // Add the updated/deleted inventory to the result array
            updatedInventories.push(updatedInventory);
        }

        return updatedInventories;
    } catch (error) {
        logger.error(`Error deleting equipment from user inventory: ${error}`);
        throw error;
    }
}
