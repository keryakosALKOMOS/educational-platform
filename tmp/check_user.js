const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

const email = 'keroo@gmail.com';
const passwordToTest = 'kero';

db.serialize(() => {
    db.get(`SELECT password FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) {
            console.error('Error querying database:', err.message);
        } else if (row) {
            bcrypt.compare(passwordToTest, row.password, (err, result) => {
                if (err) {
                    console.error('Bcrypt error:', err);
                } else {
                    console.log(`Password match for 'kero': ${result}`);
                    console.log(`Stored Hash: ${row.password}`);
                }
                db.close();
            });
        } else {
            console.log('User not found.');
            db.close();
        }
    });
});
