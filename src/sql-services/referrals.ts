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