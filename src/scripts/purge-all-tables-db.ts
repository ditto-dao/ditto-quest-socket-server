import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

async function resetAutoIncrement(table: string) {
    // This is MySQL syntax to reset the auto-increment to 1
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
}

async function deleteSpecificTables() {
    try {
        logger.info('Starting to delete data from specific tables...');

        // Delete records from dependent tables first (CraftingRecipeItems -> CraftingRecipe)
        await prisma.craftingRecipeItems.deleteMany();
        logger.info('Deleted all records from CraftingRecipeItems.');
        await resetAutoIncrement('CraftingRecipeItems');

        await prisma.craftingRecipe.deleteMany();
        logger.info('Deleted all records from CraftingRecipe.');
        await resetAutoIncrement('CraftingRecipe');

        // Then delete from Equipment and Items tables
        await prisma.equipment.deleteMany();
        logger.info('Deleted all records from Equipment.');
        await resetAutoIncrement('Equipment');

        await prisma.item.deleteMany();
        logger.info('Deleted all records from Item.');
        await resetAutoIncrement('Item');

        await prisma.slimeTrait.deleteMany();
        logger.info('Deleted all records from SlimeTrait.');
        await resetAutoIncrement('SlimeTrait');


        logger.info('Successfully deleted all data and reset auto-increment from the specified tables.');
    } catch (error) {
        logger.error(`Error deleting data from tables: ${error}`);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

deleteSpecificTables();
