/*
  Warnings:

  - You are about to drop the column `Arms_D` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Arms_H1` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Arms_H2` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Arms_H3` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Aura_D` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Aura_H1` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Aura_H2` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Aura_H3` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Core_D` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Core_H1` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Core_H2` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Core_H3` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Eyes_D` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Eyes_H1` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Eyes_H2` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Eyes_H3` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Headpiece_D` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Headpiece_H1` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Headpiece_H2` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Headpiece_H3` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Tail_D` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Tail_H1` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Tail_H2` on the `Slime` table. All the data in the column will be lost.
  - You are about to drop the column `Tail_H3` on the `Slime` table. All the data in the column will be lost.
  - Added the required column `Accent_D` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Accent_H1` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Accent_H2` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Accent_H3` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Detail_D` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Detail_H1` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Detail_H2` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Detail_H3` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeColour_D` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeColour_H1` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeColour_H2` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeColour_H3` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeShape_D` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeShape_H1` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeShape_H2` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `EyeShape_H3` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Pattern_D` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Pattern_H1` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Pattern_H2` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `Pattern_H3` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `PrimaryColour_D` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `PrimaryColour_H1` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `PrimaryColour_H2` to the `Slime` table without a default value. This is not possible if the table is not empty.
  - Added the required column `PrimaryColour_H3` to the `Slime` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Arms_D_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Arms_H1_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Arms_H2_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Arms_H3_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Aura_D_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Aura_H1_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Aura_H2_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Aura_H3_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Core_D_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Core_H1_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Core_H2_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Core_H3_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Eyes_D_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Eyes_H1_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Eyes_H2_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Eyes_H3_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Headpiece_D_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Headpiece_H1_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Headpiece_H2_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Headpiece_H3_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Tail_D_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Tail_H1_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Tail_H2_fkey`;

-- DropForeignKey
ALTER TABLE `Slime` DROP FOREIGN KEY `Slime_Tail_H3_fkey`;

-- AlterTable
ALTER TABLE `Slime` DROP COLUMN `Arms_D`,
    DROP COLUMN `Arms_H1`,
    DROP COLUMN `Arms_H2`,
    DROP COLUMN `Arms_H3`,
    DROP COLUMN `Aura_D`,
    DROP COLUMN `Aura_H1`,
    DROP COLUMN `Aura_H2`,
    DROP COLUMN `Aura_H3`,
    DROP COLUMN `Core_D`,
    DROP COLUMN `Core_H1`,
    DROP COLUMN `Core_H2`,
    DROP COLUMN `Core_H3`,
    DROP COLUMN `Eyes_D`,
    DROP COLUMN `Eyes_H1`,
    DROP COLUMN `Eyes_H2`,
    DROP COLUMN `Eyes_H3`,
    DROP COLUMN `Headpiece_D`,
    DROP COLUMN `Headpiece_H1`,
    DROP COLUMN `Headpiece_H2`,
    DROP COLUMN `Headpiece_H3`,
    DROP COLUMN `Tail_D`,
    DROP COLUMN `Tail_H1`,
    DROP COLUMN `Tail_H2`,
    DROP COLUMN `Tail_H3`,
    ADD COLUMN `Accent_D` INTEGER NOT NULL,
    ADD COLUMN `Accent_H1` INTEGER NOT NULL,
    ADD COLUMN `Accent_H2` INTEGER NOT NULL,
    ADD COLUMN `Accent_H3` INTEGER NOT NULL,
    ADD COLUMN `Detail_D` INTEGER NOT NULL,
    ADD COLUMN `Detail_H1` INTEGER NOT NULL,
    ADD COLUMN `Detail_H2` INTEGER NOT NULL,
    ADD COLUMN `Detail_H3` INTEGER NOT NULL,
    ADD COLUMN `EyeColour_D` INTEGER NOT NULL,
    ADD COLUMN `EyeColour_H1` INTEGER NOT NULL,
    ADD COLUMN `EyeColour_H2` INTEGER NOT NULL,
    ADD COLUMN `EyeColour_H3` INTEGER NOT NULL,
    ADD COLUMN `EyeShape_D` INTEGER NOT NULL,
    ADD COLUMN `EyeShape_H1` INTEGER NOT NULL,
    ADD COLUMN `EyeShape_H2` INTEGER NOT NULL,
    ADD COLUMN `EyeShape_H3` INTEGER NOT NULL,
    ADD COLUMN `Pattern_D` INTEGER NOT NULL,
    ADD COLUMN `Pattern_H1` INTEGER NOT NULL,
    ADD COLUMN `Pattern_H2` INTEGER NOT NULL,
    ADD COLUMN `Pattern_H3` INTEGER NOT NULL,
    ADD COLUMN `PrimaryColour_D` INTEGER NOT NULL,
    ADD COLUMN `PrimaryColour_H1` INTEGER NOT NULL,
    ADD COLUMN `PrimaryColour_H2` INTEGER NOT NULL,
    ADD COLUMN `PrimaryColour_H3` INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Pattern_D_fkey` FOREIGN KEY (`Pattern_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Pattern_H1_fkey` FOREIGN KEY (`Pattern_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Pattern_H2_fkey` FOREIGN KEY (`Pattern_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Pattern_H3_fkey` FOREIGN KEY (`Pattern_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_PrimaryColour_D_fkey` FOREIGN KEY (`PrimaryColour_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_PrimaryColour_H1_fkey` FOREIGN KEY (`PrimaryColour_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_PrimaryColour_H2_fkey` FOREIGN KEY (`PrimaryColour_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_PrimaryColour_H3_fkey` FOREIGN KEY (`PrimaryColour_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Accent_D_fkey` FOREIGN KEY (`Accent_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Accent_H1_fkey` FOREIGN KEY (`Accent_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Accent_H2_fkey` FOREIGN KEY (`Accent_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Accent_H3_fkey` FOREIGN KEY (`Accent_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Detail_D_fkey` FOREIGN KEY (`Detail_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Detail_H1_fkey` FOREIGN KEY (`Detail_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Detail_H2_fkey` FOREIGN KEY (`Detail_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Detail_H3_fkey` FOREIGN KEY (`Detail_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeColour_D_fkey` FOREIGN KEY (`EyeColour_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeColour_H1_fkey` FOREIGN KEY (`EyeColour_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeColour_H2_fkey` FOREIGN KEY (`EyeColour_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeColour_H3_fkey` FOREIGN KEY (`EyeColour_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeShape_D_fkey` FOREIGN KEY (`EyeShape_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeShape_H1_fkey` FOREIGN KEY (`EyeShape_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeShape_H2_fkey` FOREIGN KEY (`EyeShape_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_EyeShape_H3_fkey` FOREIGN KEY (`EyeShape_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
