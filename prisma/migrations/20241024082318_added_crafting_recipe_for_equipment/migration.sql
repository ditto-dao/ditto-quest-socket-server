-- CreateTable
CREATE TABLE `CraftingRecipe` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NOT NULL,
    `durationS` INTEGER NOT NULL,

    UNIQUE INDEX `CraftingRecipe_equipmentId_key`(`equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CraftingRecipeItems` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipeId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `CraftingRecipeItems_recipeId_itemId_key`(`recipeId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CraftingRecipe` ADD CONSTRAINT `CraftingRecipe_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipeItems` ADD CONSTRAINT `CraftingRecipeItems_recipeId_fkey` FOREIGN KEY (`recipeId`) REFERENCES `CraftingRecipe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipeItems` ADD CONSTRAINT `CraftingRecipeItems_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`itemId`) ON DELETE RESTRICT ON UPDATE CASCADE;
