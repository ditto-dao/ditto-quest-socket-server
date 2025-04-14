-- AlterTable
ALTER TABLE `User` MODIFY `exp_to_next_crafting_level` INTEGER NOT NULL DEFAULT 570,
    MODIFY `exp_to_next_farming_level` INTEGER NOT NULL DEFAULT 570;
