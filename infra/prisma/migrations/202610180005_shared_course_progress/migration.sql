-- The product manual defines shared seconds per visitor/course; task visits remain separate.
CREATE TABLE VisitorCourseProgress (
  visitorId CHAR(36) NOT NULL,
  courseId VARCHAR(80) NOT NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  clientEnded BOOLEAN NOT NULL DEFAULT false,
  revision INTEGER NOT NULL DEFAULT 1,
  mediaVersion CHAR(64) NOT NULL DEFAULT '',
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (visitorId, courseId),
  CONSTRAINT VisitorCourseProgress_visitorId_fkey FOREIGN KEY (visitorId) REFERENCES Visitor(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT VisitorCourseProgress_courseId_fkey FOREIGN KEY (courseId) REFERENCES Course(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- Never discard legacy task visits; choose the latest saved valid identity deterministically.
INSERT INTO VisitorCourseProgress (visitorId, courseId, position, clientEnded, revision, mediaVersion, updatedAt)
SELECT visitorId, courseId, position, clientEnded, revision, mediaVersion, updatedAt FROM (
  SELECT p.visitorId, c.courseId, c.position, c.clientEnded, c.revision, c.mediaVersion, c.updatedAt,
    ROW_NUMBER() OVER (PARTITION BY p.visitorId, c.courseId ORDER BY c.updatedAt DESC, c.planId DESC) AS n
  FROM CourseProgress c JOIN LearningPlan p ON p.id = c.planId
) ranked WHERE n = 1;
