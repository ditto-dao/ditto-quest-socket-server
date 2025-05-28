// NOTE: ONLY RUN AFTER SEEDING MONSTERS

import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';
import { fetchMonsterById } from '../../sql-services/combat-service';
import { parseUnits } from 'ethers';
import { DITTO_DECIMALS } from '../../utils/config';

type MonsterWithCombatAndDrops = Prisma.MonsterGetPayload<{
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

interface DomainMonster {
  monster: MonsterWithCombatAndDrops;
  spawnRate: number;
}

interface Domain {
  id: number;
  name: string;
  description: string;
  imgsrc?: string;
  entryPriceGP?: number;
  entryPriceDittoWei?: string;
  minCombatLevel: number | null;
  maxCombatLevel: number | null;
  monsters: DomainMonster[];
}

const inputCsvPath = path.resolve(__dirname, '../raw-csv/domains.csv');
const outputJsonPath = path.resolve(__dirname, '../domains.json');

const parseDomains = async () => {
  const rows: { [key: string]: string }[] = [];

  fs.createReadStream(inputCsvPath)
    .pipe(csv())
    .on('data', (row) => {
      rows.push(row);
    })
    .on('end', async () => {
      const domains: Domain[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          const monsterDetailsStr = row['Monsters']; // e.g., "1*0.5\n2*0.5"
          const domainMonsters: DomainMonster[] = [];

          const monsterLines = monsterDetailsStr.split('\n').map(line => line.trim()).filter(Boolean);

          for (const line of monsterLines) {
            const [monsterIdStr, spawnRateStr] = line.split('*');
            const monsterId = parseInt(monsterIdStr.trim(), 10);
            const spawnRate = parseFloat(spawnRateStr.trim());

            if (isNaN(monsterId) || isNaN(spawnRate)) {
              logger.warn(`Invalid monster line: ${line}`);
              continue;
            }

            const monster = await fetchMonsterById(monsterId);
            if (!monster) {
              logger.warn(`Monster not found for ID ${monsterId}`);
              continue;
            }

            domainMonsters.push({
              monster,
              spawnRate,
            });
          }

          const domain: Domain = {
            id: i + 1,
            name: row['Name'],
            description: row['Description'],
            imgsrc: row['Image Src'] || undefined,
            entryPriceGP: row['Entry Price GP'] ? parseInt(row['Entry Price GP'], 10) : 0,
            entryPriceDittoWei: parseUnits(row['Entry Price DITTO'] || "0", DITTO_DECIMALS).toString(),
            minCombatLevel: row['Min Level'] ? parseInt(row['Min Level'], 10) : null,
            maxCombatLevel: row['Max Level'] ? parseInt(row['Max Level'], 10) : null,
            monsters: domainMonsters,
          };

          domains.push(domain);
          logger.info(`Parsed domain: ${domain.name} (ID: ${domain.id})`);
        } catch (err) {
          logger.error(`Failed to parse domain at row ${i + 1}:`, err);
        }
      }

      fs.writeFileSync(outputJsonPath, JSON.stringify(domains, null, 2));
      logger.info('✅ Domains JSON file successfully written');
    });
};

parseDomains().catch((err) => {
  logger.error('Failed to convert CSV to JSON:', err);
});