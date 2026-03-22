const http = require('http');

const BASE_URL = 'http://localhost:3000/api';
const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'adminpassword';

function request(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) reject({ status: res.statusCode, data: json });
                    else resolve(json);
                } catch (e) {
                    reject({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', (e) => reject(e));
        if (postData) req.write(JSON.stringify(postData));
        req.end();
    });
}

async function testMessaging() {
    try {
        console.log('--- Phase 1: Authentication ---');
        const loginOptions = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        };
        const loginRes = await request(loginOptions, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
        const token = loginRes.token;
        console.log('Login successful.');

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        console.log('\n--- Phase 2: Fetch Student List ---');
        const studentsOptions = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/students/list',
            method: 'GET',
            headers: authHeaders
        };
        const studentsRes = await request(studentsOptions);
        const students = studentsRes.students;
        
        if (!students || students.length === 0) {
            console.log('No students found in list!');
            return;
        }

        const testStudent = students[0];
        console.log(`Found ${students.length} students. Sending message to: ${testStudent.name} (${testStudent.id})`);

        console.log('\n--- Phase 3: Send Message ---');
        const msgOptions = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/messages',
            method: 'POST',
            headers: authHeaders
        };
        const msgRes = await request(msgOptions, {
            user_id: testStudent.id,
            message: 'Test message from Antigravity verification script.'
        });
        
        console.log('Success:', msgRes.message);
        console.log('Admin flow verified successfully.');

    } catch (err) {
        console.error('Test failed:', err);
    }
}

testMessaging();
