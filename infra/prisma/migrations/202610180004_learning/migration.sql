ALTER TABLE LearningPlan ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE AssessmentAttempt ADD COLUMN sequence INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
-- Preserve any existing attempts and assign a stable sequence before adding uniqueness.
UPDATE AssessmentAttempt AS a
JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY planId ORDER BY createdAt, id) AS n
      FROM AssessmentAttempt) AS ranked ON a.id = ranked.id
SET a.sequence = ranked.n;
CREATE UNIQUE INDEX AssessmentAttempt_planId_sequence_key ON AssessmentAttempt(planId, sequence);
ALTER TABLE CourseProgress ADD COLUMN revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN mediaVersion CHAR(64) NOT NULL DEFAULT '';
