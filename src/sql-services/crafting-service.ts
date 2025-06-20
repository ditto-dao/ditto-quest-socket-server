import { logger } from '../utils/logger';
import { prisma } from './client';

export interface CraftingRecipeRes {
  equipmentId: number;
  equipmentName: string;
  durationS: number;
  craftingLevelRequired: number;
  craftingExp: number;
  requiredItems: {
    itemId: number;
    itemName: string;
    quantity: number;
    imgsrc: string;
  }[];
}

export async function prismaFetchCraftingRecipeForEquipment(equipmentId: number): Promise<CraftingRecipeRes> {
  try {
    logger.info(`Falling back to database for getCraftingRecipeForEquipment(${equipmentId})`);

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
                name: true,
                imgsrc: true
              }
            }
          }
        }
      }
    });

    if (!recipe) {
      throw new Error(`Crafting recipe not found for equipment ID: ${equipmentId}`);
    }

    const craftingRecipe: CraftingRecipeRes = {
      equipmentId: recipe.equipmentId,
      equipmentName: recipe.equipment.name,
      durationS: recipe.durationS,
      craftingLevelRequired: recipe.craftingLevelRequired,
      craftingExp: recipe.craftingExp,
      requiredItems: recipe.CraftingRecipeItems.map((recipeItem) => ({
        itemId: recipeItem.itemId,
        itemName: recipeItem.item.name,
        quantity: recipeItem.quantity,
        imgsrc: recipeItem.item.imgsrc
      }))
    };

    logger.info(`Fetched crafting recipe for equipmentId: ${equipmentId} from database`);
    return craftingRecipe;
  } catch (error) {
    logger.error(`Failed to get crafting recipe from database: ${error}`);
    throw error;
  }
}