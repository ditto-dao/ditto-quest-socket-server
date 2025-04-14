/*
  Warnings:

  - You are about to alter the column `str` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `def` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `dex` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `magic` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `hp` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `maxHp` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `str` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `def` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `dex` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `magic` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `hp` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `max_hp` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `doubleResourceOdds` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `skillIntervalReductionMultiplier` on the `StatEffect` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `doubleResourceOdds` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.
  - You are about to alter the column `skillIntervalReductionMultiplier` on the `User` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Double`.

*/
-- AlterTable
ALTER TABLE `Combat` MODIFY `str` DOUBLE NOT NULL DEFAULT 1,
    MODIFY `def` DOUBLE NOT NULL DEFAULT 1,
    MODIFY `dex` DOUBLE NOT NULL DEFAULT 1,
    MODIFY `magic` DOUBLE NOT NULL DEFAULT 1,
    MODIFY `hp` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `maxHp` DOUBLE NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE `StatEffect` MODIFY `str` DOUBLE NULL,
    MODIFY `def` DOUBLE NULL,
    MODIFY `dex` DOUBLE NULL,
    MODIFY `magic` DOUBLE NULL,
    MODIFY `hp` DOUBLE NULL,
    MODIFY `max_hp` DOUBLE NULL,
    MODIFY `doubleResourceOdds` DOUBLE NULL,
    MODIFY `skillIntervalReductionMultiplier` DOUBLE NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `doubleResourceOdds` DOUBLE NOT NULL DEFAULT 0.01,
    MODIFY `skillIntervalReductionMultiplier` DOUBLE NOT NULL DEFAULT 0;
