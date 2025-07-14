import { prisma } from '../../sql-services/client';
import { prismaRecalculateAndUpdateUserEfficiencyStats } from '../../sql-services/user-efficiency-stats';
import { prismaRecalculateAndUpdateUserBaseStats } from '../../sql-services/user-service';
import { logger } from '../../utils/logger';

async function updateAllUserCombat() {
    const users = await prisma.user.findMany({
        select: { telegramId: true }
    });

    logger.info(`🔄 Recalculating stats for ${users.length} users...`);

    for (const user of users) {
        try {
            await prismaRecalculateAndUpdateUserBaseStats(user.telegramId);
            await prismaRecalculateAndUpdateUserEfficiencyStats(user.telegramId);
            logger.info(`✅ Updated stats for user ${user.telegramId}`);
        } catch (err) {
            console.error(`❌ Failed to update user ${user.telegramId}:`, err);
        }
    }

    logger.info("✅ Done updating all users.");
}

async function update() {
    try {
        await updateAllUserCombat();
    } catch (error) {
        logger.error(`Error updating user combat stats: ${error}`);
    } finally {
        await prisma.$disconnect();
    }
}

update();