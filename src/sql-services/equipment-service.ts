import { Equipment, Rarity, EquipmentType, Prisma } from "@prisma/client";
import { prisma } from "./client";
import { logger } from "../utils/logger";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";

/**
 * Updated Equipment Service - Memory first with Prisma fallback
 * Tries memory cache first, falls back to database if memory unavailable
 */

export async function getAllEquipment(): Promise<Equipment[]> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const equipment = GameCodexManager.getAllEquipment();
            logger.debug(`Retrieved ${equipment.length} equipment from memory cache`);
            return equipment;
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getAllEquipment: ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getAllEquipment`);
        const equipment = await prisma.equipment.findMany();
        return equipment;
    } catch (error) {
        logger.error(`Failed to get equipment from database: ${error}`);
        throw error;
    }
}

export async function getEquipmentById(equipmentId: number): Promise<Prisma.EquipmentGetPayload<{
    include: { statEffect: true, CraftingRecipe: true };
}> | null> {
    try {
        // Try memory cache first - O(1) lookup
        if (GameCodexManager.isReady()) {
            const equipment = GameCodexManager.getEquipment(equipmentId);
            if (equipment) {
                logger.debug(`Retrieved equipment ${equipmentId} from memory cache`);
                return equipment;
            }
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getEquipmentById(${equipmentId}): ${error}`);
    }

    // Fallback to database
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

export async function getEquipmentByRarity(rarity: Rarity): Promise<Equipment[]> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const allEquipment = GameCodexManager.getAllEquipment();
            const equipment = allEquipment.filter(eq => eq.rarity === rarity);
            logger.debug(`Retrieved ${equipment.length} equipment with rarity ${rarity} from memory cache`);
            return equipment;
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getEquipmentByRarity(${rarity}): ${error}`);
    }

    // Fallback to database
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

export async function getRandomEquipmentByRarity(rarity: Rarity): Promise<Equipment | null> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const equipment = await getEquipmentByRarity(rarity);

            if (equipment.length === 0) {
                logger.error(`No equipment found with rarity: ${rarity}`);
                return null;
            }

            const randomIndex = Math.floor(Math.random() * equipment.length);
            logger.debug(`Retrieved random equipment with rarity ${rarity} from memory cache`);
            return equipment[randomIndex];
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getRandomEquipmentByRarity(${rarity}): ${error}`);
    }

    // Fallback to database
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

export async function getEquipmentByType(type: EquipmentType): Promise<Equipment[]> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const allEquipment = GameCodexManager.getAllEquipment();
            const equipment = allEquipment.filter(eq => eq.type === type);
            logger.debug(`Retrieved ${equipment.length} equipment with type ${type} from memory cache`);
            return equipment;
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getEquipmentByType(${type}): ${error}`);
    }

    // Fallback to database
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
