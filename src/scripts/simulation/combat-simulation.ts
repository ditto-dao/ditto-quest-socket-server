import { PrismaClient } from "@prisma/client";
import { recalculateAndUpdateUserBaseStats, recalculateAndUpdateUserStats } from "../../sql-services/user-service";
import { getBaseMaxHpFromHpLvl, getBaseAtkSpdFromLuk, getBaseAccFromDex, getBaseEvaFromLuk, getBaseMaxDmg, getBaseCritChanceFromLuk, getBaseCritMulFromLuk, getBaseDmgReductionFromDefAndStr, getBaseMagicDmgReductionFromDefAndMagic, getBaseHpRegenRateFromHpLvlAndDef, getBaseHpRegenAmtFromHpLvlAndDef } from "../../managers/idle-managers/combat/combat-helpers";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { telegramId: true }
  });

  console.log(`🔄 Recalculating stats for ${users.length} users...\n`);

  for (const user of users) {
    try {
      await recalculateAndUpdateUserBaseStats(user.telegramId);
      await recalculateAndUpdateUserStats(user.telegramId);
      console.log(`✅ Updated stats for user ${user.telegramId}`);
    } catch (err) {
      console.error(`❌ Failed to update user ${user.telegramId}:`, err);
    }
  }

  console.log("\n✅ Done updating all users.");
  /*   const newBaseStats = {
      maxHp: getBaseMaxHpFromHpLvl(1),
      atkSpd: getBaseAtkSpdFromLuk(1),
      acc: getBaseAccFromDex(1),
      eva: getBaseEvaFromLuk(1),
      maxMeleeDmg: getBaseMaxDmg(1),
      maxRangedDmg: getBaseMaxDmg(1),
      maxMagicDmg: getBaseMaxDmg(1),
      critChance: getBaseCritChanceFromLuk(1),
      critMultiplier: getBaseCritMulFromLuk(1),
      dmgReduction: getBaseDmgReductionFromDefAndStr(1, 1),
      magicDmgReduction: getBaseMagicDmgReductionFromDefAndMagic(1, 1),
      hpRegenRate: getBaseHpRegenRateFromHpLvlAndDef(1, 1),
      hpRegenAmount: getBaseHpRegenAmtFromHpLvlAndDef(1, 1)
    };
    console.log(`base stats: ${JSON.stringify(newBaseStats, null, 2)}`); */
}

main()
  .catch((err) => {
    console.error("❌ Script failed:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });