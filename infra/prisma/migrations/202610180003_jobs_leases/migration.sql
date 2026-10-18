-- AlterTable
ALTER TABLE `AnalysisJob` ADD COLUMN `leaseId` CHAR(36) NULL,
    ADD COLUMN `leaseUntil` DATETIME(3) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `JobDescription` ADD COLUMN `uploadId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `Upload` ADD COLUMN `purgedAt` DATETIME(3) NULL,
    ADD COLUMN `sha256` CHAR(64) NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX `OcrJob_uploadId_key` ON `OcrJob`(`uploadId`);

-- AddForeignKey
ALTER TABLE `JobDescription` ADD CONSTRAINT `JobDescription_uploadId_fkey` FOREIGN KEY (`uploadId`) REFERENCES `Upload`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
