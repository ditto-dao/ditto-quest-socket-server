/*
  Warnings:

  - A unique constraint covering the columns `[userId,dungeonId]` on the table `DungeonLeaderboard` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `DungeonLeaderboard_userId_dungeonId_key` ON `DungeonLeaderboard`(`userId`, `dungeonId`);
