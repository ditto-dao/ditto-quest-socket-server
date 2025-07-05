-- AlterTable
ALTER TABLE `CombatActivityLog` ADD COLUMN `quantity` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX `CombatActivityLog_userId_monsterId_idx` ON `CombatActivityLog`(`userId`, `monsterId`);
