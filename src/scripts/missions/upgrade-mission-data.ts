import { PrismaClient, MissionType } from "@prisma/client";
import { parseUnits } from "ethers";
import { DITTO_DECIMALS } from "../../utils/config";
import { logger } from "../../utils/logger";
import { missions } from "../../sql-services/missions";

const prisma = new PrismaClient();

// Define the new mission configurations that replace old ones
const newMissions = missions;

interface MigrationResult {
    totalMissions: number;
    updatedMissions: number;
    skippedCompleted: number;
    alreadyNewFormat: number;
    errors: { userId: string; round: number; error: string }[];
}

async function migrateAllActiveMissions(): Promise<MigrationResult> {
    const result: MigrationResult = {
        totalMissions: 0,
        updatedMissions: 0,
        skippedCompleted: 0,
        alreadyNewFormat: 0,
        errors: []
    };

    try {
        // Find ALL active missions (not completed tutorial)
        const activeMissions = await prisma.userMission.findMany({
            where: {
                NOT: {
                    AND: [
                        { round: 6 },
                        { label: "Tutorial Complete" }
                    ]
                }
            }
        });

        result.totalMissions = activeMissions.length;
        logger.info(`Found ${result.totalMissions} active missions to migrate`);

        // Also log completed tutorial count for reference
        const completedTutorialCount = await prisma.userMission.count({
            where: {
                round: 6,
                label: "Tutorial Complete",
                claimed: true
            }
        });
        logger.info(`Users with completed tutorial: ${completedTutorialCount}`);

        for (const mission of activeMissions) {
            try {
                // Skip if already claimed (completed)
                if (mission.claimed) {
                    result.skippedCompleted++;
                    logger.info(`Mission for user ${mission.telegramId} round ${mission.round} already claimed, skipping`);
                    continue;
                }

                // Check if already has new array format
                const hasNewFormat = mission.itemIds ||
                    mission.equipmentIds ||
                    mission.monsterIds ||
                    mission.slimeRarities;

                if (hasNewFormat) {
                    result.alreadyNewFormat++;
                    logger.info(`Mission for user ${mission.telegramId} round ${mission.round} already has new format, skipping`);
                    continue;
                }

                // Find the corresponding new mission configuration
                const newMissionConfig = newMissions.find(m => m.round === mission.round);

                if (!newMissionConfig) {
                    // For missions that don't have a predefined config, just migrate existing IDs to arrays
                    const updateData: any = {};

                    // Convert single IDs to arrays for backward compatibility
                    if (mission.itemId !== null) {
                        updateData.itemIds = JSON.stringify([mission.itemId]);
                    }
                    if (mission.equipmentId !== null) {
                        updateData.equipmentIds = JSON.stringify([mission.equipmentId]);
                    }
                    if (mission.monsterId !== null) {
                        updateData.monsterIds = JSON.stringify([mission.monsterId]);
                    }
                    if (mission.slimeRarity !== null) {
                        updateData.slimeRarities = JSON.stringify([mission.slimeRarity]);
                    }

                    if (Object.keys(updateData).length > 0) {
                        await prisma.userMission.update({
                            where: { id: mission.id },
                            data: updateData
                        });

                        result.updatedMissions++;
                        logger.info(`✅ Migrated legacy mission for user ${mission.telegramId} round ${mission.round} to array format`);
                    }
                    continue;
                }

                // Update with new mission configuration
                const updateData: any = {
                    label: newMissionConfig.label,
                    quantity: newMissionConfig.quantity,
                    rewardDitto: newMissionConfig.rewardDitto.toString(),
                    // Keep existing progress - important for user experience
                };

                // Set the appropriate array field
                if (newMissionConfig.type === MissionType.FARM && 'itemIds' in newMissionConfig) {
                    updateData.itemIds = JSON.stringify(newMissionConfig.itemIds);
                    updateData.itemId = newMissionConfig.itemIds[0]; // Maintain compatibility
                } else if (newMissionConfig.type === MissionType.CRAFT && 'equipmentIds' in newMissionConfig) {
                    updateData.equipmentIds = JSON.stringify(newMissionConfig.equipmentIds);
                    updateData.equipmentId = newMissionConfig.equipmentIds[0]; // Maintain compatibility
                } else if (newMissionConfig.type === MissionType.COMBAT && 'monsterIds' in newMissionConfig) {
                    updateData.monsterIds = JSON.stringify(newMissionConfig.monsterIds);
                    updateData.monsterId = newMissionConfig.monsterIds[0]; // Maintain compatibility
                }

                await prisma.userMission.update({
                    where: { id: mission.id },
                    data: updateData
                });

                result.updatedMissions++;
                logger.info(`✅ Updated mission for user ${mission.telegramId}: round ${mission.round} "${mission.label}" -> "${newMissionConfig.label}"`);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                result.errors.push({
                    userId: mission.telegramId,
                    round: mission.round,
                    error: errorMessage
                });
                logger.error(`❌ Failed to update mission for user ${mission.telegramId} round ${mission.round}:`, error);
            }
        }

    } catch (error) {
        logger.error("❌ Failed to fetch missions for migration:", error);
        throw error;
    }

    return result;
}

async function main() {
    try {
        logger.info("🚀 Starting mission migration to new array format...");

        const result = await migrateAllActiveMissions();

        logger.info("📊 Migration Results:");
        logger.info(`   Total active missions found: ${result.totalMissions}`);
        logger.info(`   Successfully updated: ${result.updatedMissions}`);
        logger.info(`   Skipped (already completed): ${result.skippedCompleted}`);
        logger.info(`   Skipped (already new format): ${result.alreadyNewFormat}`);
        logger.info(`   Errors: ${result.errors.length}`);

        if (result.errors.length > 0) {
            logger.error("❌ Errors:");
            result.errors.forEach(({ userId, round, error }) => {
                logger.error(`   User ${userId} round ${round}: ${error}`);
            });
        }

        logger.info("🎉 Migration completed!");

    } catch (error) {
        logger.error("💥 Migration failed:", error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Allow running this script directly
if (require.main === module) {
    main();
}

export { migrateAllActiveMissions, MigrationResult };