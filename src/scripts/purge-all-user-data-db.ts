import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

async function resetAutoIncrement(table: string) {
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
}

async function purgeUserData() {
  try {
    logger.info("🚀 Starting user data purge...");

    // DELETE USER INVENTORY
    await prisma.inventory.deleteMany();
    logger.info("🗑️ Deleted all user inventory.");
    await resetAutoIncrement("Inventory");

    // DELETE USER-OWNED SLIMES
    await prisma.slime.deleteMany();
    logger.info("🗑️ Deleted all user-owned slimes.");
    await resetAutoIncrement("Slime");

    // DELETE USERS FIRST (to break FK links to combat)
    await prisma.user.deleteMany();
    logger.info("🗑️ Deleted all user accounts.");
    await resetAutoIncrement("User");

    // DELETE COMBAT RECORDS no longer referenced by monsters or users
    await prisma.combat.deleteMany({
      where: {
        user: { some: {} },   // was previously linked to users
        Monster: { none: {} } // not used by monsters
      }
    });
    logger.info("🗑️ Deleted all user-only combat records.");
    await resetAutoIncrement("Combat");

    logger.info("✅ Successfully purged all user data while keeping global data intact.");
  } catch (error) {
    logger.error(`❌ Error during user data purge: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function purgeSpecificUserData(userId: string) {
  try {
    logger.info(`🚀 Starting data purge for user ${userId}...`);

    // Delete user's inventory
    await prisma.inventory.deleteMany({
      where: { userId },
    });
    logger.info(`🗑️ Deleted inventory for user ${userId}.`);

    // Delete user's slimes
    await prisma.slime.deleteMany({
      where: { ownerId: userId },
    });
    logger.info(`🗑️ Deleted slimes for user ${userId}.`);

    // Delete user record (must come before deleting combat if there's a FK)
    await prisma.user.delete({
      where: { telegramId: userId },
    });
    logger.info(`🗑️ Deleted user account ${userId}.`);

    // Delete orphaned combat records no longer referenced by any monster or user
    await prisma.combat.deleteMany({
      where: {
        user: { none: {} },
        Monster: { none: {} }
      }
    });
    logger.info("🗑️ Cleaned up unused combat records.");

    logger.info(`✅ Successfully purged data for user ${userId}.`);
  } catch (error) {
    logger.error(`❌ Error purging data for user ${userId}: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

purgeUserData();