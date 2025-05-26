/*
  Warnings:

  - You are about to alter the column `amountDittoWei` on the `ReferralEarningLog` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,0)`.

*/
-- AlterTable
ALTER TABLE `ReferralEarningLog` MODIFY `amountDittoWei` DECIMAL(65, 0) NOT NULL;
