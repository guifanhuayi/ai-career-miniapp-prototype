ALTER TABLE `Visitor` ADD COLUMN `firstLearningAt` DATETIME(3) NULL;
CREATE TABLE `AnalyticsLock` (`id` INTEGER NOT NULL PRIMARY KEY);
INSERT INTO `AnalyticsLock` (`id`) VALUES (1);
ALTER TABLE `BehaviorEvent`
  ADD COLUMN `sceneId` VARCHAR(32) NULL,
  ADD COLUMN `position` DOUBLE NULL,
  ADD COLUMN `positionAnomaly` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `marked` BOOLEAN NULL,
  ADD COLUMN `payloadHash` CHAR(64) NULL,
  ADD COLUMN `schemaVersion` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `appVersion` VARCHAR(32) NOT NULL DEFAULT '0.1.0';
CREATE INDEX `BehaviorEvent_visitorId_receivedAt_id_idx` ON `BehaviorEvent`(`visitorId`, `receivedAt`, `id`);
UPDATE `Visitor` v JOIN (
 SELECT visitorId, MIN(effectiveAt) firstAt FROM `BehaviorEvent`
 WHERE name IN ('task_selected','assessment_started','assessment_submitted','course_open_attempted','learning_plan_resumed','course_mark_changed')
 GROUP BY visitorId
) e ON v.id = e.visitorId SET v.firstLearningAt = e.firstAt;
