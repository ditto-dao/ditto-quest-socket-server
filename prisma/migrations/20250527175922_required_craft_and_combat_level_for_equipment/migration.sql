/*
  Warnings:

  - You are about to drop the column `requiredLvl` on the `Equipment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Equipment` DROP COLUMN `requiredLvl`,
    ADD COLUMN `requiredLvlCombat` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `requiredLvlCraft` INTEGER NOT NULL DEFAULT 1;
