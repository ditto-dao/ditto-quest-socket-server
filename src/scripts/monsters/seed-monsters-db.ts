import fs from "fs";
import path from "path";
import { prisma } from "../../sql-services/client";
import { logger } from "../../utils/logger";
import { calculateCombatPower } from "../../managers/idle-managers/combat/combat-helpers";

async function seedMonsters() {
  const monstersPath = path.join(__dirname, '../../encyclopedia/monsters.json');
  const monsterData = JSON.parse(fs.readFileSync(monstersPath, "utf-8"));

  for (const monster of monsterData) {
    try {
      const existing = await prisma.monster.findUnique({
        where: { id: monster.id },
      });

      if (existing) {
        // Update combat + monster
        await prisma.combat.update({
          where: { id: existing.combatId },
          data: { ...monster.combat, cp: calculateCombatPower(monster.combat) }
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
        const createdCombat = await prisma.combat.create({
          data: { ...monster.combat, cp: calculateCombatPower(monster.combat) }
        });

        await prisma.monster.create({
          data: {
            id: monster.id,
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

        logger.info(`🆕 Created monster: ${monster.name}`);
      }

      // 🔄 Always refresh drops regardless of create or update
      await prisma.monsterDrop.deleteMany({ where: { monsterId: monster.id } });
      for (const drop of monster.drops) {
        await prisma.monsterDrop.create({
          data: {
            monsterId: monster.id,
            itemId: drop.type === "Equipment" ? null : drop.drop.id,
            equipmentId: drop.type === "Equipment" ? drop.drop.id : null,
            dropRate: drop.dropRate,
            quantity: drop.quantity,
          }
        });
      }
      logger.info(`🎁 Refreshed ${monster.drops.length} drops for: ${monster.name}`);

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