import { Prisma, Rarity, Slime, SlimeTrait, StatEffect, TraitType, User } from '@prisma/client';
import { prisma } from './client';
import { logger } from '../utils/logger';
import { getMutationProbability, probabiltyToPassDownTrait, rarities, traitTypes } from '../utils/helpers';
import { processAndUploadSlimeImage } from '../slime-generation/slime-image-generation';
import { DOMINANT_TRAITS_GACHA_SPECS, GACHA_PULL_RARITIES, GachaOddsDominantTraits, HIDDEN_TRAITS_GACHA_SPECS } from '../utils/gacha-odds';
import { GACHA_PULL_ODDS, GACHA_PULL_ODDS_NERF } from '../utils/config';
import { canUserMintSlime, recalculateAndUpdateUserStats, UserDataEquipped } from './user-service';
import { snapshotManager, SnapshotTrigger } from './snapshot-manager-service';
import { GameCodexManager } from '../managers/game-codex/game-codex-manager';


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

export async function fetchSlimeObjectWithTraits(slimeId: number): Promise<SlimeWithTraits> {
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

export async function burnSlime(telegramId: string, slimeId: number): Promise<number> {
  try {
    // Check if the slime is owned by the user with the specified telegramId
    const slime = await prisma.slime.findUnique({
      where: { id: slimeId },
      select: { ownerId: true },
    });

    if (!slime) {
      throw new Error(`Slime with ID ${slimeId} does not exist.`);
    }

    // Verify ownership by checking if the slime's owner matches the telegramId
    const owner = await prisma.user.findUnique({
      where: { telegramId },
      select: { telegramId: true },
    });

    if (!owner || owner.telegramId !== slime.ownerId) {
      throw new Error(`Slime with ID ${slimeId} is not owned by the user with telegramId ${telegramId}.`);
    }

    // Delete (burn) the slime
    await prisma.slime.delete({
      where: { id: slimeId },
    });

    logger.info(`Successfully burned slime with ID: ${slimeId}`);
    return slimeId;
  } catch (error) {
    logger.error(`Failed to burn slime: ${error}`);
    throw error;
  }
}

export async function getRandomSlimeTraitId(traitType: TraitType, probabilities: number[]): Promise<{ traitId: number, rarity: Rarity }> {
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

/**
 * Updated function to get slime trait by ID - memory first with database fallback
 * Other slime functions remain unchanged as they deal with user-specific data
 */
export async function getSlimeTraitById(traitId: number) {
  try {
    // Try memory cache first - O(1) lookup
    if (GameCodexManager.isReady()) {
      const trait = GameCodexManager.getSlimeTrait(traitId);

      if (trait) {
        logger.debug(`Retrieved slime trait ${traitId} (${trait.name}) from memory cache`);
        return trait;
      }
    }
  } catch (error) {
    logger.warn(`Memory cache failed for getSlimeTraitById(${traitId}): ${error}`);
  }

  // Fallback to database
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

interface GachaPullRes {
  slime: SlimeWithTraits,
  rankPull: string,
  slimeNoBg: Buffer
}

export async function slimeGachaPull(ownerId: string, nerf: boolean = false): Promise<GachaPullRes> {
  try {
    if (!(await canUserMintSlime(ownerId))) {
      throw new Error(`Slime inventory full. Please clear space or upgrade your slots`)
    }

    const rankPull = getGachaPullRarity(nerf);

    const gachaOddsDominantTraits = DOMINANT_TRAITS_GACHA_SPECS[rankPull];
    const gachaOddsHiddenTraits = HIDDEN_TRAITS_GACHA_SPECS[rankPull];

    const dominantTraitProbs = [gachaOddsDominantTraits.chanceD, gachaOddsDominantTraits.chanceC, gachaOddsDominantTraits.chanceB, gachaOddsDominantTraits.chanceA, gachaOddsDominantTraits.chanceS];
    const dominantTraitConfirmProbs = getDominantTraitConfirmProbs(rankPull);
    const dominantTraitNormalizedProbsOnMaxCount = getNormalizedProbsWhenMaxCountReached(rankPull, dominantTraitProbs);

    const hiddenTraitProbs = [gachaOddsHiddenTraits.chanceD, gachaOddsHiddenTraits.chanceC, gachaOddsHiddenTraits.chanceB, gachaOddsHiddenTraits.chanceA, gachaOddsHiddenTraits.chanceS];

    const { min: minCount, max: maxCount } = getMinMaxForRank(rankPull, DOMINANT_TRAITS_GACHA_SPECS);
    let currCount = 0;

    const gachaSlimeTraits: Record<string, { dominant: number; hidden1: number; hidden2: number; hidden3: number }> = {};

    const dominantCounts = { D: 0, C: 0, B: 0, A: 0, S: 0 }; // Track dominant traits
    const hiddenCounts = { D: 0, C: 0, B: 0, A: 0, S: 0 }; // Track hidden traits

    for (let i = 0; i < traitTypes.length; i++) {
      let randomDTrait;

      // Initialize gachaSlimeTraits[traitTypes[i]] if not already done
      if (!gachaSlimeTraits[traitTypes[i]]) {
        gachaSlimeTraits[traitTypes[i]] = { dominant: 0, hidden1: 0, hidden2: 0, hidden3: 0 };
      }

      // Enforce minCount and maxCount constraints for dominant traits
      if (traitTypes.length - i === minCount - currCount) {
        // Guarantee the next traits match the rank if we're below minCount
        randomDTrait = await getRandomSlimeTraitId(traitTypes[i], dominantTraitConfirmProbs);
      } else if (currCount >= maxCount) {
        // Force traits to be lower than rankPull if maxCount reached
        randomDTrait = await getRandomSlimeTraitId(traitTypes[i], dominantTraitNormalizedProbsOnMaxCount);
      } else {
        // Normal random trait selection based on rankPull probabilities
        randomDTrait = await getRandomSlimeTraitId(traitTypes[i], dominantTraitProbs);
      }

      // Handle dominant traits
      gachaSlimeTraits[traitTypes[i]].dominant = randomDTrait.traitId;
      dominantCounts[randomDTrait.rarity] += 1;

      // Increment current count if the trait matches rankPull
      if (randomDTrait.rarity === rankPull) {
        currCount += 1;
      }

      // Handle hidden traits
      const randomH1Trait = (await getRandomSlimeTraitId(traitTypes[i], hiddenTraitProbs));
      const randomH2Trait = (await getRandomSlimeTraitId(traitTypes[i], hiddenTraitProbs));
      const randomH3Trait = (await getRandomSlimeTraitId(traitTypes[i], hiddenTraitProbs));

      gachaSlimeTraits[traitTypes[i]].hidden1 = randomH1Trait.traitId;
      gachaSlimeTraits[traitTypes[i]].hidden2 = randomH2Trait.traitId;
      gachaSlimeTraits[traitTypes[i]].hidden3 = randomH3Trait.traitId;

      hiddenCounts[randomH1Trait.rarity] += 1;
      hiddenCounts[randomH2Trait.rarity] += 1;
      hiddenCounts[randomH3Trait.rarity] += 1;
    }

    // Create the Slime record in the database
    const slime = await prisma.slime.create({
      data: {
        ownerId: ownerId.toString(),
        generation: 0,
        imageUri: '',
        Body_D: gachaSlimeTraits.Body.dominant,
        Body_H1: gachaSlimeTraits.Body.hidden1,
        Body_H2: gachaSlimeTraits.Body.hidden2,
        Body_H3: gachaSlimeTraits.Body.hidden3,
        Pattern_D: gachaSlimeTraits.Pattern.dominant,
        Pattern_H1: gachaSlimeTraits.Pattern.hidden1,
        Pattern_H2: gachaSlimeTraits.Pattern.hidden2,
        Pattern_H3: gachaSlimeTraits.Pattern.hidden3,
        PrimaryColour_D: gachaSlimeTraits.PrimaryColour.dominant,
        PrimaryColour_H1: gachaSlimeTraits.PrimaryColour.hidden1,
        PrimaryColour_H2: gachaSlimeTraits.PrimaryColour.hidden2,
        PrimaryColour_H3: gachaSlimeTraits.PrimaryColour.hidden3,
        Accent_D: gachaSlimeTraits.Accent.dominant,
        Accent_H1: gachaSlimeTraits.Accent.hidden1,
        Accent_H2: gachaSlimeTraits.Accent.hidden2,
        Accent_H3: gachaSlimeTraits.Accent.hidden3,
        Detail_D: gachaSlimeTraits.Detail.dominant,
        Detail_H1: gachaSlimeTraits.Detail.hidden1,
        Detail_H2: gachaSlimeTraits.Detail.hidden2,
        Detail_H3: gachaSlimeTraits.Detail.hidden3,
        EyeColour_D: gachaSlimeTraits.EyeColour.dominant,
        EyeColour_H1: gachaSlimeTraits.EyeColour.hidden1,
        EyeColour_H2: gachaSlimeTraits.EyeColour.hidden2,
        EyeColour_H3: gachaSlimeTraits.EyeColour.hidden3,
        EyeShape_D: gachaSlimeTraits.EyeShape.dominant,
        EyeShape_H1: gachaSlimeTraits.EyeShape.hidden1,
        EyeShape_H2: gachaSlimeTraits.EyeShape.hidden2,
        EyeShape_H3: gachaSlimeTraits.EyeShape.hidden3,
        Mouth_D: gachaSlimeTraits.Mouth.dominant,
        Mouth_H1: gachaSlimeTraits.Mouth.hidden1,
        Mouth_H2: gachaSlimeTraits.Mouth.hidden2,
        Mouth_H3: gachaSlimeTraits.Mouth.hidden3,
      },
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

    // Log gacha pull success
    logger.info('Gacha Pull Successful!');
    logger.info(`Rank Pull: ${rankPull}`);
    logger.info(`Generated new Gen0 Slime with ID: ${slime.id}`);
    logger.info(`Dominant Trait Counts: ${JSON.stringify(dominantCounts)}`);
    logger.info(`Hidden Trait Counts: ${JSON.stringify(hiddenCounts)}`);

    const res = await processAndUploadSlimeImage(slime);
    updateSlimeImageUri(slime.id, res.uri);

    slime.imageUri = res.uri;

    await snapshotManager.markStale(ownerId, SnapshotTrigger.SLIME_GACHA);

    return {
      slime,
      rankPull,
      slimeNoBg: res.imageNoBg
    }

  } catch (error) {
    logger.error(`Failed to generate Gen0 Slime from gacha pull: ${error}`);
    throw error;
  }
}

export async function breedSlimes(sireId: number, dameId: number): Promise<SlimeWithTraits> {
  try {
    const sire: SlimeWithTraits = await fetchSlimeObjectWithTraits(sireId);
    const dame: SlimeWithTraits = await fetchSlimeObjectWithTraits(dameId);

    if (!sire || !dame) throw new Error("One or both of the specified slimes do not exist.");
    if (sire.ownerId !== dame.ownerId) throw new Error("Both slimes must have the same owner.");

    if (!(await canUserMintSlime(sire.ownerId))) {
      throw new Error(`Slime inventory full. Please clear space or upgrade your slots`);
    }

    // Initialize child data with all required fields
    const childData: Record<string, number> = {};

    for (const trait of traitTypes) {
      // Access sire traits dynamically
      const sireD = sire[`${trait}Dominant` as keyof SlimeWithTraits] as SlimeTrait;
      const sireH1 = sire[`${trait}Hidden1` as keyof SlimeWithTraits] as SlimeTrait;
      const sireH2 = sire[`${trait}Hidden2` as keyof SlimeWithTraits] as SlimeTrait;
      const sireH3 = sire[`${trait}Hidden3` as keyof SlimeWithTraits] as SlimeTrait;

      const dameD = dame[`${trait}Dominant` as keyof SlimeWithTraits] as SlimeTrait;
      const dameH1 = dame[`${trait}Hidden1` as keyof SlimeWithTraits] as SlimeTrait;
      const dameH2 = dame[`${trait}Hidden2` as keyof SlimeWithTraits] as SlimeTrait;
      const dameH3 = dame[`${trait}Hidden3` as keyof SlimeWithTraits] as SlimeTrait;

      // Default to inheritance logic
      let childDominantId = getChildTraitId({
        sireDId: sireD.id,
        sireH1Id: sireH1.id,
        sireH2Id: sireH2.id,
        sireH3Id: sireH3.id,
        dameDId: dameD.id,
        dameH1Id: dameH1.id,
        dameH2Id: dameH2.id,
        dameH3Id: dameH3.id,
      });

      // Check for pair0Id match
      if (sireD.pair0Id === dameD.id &&
        (dameD.pair0Id === sireD.id || dameD.pair1Id === sireD.id) && (sireD.mutation0Id === dameD.mutation0Id || sireD.mutation0Id === dameD.mutation1Id)) {
        // Use mutation0Id if available and a mutation occurs
        if (sireD.mutation0Id && Math.random() < getMutationProbability(sireD.rarity)) {
          childDominantId = sireD.mutation0Id;
          logger.info(`Mutation successful!`);
        } else {
          logger.info(`Mutation unsuccessful!`);
        }
      }

      // Check for pair1Id match
      if (!childDominantId && sireD.pair1Id === dameD.id &&
        (dameD.pair0Id === sireD.id || dameD.pair1Id === sireD.id) && (sireD.mutation1Id === dameD.mutation0Id || sireD.mutation1Id === dameD.mutation1Id)) {
        // Use mutation1Id if available and a mutation occurs
        if (sireD.mutation1Id && Math.random() < getMutationProbability(sireD.rarity)) {
          childDominantId = sireD.mutation1Id;
          logger.info(`Mutation successful!`);
        } else {
          logger.info(`Mutation unsuccessful!`);
        }
      }

      logger.info(`childDominantId: ${childDominantId}`);

      // Hidden genes for the child
      const childHidden1Id = getChildTraitId({
        sireDId: sireD.id,
        sireH1Id: sireH1.id,
        sireH2Id: sireH2.id,
        sireH3Id: sireH3.id,
        dameDId: dameD.id,
        dameH1Id: dameH1.id,
        dameH2Id: dameH2.id,
        dameH3Id: dameH3.id,
      });

      const childHidden2Id = getChildTraitId({
        sireDId: sireD.id,
        sireH1Id: sireH1.id,
        sireH2Id: sireH2.id,
        sireH3Id: sireH3.id,
        dameDId: dameD.id,
        dameH1Id: dameH1.id,
        dameH2Id: dameH2.id,
        dameH3Id: dameH3.id,
      });

      const childHidden3Id = getChildTraitId({
        sireDId: sireD.id,
        sireH1Id: sireH1.id,
        sireH2Id: sireH2.id,
        sireH3Id: sireH3.id,
        dameDId: dameD.id,
        dameH1Id: dameH1.id,
        dameH2Id: dameH2.id,
        dameH3Id: dameH3.id,
      });

      // Set all four genes for each trait in childData
      childData[`${trait}_D`] = childDominantId;
      childData[`${trait}_H1`] = childHidden1Id;
      childData[`${trait}_H2`] = childHidden2Id;
      childData[`${trait}_H3`] = childHidden3Id;

      logger.info(`childHidden1Id: ${childHidden1Id}`);
      logger.info(`childHidden2Id: ${childHidden2Id}`);
      logger.info(`childHidden3Id: ${childHidden3Id}`);

    }

    // Create child slime with complete trait data
    const childSlime = await prisma.slime.create({
      data: {
        ownerId: sire.ownerId,
        generation: Math.max(sire.generation, dame.generation) + 1,
        imageUri: '',
        Body_D: childData['Body_D'],
        Body_H1: childData['Body_H1'],
        Body_H2: childData['Body_H2'],
        Body_H3: childData['Body_H3'],
        Pattern_D: childData["Pattern_D"],
        Pattern_H1: childData["Pattern_H1"],
        Pattern_H2: childData["Pattern_H2"],
        Pattern_H3: childData["Pattern_H3"],
        PrimaryColour_D: childData["PrimaryColour_D"],
        PrimaryColour_H1: childData["PrimaryColour_H1"],
        PrimaryColour_H2: childData["PrimaryColour_H2"],
        PrimaryColour_H3: childData["PrimaryColour_H3"],
        Accent_D: childData["Accent_D"],
        Accent_H1: childData["Accent_H1"],
        Accent_H2: childData["Accent_H2"],
        Accent_H3: childData["Accent_H3"],
        Detail_D: childData["Detail_D"],
        Detail_H1: childData["Detail_H1"],
        Detail_H2: childData["Detail_H2"],
        Detail_H3: childData["Detail_H3"],
        EyeColour_D: childData["EyeColour_D"],
        EyeColour_H1: childData["EyeColour_H1"],
        EyeColour_H2: childData["EyeColour_H2"],
        EyeColour_H3: childData["EyeColour_H3"],
        EyeShape_D: childData["EyeShape_D"],
        EyeShape_H1: childData["EyeShape_H1"],
        EyeShape_H2: childData["EyeShape_H2"],
        EyeShape_H3: childData["EyeShape_H3"],
        Mouth_D: childData["Mouth_D"],
        Mouth_H1: childData["Mouth_H1"],
        Mouth_H2: childData["Mouth_H2"],
        Mouth_H3: childData["Mouth_H3"],
      },
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

    const res = await processAndUploadSlimeImage(childSlime);
    childSlime.imageUri = res.uri;
    updateSlimeImageUri(childSlime.id, res.uri);

    await snapshotManager.markStale(sire.ownerId, SnapshotTrigger.SLIME_BREEDING);

    return childSlime;
  } catch (error) {
    console.error(`Failed to breed slimes: ${error}`);
    throw error;
  }
}

export async function equipSlimeForUser(
  telegramId: string,
  slime: SlimeWithTraits
): Promise<UserDataEquipped> {
  try {
    await prisma.user.update({
      where: { telegramId },
      data: {
        equippedSlimeId: slime.id
      }
    });

    const result = await recalculateAndUpdateUserStats(telegramId);

    await snapshotManager.markStale(telegramId, SnapshotTrigger.SLIME_EQUIPPED);

    return result;
  } catch (err) {
    throw new Error(`Failed to equip slime ${slime.id} for user ${telegramId}: ${err}`);
  }
}

export async function unequipSlimeForUser(
  telegramId: string
): Promise<UserDataEquipped> {
  try {
    await prisma.user.update({
      where: { telegramId },
      data: {
        equippedSlimeId: null
      }
    });

    const result = await recalculateAndUpdateUserStats(telegramId);

    await snapshotManager.markStale(telegramId, SnapshotTrigger.SLIME_UNEQUIPPED);

    return result;
  } catch (err) {
    throw new Error(`Failed to unequip slime for user ${telegramId}: ${err}`);
  }
}

export async function getEquippedSlimeWithTraits(telegramId: string): Promise<SlimeWithTraits | null> {
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

export async function getSlimeWithTraitsById(slimeId: number): Promise<SlimeWithTraits | null> {
  try {
    const slime = await prisma.slime.findUnique({
      where: { id: slimeId },
      include: {
        owner: {
          select: { telegramId: true },
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

    return slime ?? null;
  } catch (error) {
    console.error(`❌ Failed to fetch SlimeWithTraits for slimeId ${slimeId}:`, error);
    throw error;
  }
}

export async function getEquippedSlimeId(telegramId: string): Promise<number | null> {
  try {
    // Fetch the user with the equipped slime relation
    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() },
      select: {
        equippedSlimeId: true, // Select only the equipped slime ID
      },
    });

    if (!user) {
      console.error(`User with telegramId ${telegramId} not found.`);
      return null;
    }

    return user.equippedSlimeId || null; // Return the slime ID or null if none equipped
  } catch (error) {
    console.error("Error fetching equipped slime ID:", error);
    throw error; // Re-throw the error for further handling
  }
}

/* HELPERS */

function getChildTraitId({
  sireDId,
  sireH1Id,
  sireH2Id,
  sireH3Id,
  dameDId,
  dameH1Id,
  dameH2Id,
  dameH3Id
}: {
  sireDId: number;
  sireH1Id: number;
  sireH2Id: number;
  sireH3Id: number;
  dameDId: number;
  dameH1Id: number;
  dameH2Id: number;
  dameH3Id: number;
}): number {
  const traits = [
    { id: sireDId, probability: probabiltyToPassDownTrait[0] },
    { id: sireH1Id, probability: probabiltyToPassDownTrait[1] },
    { id: sireH2Id, probability: probabiltyToPassDownTrait[2] },
    { id: sireH3Id, probability: probabiltyToPassDownTrait[3] },
    { id: dameDId, probability: probabiltyToPassDownTrait[0] },
    { id: dameH1Id, probability: probabiltyToPassDownTrait[1] },
    { id: dameH2Id, probability: probabiltyToPassDownTrait[2] },
    { id: dameH3Id, probability: probabiltyToPassDownTrait[3] }
  ];

  // Combine probabilities for duplicate traits
  const uniqueTraits = traits.reduce<{ [id: number]: number }>((acc, trait) => {
    acc[trait.id] = (acc[trait.id] || 0) + trait.probability;
    return acc;
  }, {});

  // Create an array for probabilistic selection
  const cumulativeTraits: { id: number; cumulativeProbability: number }[] = [];
  let cumulativeProbability = 0;

  for (const [id, probability] of Object.entries(uniqueTraits)) {
    cumulativeProbability += probability;
    cumulativeTraits.push({ id: Number(id), cumulativeProbability });
  }

  // Randomly select a trait based on cumulative probabilities
  const random = Math.random() * cumulativeProbability;
  for (const trait of cumulativeTraits) {
    if (random < trait.cumulativeProbability) {
      return trait.id;
    }
  }

  // Fallback if something goes wrong (shouldn't happen)
  throw new Error("Failed to select a trait to pass down.");
}

export async function updateSlimeImageUri(slimeId: number, imageUri: string): Promise<void> {
  try {
    // Update the slime record in the database
    const updatedSlime = await prisma.slime.update({
      where: { id: slimeId },
      data: { imageUri },
    });

    // Log the success
    logger.info(`Updated imageUri for Slime ID ${slimeId}: ${updatedSlime.imageUri}`);
  } catch (error) {
    // Handle errors and log them
    logger.error(`Failed to update imageUri for Slime ID ${slimeId}: ${error}`);
    throw new Error(`Could not update imageUri for Slime ID ${slimeId}`);
  }
}

function getGachaPullRarity(useNerf: boolean = false): string {
  const odds = useNerf ? GACHA_PULL_ODDS_NERF : GACHA_PULL_ODDS;

  const random = Math.random();
  logger.info(`Gacha random number: ${random} (${useNerf ? 'NERF' : 'NORMAL'})`);
  let cumulative = 0;

  for (let i = 0; i < odds.length; i++) {
    cumulative += odds[i];
    if (random < cumulative) {
      return GACHA_PULL_RARITIES[i];
    }
  }

  throw new Error('Probabilities do not sum to 1 or unexpected error occurred.');
}

function getDominantTraitConfirmProbs(rankPull: string): number[] {
  switch (rankPull) {
    case 'SS':
    case 'S':
      return [0, 0, 0, 0, 1];
    case 'A':
      return [0, 0, 0, 1, 0];
    case 'B':
      return [0, 0, 1, 0, 0];
    case 'C':
      return [0, 1, 0, 0, 0];
    case 'D':
      return [1, 0, 0, 0, 0];
    default:
      throw new Error(`Invalid rankPull: ${rankPull}`);
  }
}

function getNormalizedProbsWhenMaxCountReached(rankPull: string, dominantTraitProbs: number[]): number[] {
  // Get the index of the current rank in the rarities array
  if (rankPull === 'SS') rankPull = 'S';

  const rankIndex = rarities.indexOf(rankPull as Rarity);
  if (rankIndex === -1) {
    throw new Error(`Invalid rankPull: ${rankPull}`);
  }

  // Set the probability for the current rank to 0
  const adjustedProbs = dominantTraitProbs.map((prob, index) => (index === rankIndex ? 0 : prob));

  // Calculate the total remaining probability
  const remainingTotal = adjustedProbs.reduce((sum, prob) => sum + prob, 0);

  // Normalize the remaining probabilities
  const normalizedProbs = adjustedProbs.map((prob) => (prob / remainingTotal));

  return normalizedProbs;
}

// Helper function to dynamically retrieve min and max count
function getMinMaxForRank(
  rankPull: string,
  gachaSpecs: Record<string, GachaOddsDominantTraits>
): { min: number; max: number } {
  let rankPullForKey = rankPull
  if (rankPull === 'SS') rankPullForKey = 'S';

  const minKey = `min${rankPullForKey}` as keyof GachaOddsDominantTraits;
  const maxKey = `max${rankPullForKey}` as keyof GachaOddsDominantTraits;

  const min = gachaSpecs[rankPull][minKey];
  const max = gachaSpecs[rankPull][maxKey];

  if (!min || !max) throw new Error(`Invalid min max for rank pull.`)

  logger.info(`${minKey}: ${min}`);
  logger.info(`${maxKey}: ${max}`);

  return { min, max };
}