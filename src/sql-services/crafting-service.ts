import { logger } from '../utils/logger';
import { prisma } from './client';

interface CraftingRecipeRes {
  equipmentId: number;
  equipmentName: string;
  durationS: number;
  requiredItems: {
    itemId: number;
    itemName: string;
    quantity: number;
  }[];
}

export async function getCraftingRecipeForItem(equipmentId: number): Promise<CraftingRecipeRes> {
  try {
    const recipe = await prisma.craftingRecipe.findUnique({
      where: { equipmentId },
      include: {
        equipment: {
          select: {
            name: true
          }
        },
        CraftingRecipeItems: {
          include: {
            item: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!recipe) {
      throw new Error(`Crafting recipe not found.`)
    }

    const craftingRecipe: CraftingRecipeRes = {
      equipmentId: recipe.equipmentId,
      equipmentName: recipe.equipment.name,
      durationS: recipe.durationS,
      requiredItems: recipe.CraftingRecipeItems.map((recipeItem) => ({
        itemId: recipeItem.itemId,
        itemName: recipeItem.item.name,
        quantity: recipeItem.quantity
      }))
    };

    logger.info(`Fetched crafting recipe for equipmentId: ${equipmentId}`);
    return craftingRecipe;
  } catch (error) {
    logger.error(`Failed to get crafting recipe: ${error}`);
    throw error;
  }
}
