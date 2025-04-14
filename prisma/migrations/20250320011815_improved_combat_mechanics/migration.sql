/*
  Warnings:

  - Added the required column `exp` to the `Monster` table without a default value. This is not possible if the table is not empty.
  - Made the column `combatId` on table `Monster` required. This step will fail if there are existing NULL values in that column.
  - Made the column `combatId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `Monster` DROP FOREIGN KEY `Monster_combatId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_combatId_fkey`;

-- AlterTable
ALTER TABLE `Monster` ADD COLUMN `def` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `dex` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `exp` INTEGER NOT NULL,
    ADD COLUMN `hp_level` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `level` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `luk` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `magic` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `maxGoldDrop` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `str` INTEGER NOT NULL DEFAULT 1,
    MODIFY `combatId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `combatId` INTEGER NOT NULL,
    MODIFY `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.290,
    MODIFY `hp_regen_amount` DOUBLE NOT NULL DEFAULT 10.8,
    MODIFY `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE `_EquipmentToMonster` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_EquipmentToMonster_AB_unique`(`A`, `B`),
    INDEX `_EquipmentToMonster_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ItemToMonster` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ItemToMonster_AB_unique`(`A`, `B`),
    INDEX `_ItemToMonster_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_MonsterStatEffects` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_MonsterStatEffects_AB_unique`(`A`, `B`),
    INDEX `_MonsterStatEffects_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_combatId_fkey` FOREIGN KEY (`combatId`) REFERENCES `Combat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Monster` ADD CONSTRAINT `Monster_combatId_fkey` FOREIGN KEY (`combatId`) REFERENCES `Combat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EquipmentToMonster` ADD CONSTRAINT `_EquipmentToMonster_A_fkey` FOREIGN KEY (`A`) REFERENCES `Equipment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EquipmentToMonster` ADD CONSTRAINT `_EquipmentToMonster_B_fkey` FOREIGN KEY (`B`) REFERENCES `Monster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ItemToMonster` ADD CONSTRAINT `_ItemToMonster_A_fkey` FOREIGN KEY (`A`) REFERENCES `Item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ItemToMonster` ADD CONSTRAINT `_ItemToMonster_B_fkey` FOREIGN KEY (`B`) REFERENCES `Monster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MonsterStatEffects` ADD CONSTRAINT `_MonsterStatEffects_A_fkey` FOREIGN KEY (`A`) REFERENCES `Monster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MonsterStatEffects` ADD CONSTRAINT `_MonsterStatEffects_B_fkey` FOREIGN KEY (`B`) REFERENCES `StatEffect`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
