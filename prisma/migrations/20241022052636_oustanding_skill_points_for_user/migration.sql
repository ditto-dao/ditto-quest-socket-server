/*
  Warnings:

  - You are about to drop the column `outstandingSkillPoints` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `User` DROP COLUMN `outstandingSkillPoints`,
    ADD COLUMN `outstanding_skill_points` INTEGER NOT NULL DEFAULT 0;
