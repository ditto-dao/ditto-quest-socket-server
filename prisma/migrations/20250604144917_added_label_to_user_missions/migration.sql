-- CreateTable
CREATE TABLE `UserMission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `telegramId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `type` ENUM('FARM', 'CRAFT', 'COMBAT', 'GACHA', 'BREED') NOT NULL,
    `itemId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `monsterId` INTEGER NULL,
    `slimeRarity` ENUM('S', 'A', 'B', 'C', 'D') NULL,
    `quantity` INTEGER NOT NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `rewardDitto` DECIMAL(65, 0) NULL,
    `imgsrc` VARCHAR(191) NULL,
    `round` INTEGER NOT NULL DEFAULT 0,
    `claimed` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
