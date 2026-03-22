const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    const sql = 'SELECT * FROM users WHERE username = ?';



    db.query(sql, [username], async (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Database error', error: err });
        }
        if (results.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }   

        const user = results[0];

        console.log('Password typed:', password);
        console.log('Password in DB:', user.password);
        const passwordMatch = bcrypt.compareSync(password, user.password);
        console.log('Password match:', passwordMatch);
        
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        } 

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        res.json({ 
            message: 'Login successful', 
            token,
            role: user.role
        });
    });
});

module.exports = router;