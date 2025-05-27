// NOTE: ONLY RUN AFTER SEEDING ITEMS, EQUIPMENT AND SLIME TRAITS

import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { logger } from '../../utils/logger';
import { AttackType, Equipment, Item, StatEffect } from '@prisma/client';
import { getEquipmentById } from '../../sql-services/equipment-service';
import { getItemById } from '../../sql-services/item-service';
import { getSlimeTraitById } from '../../sql-services/slime';
import { getBaseAccFromDex, getBaseAtkSpdFromLuk, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseDmgReductionFromDefAndStr, getBaseEvaFromLuk, getBaseHpRegenAmtFromHpLvlAndDef, getBaseHpRegenRateFromHpLvlAndDef, getBaseMagicDmgReductionFromDefAndMagic, getBaseMaxDmg, getBaseMaxHpFromHpLvl } from '../../managers/idle-managers/combat/combat-helpers';
import { parseUnits } from 'ethers';
import { DITTO_DECIMALS } from '../../utils/config';

interface Monster {
    id: number;
    name: string;
    description: string;
    imgsrc: string;
    level: number;

    str: number;
    def: number;
    dex: number;
    luk: number;
    magic: number;
    hpLevel: number;

    maxHp: number;
    atkSpd: number;
    acc: number;
    eva: number;
    maxMeleeDmg: number;
    maxRangedDmg: number;
    maxMagicDmg: number;
    critChance: number;
    critMultiplier: number;
    dmgReduction: number;
    magicDmgReduction: number;
    hpRegenRate: number;
    hpRegenAmount: number;

    exp: number;
    minGoldDrop: number;
    maxGoldDrop: number;
    minDittoDrop: string;
    maxDittoDrop: string;
    drops: MonsterDrop[];
    combat: Combat;
}

interface MonsterDrop {
    drop: Equipment | Item;
    type: 'Equipment' | 'Item';
    quantity: number;
    dropRate: number;
}

interface BaseCombat {
    maxHp: number;
    atkSpd: number;
    acc: number;
    eva: number;
    maxMeleeDmg: number;
    maxRangedDmg: number;
    maxMagicDmg: number;
    critChance: number;
    critMultiplier: number;
    dmgReduction: number;
    magicDmgReduction: number;
    hpRegenRate: number;
    hpRegenAmount: number;
}

interface Combat {
    attackType: AttackType;

    hp: number;
    maxHp: number;
    atkSpd: number;
    acc: number;
    eva: number;
    maxMeleeDmg: number;
    maxRangedDmg: number;
    maxMagicDmg: number;
    critChance: number;
    critMultiplier: number;
    dmgReduction: number;
    magicDmgReduction: number;
    hpRegenRate: number;
    hpRegenAmount: number;

    meleeFactor: number;
    rangeFactor: number;
    magicFactor: number;

    reinforceAir: number;
    reinforceWater: number;
    reinforceEarth: number;
    reinforceFire: number;
}

const inputCsvPath = path.resolve(__dirname, '../raw-csv/monsters.csv');
const outputJsonPath = path.resolve(__dirname, '../monsters.json');

function parseBaseCombat(
    str: number,
    def: number,
    dex: number,
    luk: number,
    magic: number,
    hpLevel: number,
): BaseCombat {
    return {
        maxHp: getBaseMaxHpFromHpLvl(hpLevel),
        atkSpd: getBaseAtkSpdFromLuk(luk),
        acc: getBaseAccFromDex(dex),
        eva: getBaseEvaFromLuk(dex),
        maxMeleeDmg: getBaseMaxDmg(str),
        maxRangedDmg: getBaseMaxDmg(dex),
        maxMagicDmg: getBaseMaxDmg(magic),
        critChance: getBaseCritChanceFromLuk(luk),
        critMultiplier: getBaseCritMulFromLuk(luk),
        dmgReduction: getBaseDmgReductionFromDefAndStr(def, str),
        magicDmgReduction: getBaseMagicDmgReductionFromDefAndMagic(def, magic),
        hpRegenRate: getBaseHpRegenRateFromHpLvlAndDef(hpLevel, def),
        hpRegenAmount: getBaseHpRegenAmtFromHpLvlAndDef(hpLevel, def)
    }
}

function parseCombat(
    str: number,
    def: number,
    dex: number,
    luk: number,
    magic: number,
    hpLevel: number,
    statEffects: StatEffect[],
    attackType: AttackType
): Combat {
    const baseCombat = parseBaseCombat(str, def, dex, luk, magic, hpLevel);

    let maxHp = baseCombat.maxHp;
    let atkSpd = baseCombat.atkSpd;
    let acc = baseCombat.acc;
    let eva = baseCombat.eva;
    let maxMeleeDmg = baseCombat.maxMeleeDmg;
    let maxRangedDmg = baseCombat.maxRangedDmg;
    let maxMagicDmg = baseCombat.maxMagicDmg;
    let critChance = baseCombat.critChance;
    let critMultiplier = baseCombat.critMultiplier;
    let dmgReduction = baseCombat.dmgReduction;
    let magicDmgReduction = baseCombat.magicDmgReduction;
    let hpRegenRate = baseCombat.hpRegenRate;
    let hpRegenAmount = baseCombat.hpRegenAmount;

    let meleeFactor = 0;
    let rangeFactor = 0;
    let magicFactor = 0;

    let reinforceAir = 0;
    let reinforceWater = 0;
    let reinforceEarth = 0;
    let reinforceFire = 0;

    for (const se of statEffects) {
        if (se.maxHpMod !== null) {
            maxHp += se.maxHpEffect === "add"
                ? se.maxHpMod
                : (se.maxHpMod - 1) * baseCombat.maxHp;
        }

        if (se.atkSpdMod !== null) {
            atkSpd += se.atkSpdEffect === "add"
                ? se.atkSpdMod
                : (se.atkSpdMod - 1) * baseCombat.atkSpd;
        }

        if (se.accMod !== null) {
            acc += se.accEffect === "add"
                ? se.accMod
                : (se.accMod - 1) * baseCombat.acc;
        }

        if (se.evaMod !== null) {
            eva += se.evaEffect === "add"
                ? se.evaMod
                : (se.evaMod - 1) * baseCombat.eva;
        }

        if (se.maxMeleeDmgMod !== null) {
            maxMeleeDmg += se.maxMeleeDmgEffect === "add"
                ? se.maxMeleeDmgMod
                : (se.maxMeleeDmgMod - 1) * baseCombat.maxMeleeDmg;
        }

        if (se.maxRangedDmgMod !== null) {
            maxRangedDmg += se.maxRangedDmgEffect === "add"
                ? se.maxRangedDmgMod
                : (se.maxRangedDmgMod - 1) * baseCombat.maxRangedDmg;
        }

        if (se.maxMagicDmgMod !== null) {
            maxMagicDmg += se.maxMagicDmgEffect === "add"
                ? se.maxMagicDmgMod
                : (se.maxMagicDmgMod - 1) * baseCombat.maxMagicDmg;
        }

        if (se.critChanceMod !== null) {
            critChance += se.critChanceEffect === "add"
                ? se.critChanceMod
                : (se.critChanceMod - 1) * baseCombat.critChance;
        }

        if (se.critMultiplierMod !== null) {
            critMultiplier += se.critMultiplierEffect === "add"
                ? se.critMultiplierMod
                : (se.critMultiplierMod - 1) * baseCombat.critMultiplier;
        }

        if (se.dmgReductionMod !== null) {
            dmgReduction += se.dmgReductionEffect === "add"
                ? se.dmgReductionMod
                : (se.dmgReductionMod - 1) * baseCombat.dmgReduction;
        }

        if (se.magicDmgReductionMod !== null) {
            magicDmgReduction += se.magicDmgReductionEffect === "add"
                ? se.magicDmgReductionMod
                : (se.magicDmgReductionMod - 1) * baseCombat.magicDmgReduction;
        }

        if (se.hpRegenRateMod !== null) {
            hpRegenRate += se.hpRegenRateEffect === "add"
                ? se.hpRegenRateMod
                : (se.hpRegenRateMod - 1) * baseCombat.hpRegenRate;
        }

        if (se.hpRegenAmountMod !== null) {
            hpRegenAmount += se.hpRegenAmountEffect === "add"
                ? se.hpRegenAmountMod
                : (se.hpRegenAmountMod - 1) * baseCombat.hpRegenAmount;
        }

        // Just add for all factor/reinforce values
        meleeFactor += se.meleeFactor ?? 0;
        rangeFactor += se.rangeFactor ?? 0;
        magicFactor += se.magicFactor ?? 0;

        reinforceAir += se.reinforceAir ?? 0;
        reinforceWater += se.reinforceWater ?? 0;
        reinforceEarth += se.reinforceEarth ?? 0;
        reinforceFire += se.reinforceFire ?? 0;
    }

    return {
        hp: maxHp,
        maxHp,
        attackType,
        atkSpd,
        acc,
        eva,
        maxMeleeDmg,
        maxRangedDmg,
        maxMagicDmg,
        critChance,
        critMultiplier,
        dmgReduction,
        magicDmgReduction,
        hpRegenRate,
        hpRegenAmount,
        meleeFactor,
        rangeFactor,
        magicFactor,
        reinforceAir,
        reinforceWater,
        reinforceEarth,
        reinforceFire,
    };
}

// Function to parse drop data from the CSV
async function parseMonsterDrops(itemDropsStr?: string, equipmentDropsStr?: string): Promise<MonsterDrop[]> {
    const drops: MonsterDrop[] = [];

    // Helper function to parse and fetch drops
    async function processDropEntry(entry: string, isEquipment: boolean) {
        const [idStr, qtyStr, rateStr] = entry.split("*").map(str => str.trim());

        if (!idStr || !qtyStr || !rateStr) {
            logger.warn(`Invalid drop format: ${entry}`);
            return;
        }

        const id = parseInt(idStr, 10);
        const quantity = parseInt(qtyStr, 10);
        const dropRate = parseFloat(rateStr);

        if (isNaN(id) || isNaN(quantity) || isNaN(dropRate)) {
            logger.warn(`Invalid drop values: ${entry}`);
            return;
        }

        try {
            const drop = isEquipment ? await getEquipmentById(id) : await getItemById(id);
            const type = isEquipment ? "Equipment" : "Item";
            if (drop) {
                drops.push({ drop, quantity, dropRate, type });
            } else {
                logger.warn(`Drop not found for ID ${id} (isEquipment: ${isEquipment})`);
            }
        } catch (error) {
            logger.error(`Error fetching drop for ID ${id}: ${error}`);
        }
    }

    // Process item drops (split by newline and trim)
    if (itemDropsStr) {
        const itemEntries = itemDropsStr.split("\n").map(entry => entry.trim()).filter(entry => entry.length > 0);
        await Promise.all(itemEntries.map(entry => processDropEntry(entry, false)));
    }

    // Process equipment drops (split by newline and trim)
    if (equipmentDropsStr) {
        const equipmentEntries = equipmentDropsStr.split("\n").map(entry => entry.trim()).filter(entry => entry.length > 0);
        await Promise.all(equipmentEntries.map(entry => processDropEntry(entry, true)));
    }

    return drops;
}

// Function to fetch all stat effects for given slime traits and equipment
export async function getMonsterStatEffects(slimeTraitIds: string, equipmentIds: string): Promise<StatEffect[]> {
    try {
        // Parse IDs from CSV format (comma-separated)
        const slimeIds = slimeTraitIds.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        const equipIds = equipmentIds.split(",").map(id => parseInt(id.trim())).filter(id => !isNaN(id));

        // Fetch SlimeTrait and Equipment stat effects in parallel
        const [slimeTraits, equipments] = await Promise.all([
            Promise.all(slimeIds.map(id => getSlimeTraitById(id))),
            Promise.all(equipIds.map(id => getEquipmentById(id)))
        ]);

        // Extract StatEffects (ignoring null values)
        const slimeStatEffects = slimeTraits.map(trait => trait?.statEffect).filter(Boolean) as StatEffect[];
        const equipmentStatEffects = equipments.map(equip => equip?.statEffect).filter(Boolean) as StatEffect[];

        // Return an array of all StatEffects (No merging, just a raw list)
        return [...slimeStatEffects, ...equipmentStatEffects];

    } catch (error) {
        logger.error(`Error fetching monster stat effects: ${error}`);
        throw error;
    }
}

function parseAttackType(value: string): AttackType {
    const lower = value.toLowerCase();

    if (lower.includes("ranged")) return AttackType.Ranged;
    if (lower.includes("magic")) return AttackType.Magic;

    return AttackType.Melee; // default
}

const parseCsvToJson = async () => {
    const rows: { [key: string]: string }[] = [];

    fs.createReadStream(inputCsvPath)
        .pipe(csv())
        .on('data', (row) => {
            rows.push(row); // collect first
        })
        .on('end', async () => {
            const monsters: Monster[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];

                try {
                    const buffs = await getMonsterStatEffects(row['Slime Traits'], row['Equipped']);
                    const monster: Monster = {
                        id: parseInt(row['Monster_ID'], 10),
                        name: row['Name'],
                        description: row['Description'],
                        imgsrc: row['Image Src'],
                        level: parseInt(row['Level'], 10),
                        str: parseInt(row['STR'], 10),
                        def: parseInt(row['DEF'], 10),
                        dex: parseInt(row['DEX'], 10),
                        luk: parseInt(row['LUK'], 10),
                        magic: parseInt(row['MAGIC'], 10),
                        hpLevel: parseInt(row['HP LEVEL'], 10),
                        exp: parseInt(row['EXP'], 10),
                        minGoldDrop: parseInt(row['Min Gold Drop'], 10),
                        maxGoldDrop: parseInt(row['Max Gold Drop'], 10),
                        minDittoDrop: parseUnits(row['Min DITTO Drop'], DITTO_DECIMALS).toString(),
                        maxDittoDrop: parseUnits(row['Max DITTO Drop'], DITTO_DECIMALS).toString(),
                        drops: await parseMonsterDrops(row['Item Drops'], row['Equipment Drops']),
                        combat: parseCombat(
                            parseInt(row['STR'], 10),
                            parseInt(row['DEF'], 10),
                            parseInt(row['DEX'], 10),
                            parseInt(row['LUK'], 10),
                            parseInt(row['MAGIC'], 10),
                            parseInt(row['HP LEVEL'], 10),
                            buffs,
                            parseAttackType(row['Attack Type'])
                        ),
                        ...parseBaseCombat(parseInt(row['STR'], 10),
                            parseInt(row['DEF'], 10),
                            parseInt(row['DEX'], 10),
                            parseInt(row['LUK'], 10),
                            parseInt(row['MAGIC'], 10),
                            parseInt(row['HP LEVEL'], 10),)
                    };

                    monsters.push(monster);
                    logger.info(`Parsed monster: ${monster.name} (ID: ${monster.id})`);
                } catch (err) {
                    logger.error(`Failed to parse monster at row ${i + 1}: ${err}`);
                }
            }

            fs.writeFileSync(outputJsonPath, JSON.stringify(monsters, null, 2));
            logger.info('✅ Monsters JSON file successfully written');
        });
};

parseCsvToJson().catch((err) => {
    logger.error('Failed to convert CSV to JSON:', err);
});
