import { createReferralLink } from "../../sql-services/referrals";
import { logger } from "../../utils/logger";

async function generate() {
    try {
        const telegramId = process.argv[2] || undefined;
        const externalReferrer = process.argv[3] || undefined;

        if (!telegramId && !externalReferrer) {
            logger.error("❌ Please provide either a telegramId or an externalReferrer.");
            process.exit(1);
        }

        await createReferralLink({ telegramId, externalReferrer });
    } catch (error) {
        logger.error(`❌ Error generating referral link: ${error}`);
        throw error;
    }
}

generate();