-- CreateTable
CREATE TABLE `User` (
    `telegramId` INTEGER NOT NULL,
    `username` VARCHAR(191) NULL,
    `goldBalance` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 1,
    `exp_to_next_level` INTEGER NOT NULL DEFAULT 42,
    `exp` INTEGER NOT NULL DEFAULT 0,
    `str` INTEGER NOT NULL DEFAULT 1,
    `def` INTEGER NOT NULL DEFAULT 1,
    `dex` INTEGER NOT NULL DEFAULT 1,
    `magic` INTEGER NOT NULL DEFAULT 1,
    `hp_level` INTEGER NOT NULL DEFAULT 1,
    `exp_hp` INTEGER NOT NULL DEFAULT 0,
    `exp_to_next_hp_level` INTEGER NOT NULL DEFAULT 42,
    `outstanding_skill_points` INTEGER NOT NULL DEFAULT 0,
    `hatId` INTEGER NULL,
    `armourId` INTEGER NULL,
    `weaponId` INTEGER NULL,
    `shieldId` INTEGER NULL,
    `capeId` INTEGER NULL,
    `necklaceId` INTEGER NULL,
    `petId` INTEGER NULL,
    `spellbookId` INTEGER NULL,

    UNIQUE INDEX `User_hatId_key`(`hatId`),
    UNIQUE INDEX `User_armourId_key`(`armourId`),
    UNIQUE INDEX `User_weaponId_key`(`weaponId`),
    UNIQUE INDEX `User_shieldId_key`(`shieldId`),
    UNIQUE INDEX `User_capeId_key`(`capeId`),
    UNIQUE INDEX `User_necklaceId_key`(`necklaceId`),
    UNIQUE INDEX `User_petId_key`(`petId`),
    UNIQUE INDEX `User_spellbookId_key`(`spellbookId`),
    PRIMARY KEY (`telegramId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Combat` (
    `userId` INTEGER NOT NULL,
    `str` INTEGER NOT NULL DEFAULT 1,
    `def` INTEGER NOT NULL DEFAULT 1,
    `dex` INTEGER NOT NULL DEFAULT 1,
    `magic` INTEGER NOT NULL DEFAULT 1,
    `hp` INTEGER NOT NULL DEFAULT 10,
    `hpLevel` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `str` INTEGER NOT NULL DEFAULT 0,
    `def` INTEGER NOT NULL DEFAULT 0,
    `dex` INTEGER NOT NULL DEFAULT 0,
    `magic` INTEGER NOT NULL DEFAULT 0,
    `hp` INTEGER NOT NULL DEFAULT 0,
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `type` ENUM('hat', 'armour', 'weapon', 'shield', 'cape', 'necklace', 'pet', 'spellbook') NOT NULL,

    UNIQUE INDEX `Equipment_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Item` (
    `itemId` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `consumableId` INTEGER NULL,

    UNIQUE INDEX `Item_name_key`(`name`),
    PRIMARY KEY (`itemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EquipmentInventory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ItemInventory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `itemId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    UNIQUE INDEX `ItemInventory_userId_itemId_key`(`userId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Consumable` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `str` INTEGER NULL,
    `str_effect` ENUM('plus', 'times') NULL,
    `def` INTEGER NULL,
    `def_effect` ENUM('plus', 'times') NULL,
    `dex` INTEGER NULL,
    `dex_effect` ENUM('plus', 'times') NULL,
    `magic` INTEGER NULL,
    `magic_effect` ENUM('plus', 'times') NULL,
    `hp` INTEGER NULL,
    `hp_effect` ENUM('plus', 'times') NULL,
    `max_hp` INTEGER NULL,
    `max_hp_effect` ENUM('plus', 'times') NULL,
    `durationS` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
ALTER TABLE `User` ADD CONSTRAINT `User_hatId_fkey` FOREIGN KEY (`hatId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_armourId_fkey` FOREIGN KEY (`armourId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_weaponId_fkey` FOREIGN KEY (`weaponId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_shieldId_fkey` FOREIGN KEY (`shieldId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_capeId_fkey` FOREIGN KEY (`capeId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_necklaceId_fkey` FOREIGN KEY (`necklaceId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_petId_fkey` FOREIGN KEY (`petId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_spellbookId_fkey` FOREIGN KEY (`spellbookId`) REFERENCES `EquipmentInventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Combat` ADD CONSTRAINT `Combat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_consumableId_fkey` FOREIGN KEY (`consumableId`) REFERENCES `Consumable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentInventory` ADD CONSTRAINT `EquipmentInventory_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EquipmentInventory` ADD CONSTRAINT `EquipmentInventory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemInventory` ADD CONSTRAINT `ItemInventory_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`itemId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ItemInventory` ADD CONSTRAINT `ItemInventory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipe` ADD CONSTRAINT `CraftingRecipe_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipeItems` ADD CONSTRAINT `CraftingRecipeItems_recipeId_fkey` FOREIGN KEY (`recipeId`) REFERENCES `CraftingRecipe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipeItems` ADD CONSTRAINT `CraftingRecipeItems_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`itemId`) ON DELETE RESTRICT ON UPDATE CASCADE;
