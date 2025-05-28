import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

async function resetAutoIncrement(table: string) {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);
    logger.info(`🔁 Reset AUTO_INCREMENT for ${table}`);
  } catch (err) {
    logger.error(`❌ Failed to reset AUTO_INCREMENT for ${table}: ${err}`);
  }
}

async function deleteTable(tableName: string, deleteFn: () => Promise<any>) {
  try {
    logger.info(`🗑 Deleting data from ${tableName}...`);
    await deleteFn();
    logger.info(`✅ Deleted all rows from ${tableName}`);
    await resetAutoIncrement(tableName);
  } catch (err) {
    logger.error(`❌ Failed to delete ${tableName}: ${err}`);
  }
}

export async function deleteAllTables() {
  logger.info("🚨 Starting full database cleanup...");

  await deleteTable("CombatDrop", () => prisma.combatDrop.deleteMany());
  await deleteTable("CombatActivityLog", () => prisma.combatActivityLog.deleteMany());
  await deleteTable("CraftingConsumedItem", () => prisma.craftingConsumedItem.deleteMany());
  await deleteTable("CraftingActivityLog", () => prisma.craftingActivityLog.deleteMany());
  await deleteTable("FarmingActivityLog", () => prisma.farmingActivityLog.deleteMany());
  await deleteTable("BreedingActivityLog", () => prisma.breedingActivityLog.deleteMany());
  await deleteTable("DomainMonster", () => prisma.domainMonster.deleteMany());
  await deleteTable("DungeonMonsterSequence", () => prisma.dungeonMonsterSequence.deleteMany());
  await deleteTable("DungeonLeaderboard", () => prisma.dungeonLeaderboard.deleteMany());
  await deleteTable("MonsterDrop", () => prisma.monsterDrop.deleteMany());
  await deleteTable("AccomplishmentProgress", () => prisma.accomplishmentProgress.deleteMany());
  await deleteTable("Accomplishment", () => prisma.accomplishment.deleteMany());
  await deleteTable("UserDeviceFingerprint", () => prisma.userDeviceFingerprint.deleteMany());
  await deleteTable("ReferralEarningLog", () => prisma.referralEarningLog.deleteMany());
  await deleteTable("ReferralEventLog", () => prisma.referralEventLog.deleteMany());
  await deleteTable("ReferralRelation", () => prisma.referralRelation.deleteMany());
  await deleteTable("ReferralLink", () => prisma.referralLink.deleteMany());
  await deleteTable("BetaTester", () => prisma.betaTester.deleteMany());

  // PARENT TABLES
  await deleteTable("Domain", () => prisma.domain.deleteMany());
  await deleteTable("Dungeon", () => prisma.dungeon.deleteMany());

  logger.info("🎉 Finished full database cleanup.");
  await prisma.$disconnect();
}

deleteAllTables();