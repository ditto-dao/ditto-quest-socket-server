import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';

async function seedSlimeTraits() {
    const slimeTraitsPath = path.join(__dirname, '../../encyclopedia/slime-traits.json');
    const slimeTraitsData = fs.readFileSync(slimeTraitsPath, 'utf-8');
    const slimeTraits = JSON.parse(slimeTraitsData);

    try {
        const result = await prisma.slimeTrait.createMany({
            data: slimeTraits,
            skipDuplicates: true
        });
        console.log(`Inserted ${result.count} slime traits.`);
    } catch (error) {
        console.error('Error seeding slime traits:', error);
    } finally {
        await prisma.$disconnect();
    }
}

seedSlimeTraits();
