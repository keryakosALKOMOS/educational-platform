const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const db = require('./db/database');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting for Code Redemption
const redeemLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 attempts per IP
    message: { error: 'Too many attempts from this IP, please try again after 15 minutes.' }
});

// Ensure base directories exist to prevent crashes on fresh deployment
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Create video directories if they don't exist
['grade1', 'grade2', 'grade3'].forEach(grade => {
    const dir = path.join(__dirname, 'videos', grade);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: 'Access Denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid Token' });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ error: 'Admin access required' });
    }
};

// =======================
// AUTHENTICATION APIs
// =======================

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, class_time } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        db.run(`INSERT INTO users (name, email, password, role, class_time) VALUES (?, ?, ?, ?, ?)`, 
        [name, email, hash, 'student', class_time || null], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            
            const token = jwt.sign({ id: this.lastID, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user: { id: this.lastID, name, email, role: 'student', coins: 0 } });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, coins: user.coins } });
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, name, email, role, coins FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user });
    });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
    // Client simply drops token. Sending success.
    res.json({ message: 'Logged out successfully' });
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    const { name, email, password, class_time } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    if (password && password.trim() !== '') {
        try {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            db.run(
                `UPDATE users SET name = ?, email = ?, password = ?, class_time = ? WHERE id = ?`,
                [name, email, hash, class_time || null, req.user.id],
                function(err) {
                    if (err) return res.status(400).json({ error: 'Email already in use or database error' });
                    res.json({ message: 'Profile updated successfully', user: { id: req.user.id, name, email, role: req.user.role } });
                }
            );
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    } else {
        db.run(
            `UPDATE users SET name = ?, email = ?, class_time = ? WHERE id = ?`,
            [name, email, class_time || null, req.user.id],
            function(err) {
                if (err) return res.status(400).json({ error: 'Email already in use or database error' });
                res.json({ message: 'Profile updated successfully', user: { id: req.user.id, name, email, role: req.user.role } });
            }
        );
    }
});

// =======================
// ADMIN STUDENTS APIs
// =======================

app.get('/api/students', authenticateToken, requireAdmin, (req, res) => {
    db.all(`SELECT id, name, email, coins, class_time FROM users WHERE role = 'student' ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ students: rows });
    });
});

app.post('/api/students', authenticateToken, requireAdmin, async (req, res) => {
    const { name, email, password, coins, class_time } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        db.run(`INSERT INTO users (name, email, password, role, coins, class_time) VALUES (?, ?, ?, 'student', ?, ?)`, 
        [name, email, hash, parseInt(coins) || 0, class_time || null], function(err) {
            if (err) return res.status(400).json({ error: 'Email already exists or database error' });
            res.json({ message: 'Student created successfully', id: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error parsing password' });
    }
});

app.put('/api/students/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { name, email, password, coins, class_time } = req.body;
    const studentId = req.params.id;

    if (password && password.trim() !== '') {
        try {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            db.run(`UPDATE users SET name = ?, email = ?, password = ?, coins = ?, class_time = ? WHERE id = ? AND role = 'student'`,
                [name, email, hash, parseInt(coins) || 0, class_time || null, studentId], function(err) {
                    if (err) return res.status(400).json({ error: 'Database error or email format' });
                    res.json({ message: 'Student updated successfully' });
            });
        } catch (err) {
            res.status(500).json({ error: 'Server error parsing password' });
        }
    } else {
        db.run(`UPDATE users SET name = ?, email = ?, coins = ?, class_time = ? WHERE id = ? AND role = 'student'`,
            [name, email, parseInt(coins) || 0, class_time || null, studentId], function(err) {
                if (err) return res.status(400).json({ error: 'Database error or email format' });
                res.json({ message: 'Student updated successfully' });
        });
    }
});

app.delete('/api/students/:id', authenticateToken, requireAdmin, (req, res) => {
    const studentId = req.params.id;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`DELETE FROM unlocked_videos WHERE user_id = ?`, [studentId]);
        db.run(`UPDATE codes SET is_used = 0, used_by = NULL, used_at = NULL WHERE used_by = ?`, [studentId]);
        db.run(`DELETE FROM users WHERE id = ? AND role = 'student'`, [studentId], function(err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Database error' });
            }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) return res.status(500).json({ error: 'Error committing deletion' });
                res.json({ message: 'Student deleted successfully' });
            });
        });
    });
});

// =======================
// CODES APIs
// =======================

const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

app.post('/api/codes/generate', authenticateToken, requireAdmin, (req, res) => {
    db.get(`SELECT value FROM app_settings WHERE key = 'codes_per_batch'`, [], (err, rowCount) => {
        db.get(`SELECT value FROM app_settings WHERE key = 'coins_per_code'`, [], (err2, rowCoins) => {
            const count = parseInt((rowCount && rowCount.value) || '500');
            const coinsPerCode = parseInt((rowCoins && rowCoins.value) || '1');
            const now = new Date().toISOString();

            // Create the batch record first
            db.run(
                `INSERT INTO code_batches (created_at, count, coins_per_code) VALUES (?, ?, ?)`,
                [now, count, coinsPerCode],
                function(batchErr) {
                    if (batchErr) return res.status(500).json({ error: 'Error creating batch' });
                    const batchId = this.lastID;

                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        const stmt = db.prepare('INSERT OR IGNORE INTO codes (code, batch_id) VALUES (?, ?)');
                        for (let i = 0; i < count; i++) {
                            stmt.run(generateRandomCode(), batchId);
                        }
                        stmt.finalize();
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) return res.status(500).json({ error: 'Error generating codes' });
                            res.json({ message: `${count} codes generated successfully`, count, batch_id: batchId });
                        });
                    });
                }
            );
        });
    });
});

app.get('/api/codes', authenticateToken, requireAdmin, (req, res) => {
    db.all(`SELECT * FROM codes ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ codes: rows });
    });
});

// Get all batches with stats
app.get('/api/codes/batches', authenticateToken, requireAdmin, (req, res) => {
    db.all(`
        SELECT
            b.id,
            b.created_at,
            b.count,
            b.coins_per_code,
            COUNT(CASE WHEN c.is_used = 1 THEN 1 END) AS used_count,
            COUNT(CASE WHEN c.is_used = 0 THEN 1 END) AS available_count
        FROM code_batches b
        LEFT JOIN codes c ON c.batch_id = b.id
        GROUP BY b.id
        ORDER BY b.id DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ batches: rows });
    });
});

// Get all codes for a specific batch (for printing)
app.get('/api/codes/batch/:id', authenticateToken, requireAdmin, (req, res) => {
    const batchId = req.params.id;
    db.all(`SELECT * FROM codes WHERE batch_id = ? ORDER BY id ASC`, [batchId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ codes: rows });
    });
});

app.post('/api/codes/redeem', redeemLimiter, authenticateToken, (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });

    db.get(`SELECT * FROM codes WHERE code = ?`, [code.toUpperCase()], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'Code does not exist' });
        if (row.is_used) return res.status(400).json({ error: 'Code already used' });

        db.get(`SELECT value FROM app_settings WHERE key = 'coins_per_code'`, [], (err, setting) => {
            const coinsToAdd = parseInt((setting && setting.value) || '1');
            const now = new Date().toISOString();
            db.run(`UPDATE codes SET is_used = 1, used_by = ?, used_at = ? WHERE id = ?`,
            [req.user.id, now, row.id], function(err) {
                if (err) return res.status(500).json({ error: 'Database error' });

                db.run(`UPDATE users SET coins = coins + ? WHERE id = ?`, [coinsToAdd, req.user.id], function(err) {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json({ message: `Code redeemed successfully, ${coinsToAdd} coin(s) added!`, coins_added: coinsToAdd });
                });
            });
        });
    });
});

// =======================
// ADMIN SETTINGS APIs
// =======================

app.get('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
    db.all(`SELECT key, value FROM app_settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        res.json({ settings });
    });
});

app.put('/api/admin/settings', authenticateToken, requireAdmin, (req, res) => {
    const { codes_per_batch, coins_per_code } = req.body;
    const codesVal = parseInt(codes_per_batch);
    const coinsVal = parseInt(coins_per_code);

    if (isNaN(codesVal) || codesVal < 1 || codesVal > 10000)
        return res.status(400).json({ error: 'codes_per_batch must be between 1 and 10000' });
    if (isNaN(coinsVal) || coinsVal < 1 || coinsVal > 100)
        return res.status(400).json({ error: 'coins_per_code must be between 1 and 100' });

    db.serialize(() => {
        db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('codes_per_batch', ?)`, [codesVal.toString()]);
        db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('coins_per_code', ?)`, [coinsVal.toString()], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({
                message: 'Settings updated successfully',
                settings: { codes_per_batch: codesVal, coins_per_code: coinsVal }
            });
        });
    });
});

app.get('/api/admin/video-prices', authenticateToken, requireAdmin, (req, res) => {
    const grades = ['grade1', 'grade2', 'grade3'];
    let allVideos = [];
    
    grades.forEach(grade => {
        const dirPath = path.join(__dirname, 'videos', grade);
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.mp4') || f.endsWith('.mkv'));
            files.forEach(f => {
                allVideos.push({
                    video_path: `${grade}/${f}`,
                    title: f,
                    grade: grade
                });
            });
        }
    });

    db.all(`SELECT * FROM video_prices`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        const priceMap = {};
        rows.forEach(r => priceMap[r.video_path] = r.price);
        
        const result = allVideos.map(v => ({
            ...v,
            price: priceMap[v.video_path] || 1
        }));
        
        res.json({ videos: result });
    });
});

app.put('/api/admin/video-prices', authenticateToken, requireAdmin, (req, res) => {
    const { updates } = req.body; // Array of { video_path, price }
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates must be an array' });

    db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO video_prices (video_path, price) VALUES (?, ?)`);
        updates.forEach(u => {
            stmt.run(u.video_path, parseInt(u.price || 1));
        });
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Video prices updated successfully' });
        });
    });
});

// =======================
// VIDEOS APIs
// =======================

app.get('/api/videos/my-videos', authenticateToken, (req, res) => {
    db.all(`SELECT video_path, last_position FROM unlocked_videos WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        const videos = rows.map(row => {
            const parts = row.video_path.split('/');
            const grade = parts[0];
            const file = parts[1];
            return {
                id: Buffer.from(row.video_path).toString('hex'),
                title: file,
                grade: grade,
                lastPosition: row.last_position || 0
            };
        });
        
        res.json({ videos });
    });
});

app.get('/api/videos/:grade', authenticateToken, (req, res) => {
    const { grade } = req.params;
    if (!['grade1', 'grade2', 'grade3'].includes(grade)) {
        return res.status(400).json({ error: 'Invalid grade' });
    }

    const dirPath = path.join(__dirname, 'videos', grade);
    if (!fs.existsSync(dirPath)) {
        return res.json({ videos: [] });
    }

    fs.readdir(dirPath, (err, files) => {
        if (err) return res.status(500).json({ error: 'Error reading videos directory' });

        const videoFiles = files.filter(file => file.endsWith('.mp4') || file.endsWith('.mkv'));

        db.all(`SELECT video_path, last_position FROM unlocked_videos WHERE user_id = ?`, [req.user.id], (err, unlockedRows) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            const unlockedMap = {};
            unlockedRows.forEach(row => unlockedMap[row.video_path] = row.last_position);

            db.all(`SELECT * FROM video_prices`, [], (err, priceRows) => {
                const priceMap = {};
                priceRows.forEach(r => priceMap[r.video_path] = r.price);

                const result = videoFiles.map(file => {
                    const videoPath = `${grade}/${file}`;
                    return {
                        id: Buffer.from(videoPath).toString('hex'),
                        title: file,
                        fileName: file,
                        grade: grade,
                        price: priceMap[videoPath] || 1,
                        isUnlocked: !!unlockedMap[videoPath],
                        lastPosition: unlockedMap[videoPath] || 0
                    };
                });
                res.json({ videos: result });
            });
        });
    });
});

app.post('/api/videos/unlock', authenticateToken, (req, res) => {
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ error: 'Video ID required' });

    const videoPath = Buffer.from(videoId, 'hex').toString('utf8');

    db.get(`SELECT price FROM video_prices WHERE video_path = ?`, [videoPath], (err, priceRow) => {
        const price = (priceRow && priceRow.price) !== undefined ? priceRow.price : 1;

        db.get(`SELECT coins FROM users WHERE id = ?`, [req.user.id], (err, user) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (user.coins < price) return res.status(400).json({ error: `Not enough coins. This video costs ${price} coin(s).` });

            db.get(`SELECT * FROM unlocked_videos WHERE user_id = ? AND video_path = ?`, [req.user.id, videoPath], (err, unlocked) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                if (unlocked) return res.status(400).json({ error: 'Video already unlocked' });

                db.run(`UPDATE users SET coins = coins - ? WHERE id = ?`, [price, req.user.id], function(err) {
                    if (err) return res.status(500).json({ error: 'Database error' });

                    db.run(`INSERT INTO unlocked_videos (user_id, video_path) VALUES (?, ?)`, [req.user.id, videoPath], function(err) {
                        if (err) return res.status(500).json({ error: 'Database error' });
                        res.json({ message: `Video unlocked successfully! ${price} coin(s) deducted.` });
                    });
                });
            });
        });
    });
});

app.post('/api/videos/progress/:id', authenticateToken, (req, res) => {
    const videoId = req.params.id;
    const { position } = req.body;
    const videoPath = Buffer.from(videoId, 'hex').toString('utf8');

    db.run(`UPDATE unlocked_videos SET last_position = ? WHERE user_id = ? AND video_path = ?`,  
    [position, req.user.id, videoPath], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Progress saved' });
    });
});

app.get('/api/videos/stream/:id', (req, res) => {
    // For streaming in browser <img> or <video> tags, we get token from query since headers aren't sent natively
    const token = req.query.token;
    if (!token) return res.status(401).send('Access Denied');

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send('Invalid Token');

        const videoId = req.params.id;
        const videoPathRelative = Buffer.from(videoId, 'hex').toString('utf8');

        // Check if unlocked
        db.get(`SELECT * FROM unlocked_videos WHERE user_id = ? AND video_path = ?`, [user.id, videoPathRelative], (err, row) => {
            if (err || !row) {
                // Ignore check if admin
                if (user.role !== 'admin') {
                    return res.status(403).send('Video not unlocked');
                }
            }

            const videoPath = path.join(__dirname, 'videos', videoPathRelative);

            // Prevent path traversal
            if (!videoPath.startsWith(path.join(__dirname, 'videos'))) {
                return res.status(403).send('Forbidden');
            }

            if (!fs.existsSync(videoPath)) {
                return res.status(404).send('Video not found');
            }

            const stat = fs.statSync(videoPath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(videoPath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                };
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                };
                res.writeHead(200, head);
                fs.createReadStream(videoPath).pipe(res);
            }
        });
    });
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
