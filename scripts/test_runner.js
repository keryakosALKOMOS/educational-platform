const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', ['--require', './scripts/full_mock.js', 'server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '3001' }
});

server.stdout.on('data', (data) => {
    console.log(`[Server]: ${data}`);
    if (data.toString().includes('Connected to the SQLite database')) {
        startTests();
    }
});

server.stderr.on('data', (data) => {
    console.error(`[Server Error]: ${data}`);
});

let testsStarted = false;
async function startTests() {
    if (testsStarted) return;
    testsStarted = true;
    console.log('Starting client tests...');
    
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

        const token = regData.token;

        console.log('\n--- Test 2: Get Me ---');
        const meRes = await fetch(`${baseUrl}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const meData = await meRes.json();
        console.log('Me Response Coins (Mocked 10):', meData.user.coins);

        console.log('\n--- Test 3: Logout ---');
        const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log('Logout Status:', logoutRes.status);

        console.log('\nTests completed successfully!');
        server.kill();
        process.exit(0);
    } catch (e) {
        console.error('Client test failed:', e);
        server.kill();
        process.exit(1);
    }
}

setTimeout(() => {
    if (!testsStarted) {
        console.log('Timeout waiting for server to start. Forcing start...');
        startTests();
    }
}, 5000);
