import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger';
import { createClient } from 'redis';
import { SnapshotRedisManager } from '../../redis/snapshot-redis';
import { prismaFetchUserData } from '../../sql-services/user-service';

const prisma = new PrismaClient();
const redis = createClient({
    url: 'redis://localhost:6379'
});

redis.on('error', (err) => console.error('Redis Client Error', err));

// Global Redis connection state
let isRedisConnected = false;

async function ensureRedisConnection() {
    if (!isRedisConnected) {
        await redis.connect();
        isRedisConnected = true;
        logger.info(`🔌 Redis connected`);
    }
}

interface AddGoldInput {
    telegramId: string;
    goldToAdd: number;
}

async function addGoldBalance(input: AddGoldInput) {
    const { telegramId, goldToAdd } = input;

    try {
        logger.info(`💰 Adding ${goldToAdd} gold to user ${telegramId}...`);

        // Ensure Redis connection
        await ensureRedisConnection();
        const snapshotManager = new SnapshotRedisManager(redis);

        // STEP 1: Get existing snapshot
        let fullUserData = await snapshotManager.loadSnapshot(telegramId);

        if (!fullUserData) {
            logger.info(`📸 No snapshot found, fetching from database...`);
            fullUserData = await prismaFetchUserData(telegramId);

            if (!fullUserData) {
                throw new Error(`User ${telegramId} not found in database`);
            }
        }

        logger.info(`📋 Current gold balance: ${fullUserData.goldBalance || 0}`);

        // STEP 2: Modify the snapshot data
        const oldGoldBalance = fullUserData.goldBalance || 0;
        const newGoldBalance = oldGoldBalance + goldToAdd;

        // Prevent negative balance
        if (newGoldBalance < 0) {
            throw new Error(`Cannot reduce gold below 0. Current: ${oldGoldBalance}, Attempting to subtract: ${Math.abs(goldToAdd)}`);
        }

        // Update the snapshot data
        fullUserData.goldBalance = newGoldBalance;

        logger.info(`💰 Updated user ${telegramId}:`);
        logger.info(`   Gold Balance: ${oldGoldBalance} → ${newGoldBalance}`);

        // STEP 3: Save to database
        await prisma.user.update({
            where: { telegramId },
            data: {
                goldBalance: newGoldBalance
            }
        });
        logger.info(`💾 ✅ Database updated`);

        // STEP 4: Save updated snapshot to Redis
        await snapshotManager.storeSnapshot(telegramId, fullUserData);
        logger.info(`📸 ✅ Redis snapshot updated`);

        logger.info(`🎉 Successfully added ${goldToAdd} gold to user ${telegramId}!`);

        return {
            success: true,
            oldGoldBalance,
            newGoldBalance,
            goldAdded: goldToAdd
        };

    } catch (error) {
        logger.error(`❌ Error adding gold to user ${telegramId}: ${error}`);
        throw error;
    }
}

// Batch operation for multiple users
async function addGoldToMultipleUsers(users: AddGoldInput[]) {
    logger.info(`🚀 Adding gold to ${users.length} users...`);

    const results = [];
    for (const userInput of users) {
        try {
            const result = await addGoldBalance(userInput);
            results.push(result);
        } catch (error) {
            logger.error(`❌ Failed to add gold to ${userInput.telegramId}: ${error}`);
            results.push({
                success: false,
                telegramId: userInput.telegramId,
                error: (error as any).message
            });
        }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    logger.info(`📊 Batch operation complete: ${successful} successful, ${failed} failed`);
    return results;
}

// Utility function to check current user values
async function checkUserGoldBalance(telegramId: string) {
    try {
        await ensureRedisConnection();
        const snapshotManager = new SnapshotRedisManager(redis);

        let fullUserData = await snapshotManager.loadSnapshot(telegramId);

        if (!fullUserData) {
            fullUserData = await prismaFetchUserData(telegramId);
            if (!fullUserData) {
                throw new Error(`User ${telegramId} not found`);
            }
        }

        logger.info(`📊 User ${telegramId} current gold balance: ${fullUserData.goldBalance || 0}`);
        return fullUserData.goldBalance || 0;

    } catch (error) {
        logger.error(`❌ Error checking user gold balance: ${error}`);
        throw error;
    }
}

// Utility function to set exact gold amount (useful for testing)
async function setGoldBalance(telegramId: string, exactAmount: number) {
    try {
        logger.info(`🎯 Setting exact gold balance for user ${telegramId} to ${exactAmount}...`);

        await ensureRedisConnection();
        const snapshotManager = new SnapshotRedisManager(redis);

        let fullUserData = await snapshotManager.loadSnapshot(telegramId);

        if (!fullUserData) {
            logger.info(`📸 No snapshot found, fetching from database...`);
            fullUserData = await prismaFetchUserData(telegramId);

            if (!fullUserData) {
                throw new Error(`User ${telegramId} not found in database`);
            }
        }

        const oldGoldBalance = fullUserData.goldBalance || 0;

        if (exactAmount < 0) {
            throw new Error(`Cannot set gold balance to negative amount: ${exactAmount}`);
        }

        // Update the snapshot data
        fullUserData.goldBalance = exactAmount;

        logger.info(`💰 Updated user ${telegramId}:`);
        logger.info(`   Gold Balance: ${oldGoldBalance} → ${exactAmount}`);

        // Save to database
        await prisma.user.update({
            where: { telegramId },
            data: {
                goldBalance: exactAmount
            }
        });
        logger.info(`💾 ✅ Database updated`);

        // Save updated snapshot to Redis
        await snapshotManager.storeSnapshot(telegramId, fullUserData);
        logger.info(`📸 ✅ Redis snapshot updated`);

        logger.info(`🎉 Successfully set gold balance to ${exactAmount} for user ${telegramId}!`);

        return {
            success: true,
            oldGoldBalance,
            newGoldBalance: exactAmount
        };

    } catch (error) {
        logger.error(`❌ Error setting gold balance for user ${telegramId}: ${error}`);
        throw error;
    }
}

// Main execution function
async function main() {
    try {
        const userId = "138050881";

        // Connect to Redis once at the start
        await ensureRedisConnection();

        // Example: Check current gold balance first
        await checkUserGoldBalance(userId);

        // Example: Add gold to a single user
        const singleUserResult = await addGoldBalance({
            telegramId: userId,
            goldToAdd: 1000000000
        });

        console.log('Single user result:', singleUserResult);

        // Example: Set exact gold amount
        // const setExactResult = await setGoldBalance(userId, 50000);
        // console.log('Set exact gold result:', setExactResult);

        // Example: Add gold to multiple users
        // const multipleUsersResult = await addGoldToMultipleUsers([
        //     { telegramId: userId, goldToAdd: 5000 },
        //     { telegramId: "123456789", goldToAdd: 1000 },
        // ]);
        // console.log('Multiple users result:', multipleUsersResult);

        // Example: Subtract gold (negative amount)
        // const subtractResult = await addGoldBalance({
        //     telegramId: userId,
        //     goldToAdd: -2000
        // });
        // console.log('Subtract gold result:', subtractResult);

    } catch (error) {
        logger.error(`❌ Script execution failed: ${error}`);
    } finally {
        await prisma.$disconnect();
        if (isRedisConnected) {
            await redis.quit();
        }
        process.exit(0);
    }
}

// Run the script
if (require.main === module) {
    main();
}

export {
    addGoldBalance,
    addGoldToMultipleUsers,
    checkUserGoldBalance,
    setGoldBalance
};