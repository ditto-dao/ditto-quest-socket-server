/*
  Warnings:

  - You are about to drop the `_EquipmentToMonster` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_ItemToMonster` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `_EquipmentToMonster` DROP FOREIGN KEY `_EquipmentToMonster_A_fkey`;

-- DropForeignKey
ALTER TABLE `_EquipmentToMonster` DROP FOREIGN KEY `_EquipmentToMonster_B_fkey`;

-- DropForeignKey
ALTER TABLE `_ItemToMonster` DROP FOREIGN KEY `_ItemToMonster_A_fkey`;

-- DropForeignKey
ALTER TABLE `_ItemToMonster` DROP FOREIGN KEY `_ItemToMonster_B_fkey`;

-- AlterTable
ALTER TABLE `Monster` ADD COLUMN `minGoldDrop` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `StatEffect` ADD COLUMN `magic_factor` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `melee_factor` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `range_factor` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `reinforce_air` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `reinforce_earth` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `reinforce_fire` DOUBLE NULL DEFAULT 0,
    ADD COLUMN `reinforce_water` DOUBLE NULL DEFAULT 0;

-- DropTable
DROP TABLE `_EquipmentToMonster`;

-- DropTable
DROP TABLE `_ItemToMonster`;

-- CreateTable
CREATE TABLE `MonsterDrop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `monsterId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `dropRate` DOUBLE NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `MonsterDrop_monsterId_itemId_equipmentId_key`(`monsterId`, `itemId`, `equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MonsterDrop` ADD CONSTRAINT `MonsterDrop_monsterId_fkey` FOREIGN KEY (`monsterId`) REFERENCES `Monster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonsterDrop` ADD CONSTRAINT `MonsterDrop_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonsterDrop` ADD CONSTRAINT `MonsterDrop_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
