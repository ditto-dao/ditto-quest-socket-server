import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';

async function seedItems() {
    const itemsPath = path.join(__dirname, '../../encyclopedia/items.json');
    const itemsData = fs.readFileSync(itemsPath, 'utf-8');
    const items = JSON.parse(itemsData);

    try {
        const result = await prisma.item.createMany({
            data: items,
            skipDuplicates: true
        });
        console.log(`Inserted ${result.count} items.`);
    } catch (error) {
        console.error('Error seeding items:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seedItems();
