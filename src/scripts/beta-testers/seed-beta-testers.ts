import BetaTesters from "../../encyclopedia/beta-testers.json";
import { prisma } from "../../sql-services/client";

async function seedBetaTesters() {
    const uniqueIds = [...new Set(BetaTesters)];

    for (const telegramId of uniqueIds) {
        try {
            await prisma.betaTester.upsert({
                where: { telegramId },
                update: {}, // do nothing if exists
                create: { telegramId },
            });
            console.log(`Upserted: ${telegramId}`);
        } catch (err) {
            console.error(`Failed: ${telegramId}`, err);
        }
    }

    console.log(`✅ Seeded ${uniqueIds.length} beta testers.`);
}

seedBetaTesters()
    .catch(console.error)
    .finally(() => prisma.$disconnect());