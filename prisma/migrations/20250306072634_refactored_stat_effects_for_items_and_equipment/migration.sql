/*
  Warnings:

  - You are about to drop the column `hpLevel` on the `Combat` table. All the data in the column will be lost.
  - You are about to alter the column `str` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,30)`.
  - You are about to alter the column `def` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,30)`.
  - You are about to alter the column `dex` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,30)`.
  - You are about to alter the column `magic` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,30)`.
  - You are about to alter the column `hp` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,30)`.
  - You are about to drop the column `def` on the `Equipment` table. All the data in the column will be lost.
  - You are about to drop the column `dex` on the `Equipment` table. All the data in the column will be lost.
  - You are about to drop the column `hp` on the `Equipment` table. All the data in the column will be lost.
  - You are about to drop the column `magic` on the `Equipment` table. All the data in the column will be lost.
  - You are about to drop the column `str` on the `Equipment` table. All the data in the column will be lost.
  - You are about to drop the column `consumableId` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `def` on the `SlimeTrait` table. All the data in the column will be lost.
  - You are about to drop the column `dex` on the `SlimeTrait` table. All the data in the column will be lost.
  - You are about to drop the column `hp` on the `SlimeTrait` table. All the data in the column will be lost.
  - You are about to drop the column `magic` on the `SlimeTrait` table. All the data in the column will be lost.
  - You are about to drop the column `str` on the `SlimeTrait` table. All the data in the column will be lost.
  - You are about to drop the `Consumable` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `Item` DROP FOREIGN KEY `Item_consumableId_fkey`;

-- AlterTable
ALTER TABLE `Combat` DROP COLUMN `hpLevel`,
    MODIFY `str` DECIMAL(65, 30) NOT NULL DEFAULT 1,
    MODIFY `def` DECIMAL(65, 30) NOT NULL DEFAULT 1,
    MODIFY `dex` DECIMAL(65, 30) NOT NULL DEFAULT 1,
    MODIFY `magic` DECIMAL(65, 30) NOT NULL DEFAULT 1,
    MODIFY `hp` DECIMAL(65, 30) NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE `Equipment` DROP COLUMN `def`,
    DROP COLUMN `dex`,
    DROP COLUMN `hp`,
    DROP COLUMN `magic`,
    DROP COLUMN `str`,
    ADD COLUMN `statEffectId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Item` DROP COLUMN `consumableId`,
    ADD COLUMN `statEffectId` INTEGER NULL;

-- AlterTable
ALTER TABLE `SlimeTrait` DROP COLUMN `def`,
    DROP COLUMN `dex`,
    DROP COLUMN `hp`,
    DROP COLUMN `magic`,
    DROP COLUMN `str`,
    ADD COLUMN `statEffectId` INTEGER NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `doubleResourceOdds` DECIMAL(65, 30) NOT NULL DEFAULT 0,
    ADD COLUMN `skillIntervalReduction` DECIMAL(65, 30) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `Consumable`;

-- CreateTable
CREATE TABLE `StatEffect` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `str` DECIMAL(65, 30) NULL,
    `str_effect` ENUM('plus', 'times') NULL,
    `def` DECIMAL(65, 30) NULL,
    `def_effect` ENUM('plus', 'times') NULL,
    `dex` DECIMAL(65, 30) NULL,
    `dex_effect` ENUM('plus', 'times') NULL,
    `magic` DECIMAL(65, 30) NULL,
    `magic_effect` ENUM('plus', 'times') NULL,
    `hp` DECIMAL(65, 30) NULL,
    `hp_effect` ENUM('plus', 'times') NULL,
    `max_hp` DECIMAL(65, 30) NULL,
    `max_hp_effect` ENUM('plus', 'times') NULL,
    `doubleResourceOdds` DECIMAL(65, 30) NULL,
    `doubleResourceOddsEffect` ENUM('plus', 'times') NULL,
    `skillIntervalReduction` DECIMAL(65, 30) NULL,
    `skillIntervalReductionEffect` ENUM('plus', 'times') NULL,
    `durationS` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_statEffectId_fkey` FOREIGN KEY (`statEffectId`) REFERENCES `StatEffect`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Equipment` ADD CONSTRAINT `Equipment_statEffectId_fkey` FOREIGN KEY (`statEffectId`) REFERENCES `StatEffect`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_statEffectId_fkey` FOREIGN KEY (`statEffectId`) REFERENCES `StatEffect`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
