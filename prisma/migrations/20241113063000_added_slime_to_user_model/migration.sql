/*
  Warnings:

  - A unique constraint covering the columns `[equippedSlimeId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `equippedSlimeId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_equippedSlimeId_key` ON `User`(`equippedSlimeId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_equippedSlimeId_fkey` FOREIGN KEY (`equippedSlimeId`) REFERENCES `Slime`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
