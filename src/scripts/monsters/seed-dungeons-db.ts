import { Decimal } from "@prisma/client/runtime/library";
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from "../../sql-services/client";
import { logger } from "../../utils/logger";

// Load JSON file
const jsonPath = path.resolve(__dirname, '../../encyclopedia/dungeons.json');
const dungeons = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

async function seedDungeons() {
  for (const dungeon of dungeons) {
    try {
      logger.info(`Seeding dungeon: ${dungeon.name}`);

      const upsertedDungeon = await prisma.dungeon.upsert({
        where: { id: dungeon.id },
        update: {
          name: dungeon.name,
          description: dungeon.description,
          imgsrc: dungeon.imgsrc,
          entryPriceGP: dungeon.entryPriceGP,
          entryPriceDittoWei: new Decimal(dungeon.entryPriceDittoWei),
          monsterGrowthFactor: dungeon.monsterGrowthFactor,
          isActive: true,
        },
        create: {
          id: dungeon.id,
          name: dungeon.name,
          description: dungeon.description,
          imgsrc: dungeon.imgsrc,
          entryPriceGP: dungeon.entryPriceGP,
          entryPriceDittoWei: new Decimal(dungeon.entryPriceDittoWei),
          monsterGrowthFactor: dungeon.monsterGrowthFactor,
          isActive: true,
        },
      });

      // Remove and recreate monster sequence (you can switch to upsert if needed)
      await prisma.dungeonMonsterSequence.deleteMany({
        where: {
          dungeonId: upsertedDungeon.id,
        },
      });

      for (let i = 0; i < dungeon.monsterSequence.length; i++) {
        const monster = dungeon.monsterSequence[i];
        await prisma.dungeonMonsterSequence.create({
          data: {
            dungeonId: upsertedDungeon.id,
            monsterId: monster.id,
            order: i,
          },
        });
      }

      logger.info(`✅ Seeded dungeon: ${dungeon.name}`);
    } catch (err) {
      logger.error(`❌ Failed to seed dungeon '${dungeon.name}':`, err);
    }
  }

  await prisma.$disconnect();
  logger.info("🌱 Done seeding all dungeons.");
}

seedDungeons();