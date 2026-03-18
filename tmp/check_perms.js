const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'db', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("Checking admin permissions...");
db.get("SELECT * FROM users WHERE email='admin@admin.com'", (err, user) => {
    if (err) throw err;
    console.log("Admin user found:", user ? user.email : 'No admin found');
    console.log("Permissions:", user ? user.permissions : 'N/A');
    
    // If manage_exams is missing from permissions, add it
    if (user && (!user.permissions || !user.permissions.includes('manage_exams'))) {
        const perms = user.permissions ? JSON.parse(user.permissions) : [];
        if (!perms.includes('manage_exams')) perms.push('manage_exams');
        if (!perms.includes('manage_admins')) perms.push('manage_admins');
        if (!perms.includes('manage_students')) perms.push('manage_students');
        if (!perms.includes('manage_videos')) perms.push('manage_videos');
        if (!perms.includes('manage_codes')) perms.push('manage_codes');
        
        db.run("UPDATE users SET permissions = ? WHERE email = 'admin@admin.com'", [JSON.stringify(perms)], function(err) {
            if (err) throw err;
            console.log("Updated admin permissions to include manage_exams:", JSON.stringify(perms));
            
            // Wait, what about the reports table? Is there anything there?
            db.all("SELECT * FROM exam_reports", (err, rows) => {
                if (err) throw err;
                console.log("Exam Reports table count:", rows.length);
                db.close();
            });
        });
    } else {
        db.all("SELECT * FROM exam_reports", (err, rows) => {
            if (err) throw err;
            console.log("Exam Reports table count:", rows.length);
            db.close();
        });
    }
});
