const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const db       = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth');

// ============================================================
//  HELPER — create a user account for a student
//  Password is set to their student number by default
// ============================================================
function createStudentUser(student_number, student_id, callback) {
    bcrypt.hash(student_number, 10, (err, hash) => {
        if (err) return callback(err);
        db.query(
            'INSERT INTO users (username, password, role, student_id) VALUES (?, ?, "student", ?)',
            [student_number, hash, student_id],
            callback
        );
    });
}

// ============================================================
//  POST /api/students/new  — Register a student
// ============================================================
router.post('/new', protect, restrictTo('admin'), (req, res) => {
    const {
        student_number, first_name, last_name, age, address,
        department_id, course, year_level, type,
        school_year, semester
    } = req.body;

    if (!student_number || !first_name || !last_name || !age ||
        !address || !department_id || !course || !year_level || !type) {
        return res.status(400).json({ message: 'All student fields are required.' });
    }

    console.log('[register] incoming:', { student_number, year_level, type, school_year, semester });

    // Derive safe school_year / semester — fall back gracefully if not provided
    const sy = (school_year && school_year.trim())
        ? school_year.trim()
        : (() => { const y = new Date().getFullYear(); return `${y}-${y + 1}`; })();
    const sem = parseInt(semester) || 1;

    const insertStudent = `
        INSERT INTO students
            (student_number, first_name, last_name, age, address,
             department_id, course, year_level, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
        insertStudent,
        [student_number, first_name, last_name, age, address,
         department_id, course, year_level, type],
        (err, result) => {
            if (err) {
                console.error('[register] insert student error:', err);
                if (err.code === 'ER_DUP_ENTRY')
                    return res.status(400).json({ message: 'Student number already exists.' });
                return res.status(500).json({ message: 'Database error', error: err.message });
            }

            const student_id = result.insertId;
            console.log('[register] student inserted, id =', student_id);

            // ── SHIFTEE: notice + user account, no auto-enroll ──────────────
            if (type === 'shiftee') {
                const msg = `Shiftee ${first_name} ${last_name} requires face-to-face consultation before enrollment.`;
                db.query(
                    'INSERT INTO notices (student_id, type, message) VALUES (?, "f2f_required", ?)',
                    [student_id, msg],
                    (err) => { if (err) console.error('[register] shiftee notice error:', err); }
                );
                createStudentUser(student_number, student_id, (err) => {
                    if (err) console.error('[register] shiftee user error:', err);
                    return res.status(201).json({
                        message: 'Shiftee registered. F2F consultation required before enrollment.',
                        student_id
                    });
                });
                return;
            }

            // ── OLD / higher-year student: user account only, manual enrollment later ──
            if (type !== 'new' || parseInt(year_level) !== 1) {
                createStudentUser(student_number, student_id, (err) => {
                    if (err) console.error('[register] old student user error:', err);
                    return res.status(201).json({
                        message: 'Student registered. They will enroll during the enrollment period.',
                        student_id
                    });
                });
                return;
            }

            // ── NEW Year-1 student: auto-enroll from curriculum ──────────────
            console.log('[register] fetching curriculum — dept=%s year=1 sem=%s', department_id, sem);

            const curriculumSQL = `
                SELECT s.id AS subject_id, s.units, s.code, s.name
                FROM curriculum c
                JOIN subjects s ON c.subject_id = s.id
                WHERE c.department_id = ? AND c.year_level = 1 AND c.semester = ?
            `;

            db.query(curriculumSQL, [department_id, sem], (err, subjects) => {
                if (err) {
                    console.error('[register] curriculum query error:', err);
                    return res.status(500).json({ message: 'Error fetching curriculum', error: err.message });
                }

                console.log('[register] curriculum subjects found:', subjects.map(s => s.code));

                if (subjects.length === 0) {
                    createStudentUser(student_number, student_id, (err) => {
                        if (err) console.error('[register] no-curriculum user error:', err);
                    });
                    return res.status(201).json({
                        message: `Student registered but no curriculum found for dept ${department_id}, year 1, sem ${sem}.`,
                        student_id
                    });
                }

                const enrollmentValues = subjects.map(sub => [
                    student_id, sub.subject_id, sy, sem, 'auto_enrolled'
                ]);

                console.log('[register] inserting %d enrollments for sy=%s sem=%s',
                    enrollmentValues.length, sy, sem);

                db.query(
                    'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status) VALUES ?',
                    [enrollmentValues],
                    (err) => {
                        if (err) {
                            console.error('[register] enrollment insert error:', err);
                            return res.status(500).json({ message: 'Error auto-enrolling subjects', error: err.message });
                        }

                        createStudentUser(student_number, student_id, (err) => {
                            if (err) {
                                console.error('[register] user creation error:', err);
                                return res.status(500).json({ message: 'Error creating user account', error: err.message });
                            }

                            console.log('[register] complete — enrolled in:', subjects.map(s => s.code));

                            res.status(201).json({
                                message: 'Student registered and auto-enrolled successfully.',
                                student_id,
                                school_year: sy,
                                semester: sem,
                                enrolled_subjects: subjects.map(s => `${s.code} - ${s.name}`)
                            });
                        });
                    }
                );
            });
        }
    );
});

// ============================================================
//  GET /api/students/all
// ============================================================
router.get('/all', protect, restrictTo('admin', 'business_office'), (req, res) => {
    const sql = `
        SELECT s.id, s.student_number, s.first_name, s.last_name,
               s.course, s.year_level, s.type, s.status, s.ok_to_enroll,
               d.name AS department_name
        FROM students s
        JOIN departments d ON s.department_id = d.id
        ORDER BY s.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('[all students] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.json(results);
    });
});

// ============================================================
//  GET /api/students/me
// ============================================================
router.get('/me', protect, restrictTo('student'), (req, res) => {
    const userSQL = `
        SELECT s.id, s.student_number, s.first_name, s.last_name,
               s.course, s.year_level, s.type, s.status, s.ok_to_enroll,
               d.name AS department_name
        FROM students s
        JOIN departments d ON s.department_id = d.id
        JOIN users u ON u.student_id = s.id
        WHERE u.id = ?
    `;
    db.query(userSQL, [req.user.id], (err, results) => {
        if (err) {
            console.error('[me] student lookup error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (results.length === 0)
            return res.status(404).json({ message: 'Student record not found.' });

        const student = results[0];

        const enrollSQL = `
            SELECT s.id AS subject_id, s.code, s.name, s.units, s.type,
                   e.status, e.school_year, e.semester, e.id AS enrollment_id,
                   sec.section_code, sec.day, sec.time_start, sec.time_end, sec.room
            FROM enrollments e
            JOIN subjects s ON e.subject_id = s.id
            LEFT JOIN sections sec ON e.section_id = sec.id
            WHERE e.student_id = ?
            ORDER BY e.school_year DESC, e.semester, s.code
        `;
        db.query(enrollSQL, [student.id], (err, subjects) => {
            if (err) {
                console.error('[me] enrollments error:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }

            db.query(
                'SELECT * FROM notices WHERE student_id = ? AND resolved = 0 ORDER BY created_at DESC',
                [student.id],
                (err, notices) => {
                    if (err) {
                        console.error('[me] notices error:', err);
                        return res.status(500).json({ message: 'Database error', error: err.message });
                    }
                    res.json({ student, subjects, notices });
                }
            );
        });
    });
});

// ============================================================
//  GET /api/students/:id/enrollments  — admin view
// ============================================================
router.get('/:id/enrollments', protect, restrictTo('admin'), (req, res) => {
    const sql = `
        SELECT s.id AS subject_id, s.code, s.name, s.units, s.type,
               e.status, e.school_year, e.semester, e.id AS enrollment_id
        FROM enrollments e
        JOIN subjects s ON e.subject_id = s.id
        WHERE e.student_id = ?
        ORDER BY e.school_year DESC, e.semester, s.code
    `;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) {
            console.error('[enrollments] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.json(results);
    });
});

// ============================================================
//  GET /api/students/departments
// ============================================================
router.get('/departments', protect, restrictTo('admin'), (req, res) => {
    db.query('SELECT * FROM departments ORDER BY name', (err, results) => {
        if (err) {
            console.error('[departments] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.json(results);
    });
});

// ============================================================
//  GET /api/students/search
// ============================================================
router.get('/search', protect, restrictTo('business_office', 'teacher', 'admin'), (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'Search query required.' });

    const like = `%${query}%`;
    const sql = `
        SELECT s.id, s.student_number, s.first_name, s.last_name,
               s.course, s.year_level, s.type, s.ok_to_enroll,
               d.name AS department_name
        FROM students s
        JOIN departments d ON s.department_id = d.id
        WHERE s.student_number LIKE ? OR s.first_name LIKE ? OR s.last_name LIKE ?
        ORDER BY s.last_name, s.first_name
        LIMIT 20
    `;
    db.query(sql, [like, like, like], (err, results) => {
        if (err) {
            console.error('[search] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.json(results);
    });
});

// ============================================================
//  PATCH /api/students/:id/confirm-payment
// ============================================================
router.patch('/:id/confirm-payment', protect, restrictTo('business_office'), (req, res) => {
    db.query('UPDATE students SET ok_to_enroll = 1 WHERE id = ?', [req.params.id], (err, result) => {
        if (err) {
            console.error('[confirm-payment] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (result.affectedRows === 0)
            return res.status(404).json({ message: 'Student not found.' });
        res.json({ message: 'Payment confirmed. Student cleared for enrollment.' });
    });
});

// ============================================================
//  GET /api/students/enrollment-status
// ============================================================
router.get('/enrollment-status', protect, (req, res) => {
    db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, results) => {
        if (err) {
            console.error('[enrollment-status] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.json(results[0] || { is_open: 0, school_year: null, semester: null });
    });
});

// ============================================================
//  PATCH /api/students/enrollment-settings
// ============================================================
router.patch('/enrollment-settings', protect, restrictTo('admin'), (req, res) => {
    const { is_open, school_year, semester } = req.body;
    if (!school_year || !semester)
        return res.status(400).json({ message: 'school_year and semester are required.' });

    db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, current) => {
        if (err) {
            console.error('[enrollment-settings] read error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }

        const prev = current[0] || {};
        const semesterChanged = prev.school_year !== school_year || prev.semester !== parseInt(semester);

        db.query(
            `UPDATE enrollment_settings
             SET is_open = ?, school_year = ?, semester = ?,
                 previous_school_year = ?, previous_semester = ?
             ORDER BY id DESC LIMIT 1`,
            [is_open, school_year, parseInt(semester), prev.school_year || null, prev.semester || null],
            (err) => {
                if (err) {
                    console.error('[enrollment-settings] update error:', err);
                    return res.status(500).json({ message: 'Database error', error: err.message });
                }

                if (is_open && semesterChanged) {
                    console.log('[enrollment-settings] advancing students to', school_year, 'sem', semester);

                    db.query(
                        `UPDATE students SET type = 'old', ok_to_enroll = 0, current_semester = ?
                         WHERE id IN (
                             SELECT DISTINCT student_id FROM enrollments
                             WHERE status IN ('officially_enrolled','auto_enrolled')
                         )`,
                        [parseInt(semester)],
                        (err) => { if (err) console.error('[enrollment-settings] advance error:', err); }
                    );

                    if (prev.semester === 2 && parseInt(semester) === 1) {
                        db.query(
                            `UPDATE students SET year_level = year_level + 1, current_semester = 1
                             WHERE id IN (
                                 SELECT DISTINCT student_id FROM enrollments
                                 WHERE status IN ('officially_enrolled','auto_enrolled')
                             )`,
                            (err) => { if (err) console.error('[enrollment-settings] year bump error:', err); }
                        );
                    }
                }

                res.json({
                    message: `Enrollment ${is_open ? 'opened' : 'closed'} for ${school_year} Sem ${semester}.` +
                             (semesterChanged && is_open ? ' Students advanced to new semester.' : '')
                });
            }
        );
    });
});

// ============================================================
//  POST /api/students/enroll-old
// ============================================================
router.post('/enroll-old', protect, restrictTo('student'), (req, res) => {
    db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, settings) => {
        if (err) {
            console.error('[enroll-old] settings error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (!settings[0] || !settings[0].is_open)
            return res.status(403).json({ message: 'Enrollment is currently closed.' });

        const { school_year, semester } = settings[0];

        const studentSQL = `SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?`;
        db.query(studentSQL, [req.user.id], (err, students) => {
            if (err) {
                console.error('[enroll-old] student lookup error:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            if (!students[0]) return res.status(404).json({ message: 'Student record not found.' });
            const student = students[0];

            if (!student.ok_to_enroll)
                return res.status(403).json({ message: 'You are not cleared for enrollment. Please settle your balance at the Business Office.' });

            db.query(
                'SELECT id FROM enrollments WHERE student_id = ? AND school_year = ? AND semester = ? LIMIT 1',
                [student.id, school_year, semester],
                (err, existing) => {
                    if (err) {
                        console.error('[enroll-old] existing check error:', err);
                        return res.status(500).json({ message: 'Database error', error: err.message });
                    }
                    if (existing.length > 0)
                        return res.status(400).json({ message: 'You have already started enrollment for this term.' });

                    const gradesSQL = `
                        SELECT g.subject_id, g.grade, g.passed, s.type AS subject_type
                        FROM grades g
                        JOIN subjects s ON g.subject_id = s.id
                        WHERE g.student_id = ?
                    `;
                    db.query(gradesSQL, [student.id], (err, grades) => {
                        if (err) {
                            console.error('[enroll-old] grades error:', err);
                            return res.status(500).json({ message: 'Database error', error: err.message });
                        }

                        const passedIds = new Set();
                        const failedIds = new Set();
                        grades.forEach(g => {
                            const isNonMajor = ['GE', 'PE', 'NSTP', 'drawing'].includes(g.subject_type);
                            const threshold  = isNonMajor ? 1.0 : 2.0;
                            if (parseFloat(g.grade) >= threshold) passedIds.add(g.subject_id);
                            else failedIds.add(g.subject_id);
                        });

                        const isRegular = failedIds.size === 0;
                        console.log('[enroll-old] student=%d regular=%s passed=%d failed=%d',
                            student.id, isRegular, passedIds.size, failedIds.size);

                        db.query(
                            'UPDATE students SET status = ?, type = "old" WHERE id = ?',
                            [isRegular ? 'regular' : 'irregular', student.id],
                            (err) => { if (err) console.error('[enroll-old] status update error:', err); }
                        );

                        db.query(
                            `SELECT s.id AS subject_id, s.code, s.name, s.units
                             FROM curriculum c
                             JOIN subjects s ON c.subject_id = s.id
                             WHERE c.department_id = ? AND c.year_level = ? AND c.semester = ?`,
                            [student.department_id, student.year_level, parseInt(semester)],
                            (err, nextSubjects) => {
                                if (err) {
                                    console.error('[enroll-old] curriculum error:', err);
                                    return res.status(500).json({ message: 'Database error', error: err.message });
                                }

                                db.query('SELECT subject_id, prerequisite_id FROM prerequisites', (err, prereqs) => {
                                    if (err) {
                                        console.error('[enroll-old] prereqs error:', err);
                                        return res.status(500).json({ message: 'Database error', error: err.message });
                                    }

                                    const prereqMap = {};
                                    prereqs.forEach(p => {
                                        if (!prereqMap[p.subject_id]) prereqMap[p.subject_id] = [];
                                        prereqMap[p.subject_id].push(p.prerequisite_id);
                                    });

                                    const eligible    = [];
                                    const notEligible = [];

                                    nextSubjects.forEach(sub => {
                                        if (passedIds.has(sub.subject_id)) return;
                                        const needed       = prereqMap[sub.subject_id] || [];
                                        const meetsPrereqs = needed.every(pid => passedIds.has(pid));
                                        if (meetsPrereqs) eligible.push(sub);
                                        else notEligible.push(sub);
                                    });

                                    const toEnroll = [...eligible];
                                    if (!isRegular) {
                                        failedIds.forEach(fid => {
                                            if (!toEnroll.find(s => s.subject_id === fid))
                                                toEnroll.push({ subject_id: fid, units: 0 });
                                        });
                                    }

                                    const totalUnits    = toEnroll.reduce((sum, s) => sum + (s.units || 0), 0);
                                    const standardUnits = nextSubjects.reduce((sum, s) => sum + s.units, 0);
                                    const notices       = [];

                                    if (totalUnits < 15)
                                        notices.push({ type: 'unit_underload', message: `Your unit load (${totalUnits}) is below 15 units. Please consult your advisor.` });
                                    else if (totalUnits > standardUnits)
                                        notices.push({ type: 'unit_overload', message: `Your unit load (${totalUnits}) exceeds standard (${standardUnits} units). Please consult your advisor.` });

                                    if (notEligible.length > 0)
                                        notices.push({ type: 'f2f_required', message: `Missing prerequisites for: ${notEligible.map(s => s.code).join(', ')}. Please consult your advisor.` });

                                    if (toEnroll.length === 0)
                                        return res.json({ message: 'No eligible subjects found for this semester.', notices });

                                    const enrollValues = toEnroll.map(s => [student.id, s.subject_id, school_year, semester, 'pre_enlisted']);

                                    db.query(
                                        'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status) VALUES ?',
                                        [enrollValues],
                                        (err) => {
                                            if (err) {
                                                console.error('[enroll-old] insert error:', err);
                                                return res.status(500).json({ message: 'Error enrolling subjects', error: err.message });
                                            }

                                            if (notices.length > 0) {
                                                const nVals = notices.map(n => [student.id, n.type, n.message]);
                                                db.query('INSERT INTO notices (student_id, type, message) VALUES ?', [nVals],
                                                    (err) => { if (err) console.error('[enroll-old] notice insert error:', err); }
                                                );
                                            }

                                            res.json({
                                                message: isRegular ? 'Regular enrollment complete.' : 'Irregular enrollment complete.',
                                                status:       isRegular ? 'regular' : 'irregular',
                                                enrolled:     eligible.map(s => `${s.code} - ${s.name}`),
                                                not_eligible: notEligible.map(s => `${s.code} - ${s.name}`),
                                                notices, school_year, semester
                                            });
                                        }
                                    );
                                });
                            }
                        );
                    });
                }
            );
        });
    });
});

// ============================================================
//  POST /api/students/submit-advising
// ============================================================
router.post('/submit-advising', protect, restrictTo('student'), (req, res) => {
    const studentSQL = `SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?`;
    db.query(studentSQL, [req.user.id], (err, students) => {
        if (err) {
            console.error('[submit-advising] student error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (!students[0]) return res.status(404).json({ message: 'Student not found.' });
        const student = students[0];

        db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, settings) => {
            if (err) {
                console.error('[submit-advising] settings error:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            if (!settings[0] || !settings[0].is_open)
                return res.status(403).json({ message: 'Enrollment is currently closed.' });

            const { school_year, semester } = settings[0];

            db.query(
                'SELECT id FROM advising_requests WHERE student_id = ? AND school_year = ? AND semester = ? AND status = "pending" LIMIT 1',
                [student.id, school_year, semester],
                (err, existing) => {
                    if (err) {
                        console.error('[submit-advising] existing check error:', err);
                        return res.status(500).json({ message: 'Database error', error: err.message });
                    }
                    if (existing.length > 0)
                        return res.status(400).json({ message: 'You have already submitted for advising.' });

                    db.query(
                        'SELECT id FROM teachers WHERE department_id = ? LIMIT 1',
                        [student.department_id],
                        (err, teachers) => {
                            if (err) {
                                console.error('[submit-advising] teacher lookup error:', err);
                                return res.status(500).json({ message: 'Database error', error: err.message });
                            }
                            const teacher_id = teachers.length > 0 ? teachers[0].id : null;

                            db.query(
                                'INSERT INTO advising_requests (student_id, teacher_id, school_year, semester) VALUES (?, ?, ?, ?)',
                                [student.id, teacher_id, school_year, semester],
                                (err) => {
                                    if (err) {
                                        console.error('[submit-advising] insert request error:', err);
                                        return res.status(500).json({ message: 'Database error', error: err.message });
                                    }
                                    db.query(
                                        'UPDATE enrollments SET status = "submitted_for_advising" WHERE student_id = ? AND school_year = ? AND semester = ? AND status = "pre_enlisted"',
                                        [student.id, school_year, semester],
                                        (err) => {
                                            if (err) {
                                                console.error('[submit-advising] update enrollments error:', err);
                                                return res.status(500).json({ message: 'Database error', error: err.message });
                                            }
                                            res.json({ message: 'Subjects submitted for advising. Please wait for your advisor to review.' });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// ============================================================
//  GET /api/students/ge-subjects
// ============================================================
router.get('/ge-subjects', protect, restrictTo('student'), (req, res) => {
    const studentSQL = `SELECT s.id FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?`;
    db.query(studentSQL, [req.user.id], (err, students) => {
        if (err) {
            console.error('[ge-subjects] student error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (!students[0]) return res.status(404).json({ message: 'Student not found.' });

        const sql = `
            SELECT s.id, s.code, s.name, s.units
            FROM subjects s
            WHERE s.type = 'GE'
              AND s.code NOT LIKE 'CHS%'
              AND s.id NOT IN (SELECT subject_id FROM prerequisites)
              AND s.id NOT IN (SELECT subject_id FROM grades      WHERE student_id = ? AND passed = 1)
              AND s.id NOT IN (SELECT subject_id FROM enrollments WHERE student_id = ?)
            ORDER BY s.code
        `;
        db.query(sql, [students[0].id, students[0].id], (err, results) => {
            if (err) {
                console.error('[ge-subjects] query error:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.json(results);
        });
    });
});

// ============================================================
//  POST /api/students/add-ge
// ============================================================
router.post('/add-ge', protect, restrictTo('student'), (req, res) => {
    const { subject_id } = req.body;
    if (!subject_id) return res.status(400).json({ message: 'subject_id is required.' });

    const studentSQL = `SELECT s.* FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?`;
    db.query(studentSQL, [req.user.id], (err, students) => {
        if (err) {
            console.error('[add-ge] student error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (!students[0]) return res.status(404).json({ message: 'Student not found.' });
        const student = students[0];

        db.query('SELECT * FROM enrollment_settings ORDER BY id DESC LIMIT 1', (err, settings) => {
            if (err) {
                console.error('[add-ge] settings error:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            if (!settings[0] || !settings[0].is_open)
                return res.status(403).json({ message: 'Enrollment is currently closed.' });

            const { school_year, semester } = settings[0];

            db.query(
                'SELECT id FROM enrollments WHERE student_id = ? AND subject_id = ? AND school_year = ? AND semester = ?',
                [student.id, subject_id, school_year, semester],
                (err, existing) => {
                    if (err) {
                        console.error('[add-ge] existing check error:', err);
                        return res.status(500).json({ message: 'Database error', error: err.message });
                    }
                    if (existing.length > 0)
                        return res.status(400).json({ message: 'Subject already added.' });

                    db.query(
                        'SELECT id FROM grades WHERE student_id = ? AND subject_id = ? AND passed = 1',
                        [student.id, subject_id],
                        (err, passed) => {
                            if (err) {
                                console.error('[add-ge] passed check error:', err);
                                return res.status(500).json({ message: 'Database error', error: err.message });
                            }
                            if (passed.length > 0)
                                return res.status(400).json({ message: 'You have already passed this subject.' });

                            db.query(
                                'INSERT INTO enrollments (student_id, subject_id, school_year, semester, status) VALUES (?, ?, ?, ?, "pre_enlisted")',
                                [student.id, subject_id, school_year, semester],
                                (err) => {
                                    if (err) {
                                        console.error('[add-ge] insert error:', err);
                                        return res.status(500).json({ message: 'Database error', error: err.message });
                                    }
                                    res.json({ message: 'GE subject added successfully.' });
                                }
                            );
                        }
                    );
                }
            );
        });
    });
});

// ============================================================
//  DELETE /api/students/remove-subject/:enrollment_id
// ============================================================
router.delete('/remove-subject/:enrollment_id', protect, restrictTo('student'), (req, res) => {
    const studentSQL = `SELECT s.id FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?`;
    db.query(studentSQL, [req.user.id], (err, students) => {
        if (err) {
            console.error('[remove-subject] student error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (!students[0]) return res.status(404).json({ message: 'Student not found.' });

        db.query(
            'DELETE FROM enrollments WHERE id = ? AND student_id = ? AND status = "pre_enlisted"',
            [req.params.enrollment_id, students[0].id],
            (err, result) => {
                if (err) {
                    console.error('[remove-subject] delete error:', err);
                    return res.status(500).json({ message: 'Database error', error: err.message });
                }
                if (result.affectedRows === 0)
                    return res.status(400).json({ message: 'Cannot remove — subject may already be submitted for advising.' });
                res.json({ message: 'Subject removed.' });
            }
        );
    });
});

// ============================================================
//  GET /api/students/my-grades
// ============================================================
router.get('/my-grades', protect, restrictTo('student'), (req, res) => {
    const studentSQL = `SELECT s.id FROM students s JOIN users u ON u.student_id = s.id WHERE u.id = ?`;
    db.query(studentSQL, [req.user.id], (err, students) => {
        if (err) {
            console.error('[my-grades] student error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        if (!students[0]) return res.status(404).json({ message: 'Student not found.' });

        const sql = `
            SELECT g.grade, g.passed, g.school_year, g.semester,
                   s.code, s.name, s.units
            FROM grades g
            JOIN subjects s ON g.subject_id = s.id
            WHERE g.student_id = ?
            ORDER BY g.school_year, g.semester, s.code
        `;
        db.query(sql, [students[0].id], (err, results) => {
            if (err) {
                console.error('[my-grades] query error:', err);
                return res.status(500).json({ message: 'Database error', error: err.message });
            }
            res.json(results);
        });
    });
});

// ============================================================
//  GET /api/students/contacts
// ============================================================
router.get('/contacts', protect, restrictTo('student'), (req, res) => {
    const sql = `
        SELECT f.name, f.role, f.email, f.phone, d.name AS department_name
        FROM faculty_contacts f
        LEFT JOIN departments d ON f.department_id = d.id
        ORDER BY f.role, f.name
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error('[contacts] error:', err);
            return res.status(500).json({ message: 'Database error', error: err.message });
        }
        res.json(results);
    });
});

module.exports = router;