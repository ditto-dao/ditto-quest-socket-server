// NOTE: ONLY RUN AFTER SEEDING MONSTERS

import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';
import { prismaFetchMonsterById } from '../../sql-services/combat-service';

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

interface Dungeon {
    id: number;
    name: string;
    description: string;
    imgsrc?: string;
    entryPriceGP?: number;
    entryPriceDittoWei?: string;
    minCombatLevel: number | null;
    maxCombatLevel: number | null;
    monsterGrowthFactor: number;
    monsterSequence: MonsterWithCombatAndDrops[];
}

const inputCsvPath = path.resolve(__dirname, '../raw-csv/dungeons.csv');
const outputJsonPath = path.resolve(__dirname, '../dungeons.json');

const parseDomains = async () => {
    const rows: { [key: string]: string }[] = [];

    fs.createReadStream(inputCsvPath)
        .pipe(csv())
        .on('data', (row) => {
            rows.push(row);
        })
        .on('end', async () => {
            const dungeons: Dungeon[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];

                try {
                    const monsterIdsStr = row['Monsters']; // e.g., "1, 2, 3, ..."
                    const monsters: MonsterWithCombatAndDrops[] = [];

                    const monsterIds = monsterIdsStr.split(',').map(line => line.trim()).filter(Boolean);

                    for (const monsterIdStr of monsterIds) {
                        const monsterId = parseInt(monsterIdStr.trim(), 10);

                        if (isNaN(monsterId)) {
                            logger.warn(`Invalid monster id: ${monsterId}`);
                            continue;
                        }

                        const monster = await prismaFetchMonsterById(monsterId);
                        if (!monster) {
                            logger.warn(`Monster not found for ID ${monsterId}`);
                            continue;
                        }

                        monsters.push(monster);
                    }

                    const dungeon: Dungeon = {
                        id: i + 1,
                        name: row['Name'],
                        description: row['Description'],
                        imgsrc: row['Image Src'] || undefined,
                        entryPriceGP: row['Entry Price GP'] ? parseInt(row['Entry Price GP'], 10) : 0,
                        entryPriceDittoWei: row['Entry Price DITTO (Wei)'] || "0",
                        minCombatLevel: row['Min Level'] ? parseInt(row['Min Level'], 10) : null,
                        maxCombatLevel: row['Max Level'] ? parseInt(row['Max Level'], 10) : null,
                        monsterGrowthFactor: row['Growth Factor'] ? parseFloat(row['Growth Factor']) : 1.05,
                        monsterSequence: monsters,
                    };

                    dungeons.push(dungeon);
                    logger.info(`Parsed dungeon: ${dungeon.name} (ID: ${dungeon.id})`);
                } catch (err) {
                    logger.error(`Failed to parse dungeon at row ${i + 1}:`, err);
                }
            }

            fs.writeFileSync(outputJsonPath, JSON.stringify(dungeons, null, 2));
            logger.info('✅ Dungeons JSON file successfully written');
        });
};

parseDomains().catch((err) => {
    logger.error('Failed to convert CSV to JSON:', err);
});