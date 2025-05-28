import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

async function resetAutoIncrement(table: string) {
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
}

async function purgeUserData() {
  try {
    logger.info("🚀 Starting full user data purge...");

    // 🔹 Delete in order of dependency (child → parent)

    await prisma.combatDrop.deleteMany();
    logger.info("🗑️ Deleted CombatDrop");

    await prisma.combatActivityLog.deleteMany();
    logger.info("🗑️ Deleted CombatActivityLog");

    await prisma.craftingConsumedItem.deleteMany();
    logger.info("🗑️ Deleted CraftingConsumedItem");

    await prisma.craftingActivityLog.deleteMany();
    logger.info("🗑️ Deleted CraftingActivityLog");

    await prisma.breedingActivityLog.deleteMany();
    logger.info("🗑️ Deleted BreedingActivityLog");

    await prisma.farmingActivityLog.deleteMany();
    logger.info("🗑️ Deleted FarmingActivityLog");

    await prisma.accomplishmentProgress.deleteMany();
    logger.info("🗑️ Deleted AccomplishmentProgress");

    await prisma.dungeonLeaderboard.deleteMany();
    logger.info("🗑️ Deleted DungeonLeaderboard");

    await prisma.userDeviceFingerprint.deleteMany();
    logger.info("🗑️ Deleted UserDeviceFingerprint");

    await prisma.referralEarningLog.deleteMany();
    logger.info("🗑️ Deleted ReferralEarningLog");

    await prisma.referralEventLog.deleteMany();
    logger.info("🗑️ Deleted ReferralEventLog");

    await prisma.referralRelation.deleteMany();
    logger.info("🗑️ Deleted ReferralRelation");

    await prisma.referralLink.deleteMany();
    logger.info("🗑️ Deleted ReferralLink");

    await prisma.inventory.deleteMany();
    logger.info("🗑️ Deleted Inventory");
    await resetAutoIncrement("Inventory");

    await prisma.slime.deleteMany();
    logger.info("🗑️ Deleted Slime");
    await resetAutoIncrement("Slime");

    await prisma.user.deleteMany();
    logger.info("🗑️ Deleted User");
    await resetAutoIncrement("User");

    await prisma.combat.deleteMany({
      where: {
        user: { none: {} },
        Monster: { none: {} }
      }
    });
    logger.info("🗑️ Deleted orphaned Combat");
    await resetAutoIncrement("Combat");

    logger.info("✅ Successfully purged all user data.");
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

    await prisma.combatDrop.deleteMany({
      where: { combatActivityLog: { userId } },
    });

    await prisma.combatActivityLog.deleteMany({ where: { userId } });

    await prisma.craftingConsumedItem.deleteMany({
      where: {
        craftingActivity: { userId }
      }
    });

    await prisma.craftingActivityLog.deleteMany({ where: { userId } });

    await prisma.breedingActivityLog.deleteMany({ where: { userId } });

    await prisma.farmingActivityLog.deleteMany({ where: { userId } });

    await prisma.accomplishmentProgress.deleteMany({ where: { userId } });

    await prisma.dungeonLeaderboard.deleteMany({ where: { userId } });

    await prisma.userDeviceFingerprint.deleteMany({ where: { userId } });

    await prisma.referralEarningLog.deleteMany({
      where: {
        OR: [
          { referrerId: userId },
          { refereeId: userId },
        ]
      }
    });

    await prisma.referralEventLog.deleteMany({ where: { userId } });

    await prisma.referralRelation.deleteMany({
      where: {
        OR: [
          { refereeId: userId },
          { referrerUserId: userId }
        ]
      }
    });

    await prisma.referralLink.deleteMany({ where: { ownerId: userId } });

    await prisma.inventory.deleteMany({ where: { userId } });

    await prisma.slime.deleteMany({ where: { ownerId: userId } });

    await prisma.user.delete({ where: { telegramId: userId } });

    await prisma.combat.deleteMany({
      where: {
        user: { none: {} },
        Monster: { none: {} }
      }
    });

    logger.info(`✅ Successfully purged data for user ${userId}.`);
  } catch (error) {
    logger.error(`❌ Error purging data for user ${userId}: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

purgeUserData();