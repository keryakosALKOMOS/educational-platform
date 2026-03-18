const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

const email = 'keroo@gmail.com';
const passwordToTest = 'kero';

db.get(`SELECT password FROM users WHERE email = ?`, [email], (err, row) => {
    if (row) {
        bcrypt.compare(passwordToTest, row.password, (err, matches) => {
            console.log('MATCH_RESULT:' + matches);
            db.close();
        });
    } else {
        console.log('USER_NOT_FOUND');
        db.close();
    }
});
