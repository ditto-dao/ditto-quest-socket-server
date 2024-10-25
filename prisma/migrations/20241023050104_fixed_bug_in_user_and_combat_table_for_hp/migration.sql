/*
  Warnings:

  - You are about to drop the column `maxHp` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `max_hp` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Combat` DROP COLUMN `maxHp`,
    ADD COLUMN `hpLevel` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `max_hp`,
    ADD COLUMN `hp_level` INTEGER NOT NULL DEFAULT 1,
    MODIFY `exp_hp` INTEGER NOT NULL DEFAULT 0;
