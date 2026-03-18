const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '../db/database.sqlite');
const db = new sqlite3.Database(dbPath);

const emailToFind = 'keroo@gmail.com';

db.get(`SELECT id, name, email, password, length(email) as email_len, length(password) as pass_len FROM users WHERE email LIKE ?`, [`%${emailToFind}%`], (err, row) => {
    if (row) {
        console.log('User found with LIKE:');
        console.log(JSON.stringify(row, null, 2));
        console.log(`Email hex: ${Buffer.from(row.email).toString('hex')}`);
        // Password hex might be too long, but let's check if it ends with something weird
    } else {
        console.log('User not found even with LIKE.');
    }
    db.close();
});
