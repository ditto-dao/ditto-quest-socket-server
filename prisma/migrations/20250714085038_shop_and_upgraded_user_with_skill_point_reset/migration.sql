-- AlterTable
ALTER TABLE `User` ADD COLUMN `statResetPoints` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `ShopItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('EQUIPMENT', 'ITEM', 'SERVICE') NOT NULL,
    `equipmentId` INTEGER NULL,
    `itemId` INTEGER NULL,
    `serviceType` ENUM('STAT_RESET_POINT', 'INVENTORY_SLOT', 'SLIME_INVENTORY_SLOT') NULL,
    `serviceValue` INTEGER NULL,
    `priceGP` INTEGER NULL,
    `priceDittoWei` DECIMAL(65, 0) NULL,
    `priceStars` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ShopItem_isActive_idx`(`isActive`),
    INDEX `ShopItem_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
