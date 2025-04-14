
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';
import { EffectType, Prisma, Rarity, TraitType } from "@prisma/client";

interface StatEffect {
  maxHpMod?: number;
  maxHpEffect?: EffectType | null;
  atkSpdMod?: number;
  atkSpdEffect?: EffectType | null;
  accMod?: number;
  accEffect?: EffectType | null;
  evaMod?: number;
  evaEffect?: EffectType | null;
  maxMeleeDmgMod?: number;
  maxMeleeDmgEffect?: EffectType | null;
  maxRangedDmgMod?: number;
  maxRangedDmgEffect?: EffectType | null;
  maxMagicDmgMod?: number;
  maxMagicDmgEffect?: EffectType | null;
  critChanceMod?: number;
  critChanceEffect?: EffectType | null;
  critMultiplierMod?: number;
  critMultiplierEffect?: EffectType | null;
  dmgReductionMod?: number;
  dmgReductionEffect?: EffectType | null;
  magicDmgReductionMod?: number;
  magicDmgReductionEffect?: EffectType | null;
  hpRegenRateMod?: number;
  hpRegenRateEffect?: EffectType | null;
  hpRegenAmountMod?: number;
  hpRegenAmountEffect?: EffectType | null;
}

interface SlimeTrait {
  id: number;
  type: string;
  name: string;
  rarity: string;
  pair0Id?: number | null;
  mutation0Id?: number | null;
  pair1Id?: number | null;
  mutation1Id?: number | null;
  statEffect?: StatEffect | null;
}

async function seedSlimeTraits() {
  const slimeTraitsPath = path.join(__dirname, '../../encyclopedia/slime-traits.json');
  const slimeTraitsData = fs.readFileSync(slimeTraitsPath, 'utf-8');
  const slimeTraits: SlimeTrait[] = JSON.parse(slimeTraitsData);

  try {
    await prisma.$transaction(async (tx) => {
      logger.info('Seeding slime traits with stat effects...');

      for (const trait of slimeTraits) {
        const existing = await tx.slimeTrait.findUnique({
          where: { id: trait.id },
          include: { statEffect: true },
        });

        let statEffectId = null;
        if (trait.statEffect) {
          const formatted: Prisma.StatEffectUpdateInput = {
            maxHpMod: trait.statEffect.maxHpMod ?? null,
            maxHpEffect: convertEffectType(trait.statEffect.maxHpEffect),
            atkSpdMod: trait.statEffect.atkSpdMod ?? null,
            atkSpdEffect: convertEffectType(trait.statEffect.atkSpdEffect),
            accMod: trait.statEffect.accMod ?? null,
            accEffect: convertEffectType(trait.statEffect.accEffect),
            evaMod: trait.statEffect.evaMod ?? null,
            evaEffect: convertEffectType(trait.statEffect.evaEffect),
            maxMeleeDmgMod: trait.statEffect.maxMeleeDmgMod ?? null,
            maxMeleeDmgEffect: convertEffectType(trait.statEffect.maxMeleeDmgEffect),
            maxRangedDmgMod: trait.statEffect.maxRangedDmgMod ?? null,
            maxRangedDmgEffect: convertEffectType(trait.statEffect.maxRangedDmgEffect),
            maxMagicDmgMod: trait.statEffect.maxMagicDmgMod ?? null,
            maxMagicDmgEffect: convertEffectType(trait.statEffect.maxMagicDmgEffect),
            critChanceMod: trait.statEffect.critChanceMod ?? null,
            critChanceEffect: convertEffectType(trait.statEffect.critChanceEffect),
            critMultiplierMod: trait.statEffect.critMultiplierMod ?? null,
            critMultiplierEffect: convertEffectType(trait.statEffect.critMultiplierEffect),
            dmgReductionMod: trait.statEffect.dmgReductionMod ?? null,
            dmgReductionEffect: convertEffectType(trait.statEffect.dmgReductionEffect),
            magicDmgReductionMod: trait.statEffect.magicDmgReductionMod ?? null,
            magicDmgReductionEffect: convertEffectType(trait.statEffect.magicDmgReductionEffect),
            hpRegenRateMod: trait.statEffect.hpRegenRateMod ?? null,
            hpRegenRateEffect: convertEffectType(trait.statEffect.hpRegenRateEffect),
            hpRegenAmountMod: trait.statEffect.hpRegenAmountMod ?? null,
            hpRegenAmountEffect: convertEffectType(trait.statEffect.hpRegenAmountEffect),
          };

          if (existing?.statEffect?.id) {
            await tx.statEffect.update({
              where: { id: existing.statEffect.id },
              data: formatted,
            });
            statEffectId = existing.statEffect.id;
          } else {
            const created = await tx.statEffect.create({ data: formatted as Prisma.StatEffectCreateInput });
            statEffectId = created.id;
          }
        }

        await tx.slimeTrait.upsert({
          where: { id: trait.id },
          update: {
            name: trait.name,
            type: trait.type as TraitType,
            rarity: trait.rarity as Rarity,
            statEffectId,
          },
          create: {
            id: trait.id,
            name: trait.name,
            type: trait.type as TraitType,
            rarity: trait.rarity as Rarity,
            statEffectId,
          },
        });
      }

      const updateData = slimeTraits.map((trait) => ({
        id: trait.id,
        pair0Id: trait.pair0Id ?? null,
        mutation0Id: trait.mutation0Id ?? null,
        pair1Id: trait.pair1Id ?? null,
        mutation1Id: trait.mutation1Id ?? null,
      }));

      await Promise.all(
        updateData.map((t) =>
          tx.slimeTrait.update({
            where: { id: t.id },
            data: {
              pair0Id: t.pair0Id,
              mutation0Id: t.mutation0Id,
              pair1Id: t.pair1Id,
              mutation1Id: t.mutation1Id,
            },
          })
        )
      );

      logger.info("Slime trait seeding complete.");
    });
  } catch (err) {
    logger.error("Failed to seed slime traits:", err);
  } finally {
    await prisma.$disconnect();
  }
}

function convertEffectType(value?: string | null): EffectType | null {
  if (!value) return null;
  return value === 'mul' ? EffectType.mul : EffectType.add;
}

seedSlimeTraits();
