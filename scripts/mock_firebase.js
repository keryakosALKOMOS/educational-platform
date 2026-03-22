const mockAdmin = {
    initializeApp: () => { console.log('[Mock] Firebase Initialized'); },
    apps: [{ name: 'mock' }],
    firestore: Object.assign(() => ({
        collection: (name) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({ coins: 10, role: 'student', permissions: [] })
                }),
                set: async (data) => { console.log(`[Mock] Firestore SET users/${id}:`, data); },
                update: async (data) => { console.log(`[Mock] Firestore UPDATE users/${id}:`, data); },
                delete: async () => { console.log(`[Mock] Firestore DELETE users/${id}`); }
            })
        })
    }), {
        FieldValue: {
            increment: (n) => `INCREMENT(${n})`,
            serverTimestamp: () => 'TIMESTAMP'
        }
    })
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(name) {
    if (name === 'firebase-admin') return mockAdmin;
    return originalRequire.apply(this, arguments);
};

process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '3001';
console.log('Firebase Mock Injected');
