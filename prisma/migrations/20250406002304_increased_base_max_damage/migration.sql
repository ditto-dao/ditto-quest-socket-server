-- AlterTable
ALTER TABLE `Combat` MODIFY `max_magic_dmg` DOUBLE NOT NULL DEFAULT 30,
    MODIFY `max_melee_dmg` DOUBLE NOT NULL DEFAULT 30,
    MODIFY `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE `User` MODIFY `max_magic_dmg` DOUBLE NOT NULL DEFAULT 30,
    MODIFY `max_melee_dmg` DOUBLE NOT NULL DEFAULT 30,
    MODIFY `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 30;
