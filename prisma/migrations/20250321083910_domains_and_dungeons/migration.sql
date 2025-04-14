-- CreateTable
CREATE TABLE `Dungeon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `imgsrc` VARCHAR(191) NOT NULL,
    `monsterGrowthFactor` DOUBLE NOT NULL DEFAULT 1.05,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `entryPriceGP` INTEGER NULL,
    `entryPriceDittoWei` DECIMAL(65, 0) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Dungeon_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DungeonMonsterSequence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dungeonId` INTEGER NOT NULL,
    `monsterId` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DungeonMonsterSequence_dungeonId_order_key`(`dungeonId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DungeonLeaderboard` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `dungeonId` INTEGER NOT NULL,
    `monstersKilled` INTEGER NOT NULL DEFAULT 0,
    `damageDealt` DOUBLE NOT NULL DEFAULT 0,
    `damageTaken` DOUBLE NOT NULL DEFAULT 0,
    `timeElapsedMs` INTEGER NOT NULL DEFAULT 0,
    `runDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `score` DOUBLE NOT NULL DEFAULT 0,

    INDEX `DungeonLeaderboard_dungeonId_score_idx`(`dungeonId`, `score`),
    INDEX `DungeonLeaderboard_userId_dungeonId_idx`(`userId`, `dungeonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DungeonMonsterSequence` ADD CONSTRAINT `DungeonMonsterSequence_dungeonId_fkey` FOREIGN KEY (`dungeonId`) REFERENCES `Dungeon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonMonsterSequence` ADD CONSTRAINT `DungeonMonsterSequence_monsterId_fkey` FOREIGN KEY (`monsterId`) REFERENCES `Monster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonLeaderboard` ADD CONSTRAINT `DungeonLeaderboard_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonLeaderboard` ADD CONSTRAINT `DungeonLeaderboard_dungeonId_fkey` FOREIGN KEY (`dungeonId`) REFERENCES `Dungeon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
