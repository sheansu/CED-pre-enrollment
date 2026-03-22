const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const { protect, restrictTo } = require('../middleware/auth');

// ============================================================
//  TEACHER MANAGEMENT
// ============================================================

// Register a new teacher (creates user + teacher record)
router.post('/teachers/register', protect, restrictTo('admin'), async (req, res) => {
    const { first_name, last_name, email, department_id, username, password } = req.body;
    if (!first_name || !last_name || !username || !password) {
        return res.status(400).json({ message: 'First name, last name, username, and password are required.' });
    }

    try {
        const hash = await bcrypt.hash(password, 10);

        db.query('INSERT INTO users (username, password, role) VALUES (?, ?, "teacher")',
            [username, hash],
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Username already exists.' });
                    return res.status(500).json({ message: 'Database error', error: err });
                }
                const user_id = result.insertId;
                db.query(
                    'INSERT INTO teachers (user_id, first_name, last_name, email, department_id) VALUES (?, ?, ?, ?, ?)',
                    [user_id, first_name, last_name, email || null, department_id || null],
                    (err2, result2) => {
                        if (err2) return res.status(500).json({ message: 'Database error', error: err2 });
                        res.status(201).json({ message: 'Teacher registered successfully.', teacher_id: result2.insertId });
                    }
                );
            }
        );
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err });
    }
});

// Get all teachers
router.get('/teachers', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT t.id, t.first_name, t.last_name, t.email,
               d.name as department_name, d.id as department_id,
               u.username, u.id as user_id
        FROM teachers t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN departments d ON t.department_id = d.id
        ORDER BY t.last_name
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  SUBJECT ASSIGNMENT
// ============================================================

// Get all subjects a teacher is assigned to
router.get('/teachers/:teacher_id/subjects', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT s.id, s.code, s.name, s.units, s.type
        FROM teacher_subjects ts
        JOIN subjects s ON ts.subject_id = s.id
        WHERE ts.teacher_id = ?
        ORDER BY s.code
    `;
    db.query(sql, [req.params.teacher_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Assign a subject to a teacher
router.post('/teachers/:teacher_id/subjects', protect, restrictTo('admin'), (req, res) => {
    const { subject_id } = req.body;
    if (!subject_id) return res.status(400).json({ message: 'subject_id is required.' });

    db.query(
        'INSERT IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)',
        [req.params.teacher_id, subject_id],
        (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Subject assigned to teacher.' });
        }
    );
});

// Remove a subject from a teacher
router.delete('/teachers/:teacher_id/subjects/:subject_id', protect, restrictTo('admin'), (req, res) => {
    db.query(
        'DELETE FROM teacher_subjects WHERE teacher_id = ? AND subject_id = ?',
        [req.params.teacher_id, req.params.subject_id],
        (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Subject removed from teacher.' });
        }
    );
});

// Get all subjects (for dropdown)
router.get('/subjects', protect, restrictTo('admin'), (req, res) => {
    const sql = `SELECT id, code, name, units, type FROM subjects ORDER BY code`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  SECTIONS (schedule management)
// ============================================================

// Get all sections (optionally filter by school_year/semester)
router.get('/sections', protect, restrictTo('admin'), (req, res) => {
    const { school_year, semester } = req.query;
    let sql = `
        SELECT sec.id, sec.section_code, sec.capacity, sec.day, sec.time_start, sec.time_end, sec.room,
               sec.school_year, sec.semester,
               s.code as subject_code, s.name as subject_name,
               t.first_name as teacher_first, t.last_name as teacher_last, t.id as teacher_id
        FROM sections sec
        JOIN subjects s ON sec.subject_id = s.id
        LEFT JOIN teachers t ON sec.teacher_id = t.id
        WHERE 1=1
    `;
    const params = [];
    if (school_year) { sql += ' AND sec.school_year = ?'; params.push(school_year); }
    if (semester)    { sql += ' AND sec.semester = ?';    params.push(semester); }
    sql += ' ORDER BY s.code, sec.section_code';
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Create a section with schedule
router.post('/sections', protect, restrictTo('admin'), (req, res) => {
    const { subject_id, teacher_id, section_code, capacity, day, time_start, time_end, room, school_year, semester } = req.body;
    if (!subject_id || !section_code || !school_year || !semester) {
        return res.status(400).json({ message: 'subject_id, section_code, school_year, and semester are required.' });
    }
    const sql = `
        INSERT INTO sections (subject_id, teacher_id, section_code, capacity, day, time_start, time_end, room, school_year, semester)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [subject_id, teacher_id || null, section_code, capacity || 40, day || null, time_start || null, time_end || null, room || null, school_year, semester],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.status(201).json({ message: 'Section created.', section_id: result.insertId });
        }
    );
});

// Update a section's schedule
router.patch('/sections/:section_id', protect, restrictTo('admin'), (req, res) => {
    const { teacher_id, section_code, capacity, day, time_start, time_end, room } = req.body;
    const sql = `
        UPDATE sections SET teacher_id = ?, section_code = ?, capacity = ?, day = ?, time_start = ?, time_end = ?, room = ?
        WHERE id = ?
    `;
    db.query(sql, [teacher_id || null, section_code, capacity || 40, day || null, time_start || null, time_end || null, room || null, req.params.section_id],
        (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Section updated.' });
        }
    );
});

// Delete a section
router.delete('/sections/:section_id', protect, restrictTo('admin'), (req, res) => {
    db.query('DELETE FROM sections WHERE id = ?', [req.params.section_id], (err) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Section deleted.' });
    });
});

// Assign a student's enrollment to a section
router.patch('/enrollments/:enrollment_id/section', protect, restrictTo('admin'), (req, res) => {
    const { section_id } = req.body;
    db.query('UPDATE enrollments SET section_id = ? WHERE id = ?', [section_id, req.params.enrollment_id], (err) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Section assigned to enrollment.' });
    });
});

// ============================================================
//  NOTICES
// ============================================================

// Send notice to a student
router.post('/notices/student', protect, restrictTo('admin'), (req, res) => {
    const { student_id, message, type } = req.body;
    if (!student_id || !message) return res.status(400).json({ message: 'student_id and message are required.' });
    const noticeType = type || 'f2f_required';
    db.query(
        'INSERT INTO notices (student_id, type, message) VALUES (?, ?, ?)',
        [student_id, noticeType, message],
        (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: 'Notice sent to student.' });
        }
    );
});

// Send notice to all students of a teacher (via teacher_subjects)
router.post('/notices/teacher-students', protect, restrictTo('admin'), (req, res) => {
    const { teacher_id, message } = req.body;
    if (!teacher_id || !message) return res.status(400).json({ message: 'teacher_id and message are required.' });

    // Get all students enrolled in this teacher's subjects
    const sql = `
        SELECT DISTINCT e.student_id
        FROM enrollments e
        JOIN teacher_subjects ts ON e.subject_id = ts.subject_id
        WHERE ts.teacher_id = ?
        AND e.status NOT IN ('dropped', 'conflict_removed')
    `;
    db.query(sql, [teacher_id], (err, students) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (students.length === 0) return res.json({ message: 'No students found for this teacher.' });

        const values = students.map(s => [s.student_id, 'f2f_required', message]);
        db.query('INSERT INTO notices (student_id, type, message) VALUES ?', [values], (err) => {
            if (err) return res.status(500).json({ message: 'Database error', error: err });
            res.json({ message: `Notice sent to ${students.length} student(s).` });
        });
    });
});

// Get all notices (admin view, with student info)
router.get('/notices', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT n.id, n.type, n.message, n.resolved, n.created_at,
               s.id as student_id, s.student_number, s.first_name, s.last_name
        FROM notices n
        JOIN students s ON n.student_id = s.id
        ORDER BY n.created_at DESC
        LIMIT 200
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Mark notice resolved
router.patch('/notices/:notice_id/resolve', protect, restrictTo('admin'), (req, res) => {
    db.query('UPDATE notices SET resolved = 1 WHERE id = ?', [req.params.notice_id], (err) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json({ message: 'Notice resolved.' });
    });
});

// ============================================================
//  GRADES (admin view)
// ============================================================

// Get all grades for a student
router.get('/students/:student_id/grades', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT g.id, g.grade, g.passed, g.school_year, g.semester,
               s.code, s.name, s.units, s.type
        FROM grades g
        JOIN subjects s ON g.subject_id = s.id
        WHERE g.student_id = ?
        ORDER BY g.school_year, g.semester, s.code
    `;
    db.query(sql, [req.params.student_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// Get grades summary for all students (admin)
router.get('/grades/all', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT g.id, g.grade, g.passed, g.school_year, g.semester,
               s.code as subject_code, s.name as subject_name, s.type,
               st.id as student_id, st.student_number, st.first_name, st.last_name, st.course, st.year_level
        FROM grades g
        JOIN subjects s ON g.subject_id = s.id
        JOIN students st ON g.student_id = st.id
        ORDER BY st.last_name, g.school_year, g.semester, s.code
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

// ============================================================
//  MANUAL SUBJECT ENROLLMENT (shiftees / admin override)
// ============================================================

// Manually enroll a student in a subject
router.post('/students/:student_id/enroll', protect, restrictTo('admin'), (req, res) => {
    const { subject_id, school_year, semester, section_id } = req.body;
    if (!subject_id || !school_year || !semester) {
        return res.status(400).json({ message: 'subject_id, school_year, and semester are required.' });
    }

    const sql = `
        INSERT INTO enrollments (student_id, subject_id, school_year, semester, status, section_id)
        VALUES (?, ?, ?, ?, 'manually_added', ?)
        ON DUPLICATE KEY UPDATE status = 'manually_added', section_id = VALUES(section_id)
    `;
    db.query(sql, [req.params.student_id, subject_id, school_year, semester, section_id || null], (err) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });

        // Also mark student as officially_enrolled if they were shiftee
        db.query(
            'UPDATE students SET status = "irregular" WHERE id = ? AND type = "shiftee"',
            [req.params.student_id],
            () => {}
        );
        res.json({ message: 'Student enrolled in subject.' });
    });
});

// Drop a student from a subject (admin)
router.delete('/students/:student_id/enroll/:subject_id', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        UPDATE enrollments SET status = 'dropped'
        WHERE student_id = ? AND subject_id = ?
    `;
    db.query(sql, [req.params.student_id, req.params.subject_id], (err, result) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Enrollment not found.' });
        res.json({ message: 'Subject dropped.' });
    });
});

// Get available subjects not yet enrolled by a student this term
router.get('/students/:student_id/available-subjects', protect, restrictTo('admin'), (req, res) => {
    const { school_year, semester } = req.query;
    if (!school_year || !semester) return res.status(400).json({ message: 'school_year and semester are required.' });

    const sql = `
        SELECT s.id, s.code, s.name, s.units, s.type
        FROM subjects s
        WHERE s.id NOT IN (
            SELECT subject_id FROM enrollments
            WHERE student_id = ? AND school_year = ? AND semester = ?
            AND status NOT IN ('dropped', 'conflict_removed')
        )
        ORDER BY s.code
    `;
    db.query(sql, [req.params.student_id, school_year, semester], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error', error: err });
        res.json(results);
    });
});

module.exports = router;
