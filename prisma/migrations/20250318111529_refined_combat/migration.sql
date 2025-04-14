/*
  Warnings:

  - The primary key for the `Combat` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `def` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `dex` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `magic` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `maxHp` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `str` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `Combat` table. All the data in the column will be lost.
  - You are about to drop the column `def` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `def_effect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `dex` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `dex_effect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `doubleResourceOdds` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `hp` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `hp_effect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `magic` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `magic_effect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `max_hp` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `max_hp_effect` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `skillIntervalReductionMultiplier` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `str` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `str_effect` on the `StatEffect` table. All the data in the column will be lost.
  - Added the required column `id` to the `Combat` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Combat` DROP FOREIGN KEY `Combat_userId_fkey`;

-- AlterTable
ALTER TABLE `Combat` DROP PRIMARY KEY,
    DROP COLUMN `def`,
    DROP COLUMN `dex`,
    DROP COLUMN `magic`,
    DROP COLUMN `maxHp`,
    DROP COLUMN `str`,
    DROP COLUMN `userId`,
    ADD COLUMN `acc` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `atk_spd` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `crit_chance` DOUBLE NOT NULL DEFAULT 0.006623,
    ADD COLUMN `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.408,
    ADD COLUMN `dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `eva` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `hp_regen_amount` DOUBLE NOT NULL DEFAULT 5.7,
    ADD COLUMN `hp_regen_rate` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD COLUMN `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 15,
    ADD COLUMN `magic_factor` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `max_hp` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `max_magic_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `max_melee_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `melee_factor` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `range_factor` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `reinforce_air` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `reinforce_earth` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `reinforce_fire` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `reinforce_water` DOUBLE NOT NULL DEFAULT 0,
    MODIFY `hp` DOUBLE NOT NULL DEFAULT 100,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `Equipment` ADD COLUMN `requiredLvl` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `StatEffect` DROP COLUMN `def`,
    DROP COLUMN `def_effect`,
    DROP COLUMN `dex`,
    DROP COLUMN `dex_effect`,
    DROP COLUMN `doubleResourceOdds`,
    DROP COLUMN `hp`,
    DROP COLUMN `hp_effect`,
    DROP COLUMN `magic`,
    DROP COLUMN `magic_effect`,
    DROP COLUMN `max_hp`,
    DROP COLUMN `max_hp_effect`,
    DROP COLUMN `skillIntervalReductionMultiplier`,
    DROP COLUMN `str`,
    DROP COLUMN `str_effect`,
    ADD COLUMN `accEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `acc_mod` DOUBLE NULL,
    ADD COLUMN `atkSpdEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `atk_spd_mod` DOUBLE NULL,
    ADD COLUMN `critChanceEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `critMultiplierEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `crit_chance_mod` DOUBLE NULL,
    ADD COLUMN `crit_multiplier_mod` DOUBLE NULL,
    ADD COLUMN `dmgReductionEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `dmg_reduction_mod` DOUBLE NULL,
    ADD COLUMN `doubleResourceOddsEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `double_resource_odds_mod` DOUBLE NULL,
    ADD COLUMN `evaEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `eva_mod` DOUBLE NULL,
    ADD COLUMN `hpRegenAmountEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `hpRegenRateEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `hp_regen_amount_mod` DOUBLE NULL,
    ADD COLUMN `hp_regen_rate_mod` DOUBLE NULL,
    ADD COLUMN `magicDmgReductionEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `magic_dmg_reduction_mod` DOUBLE NULL,
    ADD COLUMN `maxHpEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `maxMagicDmgEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `maxMeleeDmgEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `maxRangedDmgEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `max_hp_mod` DOUBLE NULL,
    ADD COLUMN `max_magic_dmg_mod` DOUBLE NULL,
    ADD COLUMN `max_melee_dmg_mod` DOUBLE NULL,
    ADD COLUMN `max_ranged_dmg_mod` DOUBLE NULL,
    ADD COLUMN `skillIntervalReductionMultiplierEffect` ENUM('add', 'mul') NULL,
    ADD COLUMN `skill_interval_reduction_multiplier_mod` DOUBLE NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `acc` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `atk_spd` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `combatId` INTEGER NULL,
    ADD COLUMN `crit_chance` DOUBLE NOT NULL DEFAULT 0.006623,
    ADD COLUMN `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.408,
    ADD COLUMN `dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    ADD COLUMN `eva` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `hp_regen_amount` DOUBLE NOT NULL DEFAULT 5.7,
    ADD COLUMN `hp_regen_rate` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `luk` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 15,
    ADD COLUMN `max_hp` DOUBLE NOT NULL DEFAULT 100,
    ADD COLUMN `max_magic_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `max_melee_dmg` DOUBLE NOT NULL DEFAULT 20,
    ADD COLUMN `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 20,
    MODIFY `exp_to_next_level` INTEGER NOT NULL DEFAULT 570,
    MODIFY `skillIntervalReductionMultiplier` DOUBLE NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `Monster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `imgsrc` VARCHAR(191) NOT NULL,
    `combatId` INTEGER NULL,

    UNIQUE INDEX `Monster_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_combatId_fkey` FOREIGN KEY (`combatId`) REFERENCES `Combat`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Monster` ADD CONSTRAINT `Monster_combatId_fkey` FOREIGN KEY (`combatId`) REFERENCES `Combat`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
