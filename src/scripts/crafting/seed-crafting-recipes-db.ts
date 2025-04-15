import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

async function seedCraftingRecipes() {
  try {
    const recipePath = path.join(__dirname, '../../encyclopedia/crafting-recipe.json');
    const recipeData = JSON.parse(fs.readFileSync(recipePath, 'utf-8'));

    for (const craftingRecipe of recipeData) {
      // First, delete any existing CraftingRecipeItems for this equipmentId (if updating)
      const existing = await prisma.craftingRecipe.findUnique({
        where: { equipmentId: craftingRecipe.equipmentId },
        select: { id: true },
      });

      if (existing) {
        await prisma.craftingRecipeItems.deleteMany({
          where: { recipeId: existing.id },
        });
      }

      const upsertedRecipe = await prisma.craftingRecipe.upsert({
        where: { equipmentId: craftingRecipe.equipmentId },
        update: {
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
        create: {
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
          CraftingRecipeItems: true,
        },
      });

      logger.info(
        `✅ Upserted crafting recipe for equipment ID ${upsertedRecipe.equipmentId} with items: ${JSON.stringify(
          upsertedRecipe.CraftingRecipeItems
        )}`
      );
    }
  } catch (error) {
    logger.error(`Error seeding crafting recipes: ${error}`);
  } finally {
    await prisma.$disconnect();
  }
}

seedCraftingRecipes();