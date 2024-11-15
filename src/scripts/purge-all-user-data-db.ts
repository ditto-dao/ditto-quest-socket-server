import { prisma } from '../sql-services/client';
import { logger } from '../utils/logger';

async function purgeUserRelatedData() {
  try {
    // Delete from related tables first to avoid foreign key constraints
    await prisma.equipmentInventory.deleteMany({});
    await prisma.itemInventory.deleteMany({});
    await prisma.slime.deleteMany({});
    await prisma.combat.deleteMany({});

    // Finally delete users
    await prisma.user.deleteMany({});

    // Reset auto-increment counters for each table
    await prisma.$executeRaw`ALTER TABLE EquipmentInventory AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE ItemInventory AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE Slime AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE Combat AUTO_INCREMENT = 1`;
    await prisma.$executeRaw`ALTER TABLE User AUTO_INCREMENT = 1`;

    logger.info('All user-related tables have been purged and auto-increment values reset.');
  } catch (error) {
    logger.error(`Error purging user-related tables: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

purgeUserRelatedData().catch((error) => {
  console.error('Failed to purge user-related tables:', error);
});
