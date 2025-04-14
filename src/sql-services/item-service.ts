import { Item, Rarity } from "@prisma/client";
import { prisma } from "./client";
import { logger } from "../utils/logger";

export async function getAllItems(): Promise<Item[]> {
    try {
        const items = await prisma.item.findMany();
        return items;
    } catch (error) {
        logger.error(`Failed to get items: ${error}`);
        throw error;
    }
}

export async function getItemById(itemId: number): Promise<Item | null> {
    try {
        const item = await prisma.item.findUnique({
            where: { id: itemId },
            include: { statEffect: true }  // Include related consumable if applicable
        });
        return item;
    } catch (error) {
        logger.error(`Failed to get item with ID ${itemId}: ${error}`);
        throw error;
    }
}

export async function getItemsByRarity(rarity: Rarity): Promise<Item[]> {
    try {
        const items = await prisma.item.findMany({
            where: { rarity }
        });
        return items;
    } catch (error) {
        logger.error(`Failed to get items with rarity ${rarity}: ${error}`);
        throw error;
    }
}

export async function getRandomItemByRarity(rarity: Rarity): Promise<Item | null> {
    try {
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
        logger.error(`Failed to get a random item by rarity ${rarity}: ${error}`);
        throw error;
    }
}
