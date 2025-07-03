// src/scripts/admin/add-levels-and-skill-points.ts
import { PrismaClient } from '@prisma/client';
import { ABILITY_POINTS_PER_LEVEL } from '../../utils/config';
import { calculateExpForNextLevel } from '../../utils/helpers';
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

interface AddLevelsInput {
    telegramId: string;
    levelsToAdd: number;
    addSkillPoints?: boolean;
}

async function addLevelsAndSkillPoints(input: AddLevelsInput) {
    const { telegramId, levelsToAdd, addSkillPoints = true } = input;

    try {
        logger.info(`🚀 Adding ${levelsToAdd} levels to user ${telegramId}...`);

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

        logger.info(`📋 Current level: ${fullUserData.level}, Outstanding skill points: ${fullUserData.outstandingSkillPoints}`);

        // STEP 2: Modify the snapshot data
        const oldLevel = fullUserData.level;
        const oldSkillPoints = fullUserData.outstandingSkillPoints;

        const newLevel = oldLevel + levelsToAdd;
        let newOutstandingSkillPoints = oldSkillPoints;

        if (addSkillPoints) {
            const skillPointsToAdd = levelsToAdd * ABILITY_POINTS_PER_LEVEL;
            newOutstandingSkillPoints += skillPointsToAdd;
            logger.info(`🎯 Adding ${skillPointsToAdd} skill points (${levelsToAdd} levels × ${ABILITY_POINTS_PER_LEVEL} points per level)`);
        }

        const newExpToNextLevel = calculateExpForNextLevel(newLevel + 1);

        // Update the snapshot data
        fullUserData.level = newLevel;
        fullUserData.outstandingSkillPoints = newOutstandingSkillPoints;
        fullUserData.expToNextLevel = newExpToNextLevel;

        logger.info(`📈 Updated user ${telegramId}:`);
        logger.info(`   Level: ${oldLevel} → ${newLevel}`);
        logger.info(`   Skill Points: ${oldSkillPoints} → ${newOutstandingSkillPoints}`);
        logger.info(`   Exp to next level: ${fullUserData.expToNextLevel} → ${newExpToNextLevel}`);

        // STEP 3: Save to database
        await prisma.user.update({
            where: { telegramId },
            data: {
                level: newLevel,
                expToNextLevel: newExpToNextLevel,
                outstandingSkillPoints: newOutstandingSkillPoints
            }
        });
        logger.info(`💾 ✅ Database updated`);

        // STEP 4: Save updated snapshot to Redis
        await snapshotManager.storeSnapshot(telegramId, fullUserData);
        logger.info(`📸 ✅ Redis snapshot updated`);

        logger.info(`🎉 Successfully added ${levelsToAdd} levels to user ${telegramId}!`);

        return {
            success: true,
            oldLevel,
            newLevel,
            oldSkillPoints,
            newSkillPoints: newOutstandingSkillPoints,
            levelsAdded: levelsToAdd
        };

    } catch (error) {
        logger.error(`❌ Error adding levels to user ${telegramId}: ${error}`);
        throw error;
    }
}

// Batch operation for multiple users
async function addLevelsToMultipleUsers(users: AddLevelsInput[]) {
    logger.info(`🚀 Adding levels to ${users.length} users...`);

    const results = [];
    for (const userInput of users) {
        try {
            const result = await addLevelsAndSkillPoints(userInput);
            results.push(result);
        } catch (error) {
            logger.error(`❌ Failed to add levels to ${userInput.telegramId}: ${error}`);
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

// Utility function to just modify specific fields in snapshot and sync to DB
async function modifyUserFields(telegramId: string, modifications: {
    level?: number;
    outstandingSkillPoints?: number;
    expToNextLevel?: number;
    [key: string]: any;
}) {
    try {
        logger.info(`🔧 Modifying user fields for ${telegramId}:`, modifications);

        await ensureRedisConnection();
        const snapshotManager = new SnapshotRedisManager(redis);

        // Get existing snapshot
        let fullUserData = await snapshotManager.loadSnapshot(telegramId);

        if (!fullUserData) {
            logger.info(`📸 No snapshot found, fetching from database...`);
            fullUserData = await prismaFetchUserData(telegramId);

            if (!fullUserData) {
                throw new Error(`User ${telegramId} not found in database`);
            }
        }

        // Apply modifications
        const oldValues: any = {};
        for (const [key, newValue] of Object.entries(modifications)) {
            if (newValue !== undefined) {
                oldValues[key] = (fullUserData as any)[key];
                (fullUserData as any)[key] = newValue;
                logger.info(`   ${key}: ${oldValues[key]} → ${newValue}`);
            }
        }

        // Save to database (only update user fields that exist in User table)
        const userFields = ['level', 'outstandingSkillPoints', 'expToNextLevel'];
        const dbUpdates: any = {};

        for (const field of userFields) {
            if (modifications[field] !== undefined) {
                dbUpdates[field] = modifications[field];
            }
        }

        if (Object.keys(dbUpdates).length > 0) {
            await prisma.user.update({
                where: { telegramId },
                data: dbUpdates
            });
            logger.info(`💾 ✅ Database updated with:`, dbUpdates);
        }

        // Save updated snapshot to Redis
        await snapshotManager.storeSnapshot(telegramId, fullUserData);
        logger.info(`📸 ✅ Redis snapshot updated`);

        return {
            success: true,
            oldValues,
            newValues: modifications
        };

    } catch (error) {
        logger.error(`❌ Error modifying user fields for ${telegramId}: ${error}`);
        throw error;
    }
}

// Utility function to check current values
async function checkUserValues(telegramId: string) {
    try {
        await ensureRedisConnection();
        const snapshotManager = new SnapshotRedisManager(redis);

        const fullUserData = await snapshotManager.loadSnapshot(telegramId);

        if (fullUserData) {
            logger.info(`📊 Current values for user ${telegramId}:`);
            logger.info(`   Level: ${fullUserData.level}`);
            logger.info(`   Outstanding Skill Points: ${fullUserData.outstandingSkillPoints}`);
            logger.info(`   Exp to Next Level: ${fullUserData.expToNextLevel}`);
            logger.info(`   HP Level: ${fullUserData.hpLevel}`);

            return {
                exists: true,
                level: fullUserData.level,
                outstandingSkillPoints: fullUserData.outstandingSkillPoints,
                expToNextLevel: fullUserData.expToNextLevel,
                hpLevel: fullUserData.hpLevel
            };
        } else {
            logger.info(`📸 No snapshot found for user ${telegramId}`);
            return { exists: false };
        }

    } catch (error) {
        logger.error(`❌ Error checking user values for ${telegramId}: ${error}`);
        return { exists: false, error: (error as any).message };
    }
}

// Main execution function
async function main() {
    try {
        const userId = "61483845";

        // Connect to Redis once at the start
        await ensureRedisConnection();

        // Example: Check current values first
        await checkUserValues(userId);

        // Example: Add levels to a single user
        const singleUserResult = await addLevelsAndSkillPoints({
            telegramId: userId,
            levelsToAdd: 5,
            addSkillPoints: true
        });

        console.log('Single user result:', singleUserResult);

/*         // Example: Add levels to multiple users
        const multipleUsersResult = await addLevelsToMultipleUsers([
            { telegramId: userId, levelsToAdd: 50, addSkillPoints: true },
            // { telegramId: "123456789", levelsToAdd: 3, addSkillPoints: false },
        ]);

        console.log('Multiple users result:', multipleUsersResult); */

        // Example: Direct field modification
        // const fieldModResult = await modifyUserFields("61483845", {
        //     level: 50,
        //     outstandingSkillPoints: 100,
        //     expToNextLevel: calculateExpForNextLevel(51)
        // });
        // console.log('Field modification result:', fieldModResult);

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
    addLevelsAndSkillPoints,
    addLevelsToMultipleUsers,
    modifyUserFields,
    checkUserValues
};