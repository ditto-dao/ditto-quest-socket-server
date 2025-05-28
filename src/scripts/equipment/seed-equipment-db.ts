import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../sql-services/client';
import { logger } from '../../utils/logger';
import { recalculateAndUpdateUserStats } from '../../sql-services/user-service';

async function updateAllUserCombat() {
    const users = await prisma.user.findMany({
        select: { telegramId: true }
    });

    logger.info(`🔄 Recalculating stats for ${users.length} users...`);

    for (const user of users) {
        try {
            await recalculateAndUpdateUserStats(user.telegramId);
            logger.info(`✅ Updated stats for user ${user.telegramId}`);
        } catch (err) {
            console.error(`❌ Failed to update user ${user.telegramId}:`, err);
        }
    }

    logger.info("✅ Done updating all users.");
}

async function seedEquipment() {
    try {
        const equipmentPath = path.join(__dirname, '../../encyclopedia/equipment.json');
        const equipmentData = JSON.parse(fs.readFileSync(equipmentPath, 'utf-8'));

        let insertedCount = 0;

        for (const equipment of equipmentData) {
            const { statEffect, id, ...equipmentFields } = equipment;

            try {
                const existing = await prisma.equipment.findUnique({
                    where: { id }
                });
    
                if (existing) {
                    await prisma.equipment.update({
                        where: { id },
                        data: {
                            ...equipmentFields,
                            ...(statEffect ? { statEffect: { update: statEffect } } : {})  // only add if exists
                        }
                    });
                } else {
                    await prisma.equipment.create({
                        data: {
                            id,
                            ...equipmentFields,
                            ...(statEffect ? { statEffect: { create: statEffect } } : {})  // only add if exists
                        }
                    });
                }
    
                insertedCount++;
            } catch (err) {
                logger.error(`❌ Failed to insert/update equipment with ID ${id}: ${err}`);
                logger.error(`➡️ Equipment object that caused the error:\n${JSON.stringify(equipment, null, 2)}`);
                throw err;
            }
        }

        logger.info(`Inserted or updated ${insertedCount} equipment items.`);
        const count = await prisma.equipment.count();
        logger.info(`Total number of equipment in database: ${count}.`);
        await updateAllUserCombat();
    } catch (error) {
        logger.error(`Error seeding equipment data: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

seedEquipment();