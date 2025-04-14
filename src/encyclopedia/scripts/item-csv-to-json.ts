import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';
import { logger } from '../../utils/logger';

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
    category?: string;
}

const inputCsvPath = path.resolve(__dirname, '../raw-csv/materials.csv');
const outputJsonPath = path.resolve(__dirname, '../items.json');
const outputTmaJsonPath = path.resolve(__dirname, '../items-tma.json');

const parseCsvToJson = async () => {
    const items: Item[] = [];
    const itemsTma: Item[] = [];

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(inputCsvPath)
            .pipe(csv())
            .on('data', (row: { [key: string]: string }) => {
                try {
                    const item: Item = {
                        id: parseInt(row['S/N']),
                        name: row['Item Name'],
                        rarity: row['Rarity'],
                        description: row['Description'],
                        imgsrc: row['Image (Material)'],
                        farmingDurationS: parseInt(row['Farming Interval (S)'], 10),
                        farmingLevelRequired: parseInt(row['Farming Level Req'], 10),
                        farmingExp: parseInt(row['Farming XP'], 10),
                        sellPriceGP: row['Sell Price (GP)'].length > 0 ? parseInt(row['Sell Price (GP)'], 10) : 1,
                    };
                    items.push(item);

                    if (row['Farmable'] && row['Farmable'] === 'T') {
                        const itemWithCategory = { ...item, category: row['Category'] };
                        itemsTma.push(itemWithCategory);
                    }
                } catch (err) {
                    logger.error('Error parsing row:', row, err);
                }
            })
            .on('end', () => {
                fs.writeFileSync(outputJsonPath, JSON.stringify(items, null, 2));
                logger.info('Items JSON file successfully created');

                fs.writeFileSync(outputTmaJsonPath, JSON.stringify(itemsTma, null, 2));
                logger.info('Items TMA JSON file successfully created');
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
