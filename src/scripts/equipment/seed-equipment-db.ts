import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

async function seedEquipment() {
    try {
        // Read equipment data from JSON file
        const equipmentPath = path.join(__dirname, '../../encyclopedia/equipment.json');
        const equipmentData = JSON.parse(fs.readFileSync(equipmentPath, 'utf-8'));

        let insertedCount = 0;

        for (const equipment of equipmentData) {
            const { statEffect, ...equipmentFields } = equipment;

            // If statEffect exists, find or create it
            let statEffectRecord = null;
            if (statEffect) {
                statEffectRecord = await prisma.statEffect.findFirst({
                    where: {
                        maxHpMod: statEffect.maxHpMod ?? null,
                        maxHpEffect: statEffect.maxHpEffect ?? null,
                        atkSpdMod: statEffect.atkSpdMod ?? null,
                        atkSpdEffect: statEffect.atkSpdEffect ?? null,
                        accMod: statEffect.accMod ?? null,
                        accEffect: statEffect.accEffect ?? null,
                        evaMod: statEffect.evaMod ?? null,
                        evaEffect: statEffect.evaEffect ?? null,
                        maxMeleeDmgMod: statEffect.maxMeleeDmgMod ?? null,
                        maxMeleeDmgEffect: statEffect.maxMeleeDmgEffect ?? null,
                        maxRangedDmgMod: statEffect.maxRangedDmgMod ?? null,
                        maxRangedDmgEffect: statEffect.maxRangedDmgEffect ?? null,
                        maxMagicDmgMod: statEffect.maxMagicDmgMod ?? null,
                        maxMagicDmgEffect: statEffect.maxMagicDmgEffect ?? null,
                        critChanceMod: statEffect.critChanceMod ?? null,
                        critChanceEffect: statEffect.critChanceEffect ?? null,
                        critMultiplierMod: statEffect.critMultiplierMod ?? null,
                        critMultiplierEffect: statEffect.critMultiplierEffect ?? null,
                        dmgReductionMod: statEffect.dmgReductionMod ?? null,
                        dmgReductionEffect: statEffect.dmgReductionEffect ?? null,
                        magicDmgReductionMod: statEffect.magicDmgReductionMod ?? null,
                        magicDmgReductionEffect: statEffect.magicDmgReductionEffect ?? null,
                        hpRegenRateMod: statEffect.hpRegenRateMod ?? null,
                        hpRegenRateEffect: statEffect.hpRegenRateEffect ?? null,
                        hpRegenAmountMod: statEffect.hpRegenAmountMod ?? null,
                        hpRegenAmountEffect: statEffect.hpRegenAmountEffect ?? null,
                        meleeFactor: statEffect.meleeFactor ?? null,
                        rangeFactor: statEffect.rangeFactor ?? null,
                        magicFactor: statEffect.magicFactor ?? null,
                        reinforceAir: statEffect.reinforceAir ?? null,
                        reinforceWater: statEffect.reinforceWater ?? null,
                        reinforceEarth: statEffect.reinforceEarth ?? null,
                        reinforceFire: statEffect.reinforceFire ?? null
                    }
                });

                // If the `StatEffect` does not exist, create it
                if (!statEffectRecord) {
                    statEffectRecord = await prisma.statEffect.create({
                        data: statEffect
                    });
                }
            }

            // Upsert equipment to prevent duplicates and update if necessary
            const { id, ...safeEquipmentFields } = equipmentFields;

            await prisma.equipment.upsert({
              where: { name: equipment.name },
              update: {
                ...safeEquipmentFields,
                statEffectId: statEffectRecord ? statEffectRecord.id : null
              },
              create: {
                ...safeEquipmentFields,
                statEffectId: statEffectRecord ? statEffectRecord.id : null
              }
            });

            insertedCount++;
        }

        logger.info(`Inserted or updated ${insertedCount} equipment items.`);
    } catch (error) {
        logger.error(`Error seeding equipment data: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

seedEquipment();