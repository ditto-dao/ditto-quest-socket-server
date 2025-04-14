-- AlterTable
ALTER TABLE `Combat` ADD COLUMN `attackType` ENUM('Melee', 'Range', 'Magic') NOT NULL DEFAULT 'Melee';

-- AlterTable
ALTER TABLE `Equipment` ADD COLUMN `attackType` ENUM('Melee', 'Range', 'Magic') NULL;
