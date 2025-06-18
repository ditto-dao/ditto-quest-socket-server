import { FullCraftingRecipe, GameCodexManager } from '../managers/game-codex/game-codex-manager';
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

/**
 * Updated Crafting Service - Memory first with Prisma fallback
 */
export async function getCraftingRecipeForEquipment(equipmentId: number): Promise<CraftingRecipeRes> {
  try {
    // Try memory cache first
    if (GameCodexManager.isReady()) {
      // Get equipment details from memory cache
      const equipment = GameCodexManager.getEquipment(equipmentId);
      if (equipment) {
        // Get the full recipe from the dedicated crafting recipes cache
        const recipe: FullCraftingRecipe | null = GameCodexManager.getCraftingRecipe(equipmentId);

        if (recipe) {
          // Build the response using memory data
          const craftingRecipe: CraftingRecipeRes = {
            equipmentId: recipe.equipmentId,
            equipmentName: equipment.name,
            durationS: recipe.durationS,
            craftingLevelRequired: recipe.craftingLevelRequired,
            craftingExp: recipe.craftingExp,
            requiredItems: recipe.CraftingRecipeItems.map((recipeItem) => {
              // Get item details from memory cache
              const item = GameCodexManager.getItem(recipeItem.itemId);
              if (!item) {
                throw new Error(`Item not found for ID: ${recipeItem.itemId}`);
              }

              return {
                itemId: recipeItem.itemId,
                itemName: item.name,
                quantity: recipeItem.quantity,
                imgsrc: item.imgsrc
              };
            })
          };

          logger.debug(`Fetched crafting recipe for equipmentId: ${equipmentId} from memory cache`);
          return craftingRecipe;
        }

        // Alternative: if the recipe is not in the separate cache, try getting it from equipment
        if (equipment.CraftingRecipe.length > 0) {
          const basicRecipe = equipment.CraftingRecipe[0];
          // This won't have CraftingRecipeItems, so we'd still need to fall back to database
          logger.warn(`Equipment ${equipmentId} has basic recipe but no full recipe in cache, falling back to database`);
        }
      }
    }
  } catch (error) {
    logger.warn(`Memory cache failed for getCraftingRecipeForEquipment(${equipmentId}): ${error}`);
  }

  // Fallback to database
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