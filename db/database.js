const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');
require('dotenv').config();

// Ensure db directory exists
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => {
            // Create Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                coins INTEGER DEFAULT 0,
                role TEXT DEFAULT 'student',
                class_time TEXT
            )`);

            // Auto-migrate existing DB to add class_time and permissions if they don't exist
            db.run(`ALTER TABLE users ADD COLUMN class_time TEXT`, (err) => {
                if (err && !err.message.includes("duplicate column name")) console.error("Migration error adding class_time:", err);
            });
            db.run(`ALTER TABLE users ADD COLUMN permissions TEXT`, (err) => {
                if (err && !err.message.includes("duplicate column name")) console.error("Migration error adding permissions:", err);
            });

            // Normalize all existing emails to lowercase
            db.run(`UPDATE users SET email = LOWER(email)`, (err) => {
                if (err) console.error("Migration error normalizing emails:", err);
                else console.log("Migration complete: Normalized all emails to lowercase.");
            });

            // Create Codes table
            db.run(`CREATE TABLE IF NOT EXISTS codes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                is_used BOOLEAN DEFAULT 0,
                used_by INTEGER,
                used_at DATETIME,
                FOREIGN KEY (used_by) REFERENCES users (id)
            )`);

            // Create Unlocked Videos table
            db.run(`CREATE TABLE IF NOT EXISTS unlocked_videos (
                user_id INTEGER,
                video_path TEXT,
                last_position REAL DEFAULT 0,
                PRIMARY KEY (user_id, video_path),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);

            // Create App Settings table
            db.run(`CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )`, (err) => {
                if (!err) {
                    // Insert defaults if not already present
                    db.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('codes_per_batch', '500')`);
                    db.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('coins_per_code', '1')`);
                }
            });

            // Create Video Prices table
            db.run(`CREATE TABLE IF NOT EXISTS video_prices (
                video_path TEXT PRIMARY KEY,
                price INTEGER NOT NULL DEFAULT 1
            )`);

            // Create Exams table
            db.run(`CREATE TABLE IF NOT EXISTS exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                duration_minutes INTEGER NOT NULL,
                start_time DATETIME NOT NULL,
                end_time DATETIME NOT NULL,
                assigned_to_class_time TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'active'
            )`);

            // Create Questions table
            db.run(`CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                question_text TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT NOT NULL,
                option_d TEXT NOT NULL,
                correct_option TEXT NOT NULL,
                FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
            )`);

            // Create Student Exams table
            db.run(`CREATE TABLE IF NOT EXISTS student_exams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                exam_id INTEGER NOT NULL,
                started_at DATETIME NOT NULL,
                completed_at DATETIME,
                score INTEGER,
                total_questions INTEGER,
                status TEXT DEFAULT 'in_progress',
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
            )`);

            // Create Exam Reports table
            db.run(`CREATE TABLE IF NOT EXISTS exam_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_title TEXT,
                user_id INTEGER,
                student_name TEXT,
                student_email TEXT,
                class_time TEXT,
                score INTEGER,
                total_questions INTEGER,
                submitted_at DATETIME,
                ended_at DATETIME
            )`);

            // Create Code Batches table
            db.run(`CREATE TABLE IF NOT EXISTS code_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at DATETIME NOT NULL,
                count INTEGER NOT NULL,
                coins_per_code INTEGER NOT NULL DEFAULT 1
            )`);

            // Migrate codes table: add batch_id column if missing
            db.run(`ALTER TABLE codes ADD COLUMN batch_id INTEGER REFERENCES code_batches(id)`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Migration error adding batch_id:', err);
                } else if (!err) {
                    console.log('Migration complete: Added batch_id to codes table.');
                }
            });

            // Check and insert default admin
            const adminEmail = (process.env.ADMIN_EMAIL || 'admin@admin.com').toLowerCase();
            const adminPassword = process.env.ADMIN_PASSWORD || 'adminpassword';
            
            db.get(`SELECT * FROM users WHERE email = ?`, [adminEmail], async (err, row) => {
                if (err) {
                    console.error('Error fetching admin user', err);
                    return;
                }
                if (!row) {
                    const salt = await bcrypt.genSalt(10);
                    const hash = await bcrypt.hash(adminPassword, salt);
                    const allPermissions = JSON.stringify(['manage_students', 'manage_videos', 'manage_codes', 'manage_admins', 'manage_requests', 'manage_exams']);
                    db.run(`INSERT INTO users (name, email, password, role, permissions) VALUES (?, ?, ?, ?, ?)`, 
                    ['Administrator', adminEmail, hash, 'admin', allPermissions], (err) => {
                        if (err) {
                            console.error('Error creating default admin', err);
                        } else {
                            console.log('Default administrator account created with full permissions.');
                        }
                    });
                } else if (!row.permissions || !row.permissions.includes('manage_exams')) {
                    // Update existing admin if permissions are outdated
                    const allPermissions = JSON.stringify(['manage_students', 'manage_videos', 'manage_codes', 'manage_admins', 'manage_requests', 'manage_exams']);
                    db.run(`UPDATE users SET permissions = ? WHERE email = ?`, [allPermissions, adminEmail], (err) => {
                        if (!err) console.log('Updated existing default admin with full permissions.');
                    });
                }
            });
        });
    }
});

module.exports = db;
