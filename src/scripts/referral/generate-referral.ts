import { createReferralLink } from "../../sql-services/referrals";
import { logger } from "../../utils/logger";

async function generate() {
    try {
        await createReferralLink();
    } catch (error) {
        logger.error(`❌ Error generating referral link: ${error}`);
        throw error;
    }
}

generate();
