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

            // Auto-migrate existing DB to add class_time if it doesn't exist
            db.run(`ALTER TABLE users ADD COLUMN class_time TEXT`, (err) => {
                if (err && !err.message.includes("duplicate column name")) {
                    console.error("Migration error adding class_time:", err);
                } else if (!err) {
                    console.log("Migration complete: Added class_time to users table.");
                }
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
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
            const adminPassword = process.env.ADMIN_PASSWORD || 'adminpassword';
            
            db.get(`SELECT * FROM users WHERE email = ?`, [adminEmail], async (err, row) => {
                if (err) {
                    console.error('Error fetching admin user', err);
                    return;
                }
                if (!row) {
                    const salt = await bcrypt.genSalt(10);
                    const hash = await bcrypt.hash(adminPassword, salt);
                    db.run(`INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`, 
                    ['Administrator', adminEmail, hash, 'admin'], (err) => {
                        if (err) {
                            console.error('Error creating default admin', err);
                        } else {
                            console.log('Default administrator account created.');
                        }
                    });
                }
            });
        });
    }
});

module.exports = db;
