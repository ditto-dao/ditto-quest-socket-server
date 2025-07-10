-- AlterTable
ALTER TABLE `UserMission` ADD COLUMN `equipmentIds` JSON NULL,
    ADD COLUMN `itemIds` JSON NULL,
    ADD COLUMN `monsterIds` JSON NULL,
    ADD COLUMN `slimeRarities` JSON NULL;
