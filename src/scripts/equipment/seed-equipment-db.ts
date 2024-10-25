import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';

async function seedEquipment() {
    try {
        // Read equipment data from JSON file
        const equipmentPath = path.join(__dirname, '../../encyclopedia/equipment.json');
        const equipmentData = JSON.parse(fs.readFileSync(equipmentPath, 'utf-8'));

        // Insert equipment data into the database
        const result = await prisma.equipment.createMany({
            data: equipmentData,
            skipDuplicates: true // Skip if already exists
        });

        logger.info(`Inserted ${result.count} equipment items.`);
    } catch (error) {
        logger.error(`Error seeding equipment data: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

seedEquipment();
