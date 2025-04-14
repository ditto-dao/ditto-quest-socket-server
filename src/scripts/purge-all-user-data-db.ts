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

purgeUserData();