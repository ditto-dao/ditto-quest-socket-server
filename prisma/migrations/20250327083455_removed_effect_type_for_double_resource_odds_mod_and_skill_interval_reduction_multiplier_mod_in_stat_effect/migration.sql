/*
  Warnings:

  - You are about to drop the column `doubleResourceOddsEffect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `skillIntervalReductionMultiplierEffect` on the `StatEffect` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Combat` MODIFY `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.290,
    MODIFY `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE `StatEffect` DROP COLUMN `doubleResourceOddsEffect`,
    DROP COLUMN `skillIntervalReductionMultiplierEffect`;

-- AlterTable
ALTER TABLE `User` MODIFY `hp_regen_amount` DOUBLE NOT NULL DEFAULT 5.7;
