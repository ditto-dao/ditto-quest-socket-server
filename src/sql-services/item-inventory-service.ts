import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { prismaFetchNextInventoryOrder, prismaFetchUserInventorySlotInfo } from './user-service';

export async function prismaMintItemToUser(
    telegramId: string,
    itemId: number,
    quantity: number = 1
): Promise<Prisma.InventoryGetPayload<{ include: { item: { include: { statEffect: true } } } }>> {
    try {
        const itemExists = await prisma.item.findUnique({ where: { id: itemId } });
        if (!itemExists) {
            throw new Error(`Item ID ${itemId} does not exist in the database`);
        }

        // Check if the item already exists in the user's inventory
        const existingInventory = await prisma.inventory.findFirst({
            where: {
                userId: telegramId,
                itemId: itemId,
                equipmentId: null, // Ensure it's specifically an item
            },
            include: {
                item: {
                    include: { statEffect: true }, // Ensure statEffect is included
                }
            }
        });

        if (existingInventory) {
            // Case 1: Item exists → Increment the quantity
            const updatedInventory = await prisma.inventory.update({
                where: { id: existingInventory.id },
                data: { quantity: { increment: quantity } },
                include: {
                    item: {
                        include: { statEffect: true } // Ensure statEffect is included
                    }
                }
            });

            logger.info(
                `Updated quantity for item ${updatedInventory.item?.name}. New quantity: ${updatedInventory.quantity}`
            );

            return updatedInventory;
        } else {
            // Case 2: Item does not exist → Create a new entry

            const inventorySlots = await prismaFetchUserInventorySlotInfo(telegramId);

            if (inventorySlots.usedSlots >= inventorySlots.maxSlots) {
                throw new Error(`User inventory is full`);
            }

            const nextOrder = await prismaFetchNextInventoryOrder(telegramId); // Get next inventory order index

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
                        include: { statEffect: true } // Include full statEffect details
                    }
                }
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