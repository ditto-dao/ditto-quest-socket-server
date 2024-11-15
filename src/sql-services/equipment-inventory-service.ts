// equip/unequip and change combat
//  Adjusts user attributes such as str, def, dex, and magic, potentially as a result of equipping or unequipping items or using consumable items.

import { Equipment, EquipmentInventory } from '@prisma/client';
import { logger } from '../utils/logger';
import { prisma } from './client';
import { userExists } from './user-service';

// Function to check if a user owns all specified equipment by equipment id
export async function doesUserOwnEquipments(telegramId: number, equipmentIds: number[]): Promise<boolean> {
    try {
        // Fetch all equipment from the user's inventory that match the provided equipmentIds
        const userInventory = await prisma.equipmentInventory.findMany({
            where: {
                userId: telegramId,
                equipmentId: {
                    in: equipmentIds
                }
            }
        });

        // Check if the user owns all equipment (if the number of equipment in the inventory matches the provided equipmentIds)
        const ownsAllEquipments = userInventory.length === equipmentIds.length;

        if (ownsAllEquipments) {
            logger.info(`User ${telegramId} owns all requested equipment: ${equipmentIds.join(', ')}`);
        } else {
            const missingEquipment = equipmentIds.filter(id => !userInventory.some(inv => inv.equipmentId === id));
            logger.info(`User ${telegramId} does not own these equipment: ${missingEquipment.join(', ')}`);
        }

        return ownsAllEquipments;
    } catch (error) {
        logger.error(`Error checking if user ${telegramId} owns equipment ${equipmentIds.join(', ')}: ${error}`);
        throw error;
    }
}

// Function to check if a user owns all specified equipment by equipment id
export async function doesUserOwnEquipmentsByEquipmentInventoryId(telegramId: number, equipmentInvIds: number[]): Promise<boolean> {
    try {
        // Fetch all equipment inventory entries from the user's inventory that match the provided equipment inventory IDs
        const userInventory = await prisma.equipmentInventory.findMany({
            where: {
                userId: telegramId,
                id: {
                    in: equipmentInvIds
                }
            }
        });

        // Check if the user owns all the equipment (if the number of equipment inventory entries matches the provided IDs)
        const ownsAllEquipments = userInventory.length === equipmentInvIds.length;

        if (ownsAllEquipments) {
            logger.info(`User ${telegramId} owns all requested equipment inventory IDs: ${equipmentInvIds.join(', ')}`);
        } else {
            const missingEquipments = equipmentInvIds.filter(id => !userInventory.some(inv => inv.id === id));
            logger.info(`User ${telegramId} does not own these equipment inventory IDs: ${missingEquipments.join(', ')}`);
        }

        return ownsAllEquipments;
    } catch (error) {
        logger.error(`Error checking if user ${telegramId} owns equipment inventory IDs ${equipmentInvIds.join(', ')}: ${error}`);
        throw error;
    }
}

// Function to check if equipment is equipped
export async function isUserEquipmentEquipped(telegramId: number, equipmentInvId: number): Promise<boolean> {
    try {
        // Fetch the user with all equipped items (hatId, armourId, weaponId, etc.)
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                hatId: true,
                armourId: true,
                weaponId: true,
                shieldId: true,
                capeId: true,
                necklaceId: true,
                petId: true,
                spellbookId: true
            }
        });

        if (!user) {
            throw new Error(`User does not exist.`)
        }

        // Check if the equipmentInvId is one of the equipped items
        const isEquipped = [
            user.hatId,
            user.armourId,
            user.weaponId,
            user.shieldId,
            user.capeId,
            user.necklaceId,
            user.petId,
            user.spellbookId
        ].includes(equipmentInvId);

        if (isEquipped) {
            logger.info(`User ${telegramId} has equipment ${equipmentInvId} equipped.`);
        } else {
            logger.info(`User ${telegramId} does not have equipment ${equipmentInvId} equipped.`);
        }

        return isEquipped;
    } catch (error) {
        logger.error(`Failed to check if equipment ${equipmentInvId} is equipped for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Function to get all equipment from the user's inventory
export async function getUserEquipmentInventory(telegramId: number): Promise<(EquipmentInventory & { equipment: Equipment})[]> {
    try {
        // Fetch all equipment from the user's inventory
        const userInventory = await prisma.equipmentInventory.findMany({
            where: { userId: telegramId },
            include: {
                equipment: true // To include equipment details (name, rarity, etc.)
            }
        });

        if (!userInventory.length) {
            logger.info(`No equipment found in the inventory for user with telegramId ${telegramId}`);
            return [];
        }

        logger.info(`Fetched ${userInventory.length} equipment from the inventory for user with telegramId ${telegramId}`);
        return userInventory;
    } catch (error) {
        logger.error(`Failed to fetch user equipment inventory: ${error}`);
        throw error;
    }
}

// Function to get a specific equipment from the user's inventory
export async function getUserSpecificEquipment(telegramId: number, equipmentInvId: number): Promise<EquipmentInventory & { equipment: Equipment } | null> {
    try {
        const userEquipment = await prisma.equipmentInventory.findUnique({
            where: {
                id: equipmentInvId,
                userId: telegramId
            },
            include: {
                equipment: true // To include equipment details like name, etc.
            }
        });

        if (!userEquipment) {
            logger.info(`Equipment ${equipmentInvId} not found in inventory for user ${telegramId}.`);
            return null;
        }

        logger.info(`Fetched equipment ${userEquipment.equipment.name} for user ${telegramId}.`);

        return userEquipment;
    } catch (error) {
        logger.error(`Failed to fetch equipment ${equipmentInvId} for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Function to add equipment to user's inventory
export async function mintEquipmentToUser(telegramId: number, equipmentId: number): Promise<EquipmentInventory & { equipment: Equipment } | null> {
    try {
        if (!(await userExists(telegramId))) throw new Error(`User does not exist.`);

        // Create a new entry for the equipment in the inventory
        const newInventory = await prisma.equipmentInventory.create({
            data: {
                userId: telegramId,
                equipmentId: equipmentId
            },
            include: {
                equipment: true
            }
        });
        logger.info(`Equipment ${newInventory.equipment.name} added to user with telegramId ${telegramId}.`);

        return newInventory;

    } catch (error) {
        logger.error(`Failed to add equipment to user: ${error}`);
        throw error;
    }
}

// Function to delete equipment from user's inventory
export async function deleteEquipmentFromUserInventory(
    telegramId: number, 
    equipmentInvId: number
): Promise<EquipmentInventory & { equipment: Equipment } | null> {
    try {
        // Fetch the equipment from the user's inventory to check existence
        const equipmentInventory = await prisma.equipmentInventory.findUnique({
            where: {
                id: equipmentInvId
            },
            include: {
                equipment: true // Include equipment details
            }
        });

        // Check if the equipment exists in the user's inventory
        if (!equipmentInventory || equipmentInventory.userId !== telegramId) {
            logger.error(`Equipment ${equipmentInvId} not found in inventory for user ${telegramId}`);
            return null;
        }

        // Delete the equipment from the user's inventory
        const deletedEquipment = await prisma.equipmentInventory.delete({
            where: {
                id: equipmentInvId
            },
            include: {
                equipment: true // Include equipment details
            }
        });

        logger.info(`Deleted equipment ${equipmentInventory.equipment.name} (ID: ${equipmentInvId}) from user ${telegramId}'s inventory.`);
        return deletedEquipment;

    } catch (error) {
        logger.error(`Failed to delete equipment ${equipmentInvId} from user ${telegramId}'s inventory: ${error}`);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}
