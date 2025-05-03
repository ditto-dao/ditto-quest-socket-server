-- CreateTable
CREATE TABLE `ReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReferralLink_code_key`(`code`),
    UNIQUE INDEX `ReferralLink_ownerId_key`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralRelation` (
    `id` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReferralRelation_refereeId_key`(`refereeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralEventLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `oldReferrerId` VARCHAR(191) NULL,
    `newReferrerId` VARCHAR(191) NOT NULL,
    `eventType` ENUM('INITIAL', 'CHANGE') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralEarningLog` (
    `id` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `tier` INTEGER NOT NULL,
    `amountDittoWei` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReferralLink` ADD CONSTRAINT `ReferralLink_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`telegramId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralEarningLog` ADD CONSTRAINT `ReferralEarningLog_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralEarningLog` ADD CONSTRAINT `ReferralEarningLog_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;
