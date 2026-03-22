-- ============================================================
--  Migration: Add admin notice support + ensure columns exist
--  Run this once on your existing ced_preenrollment DB
-- ============================================================

USE ced_preenrollment;

-- 1. Expand notices.type ENUM to include 'general' (admin broadcasts)
ALTER TABLE notices 
  MODIFY COLUMN type 
  ENUM('unit_overload','unit_underload','f2f_required','conflict','prereq_not_met','general') 
  NOT NULL DEFAULT 'f2f_required';

-- 2. Ensure enrollments.section_id column exists (may already exist)
-- Safe to run even if already added:
ALTER TABLE enrollments 
  ADD COLUMN IF NOT EXISTS section_id INT DEFAULT NULL;

-- Try adding FK only if it doesn't exist (ignore error if already present)
ALTER TABLE enrollments 
  ADD CONSTRAINT fk_enrollment_section 
  FOREIGN KEY (section_id) REFERENCES sections(id) 
  ON DELETE SET NULL;

-- 3. Ensure students.current_semester exists
ALTER TABLE students 
  ADD COLUMN IF NOT EXISTS current_semester TINYINT NOT NULL DEFAULT 1;

-- 4. Ensure enrollment_settings has previous_school_year / previous_semester
ALTER TABLE enrollment_settings 
  ADD COLUMN IF NOT EXISTS previous_school_year VARCHAR(10) DEFAULT NULL;

ALTER TABLE enrollment_settings 
  ADD COLUMN IF NOT EXISTS previous_semester TINYINT DEFAULT NULL;

-- 5. Verify
SHOW COLUMNS FROM notices;
SHOW COLUMNS FROM enrollments;
SHOW COLUMNS FROM sections;
