import { printSuspiciousUsers } from "../../sql-services/user-fingerprint";
import { logger } from "../../utils/logger";

async function print() {
  try {
    await printSuspiciousUsers();
  } catch (error) {
    logger.error(`❌ Error printing suspicious users: ${error}`);
    throw error;
  }
}

print();
