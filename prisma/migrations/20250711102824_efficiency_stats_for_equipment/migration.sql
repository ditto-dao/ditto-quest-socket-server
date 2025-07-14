/*
  Warnings:

  - You are about to drop the column `double_resource_odds_mod` on the `StatEffect` table. All the data in the column will be lost.
  - You are about to drop the column `skill_interval_reduction_multiplier_mod` on the `StatEffect` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `StatEffect` DROP COLUMN `double_resource_odds_mod`,
    DROP COLUMN `skill_interval_reduction_multiplier_mod`,
    ADD COLUMN `efficiency_double_combat_exp_mod` DOUBLE NULL,
    ADD COLUMN `efficiency_double_resource_mod` DOUBLE NULL,
    ADD COLUMN `efficiency_double_skill_exp_mod` DOUBLE NULL,
    ADD COLUMN `efficiency_flat_combat_exp_mod` DOUBLE NULL,
    ADD COLUMN `efficiency_flat_skill_exp_mod` DOUBLE NULL,
    ADD COLUMN `efficiency_skill_interval_mod` DOUBLE NULL;
