import * as fs from 'fs';
import * as path from 'path';
import csv from 'csv-parser';

const inputCsvPath = path.resolve(__dirname, '../raw-csv/materials.csv');
const outputJsonPath = path.resolve(__dirname, '../items.json');
const farmingJsonPath = path.resolve(__dirname, '../front-end-data/farming.json');

interface Item {
    id: number;
    name: string;
    rarity: string;
    description: string;
    imgsrc: string;
    consumableId: null;
    farmingDurationS: number;
    farmingLevelRequired: number;
    farmingExp: number;
    sellPriceGP: number;
}

const parseCsvToJson = async () => {
    const items: Item[] = [];
    const farmingData: Item[] = [];
    let idCounter = 1;

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(inputCsvPath)
            .pipe(csv())
            .on('data', (row: { [key: string]: string }) => {
                try {
                    const item: Item = {
                        id: idCounter++,
                        name: row['Item Name'],
                        rarity: row['Rarity'],
                        description: row['Description'],
                        imgsrc: row['Image (Source)'],
                        consumableId: null,
                        farmingDurationS: parseInt(row['Farming Interval (S)'], 10),
                        farmingLevelRequired: parseInt(row['Farming Level Req'], 10),
                        farmingExp: parseInt(row['Farming XP'], 10),
                        sellPriceGP: parseInt(row['Sell Price (GP)'], 10),
                    };
                    items.push(item);
                    farmingData.push(item);
                } catch (err) {
                    console.error('Error parsing row:', row, err);
                }
            })
            .on('end', () => {
                fs.writeFileSync(outputJsonPath, JSON.stringify(items, null, 2));
                console.log('JSON file successfully created at:', outputJsonPath);

                fs.writeFileSync(farmingJsonPath, JSON.stringify(farmingData, null, 2));
                console.log('Farming JSON file successfully created at:', farmingJsonPath);

                resolve();
            })
            .on('error', (err: any) => {
                console.error('Error reading CSV file:', err);
                reject(err);
            });
    });
};

parseCsvToJson().catch((err) => {
    console.error('Failed to convert CSV to JSON:', err);
});
