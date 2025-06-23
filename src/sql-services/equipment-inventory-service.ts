import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { prismaFetchNextInventoryOrder, prismaFetchUserInventorySlotInfo } from './user-service';
import { UserInventoryItem } from '../managers/memory/user-memory-manager';
import { prismaMintItemToUser } from './item-inventory-service';

export async function prismaMintEquipmentToUser(
    telegramId: string,
    equipmentId: number,
    quantity: number = 1
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: { include: { statEffect: true } } } }>> {
    try {
        const equipmentExists = await prisma.equipment.findUnique({ where: { id: equipmentId } });
        if (!equipmentExists) {
            throw new Error(`Equipment ID ${equipmentId} does not exist in the database`);
        }

        // Check if the equipment already exists in the user's inventory
        const existingInventory = await prisma.inventory.findFirst({
            where: {
                userId: telegramId,
                equipmentId: equipmentId,
                itemId: null, // Ensure it's specifically an equipment entry
            },
            include: {
                equipment: {
                    include: { statEffect: true }, // Ensure statEffect is included
                }
            }
        });

        if (existingInventory) {
            // Case 1: Equipment exists → Increment the quantity
            const updatedInventory = await prisma.inventory.update({
                where: { id: existingInventory.id },
                data: { quantity: { increment: quantity } },
                include: {
                    equipment: {
                        include: { statEffect: true } // Ensure statEffect is included
                    }
                }
            });

            logger.info(
                `Updated quantity for equipment ${updatedInventory.equipment?.name}. New quantity: ${updatedInventory.quantity}`
            );

            return updatedInventory;
        } else {
            // Case 2: Equipment does not exist → Create a new entry
            const inventorySlots = await prismaFetchUserInventorySlotInfo(telegramId);

            if (inventorySlots.usedSlots >= inventorySlots.maxSlots) {
                throw new Error(`User inventory is full`);
            }

            const nextOrder = await prismaFetchNextInventoryOrder(telegramId); // Get next inventory order index

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
                        include: { statEffect: true } // Include full statEffect details
                    }
                }
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

export async function prismaFetchUserInventory(userId: string): Promise<UserInventoryItem[]> {
    try {
        const inventory = await prisma.inventory.findMany({
            where: {
                user: { telegramId: userId }
            },
            select: {
                id: true,
                itemId: true,
                equipmentId: true,
                quantity: true,
                order: true,
                createdAt: true,
                item: {
                    include: {
                        statEffect: true
                    }
                },
                equipment: {
                    include: {
                        statEffect: true
                    }
                }
            },
            orderBy: { order: 'asc' }
        });

        return inventory as UserInventoryItem[];
    } catch (error) {
        logger.error(`❌ Failed to fetch inventory for user ${userId}: ${error}`);
        throw error;
    }
}

export async function prismaFetchEquipmentOrItemFromInventory(
    telegramId: string,
    inventoryId: number
): Promise<Prisma.InventoryGetPayload<{ include: { equipment: true } }> | undefined> {
    try {
        // Fetch the equipment from the user's inventory
        const equipmentInventory = await prisma.inventory.findUnique({
            where: { id: inventoryId },
            include: { equipment: true }, // Include equipment details
        });

        // Check if the equipment exists and belongs to the user
        if (!equipmentInventory || equipmentInventory.userId.toString() !== telegramId) {
            throw new Error(`Inventory ID ${inventoryId} not found in inventory for user ${telegramId}`);
        }

        if (!equipmentInventory.equipment) {
            throw new Error(`Inventory object is not an equipment`);
        }

        return equipmentInventory;
    } catch (err) {
        console.error(`Error fetching equipment or item from user ${telegramId}'s inventory: ${err}`);
        throw err; // Re-throw the error for further handling
    }
}

export async function prismaInsertInventoryToDB(userId: string, inventory: UserInventoryItem[]): Promise<void> {
    try {
        for (const inv of inventory) {
            if (inv.equipmentId) {
                await prismaMintEquipmentToUser(userId, inv.equipmentId, inv.quantity);
            } else if (inv.itemId) {
                await prismaMintItemToUser(userId, inv.itemId, inv.quantity);
            }
        }
        logger.info(`📦 Batch inserted ${inventory.length} inventory items for user ${userId}`);
    } catch (error) {
        logger.error(`❌ Failed to batch insert inventory for user ${userId}: ${error}`);
        throw error;
    }
}

export async function prismaDeleteInventoryFromDB(userId: string, inventoryIds: number[]): Promise<void> {
    try {
        await prisma.inventory.deleteMany({
            where: {
                id: { in: inventoryIds },
                user: { telegramId: userId }
            }
        });
        logger.info(`🗑️ Batch deleted ${inventoryIds.length} inventory items for user ${userId}`);
    } catch (error) {
        logger.error(`❌ Failed to batch delete inventory for user ${userId}: ${error}`);
        throw error;
    }
}

/**
 * Update multiple inventory item quantities in the database
 */
export async function prismaUpdateInventoryQuantitiesInDB(
    userId: string,
    inventoryItems: UserInventoryItem[]
): Promise<void> {
    try {
        const updatePromises = inventoryItems.map(item =>
            prisma.inventory.update({
                where: { id: item.id },
                data: { quantity: item.quantity }
            })
        );

        await Promise.all(updatePromises);

        logger.debug(`🔄 Updated ${inventoryItems.length} inventory quantities in DB for user ${userId}`);
    } catch (error) {
        logger.error(`❌ Failed to update inventory quantities in DB for user ${userId}: ${error}`);
        throw error;
    }
}

/**
 * Alternative batch update approach (more efficient for large quantities)
 */
export async function prismaBatchUpdateInventoryQuantitiesInDB(
    userId: string,
    inventoryItems: UserInventoryItem[]
): Promise<void> {
    try {
        // Build the update cases for each inventory item
        const updateCases = inventoryItems.map(item =>
            `WHEN id = ${item.id} THEN ${item.quantity}`
        ).join(' ');

        const inventoryIds = inventoryItems.map(item => item.id);

        // Use raw SQL for efficient batch update
        await prisma.$executeRaw`
            UPDATE inventory 
            SET quantity = CASE ${updateCases} END
            WHERE id IN (${inventoryIds.join(',')})
        `;

        logger.debug(`🔄 Batch updated ${inventoryItems.length} inventory quantities in DB for user ${userId}`);
    } catch (error) {
        logger.error(`❌ Failed to batch update inventory quantities in DB for user ${userId}: ${error}`);
        throw error;
    }
}
