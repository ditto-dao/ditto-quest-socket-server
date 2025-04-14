/*
  Warnings:

  - You are about to drop the column `doubleResourceOddsEffect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `skillIntervalReduction` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `skillIntervalReductionEffect` on the `StatEffect` table. All the data in the column will be lost.
  - The values [plus,times] on the enum `StatEffect_max_hp_effect` will be removed. If these variants are still used in the database, this will fail.
  - The values [plus,times] on the enum `StatEffect_max_hp_effect` will be removed. If these variants are still used in the database, this will fail.
  - The values [plus,times] on the enum `StatEffect_max_hp_effect` will be removed. If these variants are still used in the database, this will fail.
  - The values [plus,times] on the enum `StatEffect_max_hp_effect` will be removed. If these variants are still used in the database, this will fail.
  - The values [plus,times] on the enum `StatEffect_max_hp_effect` will be removed. If these variants are still used in the database, this will fail.
  - The values [plus,times] on the enum `StatEffect_max_hp_effect` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `skillIntervalReduction` on the `User` table. All the data in the column will be lost.
  - Made the column `sellPriceGP` on table `Equipment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `sellPriceGP` on table `Item` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `Equipment` MODIFY `sellPriceGP` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `Item` MODIFY `sellPriceGP` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `StatEffect` DROP COLUMN `doubleResourceOddsEffect`,
    DROP COLUMN `skillIntervalReduction`,
    DROP COLUMN `skillIntervalReductionEffect`,
    ADD COLUMN `skillIntervalReductionMultiplier` DECIMAL(65, 30) NULL,
    MODIFY `str_effect` ENUM('add', 'mul') NULL,
    MODIFY `def_effect` ENUM('add', 'mul') NULL,
    MODIFY `dex_effect` ENUM('add', 'mul') NULL,
    MODIFY `magic_effect` ENUM('add', 'mul') NULL,
    MODIFY `hp_effect` ENUM('add', 'mul') NULL,
    MODIFY `max_hp_effect` ENUM('add', 'mul') NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `skillIntervalReduction`,
    ADD COLUMN `skillIntervalReductionMultiplier` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    MODIFY `doubleResourceOdds` DECIMAL(65, 30) NOT NULL DEFAULT 0.01;
