-- AlterTable
ALTER TABLE `Equipment` ADD COLUMN `buyPriceDittoWei` DECIMAL(65, 0) NULL,
    ADD COLUMN `buyPriceGP` INTEGER NULL,
    ADD COLUMN `sellPriceGP` INTEGER NULL;

-- AlterTable
ALTER TABLE `Item` ADD COLUMN `buyPriceDittoWei` DECIMAL(65, 0) NULL,
    ADD COLUMN `buyPriceGP` INTEGER NULL;
