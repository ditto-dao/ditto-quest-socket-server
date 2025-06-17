-- CreateTable
CREATE TABLE `user_snapshots` (
    `user_id` VARCHAR(191) NOT NULL,
    `snapshot_data` LONGTEXT NOT NULL,
    `compressed_data` MEDIUMBLOB NULL,
    `uncompressed_size` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'fresh',
    `stale_since` DATETIME(3) NULL,
    `last_regeneration` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `priority_score` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_snapshots_status_priority_score_stale_since_idx`(`status`, `priority_score`, `stale_since`),
    INDEX `user_snapshots_updated_at_idx`(`updated_at`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
