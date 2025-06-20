import { Item, Rarity, StatEffect } from "@prisma/client";
import { GameCodexManager } from "../managers/game-codex/game-codex-manager";
import { logger } from "../utils/logger";
import { prismaFetchAllItems, prismaFetchItemById, prismaFetchItemsByRarity, prismaFetchRandomItemByRarity } from "../sql-services/item-service";

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
    return await prismaFetchAllItems();
}

export async function getItemById(itemId: number): Promise<Item & { statEffect: StatEffect | null } | null> {
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
    return await prismaFetchItemById(itemId);
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
    return await prismaFetchItemsByRarity(rarity);
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
    return await prismaFetchRandomItemByRarity(rarity);
}