/*
  Warnings:

  - You are about to alter the column `maxDittoDrop` on the `Monster` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,0)`.
  - You are about to alter the column `minDittoDrop` on the `Monster` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Decimal(65,0)`.

*/
-- AlterTable
ALTER TABLE `Monster` MODIFY `maxDittoDrop` DECIMAL(65, 0) NOT NULL,
    MODIFY `minDittoDrop` DECIMAL(65, 0) NOT NULL;
