import { Rarity, Slime, SlimeTrait, StatEffect, TraitType, User } from '@prisma/client';
import { prisma } from './client';
import { logger } from '../utils/logger';
import { rarities } from '../utils/helpers';

export type SlimeWithTraits = Slime & {
  owner: Pick<User, 'telegramId'>;
  imageUri: string;

  BodyDominant: SlimeTrait & { statEffect: StatEffect | null };
  BodyHidden1: SlimeTrait & { statEffect: StatEffect | null };
  BodyHidden2: SlimeTrait & { statEffect: StatEffect | null };
  BodyHidden3: SlimeTrait & { statEffect: StatEffect | null };

  PatternDominant: SlimeTrait & { statEffect: StatEffect | null };
  PatternHidden1: SlimeTrait & { statEffect: StatEffect | null };
  PatternHidden2: SlimeTrait & { statEffect: StatEffect | null };
  PatternHidden3: SlimeTrait & { statEffect: StatEffect | null };

  PrimaryColourDominant: SlimeTrait & { statEffect: StatEffect | null };
  PrimaryColourHidden1: SlimeTrait & { statEffect: StatEffect | null };
  PrimaryColourHidden2: SlimeTrait & { statEffect: StatEffect | null };
  PrimaryColourHidden3: SlimeTrait & { statEffect: StatEffect | null };

  AccentDominant: SlimeTrait & { statEffect: StatEffect | null };
  AccentHidden1: SlimeTrait & { statEffect: StatEffect | null };
  AccentHidden2: SlimeTrait & { statEffect: StatEffect | null };
  AccentHidden3: SlimeTrait & { statEffect: StatEffect | null };

  DetailDominant: SlimeTrait & { statEffect: StatEffect | null };
  DetailHidden1: SlimeTrait & { statEffect: StatEffect | null };
  DetailHidden2: SlimeTrait & { statEffect: StatEffect | null };
  DetailHidden3: SlimeTrait & { statEffect: StatEffect | null };

  EyeColourDominant: SlimeTrait & { statEffect: StatEffect | null };
  EyeColourHidden1: SlimeTrait & { statEffect: StatEffect | null };
  EyeColourHidden2: SlimeTrait & { statEffect: StatEffect | null };
  EyeColourHidden3: SlimeTrait & { statEffect: StatEffect | null };

  EyeShapeDominant: SlimeTrait & { statEffect: StatEffect | null };
  EyeShapeHidden1: SlimeTrait & { statEffect: StatEffect | null };
  EyeShapeHidden2: SlimeTrait & { statEffect: StatEffect | null };
  EyeShapeHidden3: SlimeTrait & { statEffect: StatEffect | null };

  MouthDominant: SlimeTrait & { statEffect: StatEffect | null };
  MouthHidden1: SlimeTrait & { statEffect: StatEffect | null };
  MouthHidden2: SlimeTrait & { statEffect: StatEffect | null };
  MouthHidden3: SlimeTrait & { statEffect: StatEffect | null };
};

export async function prismaFetchSlimeTraitById(traitId: number) {
  try {
    logger.info(`Falling back to database for getSlimeTraitById(${traitId})`);

    const trait = await prisma.slimeTrait.findUnique({
      where: { id: traitId },
      include: {
        statEffect: true
      }
    });

    if (trait) {
      logger.info(`Retrieved slime trait from database: ${trait.name}`);
    }
    return trait;
  } catch (error) {
    logger.error(`Failed to get slime trait with ID ${traitId} from database: ${error}`);
    throw error;
  }
}

export async function prismaFetchSlimeObjectWithTraits(slimeId: number): Promise<SlimeWithTraits> {
  try {
    const slime = await prisma.slime.findUnique({
      where: { id: slimeId },
      include: {
        owner: { select: { telegramId: true } },

        BodyDominant: { include: { statEffect: true } },
        BodyHidden1: { include: { statEffect: true } },
        BodyHidden2: { include: { statEffect: true } },
        BodyHidden3: { include: { statEffect: true } },

        PatternDominant: { include: { statEffect: true } },
        PatternHidden1: { include: { statEffect: true } },
        PatternHidden2: { include: { statEffect: true } },
        PatternHidden3: { include: { statEffect: true } },

        PrimaryColourDominant: { include: { statEffect: true } },
        PrimaryColourHidden1: { include: { statEffect: true } },
        PrimaryColourHidden2: { include: { statEffect: true } },
        PrimaryColourHidden3: { include: { statEffect: true } },

        AccentDominant: { include: { statEffect: true } },
        AccentHidden1: { include: { statEffect: true } },
        AccentHidden2: { include: { statEffect: true } },
        AccentHidden3: { include: { statEffect: true } },

        DetailDominant: { include: { statEffect: true } },
        DetailHidden1: { include: { statEffect: true } },
        DetailHidden2: { include: { statEffect: true } },
        DetailHidden3: { include: { statEffect: true } },

        EyeColourDominant: { include: { statEffect: true } },
        EyeColourHidden1: { include: { statEffect: true } },
        EyeColourHidden2: { include: { statEffect: true } },
        EyeColourHidden3: { include: { statEffect: true } },

        EyeShapeDominant: { include: { statEffect: true } },
        EyeShapeHidden1: { include: { statEffect: true } },
        EyeShapeHidden2: { include: { statEffect: true } },
        EyeShapeHidden3: { include: { statEffect: true } },

        MouthDominant: { include: { statEffect: true } },
        MouthHidden1: { include: { statEffect: true } },
        MouthHidden2: { include: { statEffect: true } },
        MouthHidden3: { include: { statEffect: true } },
      },
    });

    if (!slime) throw new Error(`Slime object not found.`);

    return slime;
  } catch (error) {
    logger.error(`Failed to fetch slime object: ${error}`);
    throw error;
  }
}

export async function prismaFetchRandomSlimeTraitId(traitType: TraitType, probabilities: number[]): Promise<{ traitId: number, rarity: Rarity }> {
  try {
    // Ensure the probabilities array is of length 5 and sums to 1
    if (probabilities.length !== 5 || probabilities.reduce((sum, p) => sum + p, 0) > 1e10) {
      throw new Error(`Probabilities array must have 5 elements and sum to 1. probabilities: ${probabilities}`);
    }

    // Step 1: Select a rarity based on probabilities
    let random = Math.random();
    let cumulativeProbability = 0;
    let selectedRarity: Rarity | null = null;

    for (let i = 0; i < rarities.length; i++) {
      cumulativeProbability += probabilities[i];
      if (random < cumulativeProbability) {
        selectedRarity = rarities[i];
        break;
      }
    }

    if (!selectedRarity) {
      throw new Error("Failed to select a rarity based on probabilities.");
    }

    // Step 2: Fetch all trait IDs of the selected rarity and type
    const traits = await prisma.slimeTrait.findMany({
      where: { type: traitType, rarity: selectedRarity as Rarity },
      select: { id: true },
    });

    if (!traits || traits.length === 0) {
      throw new Error(`No traits found for rarity ${selectedRarity} and type ${traitType}.`);
    }

    // Step 3: Randomly select one trait ID from the fetched IDs
    const randomIndex = Math.floor(Math.random() * traits.length);
    return {
      traitId: traits[randomIndex].id,
      rarity: selectedRarity!
    };
  } catch (error) {
    logger.error(`Failed to get random slime trait ID: ${error}`);
    throw error;
  }
}

export async function prismaFetchEquippedSlimeWithTraits(telegramId: string): Promise<SlimeWithTraits | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: {
        equippedSlime: {
          include: {
            owner: { select: { telegramId: true } },
            BodyDominant: { include: { statEffect: true } },
            BodyHidden1: { include: { statEffect: true } },
            BodyHidden2: { include: { statEffect: true } },
            BodyHidden3: { include: { statEffect: true } },
            PatternDominant: { include: { statEffect: true } },
            PatternHidden1: { include: { statEffect: true } },
            PatternHidden2: { include: { statEffect: true } },
            PatternHidden3: { include: { statEffect: true } },
            PrimaryColourDominant: { include: { statEffect: true } },
            PrimaryColourHidden1: { include: { statEffect: true } },
            PrimaryColourHidden2: { include: { statEffect: true } },
            PrimaryColourHidden3: { include: { statEffect: true } },
            AccentDominant: { include: { statEffect: true } },
            AccentHidden1: { include: { statEffect: true } },
            AccentHidden2: { include: { statEffect: true } },
            AccentHidden3: { include: { statEffect: true } },
            DetailDominant: { include: { statEffect: true } },
            DetailHidden1: { include: { statEffect: true } },
            DetailHidden2: { include: { statEffect: true } },
            DetailHidden3: { include: { statEffect: true } },
            EyeColourDominant: { include: { statEffect: true } },
            EyeColourHidden1: { include: { statEffect: true } },
            EyeColourHidden2: { include: { statEffect: true } },
            EyeColourHidden3: { include: { statEffect: true } },
            EyeShapeDominant: { include: { statEffect: true } },
            EyeShapeHidden1: { include: { statEffect: true } },
            EyeShapeHidden2: { include: { statEffect: true } },
            EyeShapeHidden3: { include: { statEffect: true } },
            MouthDominant: { include: { statEffect: true } },
            MouthHidden1: { include: { statEffect: true } },
            MouthHidden2: { include: { statEffect: true } },
            MouthHidden3: { include: { statEffect: true } }
          }
        }
      }
    });

    return user?.equippedSlime ?? null;
  } catch (error) {
    console.error(`Failed to fetch equipped slime with traits for user ${telegramId}:`, error);
    throw error;
  }
}

/**
 * Inserts slimes into DB using trait IDs
 */
export async function prismaInsertSlimesToDB(ownerId: string, slimes: SlimeWithTraits[]): Promise<void> {
  logger.debug(`🐌 [DB] Starting transaction to insert ${slimes.length} slimes for owner ${ownerId}`);

  try {
    await prisma.$transaction(async (tx) => {
      logger.debug(`🐌 [DB] Transaction started, processing ${slimes.length} slimes...`);

      for (let i = 0; i < slimes.length; i++) {
        const slime = slimes[i];
        logger.debug(`🐌 [DB] Creating slime ${i + 1}/${slimes.length} with ID ${slime.id}...`);

        try {
          await tx.slime.create({
            data: {
              ownerId,
              generation: slime.generation,
              imageUri: slime.imageUri,
              // All the trait fields...
              Body_D: slime.Body_D,
              Body_H1: slime.Body_H1,
              Body_H2: slime.Body_H2,
              Body_H3: slime.Body_H3,
              Pattern_D: slime.Pattern_D,
              Pattern_H1: slime.Pattern_H1,
              Pattern_H2: slime.Pattern_H2,
              Pattern_H3: slime.Pattern_H3,
              PrimaryColour_D: slime.PrimaryColour_D,
              PrimaryColour_H1: slime.PrimaryColour_H1,
              PrimaryColour_H2: slime.PrimaryColour_H2,
              PrimaryColour_H3: slime.PrimaryColour_H3,
              Accent_D: slime.Accent_D,
              Accent_H1: slime.Accent_H1,
              Accent_H2: slime.Accent_H2,
              Accent_H3: slime.Accent_H3,
              Detail_D: slime.Detail_D,
              Detail_H1: slime.Detail_H1,
              Detail_H2: slime.Detail_H2,
              Detail_H3: slime.Detail_H3,
              EyeColour_D: slime.EyeColour_D,
              EyeColour_H1: slime.EyeColour_H1,
              EyeColour_H2: slime.EyeColour_H2,
              EyeColour_H3: slime.EyeColour_H3,
              EyeShape_D: slime.EyeShape_D,
              EyeShape_H1: slime.EyeShape_H1,
              EyeShape_H2: slime.EyeShape_H2,
              EyeShape_H3: slime.EyeShape_H3,
              Mouth_D: slime.Mouth_D,
              Mouth_H1: slime.Mouth_H1,
              Mouth_H2: slime.Mouth_H2,
              Mouth_H3: slime.Mouth_H3,
            },
          });

          logger.debug(`🐌 [DB] Successfully created slime ${slime.id}`);
        } catch (slimeError) {
          logger.error(`❌ [DB] Failed to create individual slime ${slime.id}:`);
          logger.error(`   Slime data:`, JSON.stringify(slime, null, 2));
          throw slimeError;
        }
      }

      logger.debug(`🐌 [DB] Transaction completed successfully for ${slimes.length} slimes`);
    });

    logger.info(`💾 [DB] Successfully inserted ${slimes.length} slimes for owner ${ownerId}`);

  } catch (error) {
    logger.error(`❌ [DB] Failed to insert slimes for owner ${ownerId}:`);
    logger.error(`   Error message: ${(error as Error).message}`);
    logger.error(`   Number of slimes: ${slimes.length}`);
    logger.error(`   Slime IDs: [${slimes.map(s => s.id).join(', ')}]`);
    throw error;
  }
}

/**
 * Enhanced slime deletion with detailed logging
 */
export async function prismaDeleteSlimesFromDB(ownerId: string, slimeIds: number[]): Promise<void> {
  logger.debug(`🐌 [DB] Starting deletion of ${slimeIds.length} slimes for owner ${ownerId}`);
  logger.debug(`🐌 [DB] Slime IDs to delete: [${slimeIds.join(', ')}]`);

  try {
    const result = await prisma.slime.deleteMany({
      where: {
        id: { in: slimeIds },
        ownerId,
      },
    });

    logger.info(`🗑️ [DB] Successfully deleted ${result.count} slimes for owner ${ownerId}`);

    if (result.count !== slimeIds.length) {
      logger.warn(`⚠️ [DB] Expected to delete ${slimeIds.length} slimes but actually deleted ${result.count}`);
      logger.warn(`   This could mean some slimes didn't exist or belonged to different owner`);
    }

  } catch (error) {
    logger.error(`❌ [DB] Failed to delete slimes for owner ${ownerId}:`);
    logger.error(`   Error message: ${(error as Error).message}`);
    logger.error(`   Slime IDs: [${slimeIds.join(', ')}]`);
    throw error;
  }
}

/**
 * Loads full slimes with all expanded trait relations
 */
export async function prismaFetchSlimesForUser(ownerId: string): Promise<SlimeWithTraits[]> {
  const slimes = await prisma.slime.findMany({
    where: { ownerId },
    include: {
      BodyDominant: { include: { statEffect: true } },
      BodyHidden1: { include: { statEffect: true } },
      BodyHidden2: { include: { statEffect: true } },
      BodyHidden3: { include: { statEffect: true } },

      PatternDominant: { include: { statEffect: true } },
      PatternHidden1: { include: { statEffect: true } },
      PatternHidden2: { include: { statEffect: true } },
      PatternHidden3: { include: { statEffect: true } },

      PrimaryColourDominant: { include: { statEffect: true } },
      PrimaryColourHidden1: { include: { statEffect: true } },
      PrimaryColourHidden2: { include: { statEffect: true } },
      PrimaryColourHidden3: { include: { statEffect: true } },

      AccentDominant: { include: { statEffect: true } },
      AccentHidden1: { include: { statEffect: true } },
      AccentHidden2: { include: { statEffect: true } },
      AccentHidden3: { include: { statEffect: true } },

      DetailDominant: { include: { statEffect: true } },
      DetailHidden1: { include: { statEffect: true } },
      DetailHidden2: { include: { statEffect: true } },
      DetailHidden3: { include: { statEffect: true } },

      EyeColourDominant: { include: { statEffect: true } },
      EyeColourHidden1: { include: { statEffect: true } },
      EyeColourHidden2: { include: { statEffect: true } },
      EyeColourHidden3: { include: { statEffect: true } },

      EyeShapeDominant: { include: { statEffect: true } },
      EyeShapeHidden1: { include: { statEffect: true } },
      EyeShapeHidden2: { include: { statEffect: true } },
      EyeShapeHidden3: { include: { statEffect: true } },

      MouthDominant: { include: { statEffect: true } },
      MouthHidden1: { include: { statEffect: true } },
      MouthHidden2: { include: { statEffect: true } },
      MouthHidden3: { include: { statEffect: true } },
    },
  });

  return slimes as SlimeWithTraits[];
}

export async function prismaFetchSlimesForUsers(userIds: string[]): Promise<SlimeWithTraits[]> {
  if (userIds.length === 0) return [];

  return await prisma.slime.findMany({
    where: {
      ownerId: { in: userIds },
    },
    include: {
      owner: {
        select: {
          telegramId: true,
        },
      },
      BodyDominant: { include: { statEffect: true } },
      BodyHidden1: { include: { statEffect: true } },
      BodyHidden2: { include: { statEffect: true } },
      BodyHidden3: { include: { statEffect: true } },

      PatternDominant: { include: { statEffect: true } },
      PatternHidden1: { include: { statEffect: true } },
      PatternHidden2: { include: { statEffect: true } },
      PatternHidden3: { include: { statEffect: true } },

      PrimaryColourDominant: { include: { statEffect: true } },
      PrimaryColourHidden1: { include: { statEffect: true } },
      PrimaryColourHidden2: { include: { statEffect: true } },
      PrimaryColourHidden3: { include: { statEffect: true } },

      AccentDominant: { include: { statEffect: true } },
      AccentHidden1: { include: { statEffect: true } },
      AccentHidden2: { include: { statEffect: true } },
      AccentHidden3: { include: { statEffect: true } },

      DetailDominant: { include: { statEffect: true } },
      DetailHidden1: { include: { statEffect: true } },
      DetailHidden2: { include: { statEffect: true } },
      DetailHidden3: { include: { statEffect: true } },

      EyeColourDominant: { include: { statEffect: true } },
      EyeColourHidden1: { include: { statEffect: true } },
      EyeColourHidden2: { include: { statEffect: true } },
      EyeColourHidden3: { include: { statEffect: true } },

      EyeShapeDominant: { include: { statEffect: true } },
      EyeShapeHidden1: { include: { statEffect: true } },
      EyeShapeHidden2: { include: { statEffect: true } },
      EyeShapeHidden3: { include: { statEffect: true } },

      MouthDominant: { include: { statEffect: true } },
      MouthHidden1: { include: { statEffect: true } },
      MouthHidden2: { include: { statEffect: true } },
      MouthHidden3: { include: { statEffect: true } },
    },
  });
}