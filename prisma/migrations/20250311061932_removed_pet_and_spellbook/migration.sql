/*
  Warnings:

  - The values [pet,spellbook] on the enum `Equipment_type` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `petInventoryId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `spellbookInventoryId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_petInventoryId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_spellbookInventoryId_fkey`;

-- DropIndex
DROP INDEX `User_petInventoryId_key` ON `User`;

-- DropIndex
DROP INDEX `User_spellbookInventoryId_key` ON `User`;

-- AlterTable
ALTER TABLE `Equipment` MODIFY `type` ENUM('hat', 'armour', 'weapon', 'shield', 'cape', 'necklace') NOT NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `petInventoryId`,
    DROP COLUMN `spellbookInventoryId`;
