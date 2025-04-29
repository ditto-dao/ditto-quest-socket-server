-- CreateTable
CREATE TABLE `UserDeviceFingerprint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserDeviceFingerprint_fingerprint_idx`(`fingerprint`),
    INDEX `UserDeviceFingerprint_ipAddress_idx`(`ipAddress`),
    INDEX `UserDeviceFingerprint_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserDeviceFingerprint` ADD CONSTRAINT `UserDeviceFingerprint_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;
