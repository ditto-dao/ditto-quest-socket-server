import { Slime, SlimeTrait, TraitType, User } from '@prisma/client';
import { prisma } from './client';
import { logger } from '../utils/logger';
import { getMutationProbability, probabiltyToPassDownTrait, rarities, traitTypes } from '../utils/helpers';

export type SlimeWithTraits = Slime & {
  owner: Pick<User, 'telegramId'>;
  AuraDominant: SlimeTrait;
  AuraHidden1: SlimeTrait;
  AuraHidden2: SlimeTrait;
  AuraHidden3: SlimeTrait;
  BodyDominant: SlimeTrait;
  BodyHidden1: SlimeTrait;
  BodyHidden2: SlimeTrait;
  BodyHidden3: SlimeTrait;
  CoreDominant: SlimeTrait;
  CoreHidden1: SlimeTrait;
  CoreHidden2: SlimeTrait;
  CoreHidden3: SlimeTrait;
  HeadpieceDominant: SlimeTrait;
  HeadpieceHidden1: SlimeTrait;
  HeadpieceHidden2: SlimeTrait;
  HeadpieceHidden3: SlimeTrait;
  TailDominant: SlimeTrait;
  TailHidden1: SlimeTrait;
  TailHidden2: SlimeTrait;
  TailHidden3: SlimeTrait;
  ArmsDominant: SlimeTrait;
  ArmsHidden1: SlimeTrait;
  ArmsHidden2: SlimeTrait;
  ArmsHidden3: SlimeTrait;
  EyesDominant: SlimeTrait;
  EyesHidden1: SlimeTrait;
  EyesHidden2: SlimeTrait;
  EyesHidden3: SlimeTrait;
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
        AuraDominant: true,
        AuraHidden1: true,
        AuraHidden2: true,
        AuraHidden3: true,
        BodyDominant: true,
        BodyHidden1: true,
        BodyHidden2: true,
        BodyHidden3: true,
        CoreDominant: true,
        CoreHidden1: true,
        CoreHidden2: true,
        CoreHidden3: true,
        HeadpieceDominant: true,
        HeadpieceHidden1: true,
        HeadpieceHidden2: true,
        HeadpieceHidden3: true,
        TailDominant: true,
        TailHidden1: true,
        TailHidden2: true,
        TailHidden3: true,
        ArmsDominant: true,
        ArmsHidden1: true,
        ArmsHidden2: true,
        ArmsHidden3: true,
        EyesDominant: true,
        EyesHidden1: true,
        EyesHidden2: true,
        EyesHidden3: true,
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
        Aura_D: traits.Aura.dominant,
        Aura_H1: traits.Aura.hidden1,
        Aura_H2: traits.Aura.hidden2,
        Aura_H3: traits.Aura.hidden3,
        Body_D: traits.Body.dominant,
        Body_H1: traits.Body.hidden1,
        Body_H2: traits.Body.hidden2,
        Body_H3: traits.Body.hidden3,
        Core_D: traits.Core.dominant,
        Core_H1: traits.Core.hidden1,
        Core_H2: traits.Core.hidden2,
        Core_H3: traits.Core.hidden3,
        Headpiece_D: traits.Headpiece.dominant,
        Headpiece_H1: traits.Headpiece.hidden1,
        Headpiece_H2: traits.Headpiece.hidden2,
        Headpiece_H3: traits.Headpiece.hidden3,
        Tail_D: traits.Tail.dominant,
        Tail_H1: traits.Tail.hidden1,
        Tail_H2: traits.Tail.hidden2,
        Tail_H3: traits.Tail.hidden3,
        Arms_D: traits.Arms.dominant,
        Arms_H1: traits.Arms.hidden1,
        Arms_H2: traits.Arms.hidden2,
        Arms_H3: traits.Arms.hidden3,
        Eyes_D: traits.Eyes.dominant,
        Eyes_H1: traits.Eyes.hidden1,
        Eyes_H2: traits.Eyes.hidden2,
        Eyes_H3: traits.Eyes.hidden3,
        Mouth_D: traits.Mouth.dominant,
        Mouth_H1: traits.Mouth.hidden1,
        Mouth_H2: traits.Mouth.hidden2,
        Mouth_H3: traits.Mouth.hidden3,
      },
      include: {
        AuraDominant: true,
        AuraHidden1: true,
        AuraHidden2: true,
        AuraHidden3: true,
        BodyDominant: true,
        BodyHidden1: true,
        BodyHidden2: true,
        BodyHidden3: true,
        CoreDominant: true,
        CoreHidden1: true,
        CoreHidden2: true,
        CoreHidden3: true,
        HeadpieceDominant: true,
        HeadpieceHidden1: true,
        HeadpieceHidden2: true,
        HeadpieceHidden3: true,
        TailDominant: true,
        TailHidden1: true,
        TailHidden2: true,
        TailHidden3: true,
        ArmsDominant: true,
        ArmsHidden1: true,
        ArmsHidden2: true,
        ArmsHidden3: true,
        EyesDominant: true,
        EyesHidden1: true,
        EyesHidden2: true,
        EyesHidden3: true,
        MouthDominant: true,
        MouthHidden1: true,
        MouthHidden2: true,
        MouthHidden3: true,
      },
    });

    logger.info(`Generated new Gen0 Slime with ID: ${slime}`);
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
      if (sireD.pairId === dameD.id && dameD.pairId === sireD.id) {
        // Mutate dominant gene
        if (Math.random() < getMutationProbability(sireD.rarity)) {
          childDominantId = dameD.mutationId!;
        } else {
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
      } else {
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
    }

    // Create child slime with complete trait data
    const childSlime = await prisma.slime.create({
      data: {
        ownerId: sire.ownerId,
        generation: Math.max(sire.generation, dame.generation) + 1,
        Aura_D: childData['Aura_D'],
        Aura_H1: childData['Aura_H1'],
        Aura_H2: childData['Aura_H2'],
        Aura_H3: childData['Aura_H3'],
        Body_D: childData['Body_D'],
        Body_H1: childData['Body_H1'],
        Body_H2: childData['Body_H2'],
        Body_H3: childData['Body_H3'],
        Core_D: childData['Core_D'],
        Core_H1: childData['Core_H1'],
        Core_H2: childData['Core_H2'],
        Core_H3: childData['Core_H3'],
        Headpiece_D: childData['Headpiece_D'],
        Headpiece_H1: childData['Headpiece_H1'],
        Headpiece_H2: childData['Headpiece_H2'],
        Headpiece_H3: childData['Headpiece_H3'],
        Tail_D: childData['Tail_D'],
        Tail_H1: childData['Tail_H1'],
        Tail_H2: childData['Tail_H2'],
        Tail_H3: childData['Tail_H3'],
        Arms_D: childData['Arms_D'],
        Arms_H1: childData['Arms_H1'],
        Arms_H2: childData['Arms_H2'],
        Arms_H3: childData['Arms_H3'],
        Eyes_D: childData['Eyes_D'],
        Eyes_H1: childData['Eyes_H1'],
        Eyes_H2: childData['Eyes_H2'],
        Eyes_H3: childData['Eyes_H3'],
        Mouth_D: childData['Mouth_D'],
        Mouth_H1: childData['Mouth_H1'],
        Mouth_H2: childData['Mouth_H2'],
        Mouth_H3: childData['Mouth_H3'],
      },
      include: {
        AuraDominant: true,
        AuraHidden1: true,
        AuraHidden2: true,
        AuraHidden3: true,
        BodyDominant: true,
        BodyHidden1: true,
        BodyHidden2: true,
        BodyHidden3: true,
        CoreDominant: true,
        CoreHidden1: true,
        CoreHidden2: true,
        CoreHidden3: true,
        HeadpieceDominant: true,
        HeadpieceHidden1: true,
        HeadpieceHidden2: true,
        HeadpieceHidden3: true,
        TailDominant: true,
        TailHidden1: true,
        TailHidden2: true,
        TailHidden3: true,
        ArmsDominant: true,
        ArmsHidden1: true,
        ArmsHidden2: true,
        ArmsHidden3: true,
        EyesDominant: true,
        EyesHidden1: true,
        EyesHidden2: true,
        EyesHidden3: true,
        MouthDominant: true,
        MouthHidden1: true,
        MouthHidden2: true,
        MouthHidden3: true,
      },
    });


    return childSlime;
  } catch (error) {
    console.error(`Failed to breed slimes: ${error}`);
    throw error;
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
