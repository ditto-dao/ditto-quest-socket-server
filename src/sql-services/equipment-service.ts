import { Equipment, Rarity, EquipmentType } from "@prisma/client";
import { prisma } from "./client";
import { logger } from "../utils/logger";

// Get all equipment
export async function getAllEquipment(): Promise<Equipment[]> {
    try {
        const equipment = await prisma.equipment.findMany();
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment: ${error}`);
        throw error;
    }
}

// Get equipment by ID
export async function getEquipmentById(equipmentId: number): Promise<Equipment | null> {
    try {
        const equipment = await prisma.equipment.findUnique({
            where: { id: equipmentId },
            include: { CraftingRecipe: true }  // Include related crafting recipe if applicable
        });
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment with ID ${equipmentId}: ${error}`);
        throw error;
    }
}

// Get equipment by rarity
export async function getEquipmentByRarity(rarity: Rarity): Promise<Equipment[]> {
    try {
        const equipment = await prisma.equipment.findMany({
            where: { rarity }
        });
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment with rarity ${rarity}: ${error}`);
        throw error;
    }
}

// Get random equipment by rarity
export async function getRandomEquipmentByRarity(rarity: Rarity): Promise<Equipment | null> {
    try {
        // Count equipment of the specified rarity
        const count = await prisma.equipment.count({
            where: { rarity }
        });

        if (count === 0) {
            logger.error(`No equipment found with rarity: ${rarity}`);
            return null;
        }

        // Generate a random offset within the count range
        const randomOffset = Math.floor(Math.random() * count);

        // Retrieve the equipment at the random offset
        const [randomEquipment] = await prisma.equipment.findMany({
            where: { rarity },
            skip: randomOffset,
            take: 1
        });

        return randomEquipment;
    } catch (error) {
        logger.error(`Failed to get a random equipment by rarity ${rarity}: ${error}`);
        throw error;
    }
}

// Get equipment by type
export async function getEquipmentByType(type: EquipmentType): Promise<Equipment[]> {
    try {
        const equipment = await prisma.equipment.findMany({
            where: { type }
        });
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment by type ${type}: ${error}`);
        throw error;
    }
}