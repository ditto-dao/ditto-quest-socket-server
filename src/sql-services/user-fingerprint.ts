import { logger } from "../utils/logger";
import { prisma } from "./client";

/**
 * Stores the fingerprint for a user only if the exact (userId, fingerprint, ipAddress) doesn't exist.
 */
export async function storeFingerprint(userId: string, fingerprint: string, ipAddress: string) {
    logger.info(`Storing fingerprint for user: ${userId}, fingerprint: ${fingerprint}, ipAddress: ${ipAddress}`);
    try {
        const existing = await prisma.userDeviceFingerprint.findFirst({
            where: {
                userId,
                fingerprint,
                ipAddress
            }
        });

        if (existing) {
            logger.info(`✅ Fingerprint already exists for user ${userId} — IP: ${ipAddress}, Fingerprint: ${fingerprint}`);
            return;
        }

        await prisma.userDeviceFingerprint.create({
            data: {
                userId,
                fingerprint,
                ipAddress
            }
        });

        logger.info(`📝 Stored new fingerprint for user ${userId} — IP: ${ipAddress}, Fingerprint: ${fingerprint}`);
    } catch (err) {
        logger.error(`❌ Failed to store fingerprint for ${userId}: ${err}`);
    }
}

async function getUsernameMap(userIds: string[]) {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: userIds } },
    select: { telegramId: true, username: true },
  });
  return new Map(users.map((u) => [u.telegramId, u.username || "Anonymous"]));
}

/**
 * Prints suspicious users based on shared fingerprints, IPs, or excessive device use.
 */
export async function printSuspiciousUsers() {
  try {
    // 1. Shared fingerprints
    const sharedFingerprints = await prisma.userDeviceFingerprint.groupBy({
      by: ['fingerprint'],
      _count: { userId: true },
      having: {
        userId: { _count: { gt: 1 } }
      }
    });

    for (const fp of sharedFingerprints) {
      const users = await prisma.userDeviceFingerprint.findMany({
        where: { fingerprint: fp.fingerprint },
        select: { userId: true }
      });

      const uniqueUserIds = [...new Set(users.map(u => u.userId))];
      const usernameMap = await getUsernameMap(uniqueUserIds);

      if (uniqueUserIds.length > 1) {
        logger.info(`🔴 Shared Fingerprint: "${fp.fingerprint}" is used by users: ${uniqueUserIds.map(id => `${usernameMap.get(id)} (${id})`).join(', ')}`);
      }
    }

    // 2. Shared IPs
    const sharedIps = await prisma.userDeviceFingerprint.groupBy({
      by: ['ipAddress'],
      _count: { userId: true },
      having: {
        userId: { _count: { gt: 1 } }
      }
    });

    for (const ip of sharedIps) {
      const users = await prisma.userDeviceFingerprint.findMany({
        where: { ipAddress: ip.ipAddress },
        select: { userId: true }
      });

      const uniqueUserIds = [...new Set(users.map(u => u.userId))];
      const usernameMap = await getUsernameMap(uniqueUserIds);

      if (uniqueUserIds.length > 1) {
        logger.info(`🟠 Shared IP: "${ip.ipAddress}" is used by users: ${uniqueUserIds.map(id => `${usernameMap.get(id)} (${id})`).join(', ')}`);
      }
    }

    // 3. Shared fingerprint + IP combo
    const sharedCombos = await prisma.userDeviceFingerprint.groupBy({
      by: ['fingerprint', 'ipAddress'],
      _count: { userId: true },
      having: {
        userId: { _count: { gt: 1 } }
      }
    });

    for (const combo of sharedCombos) {
      const users = await prisma.userDeviceFingerprint.findMany({
        where: {
          fingerprint: combo.fingerprint,
          ipAddress: combo.ipAddress,
        },
        select: { userId: true }
      });

      const uniqueUserIds = [...new Set(users.map(u => u.userId))];
      const usernameMap = await getUsernameMap(uniqueUserIds);

      if (uniqueUserIds.length > 1) {
        logger.info(`🔴 Shared Fingerprint+IP: "${combo.fingerprint}" @ "${combo.ipAddress}" is used by users: ${uniqueUserIds.map(id => `${usernameMap.get(id)} (${id})`).join(', ')}`);
      }
    }

    // 4. Users with too many fingerprints
    const multiDeviceUsers = await prisma.userDeviceFingerprint.groupBy({
      by: ['userId'],
      _count: { fingerprint: true },
      having: {
        fingerprint: { _count: { gt: 1 } }
      }
    });

    const allIds = multiDeviceUsers.map(u => u.userId);
    const usernameMap = await getUsernameMap(allIds);

    for (const user of multiDeviceUsers) {
      logger.info(`🟡 User "${usernameMap.get(user.userId)}" (${user.userId}) has used ${user._count.fingerprint} different fingerprints`);
    }

    logger.info("✅ Finished scanning for suspicious users.");
  } catch (err) {
    logger.error(`❌ Failed to scan for suspicious users: ${err}`);
  }
}