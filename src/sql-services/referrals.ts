import { ReferralEventType } from "@prisma/client";
import { prisma } from "./client";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger";

/**
 * Generates a new referral link.
 * If `telegramId` is provided, it associates the code with that user.
 */
export async function createReferralLink(telegramId?: string) {
    let code: string = "";
    let exists = true;

    while (exists) {
        const rawId = uuidv4().split("-")[0]; // 8 chars from UUID
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
        `🔗 Referral code generated: ${referralLink.code}` +
        (referralLink.ownerId ? ` for user ${referralLink.ownerId}` : "")
    );

    return referralLink;
}

/**
 * Applies a referral link for a user (first time only).
 * @param userId The telegramId of the user using the referral.
 * @param code The referral code being used.
 */
export async function applyReferralCode(userId: string, code: string) {
    // Find the referral link
    const referralLink = await prisma.referralLink.findUnique({
        where: { code },
    });

    if (!referralLink) {
        throw new Error("Referral code not found");
    }

    if (referralLink.ownerId === userId) {
        throw new Error("You cannot refer yourself");
    }

    // Check if user already has a referrer
    const existingReferral = await prisma.referralRelation.findUnique({
        where: { refereeId: userId },
    });

    if (existingReferral) {
        throw new Error("User already referred");
    }

    // Create the referral relation
    await prisma.referralRelation.create({
        data: {
            refereeId: userId,
            referrerId: referralLink.ownerId!,
        },
    });

    // Log the event
    await prisma.referralEventLog.create({
        data: {
            userId,
            oldReferrerId: null,
            newReferrerId: referralLink.ownerId!,
            eventType: ReferralEventType.INITIAL,
        },
    });

    return { success: true, referrerId: referralLink.ownerId };
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