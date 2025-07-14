/*
  Warnings:

  - You are about to drop the column `doubleResourceOdds` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `skillIntervalReductionMultiplier` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `User` DROP COLUMN `doubleResourceOdds`,
    DROP COLUMN `skillIntervalReductionMultiplier`;

-- CreateTable
CREATE TABLE `user_efficiency_stats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `skill_interval_multiplier` DOUBLE NOT NULL DEFAULT 0.0,
    `double_resource_chance` DOUBLE NOT NULL DEFAULT 0.0,
    `double_skill_exp_chance` DOUBLE NOT NULL DEFAULT 0.0,
    `double_combat_exp_chance` DOUBLE NOT NULL DEFAULT 0.0,
    `flat_skill_exp_boost` INTEGER NOT NULL DEFAULT 0,
    `flat_combat_exp_boost` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_efficiency_stats_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
