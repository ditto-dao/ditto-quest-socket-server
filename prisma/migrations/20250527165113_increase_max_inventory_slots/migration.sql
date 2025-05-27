-- AlterTable
ALTER TABLE `User` MODIFY `maxInventorySlots` INTEGER NOT NULL DEFAULT 40,
    MODIFY `maxSlimeInventorySlots` INTEGER NOT NULL DEFAULT 40;
