/*
  Warnings:

  - You are about to drop the column `mutationId` on the `SlimeTrait` table. All the data in the column will be lost.
  - You are about to drop the column `pairId` on the `SlimeTrait` table. All the data in the column will be lost.
  - The values [Aura,Core,Headpiece,Tail,Arms,Eyes] on the enum `SlimeTrait_type` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `imageUri` to the `Slime` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `SlimeTrait` DROP FOREIGN KEY `SlimeTrait_mutationId_fkey`;

-- DropForeignKey
ALTER TABLE `SlimeTrait` DROP FOREIGN KEY `SlimeTrait_pairId_fkey`;

-- AlterTable
ALTER TABLE `Slime` ADD COLUMN `imageUri` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `SlimeTrait` DROP COLUMN `mutationId`,
    DROP COLUMN `pairId`,
    ADD COLUMN `mutation0Id` INTEGER NULL,
    ADD COLUMN `mutation1Id` INTEGER NULL,
    ADD COLUMN `pair0Id` INTEGER NULL,
    ADD COLUMN `pair1Id` INTEGER NULL,
    MODIFY `type` ENUM('Body', 'Pattern', 'PrimaryColour', 'Accent', 'Detail', 'EyeColour', 'EyeShape', 'Mouth') NOT NULL;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_pair0Id_fkey` FOREIGN KEY (`pair0Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_mutation0Id_fkey` FOREIGN KEY (`mutation0Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_pair1Id_fkey` FOREIGN KEY (`pair1Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_mutation1Id_fkey` FOREIGN KEY (`mutation1Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
