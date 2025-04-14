import { AttackType, EffectType, EquipmentType, Rarity } from "@prisma/client"
import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { logger } from '../../utils/logger';
import { DITTO_DECIMALS } from "../../utils/config";
import { parseUnits } from "ethers";

interface Item {
    id: number;
    name: string;
    rarity: string;
    description: string;
    imgsrc: string;
    statEffectId?: number;
    farmingDurationS: number;
    farmingLevelRequired: number;
    farmingExp: number;
    sellPriceGP: number;
    buyPriceGP?: number;
    buyPriceDittoWei?: bigint;
}

interface Equipment {
    id: number;
    name: string;
    requiredLvl: number;
    attackType?: AttackType;
    description: string;
    imgsrc: string;
    statEffect: StatEffect;
    rarity: Rarity;
    type: EquipmentType;
    buyPriceGP?: number;
    sellPriceGP: number;
    buyPriceDittoWei?: string;
}

interface StatEffect {
    maxHpMod?: number;
    maxHpEffect?: EffectType;
    atkSpdMod?: number;
    atkSpdEffect?: EffectType;
    accMod?: number;
    accEffect?: EffectType;
    evaMod?: number;
    evaEffect?: EffectType;
    maxMeleeDmgMod?: number;
    maxMeleeDmgEffect?: EffectType;
    maxRangedDmgMod?: number;
    maxRangedDmgEffect?: EffectType;
    maxMagicDmgMod?: number;
    maxMagicDmgEffect?: EffectType;
    critChanceMod?: number;
    critChanceEffect?: EffectType;
    critMultiplierMod?: number;
    critMultiplierEffect?: EffectType;
    dmgReductionMod?: number;
    dmgReductionEffect?: EffectType;
    magicDmgReductionMod?: number;
    magicDmgReductionEffect?: EffectType;
    hpRegenRateMod?: number;
    hpRegenRateEffect?: EffectType;
    hpRegenAmountMod?: number;
    hpRegenAmountEffect?: EffectType;

    meleeFactor?: number;
    rangeFactor?: number;
    magicFactor?: number;

    reinforceAir?: number;
    reinforceWater?: number;
    reinforceEarth?: number;
    reinforceFire?: number;
}

interface CraftingRecipe {
    equipmentId: number;
    durationS: number;
    craftingLevelRequired: number;
    craftingExp: number;
    CraftingRecipeItems: {
        itemId: number;
        quantity: number;
    }[]
}

interface CraftingRecipeFrontEnd {
    equipmentId: number;
    equipmentName: string;
    type: EquipmentType;
    durationS: number;
    craftingLevelRequired: number;
    craftingExp: number;
    imgsrc: string;
    requiredItems: {
        itemId: number;
        itemName: string;
        imgsrc: string;
        quantity: number
    }[]
}

const inputCsvPath = path.resolve(__dirname, '../raw-csv/equipment.csv');
const outputEquipmentJsonPath = path.resolve(__dirname, '../equipment.json');
const outputCraftingRecipeJsonPath = path.resolve(__dirname, '../crafting-recipe.json');
const outputCraftingRecipeJsonFrontEndPath = path.resolve(__dirname, '../crafting-recipe-tma.json');

function parseStatEffect(value: string): { mod: number; effect: EffectType } | null {
    if (!value || value.trim() === "") return null;

    if (value.startsWith("*")) {
        return { mod: parseFloat(value.substring(1)), effect: "mul" as EffectType };
    } else {
        return { mod: parseFloat(value), effect: "add" as EffectType };
    }
}

function parseCraftingRecipe(input: string): { itemId: number; quantity: number }[] {
    return input.split("\n").map(line => {
        const [qty, itemId] = line.split("x").map(Number);
        return { itemId, quantity: qty };
    });
}

function parsePrice(value: string): number | undefined {
    if (!value || value.trim() === "") return undefined;

    // Remove spaces and convert M/B notation to numerical value
    value = value.replace(/\s/g, "").toUpperCase();

    if (value.endsWith("M")) {
        return parseFloat(value.replace("M", "")) * 1_000_000;
    } else if (value.endsWith("B")) {
        return parseFloat(value.replace("B", "")) * 1_000_000_000;
    } else if (value.endsWith("K")) {
        return parseFloat(value.replace("K", "")) * 1_000;
    }

    return parseFloat(value);
}

function parseEquipmentType(value: string): EquipmentType {
    const EquipmentTypeMap: { [key: string]: EquipmentType } = {
        hat: 'hat',
        armour: 'armour',
        weapon: 'weapon',
        shield: 'shield',
        cape: 'cape',
        necklace: 'necklace'
    };

    // Convert input to lowercase for case-insensitive matching
    const lowerValue = value.toLowerCase();

    // Check if any keyword is present in the value
    for (const key of Object.keys(EquipmentTypeMap)) {
        if (lowerValue.includes(key)) {
            return EquipmentTypeMap[key];
        }
    }

    // Default case if no match is found
    throw new Error(`Unknown Equipment Type: ${value}`);
}

function parseAttackType(value: string): AttackType | undefined {
  const lower = value.toLowerCase();

  if (lower.includes("melee")) return AttackType.Melee;
  if (lower.includes("ranged")) return AttackType.Ranged;
  if (lower.includes("magic")) return AttackType.Magic;

  return undefined;
}

const parseCsvToJson = async () => {
    const equipmentList: Equipment[] = [];
    const craftingRecipeList: CraftingRecipe[] = [];
    const craftingRecipeListFrontEnd: CraftingRecipeFrontEnd[] = [];

    // Read crafting recipe data from the JSON file
    const itemsPath = path.join(__dirname, '../../encyclopedia/items.json');
    const itemsData = JSON.parse(fs.readFileSync(itemsPath, 'utf-8'));
    const itemsRecord: Record<number, Item> = {};

    for (const item of itemsData) {
        itemsRecord[item.id] = item;
    }

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(inputCsvPath)
            .pipe(csv())
            .on('data', (row: { [key: string]: string }) => {
                try {
                    if (!row["Item Name"]) {
                        logger.warn(`Skipping empty row: ${JSON.stringify(row)}`);
                        return;
                    }

                    // **Parse Stat Effects**
                    const statEffect: StatEffect = {};
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
                    for (const { csvField, jsonField, effectField } of statEffectFields) {
                        const parsedEffect = parseStatEffect(row[csvField]);
                        if (parsedEffect) {
                            (statEffect as any)[jsonField] = parsedEffect.mod;
                            (statEffect as any)[effectField] = parsedEffect.effect;
                        }
                    }

                    // **Parse Equipment**
                    const equipment: Equipment = {
                        id: parseInt(row["ID"]),
                        name: row["Item Name"],
                        description: row["Description"],
                        requiredLvl: row["Required Lvl"] ? parseInt(row["Required Lvl"]) : 1,
                        attackType: parseAttackType(row["Category"]),
                        imgsrc: row["Image"] || "",
                        statEffect,
                        rarity: row["Rarity"] as Rarity,
                        type: parseEquipmentType(row["Category"]),
                        sellPriceGP: row['Sell Price (GP)'] ? parsePrice(row['Sell Price (GP)']) || 1 : 1,
                        buyPriceGP: row['Buy Price (GP)'] ? parsePrice(row['Buy Price (GP)']) : undefined,
                        buyPriceDittoWei: row['Buy Price ($DITTO)']
                            ? parsePrice(row['Buy Price ($DITTO)']) !== null
                                ? parseUnits(parsePrice(row['Buy Price ($DITTO)'])!.toString(), DITTO_DECIMALS).toString()
                                : undefined
                            : undefined,
                    };

                    equipment.statEffect.meleeFactor = row['MELEE FACTOR'] ? parseInt(row['MELEE FACTOR'], 10) : 0;
                    equipment.statEffect.rangeFactor = row['RANGE FACTOR'] ? parseInt(row['RANGE FACTOR'], 10) : 0;
                    equipment.statEffect.magicFactor = row['MAGIC FACTOR'] ? parseInt(row['MAGIC FACTOR'], 10) : 0;

                    equipment.statEffect.reinforceAir = row['REINFORCE AIR'] ? parseInt(row['REINFORCE AIR'], 10) : 0;
                    equipment.statEffect.reinforceWater = row['REINFORCE WATER'] ? parseInt(row['REINFORCE WATER'], 10) : 0;
                    equipment.statEffect.reinforceEarth = row['REINFORCE EARTH'] ? parseInt(row['REINFORCE EARTH'], 10) : 0;
                    equipment.statEffect.reinforceFire = row['REINFORCE FIRE'] ? parseInt(row['REINFORCE FIRE'], 10) : 0;

                    equipmentList.push(equipment);

                    if (row['Crafting Materials\n(qty x item id)'].length > 0) {
                        const recipe = {
                            equipmentId: parseInt(row["ID"]),
                            durationS: parseInt(row['Crafting Interval (S)'], 10),
                            craftingLevelRequired: parseInt(row['Crafting Level Req'], 10),
                            craftingExp: parseInt(row['Crafting XP'], 10),
                            CraftingRecipeItems: parseCraftingRecipe(row['Crafting Materials\n(qty x item id)'])
                        }

                        const recipeFrontEnd = {
                            equipmentId: parseInt(row["ID"]),
                            equipmentName: equipment.name,
                            type: equipment.type,
                            durationS: recipe.durationS,
                            craftingLevelRequired: recipe.craftingLevelRequired,
                            craftingExp: recipe.craftingExp,
                            imgsrc: equipment.imgsrc,
                            requiredItems: recipe.CraftingRecipeItems.map(item => ({
                                itemId: item.itemId,
                                itemName: itemsRecord[item.itemId].name,
                                imgsrc: itemsRecord[item.itemId].imgsrc,
                                quantity: item.quantity
                            }))
                        }

                        craftingRecipeList.push(recipe);
                        craftingRecipeListFrontEnd.push(recipeFrontEnd);
                    }
                } catch (err) {
                    logger.error(`Error parsing row ${JSON.stringify(row)}: ${err}`);
                }
            })
            .on('end', () => {
                fs.writeFileSync(outputEquipmentJsonPath, JSON.stringify(equipmentList, null, 2));
                logger.info('Equipment JSON file successfully created');

                fs.writeFileSync(outputCraftingRecipeJsonPath, JSON.stringify(craftingRecipeList, null, 2));
                logger.info('Crafting Recipes JSON file successfully created');

                fs.writeFileSync(outputCraftingRecipeJsonFrontEndPath, JSON.stringify(craftingRecipeListFrontEnd, null, 2));
                logger.info('Crafting Recipes Front End JSON file successfully created');

                resolve();
            })
            .on('error', (err: any) => {
                logger.error('Error reading CSV file:', err);
                reject(err);
            });
    });
};

parseCsvToJson().catch((err) => {
    logger.error('Failed to convert CSV to JSON:', err);
});