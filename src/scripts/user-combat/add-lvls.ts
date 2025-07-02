// src/scripts/admin/add-levels-and-skill-points.ts
import { PrismaClient } from '@prisma/client';
import { ABILITY_POINTS_PER_LEVEL } from '../../utils/config';
import { calculateExpForNextLevel } from '../../utils/helpers';
import { logger } from '../../utils/logger';
import { createClient } from 'redis';

const prisma = new PrismaClient();
const redis = createClient({
    url: 'redis://localhost:6379'
});

redis.on('error', (err) => console.error('Redis Client Error', err));

interface AddLevelsInput {
    telegramId: string;
    levelsToAdd: number;
    addSkillPoints?: boolean;
}

async function addLevelsAndSkillPoints(input: AddLevelsInput) {
    const { telegramId, levelsToAdd, addSkillPoints = true } = input;

    try {
        logger.info(`🚀 Adding ${levelsToAdd} levels to user ${telegramId}...`);

        // Get user from database (only what we need)
        const user = await prisma.user.findUnique({
            where: { telegramId },
            select: {
                telegramId: true,
                level: true,
                outstandingSkillPoints: true,
                expToNextLevel: true
            }
        });

        if (!user) {
            throw new Error(`User ${telegramId} not found`);
        }

        logger.info(`📋 Current level: ${user.level}, Outstanding skill points: ${user.outstandingSkillPoints}`);

        // Calculate new values
        const newLevel = user.level + levelsToAdd;
        let newOutstandingSkillPoints = user.outstandingSkillPoints;

        if (addSkillPoints) {
            const skillPointsToAdd = levelsToAdd * ABILITY_POINTS_PER_LEVEL;
            newOutstandingSkillPoints += skillPointsToAdd;
            logger.info(`🎯 Adding ${skillPointsToAdd} skill points (${levelsToAdd} levels × ${ABILITY_POINTS_PER_LEVEL} points per level)`);
        }

        const newExpToNextLevel = calculateExpForNextLevel(newLevel + 1);

        // Update database (User table only, no separate Combat table)
        await prisma.user.update({
            where: { telegramId },
            data: {
                level: newLevel,
                expToNextLevel: newExpToNextLevel,
                outstandingSkillPoints: newOutstandingSkillPoints
            }
        });

        logger.info(`📈 Updated user ${telegramId}:`);
        logger.info(`   Level: ${user.level} → ${newLevel}`);
        logger.info(`   Skill Points: ${user.outstandingSkillPoints} → ${newOutstandingSkillPoints}`);
        logger.info(`   Exp to next level: ${user.expToNextLevel} → ${newExpToNextLevel}`);

        // Get updated user data for snapshot (still need full data for snapshot)
        const updatedUser = await prisma.user.findUnique({
            where: { telegramId }
        });

        // Connect to Redis
        await redis.connect();

        // Update Redis snapshot
        if (updatedUser) {
            const snapshotKey = `snapshot:${telegramId}`;
            await redis.set(snapshotKey, JSON.stringify(updatedUser));
            logger.info(`📸 ✅ Redis snapshot updated`);
        }

        logger.info(`🎉 Successfully added ${levelsToAdd} levels to user ${telegramId}!`);

        return {
            success: true,
            oldLevel: user.level,
            newLevel,
            oldSkillPoints: user.outstandingSkillPoints,
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

// Main execution function
async function main() {
    try {
        // Example: Add levels to a single user
        const singleUserResult = await addLevelsAndSkillPoints({
            telegramId: "61483845", // Your telegram ID
            levelsToAdd: 5,
            addSkillPoints: true
        });

        console.log('Single user result:', singleUserResult);

        // Example: Add levels to multiple users
        // const multipleUsersResult = await addLevelsToMultipleUsers([
        //     { telegramId: "138050881", levelsToAdd: 5, addSkillPoints: true },
        //     { telegramId: "123456789", levelsToAdd: 3, addSkillPoints: false },
        // ]);
        // 
        // console.log('Multiple users result:', multipleUsersResult);

    } catch (error) {
        logger.error(`❌ Script execution failed: ${error}`);
    } finally {
        await prisma.$disconnect();
        await redis.quit();
        process.exit(0);
    }
}

// Run the script
if (require.main === module) {
    main();
}

export { addLevelsAndSkillPoints, addLevelsToMultipleUsers };