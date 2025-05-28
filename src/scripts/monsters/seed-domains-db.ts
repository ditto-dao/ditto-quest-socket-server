import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';

const prisma = new PrismaClient();

// Load JSON file
const jsonPath = path.resolve(__dirname, '../../encyclopedia/domains.json');
const domainsJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

// Type helpers
export type MonsterWithCombatAndDrops = Prisma.MonsterGetPayload<{
  include: {
    combat: true;
    drops: {
      include: {
        item: true;
        equipment: true;
      };
    };
  };
}>;

interface DomainMonsterInput {
  monster: MonsterWithCombatAndDrops;
  spawnRate: number;
}

interface DomainInput {
  id: number;
  name: string;
  description: string;
  minCombatLevel: number | null;
  maxCombatLevel: number | null;
  imgsrc?: string;
  entryPriceGP?: number;
  entryPriceDittoWei?: string;
  monsters: DomainMonsterInput[];
}

async function seedDomains(domains: DomainInput[]) {
  for (const domain of domains) {
    try {
      logger.info(`Seeding domain: ${domain.name}`);

      // Upsert the domain itself
      const upserted = await prisma.domain.upsert({
        where: { id: domain.id },
        update: {
          name: domain.name,
          description: domain.description,
          imgsrc: domain.imgsrc,
          entryPriceGP: domain.entryPriceGP,
          entryPriceDittoWei: domain.entryPriceDittoWei ?? undefined,
          minCombatLevel: domain.minCombatLevel,
          maxCombatLevel: domain.maxCombatLevel
        },
        create: {
          id: domain.id,
          name: domain.name,
          description: domain.description,
          imgsrc: domain.imgsrc,
          entryPriceGP: domain.entryPriceGP,
          entryPriceDittoWei: domain.entryPriceDittoWei ?? undefined,
          minCombatLevel: domain.minCombatLevel,
          maxCombatLevel: domain.maxCombatLevel
        },
      });

      // Delete existing monster mappings to avoid duplicates
      await prisma.domainMonster.deleteMany({
        where: { domainId: upserted.id },
      });

      // Re-create monster mappings
      for (const m of domain.monsters) {
        await prisma.domainMonster.create({
          data: {
            domainId: upserted.id,
            monsterId: m.monster.id,
            spawnRate: m.spawnRate,
          },
        });
      }

      logger.info(`✅ Domain '${domain.name}' seeded with ${domain.monsters.length} monsters.`);
    } catch (err) {
      logger.error(`❌ Failed to seed domain '${domain.name}': ${err}`);
    }
  }

  await prisma.$disconnect();
  logger.info('🌱 Done seeding all domains.');
}

seedDomains(domainsJson as DomainInput[]);