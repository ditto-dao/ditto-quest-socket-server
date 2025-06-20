import { Equipment, Rarity, EquipmentType, Prisma } from "@prisma/client";
import { prisma } from "./client";
import { logger } from "../utils/logger";

export async function prismaFetchAllEquipment(): Promise<Equipment[]> {
    try {
        logger.info(`Falling back to database for getAllEquipment`);
        const equipment = await prisma.equipment.findMany();
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment from database: ${error}`);
        throw error;
    }
}

export async function prismaFetchEquipmentById(equipmentId: number): Promise<Prisma.EquipmentGetPayload<{
    include: { statEffect: true, CraftingRecipe: true };
}> | null> {
    try {
        logger.info(`Falling back to database for getEquipmentById(${equipmentId})`);
        const equipment = await prisma.equipment.findUnique({
            where: { id: equipmentId },
            include: { CraftingRecipe: true, statEffect: true }
        });
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment with ID ${equipmentId} from database: ${error}`);
        throw error;
    }
}

export async function prismaFetchEquipmentByRarity(rarity: Rarity): Promise<Equipment[]> {
    try {
        logger.info(`Falling back to database for getEquipmentByRarity(${rarity})`);
        const equipment = await prisma.equipment.findMany({
            where: { rarity }
        });
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment with rarity ${rarity} from database: ${error}`);
        throw error;
    }
}

export async function prismaFetchRandomEquipmentByRarity(rarity: Rarity): Promise<Equipment | null> {
    try {
        logger.info(`Falling back to database for getRandomEquipmentByRarity(${rarity})`);
        
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
        logger.error(`Failed to get a random equipment by rarity ${rarity} from database: ${error}`);
        throw error;
    }
}

export async function prismaFetchEquipmentByType(type: EquipmentType): Promise<Equipment[]> {
    try {
        logger.info(`Falling back to database for getEquipmentByType(${type})`);
        const equipment = await prisma.equipment.findMany({
            where: { type }
        });
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment by type ${type} from database: ${error}`);
        throw error;
    }
}
