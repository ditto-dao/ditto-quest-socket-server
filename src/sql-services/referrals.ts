import { ReferralEventType } from "@prisma/client";
import { prisma } from "./client";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

/**
 * Checks if a user has already used a referral code.
 * Returns true if the user is already referred, otherwise false.
 */
export async function hasUsedReferralCode(userId: string): Promise<boolean> {
    const relation = await prisma.referralRelation.findUnique({
        where: { refereeId: userId },
    });

    return relation !== null;
}

/**
 * Returns all direct (tier 1) referees of a given userId.
 */
export async function getDirectReferees(userId: string): Promise<{
    refereeId: string;
    referee: {
        telegramId: string;
        username: string | null;
        level: number;
    };
    createdAt: Date;
}[]> {
    const referees = await prisma.referralRelation.findMany({
        where: {
            referrerUserId: userId,
        },
        select: {
            refereeId: true,
            referee: {
                select: {
                    telegramId: true,
                    username: true,
                    level: true,
                },
            },
            createdAt: true,
        },
    });

    return referees;
}

export async function getReferrer(userId: string): Promise<{
    referrerUserId: string | null;
    referrerExternal: string | null;
} | null> {
    const relation = await prisma.referralRelation.findUnique({
        where: { refereeId: userId },
        select: {
            referrerUserId: true,
            referrerExternal: true,
        },
    });

    return relation ?? null;
}

export async function getReferrerDetails(userId: string): Promise<{
    referrerUserId: string | null;
    referrerExternal: string | null;
    referrerUsername: string | null;
} | null> {
    const relation = await prisma.referralRelation.findUnique({
        where: { refereeId: userId },
        select: {
            referrerUserId: true,
            referrerExternal: true,
            referrerUser: {
                select: {
                    username: true,
                },
            },
        },
    });

    if (!relation) return null;

    return {
        referrerUserId: relation.referrerUserId ?? null,
        referrerExternal: relation.referrerExternal ?? null,
        referrerUsername: relation.referrerUser?.username ?? null,
    };
}

export async function getReferralStats(userId: string) {
    const [refCount, earnings] = await Promise.all([
        prisma.referralRelation.count({
            where: { referrerUserId: userId },
        }),
        prisma.referralEarningLog.aggregate({
            where: { referrerId: userId },
            _sum: { amountDittoWei: true },
        }),
    ]);

    return {
        directRefereeCount: refCount,
        totalEarningsWei: earnings._sum.amountDittoWei ?? 0n,
    };
}

/**
 * Returns an array of userIds (refereeIds) directly referred by the given userId.
 */
export async function getDirectRefereeIds(userId: string): Promise<string[]> {
    const referees = await prisma.referralRelation.findMany({
        where: {
            referrerUserId: userId,
        },
        select: {
            refereeId: true,
        },
    });

    return referees.map(r => r.refereeId);
}

/**
 * Generates a new referral link.
 * Requires either a user (telegramId) or an externalReferrer name (e.g., "TIKTOK").
 */
export async function createReferralLink({
    telegramId,
    externalReferrer,
}: {
    telegramId?: string;
    externalReferrer?: string;
}) {
    if (!telegramId && !externalReferrer) {
        throw new Error("Either telegramId or externalReferrer must be provided.");
    }

    let code = "";
    let exists = true;

    while (exists) {
        const rawId = uuidv4().split("-")[0];
        code = `DQR-${rawId.toUpperCase()}`;
        exists = await prisma.referralLink.findUnique({ where: { code } }) !== null;
    }

    const referralLink = await prisma.referralLink.create({
        data: {
            code,
            ownerId: telegramId ?? null,
        },
    });

    logger.info(
        `🧲 Referral code generated: ${referralLink.code}` +
        (telegramId
            ? ` for user ${telegramId}`
            : ` for external referrer "${externalReferrer}"`)
    );

    return {
        code: referralLink.code,
        ownerId: telegramId ?? null,
        externalReferrer: telegramId ? null : externalReferrer,
    };
}

export async function getReferralCode({
    telegramId,
    externalReferrer,
}: {
    telegramId?: string;
    externalReferrer?: string;
}) {
    if (!telegramId && !externalReferrer) {
        throw new Error("Either telegramId or externalReferrer must be provided.");
    }

    const existing = await prisma.referralLink.findFirst({
        where: {
            ownerId: telegramId ?? undefined,
            code: externalReferrer ? externalReferrer : undefined,
        },
    });

    if (existing) {
        return {
            code: existing.code,
            ownerId: existing.ownerId ?? null,
            externalReferrer: existing.ownerId ? null : existing.code,
        };
    }

    return createReferralLink({ telegramId, externalReferrer });
}

export async function getUserReferralCode(telegramId: string) {
    if (!telegramId) {
        throw new Error("telegramId is required to get or create a referral code.");
    }

    const existing = await prisma.referralLink.findUnique({
        where: { ownerId: telegramId },
    });

    if (existing) {
        return {
            code: existing.code,
            ownerId: existing.ownerId,
        };
    }

    return createReferralLink({ telegramId });
}

export async function validateReferralCodeUsage(userId: string, code: string): Promise<{
    valid: true;
} | {
    valid: false;
    reason: string;
}> {
    const referralLink = await prisma.referralLink.findUnique({ where: { code } });
    if (!referralLink) {
        return { valid: false, reason: "Referral code not found" };
    }

    if (referralLink.ownerId === userId) {
        return { valid: false, reason: "You cannot refer yourself" };
    }

    const existing = await prisma.referralRelation.findUnique({ where: { refereeId: userId } });
    if (existing) {
        return { valid: false, reason: "You have already used a referral code" };
    }

    // Prevent circular referral
    if (referralLink.ownerId) {
        const reverseRelation = await prisma.referralRelation.findUnique({
            where: { refereeId: referralLink.ownerId },
            select: { referrerUserId: true },
        });

        if (reverseRelation?.referrerUserId === userId) {
            return { valid: false, reason: "You cannot use the code of someone you referred" };
        }
    }

    return { valid: true };
}

/**
 * Applies a referral code to a user (first time only).
 */
export async function applyReferralCode(userId: string, code: string) {
    const referralLink = await prisma.referralLink.findUnique({
        where: { code },
    });

    if (!referralLink) throw new Error("Referral code not found");
    if (referralLink.ownerId === userId) throw new Error("You cannot refer yourself");

    const existing = await prisma.referralRelation.findUnique({
        where: { refereeId: userId },
    });

    if (existing) throw new Error("User already referred");

    // Determine source
    const isUserRef = !!referralLink.ownerId;
    const relationData = {
        refereeId: userId,
        referrerUserId: isUserRef ? referralLink.ownerId : null,
        referrerExternal: isUserRef ? null : referralLink.code,
    };

    await prisma.referralRelation.create({ data: relationData });

    await prisma.referralEventLog.create({
        data: {
            userId,
            oldReferrerId: null,
            newReferrerId: referralLink.code,
            eventType: ReferralEventType.INITIAL,
        },
    });

    return {
        success: true,
        referredBy: isUserRef ? referralLink.ownerId : referralLink.code,
        isUserReferrer: isUserRef,
    };
}

/**
 * Logs a referral earning for a referrer based on a referee's activity.
 *
 * @param referrerId - The Telegram ID of the referrer (must be a valid User.telegramId)
 * @param refereeId - The Telegram ID of the referee (must also be a valid User.telegramId)
 * @param amountDittoWei - The amount earned in Ditto wei (integer)
 * @param tier - The referral tier (1 for direct, 2 for indirect, etc.)
 */
export async function logReferralEarning({
    referrerId,
    refereeId,
    amountDittoWei,
    tier = 1,
}: {
    referrerId: string;
    refereeId: string;
    amountDittoWei: number;
    tier?: number;
}) {
    if (referrerId === refereeId) {
        throw new Error("Cannot earn from self-referral.");
    }

    return await prisma.referralEarningLog.create({
        data: {
            referrerId,
            refereeId,
            amountDittoWei,
            tier,
        },
    });
}

/**
 * Prints first-time and total uses of a referral code
 * @param code The referral code to inspect
 */
export async function printReferralCodeUsage(code: string) {
    const referralLink = await prisma.referralLink.findUnique({
        where: { code },
    });

    if (!referralLink) {
        logger.warn(`❌ Referral code ${code} not found`);
        return;
    }

    const { ownerId } = referralLink;

    // Count INITIAL uses (first-time referrals)
    const firstTimeCount = await prisma.referralEventLog.count({
        where: {
            eventType: ReferralEventType.INITIAL,
            newReferrerId: ownerId ?? undefined,
        },
    });

    // Count total uses (including referrer changes)
    const totalCount = await prisma.referralEventLog.count({
        where: {
            newReferrerId: ownerId ?? undefined,
        },
    });

    logger.info(
        `📊 Referral Code ${code} — ` +
        `${firstTimeCount} first-time user(s), ` +
        `${totalCount} total use(s)` +
        (ownerId ? ` (owner: ${ownerId})` : " (no user owner)")
    );
}