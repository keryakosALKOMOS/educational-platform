const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const keyPath = path.join(__dirname, '..', 'firebase-service-account.json');
console.log('Checking path:', keyPath);
console.log('Exists:', fs.existsSync(keyPath));

try {
    if (fs.existsSync(keyPath)) {
        const serviceAccount = require(keyPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('SUCCESS: Firebase initialized!');
        const db = admin.firestore();
        console.log('Project ID:', admin.app().options.credential.projectId);
    } else {
        console.log('FAILURE: File not found');
    }
} catch (e) {
    console.error('ERROR:', e.message);
}
