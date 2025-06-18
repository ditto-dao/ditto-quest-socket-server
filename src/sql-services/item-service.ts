import { Item, Rarity } from "@prisma/client";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";
import { logger } from "../utils/logger";
import { prisma } from "./client";

export async function getAllItems(): Promise<Item[]> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const items = GameCodexManager.getAllItems();
            logger.debug(`Retrieved ${items.length} items from memory cache`);
            return items;
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getAllItems: ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getAllItems`);
        const items = await prisma.item.findMany();
        return items;
    } catch (error) {
        logger.error(`Failed to get items from database: ${error}`);
        throw error;
    }
}

export async function getItemById(itemId: number): Promise<Item | null> {
    try {
        // Try memory cache first - O(1) lookup
        if (GameCodexManager.isReady()) {
            const item = GameCodexManager.getItem(itemId);
            if (item) {
                logger.debug(`Retrieved item ${itemId} from memory cache`);
                return item;
            }
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getItemById(${itemId}): ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getItemById(${itemId})`);
        const item = await prisma.item.findUnique({
            where: { id: itemId },
            include: { statEffect: true }
        });
        return item;
    } catch (error) {
        logger.error(`Failed to get item with ID ${itemId} from database: ${error}`);
        throw error;
    }
}

export async function getItemsByRarity(rarity: Rarity): Promise<Item[]> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const allItems = GameCodexManager.getAllItems();
            const items = allItems.filter(item => item.rarity === rarity);
            logger.debug(`Retrieved ${items.length} items with rarity ${rarity} from memory cache`);
            return items;
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getItemsByRarity(${rarity}): ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getItemsByRarity(${rarity})`);
        const items = await prisma.item.findMany({
            where: { rarity }
        });
        return items;
    } catch (error) {
        logger.error(`Failed to get items with rarity ${rarity} from database: ${error}`);
        throw error;
    }
}

export async function getRandomItemByRarity(rarity: Rarity): Promise<Item | null> {
    try {
        // Try memory cache first
        if (GameCodexManager.isReady()) {
            const items = await getItemsByRarity(rarity);
            
            if (items.length === 0) {
                logger.error(`No items found with rarity: ${rarity}`);
                return null;
            }

            const randomIndex = Math.floor(Math.random() * items.length);
            logger.debug(`Retrieved random item with rarity ${rarity} from memory cache`);
            return items[randomIndex];
        }
    } catch (error) {
        logger.warn(`Memory cache failed for getRandomItemByRarity(${rarity}): ${error}`);
    }

    // Fallback to database
    try {
        logger.info(`Falling back to database for getRandomItemByRarity(${rarity})`);
        
        // Count items of the specified rarity
        const count = await prisma.item.count({
            where: { rarity }
        });

        if (count === 0) {
            logger.error(`No items found with rarity: ${rarity}`);
            return null;
        }

        // Generate a random offset within the count range
        const randomOffset = Math.floor(Math.random() * count);

        // Retrieve the item at the random offset
        const [randomItem] = await prisma.item.findMany({
            where: { rarity },
            skip: randomOffset,
            take: 1
        });

        return randomItem;
    } catch (error) {
        logger.error(`Failed to get a random item by rarity ${rarity} from database: ${error}`);
        throw error;
    }
}