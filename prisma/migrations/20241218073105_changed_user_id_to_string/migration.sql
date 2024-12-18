/*
  Warnings:

  - The primary key for the `Combat` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE `Combat` DROP FOREIGN KEY `Combat_userId_fkey`;

-- DropForeignKey
ALTER TABLE `Inventory` DROP FOREIGN KEY `Inventory_userId_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_ownerId_fkey`;

-- AlterTable
ALTER TABLE `Combat` DROP PRIMARY KEY,
    MODIFY `userId` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`userId`);

-- AlterTable
ALTER TABLE `Inventory` MODIFY `userId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Slime` MODIFY `ownerId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `User` DROP PRIMARY KEY,
    MODIFY `telegramId` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`telegramId`);

-- AddForeignKey
ALTER TABLE `Combat` ADD CONSTRAINT `Combat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;
