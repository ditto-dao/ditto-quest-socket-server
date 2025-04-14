import * as fs from 'fs';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import * as path from 'path';

// Define the buff ranges for each stat
const statBuffRanges = {
    "MAX HP Mod": { minFlat: 100, maxFlat: 10000, minMult: 1.02, maxMult: 1.75 },
    "ATK SPD mod": { minFlat: 1, maxFlat: 1000, minMult: 1.02, maxMult: 1.5 },
    "ACC Mod": { minFlat: 10, maxFlat: 20000, minMult: 1.02, maxMult: 1.3 },
    "EVA Mod": { minFlat: 10, maxFlat: 15000, minMult: 1.02, maxMult: 1.3 },
    "MAX MELEE DMG Mod": { minFlat: 2, maxFlat: 500, minMult: 1.02, maxMult: 1.5 },
    "MAX RANGE DMG Mod": { minFlat: 2, maxFlat: 500, minMult: 1.02, maxMult: 1.5 },
    "MAX MAGIC DMG Mod": { minFlat: 2, maxFlat: 500, minMult: 1.02, maxMult: 1.5 },
    "CRIT CHANCE Mod": { minFlat: 0.001, maxFlat: 0.1, minMult: 1.02, maxMult: 1.5 },
    "CRIT MULTIPLIER Mod": { minFlat: 0.02, maxFlat: 0.25, minMult: 1.02, maxMult: 1.5 },
    "DMG REDUCTION Mod": { minFlat: 10, maxFlat: 2500, minMult: 1.02, maxMult: 1.5 },
    "MAGIC DMG REDUCTION Mod": { minFlat: 10, maxFlat: 2500, minMult: 1.02, maxMult: 1.5 },
    "HP REGEN RATE Mod": { minFlat: 0, maxFlat: 0, minMult: 0.95, maxMult: 0.75 },
    "HP REGEN AMOUNT Mod": { minFlat: 2, maxFlat: 120, minMult: 1.02, maxMult: 1.3 },
};

// Function to generate a random number within a given range
const getRandomInRange = (min: number, max: number, isWholeNumber = true) => {
    const value = Math.random() * (max - min) + min;
    return isWholeNumber ? Math.round(value) : parseFloat(value.toFixed(3));
};

// Function to scale buffs based on Required Level
const generateBuffs = (requiredLvl: number) => {
    const buffs: Record<string, string | number> = {};
    const scalingFactor = Math.min(1, requiredLvl / 100); // Caps at level 100

    for (const stat of Object.keys(statBuffRanges) as (keyof typeof statBuffRanges)[]) {
        const { minFlat, maxFlat, minMult, maxMult } = statBuffRanges[stat];

        if (stat === "HP REGEN RATE Mod") {
            // HP REGEN RATE is always a multiplicative buff
            buffs[stat] = `*${getRandomInRange(minMult, maxMult, false)}`;
        } else {
            // Higher level items have an increased chance for multiplicative buffs
            const isMultiplicative = Math.random() < (0.3 + requiredLvl * 0.005);

            if (isMultiplicative) {
                const scaledMult = minMult + (maxMult - minMult) * scalingFactor;
                buffs[stat] = `*${getRandomInRange(minMult, scaledMult, false)}`;
            } else {
                const scaledFlat = minFlat + (maxFlat - minFlat) * scalingFactor;
                buffs[stat] = getRandomInRange(minFlat, scaledFlat);
            }
        }
    }

    return buffs;
};

// Read CSV and process data
const inputFile = path.resolve(__dirname, '../raw-csv/equipment.csv');
const outputFile = path.resolve(__dirname, '../raw-csv/processed_equipment.csv');

const results: any[] = [];

fs.createReadStream(inputFile)
    .pipe(csv())
    .on('data', (row) => {
        row["Required Lvl"] = row["Crafting Level Req"]; // Set Required Lvl to Crafting Level Req
        const requiredLvl = parseInt(row["Required Lvl"] || "1", 10);
        const buffs = generateBuffs(requiredLvl);
        Object.assign(row, buffs);
        results.push(row);
    })
    .on('end', () => {
        console.log("CSV processing complete:", results);

        // Write processed data to a new CSV file
        const csvWriter = createObjectCsvWriter({
            path: outputFile,
            header: Object.keys(results[0]).map(key => ({ id: key, title: key }))
        });

        csvWriter.writeRecords(results)
            .then(() => console.log(`Processed CSV saved as ${outputFile}`));
    });