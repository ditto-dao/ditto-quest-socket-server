/*
  Warnings:

  - Added the required column `craftingExp` to the `CraftingRecipe` table without a default value. This is not possible if the table is not empty.
  - Added the required column `craftingLevelRequired` to the `CraftingRecipe` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `CraftingRecipe` ADD COLUMN `craftingExp` INTEGER NOT NULL,
    ADD COLUMN `craftingLevelRequired` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `Item` ADD COLUMN `farmingExp` INTEGER NULL,
    ADD COLUMN `farmingLevelRequired` INTEGER NULL;
