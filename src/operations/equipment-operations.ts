import { logger } from "../utils/logger";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";
import { Equipment, EquipmentType, Prisma, Rarity } from "@prisma/client";
import { prismaFetchAllEquipment, prismaFetchEquipmentById, prismaFetchEquipmentByRarity, prismaFetchEquipmentByType, prismaFetchRandomEquipmentByRarity } from "../sql-services/equipment-service";

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

    return await prismaFetchAllEquipment();
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
    return await prismaFetchEquipmentById(equipmentId);
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
    return await prismaFetchEquipmentByRarity(rarity);
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
    return await prismaFetchRandomEquipmentByRarity(rarity);
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
    return await prismaFetchEquipmentByType(type);
}
