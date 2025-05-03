import { printReferralCodeUsage } from "../../sql-services/referrals";
import { logger } from "../../utils/logger";

const referralCode = process.argv[2];

if (!referralCode) {
    logger.error("⚠️ Please provide a referral code. Example: yarn count-referral DQR-XXXXXX");
    process.exit(1);
}

async function count() {
    try {
        await printReferralCodeUsage(referralCode);
    } catch (error) {
        logger.error(`❌ Error counting referral links usage: ${error}`);
        throw error;
    }
}

count();