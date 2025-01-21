import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

type Rarity = 'D' | 'C' | 'B' | 'A' | 'S';

// Define max stats based on rarity
const rarityMaxStats: Record<Rarity, number> = {
    D: 0,
    C: 20,
    B: 50,
    A: 100,
    S: 200,
};

// Random stat generator within a given max
const generateRandomStat = (max: number): number => Math.floor(Math.random() * (max + 1));

// Define the path to the JSON file
const filePath = path.resolve(__dirname, '../slime-traits.json');

// Ensure the file exists
if (!fs.existsSync(filePath)) {
    logger.error('slime-traits.json does not exist.');
    process.exit(1);
}

try {
    // Read the existing traits from the file
    const fileData = fs.readFileSync(filePath, 'utf-8');
    const traits = JSON.parse(fileData);

    if (!Array.isArray(traits)) {
        throw new Error('Invalid JSON format: Expected an array of traits.');
    }

    // Iterate through each trait and assign random stats based on its rarity
    traits.forEach((trait) => {
        const rarity = String(trait.rarity).toUpperCase() as Rarity;
        if (!(rarity in rarityMaxStats)) {
            throw new Error(`Invalid rarity value for trait ID ${trait.id}: ${rarity}`);
        }

        const maxStat = rarityMaxStats[rarity];
        trait.str = generateRandomStat(maxStat);
        trait.def = generateRandomStat(maxStat);
        trait.dex = generateRandomStat(maxStat);
        trait.magic = generateRandomStat(maxStat);
        trait.hp = generateRandomStat(maxStat);
    });

    // Write the updated traits back to the file
    fs.writeFileSync(filePath, JSON.stringify(traits, null, 2), { flag: 'w' });

    logger.info('slime-traits.json has been successfully updated with random stats based on rarity.');
} catch (error) {
    logger.error(`Error updating slime-traits.json: ${error}`);
    process.exit(1);
}
