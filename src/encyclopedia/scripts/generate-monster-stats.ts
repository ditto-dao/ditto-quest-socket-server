import * as path from 'path';
import { ABILITY_POINTS_PER_LEVEL } from "../../utils/config";
import { calculateExpForNextLevel, calculateHpExpGained } from "../../utils/helpers";
import { logger } from "../../utils/logger";
import { createObjectCsvWriter } from 'csv-writer';

// Function to find HP Level based on HP Experience Gained
function findHpLevel(hpExpGained: number): number {
    let hpLvl = 1;
    let accumulatedExp = 0;

    while (true) {
        const expForNext = calculateExpForNextLevel(hpLvl);
        if (accumulatedExp + expForNext > hpExpGained) {
            return hpLvl; // Stop when next level exceeds exp
        }
        accumulatedExp += expForNext;
        hpLvl++;
    }
}

// Define CSV file path
const outputCsvPath = path.resolve(__dirname, 'monster_levels.csv');

const csvWriter = createObjectCsvWriter({
    path: outputCsvPath,
    header: [
        { id: 'monsterLvl', title: 'Monster Lvl' },
        { id: 'hpLvl', title: 'HP Lvl' },
        { id: 'abilityPoints', title: 'Ability Points' }
    ]
});

// Generate data from level 1 to 500
const data = [];
for (let monsterLvl = 1; monsterLvl <= 500; monsterLvl++) {
    let expGained = 0;
    for (let i = 1; i <= monsterLvl; i++) {
        expGained += calculateExpForNextLevel(i);
    }

    const hpExpGained = calculateHpExpGained(expGained);
    const hpLevel = findHpLevel(hpExpGained);

    data.push({
        monsterLvl,
        hpLvl: hpLevel,
        abilityPoints: monsterLvl * ABILITY_POINTS_PER_LEVEL
    });
}

// Write to CSV
csvWriter.writeRecords(data)
    .then(() => logger.info(`✅ Successfully written to ${outputCsvPath}`))
    .catch(error => logger.error(`❌ Error writing CSV: ${error}`));