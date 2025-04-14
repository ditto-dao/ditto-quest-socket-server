import { PrismaClient } from "@prisma/client";
import { recalculateAndUpdateUserStats } from "../../sql-services/user-service";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { telegramId: true }
  });

  console.log(`🔄 Recalculating stats for ${users.length} users...\n`);

  for (const user of users) {
    try {
      await recalculateAndUpdateUserStats(user.telegramId);
      console.log(`✅ Updated stats for user ${user.telegramId}`);
    } catch (err) {
      console.error(`❌ Failed to update user ${user.telegramId}:`, err);
    }
  }

  console.log("\n✅ Done updating all users.");
}

main()
  .catch((err) => {
    console.error("❌ Script failed:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });