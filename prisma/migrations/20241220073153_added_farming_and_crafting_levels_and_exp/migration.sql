-- AlterTable
ALTER TABLE `User` ADD COLUMN `craftingExp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `exp_to_next_crafting_level` INTEGER NOT NULL DEFAULT 83,
    ADD COLUMN `exp_to_next_farming_level` INTEGER NOT NULL DEFAULT 83,
    ADD COLUMN `farmingExp` INTEGER NOT NULL DEFAULT 0,
    MODIFY `exp_to_next_level` INTEGER NOT NULL DEFAULT 83,
    MODIFY `exp_to_next_hp_level` INTEGER NOT NULL DEFAULT 83;
