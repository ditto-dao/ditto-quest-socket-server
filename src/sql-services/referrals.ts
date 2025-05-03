import { ReferralEventType } from "@prisma/client";
import { prisma } from "./client";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

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