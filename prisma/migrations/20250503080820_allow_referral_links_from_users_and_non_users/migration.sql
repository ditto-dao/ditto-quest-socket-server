/*
  Warnings:

  - You are about to drop the column `referrerId` on the `ReferralRelation` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `ReferralRelation` DROP FOREIGN KEY `ReferralRelation_referrerId_fkey`;

-- DropIndex
DROP INDEX `ReferralRelation_referrerId_fkey` ON `ReferralRelation`;

-- AlterTable
ALTER TABLE `ReferralRelation` DROP COLUMN `referrerId`,
    ADD COLUMN `referrerExternal` VARCHAR(191) NULL,
    ADD COLUMN `referrerUserId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_referrerUserId_fkey` FOREIGN KEY (`referrerUserId`) REFERENCES `User`(`telegramId`) ON DELETE SET NULL ON UPDATE CASCADE;
