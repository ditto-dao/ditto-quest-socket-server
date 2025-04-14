/*
  Warnings:

  - You are about to alter the column `cp` on the `Combat` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,0)`.

*/
-- AlterTable
ALTER TABLE `Combat` MODIFY `cp` DECIMAL(65, 0) NOT NULL DEFAULT 699;
