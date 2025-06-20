import { Item, Rarity, StatEffect } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "./client";

export async function prismaFetchAllItems(): Promise<Item[]> {
    try {
        logger.info(`Falling back to database for getAllItems`);
        const items = await prisma.item.findMany();
        return items;
    } catch (error) {
        logger.error(`Failed to get items from database: ${error}`);
        throw error;
    }
}

export async function prismaFetchItemById(itemId: number): Promise<Item & { statEffect: StatEffect | null } | null> {
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

export async function prismaFetchItemsByRarity(rarity: Rarity): Promise<Item[]> {
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

export async function prismaFetchRandomItemByRarity(rarity: Rarity): Promise<Item | null> {
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