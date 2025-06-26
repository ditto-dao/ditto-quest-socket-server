import { SlimeTrait, TraitType, Rarity, StatEffect } from '@prisma/client';
import { GameCodexManager } from '../managers/game-codex/game-codex-manager';
import { logger } from '../utils/logger';
import { prismaFetchEquippedSlimeWithTraits, prismaFetchRandomSlimeTraitId, prismaFetchSlimeObjectWithTraits, prismaFetchSlimeTraitById, SlimeWithTraits } from '../sql-services/slime';
import { getMutationProbability, probabiltyToPassDownTrait, rarities, traitTypes } from '../utils/helpers';
import { processAndUploadSlimeImage } from '../slime-generation/slime-image-generation';
import { GACHA_PULL_ODDS_NERF, GACHA_PULL_ODDS } from '../utils/config';
import { DOMINANT_TRAITS_GACHA_SPECS, HIDDEN_TRAITS_GACHA_SPECS, GACHA_PULL_RARITIES, GachaOddsDominantTraits } from '../utils/gacha-odds';
import { canUserMintSlimeMemory, ensureRealId, recalculateAndUpdateUserStatsMemory } from './user-operations';
import { getSlimeIDManager, requireUserMemoryManager } from '../managers/global-managers/global-managers';
import { UserStatsWithCombat } from './combat-operations';

/**
 * Get SlimeTrait by ID using:
 * 1. GameCodexManager (RAM)
 * 2. Prisma fallback
 */
export async function getSlimeTraitById(traitId: number): Promise<(SlimeTrait & { statEffect: StatEffect | null }) | null> {
    try {
        if (GameCodexManager.isReady()) {
            const trait = GameCodexManager.getSlimeTrait(traitId);
            if (trait) {
                logger.debug(`🧠 getSlimeTraitById(${traitId}) — from RAM`);
                return trait;
            }
        }
    } catch (err) {
        logger.warn(`⚠️ RAM failed in getSlimeTraitById(${traitId}): ${err}`);
    }
    return await prismaFetchSlimeTraitById(traitId);
}

export async function getSlimeForUserById(userId: string, slimeId: number): Promise<SlimeWithTraits | null> {
    const userMemoryManager = requireUserMemoryManager();

    // Step 1: Check memory first with original ID
    const user = userMemoryManager.getUser(userId);
    if (user?.slimes) {
        // Try to find with original slimeId first
        let found = user.slimes.find(s => s.id === slimeId);
        if (found) return found as SlimeWithTraits;
    }

    // Step 2: DB fallback only for positive IDs
    if (slimeId > 0) {
        try {
            const fromDb = await prismaFetchSlimeObjectWithTraits(slimeId);

            // Verify the slime belongs to this user
            if (fromDb && fromDb.owner?.telegramId === userId) {
                // ✅ FIX 2: Update memory with the slime from DB if user is loaded
                if (user && userMemoryManager.hasUser(userId)) {
                    // Add the slime to user's slimes array in memory for future lookups
                    if (!user.slimes) user.slimes = [];

                    // Only add if not already present
                    const existsInMemory = user.slimes.some(s => s.id === fromDb.id);
                    if (!existsInMemory) {
                        user.slimes.push(fromDb);
                        userMemoryManager.markDirty(userId);
                        logger.debug(`Added slime ${slimeId} to memory for user ${userId}`);
                    }
                }

                return fromDb;
            }
        } catch (err) {
            logger.debug(`Failed to fetch slime ${slimeId} from DB: ${err}`);
        }
    }

    // Step 3: If slimeId is negative and not found in memory, it doesn't exist yet
    if (slimeId < 0) {
        logger.debug(`Temporary slime ID ${slimeId} not found in memory for user ${userId}`);
    }

    return null;
}

// Memory-based burn slime function
export async function burnSlimeMemory(
    telegramId: string,
    slimeId: number
): Promise<number> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            // Check if user has slimes
            if (!user.slimes || user.slimes.length === 0) {
                throw new Error(`User ${telegramId} has no slimes.`);
            }

            // Find the slime to burn
            const slimeToburn = user.slimes.find(slime => slime.id === slimeId);
            if (!slimeToburn) {
                throw new Error(`Slime with ID ${slimeId} does not exist in user's collection.`);
            }

            // Verify ownership (should always match since it's in user's slimes, but good to be explicit)
            if (slimeToburn.ownerId !== telegramId) {
                throw new Error(`Slime with ID ${slimeId} is not owned by user ${telegramId}.`);
            }

            // Check if the slime is currently equipped - unequip it first
            if (user.equippedSlimeId === slimeId) {
                logger.info(`Unequipping slime ${slimeId} before burning for user ${telegramId}`);
                await userMemoryManager.updateUserField(telegramId, 'equippedSlimeId', null);
                await userMemoryManager.updateUserField(telegramId, 'equippedSlime', null);
            }

            // Remove the slime from memory (this also queues it for DB deletion)
            const removed = userMemoryManager.removeSlime(telegramId, slimeId);

            if (!removed) {
                throw new Error(`Failed to remove slime ${slimeId} from memory for user ${telegramId}.`);
            }

            logger.info(`Successfully burned slime with ID: ${slimeId} (MEMORY)`);

            return slimeId;
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Failed to burn slime ${slimeId} for user ${telegramId} (MEMORY): ${error}`);
        throw error;
    }
}

export async function getRandomSlimeTraitId(
    traitType: TraitType,
    probabilities: number[]
): Promise<{ traitId: number; rarity: Rarity }> {
    try {
        if (probabilities.length !== 5 || Math.abs(probabilities.reduce((a, b) => a + b, 0) - 1) > 1e-6) {
            throw new Error(`Invalid probability array: ${probabilities}`);
        }

        // Step 1: Pick rarity based on probabilities
        const rand = Math.random();
        let cum = 0;
        let selectedRarity: Rarity | null = null;
        for (let i = 0; i < rarities.length; i++) {
            cum += probabilities[i];
            if (rand < cum) {
                selectedRarity = rarities[i];
                break;
            }
        }
        if (!selectedRarity) throw new Error("RNG failed to determine a rarity");

        // Step 2: Try to find trait from memory
        const allTraits = GameCodexManager.getAllSlimeTraits().filter(
            (t) => t.type === traitType && t.rarity === selectedRarity
        );

        if (allTraits.length > 0) {
            const randomTrait = allTraits[Math.floor(Math.random() * allTraits.length)];
            return { traitId: randomTrait.id, rarity: selectedRarity };
        }

        // Fallback
        return await prismaFetchRandomSlimeTraitId(traitType, probabilities);
    } catch (err) {
        logger.error(`❌ memoryFetchRandomSlimeTraitId failed: ${err}`);
        throw err;
    }
}

// Memory-based slime equip function
export async function equipSlimeForUserMemory(
    telegramId: string,
    slime: SlimeWithTraits
): Promise<UserStatsWithCombat> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (userMemoryManager.hasUser(telegramId)) {
            // Ensure we have a real ID
            const realSlimeId = await ensureRealId(telegramId, slime.id, 'slime');

            // Update slime object with real ID if it changed
            if (slime.id !== realSlimeId) {
                slime.id = realSlimeId;
                logger.info(`✅ Using real slime ID: ${realSlimeId}`);
            }

            // Update equipped slime in memory
            await userMemoryManager.updateUserField(telegramId, 'equippedSlimeId', slime.id);
            await userMemoryManager.updateUserField(telegramId, 'equippedSlime', slime);

            logger.info(`User ${telegramId} equipped slime ${slime.id} (MEMORY).`);

            // Recalculate stats and immediately persist
            const result = await recalculateAndUpdateUserStatsMemory(telegramId);

            logger.info(`✅ Equipment persisted for user ${telegramId}`);

            return result;
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(`Failed to equip slime ${slime.id} for user ${telegramId} (MEMORY): ${error}`);
        throw error;
    }
}

// Memory-based slime unequip function
export async function unequipSlimeForUserMemory(
    telegramId: string
): Promise<UserStatsWithCombat> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            // Check if already no slime equipped
            if (user.equippedSlimeId === null) {
                logger.info(
                    `User ${telegramId} already has no slime equipped (MEMORY).`
                );
                return user;
            }

            // Perform the unequip operation in memory
            await userMemoryManager.updateUserField(telegramId, 'equippedSlimeId', null);
            await userMemoryManager.updateUserField(telegramId, 'equippedSlime', null);

            logger.info(
                `User ${telegramId} unequipped slime (MEMORY).`
            );

            // Recalculate stats in memory
            const result = await recalculateAndUpdateUserStatsMemory(telegramId);

            return result;
        }

        throw new Error('User memory manager not available');

    } catch (error) {
        logger.error(
            `Failed to unequip slime for user ${telegramId} (MEMORY): ${error}`
        );
        throw error;
    }
}

// Memory-based getter for equipped slime with traits
export async function getEquippedSlimeWithTraitsMemory(
    telegramId: string
): Promise<SlimeWithTraits | null> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Try memory first
        if (userMemoryManager.hasUser(telegramId)) {
            const user = userMemoryManager.getUser(telegramId)!;

            // Return the equipped slime from memory (should already include all traits)
            return user.equippedSlime ?? null;
        }

        // Fallback to database version
        return await prismaFetchEquippedSlimeWithTraits(telegramId);

    } catch (error) {
        logger.error(
            `Failed to fetch equipped slime with traits for user ${telegramId} (MEMORY): ${error}`
        );
        throw error;
    }
}

interface GachaPullRes {
    slime: SlimeWithTraits,
    rankPull: string,
    slimeNoBg: Buffer
}

export async function slimeGachaPullMemory(ownerId: string, nerf: boolean = false): Promise<GachaPullRes> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        // Memory-first version of canUserMintSlime check
        if (!(await canUserMintSlimeMemory(ownerId))) {
            throw new Error(`Slime inventory full. Please clear space or upgrade your slots`);
        }

        const rankPull = getGachaPullRarity(nerf);
        const domOdds = DOMINANT_TRAITS_GACHA_SPECS[rankPull];
        const hidOdds = HIDDEN_TRAITS_GACHA_SPECS[rankPull];

        const domProbs = [domOdds.chanceD, domOdds.chanceC, domOdds.chanceB, domOdds.chanceA, domOdds.chanceS];
        const confirmProbs = getDominantTraitConfirmProbs(rankPull);
        const cappedProbs = getNormalizedProbsWhenMaxCountReached(rankPull, domProbs);
        const hidProbs = [hidOdds.chanceD, hidOdds.chanceC, hidOdds.chanceB, hidOdds.chanceA, hidOdds.chanceS];

        const { min, max } = getMinMaxForRank(rankPull, DOMINANT_TRAITS_GACHA_SPECS);
        let count = 0;

        const traitIdFields: Record<string, number> = {};
        const traitObjFields: Record<string, SlimeTrait & { statEffect: StatEffect | null }> = {};

        for (const type of traitTypes) {
            let dom: { traitId: number; rarity: Rarity };

            const traitsLeft = traitTypes.length - Object.keys(traitIdFields).filter(k => k.endsWith('_D')).length;
            if (traitsLeft === min - count) {
                dom = await getRandomSlimeTraitId(type, confirmProbs);
            } else if (count >= max) {
                dom = await getRandomSlimeTraitId(type, cappedProbs);
            } else {
                dom = await getRandomSlimeTraitId(type, domProbs);
            }

            if (dom.rarity === rankPull || (rankPull === 'SS' && dom.rarity === 'S')) {
                count++;
            }

            const domFull = await getSlimeTraitById(dom.traitId);
            const h1 = await getSlimeTraitById((await getRandomSlimeTraitId(type, hidProbs)).traitId);
            const h2 = await getSlimeTraitById((await getRandomSlimeTraitId(type, hidProbs)).traitId);
            const h3 = await getSlimeTraitById((await getRandomSlimeTraitId(type, hidProbs)).traitId);

            if (!domFull || !h1 || !h2 || !h3) {
                throw new Error(`Missing traits for ${type}`);
            }

            // Use correct field names that match your SlimeWithTraits interface
            traitIdFields[`${type}_D`] = domFull.id;
            traitIdFields[`${type}_H1`] = h1.id;
            traitIdFields[`${type}_H2`] = h2.id;
            traitIdFields[`${type}_H3`] = h3.id;

            traitObjFields[`${type}Dominant`] = domFull;
            traitObjFields[`${type}Hidden1`] = h1;
            traitObjFields[`${type}Hidden2`] = h2;
            traitObjFields[`${type}Hidden3`] = h3;
        }

        const realSlimeId = await getSlimeIDManager().getNextSlimeId();

        const slime: SlimeWithTraits = {
            id: realSlimeId,
            ownerId,
            generation: 0,
            imageUri: '', // temp, filled after image gen
            owner: { telegramId: ownerId },

            // Spread the trait IDs and objects
            ...traitIdFields,
            ...traitObjFields,
        } as SlimeWithTraits;

        const uriRes = await processAndUploadSlimeImage(slime);
        slime.imageUri = uriRes.uri;

        logger.info(`✅ Generated in-memory slime (id: ${slime.id})`);

        // Add slime to memory (this queues it for DB insertion later)
        userMemoryManager.appendSlime(ownerId, slime);

        return {
            slime,
            rankPull,
            slimeNoBg: uriRes.imageNoBg
        };

    } catch (error) {
        logger.error(`Failed to perform slime gacha pull for user ${ownerId} (MEMORY): ${error}`);
        throw error;
    }
}

export async function breedSlimesMemory(ownerId: string, sire: SlimeWithTraits, dame: SlimeWithTraits): Promise<SlimeWithTraits> {
    try {
        const userMemoryManager = requireUserMemoryManager();

        if (!sire || !dame) throw new Error("One or both slimes not found");
        if (sire.ownerId !== dame.ownerId) throw new Error("Owner mismatch");

        const userId = sire.ownerId;
        if (!(await canUserMintSlimeMemory(userId))) {
            throw new Error("Slime inventory full. Clear space or upgrade your slots");
        }

        const childData: Record<string, SlimeTrait & { statEffect: StatEffect | null }> = {};

        for (const type of traitTypes) {
            const sireD = sire[`${type}Dominant`]!;
            const sireH1 = sire[`${type}Hidden1`]!;
            const sireH2 = sire[`${type}Hidden2`]!;
            const sireH3 = sire[`${type}Hidden3`]!;
            const dameD = dame[`${type}Dominant`]!;
            const dameH1 = dame[`${type}Hidden1`]!;
            const dameH2 = dame[`${type}Hidden2`]!;
            const dameH3 = dame[`${type}Hidden3`]!;

            // Normal inheritance for dominant trait
            let childDId = getChildTraitId({
                sireDId: sireD.id, sireH1Id: sireH1.id, sireH2Id: sireH2.id, sireH3Id: sireH3.id,
                dameDId: dameD.id, dameH1Id: dameH1.id, dameH2Id: dameH2.id, dameH3Id: dameH3.id,
            });

            // Check for mutations (these override normal inheritance)
            if (
                sireD.pair0Id === dameD.id &&
                (dameD.pair0Id === sireD.id || dameD.pair1Id === sireD.id) &&
                (sireD.mutation0Id === dameD.mutation0Id || sireD.mutation0Id === dameD.mutation1Id) &&
                sireD.mutation0Id &&
                Math.random() < getMutationProbability(sireD.rarity)
            ) {
                childDId = sireD.mutation0Id;
            } else if (
                sireD.pair1Id === dameD.id &&
                (dameD.pair0Id === sireD.id || dameD.pair1Id === sireD.id) &&
                (sireD.mutation1Id === dameD.mutation0Id || sireD.mutation1Id === dameD.mutation1Id) &&
                sireD.mutation1Id &&
                Math.random() < getMutationProbability(sireD.rarity)
            ) {
                childDId = sireD.mutation1Id;
            }

            // Generate trait IDs for all genes (each hidden gene gets its own roll)
            const ids = {
                D: childDId,
                H1: getChildTraitId({
                    sireDId: sireD.id, sireH1Id: sireH1.id, sireH2Id: sireH2.id, sireH3Id: sireH3.id,
                    dameDId: dameD.id, dameH1Id: dameH1.id, dameH2Id: dameH2.id, dameH3Id: dameH3.id,
                }),
                H2: getChildTraitId({
                    sireDId: sireD.id, sireH1Id: sireH1.id, sireH2Id: sireH2.id, sireH3Id: sireH3.id,
                    dameDId: dameD.id, dameH1Id: dameH1.id, dameH2Id: dameH2.id, dameH3Id: dameH3.id,
                }),
                H3: getChildTraitId({
                    sireDId: sireD.id, sireH1Id: sireH1.id, sireH2Id: sireH2.id, sireH3Id: sireH3.id,
                    dameDId: dameD.id, dameH1Id: dameH1.id, dameH2Id: dameH2.id, dameH3Id: dameH3.id,
                }),
            };

            // Fetch full trait objects for all genes
            for (const slot of ['D', 'H1', 'H2', 'H3'] as const) {
                const trait = await getSlimeTraitById(ids[slot]);
                if (!trait) throw new Error(`Missing trait for ${type}_${slot} ID ${ids[slot]}`);
                childData[`${type}_${slot}`] = trait;
            }
        }

        const realSlimeId = await getSlimeIDManager().getNextSlimeId();

        const generation = Math.max(sire.generation, dame.generation) + 1;

        const childSlime: SlimeWithTraits = {
            id: realSlimeId,
            ownerId: userId,
            generation,
            imageUri: '',
            owner: { telegramId: userId },

            // Flat trait IDs
            Body_D: childData['Body_D'].id,
            Body_H1: childData['Body_H1'].id,
            Body_H2: childData['Body_H2'].id,
            Body_H3: childData['Body_H3'].id,

            Pattern_D: childData['Pattern_D'].id,
            Pattern_H1: childData['Pattern_H1'].id,
            Pattern_H2: childData['Pattern_H2'].id,
            Pattern_H3: childData['Pattern_H3'].id,

            PrimaryColour_D: childData['PrimaryColour_D'].id,
            PrimaryColour_H1: childData['PrimaryColour_H1'].id,
            PrimaryColour_H2: childData['PrimaryColour_H2'].id,
            PrimaryColour_H3: childData['PrimaryColour_H3'].id,

            Accent_D: childData['Accent_D'].id,
            Accent_H1: childData['Accent_H1'].id,
            Accent_H2: childData['Accent_H2'].id,
            Accent_H3: childData['Accent_H3'].id,

            Detail_D: childData['Detail_D'].id,
            Detail_H1: childData['Detail_H1'].id,
            Detail_H2: childData['Detail_H2'].id,
            Detail_H3: childData['Detail_H3'].id,

            EyeColour_D: childData['EyeColour_D'].id,
            EyeColour_H1: childData['EyeColour_H1'].id,
            EyeColour_H2: childData['EyeColour_H2'].id,
            EyeColour_H3: childData['EyeColour_H3'].id,

            EyeShape_D: childData['EyeShape_D'].id,
            EyeShape_H1: childData['EyeShape_H1'].id,
            EyeShape_H2: childData['EyeShape_H2'].id,
            EyeShape_H3: childData['EyeShape_H3'].id,

            Mouth_D: childData['Mouth_D'].id,
            Mouth_H1: childData['Mouth_H1'].id,
            Mouth_H2: childData['Mouth_H2'].id,
            Mouth_H3: childData['Mouth_H3'].id,

            // Full trait objects
            BodyDominant: childData['Body_D'],
            BodyHidden1: childData['Body_H1'],
            BodyHidden2: childData['Body_H2'],
            BodyHidden3: childData['Body_H3'],

            PatternDominant: childData['Pattern_D'],
            PatternHidden1: childData['Pattern_H1'],
            PatternHidden2: childData['Pattern_H2'],
            PatternHidden3: childData['Pattern_H3'],

            PrimaryColourDominant: childData['PrimaryColour_D'],
            PrimaryColourHidden1: childData['PrimaryColour_H1'],
            PrimaryColourHidden2: childData['PrimaryColour_H2'],
            PrimaryColourHidden3: childData['PrimaryColour_H3'],

            AccentDominant: childData['Accent_D'],
            AccentHidden1: childData['Accent_H1'],
            AccentHidden2: childData['Accent_H2'],
            AccentHidden3: childData['Accent_H3'],

            DetailDominant: childData['Detail_D'],
            DetailHidden1: childData['Detail_H1'],
            DetailHidden2: childData['Detail_H2'],
            DetailHidden3: childData['Detail_H3'],

            EyeColourDominant: childData['EyeColour_D'],
            EyeColourHidden1: childData['EyeColour_H1'],
            EyeColourHidden2: childData['EyeColour_H2'],
            EyeColourHidden3: childData['EyeColour_H3'],

            EyeShapeDominant: childData['EyeShape_D'],
            EyeShapeHidden1: childData['EyeShape_H1'],
            EyeShapeHidden2: childData['EyeShape_H2'],
            EyeShapeHidden3: childData['EyeShape_H3'],

            MouthDominant: childData['Mouth_D'],
            MouthHidden1: childData['Mouth_H1'],
            MouthHidden2: childData['Mouth_H2'],
            MouthHidden3: childData['Mouth_H3'],
        };

        const uriRes = await processAndUploadSlimeImage(childSlime);
        childSlime.imageUri = uriRes.uri;

        userMemoryManager.appendSlime(userId, childSlime);

        return childSlime;
    } catch (err) {
        logger.error(`❌ Failed to breed slimes in memory: ${err}`);
        throw err;
    }
}

/* HELPERS */

export function getChildTraitId({
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

export function getGachaPullRarity(useNerf: boolean = false): string {
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

export function getDominantTraitConfirmProbs(rankPull: string): number[] {
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

export function getNormalizedProbsWhenMaxCountReached(rankPull: string, dominantTraitProbs: number[]): number[] {
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
export function getMinMaxForRank(
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