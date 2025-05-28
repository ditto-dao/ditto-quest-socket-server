import { prisma } from "./client";

export async function isBetaTester(userId: string): Promise<boolean> {
    const tester = await prisma.betaTester.findUnique({
        where: { telegramId: userId },
    });
    return !!tester;
}

export async function isUnclaimedBetaTester(userId: string): Promise<boolean> {
    const tester = await prisma.betaTester.findUnique({
        where: { telegramId: userId },
    });

    return !!tester && !tester.claimed;
}

export async function handleBetaTesterClaim(userId: string): Promise<boolean> {
    const tester = await prisma.betaTester.findUnique({
        where: { telegramId: userId },
    });

    if (!tester || tester.claimed) {
        return false;
    }

    await prisma.betaTester.update({
        where: { telegramId: userId },
        data: { claimed: true },
    });

    return true;
}