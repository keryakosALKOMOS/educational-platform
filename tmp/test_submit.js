const http = require('http');

const PORT = 3000;

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) options.headers['Authorization'] = 'Bearer ' + token;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    try {
        console.log("1. Logging in as super admin...");
        const adminRes = await request('POST', '/api/auth/login', { email: 'admin@admin.com', password: 'adminpassword' });
        const adminToken = JSON.parse(adminRes.data).token;
        
        console.log("2. Creating an exam...");
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const examPayload = {
            title: 'Diagnostic Test',
            description: '',
            duration_minutes: 30,
            start_time: new Date().toISOString(),
            end_time: tomorrow.toISOString(),
            assigned_to_class_time: 'all',
            questions: [
                { question_text: '1+1', option_a: '1', option_b: '2', option_c: '3', option_d: '4', correct_option: 'b' }
            ]
        };
        const examRes = await request('POST', '/api/admin/exams', examPayload, adminToken);
        const examData = JSON.parse(examRes.data);
        console.log("Exam creation response:", examData);
        if (!examData.exam_id) throw new Error("Exam ID not found");
        const examId = examData.exam_id;

        console.log(`3. Registering dummy student...`);
        // Using a random email to prevent duplicate conflicts
        const email = `student${Date.now()}@test.com`;
        await request('POST', '/api/auth/register', { name: 'Student', email, password: 'password', role: 'student' });
        
        console.log(`4. Logging in as student...`);
        const loginRes = await request('POST', '/api/auth/login', { email, password: 'password' });
        const studentToken = JSON.parse(loginRes.data).token;

        console.log(`5. Starting the exam (GET /api/student/exams/${examId})...`);
        const startRes = await request('GET', `/api/student/exams/${examId}`, null, studentToken);
        console.log("Start exam status:", startRes.status);
        console.log("Start exam data:", startRes.data);

        console.log(`6. Submitting the exam...`);
        const submitRes = await request('POST', `/api/student/exams/${examId}/submit`, { answers: {} }, studentToken);
        console.log("Submit exam status:", submitRes.status);
        console.log("Submit exam response:", submitRes.data);
        
    } catch (e) {
        console.error(e);
    }
}

test();
