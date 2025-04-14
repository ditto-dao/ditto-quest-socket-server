import { prisma } from "../sql-services/client";
import { logger } from "../utils/logger";

async function resetAutoIncrement(table: string) {
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
}

async function deleteAllTables() {
  try {
    logger.info("🚨 Starting full database cleanup...");

    // STEP 1: DELETE ALL CHILD/JUNCTION TABLES
    await prisma.monsterDrop.deleteMany();
    logger.info("🧹 Deleted MonsterDrop");
    await resetAutoIncrement("MonsterDrop");

    await prisma.domainMonster.deleteMany();
    logger.info("🧹 Deleted DomainMonster");
    await resetAutoIncrement("DomainMonster");

    await prisma.dungeonMonsterSequence.deleteMany();
    logger.info("🧹 Deleted DungeonMonsterSequence");
    await resetAutoIncrement("DungeonMonsterSequence");

    await prisma.craftingRecipeItems.deleteMany();
    logger.info("🧹 Deleted CraftingRecipeItems");
    await resetAutoIncrement("CraftingRecipeItems");

    await prisma.craftingRecipe.deleteMany();
    logger.info("🧹 Deleted CraftingRecipe");
    await resetAutoIncrement("CraftingRecipe");

    await prisma.inventory.deleteMany();
    logger.info("🧹 Deleted Inventory");
    await resetAutoIncrement("Inventory");

    await prisma.equipment.deleteMany();
    logger.info("🧹 Deleted Equipment");
    await resetAutoIncrement("Equipment");

    await prisma.item.deleteMany();
    logger.info("🧹 Deleted Item");
    await resetAutoIncrement("Item");

    await prisma.slime.deleteMany();
    logger.info("🧹 Deleted Slime");
    await resetAutoIncrement("Slime");

    await prisma.slimeTrait.deleteMany();
    logger.info("🧹 Deleted SlimeTrait");
    await resetAutoIncrement("SlimeTrait");

    await prisma.user.deleteMany();
    logger.info("🧹 Deleted User");
    await resetAutoIncrement("User");

    await prisma.monster.deleteMany();
    logger.info("🧹 Deleted Monster");
    await resetAutoIncrement("Monster");

    await prisma.statEffect.deleteMany();
    logger.info("🧹 Deleted StatEffect");
    await resetAutoIncrement("StatEffect");

    // STEP 2: DELETE COMBAT LAST
    await prisma.combat.deleteMany();
    logger.info("🧹 Deleted Combat");
    await resetAutoIncrement("Combat");

    logger.info("✅ Successfully purged all tables and reset auto-increment.");
  } catch (error) {
    logger.error(`❌ Error during cleanup: ${error}`);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllTables();
