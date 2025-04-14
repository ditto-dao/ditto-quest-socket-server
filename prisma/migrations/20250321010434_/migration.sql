/*
  Warnings:

  - The values [Range] on the enum `Equipment_attackType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Range] on the enum `Equipment_attackType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Combat` MODIFY `attackType` ENUM('Melee', 'Ranged', 'Magic') NOT NULL DEFAULT 'Melee';

-- AlterTable
ALTER TABLE `Equipment` MODIFY `attackType` ENUM('Melee', 'Ranged', 'Magic') NULL;
