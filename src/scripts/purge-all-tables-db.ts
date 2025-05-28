import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

async function resetAutoIncrement(table: string) {
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
}

async function deleteAllTables() {
  try {
    logger.info("🚨 Starting full database cleanup...");

    await prisma.domain.deleteMany();
    logger.info("🧹 Deleted Domain");
    await resetAutoIncrement("Domain");

    await prisma.dungeon.deleteMany();
    logger.info("🧹 Deleted Dungeon");
    await resetAutoIncrement("Dungeon");

    await prisma.farmingActivityLog.deleteMany();
    logger.info("🧹 Deleted FarmingActivityLog");
    await resetAutoIncrement("FarmingActivityLog");

    await prisma.craftingConsumedItem.deleteMany();
    logger.info("🧹 Deleted CraftingConsumedItem");
    await resetAutoIncrement("CraftingConsumedItem");

    await prisma.craftingActivityLog.deleteMany();
    logger.info("🧹 Deleted CraftingActivityLog");
    await resetAutoIncrement("CraftingActivityLog");

    await prisma.breedingActivityLog.deleteMany();
    logger.info("🧹 Deleted BreedingActivityLog");
    await resetAutoIncrement("BreedingActivityLog");

    await prisma.combatDrop.deleteMany();
    logger.info("🧹 Deleted CombatDrop");
    await resetAutoIncrement("CombatDrop");

    await prisma.combatActivityLog.deleteMany();
    logger.info("🧹 Deleted CombatActivityLog");
    await resetAutoIncrement("CombatActivityLog");

    await prisma.accomplishmentProgress.deleteMany();
    logger.info("🧹 Deleted AccomplishmentProgress");
    await resetAutoIncrement("AccomplishmentProgress");

    await prisma.accomplishment.deleteMany();
    logger.info("🧹 Deleted Accomplishment");
    await resetAutoIncrement("Accomplishment");

    await prisma.userDeviceFingerprint.deleteMany();
    logger.info("🧹 Deleted UserDeviceFingerprint");
    await resetAutoIncrement("UserDeviceFingerprint");

    await prisma.referralEarningLog.deleteMany();
    logger.info("🧹 Deleted ReferralEarningLog");
    await resetAutoIncrement("ReferralEarningLog");

    await prisma.referralEventLog.deleteMany();
    logger.info("🧹 Deleted ReferralEventLog");
    await resetAutoIncrement("ReferralEventLog");

    await prisma.referralRelation.deleteMany();
    logger.info("🧹 Deleted ReferralRelation");
    await resetAutoIncrement("ReferralRelation");

    await prisma.referralLink.deleteMany();
    logger.info("🧹 Deleted ReferralLink");
    await resetAutoIncrement("ReferralLink");

    await prisma.betaTester.deleteMany();
    logger.info("🧹 Deleted BetaTester");

    logger.info("✅ Successfully purged all tables and reset auto-increment.");
  } catch (error) {
    logger.error(`❌ Error during cleanup: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllTables();
