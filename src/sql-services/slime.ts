import { Slime, SlimeTrait, TraitType, User } from '@prisma/client';
import { prisma } from './client';
import { logger } from '../utils/logger';
import { getMutationProbability, probabiltyToPassDownTrait, rarities, traitTypes } from '../utils/helpers';
import { processAndUploadSlimeImage } from '../slime-generation/slime-image-generation';

export type SlimeWithTraits = Slime & {
  owner: Pick<User, 'telegramId'>;
  BodyDominant: SlimeTrait;
  BodyHidden1: SlimeTrait;
  BodyHidden2: SlimeTrait;
  BodyHidden3: SlimeTrait;
  PatternDominant: SlimeTrait;
  PatternHidden1: SlimeTrait;
  PatternHidden2: SlimeTrait;
  PatternHidden3: SlimeTrait;
  PrimaryColourDominant: SlimeTrait;
  PrimaryColourHidden1: SlimeTrait;
  PrimaryColourHidden2: SlimeTrait;
  PrimaryColourHidden3: SlimeTrait;
  AccentDominant: SlimeTrait;
  AccentHidden1: SlimeTrait;
  AccentHidden2: SlimeTrait;
  AccentHidden3: SlimeTrait;
  DetailDominant: SlimeTrait;
  DetailHidden1: SlimeTrait;
  DetailHidden2: SlimeTrait;
  DetailHidden3: SlimeTrait;
  EyeColourDominant: SlimeTrait;
  EyeColourHidden1: SlimeTrait;
  EyeColourHidden2: SlimeTrait;
  EyeColourHidden3: SlimeTrait;
  EyeShapeDominant: SlimeTrait;
  EyeShapeHidden1: SlimeTrait;
  EyeShapeHidden2: SlimeTrait;
  EyeShapeHidden3: SlimeTrait;
  MouthDominant: SlimeTrait;
  MouthHidden1: SlimeTrait;
  MouthHidden2: SlimeTrait;
  MouthHidden3: SlimeTrait;
};

export async function fetchSlimeObjectWithTraits(slimeId: number): Promise<SlimeWithTraits> {
  try {
    const slime = await prisma.slime.findUnique({
      where: { id: slimeId },
      include: {
        owner: { select: { telegramId: true } },
        BodyDominant: true,
        BodyHidden1: true,
        BodyHidden2: true,
        BodyHidden3: true,
        PatternDominant: true,
        PatternHidden1: true,
        PatternHidden2: true,
        PatternHidden3: true,
        PrimaryColourDominant: true,
        PrimaryColourHidden1: true,
        PrimaryColourHidden2: true,
        PrimaryColourHidden3: true,
        AccentDominant: true,
        AccentHidden1: true,
        AccentHidden2: true,
        AccentHidden3: true,
        DetailDominant: true,
        DetailHidden1: true,
        DetailHidden2: true,
        DetailHidden3: true,
        EyeColourDominant: true,
        EyeColourHidden1: true,
        EyeColourHidden2: true,
        EyeColourHidden3: true,
        EyeShapeDominant: true,
        EyeShapeHidden1: true,
        EyeShapeHidden2: true,
        EyeShapeHidden3: true,
        MouthDominant: true,
        MouthHidden1: true,
        MouthHidden2: true,
        MouthHidden3: true,
      },
    });

    if (!slime) throw new Error(`Slime object not found.`);

    return slime;
  } catch (error) {
    logger.error(`Failed to fetch slime object: ${error}`);
    throw error
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

export async function getRandomSlimeTraitId(traitType: TraitType, probabilities: number[]): Promise<number> {
  try {
    // Ensure the probabilities array is of length 5 and sums to 1
    if (probabilities.length !== 5 || probabilities.reduce((sum, p) => sum + p, 0) !== 1) {
      throw new Error("Probabilities array must have 5 elements and sum to 1.");
    }

    // Step 1: Fetch one random trait ID per rarity
    const traitIdPromises = rarities.map(rarity =>
      prisma.slimeTrait.findFirst({
        where: { type: traitType, rarity },
        select: { id: true } // Only select the ID
      }).then(result => result?.id)
    );

    const traitIds = (await Promise.all(traitIdPromises)).filter(Boolean) as number[]; // Filter out nulls if any

    // Step 2: Randomly select a trait ID based on the provided probabilities
    let random = Math.random();
    let cumulativeProbability = 0;

    for (let i = 0; i < traitIds.length; i++) {
      cumulativeProbability += probabilities[i];
      if (random < cumulativeProbability) {
        return traitIds[i];
      }
    }

    throw new Error('No trait IDs pulled from db');
  } catch (error) {
    logger.error(`Failed to get random slime trait ID: ${error}`);
    throw error;
  }
}

export async function generateRandomGen0Slime(ownerId: string, probabilities: number[]): Promise<Slime> {
  try {
    // Check if probabilities sum to 1 and length matches rarities array
    const sum = probabilities.reduce((acc, curr) => acc + curr, 0);
    if (sum !== 1 || probabilities.length !== rarities.length) {
      throw new Error("Probabilities array must have a sum of 1 and match the length of raritie array.");
    }

    // Helper function to generate a trait with the specified type and probabilities
    const generateTraitSet = async (traitType: TraitType) => {
      return {
        dominant: await getRandomSlimeTraitId(traitType, probabilities),
        hidden1: await getRandomSlimeTraitId(traitType, probabilities),
        hidden2: await getRandomSlimeTraitId(traitType, probabilities),
        hidden3: await getRandomSlimeTraitId(traitType, probabilities),
      };
    };

    // Generate trait sets for each trait type
    const traits: Record<string, { dominant: number; hidden1: number; hidden2: number; hidden3: number }> = {};
    for (const traitType of traitTypes) {
      traits[traitType] = await generateTraitSet(traitType);
    }

    // Create the Slime record in the database
    const slime = await prisma.slime.create({
      data: {
        ownerId,
        generation: 0,
        imageUri: '',
        Body_D: traits.Body.dominant,
        Body_H1: traits.Body.hidden1,
        Body_H2: traits.Body.hidden2,
        Body_H3: traits.Body.hidden3,
        Pattern_D: traits.Pattern.dominant,
        Pattern_H1: traits.Pattern.hidden1,
        Pattern_H2: traits.Pattern.hidden2,
        Pattern_H3: traits.Pattern.hidden3,
        PrimaryColour_D: traits.PrimaryColour.dominant,
        PrimaryColour_H1: traits.PrimaryColour.hidden1,
        PrimaryColour_H2: traits.PrimaryColour.hidden2,
        PrimaryColour_H3: traits.PrimaryColour.hidden3,
        Accent_D: traits.Accent.dominant,
        Accent_H1: traits.Accent.hidden1,
        Accent_H2: traits.Accent.hidden2,
        Accent_H3: traits.Accent.hidden3,
        Detail_D: traits.Detail.dominant,
        Detail_H1: traits.Detail.hidden1,
        Detail_H2: traits.Detail.hidden2,
        Detail_H3: traits.Detail.hidden3,
        EyeColour_D: traits.EyeColour.dominant,
        EyeColour_H1: traits.EyeColour.hidden1,
        EyeColour_H2: traits.EyeColour.hidden2,
        EyeColour_H3: traits.EyeColour.hidden3,
        EyeShape_D: traits.EyeShape.dominant,
        EyeShape_H1: traits.EyeShape.hidden1,
        EyeShape_H2: traits.EyeShape.hidden2,
        EyeShape_H3: traits.EyeShape.hidden3,
        Mouth_D: traits.Mouth.dominant,
        Mouth_H1: traits.Mouth.hidden1,
        Mouth_H2: traits.Mouth.hidden2,
        Mouth_H3: traits.Mouth.hidden3,
      },
      include: {
        owner: { select: { telegramId: true } },
        BodyDominant: true,
        BodyHidden1: true,
        BodyHidden2: true,
        BodyHidden3: true,
        PatternDominant: true,
        PatternHidden1: true,
        PatternHidden2: true,
        PatternHidden3: true,
        PrimaryColourDominant: true,
        PrimaryColourHidden1: true,
        PrimaryColourHidden2: true,
        PrimaryColourHidden3: true,
        AccentDominant: true,
        AccentHidden1: true,
        AccentHidden2: true,
        AccentHidden3: true,
        DetailDominant: true,
        DetailHidden1: true,
        DetailHidden2: true,
        DetailHidden3: true,
        EyeColourDominant: true,
        EyeColourHidden1: true,
        EyeColourHidden2: true,
        EyeColourHidden3: true,
        EyeShapeDominant: true,
        EyeShapeHidden1: true,
        EyeShapeHidden2: true,
        EyeShapeHidden3: true,
        MouthDominant: true,
        MouthHidden1: true,
        MouthHidden2: true,
        MouthHidden3: true,
      },
    });

    logger.info(`Generated new Gen0 Slime with ID: ${slime}`);

    const uri = await processAndUploadSlimeImage(slime);
    updateSlimeImageUri(slime.id, uri);

    slime.imageUri = uri;
    return slime;
  } catch (error) {
    logger.error(`Failed to generate Gen0 Slime: ${error}`);
    throw error;
  }
}

export async function breedSlimes(sireId: number, dameId: number): Promise<Slime> {
  try {
    const sire: SlimeWithTraits = await fetchSlimeObjectWithTraits(sireId);
    const dame: SlimeWithTraits = await fetchSlimeObjectWithTraits(dameId);

    if (!sire || !dame) throw new Error("One or both of the specified slimes do not exist.");
    if (sire.ownerId !== dame.ownerId) throw new Error("Both slimes must have the same owner.");

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

      let childDominantId;
      if (
        (sireD.pair0Id === dameD.id && dameD.pair0Id === sireD.id) || // Pair via pair0Id
        (sireD.pair1Id === dameD.id && dameD.pair0Id === sireD.id) || // Sire pair1Id ↔ Dame pair0Id
        (sireD.pair0Id === dameD.id && dameD.pair1Id === sireD.id) || // Sire pair0Id ↔ Dame pair1Id
        (sireD.pair1Id === dameD.id && dameD.pair1Id === sireD.id)    // Pair via pair1Id
      ) {
        // Determine which mutation ID to use
        let mutationId: number | null = null;

        if (sireD.pair0Id === dameD.id && dameD.pair0Id === sireD.id) {
          mutationId = sireD.mutation0Id; // Pair0 ↔ Pair0
        } else if (sireD.pair1Id === dameD.id && dameD.pair0Id === sireD.id) {
          mutationId = sireD.mutation1Id; // Pair1 ↔ Pair0
        } else if (sireD.pair0Id === dameD.id && dameD.pair1Id === sireD.id) {
          mutationId = sireD.mutation0Id; // Pair0 ↔ Pair1
        } else if (sireD.pair1Id === dameD.id && dameD.pair1Id === sireD.id) {
          mutationId = sireD.mutation1Id; // Pair1 ↔ Pair1
        }

        if (mutationId && Math.random() < getMutationProbability(sireD.rarity)) {
          // Mutation occurs
          childDominantId = mutationId;
        } else {
          // Regular inheritance logic
          childDominantId = getChildTraitId({
            sireDId: sireD.id,
            sireH1Id: sireH1.id,
            sireH2Id: sireH2.id,
            sireH3Id: sireH3.id,
            dameDId: dameD.id,
            dameH1Id: dameH1.id,
            dameH2Id: dameH2.id,
            dameH3Id: dameH3.id,
          });
        }
      }

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
      childData[`${trait}_D`] = childDominantId!;
      childData[`${trait}_H1`] = childHidden1Id;
      childData[`${trait}_H2`] = childHidden2Id;
      childData[`${trait}_H3`] = childHidden3Id;
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
        BodyDominant: true,
        BodyHidden1: true,
        BodyHidden2: true,
        BodyHidden3: true,
        PatternDominant: true,
        PatternHidden1: true,
        PatternHidden2: true,
        PatternHidden3: true,
        PrimaryColourDominant: true,
        PrimaryColourHidden1: true,
        PrimaryColourHidden2: true,
        PrimaryColourHidden3: true,
        AccentDominant: true,
        AccentHidden1: true,
        AccentHidden2: true,
        AccentHidden3: true,
        DetailDominant: true,
        DetailHidden1: true,
        DetailHidden2: true,
        DetailHidden3: true,
        EyeColourDominant: true,
        EyeColourHidden1: true,
        EyeColourHidden2: true,
        EyeColourHidden3: true,
        EyeShapeDominant: true,
        EyeShapeHidden1: true,
        EyeShapeHidden2: true,
        EyeShapeHidden3: true,
        MouthDominant: true,
        MouthHidden1: true,
        MouthHidden2: true,
        MouthHidden3: true,
      },
    });

    const uri = await processAndUploadSlimeImage(childSlime);
    childSlime.imageUri = uri;
    updateSlimeImageUri(childSlime.id, uri);

    return childSlime;
  } catch (error) {
    console.error(`Failed to breed slimes: ${error}`);
    throw error;
  }
}

export async function getEquippedSlimeId(telegramId: number): Promise<number | null> {
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