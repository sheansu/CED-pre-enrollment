-- ============================================================
--  CED Automated Pre-Enrollment System
--  Complete Setup Script v2
--  Based on official BSCpE curriculum (SY 2018-2019 v3)
-- ============================================================

DROP DATABASE IF EXISTS ced_preenrollment;
CREATE DATABASE ced_preenrollment;
USE ced_preenrollment;

-- ============================================================
--  1. DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
    id      INT AUTO_INCREMENT PRIMARY KEY,
    code    VARCHAR(10)  NOT NULL UNIQUE,
    name    VARCHAR(100) NOT NULL
);

-- ============================================================
--  2. USERS (login system)
-- ============================================================
CREATE TABLE users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    role        ENUM('student','admin','business_office') NOT NULL,
    student_id  INT DEFAULT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  3. STUDENTS
-- ============================================================
CREATE TABLE students (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    student_number  VARCHAR(20)  NOT NULL UNIQUE,
    first_name      VARCHAR(50)  NOT NULL,
    last_name       VARCHAR(50)  NOT NULL,
    age             TINYINT      NOT NULL,
    address         VARCHAR(255) NOT NULL,
    department_id   INT          NOT NULL,
    course          VARCHAR(100) NOT NULL,
    year_level      TINYINT      NOT NULL,
    type            ENUM('new','old') NOT NULL DEFAULT 'new',
    status          ENUM('regular','irregular','on_probation') DEFAULT NULL,
    ok_to_enroll    TINYINT(1)   NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- add foreign key to users after students exists
ALTER TABLE users ADD FOREIGN KEY (student_id) REFERENCES students(id);

-- ============================================================
--  4. SUBJECTS
-- ============================================================
CREATE TABLE subjects (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    code          VARCHAR(20)  NOT NULL UNIQUE,
    name          VARCHAR(200) NOT NULL,
    units         TINYINT      NOT NULL,
    type          ENUM('engineering','GE','PE','NSTP','drawing') NOT NULL DEFAULT 'engineering',
    department_id INT          DEFAULT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- ============================================================
--  5. PREREQUISITES
--  subject_id requires prerequisite_id to be passed first
-- ============================================================
CREATE TABLE prerequisites (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    subject_id      INT NOT NULL,
    prerequisite_id INT NOT NULL,
    FOREIGN KEY (subject_id)      REFERENCES subjects(id),
    FOREIGN KEY (prerequisite_id) REFERENCES subjects(id)
);

-- ============================================================
--  6. CURRICULUM
-- ============================================================
CREATE TABLE curriculum (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    department_id  INT     NOT NULL,
    year_level     TINYINT NOT NULL,
    semester       TINYINT NOT NULL,   -- 1, 2, or 3 (3 = summer)
    subject_id     INT     NOT NULL,
    standard_units TINYINT NOT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id),
    FOREIGN KEY (subject_id)    REFERENCES subjects(id)
);

-- ============================================================
--  7. SUBJECT_SCHEDULES
-- ============================================================
CREATE TABLE subject_schedules (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    subject_id  INT NOT NULL,
    day         ENUM('Mon','Tue','Wed','Thu','Fri','Sat') NOT NULL,
    time_start  TIME NOT NULL,
    time_end    TIME NOT NULL,
    room        VARCHAR(50) DEFAULT NULL,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- ============================================================
--  8. GRADES
-- ============================================================
CREATE TABLE grades (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id  INT          NOT NULL,
    subject_id  INT          NOT NULL,
    grade       DECIMAL(4,2) DEFAULT NULL,
    passed      TINYINT(1)   NOT NULL DEFAULT 0,
    school_year VARCHAR(10)  NOT NULL,
    semester    TINYINT      NOT NULL,
    UNIQUE KEY unique_grade (student_id, subject_id, school_year, semester),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- ============================================================
--  9. ENROLLMENTS
-- ============================================================
CREATE TABLE enrollments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id  INT NOT NULL,
    subject_id  INT NOT NULL,
    school_year VARCHAR(10) NOT NULL,
    semester    TINYINT     NOT NULL,
    status      ENUM('auto_enrolled','manually_added','dropped','conflict_removed') NOT NULL DEFAULT 'auto_enrolled',
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_enrollment (student_id, subject_id, school_year, semester),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- ============================================================
--  10. NOTICES
-- ============================================================
CREATE TABLE notices (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id  INT  NOT NULL,
    type        ENUM('unit_overload','unit_underload','f2f_required','conflict','prereq_not_met') NOT NULL,
    message     TEXT NOT NULL,
    resolved    TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

-- ============================================================
--  11. SUBJECT_CHANGE_REQUESTS
-- ============================================================
CREATE TABLE subject_change_requests (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    student_id   INT  NOT NULL,
    subject_id   INT  NOT NULL,
    request_type ENUM('add','drop','shift') NOT NULL,
    reason       TEXT DEFAULT NULL,
    status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- ============================================================
--  12. FACULTY_CONTACTS
-- ============================================================
CREATE TABLE faculty_contacts (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    role          VARCHAR(100) NOT NULL,
    department_id INT          DEFAULT NULL,
    email         VARCHAR(100) DEFAULT NULL,
    phone         VARCHAR(30)  DEFAULT NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id)
);
-- ============================================================
--  13. ENROLLMENT_SETTINGS
-- ============================================================
CREATE TABLE enrollment_settings (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    is_open     TINYINT(1) NOT NULL DEFAULT 0,
    school_year VARCHAR(10) NOT NULL,
    semester    TINYINT NOT NULL,
    opened_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- ============================================================
--  14. FOR TEACHERS
-- ============================================================
CREATE TABLE teachers (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    first_name    VARCHAR(50) NOT NULL,
    last_name     VARCHAR(50) NOT NULL,
    email         VARCHAR(100) DEFAULT NULL,
    department_id INT DEFAULT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)       REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
);
-- ============================================================
--  15. SECTIONS
-- ============================================================
CREATE TABLE sections (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    subject_id  INT NOT NULL,
    teacher_id  INT DEFAULT NULL,
    section_code VARCHAR(10) NOT NULL,
    capacity    TINYINT NOT NULL DEFAULT 40,
    day         ENUM('Mon','Tue','Wed','Thu','Fri','Sat') DEFAULT NULL,
    time_start  TIME DEFAULT NULL,
    time_end    TIME DEFAULT NULL,
    room        VARCHAR(50) DEFAULT NULL,
    school_year VARCHAR(10) NOT NULL,
    semester    TINYINT NOT NULL,
    FOREIGN KEY (subject_id)  REFERENCES subjects(id),
    FOREIGN KEY (teacher_id)  REFERENCES teachers(id)
);
-- ============================================================
--  16. ADVISING REQUESTS
-- ============================================================
CREATE TABLE advising_requests (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id  INT NOT NULL,
    teacher_id  INT DEFAULT NULL,
    status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    school_year VARCHAR(10) NOT NULL,
    semester    TINYINT NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at  TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
CREATE TABLE teacher_subjects (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    subject_id INT NOT NULL,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

-- Insert the current semester as the default setting
INSERT INTO enrollment_settings (is_open, school_year, semester) 
VALUES (0, '2026-2027', 1);

-- ============================================================
--  DATA: DEPARTMENTS
-- ============================================================
INSERT INTO departments (code, name) VALUES
    ('CpE',  'Computer Engineering'),
    ('CE',   'Civil Engineering'),
    ('EE',   'Electrical Engineering'),
    ('ME',   'Mechanical Engineering'),
    ('ARCH', 'Architecture');

-- ============================================================
--  DATA: SUBJECTS
--  Shared engineering math/science subjects
-- ============================================================
INSERT INTO subjects (code, name, units, type, department_id) VALUES
    ('EM 11',   'Calculus 1 (Differential Calculus)',        3, 'engineering', NULL),
    ('EM 13',   'Algebra and Trigonometry for Engineering',  4, 'engineering', NULL),
    ('EM 16',   'Discrete Mathematics',                      3, 'engineering', NULL),
    ('EM 18',   'Calculus 2 (Integral Calculus)',            4, 'engineering', NULL),
    ('EM 21',   'Differential Equations',                    3, 'engineering', NULL),
    ('EM 24',   'Engineering Data Analysis',                 3, 'engineering', NULL),
    ('EM 31',   'Numerical Methods',                         3, 'engineering', NULL),
    ('Phys 1',  'Physics for Engineers',                     4, 'engineering', NULL),
    ('Chem 14', 'Chemistry for Engineers',                   4, 'engineering', NULL),
    ('ES 21',   'Engineering Economics',                     3, 'engineering', NULL),
    ('ES 23R',  'Statics of Rigid Bodies',                   3, 'engineering', NULL),
    ('ES 25R',  'Environmental Science and Engineering',     3, 'engineering', NULL),
    ('ES 28',   'Technopreneurship',                         3, 'engineering', NULL),
    ('ES 40R',  'Engineering Management',                    2, 'engineering', NULL),
    ('EES 31',  'Feedback and Control Systems',              3, 'engineering', NULL),
    ('EES 34',  'Basic Occupational Health and Safety',      3, 'engineering', NULL);

-- GE subjects
INSERT INTO subjects (code, name, units, type, department_id) VALUES
    ('GE 1',    'Understanding the Self',                            3, 'GE', NULL),
    ('GE 2',    'Readings in Philippine History',                    3, 'GE', NULL),
    ('GE 3',    'The Contemporary World',                            3, 'GE', NULL),
    ('GE 4',    'Mathematics for the Modern World',                  3, 'GE', NULL),
    ('GE 5',    'Purposive Communication',                           3, 'GE', NULL),
    ('GE 6',    'Art Appreciation',                                  3, 'GE', NULL),
    ('GE 7',    'Science, Technology and Society',                   3, 'GE', NULL),
    ('GE 8',    'Ethics',                                            3, 'GE', NULL),
    ('GE 9',    'The Life and Works of Jose Rizal',                  3, 'GE', NULL),
    ('GE 10A',  'Whole Person Education',                            3, 'GE', NULL),
    ('GE 11',   'Climate Change: Effects on People and Ecosystems',  3, 'GE', NULL),
    ('GE 12',   'Ethics of the Christian Faith',                     3, 'GE', NULL),
    ('CHS 1',   'Reading and Interpreting the Hebrew Scriptures',    3, 'GE', NULL),
    ('CHS 2',   'Reading and Interpreting the Christian Scriptures', 3, 'GE', NULL),
    ('CHS 3',   'Ethics of the Christian Faith',                     3, 'GE', NULL),
    ('PEP 1',   'Personality Enhancement Program 1',                 0, 'GE', NULL),
    ('PEP 2',   'Personality Enhancement Program 2',                 0, 'GE', NULL);

-- PE and NSTP
INSERT INTO subjects (code, name, units, type, department_id) VALUES
    ('PE 1',    'Physical Fitness and Swimming',        2, 'PE',   NULL),
    ('PE 2',    'Physical Education 2',                 2, 'PE',   NULL),
    ('PE 3',    'Physical Education 3',                 2, 'PE',   NULL),
    ('PE 4',    'Physical Education 4',                 2, 'PE',   NULL),
    ('NSTP 1',  'National Service Training Program 1',  3, 'NSTP', NULL),
    ('NSTP 2',  'National Service Training Program 2',  3, 'NSTP', NULL);

-- Drawing subjects
INSERT INTO subjects (code, name, units, type, department_id) VALUES
    ('Draw 11R', 'Engineering Drawing and Plans',  1, 'drawing', NULL),
    ('Draw 12R', 'Computer-Aided Drafting (CAD)',  1, 'drawing', NULL);

-- CpE-specific subjects
INSERT INTO subjects (code, name, units, type, department_id) VALUES
    ('CpE 1',   'Computer Engineering as a Discipline',        1, 'engineering', 1),
    ('CpE 11',  'Programming Logic and Design',                2, 'engineering', 1),
    ('CpE 12',  'Object Oriented Programming',                 2, 'engineering', 1),
    ('CpE 21',  'Data Structures and Algorithm',               2, 'engineering', 1),
    ('CpE 22',  'Software Design',                             4, 'engineering', 1),
    ('EE 21CpE','Fundamentals of Electrical Circuits',         5, 'engineering', 1),
    ('EE 24CpE','Fundamentals of Electronic Circuits',         5, 'engineering', 1),
    ('EMCp 26', 'Engineering Mathematics for CpE',             3, 'engineering', 1),
    ('CpE 31',  'Logic Circuits and Design',                   4, 'engineering', 1),
    ('CpE 33',  'Operating Systems',                           3, 'engineering', 1),
    ('CpE 35',  'Data and Digital Communications',             3, 'engineering', 1),
    ('CpE 37',  'Introduction to HDL',                         1, 'engineering', 1),
    ('CpE 39',  'Fundamentals of Mixed Signals and Sensors',   3, 'engineering', 1),
    ('CpE 41',  'Computer Engineering Drafting and Design',    1, 'engineering', 1),
    ('CpE 43',  'Engineering Ethics',                          3, 'engineering', 1),
    ('CpE 30',  'CpE Laws and Professional Practice',          2, 'engineering', 1),
    ('CpE 32',  'Computer Networks and Security',              4, 'engineering', 1),
    ('CpE 34',  'Microprocessors',                             4, 'engineering', 1),
    ('CpE 36',  'Methods of Research',                         2, 'engineering', 1),
    ('CpE 38',  'Software Development 1 (Elective 1)',         3, 'engineering', 1),
    ('CpE 45',  'Embedded Systems',                            4, 'engineering', 1),
    ('CpE 47',  'Computer Architecture and Organization',      4, 'engineering', 1),
    ('CpE 49',  'Software Development 2 (Elective 2)',         3, 'engineering', 1),
    ('CpE 51',  'CpE Practice and Design 1',                   1, 'engineering', 1),
    ('CpE 53',  'Digital Signal Processing',                   4, 'engineering', 1),
    ('CpE 40',  'Seminars and Fieldtrips',                     1, 'engineering', 1),
    ('CpE 42',  'CpE Practice and Design 2',                   2, 'engineering', 1),
    ('CpE 44',  'Emerging Technologies in CpE',                3, 'engineering', 1),
    ('CpE 46',  'System and Network Administration 1 (Elective 3)', 3, 'engineering', 1),
    ('CpE 300', 'On the Job Training (OJT)',                   3, 'engineering', 1);

-- ============================================================
--  DATA: CURRICULUM (CpE only, based on official Silliman curriculum)
--  semester 1 = 1st sem, 2 = 2nd sem, 3 = summer
-- ============================================================

-- Year 1 Sem 1
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 1, 1, id, units FROM subjects WHERE code IN
('CpE 1','CpE 11','EM 11','EM 13','GE 1','GE 2','GE 7','GE 9','PE 1','NSTP 1','PEP 1');

-- Year 1 Sem 2
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 1, 2, id, units FROM subjects WHERE code IN
('CpE 12','Draw 11R','EM 16','EM 18','Chem 14','GE 4','Phys 1','PE 2','NSTP 2','PEP 2');

-- Year 2 Sem 1
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 2, 1, id, units FROM subjects WHERE code IN
('CpE 21','Draw 12R','EE 21CpE','EM 21','ES 21','ES 23R','ES 25R','GE 10A','CHS 1','PE 3');

-- Year 2 Sem 2
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 2, 2, id, units FROM subjects WHERE code IN
('CpE 22','EE 24CpE','EM 24','EM 31','EMCp 26','GE 3','GE 5','PE 4');

-- Year 3 Sem 1
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 3, 1, id, units FROM subjects WHERE code IN
('CpE 31','CpE 33','CpE 35','CpE 37','CpE 39','CpE 41','CpE 43','EES 31','GE 11');

-- Year 3 Sem 2
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 3, 2, id, units FROM subjects WHERE code IN
('CpE 30','CpE 32','CpE 34','CpE 36','CpE 38','EES 34','GE 6','GE 8');

-- Summer (Year 3)
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 3, 3, id, units FROM subjects WHERE code IN ('CpE 300');

-- Year 4 Sem 1
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 4, 1, id, units FROM subjects WHERE code IN
('CpE 45','CpE 47','CpE 49','CpE 51','CpE 53','CHS 2','GE 12');

-- Year 4 Sem 2
INSERT INTO curriculum (department_id, year_level, semester, subject_id, standard_units)
SELECT 1, 4, 2, id, units FROM subjects WHERE code IN
('CpE 40','CpE 42','CpE 44','CpE 46','ES 28','ES 40R','CHS 3');

-- ============================================================
--  DATA: PREREQUISITES
--  Based exactly on official curriculum sheet
-- ============================================================
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 12'   AND p.code='CpE 11';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EM 16'    AND p.code='EM 11';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EM 18'    AND p.code='EM 11';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EM 18'    AND p.code='EM 13';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='Phys 1'   AND p.code='EM 11';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='PE 2'     AND p.code='PE 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='NSTP 2'   AND p.code='NSTP 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 21'   AND p.code='CpE 12';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='Draw 12R' AND p.code='Draw 11R';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EE 21CpE' AND p.code='Phys 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EM 21'    AND p.code='EM 18';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='ES 21'    AND p.code='EM 18';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='ES 23R'   AND p.code='EM 18';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='ES 23R'   AND p.code='Phys 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='ES 25R'   AND p.code='Chem 14';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='PE 3'     AND p.code='PE 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 22'   AND p.code='CpE 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EE 24CpE' AND p.code='EE 21CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EM 24'    AND p.code='EM 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EM 31'    AND p.code='EM 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EMCp 26'  AND p.code='EM 18';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EMCp 26'  AND p.code='EM 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='PE 4'     AND p.code='PE 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 31'   AND p.code='EE 24CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 33'   AND p.code='CpE 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 35'   AND p.code='EE 24CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 37'   AND p.code='CpE 11';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 37'   AND p.code='EE 24CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 39'   AND p.code='EE 24CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 41'   AND p.code='EE 24CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EES 31'   AND p.code='EM 31';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EES 31'   AND p.code='EE 21CpE';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 30'   AND p.code='CpE 43';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 32'   AND p.code='CpE 35';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 34'   AND p.code='CpE 31';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 36'   AND p.code='EM 24';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 36'   AND p.code='CpE 31';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 36'   AND p.code='GE 5';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 38'   AND p.code='CpE 22';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='EES 34'   AND p.code='CpE 33';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 45'   AND p.code='CpE 34';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 47'   AND p.code='CpE 34';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 49'   AND p.code='CpE 38';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 51'   AND p.code='CpE 34';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 51'   AND p.code='CpE 36';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 53'   AND p.code='EES 31';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CHS 2'    AND p.code='CHS 1';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 40'   AND p.code='CpE 36';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 42'   AND p.code='CpE 51';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 44'   AND p.code='CpE 45';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CpE 46'   AND p.code='CpE 49';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='ES 28'    AND p.code='EM 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='ES 40R'   AND p.code='ES 21';
INSERT INTO prerequisites (subject_id, prerequisite_id)
SELECT s.id, p.id FROM subjects s, subjects p WHERE s.code='CHS 3'    AND p.code='CHS 2';

-- ============================================================
--  DATA: SAMPLE USERS (passwords are plain text for demo only)
--  In production these must be hashed with bcrypt
-- ============================================================
INSERT INTO users (username, password, role) VALUES
    ('admin',    'admin123',    'admin'),
    ('busoff',   'busoff123',   'business_office');

-- ============================================================
--  DATA: FACULTY CONTACTS
-- ============================================================
INSERT INTO faculty_contacts (name, role, department_id, email, phone) VALUES
    ('Engr. Klint Ian Austero',   'Dean, CED',              NULL, 'kiaustero@silliman.edu',   '(035) 422-6002 loc 100'),
    ('Engr. Johnson B. Diputado', 'Program Chair, CpE',     1,    'jbdiputado@silliman.edu',  '(035) 422-6002 loc 101'),
    ('Ms. Anie Escarillo',        'Secretariat, CED',       NULL, 'aescarillo@silliman.edu',  '(035) 422-6002 loc 103');

-- ============================================================
--  VERIFYING STUFF ONLY AHAHAHHA
-- ============================================================
SHOW TABLES;
SELECT COUNT(*) AS total_subjects   FROM subjects;
SELECT COUNT(*) AS total_curriculum FROM curriculum;
SELECT COUNT(*) AS total_prereqs    FROM prerequisites;

SELECT * FROM students;
SELECT * FROM users;
SELECT * FROM enrollment_settings;

ALTER TABLE students MODIFY COLUMN type ENUM('new', 'old', 'shiftee') NOT NULL DEFAULT 'new';

SHOW COLUMNS FROM students LIKE 'type';

ALTER TABLE users MODIFY COLUMN role 
ENUM('student','admin','business_office','teacher') NOT NULL;

UPDATE users SET password = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' WHERE username = 'admin';
UPDATE users SET password = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' WHERE username = 'busoff';

INSERT INTO users (username, password, role) VALUES 
('teacher1', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'teacher');
INSERT INTO teachers (user_id, first_name, last_name, email, department_id)
VALUES (LAST_INSERT_ID(), 'Kar', 'Baring', 'karizzaabaring@su.edu.ph', 1);

INSERT INTO teacher_subjects (teacher_id, subject_id)
SELECT 1, id FROM subjects WHERE code IN ('EM 11', 'EM 13', 'CpE 1', 'CpE 11', 'GE 1', 'GE 2', 'GE 7', 'GE 9', 'PE 1', 'NSTP 1', 'PEP 1');

ALTER TABLE enrollments MODIFY COLUMN status 
ENUM('auto_enrolled','manually_added','dropped','conflict_removed','pre_enlisted','submitted_for_advising','officially_enrolled') 
NOT NULL DEFAULT 'auto_enrolled';

ALTER TABLE enrollments ADD COLUMN section_id INT DEFAULT NULL;
ALTER TABLE enrollments ADD FOREIGN KEY (section_id) REFERENCES sections(id);

SHOW COLUMNS FROM enrollments LIKE 'status';

ALTER TABLE students ADD COLUMN current_semester TINYINT NOT NULL DEFAULT 1;

SELECT g.grade, g.passed, s.code, s.type FROM grades g JOIN subjects s ON g.subject_id = s.id WHERE g.student_id = 1;

ALTER TABLE enrollment_settings ADD COLUMN previous_school_year VARCHAR(10) DEFAULT NULL;
ALTER TABLE enrollment_settings ADD COLUMN previous_semester TINYINT DEFAULT NULL;

SELECT id, student_number, first_name, last_name, type, year_level, ok_to_enroll, current_semester FROM students;
