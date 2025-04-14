-- AlterTable
ALTER TABLE `Monster` ADD COLUMN `acc` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `atk_spd` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `crit_chance` DOUBLE NOT NULL DEFAULT 0.006623,
    ADD COLUMN `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.290,
    ADD COLUMN `dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `eva` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `hp_regen_amount` DOUBLE NOT NULL DEFAULT 10.8,
    ADD COLUMN `hp_regen_rate` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `max_hp` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `max_magic_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `max_melee_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE `Domain` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `imgsrc` VARCHAR(191) NULL,
    `entryPriceGP` INTEGER NULL,
    `entryPriceDittoWei` DECIMAL(65, 0) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Domain_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomainMonster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `domainId` INTEGER NOT NULL,
    `monsterId` INTEGER NOT NULL,
    `spawnRate` DOUBLE NOT NULL,

    UNIQUE INDEX `DomainMonster_domainId_monsterId_key`(`domainId`, `monsterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DomainMonster` ADD CONSTRAINT `DomainMonster_domainId_fkey` FOREIGN KEY (`domainId`) REFERENCES `Domain`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomainMonster` ADD CONSTRAINT `DomainMonster_monsterId_fkey` FOREIGN KEY (`monsterId`) REFERENCES `Monster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
