/*
  Warnings:

  - You are about to drop the column `hp` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX `User_telegramId_key` ON `User`;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `hp`;

-- CreateTable
CREATE TABLE `Combat` (
    `userId` INTEGER NOT NULL,
    `str` INTEGER NOT NULL DEFAULT 1,
    `def` INTEGER NOT NULL DEFAULT 1,
    `dex` INTEGER NOT NULL DEFAULT 1,
    `magic` INTEGER NOT NULL DEFAULT 1,
    `hp` INTEGER NOT NULL DEFAULT 10,
    `maxHp` INTEGER NOT NULL DEFAULT 10,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Combat` ADD CONSTRAINT `Combat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;
