import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { EffectType } from "@prisma/client";

type Rarity = 'D' | 'C' | 'B' | 'A' | 'S';

// **Stat Buff Ranges (Fixed)**
const statBuffRanges = {
    "maxHpMod": { minFlat: 100, maxFlat: 10000, minMult: 1.02, maxMult: 1.2 },
    "atkSpdMod": { minFlat: 1, maxFlat: 1000, minMult: 1.02, maxMult: 1.1 },
    "accMod": { minFlat: 10, maxFlat: 20000, minMult: 1.02, maxMult: 1.1 },
    "evaMod": { minFlat: 10, maxFlat: 15000, minMult: 1.02, maxMult: 1.1 },
    "maxMeleeDmgMod": { minFlat: 2, maxFlat: 500, minMult: 1.02, maxMult: 1.2 },
    "maxRangedDmgMod": { minFlat: 2, maxFlat: 500, minMult: 1.02, maxMult: 1.2 },
    "maxMagicDmgMod": { minFlat: 2, maxFlat: 500, minMult: 1.02, maxMult: 1.2 },
    "critChanceMod": { minFlat: 0.001, maxFlat: 0.1, minMult: 1.02, maxMult: 1.2 },
    "critMultiplierMod": { minFlat: 0.02, maxFlat: 0.25, minMult: 1.02, maxMult: 1.2 },
    "dmgReductionMod": { minFlat: 10, maxFlat: 2500, minMult: 1.02, maxMult: 1.2 },
    "magicDmgReductionMod": { minFlat: 10, maxFlat: 2500, minMult: 1.02, maxMult: 1.2 },
    "hpRegenRateMod": { minFlat: 0, maxFlat: 0, minMult: 0.95, maxMult: 0.85 }, // Always multiplicative
    "hpRegenAmountMod": { minFlat: 2, maxFlat: 120, minMult: 1.02, maxMult: 1.1 },
};

// **Moving Window Ranges Per Rarity**
const rarityWindow: Record<Rarity, { minShift: number; maxShift: number }> = {
    D: { minShift: 0.0, maxShift: 0.05 },  
    C: { minShift: 0.1, maxShift: 0.4 },  
    B: { minShift: 0.3, maxShift: 0.6 },  
    A: { minShift: 0.5, maxShift: 0.8 },  
    S: { minShift: 0.7, maxShift: 1.0 },  
};

// **Multiplicative Buff Probability**
const rarityMulChance: Record<Rarity, number> = {
    D: 1,  
    C: 1,   
    B: 1,  
    A: 1,  
    S: 1,  
};

// **Path to JSON file**
const filePath = path.resolve(__dirname, '../slime-traits.json');

if (!fs.existsSync(filePath)) {
    logger.error('slime-traits.json does not exist.');
    process.exit(1);
}

// **Moving Window Randomizer**
const getRandomValueInRange = (min: number, max: number, rarity: Rarity, isWholeNumber: boolean = true): number => {
    const { minShift, maxShift } = rarityWindow[rarity];

    // Define the window for this rarity
    const range = max - min;
    const rarityMin = min + range * minShift;
    const rarityMax = min + range * maxShift;

    // Randomly select a value in this shifted range
    const value = Math.random() * (rarityMax - rarityMin) + rarityMin;
    return isWholeNumber ? Math.round(value) : parseFloat(value.toFixed(3));
};

// **Determine `add` or `mul`, biasing `mul` for higher rarities**
const getEffectType = (rarity: Rarity, isAlwaysMultiplicative = false): EffectType => {
    return isAlwaysMultiplicative || Math.random() < rarityMulChance[rarity] ? "mul" : "add";
};

// **Read and update traits**
try {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const traits = JSON.parse(fileData);

    if (!Array.isArray(traits)) {
        throw new Error('Invalid JSON format: Expected an array of traits.');
    }

    // **Assign stat effects**
    traits.forEach((trait) => {
        const rarity = String(trait.rarity).toUpperCase() as Rarity;
        if (!(rarity in rarityWindow)) {
            throw new Error(`Invalid rarity value for trait ID ${trait.id}: ${rarity}`);
        }

        const statEffect: Record<string, any> = {};

        for (const [key, { minFlat, maxFlat, minMult, maxMult }] of Object.entries(statBuffRanges)) {
            // Decide whether this stat will use `add` or `mul`
            const isMultiplicative = true;;

            if (isMultiplicative) {
                statEffect[key] = getRandomValueInRange(minMult, maxMult, rarity, false);
                statEffect[key.replace("Mod", "Effect")] = "mul";
            } else {
                statEffect[key] = getRandomValueInRange(minFlat, maxFlat, rarity);
                statEffect[key.replace("Mod", "Effect")] = "add";
            }
        }

        trait.statEffect = statEffect;
    });

    // **Write updated traits**
    fs.writeFileSync(filePath, JSON.stringify(traits, null, 2), { flag: 'w' });

    logger.info('slime-traits.json updated with strict min-max scaling (moving window) for BOTH flat and mult.');
} catch (error) {
    logger.error(`Error updating slime-traits.json: ${error}`);
    process.exit(1);
}