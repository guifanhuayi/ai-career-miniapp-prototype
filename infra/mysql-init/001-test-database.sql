-- Isolated automated-test schema; no real user data is copied into it.
CREATE DATABASE IF NOT EXISTS career_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON career_test.* TO 'career'@'%';
