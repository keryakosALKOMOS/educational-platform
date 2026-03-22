const sqlite3 = require('sqlite3').verbose();
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

// Initialize Firebase Admin
if (!process.env.FIREBASE_PROJECT_ID) {
    console.error('Error: FIREBASE_PROJECT_ID not set in environment.');
    process.exit(1);
}

admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID
});

const firestore = admin.firestore();
const dbPath = path.join(__dirname, '..', 'db', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

async function migrate() {
    console.log('Starting migration from SQLite to Firestore...');
    
    db.all(`SELECT id, name, email, role, coins, permissions, class_time FROM users`, [], async (err, rows) => {
        if (err) {
            console.error('Error fetching users from SQLite:', err);
            process.exit(1);
        }

        console.log(`Found ${rows.length} users to migrate.`);
        const batch = firestore.batch();

        for (const user of rows) {
            const userRef = firestore.collection('users').doc(user.id.toString());
            const permissions = JSON.parse(user.permissions || '[]');
            
            batch.set(userRef, {
                name: user.name,
                email: user.email,
                role: user.role,
                coins: user.coins || 0,
                permissions: permissions,
                class_time: user.class_time || null,
                migrated_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            console.log(`Queued user: ${user.email}`);
        }

        try {
            await batch.commit();
            console.log('Migration completed successfully!');
        } catch (e) {
            console.error('Error committing to Firestore:', e);
        } finally {
            db.close();
        }
    });
}

migrate();
