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
    `hatInventoryId` INTEGER NULL,
    `armourInventoryId` INTEGER NULL,
    `weaponInventoryId` INTEGER NULL,
    `shieldInventoryId` INTEGER NULL,
    `capeInventoryId` INTEGER NULL,
    `necklaceInventoryId` INTEGER NULL,
    `petInventoryId` INTEGER NULL,
    `spellbookInventoryId` INTEGER NULL,
    `equippedSlimeId` INTEGER NULL,

    UNIQUE INDEX `User_hatInventoryId_key`(`hatInventoryId`),
    UNIQUE INDEX `User_armourInventoryId_key`(`armourInventoryId`),
    UNIQUE INDEX `User_weaponInventoryId_key`(`weaponInventoryId`),
    UNIQUE INDEX `User_shieldInventoryId_key`(`shieldInventoryId`),
    UNIQUE INDEX `User_capeInventoryId_key`(`capeInventoryId`),
    UNIQUE INDEX `User_necklaceInventoryId_key`(`necklaceInventoryId`),
    UNIQUE INDEX `User_petInventoryId_key`(`petInventoryId`),
    UNIQUE INDEX `User_spellbookInventoryId_key`(`spellbookInventoryId`),
    UNIQUE INDEX `User_equippedSlimeId_key`(`equippedSlimeId`),
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
CREATE TABLE `Slime` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` INTEGER NOT NULL,
    `generation` INTEGER NOT NULL,
    `Aura_D` INTEGER NOT NULL,
    `Aura_H1` INTEGER NOT NULL,
    `Aura_H2` INTEGER NOT NULL,
    `Aura_H3` INTEGER NOT NULL,
    `Body_D` INTEGER NOT NULL,
    `Body_H1` INTEGER NOT NULL,
    `Body_H2` INTEGER NOT NULL,
    `Body_H3` INTEGER NOT NULL,
    `Core_D` INTEGER NOT NULL,
    `Core_H1` INTEGER NOT NULL,
    `Core_H2` INTEGER NOT NULL,
    `Core_H3` INTEGER NOT NULL,
    `Headpiece_D` INTEGER NOT NULL,
    `Headpiece_H1` INTEGER NOT NULL,
    `Headpiece_H2` INTEGER NOT NULL,
    `Headpiece_H3` INTEGER NOT NULL,
    `Tail_D` INTEGER NOT NULL,
    `Tail_H1` INTEGER NOT NULL,
    `Tail_H2` INTEGER NOT NULL,
    `Tail_H3` INTEGER NOT NULL,
    `Arms_D` INTEGER NOT NULL,
    `Arms_H1` INTEGER NOT NULL,
    `Arms_H2` INTEGER NOT NULL,
    `Arms_H3` INTEGER NOT NULL,
    `Eyes_D` INTEGER NOT NULL,
    `Eyes_H1` INTEGER NOT NULL,
    `Eyes_H2` INTEGER NOT NULL,
    `Eyes_H3` INTEGER NOT NULL,
    `Mouth_D` INTEGER NOT NULL,
    `Mouth_H1` INTEGER NOT NULL,
    `Mouth_H2` INTEGER NOT NULL,
    `Mouth_H3` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SlimeTrait` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('Aura', 'Body', 'Core', 'Headpiece', 'Tail', 'Arms', 'Eyes', 'Mouth') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `pairId` INTEGER NULL,
    `mutationId` INTEGER NULL,
    `str` INTEGER NOT NULL DEFAULT 0,
    `def` INTEGER NOT NULL DEFAULT 0,
    `dex` INTEGER NOT NULL DEFAULT 0,
    `magic` INTEGER NOT NULL DEFAULT 0,
    `hp` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `imgsrc` VARCHAR(191) NOT NULL,
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
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `imgsrc` VARCHAR(191) NOT NULL,
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `consumableId` INTEGER NULL,
    `farmingDurationS` INTEGER NULL,

    UNIQUE INDEX `Item_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inventory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Inventory_userId_order_idx`(`userId`, `order`),
    UNIQUE INDEX `Inventory_userId_itemId_equipmentId_key`(`userId`, `itemId`, `equipmentId`),
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
ALTER TABLE `User` ADD CONSTRAINT `User_hatInventoryId_fkey` FOREIGN KEY (`hatInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_armourInventoryId_fkey` FOREIGN KEY (`armourInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_weaponInventoryId_fkey` FOREIGN KEY (`weaponInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_shieldInventoryId_fkey` FOREIGN KEY (`shieldInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_capeInventoryId_fkey` FOREIGN KEY (`capeInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_necklaceInventoryId_fkey` FOREIGN KEY (`necklaceInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_petInventoryId_fkey` FOREIGN KEY (`petInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_spellbookInventoryId_fkey` FOREIGN KEY (`spellbookInventoryId`) REFERENCES `Inventory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_equippedSlimeId_fkey` FOREIGN KEY (`equippedSlimeId`) REFERENCES `Slime`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Combat` ADD CONSTRAINT `Combat_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Aura_D_fkey` FOREIGN KEY (`Aura_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Aura_H1_fkey` FOREIGN KEY (`Aura_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Aura_H2_fkey` FOREIGN KEY (`Aura_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Aura_H3_fkey` FOREIGN KEY (`Aura_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_D_fkey` FOREIGN KEY (`Body_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_H1_fkey` FOREIGN KEY (`Body_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_H2_fkey` FOREIGN KEY (`Body_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_H3_fkey` FOREIGN KEY (`Body_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Core_D_fkey` FOREIGN KEY (`Core_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Core_H1_fkey` FOREIGN KEY (`Core_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Core_H2_fkey` FOREIGN KEY (`Core_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Core_H3_fkey` FOREIGN KEY (`Core_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Headpiece_D_fkey` FOREIGN KEY (`Headpiece_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Headpiece_H1_fkey` FOREIGN KEY (`Headpiece_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Headpiece_H2_fkey` FOREIGN KEY (`Headpiece_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Headpiece_H3_fkey` FOREIGN KEY (`Headpiece_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Tail_D_fkey` FOREIGN KEY (`Tail_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Tail_H1_fkey` FOREIGN KEY (`Tail_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Tail_H2_fkey` FOREIGN KEY (`Tail_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Tail_H3_fkey` FOREIGN KEY (`Tail_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Arms_D_fkey` FOREIGN KEY (`Arms_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Arms_H1_fkey` FOREIGN KEY (`Arms_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Arms_H2_fkey` FOREIGN KEY (`Arms_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Arms_H3_fkey` FOREIGN KEY (`Arms_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Eyes_D_fkey` FOREIGN KEY (`Eyes_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Eyes_H1_fkey` FOREIGN KEY (`Eyes_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Eyes_H2_fkey` FOREIGN KEY (`Eyes_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Eyes_H3_fkey` FOREIGN KEY (`Eyes_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_D_fkey` FOREIGN KEY (`Mouth_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_H1_fkey` FOREIGN KEY (`Mouth_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_H2_fkey` FOREIGN KEY (`Mouth_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_H3_fkey` FOREIGN KEY (`Mouth_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_pairId_fkey` FOREIGN KEY (`pairId`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_mutationId_fkey` FOREIGN KEY (`mutationId`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_consumableId_fkey` FOREIGN KEY (`consumableId`) REFERENCES `Consumable`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipe` ADD CONSTRAINT `CraftingRecipe_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipeItems` ADD CONSTRAINT `CraftingRecipeItems_recipeId_fkey` FOREIGN KEY (`recipeId`) REFERENCES `CraftingRecipe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingRecipeItems` ADD CONSTRAINT `CraftingRecipeItems_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
