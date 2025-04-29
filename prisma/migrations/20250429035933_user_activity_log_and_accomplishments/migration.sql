-- CreateTable
CREATE TABLE `FarmingActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `itemId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `FarmingActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CraftingActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `equipmentIdIn` INTEGER NOT NULL,
    `quantityIn` INTEGER NOT NULL,

    INDEX `CraftingActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CraftingConsumedItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `craftingActivityId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `CraftingConsumedItem_craftingActivityId_idx`(`craftingActivityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BreedingActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dameId` INTEGER NOT NULL,
    `dameGeneration` INTEGER NOT NULL,
    `dameRarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `sireId` INTEGER NOT NULL,
    `sireGeneration` INTEGER NOT NULL,
    `sireRarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `childId` INTEGER NOT NULL,
    `childGeneration` INTEGER NOT NULL,
    `childRarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,

    INDEX `BreedingActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CombatActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `monsterId` INTEGER NOT NULL,
    `expGained` INTEGER NOT NULL,

    INDEX `CombatActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CombatDrop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `combatActivityLogId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `CombatDrop_combatActivityLogId_idx`(`combatActivityLogId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Accomplishment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `maxUsers` INTEGER NULL,
    `requirements` JSON NOT NULL,

    INDEX `Accomplishment_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccomplishmentProgress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accomplishmentId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AccomplishmentProgress_accomplishmentId_userId_key`(`accomplishmentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FarmingActivityLog` ADD CONSTRAINT `FarmingActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingActivityLog` ADD CONSTRAINT `CraftingActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingConsumedItem` ADD CONSTRAINT `CraftingConsumedItem_craftingActivityId_fkey` FOREIGN KEY (`craftingActivityId`) REFERENCES `CraftingActivityLog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreedingActivityLog` ADD CONSTRAINT `BreedingActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CombatActivityLog` ADD CONSTRAINT `CombatActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CombatDrop` ADD CONSTRAINT `CombatDrop_combatActivityLogId_fkey` FOREIGN KEY (`combatActivityLogId`) REFERENCES `CombatActivityLog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentProgress` ADD CONSTRAINT `AccomplishmentProgress_accomplishmentId_fkey` FOREIGN KEY (`accomplishmentId`) REFERENCES `Accomplishment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentProgress` ADD CONSTRAINT `AccomplishmentProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;
