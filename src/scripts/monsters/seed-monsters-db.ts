import fs from "fs";
import path from "path";
import { prisma } from "../../sql-services/client";
import { logger } from "../../utils/logger";
import { calculateCombatPower } from "../../utils/helpers";

async function seedMonsters() {
  const monstersPath = path.join(__dirname, '../../encyclopedia/monsters.json');
  const monsterData = JSON.parse(fs.readFileSync(monstersPath, "utf-8"));

  for (const monster of monsterData) {
    try {
      const existing = await prisma.monster.findUnique({
        where: { id: monster.id },
      });

      // If monster exists, update
      if (existing) {
        const updatedCombat = await prisma.combat.update({
          where: { id: existing.combatId },
          data: {
            hp: monster.combat.hp,
            maxHp: monster.combat.maxHp,
            atkSpd: monster.combat.atkSpd,
            acc: monster.combat.acc,
            eva: monster.combat.eva,
            maxMeleeDmg: monster.combat.maxMeleeDmg,
            maxRangedDmg: monster.combat.maxRangedDmg,
            maxMagicDmg: monster.combat.maxMagicDmg,
            critChance: monster.combat.critChance,
            critMultiplier: monster.combat.critMultiplier,
            dmgReduction: monster.combat.dmgReduction,
            magicDmgReduction: monster.combat.magicDmgReduction,
            hpRegenRate: monster.combat.hpRegenRate,
            hpRegenAmount: monster.combat.hpRegenAmount,
            meleeFactor: monster.combat.meleeFactor,
            rangeFactor: monster.combat.rangeFactor,
            magicFactor: monster.combat.magicFactor,
            reinforceAir: monster.combat.reinforceAir,
            reinforceWater: monster.combat.reinforceWater,
            reinforceEarth: monster.combat.reinforceEarth,
            reinforceFire: monster.combat.reinforceFire,
            cp: calculateCombatPower(monster.combat),
          }
        });

        await prisma.monster.update({
          where: { id: monster.id },
          data: {
            name: monster.name,
            description: monster.description,
            imgsrc: monster.imgsrc,
            level: monster.level,
            str: monster.str,
            def: monster.def,
            dex: monster.dex,
            luk: monster.luk,
            magic: monster.magic,
            hpLevel: monster.hpLevel,
            maxHp: monster.maxHp,
            atkSpd: monster.atkSpd,
            acc: monster.acc,
            eva: monster.eva,
            maxMeleeDmg: monster.maxMeleeDmg,
            maxRangedDmg: monster.maxRangedDmg,
            maxMagicDmg: monster.maxMagicDmg,
            critChance: monster.critChance,
            critMultiplier: monster.critMultiplier,
            dmgReduction: monster.dmgReduction,
            magicDmgReduction: monster.magicDmgReduction,
            hpRegenRate: monster.hpRegenRate,
            hpRegenAmount: monster.hpRegenAmount,
            exp: monster.exp,
            minGoldDrop: monster.minGoldDrop,
            maxGoldDrop: monster.maxGoldDrop,
            minDittoDrop: monster.minDittoDrop,
            maxDittoDrop: monster.maxDittoDrop
          }
        });

        logger.info(`✅ Updated monster: ${monster.name}`);
      } else {
        // If monster doesn't exist, create Combat + Monster + Drops
        const createdCombat = await prisma.combat.create({
          data: {
             ...monster.combat, 
            cp: calculateCombatPower(monster.combat),
          }
        });

        const createdMonster = await prisma.monster.create({
          data: {
            id: monster.id, // preserve ID
            name: monster.name,
            description: monster.description,
            imgsrc: monster.imgsrc,
            level: monster.level,
            str: monster.str,
            def: monster.def,
            dex: monster.dex,
            luk: monster.luk,
            magic: monster.magic,
            hpLevel: monster.hpLevel,
            maxHp: monster.maxHp,
            atkSpd: monster.atkSpd,
            acc: monster.acc,
            eva: monster.eva,
            maxMeleeDmg: monster.maxMeleeDmg,
            maxRangedDmg: monster.maxRangedDmg,
            maxMagicDmg: monster.maxMagicDmg,
            critChance: monster.critChance,
            critMultiplier: monster.critMultiplier,
            dmgReduction: monster.dmgReduction,
            magicDmgReduction: monster.magicDmgReduction,
            hpRegenRate: monster.hpRegenRate,
            hpRegenAmount: monster.hpRegenAmount,
            exp: monster.exp,
            minGoldDrop: monster.minGoldDrop,
            maxGoldDrop: monster.maxGoldDrop,
            minDittoDrop: monster.minDittoDrop,
            maxDittoDrop: monster.maxDittoDrop,
            combatId: createdCombat.id
          }
        });

        for (const drop of monster.drops) {
          await prisma.monsterDrop.create({
            data: {
              monsterId: createdMonster.id,
              itemId: drop.type === "Equipment" ? null : drop.drop.id,
              equipmentId: drop.type === "Equipment" ? drop.drop.id : null,
              dropRate: drop.dropRate,
              quantity: drop.quantity,
            }
          });
        }

        logger.info(`🆕 Created monster: ${monster.name}`);
      }

    } catch (err) {
      logger.error(`❌ Error handling monster ${monster.name}: ${err}`);
    }
  }

  logger.info("🎉 Finished seeding/updating all monsters.");
}

seedMonsters()
  .catch((e) => {
    logger.error(`❌ Seed failed: ${e}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });