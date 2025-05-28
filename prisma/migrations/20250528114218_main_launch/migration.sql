-- CreateTable
CREATE TABLE `User` (
    `telegramId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `goldBalance` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 1,
    `exp_to_next_level` INTEGER NOT NULL DEFAULT 570,
    `exp` INTEGER NOT NULL DEFAULT 0,
    `str` INTEGER NOT NULL DEFAULT 1,
    `def` INTEGER NOT NULL DEFAULT 1,
    `dex` INTEGER NOT NULL DEFAULT 1,
    `luk` INTEGER NOT NULL DEFAULT 1,
    `magic` INTEGER NOT NULL DEFAULT 1,
    `hp_level` INTEGER NOT NULL DEFAULT 1,
    `exp_hp` INTEGER NOT NULL DEFAULT 0,
    `exp_to_next_hp_level` INTEGER NOT NULL DEFAULT 570,
    `outstanding_skill_points` INTEGER NOT NULL DEFAULT 0,
    `max_hp` DOUBLE NOT NULL DEFAULT 100,
    `atk_spd` DOUBLE NOT NULL DEFAULT 10,
    `acc` DOUBLE NOT NULL DEFAULT 100,
    `eva` DOUBLE NOT NULL DEFAULT 100,
    `max_melee_dmg` DOUBLE NOT NULL DEFAULT 30,
    `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 30,
    `max_magic_dmg` DOUBLE NOT NULL DEFAULT 30,
    `crit_chance` DOUBLE NOT NULL DEFAULT 0.00398,
    `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.290,
    `dmg_reduction` DOUBLE NOT NULL DEFAULT 15,
    `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    `hp_regen_rate` DOUBLE NOT NULL DEFAULT 20,
    `hp_regen_amount` DOUBLE NOT NULL DEFAULT 10.8,
    `last_battle_end_timestamp` DATETIME(3) NULL,
    `farmingLevel` INTEGER NOT NULL DEFAULT 1,
    `farmingExp` INTEGER NOT NULL DEFAULT 0,
    `exp_to_next_farming_level` INTEGER NOT NULL DEFAULT 570,
    `craftingLevel` INTEGER NOT NULL DEFAULT 1,
    `craftingExp` INTEGER NOT NULL DEFAULT 0,
    `exp_to_next_crafting_level` INTEGER NOT NULL DEFAULT 570,
    `doubleResourceOdds` DOUBLE NOT NULL DEFAULT 0.01,
    `skillIntervalReductionMultiplier` DOUBLE NOT NULL DEFAULT 1,
    `maxInventorySlots` INTEGER NOT NULL DEFAULT 40,
    `maxSlimeInventorySlots` INTEGER NOT NULL DEFAULT 40,
    `hatInventoryId` INTEGER NULL,
    `armourInventoryId` INTEGER NULL,
    `weaponInventoryId` INTEGER NULL,
    `shieldInventoryId` INTEGER NULL,
    `capeInventoryId` INTEGER NULL,
    `necklaceInventoryId` INTEGER NULL,
    `combatId` INTEGER NOT NULL,
    `equippedSlimeId` INTEGER NULL,

    UNIQUE INDEX `User_hatInventoryId_key`(`hatInventoryId`),
    UNIQUE INDEX `User_armourInventoryId_key`(`armourInventoryId`),
    UNIQUE INDEX `User_weaponInventoryId_key`(`weaponInventoryId`),
    UNIQUE INDEX `User_shieldInventoryId_key`(`shieldInventoryId`),
    UNIQUE INDEX `User_capeInventoryId_key`(`capeInventoryId`),
    UNIQUE INDEX `User_necklaceInventoryId_key`(`necklaceInventoryId`),
    UNIQUE INDEX `User_equippedSlimeId_key`(`equippedSlimeId`),
    PRIMARY KEY (`telegramId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Combat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `attackType` ENUM('Melee', 'Ranged', 'Magic') NOT NULL DEFAULT 'Melee',
    `cp` DECIMAL(65, 0) NOT NULL DEFAULT 699,
    `hp` DOUBLE NOT NULL DEFAULT 100,
    `max_hp` DOUBLE NOT NULL DEFAULT 100,
    `atk_spd` DOUBLE NOT NULL DEFAULT 10,
    `acc` DOUBLE NOT NULL DEFAULT 100,
    `eva` DOUBLE NOT NULL DEFAULT 100,
    `max_melee_dmg` DOUBLE NOT NULL DEFAULT 30,
    `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 30,
    `max_magic_dmg` DOUBLE NOT NULL DEFAULT 30,
    `crit_chance` DOUBLE NOT NULL DEFAULT 0.006623,
    `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.290,
    `dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    `hp_regen_rate` DOUBLE NOT NULL DEFAULT 20,
    `hp_regen_amount` DOUBLE NOT NULL DEFAULT 5.7,
    `melee_factor` DOUBLE NOT NULL DEFAULT 0,
    `range_factor` DOUBLE NOT NULL DEFAULT 0,
    `magic_factor` DOUBLE NOT NULL DEFAULT 0,
    `reinforce_air` DOUBLE NOT NULL DEFAULT 0,
    `reinforce_water` DOUBLE NOT NULL DEFAULT 0,
    `reinforce_earth` DOUBLE NOT NULL DEFAULT 0,
    `reinforce_fire` DOUBLE NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Slime` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ownerId` VARCHAR(191) NOT NULL,
    `generation` INTEGER NOT NULL,
    `imageUri` VARCHAR(191) NOT NULL,
    `Body_D` INTEGER NOT NULL,
    `Body_H1` INTEGER NOT NULL,
    `Body_H2` INTEGER NOT NULL,
    `Body_H3` INTEGER NOT NULL,
    `Pattern_D` INTEGER NOT NULL,
    `Pattern_H1` INTEGER NOT NULL,
    `Pattern_H2` INTEGER NOT NULL,
    `Pattern_H3` INTEGER NOT NULL,
    `PrimaryColour_D` INTEGER NOT NULL,
    `PrimaryColour_H1` INTEGER NOT NULL,
    `PrimaryColour_H2` INTEGER NOT NULL,
    `PrimaryColour_H3` INTEGER NOT NULL,
    `Accent_D` INTEGER NOT NULL,
    `Accent_H1` INTEGER NOT NULL,
    `Accent_H2` INTEGER NOT NULL,
    `Accent_H3` INTEGER NOT NULL,
    `Detail_D` INTEGER NOT NULL,
    `Detail_H1` INTEGER NOT NULL,
    `Detail_H2` INTEGER NOT NULL,
    `Detail_H3` INTEGER NOT NULL,
    `EyeColour_D` INTEGER NOT NULL,
    `EyeColour_H1` INTEGER NOT NULL,
    `EyeColour_H2` INTEGER NOT NULL,
    `EyeColour_H3` INTEGER NOT NULL,
    `EyeShape_D` INTEGER NOT NULL,
    `EyeShape_H1` INTEGER NOT NULL,
    `EyeShape_H2` INTEGER NOT NULL,
    `EyeShape_H3` INTEGER NOT NULL,
    `Mouth_D` INTEGER NOT NULL,
    `Mouth_H1` INTEGER NOT NULL,
    `Mouth_H2` INTEGER NOT NULL,
    `Mouth_H3` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SlimeTrait` (
    `id` INTEGER NOT NULL,
    `type` ENUM('Body', 'Pattern', 'PrimaryColour', 'Accent', 'Detail', 'EyeColour', 'EyeShape', 'Mouth') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `pair0Id` INTEGER NULL,
    `mutation0Id` INTEGER NULL,
    `pair1Id` INTEGER NULL,
    `mutation1Id` INTEGER NULL,
    `statEffectId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Equipment` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `imgsrc` VARCHAR(191) NOT NULL,
    `buyPriceGP` INTEGER NULL,
    `sellPriceGP` INTEGER NOT NULL,
    `buyPriceDittoWei` DECIMAL(65, 0) NULL,
    `requiredLvlCraft` INTEGER NOT NULL DEFAULT 1,
    `requiredLvlCombat` INTEGER NOT NULL DEFAULT 1,
    `attackType` ENUM('Melee', 'Ranged', 'Magic') NULL,
    `statEffectId` INTEGER NULL,
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `type` ENUM('hat', 'armour', 'weapon', 'shield', 'cape', 'necklace') NOT NULL,

    UNIQUE INDEX `Equipment_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Item` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `imgsrc` VARCHAR(191) NOT NULL,
    `rarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `statEffectId` INTEGER NULL,
    `buyPriceGP` INTEGER NULL,
    `sellPriceGP` INTEGER NOT NULL,
    `buyPriceDittoWei` DECIMAL(65, 0) NULL,
    `farmingDurationS` INTEGER NULL,
    `farmingLevelRequired` INTEGER NULL,
    `farmingExp` INTEGER NULL,

    UNIQUE INDEX `Item_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Inventory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
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
CREATE TABLE `StatEffect` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `max_hp_mod` DOUBLE NULL,
    `maxHpEffect` ENUM('add', 'mul') NULL,
    `atk_spd_mod` DOUBLE NULL,
    `atkSpdEffect` ENUM('add', 'mul') NULL,
    `acc_mod` DOUBLE NULL,
    `accEffect` ENUM('add', 'mul') NULL,
    `eva_mod` DOUBLE NULL,
    `evaEffect` ENUM('add', 'mul') NULL,
    `max_melee_dmg_mod` DOUBLE NULL,
    `maxMeleeDmgEffect` ENUM('add', 'mul') NULL,
    `max_ranged_dmg_mod` DOUBLE NULL,
    `maxRangedDmgEffect` ENUM('add', 'mul') NULL,
    `max_magic_dmg_mod` DOUBLE NULL,
    `maxMagicDmgEffect` ENUM('add', 'mul') NULL,
    `crit_chance_mod` DOUBLE NULL,
    `critChanceEffect` ENUM('add', 'mul') NULL,
    `crit_multiplier_mod` DOUBLE NULL,
    `critMultiplierEffect` ENUM('add', 'mul') NULL,
    `dmg_reduction_mod` DOUBLE NULL,
    `dmgReductionEffect` ENUM('add', 'mul') NULL,
    `magic_dmg_reduction_mod` DOUBLE NULL,
    `magicDmgReductionEffect` ENUM('add', 'mul') NULL,
    `hp_regen_rate_mod` DOUBLE NULL,
    `hpRegenRateEffect` ENUM('add', 'mul') NULL,
    `hp_regen_amount_mod` DOUBLE NULL,
    `hpRegenAmountEffect` ENUM('add', 'mul') NULL,
    `melee_factor` DOUBLE NULL DEFAULT 0,
    `range_factor` DOUBLE NULL DEFAULT 0,
    `magic_factor` DOUBLE NULL DEFAULT 0,
    `reinforce_air` DOUBLE NULL DEFAULT 0,
    `reinforce_water` DOUBLE NULL DEFAULT 0,
    `reinforce_earth` DOUBLE NULL DEFAULT 0,
    `reinforce_fire` DOUBLE NULL DEFAULT 0,
    `double_resource_odds_mod` DOUBLE NULL,
    `skill_interval_reduction_multiplier_mod` DOUBLE NULL,
    `durationS` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CraftingRecipe` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `equipmentId` INTEGER NOT NULL,
    `durationS` INTEGER NOT NULL,
    `craftingLevelRequired` INTEGER NOT NULL,
    `craftingExp` INTEGER NOT NULL,

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

-- CreateTable
CREATE TABLE `Monster` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `imgsrc` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `str` INTEGER NOT NULL DEFAULT 1,
    `def` INTEGER NOT NULL DEFAULT 1,
    `dex` INTEGER NOT NULL DEFAULT 1,
    `luk` INTEGER NOT NULL DEFAULT 1,
    `magic` INTEGER NOT NULL DEFAULT 1,
    `hp_level` INTEGER NOT NULL DEFAULT 1,
    `max_hp` DOUBLE NOT NULL DEFAULT 100,
    `atk_spd` DOUBLE NOT NULL DEFAULT 10,
    `acc` DOUBLE NOT NULL DEFAULT 100,
    `eva` DOUBLE NOT NULL DEFAULT 100,
    `max_melee_dmg` DOUBLE NOT NULL DEFAULT 20,
    `max_ranged_dmg` DOUBLE NOT NULL DEFAULT 20,
    `max_magic_dmg` DOUBLE NOT NULL DEFAULT 20,
    `crit_chance` DOUBLE NOT NULL DEFAULT 0.006623,
    `crit_multiplier` DOUBLE NOT NULL DEFAULT 1.290,
    `dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    `magic_dmg_reduction` DOUBLE NOT NULL DEFAULT 10,
    `hp_regen_rate` DOUBLE NOT NULL DEFAULT 20,
    `hp_regen_amount` DOUBLE NOT NULL DEFAULT 10.8,
    `exp` INTEGER NOT NULL,
    `minGoldDrop` INTEGER NOT NULL DEFAULT 0,
    `maxGoldDrop` INTEGER NOT NULL DEFAULT 0,
    `minDittoDrop` DECIMAL(65, 0) NOT NULL,
    `maxDittoDrop` DECIMAL(65, 0) NOT NULL,
    `combatId` INTEGER NOT NULL,

    UNIQUE INDEX `Monster_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonsterDrop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `monsterId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `dropRate` DOUBLE NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `MonsterDrop_monsterId_itemId_equipmentId_key`(`monsterId`, `itemId`, `equipmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Domain` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `imgsrc` VARCHAR(191) NULL,
    `minCombatLevel` INTEGER NULL,
    `maxCombatLevel` INTEGER NULL,
    `entryPriceGP` INTEGER NULL,
    `entryPriceDittoWei` DECIMAL(65, 0) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Domain_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DomainMonster` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `domainId` INTEGER NOT NULL,
    `monsterId` INTEGER NOT NULL,
    `spawnRate` DOUBLE NOT NULL,

    UNIQUE INDEX `DomainMonster_domainId_monsterId_key`(`domainId`, `monsterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Dungeon` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `imgsrc` VARCHAR(191) NOT NULL,
    `monsterGrowthFactor` DOUBLE NOT NULL DEFAULT 1.05,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `minCombatLevel` INTEGER NULL,
    `maxCombatLevel` INTEGER NULL,
    `entryPriceGP` INTEGER NULL,
    `entryPriceDittoWei` DECIMAL(65, 0) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Dungeon_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DungeonMonsterSequence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dungeonId` INTEGER NOT NULL,
    `monsterId` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DungeonMonsterSequence_dungeonId_order_key`(`dungeonId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DungeonLeaderboard` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `dungeonId` INTEGER NOT NULL,
    `monstersKilled` INTEGER NOT NULL DEFAULT 0,
    `damageDealt` DOUBLE NOT NULL DEFAULT 0,
    `damageTaken` DOUBLE NOT NULL DEFAULT 0,
    `timeElapsedMs` INTEGER NOT NULL DEFAULT 0,
    `runDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `score` DOUBLE NOT NULL DEFAULT 0,

    INDEX `DungeonLeaderboard_dungeonId_score_idx`(`dungeonId`, `score`),
    INDEX `DungeonLeaderboard_userId_dungeonId_idx`(`userId`, `dungeonId`),
    UNIQUE INDEX `DungeonLeaderboard_userId_dungeonId_key`(`userId`, `dungeonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FarmingActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `itemId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `FarmingActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CraftingActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `equipmentIdIn` INTEGER NOT NULL,
    `quantityIn` INTEGER NOT NULL,

    INDEX `CraftingActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CraftingConsumedItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `craftingActivityId` INTEGER NOT NULL,
    `itemId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `CraftingConsumedItem_craftingActivityId_idx`(`craftingActivityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BreedingActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dameId` INTEGER NOT NULL,
    `dameGeneration` INTEGER NOT NULL,
    `dameRarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `sireId` INTEGER NOT NULL,
    `sireGeneration` INTEGER NOT NULL,
    `sireRarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,
    `childId` INTEGER NOT NULL,
    `childGeneration` INTEGER NOT NULL,
    `childRarity` ENUM('S', 'A', 'B', 'C', 'D') NOT NULL,

    INDEX `BreedingActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CombatActivityLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `monsterId` INTEGER NOT NULL,
    `expGained` INTEGER NOT NULL,
    `dittoEarned` DECIMAL(65, 0) NULL,
    `goldEarned` INTEGER NULL,

    INDEX `CombatActivityLog_userId_timestamp_idx`(`userId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CombatDrop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `combatActivityLogId` INTEGER NOT NULL,
    `itemId` INTEGER NULL,
    `equipmentId` INTEGER NULL,
    `quantity` INTEGER NOT NULL,

    INDEX `CombatDrop_combatActivityLogId_idx`(`combatActivityLogId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Accomplishment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `maxUsers` INTEGER NULL,
    `requirements` JSON NOT NULL,

    INDEX `Accomplishment_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AccomplishmentProgress` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accomplishmentId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AccomplishmentProgress_accomplishmentId_userId_key`(`accomplishmentId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserDeviceFingerprint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `fingerprint` VARCHAR(191) NOT NULL,
    `ipAddress` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserDeviceFingerprint_fingerprint_idx`(`fingerprint`),
    INDEX `UserDeviceFingerprint_ipAddress_idx`(`ipAddress`),
    INDEX `UserDeviceFingerprint_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReferralLink_code_key`(`code`),
    UNIQUE INDEX `ReferralLink_ownerId_key`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralRelation` (
    `id` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `referrerUserId` VARCHAR(191) NULL,
    `referrerExternal` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReferralRelation_refereeId_key`(`refereeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralEventLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `oldReferrerId` VARCHAR(191) NULL,
    `newReferrerId` VARCHAR(191) NOT NULL,
    `eventType` ENUM('INITIAL', 'CHANGE') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReferralEarningLog` (
    `id` VARCHAR(191) NOT NULL,
    `referrerId` VARCHAR(191) NOT NULL,
    `refereeId` VARCHAR(191) NOT NULL,
    `tier` INTEGER NOT NULL,
    `amountDittoWei` DECIMAL(65, 0) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BetaTester` (
    `telegramId` VARCHAR(191) NOT NULL,
    `claimed` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`telegramId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_MonsterStatEffects` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_MonsterStatEffects_AB_unique`(`A`, `B`),
    INDEX `_MonsterStatEffects_B_index`(`B`)
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
ALTER TABLE `User` ADD CONSTRAINT `User_combatId_fkey` FOREIGN KEY (`combatId`) REFERENCES `Combat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_equippedSlimeId_fkey` FOREIGN KEY (`equippedSlimeId`) REFERENCES `Slime`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_D_fkey` FOREIGN KEY (`Body_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_H1_fkey` FOREIGN KEY (`Body_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_H2_fkey` FOREIGN KEY (`Body_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Body_H3_fkey` FOREIGN KEY (`Body_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_D_fkey` FOREIGN KEY (`Mouth_D`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_H1_fkey` FOREIGN KEY (`Mouth_H1`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_H2_fkey` FOREIGN KEY (`Mouth_H2`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Slime` ADD CONSTRAINT `Slime_Mouth_H3_fkey` FOREIGN KEY (`Mouth_H3`) REFERENCES `SlimeTrait`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_statEffectId_fkey` FOREIGN KEY (`statEffectId`) REFERENCES `StatEffect`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_pair0Id_fkey` FOREIGN KEY (`pair0Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_mutation0Id_fkey` FOREIGN KEY (`mutation0Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_pair1Id_fkey` FOREIGN KEY (`pair1Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SlimeTrait` ADD CONSTRAINT `SlimeTrait_mutation1Id_fkey` FOREIGN KEY (`mutation1Id`) REFERENCES `SlimeTrait`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Equipment` ADD CONSTRAINT `Equipment_statEffectId_fkey` FOREIGN KEY (`statEffectId`) REFERENCES `StatEffect`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Item` ADD CONSTRAINT `Item_statEffectId_fkey` FOREIGN KEY (`statEffectId`) REFERENCES `StatEffect`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `Monster` ADD CONSTRAINT `Monster_combatId_fkey` FOREIGN KEY (`combatId`) REFERENCES `Combat`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonsterDrop` ADD CONSTRAINT `MonsterDrop_monsterId_fkey` FOREIGN KEY (`monsterId`) REFERENCES `Monster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonsterDrop` ADD CONSTRAINT `MonsterDrop_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `Item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonsterDrop` ADD CONSTRAINT `MonsterDrop_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `Equipment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomainMonster` ADD CONSTRAINT `DomainMonster_domainId_fkey` FOREIGN KEY (`domainId`) REFERENCES `Domain`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DomainMonster` ADD CONSTRAINT `DomainMonster_monsterId_fkey` FOREIGN KEY (`monsterId`) REFERENCES `Monster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonMonsterSequence` ADD CONSTRAINT `DungeonMonsterSequence_dungeonId_fkey` FOREIGN KEY (`dungeonId`) REFERENCES `Dungeon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonMonsterSequence` ADD CONSTRAINT `DungeonMonsterSequence_monsterId_fkey` FOREIGN KEY (`monsterId`) REFERENCES `Monster`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonLeaderboard` ADD CONSTRAINT `DungeonLeaderboard_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DungeonLeaderboard` ADD CONSTRAINT `DungeonLeaderboard_dungeonId_fkey` FOREIGN KEY (`dungeonId`) REFERENCES `Dungeon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FarmingActivityLog` ADD CONSTRAINT `FarmingActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingActivityLog` ADD CONSTRAINT `CraftingActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CraftingConsumedItem` ADD CONSTRAINT `CraftingConsumedItem_craftingActivityId_fkey` FOREIGN KEY (`craftingActivityId`) REFERENCES `CraftingActivityLog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreedingActivityLog` ADD CONSTRAINT `BreedingActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CombatActivityLog` ADD CONSTRAINT `CombatActivityLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CombatDrop` ADD CONSTRAINT `CombatDrop_combatActivityLogId_fkey` FOREIGN KEY (`combatActivityLogId`) REFERENCES `CombatActivityLog`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentProgress` ADD CONSTRAINT `AccomplishmentProgress_accomplishmentId_fkey` FOREIGN KEY (`accomplishmentId`) REFERENCES `Accomplishment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccomplishmentProgress` ADD CONSTRAINT `AccomplishmentProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserDeviceFingerprint` ADD CONSTRAINT `UserDeviceFingerprint_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralLink` ADD CONSTRAINT `ReferralLink_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`telegramId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralRelation` ADD CONSTRAINT `ReferralRelation_referrerUserId_fkey` FOREIGN KEY (`referrerUserId`) REFERENCES `User`(`telegramId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralEarningLog` ADD CONSTRAINT `ReferralEarningLog_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReferralEarningLog` ADD CONSTRAINT `ReferralEarningLog_refereeId_fkey` FOREIGN KEY (`refereeId`) REFERENCES `User`(`telegramId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MonsterStatEffects` ADD CONSTRAINT `_MonsterStatEffects_A_fkey` FOREIGN KEY (`A`) REFERENCES `Monster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_MonsterStatEffects` ADD CONSTRAINT `_MonsterStatEffects_B_fkey` FOREIGN KEY (`B`) REFERENCES `StatEffect`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
