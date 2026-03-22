const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const db = require('./db/database');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const webpush = require('web-push');
const admin = require('firebase-admin');

// Initialize Firebase Admin
let firestore = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Support loading from environment variable (useful for Railway)
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        // Fix for common newline issue in environment variables
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firestore = admin.firestore();
        console.log('Firebase Admin initialized successfully using FIREBASE_SERVICE_ACCOUNT environment variable.');
    } else if (fs.existsSync('./firebase-service-account.json')) {
        const serviceAccount = require('./firebase-service-account.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firestore = admin.firestore();
        console.log('Firebase Admin initialized successfully using local service account JSON.');
    } else if (process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID
        });
        firestore = admin.firestore();
        console.log('Firebase Admin initialized for project:', process.env.FIREBASE_PROJECT_ID);
    } else {
        console.warn('Firebase credentials not found. Firebase features will be disabled.');
    }
} catch (err) {
    console.error('Error initializing Firebase Admin:', err.message);
}

const uploadsDir = path.join(__dirname, 'tmp', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: uploadsDir });

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const SUPER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@admin.com').toLowerCase();

let vapidKeys;
const vapidPath = path.join(__dirname, 'db', 'vapid.json');
if (fs.existsSync(vapidPath)) {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
} else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys));
}
const mailtoUrl = SUPER_ADMIN_EMAIL.includes('@') ? `mailto:${SUPER_ADMIN_EMAIL}` : 'mailto:admin@example.com';
webpush.setVapidDetails(mailtoUrl, vapidKeys.publicKey, vapidKeys.privateKey);

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

const requirePermission = (permission) => {
    return (req, res, next) => {
        if (req.user && req.user.role === 'admin') {
            if (firestore) {
                // Fetch from Firestore
                firestore.collection('users').doc(req.user.id.toString()).get()
                    .then(doc => {
                        let perms;
                        if (doc.exists) {
                            perms = doc.data().permissions || [];
                        } else {
                            perms = req.user.permissions || [];
                        }
                        
                        if (perms.includes(permission)) {
                            next();
                        } else {
                            return res.status(403).json({ error: `Missing permission: ${permission}` });
                        }
                    })
                    .catch(err => {
                        console.error('Firestore permission error:', err);
                        res.status(500).json({ error: 'SQLite error' });
                    });
            } else {
                // Fallback to SQLite
                db.get(`SELECT permissions FROM users WHERE id = ?`, [req.user.id], (err, user) => {
                    if (err) {
                        console.error('SQLite permission error:', err);
                        return res.status(500).json({ error: 'SQLite access error: ' + err.message });
                    }
                    if (!user) return res.status(403).json({ error: 'Access Denied' });
                    const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : (user.permissions || []);
                    if (perms.includes(permission)) {
                        next();
                    } else {
                        return res.status(403).json({ error: `Missing permission: ${permission}` });
                    }
                });
            }
        } else {
            return res.status(403).json({ error: 'Admin access required' });
        }
    };
};

// =======================
// AUTHENTICATION APIs
// =======================

app.post('/api/auth/register', async (req, res) => {
    let { name, email, password, class_time } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    email = email.toLowerCase();

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        db.run(`INSERT INTO users (name, email, password, role, class_time) VALUES (?, ?, ?, ?, ?)`, 
        [name, email, hash, 'student', class_time || null], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                console.error('SQLite register error:', err);
                return res.status(500).json({ error: 'SQLite access error: ' + err.message });
            }
            
            const userId = this.lastID;

            // Sync to Firestore if enabled
            if (firestore) {
                firestore.collection('users').doc(userId.toString()).set({
                    name,
                    email,
                    role: 'student',
                    coins: 0,
                    class_time: class_time || null,
                    permissions: [],
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.error('Firestore sync error:', err));
            }
            
            const token = jwt.sign({ id: userId, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user: { id: userId, name, email, role: 'student', coins: 0 } });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', (req, res) => {
    let { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    email = email.toLowerCase();
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) {
            console.error('SQLite login error:', err);
            return res.status(500).json({ error: 'SQLite access error: ' + err.message });
        }
        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        if (firestore) {
            // Fetch fresh data from Firestore (coins, role, permissions)
            firestore.collection('users').doc(user.id.toString()).get()
                .then(doc => {
                    const userData = doc.exists ? doc.data() : user;
                    const permissions = userData.permissions || (typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : (user.permissions || []));
                    const coins = userData.coins !== undefined ? userData.coins : user.coins;
                    const token = jwt.sign({ id: user.id, role: userData.role || user.role, permissions }, JWT_SECRET, { expiresIn: '24h' });
                    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: userData.role || user.role, coins, permissions } });
                })
                .catch(err => {
                    console.error('Firestore login error:', err);
                    const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : (user.permissions || []);
                    const token = jwt.sign({ id: user.id, role: user.role, permissions }, JWT_SECRET, { expiresIn: '24h' });
                    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, coins: user.coins, permissions } });
                });
        } else {
            const permissions = JSON.parse(user.permissions || '[]');
            const token = jwt.sign({ id: user.id, role: user.role, permissions }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, coins: user.coins, permissions } });
        }
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, name, email, role, coins, permissions, class_time FROM users WHERE id = ?`, [req.user.id], async (err, user) => {
        if (err) {
            console.error('SQLite me error:', err);
            return res.status(500).json({ error: 'SQLite access error: ' + err.message });
        }
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (firestore) {
            try {
                const doc = await firestore.collection('users').doc(user.id.toString()).get();
                if (doc.exists) {
                    const data = doc.data();
                    user.coins = data.coins !== undefined ? data.coins : user.coins;
                    user.role = data.role || user.role;
                    user.permissions = data.permissions || (typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : (user.permissions || []));
                    user.class_time = data.class_time || user.class_time;
                } else {
                    user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : (user.permissions || []);
                }
            } catch (e) {
                console.error('Firestore me error:', e);
                user.permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions || '[]') : (user.permissions || []);
            }
        } else {
            user.permissions = JSON.parse(user.permissions || '[]');
        }
        res.json({ user });
    });
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
    // Client simply drops token. Sending success.
    res.json({ message: 'Logged out successfully' });
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
    let { name, email, password, class_time } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    email = email.toLowerCase();

    // Endpoints for push notifications
    app.post('/api/push/subscribe', authenticateToken, (req, res) => {
        const subscription = req.body;
        db.run(`UPDATE users SET push_subscription = ? WHERE id = ?`, [JSON.stringify(subscription), req.user.id], function(err) {
            if (err) return res.status(500).json({ error: 'SQLite error' });
            res.status(201).json({ message: 'Subscribed securely' });
        });
    });

    app.get('/api/push/public-key', (req, res) => {
        res.json({ publicKey: vapidKeys.publicKey });
    });

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
// ADMIN MANAGEMENT APIs
// =======================

app.get('/api/admin/admins', authenticateToken, requirePermission('manage_admins'), (req, res) => {
    db.all(`SELECT id, name, email, role, permissions FROM users WHERE role = 'admin'`, (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        const admins = rows.map(r => ({ ...r, permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions || '[]') : (r.permissions || []) }));
        res.json({ admins });
    });
});

app.post('/api/admin/admins', authenticateToken, requirePermission('manage_admins'), async (req, res) => {
    let { name, email, password, permissions } = req.body;
    if (!name || !email || !password || !permissions) return res.status(400).json({ error: 'All fields are required' });
    email = email.toLowerCase();

    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const permsJson = JSON.stringify(permissions);

        db.run(`INSERT INTO users (name, email, password, role, permissions) VALUES (?, ?, ?, 'admin', ?)`,
        [name, email, hash, permsJson], function(err) {
            if (err) return res.status(400).json({ error: 'Email already exists or database error' });
            
            const adminId = this.lastID;
            if (firestore) {
                firestore.collection('users').doc(adminId.toString()).set({
                    name,
                    email,
                    role: 'admin',
                    coins: 0,
                    permissions: permissions || [],
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.error('Firestore admin create error:', err));
            }
            
            res.json({ message: 'Admin created successfully', id: adminId });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.put('/api/admin/admins/:id', authenticateToken, requirePermission('manage_admins'), async (req, res) => {
    let { name, email, permissions, password } = req.body;
    const adminId = req.params.id;
    if (email) email = email.toLowerCase();

    // Protection: Prevent changing email for super-admin
    db.get(`SELECT email FROM users WHERE id = ?`, [adminId], async (err, row) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        if (row && row.email === SUPER_ADMIN_EMAIL && email !== SUPER_ADMIN_EMAIL) {
            return res.status(403).json({ error: 'Cannot change email for the main super-admin' });
        }

        const updateFirestore = (updatedPerms) => {
            if (firestore) {
                firestore.collection('users').doc(adminId.toString()).update({
                    name,
                    email,
                    permissions: updatedPerms || permissions || []
                }).catch(err => console.error('Firestore admin update error:', err));
            }
        };

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            db.run(`UPDATE users SET name = ?, email = ?, password = ?, permissions = ? WHERE id = ? AND role = 'admin'`,
            [name, email, hash, JSON.stringify(permissions), adminId], function(err) {
                if (err) return res.status(400).json({ error: 'Database error' });
                updateFirestore(permissions);
                res.json({ message: 'Admin updated successfully' });
            });
        } else {
            db.run(`UPDATE users SET name = ?, email = ?, permissions = ? WHERE id = ? AND role = 'admin'`,
            [name, email, JSON.stringify(permissions), adminId], function(err) {
                if (err) return res.status(400).json({ error: 'Database error' });
                updateFirestore(permissions);
                res.json({ message: 'Admin updated successfully' });
            });
        }
    });
});

app.delete('/api/admin/admins/:id', authenticateToken, requirePermission('manage_admins'), (req, res) => {
    const adminId = req.params.id;
    
    // Protection: Prevent deleting super-admin
    db.get(`SELECT email FROM users WHERE id = ?`, [adminId], (err, row) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        if (row && row.email === SUPER_ADMIN_EMAIL) {
            return res.status(403).json({ error: 'Cannot delete the main super-admin account' });
        }

        console.log(`[Admin Delete] Attempting to delete admin ID: ${adminId}`);
        db.run(`DELETE FROM users WHERE id = ? AND role = 'admin'`, [adminId], function(err) {
            if (err) {
                console.error(`[Admin Delete] Error deleting ID ${adminId}:`, err);
                return res.status(400).json({ error: 'Database error' });
            }
            if (this.changes === 0) {
                console.warn(`[Admin Delete] No changes made. ID ${adminId} not found or not an admin.`);
                return res.status(404).json({ error: 'Admin not found' });
            }
            if (firestore) {
                firestore.collection('users').doc(adminId.toString()).delete()
                    .catch(err => console.error('Firestore admin delete error:', err));
            }
            console.log(`[Admin Delete] Successfully deleted admin ID: ${adminId}`);
            res.json({ message: 'Admin deleted successfully' });
        });
    });
});

// =======================
// ADMIN STUDENTS APIs
// =======================

app.get('/api/admin/students', authenticateToken, requirePermission('manage_students'), async (req, res) => {
    if (firestore) {
        try {
            const snapshot = await firestore.collection('users').where('role', '==', 'student').get();
            const students = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                students.push({
                    id: doc.id,
                    name: data.name,
                    email: data.email,
                    coins: data.coins || 0,
                    class_time: data.class_time || null
                });
            });
            // Sort by name
            students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return res.json({ students });
        } catch (err) {
            console.error('Firestore admin students error:', err);
        }
    }

    db.all(`SELECT id, name, email, coins, class_time FROM users WHERE role = 'student' ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ students: rows || [] });
    });
});

app.post('/api/admin/students', authenticateToken, requirePermission('manage_students'), async (req, res) => {
    let { name, email, password, coins, class_time } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
    email = email.toLowerCase();
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        db.run(`INSERT INTO users (name, email, password, role, coins, class_time) VALUES (?, ?, ?, 'student', ?, ?)`, 
        [name, email, hash, parseInt(coins) || 0, class_time || null], function(err) {
            if (err) return res.status(400).json({ error: 'Email already exists or database error' });
            
            const userId = this.lastID;
            if (firestore) {
                firestore.collection('users').doc(userId.toString()).set({
                    name,
                    email,
                    role: 'student',
                    coins: parseInt(coins) || 0,
                    class_time: class_time || null,
                    permissions: [],
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.error('Firestore admin student create error:', err));
            }
            
            res.json({ message: 'Student created successfully', id: userId });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error parsing password' });
    }
});

app.put('/api/admin/students/:id', authenticateToken, requirePermission('manage_students'), async (req, res) => {
    let { name, email, password, coins, class_time } = req.body;
    const studentId = req.params.id;
    if (email) email = email.toLowerCase();

    const updateFirestore = () => {
        if (firestore) {
            const updateData = { name, email, coins: parseInt(coins) || 0, class_time: class_time || null };
            firestore.collection('users').doc(studentId.toString()).update(updateData)
                .catch(err => console.error('Firestore admin student update error:', err));
        }
    };

    if (password && password.trim() !== '') {
        try {
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);
            db.run(`UPDATE users SET name = ?, email = ?, password = ?, coins = ?, class_time = ? WHERE id = ? AND role = 'student'`,
                [name, email, hash, parseInt(coins) || 0, class_time || null, studentId], function(err) {
                    if (err) return res.status(400).json({ error: 'Database error or email format' });
                    updateFirestore();
                    res.json({ message: 'Student updated successfully' });
            });
        } catch (err) {
            res.status(500).json({ error: 'Server error parsing password' });
        }
    } else {
        db.run(`UPDATE users SET name = ?, email = ?, coins = ?, class_time = ? WHERE id = ? AND role = 'student'`,
            [name, email, parseInt(coins) || 0, class_time || null, studentId], function(err) {
                if (err) return res.status(400).json({ error: 'Database error or email format' });
                updateFirestore();
                res.json({ message: 'Student updated successfully' });
        });
    }
});

app.delete('/api/admin/students/:id', authenticateToken, requirePermission('manage_students'), (req, res) => {
    const studentId = req.params.id;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(`DELETE FROM unlocked_videos WHERE user_id = ?`, [studentId]);
        db.run(`UPDATE codes SET is_used = 0, used_by = NULL, used_at = NULL WHERE used_by = ?`, [studentId]);
        db.run(`DELETE FROM users WHERE id = ? AND role = 'student'`, [studentId], function(err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'SQLite error' });
            }
            if (firestore) {
                firestore.collection('users').doc(studentId.toString()).delete()
                    .catch(err => console.error('Firestore admin student delete error:', err));
            }
            db.run('COMMIT', (commitErr) => {
                if (commitErr) return res.status(500).json({ error: 'Error committing deletion' });
                res.json({ message: 'Student deleted successfully' });
            });
        });
    });
});

// =======================
// MESSAGING APIs
// =======================

app.get('/api/admin/students/list', authenticateToken, requirePermission('manage_students'), async (req, res) => {
    if (firestore) {
        try {
            const snapshot = await firestore.collection('users').where('role', '==', 'student').get();
            const students = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                students.push({
                    id: doc.id,
                    name: data.name,
                    email: data.email
                });
            });
            // Sort by name
            students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return res.json({ students });
        } catch (err) {
            console.error('Firestore students list error:', err);
            // Fallback to SQLite if Firestore fails
        }
    }

    db.all(`SELECT id, name, email FROM users WHERE role = 'student' ORDER BY name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ students: rows || [] });
    });
});

app.post('/api/admin/messages', authenticateToken, requirePermission('manage_students'), (req, res) => {
    const { user_id, message } = req.body;
    if (!user_id || !message) return res.status(400).json({ error: 'Recipient and message required' });

    db.run(`INSERT INTO messages (user_id, message) VALUES (?, ?)`, [user_id, message], function(err) {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ message: 'Message sent successfully' });
    });
});

app.get('/api/student/messages', authenticateToken, (req, res) => {
    db.all(`SELECT id, message, is_read, created_at FROM messages WHERE user_id = ? ORDER BY id DESC`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ messages: rows });
    });
});

app.get('/api/student/messages/unread-count', authenticateToken, (req, res) => {
    db.get(`SELECT COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0`, [req.user.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ count: row.count });
    });
});

app.put('/api/student/messages/read', authenticateToken, (req, res) => {
    db.run(`UPDATE messages SET is_read = 1 WHERE user_id = ?`, [req.user.id], (err) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ message: 'Messages marked as read' });
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

app.post('/api/codes/generate', authenticateToken, requirePermission('manage_codes'), (req, res) => {
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
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ codes: rows });
    });
});

// Get all batches with stats
app.get('/api/codes/batches', authenticateToken, requirePermission('manage_codes'), (req, res) => {
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
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ batches: rows });
    });
});

// Get all codes for a specific batch (for printing)
app.get('/api/codes/batch/:id', authenticateToken, requirePermission('manage_codes'), (req, res) => {
    const batchId = req.params.id;
    db.all(`SELECT * FROM codes WHERE batch_id = ? ORDER BY id ASC`, [batchId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ codes: rows });
    });
});

app.post('/api/codes/redeem', redeemLimiter, authenticateToken, (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });

    db.get(`SELECT * FROM codes WHERE code = ?`, [code.toUpperCase()], (err, row) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        if (!row) return res.status(404).json({ error: 'Code does not exist' });
        if (row.is_used) return res.status(400).json({ error: 'Code already used' });

        db.get(`SELECT value FROM app_settings WHERE key = 'coins_per_code'`, [], (err, setting) => {
            const coinsToAdd = parseInt((setting && setting.value) || '1');
            const now = new Date().toISOString();
            db.run(`UPDATE codes SET is_used = 1, used_by = ?, used_at = ? WHERE id = ?`,
            [req.user.id, now, row.id], function(err) {
                if (err) return res.status(500).json({ error: 'SQLite error' });

                if (firestore) {
                    // Update coins in Firestore
                    const userRef = firestore.collection('users').doc(req.user.id.toString());
                    userRef.update({
                        coins: admin.firestore.FieldValue.increment(coinsToAdd)
                    }).then(() => {
                        res.json({ message: `Code redeemed successfully, ${coinsToAdd} coin(s) added!`, coins_added: coinsToAdd });
                    }).catch(err => {
                        console.error('Firestore redeem error:', err);
                        res.status(500).json({ error: 'Firestore sync error' });
                    });
                } else {
                    db.run(`UPDATE users SET coins = coins + ? WHERE id = ?`, [coinsToAdd, req.user.id], function(err) {
                        if (err) return res.status(500).json({ error: 'SQLite error' });
                        res.json({ message: `Code redeemed successfully, ${coinsToAdd} coin(s) added!`, coins_added: coinsToAdd });
                    });
                }
            });
        });
    });
});

// =======================
// ADMIN SETTINGS APIs
// =======================

app.get('/api/admin/settings', authenticateToken, requirePermission('manage_admins'), (req, res) => {
    db.all(`SELECT key, value FROM app_settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        const settings = {};
        rows.forEach(r => { settings[r.key] = r.value; });
        res.json({ settings });
    });
});

app.put('/api/admin/settings', authenticateToken, requirePermission('manage_admins'), (req, res) => {
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
            if (err) return res.status(500).json({ error: 'SQLite error' });
            res.json({
                message: 'Settings updated successfully',
                settings: { codes_per_batch: codesVal, coins_per_code: coinsVal }
            });
        });
    });
});

app.get('/api/admin/video-prices', authenticateToken, requirePermission('manage_videos'), (req, res) => {
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
        if (err) return res.status(500).json({ error: 'SQLite error' });
        
        const priceMap = {};
        rows.forEach(r => priceMap[r.video_path] = r.price);
        
        const result = allVideos.map(v => ({
            ...v,
            price: priceMap[v.video_path] || 1
        }));
        
        res.json({ videos: result });
    });
});

app.put('/api/admin/video-prices', authenticateToken, requirePermission('manage_videos'), (req, res) => {
    const { updates } = req.body; // Array of { video_path, price }
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Updates must be an array' });

    db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO video_prices (video_path, price) VALUES (?, ?)`);
        updates.forEach(u => {
            stmt.run(u.video_path, parseInt(u.price || 1));
        });
        stmt.finalize((err) => {
            if (err) return res.status(500).json({ error: 'SQLite error' });
            res.json({ message: 'Video prices updated successfully' });
        });
    });
});

// =======================
// VIDEOS APIs
// =======================

app.get('/api/videos/my-videos', authenticateToken, (req, res) => {
    db.all(`SELECT video_path, last_position FROM unlocked_videos WHERE user_id = ?`, [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        
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
            if (err) return res.status(500).json({ error: 'SQLite error' });

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

        db.get(`SELECT coins FROM users WHERE id = ?`, [req.user.id], async (err, user) => {
            if (err) return res.status(500).json({ error: 'SQLite error' });
            
            let currentCoins = user.coins;
            if (firestore) {
                try {
                    const userDoc = await firestore.collection('users').doc(req.user.id.toString()).get();
                    if (userDoc.exists) currentCoins = userDoc.data().coins;
                } catch (e) {
                    console.error('Error fetching coins from Firestore:', e);
                }
            }

            if (currentCoins < price) return res.status(400).json({ error: `Not enough coins. This video costs ${price} coin(s).` });

            db.get(`SELECT * FROM unlocked_videos WHERE user_id = ? AND video_path = ?`, [req.user.id, videoPath], (err, unlocked) => {
                if (err) return res.status(500).json({ error: 'SQLite error' });
                if (unlocked) return res.status(400).json({ error: 'Video already unlocked' });

                if (firestore) {
                    const userRef = firestore.collection('users').doc(req.user.id.toString());
                    userRef.update({
                        coins: admin.firestore.FieldValue.increment(-price)
                    }).then(() => {
                        db.run(`INSERT INTO unlocked_videos (user_id, video_path) VALUES (?, ?)`, [req.user.id, videoPath], function(err) {
                            if (err) return res.status(500).json({ error: 'SQLite error' });
                            res.json({ message: `Video unlocked successfully! ${price} coin(s) deducted.` });
                        });
                    }).catch(err => {
                        console.error('Firestore unlock error:', err);
                        res.status(500).json({ error: 'Firestore sync error' });
                    });
                } else {
                    db.run(`UPDATE users SET coins = coins - ? WHERE id = ?`, [price, req.user.id], function(err) {
                        if (err) return res.status(500).json({ error: 'SQLite error' });

                        db.run(`INSERT INTO unlocked_videos (user_id, video_path) VALUES (?, ?)`, [req.user.id, videoPath], function(err) {
                            if (err) return res.status(500).json({ error: 'SQLite error' });
                            res.json({ message: `Video unlocked successfully! ${price} coin(s) deducted.` });
                        });
                    });
                }
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
        if (err) return res.status(500).json({ error: 'SQLite error' });
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

// =======================
// EXAMS APIs (ADMIN)
// =======================

app.post('/api/admin/exams/generate', authenticateToken, requirePermission('manage_exams'), upload.array('files'), async (req, res) => {
    try {
        const { topic, difficulty, questionCount } = req.body;
        let combinedText = topic || '';
        
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                if (file.mimetype === 'application/pdf') {
                    const dataBuffer = fs.readFileSync(file.path);
                    const pdfData = await pdfParse(dataBuffer);
                    combinedText += '\n' + pdfData.text;
                } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    const result = await mammoth.extractRawText({ path: file.path });
                    combinedText += '\n' + result.value;
                } else if (file.mimetype === 'text/plain') {
                    combinedText += '\n' + fs.readFileSync(file.path, 'utf8');
                }
                fs.unlinkSync(file.path);
            }
        }

        if (!combinedText.trim()) {
            return res.status(400).json({ error: 'Please provide a topic or upload at least one valid file with text.' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `You are an expert educator.
Generate ${questionCount || 5} multiple-choice questions (MCQs) based on the following content.
Difficulty Level: ${difficulty || 'medium'}.
The output MUST be a strict JSON array containing objects with the following schema:
[
  {
    "question_text": "Question text here?",
    "option_a": "First option",
    "option_b": "Second option",
    "option_c": "Third option",
    "option_d": "Fourth option",
    "correct_option": "a" // must be one of: "a", "b", "c", "d"
  }
]
Do not return anything except the valid JSON array string. Extract key concepts and avoid duplicate or weak questions.

Content:
${combinedText.substring(0, 30000)}
`;

        const result = await model.generateContent(prompt);
        let rawResponse = result.response.text().trim();
        
        if (rawResponse.startsWith('```json')) {
            rawResponse = rawResponse.replace(/^```json/g, '').replace(/```$/g, '').trim();
        } else if (rawResponse.startsWith('```')) {
            rawResponse = rawResponse.replace(/^```/g, '').replace(/```$/g, '').trim();
        }

        const questions = JSON.parse(rawResponse);
        res.json({ questions });
    } catch (err) {
        console.error('AI Generation Error:', err);
        res.status(500).json({ error: 'Failed to generate questions. Ensure your API Key is valid and try again.' });
    }
});

app.post('/api/admin/exams', authenticateToken, requirePermission('manage_exams'), (req, res) => {
    let { title, description, duration_minutes, start_time, end_time, assigned_to_class_time, questions } = req.body;
    
    if (!title || !duration_minutes || !start_time || !end_time || !questions || !Array.isArray(questions)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        db.run(`INSERT INTO exams (title, description, duration_minutes, start_time, end_time, assigned_to_class_time) VALUES (?, ?, ?, ?, ?, ?)`,
        [title, description || '', duration_minutes, start_time, end_time, assigned_to_class_time || 'all'], function(err) {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Error creating exam' });
            }
            
            const examId = this.lastID;
            
            // Notify students asynchronously
            db.all(`SELECT push_subscription FROM users WHERE role = 'student' AND push_subscription IS NOT NULL`, [], (err, students) => {
                if (!err && students.length > 0) {
                    const payload = JSON.stringify({
                        title: 'New Exam Available!',
                        body: `Exam "${title}" has been published.`,
                        url: '/student-exams.html'
                    });
                    
                    students.forEach(student => {
                        try {
                            const sub = JSON.parse(student.push_subscription);
                            if (sub && sub.endpoint) {
                                webpush.sendNotification(sub, payload).catch(e => {});
                            }
                        } catch (e) {}
                    });
                }
            });
            const stmt = db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?, ?)`);
            
            for (let q of questions) {
                stmt.run([examId, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option]);
            }
            
            stmt.finalize();
            
            db.run('COMMIT', (err) => {
                if (err) return res.status(500).json({ error: 'Error saving questions' });
                res.json({ message: 'Exam created successfully', exam_id: examId });
            });
        });
    });
});

app.get('/api/admin/exams', authenticateToken, requirePermission('manage_exams'), (req, res) => {
    db.all(`SELECT * FROM exams ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ exams: rows });
    });
});

app.get('/api/admin/exams/:id/questions', authenticateToken, requirePermission('manage_exams'), (req, res) => {
    db.all(`SELECT * FROM questions WHERE exam_id = ?`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ questions: rows });
    });
});

app.delete('/api/admin/exams/:id', authenticateToken, requirePermission('manage_exams'), (req, res) => {
    db.run(`DELETE FROM exams WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ message: 'Exam deleted successfully' });
    });
});

app.get('/api/admin/reports', authenticateToken, requirePermission('manage_exams'), (req, res) => {
    db.all(`SELECT * FROM exam_reports ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ reports: rows });
    });
});

app.delete('/api/admin/reports/:id', authenticateToken, requirePermission('manage_exams'), (req, res) => {
    db.run(`DELETE FROM exam_reports WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        res.json({ message: 'Report deleted successfully' });
    });
});

// =======================
// EXAMS APIs (STUDENT)
// =======================

app.get('/api/student/exams', authenticateToken, (req, res) => {
    const classTime = req.user.class_time || '';
    const nowISO = new Date().toISOString();
    
    db.all(`
        SELECT id, title, description, duration_minutes, start_time, end_time 
        FROM exams 
        WHERE status = 'active'
        AND end_time > ?
        AND (assigned_to_class_time = 'all' OR assigned_to_class_time = ?)
        ORDER BY start_time ASC
    `, [nowISO, classTime], (err, rows) => {
        if (err) return res.status(500).json({ error: 'SQLite error' });
        
        db.all(`SELECT exam_id, status, score FROM student_exams WHERE user_id = ?`, [req.user.id], (err2, studentRows) => {
            const studentExamMap = {};
            if (!err2 && studentRows) {
                studentRows.forEach(sr => studentExamMap[sr.exam_id] = sr);
            }
            
            const results = rows.map(r => ({
                ...r,
                student_status: studentExamMap[r.id] ? studentExamMap[r.id].status : 'not_started',
                student_score: studentExamMap[r.id] ? studentExamMap[r.id].score : null
            }));
            
            res.json({ exams: results });
        });
    });
});

app.get('/api/student/exams/:id', authenticateToken, (req, res) => {
    const examId = req.params.id;
    const nowISO = new Date().toISOString();
    
    db.get(`SELECT * FROM exams WHERE id = ? AND status = 'active'`, [examId], (err, exam) => {
        if (err || !exam) return res.status(404).json({ error: 'Exam not found or no longer active' });
        
        if (exam.start_time > nowISO) {
            return res.status(403).json({ error: 'Exam has not started yet' });
        }
        if (exam.end_time < nowISO) {
            return res.status(403).json({ error: 'Exam has already ended' });
        }
        if (exam.assigned_to_class_time !== 'all' && exam.assigned_to_class_time !== req.user.class_time) {
            return res.status(403).json({ error: 'Not assigned to this exam' });
        }

        db.get(`SELECT * FROM student_exams WHERE user_id = ? AND exam_id = ?`, [req.user.id, examId], (err, studentExam) => {
            if (studentExam && studentExam.status === 'submitted') {
                return res.status(403).json({ error: 'You have already submitted this exam.' });
            }

            if (!studentExam) {
                db.run(`INSERT INTO student_exams (user_id, exam_id, started_at, status) VALUES (?, ?, ?, 'in_progress')`, [req.user.id, examId, nowISO]);
            }
            
            db.all(`SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE exam_id = ?`, [examId], (err, questions) => {
                res.json({ exam, questions }); // Exclude correct_option from output
            });
        });
    });
});

app.post('/api/student/exams/:id/submit', authenticateToken, (req, res) => {
    const examId = req.params.id;
    const answers = req.body.answers || {}; 
    const nowISO = new Date().toISOString();
    
    db.get(`SELECT * FROM student_exams WHERE user_id = ? AND exam_id = ?`, [req.user.id, examId], (err, studentExam) => {
        if (err || !studentExam) return res.status(403).json({ error: 'You have not started this exam.' });
        if (studentExam.status === 'submitted') return res.status(400).json({ error: 'Exam already submitted.' });
        
        db.all(`SELECT id, correct_option FROM questions WHERE exam_id = ?`, [examId], (err, questions) => {
            if (err) return res.status(500).json({ error: 'SQLite error' });
            
            let score = 0;
            questions.forEach(q => {
                if (answers[q.id] === q.correct_option) {
                    score++;
                }
            });
            
            db.run(`UPDATE student_exams SET completed_at = ?, score = ?, total_questions = ?, status = 'submitted' WHERE id = ?`,
            [nowISO, score, questions.length, studentExam.id], function(err) {
                if (err) return res.status(500).json({ error: 'Failed to submit' });
                
                // Insert into reports instantly
                db.get(`SELECT name, email, class_time FROM users WHERE id = ?`, [req.user.id], (err, uRow) => {
                    db.get(`SELECT title FROM exams WHERE id = ?`, [examId], (err, eRow) => {
                        const examTitle = eRow ? eRow.title : 'Unknown Exam';
                        const uName = uRow ? uRow.name : 'Unknown';
                        const uEmail = uRow ? uRow.email : 'Unknown';
                        const uClass = uRow ? uRow.class_time : null;
                        
                        db.run(`INSERT INTO exam_reports (exam_title, user_id, student_name, student_email, class_time, score, total_questions, submitted_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [examTitle, req.user.id, uName, uEmail, uClass, score, questions.length, nowISO, nowISO], () => {
                            res.json({ message: 'Exam submitted successfully', score, total: questions.length });
                        });
                    });
                });
            });
        });
    });
});

// =======================
// BACKGROUND JOB: AUTO-CLEANUP EXAMS
// =======================
setInterval(() => {
    const nowISO = new Date().toISOString();
    db.all(`SELECT id, title FROM exams WHERE end_time < ? AND status = 'active'`, [nowISO], (err, exams) => {
        if (err || !exams || exams.length === 0) return;

        exams.forEach(exam => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                db.run(`UPDATE exams SET status = 'ended' WHERE id = ?`, [exam.id]);
                db.run(`DELETE FROM exams WHERE id = ?`, [exam.id]);
                db.run('COMMIT', (err) => {
                    if (!err) console.log(`[Background] Auto-cleanup processed for exam: ${exam.title}`);
                });
            });
        });
    });
}, 5 * 60 * 1000);

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
