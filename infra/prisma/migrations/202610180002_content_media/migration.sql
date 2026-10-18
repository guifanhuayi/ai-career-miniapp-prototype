-- AlterTable
ALTER TABLE `Course` ADD COLUMN `mediaAssetId` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `MediaAsset` (
    `id` VARCHAR(80) NOT NULL,
    `relativePath` VARCHAR(150) NOT NULL,
    `durationSeconds` DOUBLE NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `size` INTEGER NOT NULL,
    `authorization` VARCHAR(500) NOT NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT true,
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdempotencyRecord` (
    `scope` VARCHAR(40) NOT NULL,
    `actor` VARCHAR(64) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `response` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`scope`, `actor`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Course` ADD CONSTRAINT `Course_mediaAssetId_fkey` FOREIGN KEY (`mediaAssetId`) REFERENCES `MediaAsset`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
