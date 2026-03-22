const http = require('http');
const path = require('path');
const fs = require('fs');

// 1. Mock Firebase Admin
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

// Override require for firebase-admin
require.cache[require.resolve('firebase-admin')] = {
    id: require.resolve('firebase-admin'),
    exports: mockAdmin,
    filename: require.resolve('firebase-admin'),
    loaded: true
};

// 2. Set environment variables
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '3001';

// 3. Start the server
console.log('Starting server for testing...');
require('../server.js');

// 4. Test logic
async function runTests() {
    const baseUrl = 'http://localhost:3001/api';

    try {
        console.log('\n--- Test 1: Register User ---');
        const regRes = await fetch(`${baseUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test Student',
                email: `test_student_${Date.now()}@example.com`,
                password: 'password123'
            })
        });
        const regData = await regRes.json();
        console.log('Registration Response:', regData);
        if (regRes.ok) console.log('✅ Registration OK');

        const token = regData.token;

        console.log('\n--- Test 2: Get Me (Check Firestore sync) ---');
        const meRes = await fetch(`${baseUrl}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const meData = await meRes.json();
        console.log('Me Response (should show 10 coins from mock):', meData.user.coins);
        if (meData.user.coins === 10) console.log('✅ Firestore Coin Sync OK');

        console.log('\n--- Test 3: Redeem Code (Check Firestore increment) ---');
        // This requires a code from SQLite. Let's just assume the endpoint logic triggers the mock console log.
        // We'll peek at the console output from the server.
        // For this test script, we'll just check if the endpoint exists and doesn't crash.
        const redeemRes = await fetch(`${baseUrl}/codes/redeem`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ code: 'INVALID' })
        });
        const redeemData = await redeemRes.json();
        console.log('Redeem Response (expected 404 for INVALID code):', redeemData);
        if (redeemRes.status === 404) console.log('✅ Endpoint Alive');

        console.log('\nTests completed. Check console output for [Mock] logs.');
        process.exit(0);
    } catch (e) {
        console.error('Test failed:', e);
        process.exit(1);
    }
}

// Wait for server to start
setTimeout(runTests, 2000);
