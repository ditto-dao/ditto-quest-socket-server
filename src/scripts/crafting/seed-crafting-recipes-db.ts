import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

async function seedCraftingRecipes() {
    try {
        // Read crafting recipe data from the JSON file
        const recipePath = path.join(__dirname, '../../encyclopedia/crafting-recipe.json');
        const recipeData = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));

        // Loop through the recipes and seed them into the database
        for (const craftingRecipe of recipeData) {

            // Insert the crafting recipe, Prisma will auto-handle the auto-increment IDs
            const createdRecipe = await prisma.craftingRecipe.create({
                data: {
                    equipmentId: craftingRecipe.equipmentId,
                    durationS: craftingRecipe.durationS,
                    craftingLevelRequired: craftingRecipe.craftingLevelRequired,
                    craftingExp: craftingRecipe.craftingExp,
                    CraftingRecipeItems: {
                        create: craftingRecipe.CraftingRecipeItems.map((item: any) => ({
                            itemId: item.itemId,
                            quantity: item.quantity,
                        })),
                    },
                },
                include: {
                    CraftingRecipeItems: true, // To include the items in the log
                },
            });

            logger.info(`Inserted crafting recipe for equipment ID ${createdRecipe.equipmentId} with items: ${JSON.stringify(createdRecipe.CraftingRecipeItems)}`);
        }
    } catch (error) {
        logger.error(`Error seeding crafting recipes: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

seedCraftingRecipes();
