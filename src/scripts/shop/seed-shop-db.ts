import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';
import { ShopItemType, ServiceType } from '@prisma/client';
import { parseUnits } from 'ethers';
import { DITTO_DECIMALS } from '../../utils/config';

// CONFIGURE THESE LISTS
const EQUIPMENT_IDS = [112, 113, 114, 115, 116, 117, 118, 119]; // Equipment IDs here
const ITEM_IDS: number[] = []; // Item IDs here

const EQUIPMENT_STARS_PRICE: Record<number, number> = {
    112: 150,
    113: 600,
    114: 150,
    115: 600,
    116: 250,
    117: 1200,
    118: 250,
    119: 1200
}

/* const EQUIPMENT_STARS_PRICE: Record<number, number> = {
    112: 4,
    113: 14,
    114: 4,
    115: 14,
    116: 8,
    117: 28,
    118: 8,
    119: 28
} */

const ITEMS_STARS_PRICE: Record<number, number> = {
}

async function resetShopAutoIncrement() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`ShopItem\` AUTO_INCREMENT = 1`);
        logger.info("🔁 Reset AUTO_INCREMENT for ShopItem table");
    } catch (err) {
        logger.error(`❌ Failed to reset AUTO_INCREMENT for ShopItem: ${err}`);
    }
}

async function seedShop() {
    try {
        logger.info("🏪 Starting shop seeding...");

        // Clear existing shop items
        await prisma.shopItem.deleteMany();
        logger.info("🗑️ Cleared existing shop items");

        // Reset auto-increment to start from 1
        await resetShopAutoIncrement();

        const shopItems = [];

        // EQUIPMENT ITEMS - Fetch from database and use their prices
        for (const equipmentId of EQUIPMENT_IDS) {
            const equipment = await prisma.equipment.findUnique({
                where: { id: equipmentId }
            });

            if (equipment) {
                shopItems.push({
                    type: ShopItemType.EQUIPMENT,
                    equipmentId: equipmentId,
                    name: equipment.name,
                    priceGP: equipment.buyPriceGP,
                    priceDittoWei: equipment.buyPriceDittoWei?.toString(),
                    priceStars: EQUIPMENT_STARS_PRICE[equipmentId] ?? undefined
                });
                logger.info(`📦 Added equipment ${equipmentId} to shop`);
            } else {
                logger.warn(`⚠️ Equipment ${equipmentId} not found, skipping`);
            }
        }

        // ITEM ITEMS - Fetch from database and use their prices
        for (const itemId of ITEM_IDS) {
            const item = await prisma.item.findUnique({
                where: { id: itemId }
            });

            if (item) {
                shopItems.push({
                    type: ShopItemType.ITEM,
                    name: item.name,
                    itemId: itemId,
                    priceGP: item.buyPriceGP,
                    priceDittoWei: item.buyPriceDittoWei?.toString(),
                    priceStars: ITEMS_STARS_PRICE[itemId] ?? undefined
                });
                logger.info(`📦 Added item ${itemId} to shop`);
            } else {
                logger.warn(`⚠️ Item ${itemId} not found, skipping`);
            }
        }

        // SERVICE ITEMS
        shopItems.push(
            {
                type: ShopItemType.SERVICE,
                serviceType: ServiceType.STAT_RESET_POINT,
                name: "Elixir of Unmaking",
                priceGP: 250000,
                priceDittoWei: parseUnits("5000", DITTO_DECIMALS).toString(),
                priceStars: 20,
            },
            {
                type: ShopItemType.SERVICE,
                serviceType: ServiceType.INVENTORY_SLOT,
                name: "Satchel Draught",
                priceGP: 2000000,
                priceDittoWei: parseUnits("40000", DITTO_DECIMALS).toString(),
                priceStars: 60,
            },
            {
                type: ShopItemType.SERVICE,
                serviceType: ServiceType.SLIME_INVENTORY_SLOT,
                name: "Slimebond Serum",
                priceGP: 1000000,
                priceDittoWei: parseUnits("20000", DITTO_DECIMALS).toString(),
                priceStars: 30,
            }
        );

        // Create all shop items in batch
        await prisma.shopItem.createMany({
            data: shopItems
        });

        logger.info(`✅ Seeded ${shopItems.length} shop items`);

        // Verify the first item has ID 1
        const firstItem = await prisma.shopItem.findFirst({
            orderBy: { id: 'asc' }
        });

        if (firstItem) {
            logger.info(`🎯 First shop item ID: ${firstItem.id} (${firstItem.name})`);
            if (firstItem.id !== 1) {
                logger.warn(`⚠️ Warning: First shop item ID is ${firstItem.id}, not 1`);
            }
        }

        const count = await prisma.shopItem.count();
        logger.info(`📊 Total shop items in database: ${count}`);

    } catch (error) {
        logger.error(`❌ Error seeding shop: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

seedShop();