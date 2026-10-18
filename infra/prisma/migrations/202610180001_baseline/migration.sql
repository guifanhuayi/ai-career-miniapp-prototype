-- CreateTable
CREATE TABLE `Visitor` (
    `id` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `environment` VARCHAR(16) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisitorCredential` (
    `id` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VisitorCredential_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Scene` (
    `id` VARCHAR(32) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `category` VARCHAR(40) NOT NULL,
    `icon` VARCHAR(32) NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `output` VARCHAR(300) NOT NULL,
    `syllabus` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `position` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Scene_status_position_id_idx`(`status`, `position`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(64) NOT NULL,
    `sceneId` VARCHAR(32) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `position` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Task_sceneId_status_position_idx`(`sceneId`, `status`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionSet` (
    `id` CHAR(36) NOT NULL,
    `sceneId` VARCHAR(32) NOT NULL,
    `version` VARCHAR(80) NOT NULL,
    `questions` JSON NOT NULL,
    `isMock` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `revision` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `QuestionSet_sceneId_version_key`(`sceneId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Course` (
    `id` VARCHAR(80) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `durationSeconds` DOUBLE NULL,
    `author` VARCHAR(150) NOT NULL,
    `sourceUrl` VARCHAR(1000) NULL,
    `mediaUrl` VARCHAR(1000) NULL,
    `authorization` VARCHAR(500) NULL,
    `isTest` BOOLEAN NOT NULL DEFAULT true,
    `chapters` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `version` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseMapping` (
    `courseId` VARCHAR(80) NOT NULL,
    `taskId` VARCHAR(64) NOT NULL,
    `level` VARCHAR(16) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `CourseMapping_taskId_level_position_idx`(`taskId`, `level`, `position`),
    PRIMARY KEY (`courseId`, `taskId`, `level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LearningPlan` (
    `id` CHAR(36) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `sceneId` VARCHAR(32) NOT NULL,
    `taskId` VARCHAR(64) NOT NULL,
    `flowId` VARCHAR(64) NOT NULL,
    `sourceAnalysisId` CHAR(36) NULL,
    `recommendedLevel` VARCHAR(16) NULL,
    `selectedLevel` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LearningPlan_visitorId_updatedAt_id_idx`(`visitorId`, `updatedAt`, `id`),
    UNIQUE INDEX `LearningPlan_visitorId_sceneId_taskId_key`(`visitorId`, `sceneId`, `taskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssessmentAttempt` (
    `id` CHAR(36) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `planId` CHAR(36) NOT NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `questionVersion` VARCHAR(80) NOT NULL,
    `scoringVersion` VARCHAR(32) NOT NULL,
    `snapshot` JSON NOT NULL,
    `answers` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `score` INTEGER NULL,
    `recommendedLevel` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,

    INDEX `AssessmentAttempt_planId_createdAt_idx`(`planId`, `createdAt`),
    UNIQUE INDEX `AssessmentAttempt_visitorId_idempotencyKey_key`(`visitorId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseMark` (
    `visitorId` CHAR(36) NOT NULL,
    `courseId` VARCHAR(80) NOT NULL,
    `markedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`visitorId`, `courseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CourseProgress` (
    `planId` CHAR(36) NOT NULL,
    `courseId` VARCHAR(80) NOT NULL,
    `position` DOUBLE NOT NULL DEFAULT 0,
    `clientEnded` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`planId`, `courseId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobDescription` (
    `id` CHAR(36) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `text` LONGTEXT NOT NULL,
    `source` VARCHAR(24) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `JobDescription_visitorId_createdAt_idx`(`visitorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalysisJob` (
    `id` CHAR(36) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `jobDescriptionId` CHAR(36) NOT NULL,
    `inputSnapshot` JSON NOT NULL,
    `idempotencyKey` VARCHAR(64) NOT NULL,
    `flowId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `result` JSON NULL,
    `selectedScenes` JSON NULL,
    `errorCode` VARCHAR(64) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `deadline` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `AnalysisJob_status_deadline_idx`(`status`, `deadline`),
    UNIQUE INDEX `AnalysisJob_visitorId_idempotencyKey_key`(`visitorId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Upload` (
    `id` CHAR(36) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `path` VARCHAR(500) NOT NULL,
    `mediaType` VARCHAR(40) NOT NULL,
    `size` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OcrJob` (
    `id` CHAR(36) NOT NULL,
    `uploadId` CHAR(36) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `text` LONGTEXT NULL,
    `errorCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BehaviorEvent` (
    `id` VARCHAR(64) NOT NULL,
    `visitorId` CHAR(36) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `source` VARCHAR(16) NOT NULL,
    `sessionId` VARCHAR(64) NOT NULL,
    `flowId` VARCHAR(64) NULL,
    `taskId` VARCHAR(64) NULL,
    `courseId` VARCHAR(80) NULL,
    `environment` VARCHAR(16) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effectiveAt` DATETIME(3) NOT NULL,
    `clockAnomaly` BOOLEAN NOT NULL DEFAULT false,

    INDEX `BehaviorEvent_environment_effectiveAt_name_idx`(`environment`, `effectiveAt`, `name`),
    INDEX `BehaviorEvent_visitorId_flowId_taskId_effectiveAt_idx`(`visitorId`, `flowId`, `taskId`, `effectiveAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiRequestMetric` (
    `id` CHAR(36) NOT NULL,
    `requestId` VARCHAR(64) NOT NULL,
    `route` VARCHAR(200) NOT NULL,
    `method` VARCHAR(10) NOT NULL,
    `status` INTEGER NOT NULL,
    `errorCode` VARCHAR(64) NULL,
    `durationMs` DOUBLE NOT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `environment` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApiRequestMetric_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAudit` (
    `id` CHAR(36) NOT NULL,
    `resource` VARCHAR(40) NOT NULL,
    `resourceId` VARCHAR(80) NOT NULL,
    `action` VARCHAR(24) NOT NULL,
    `fromVersion` INTEGER NULL,
    `toVersion` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyAggregate` (
    `day` CHAR(10) NOT NULL,
    `environment` VARCHAR(16) NOT NULL,
    `metrics` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`day`, `environment`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VisitorCredential` ADD CONSTRAINT `VisitorCredential_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Task` ADD CONSTRAINT `Task_sceneId_fkey` FOREIGN KEY (`sceneId`) REFERENCES `Scene`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionSet` ADD CONSTRAINT `QuestionSet_sceneId_fkey` FOREIGN KEY (`sceneId`) REFERENCES `Scene`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseMapping` ADD CONSTRAINT `CourseMapping_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseMapping` ADD CONSTRAINT `CourseMapping_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningPlan` ADD CONSTRAINT `LearningPlan_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningPlan` ADD CONSTRAINT `LearningPlan_sceneId_fkey` FOREIGN KEY (`sceneId`) REFERENCES `Scene`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LearningPlan` ADD CONSTRAINT `LearningPlan_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentAttempt` ADD CONSTRAINT `AssessmentAttempt_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentAttempt` ADD CONSTRAINT `AssessmentAttempt_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `LearningPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseMark` ADD CONSTRAINT `CourseMark_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseMark` ADD CONSTRAINT `CourseMark_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseProgress` ADD CONSTRAINT `CourseProgress_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `LearningPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CourseProgress` ADD CONSTRAINT `CourseProgress_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobDescription` ADD CONSTRAINT `JobDescription_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisJob` ADD CONSTRAINT `AnalysisJob_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AnalysisJob` ADD CONSTRAINT `AnalysisJob_jobDescriptionId_fkey` FOREIGN KEY (`jobDescriptionId`) REFERENCES `JobDescription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Upload` ADD CONSTRAINT `Upload_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OcrJob` ADD CONSTRAINT `OcrJob_uploadId_fkey` FOREIGN KEY (`uploadId`) REFERENCES `Upload`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BehaviorEvent` ADD CONSTRAINT `BehaviorEvent_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
