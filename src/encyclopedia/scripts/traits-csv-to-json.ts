import * as fs from "fs";
import * as path from "path";
import csv from "csv-parser";
import { logger } from "../../utils/logger";
import { EffectType, Rarity } from "@prisma/client";

// Path Configuration
const inputCsvPath = path.resolve(__dirname, "../raw-csv/slime-traits.csv");
const outputJsonPath = path.resolve(__dirname, "../slime-traits.json");

// Define the expected stat fields & their mappings
const statEffectFields = [
    { csvField: "MAX HP Mod", jsonField: "maxHpMod", effectField: "maxHpEffect" },
    { csvField: "ATK SPD mod", jsonField: "atkSpdMod", effectField: "atkSpdEffect" },
    { csvField: "ACC Mod", jsonField: "accMod", effectField: "accEffect" },
    { csvField: "EVA Mod", jsonField: "evaMod", effectField: "evaEffect" },
    { csvField: "MAX MELEE DMG Mod", jsonField: "maxMeleeDmgMod", effectField: "maxMeleeDmgEffect" },
    { csvField: "MAX RANGE DMG Mod", jsonField: "maxRangedDmgMod", effectField: "maxRangedDmgEffect" },
    { csvField: "MAX MAGIC DMG Mod", jsonField: "maxMagicDmgMod", effectField: "maxMagicDmgEffect" },
    { csvField: "CRIT CHANCE Mod", jsonField: "critChanceMod", effectField: "critChanceEffect" },
    { csvField: "CRIT MULTIPLIER Mod", jsonField: "critMultiplierMod", effectField: "critMultiplierEffect" },
    { csvField: "DMG REDUCTION Mod", jsonField: "dmgReductionMod", effectField: "dmgReductionEffect" },
    { csvField: "MAGIC DMG REDUCTION Mod", jsonField: "magicDmgReductionMod", effectField: "magicDmgReductionEffect" },
    { csvField: "HP REGEN RATE Mod", jsonField: "hpRegenRateMod", effectField: "hpRegenRateEffect" },
    { csvField: "HP REGEN AMOUNT Mod", jsonField: "hpRegenAmountMod", effectField: "hpRegenAmountEffect" },
];

// Function to parse the stat effects
const parseStatEffect = (value: string): { mod: number; effect: EffectType } | null => {
    if (!value || value.trim() === "") return null;

    if (value.startsWith("*")) {
        return { mod: parseFloat(value.substring(1)), effect: "mul" as EffectType };
    } else {
        return { mod: parseFloat(value), effect: "add" as EffectType };
    }
};

// Function to parse the CSV row into the required object format
const parseRow = (row: any) => {
    try {
        const parsedObj: any = {
            id: parseInt(row["ID"], 10),
            type: row["Type"],
            name: row["Name"],
            rarity: row["Rarity"] as Rarity,
            pair0Id: row["Pair 0 ID"] ? parseInt(row["Pair 0 ID"], 10) : null,
            mutation0Id: row["Mutation 0 ID"] ? parseInt(row["Mutation 0 ID"], 10) : null,
            pair1Id: row["Pair 1 ID"] ? parseInt(row["Pair 1 ID"], 10) : null,
            mutation1Id: row["Mutation 1 ID"] ? parseInt(row["Mutation 1 ID"], 10) : null,
            statEffect: {},
        };

        // Parse stat effects
        for (const { csvField, jsonField, effectField } of statEffectFields) {
            const parsedEffect = parseStatEffect(row[csvField]);
            if (parsedEffect) {
                parsedObj.statEffect[jsonField] = parsedEffect.mod;
                parsedObj.statEffect[effectField] = parsedEffect.effect;
            }
        }

        return parsedObj;
    } catch (err) {
        logger.error(`Error parsing row ${JSON.stringify(row)}: ${err}`);
        return null;
    }
};

// Function to parse CSV file
const parseCSVFile = async () => {
    const results: any[] = [];

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(inputCsvPath)
            .pipe(csv())
            .on("data", (row) => {
                const parsed = parseRow(row);
                if (parsed) {
                    results.push(parsed);
                }
            })
            .on("end", () => {
                fs.writeFileSync(outputJsonPath, JSON.stringify(results, null, 2), "utf-8");
                logger.info(`Parsed CSV successfully. Output written to ${outputJsonPath}`);
                resolve();
            })
            .on("error", (error) => {
                logger.error(`Error reading CSV: ${error}`);
                reject(error);
            });
    });
};

// Execute CSV parsing
parseCSVFile().catch((err) => {
    logger.error(`Failed to parse CSV to JSON: ${err}`);
});