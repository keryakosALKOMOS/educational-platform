const baseUrl = 'http://localhost:3000';

async function runTest() {
    try {
        console.log("Starting backend integration tests...");
        // 1. Admin Login
        let res = await fetch(baseUrl + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@admin.com', password: 'adminpassword' })
        });
        let adminData = await res.json();
        const adminToken = adminData.token;
        console.log("✅ Admin Login successful");
        
        // 2. Mock AI Generate
        const form = new FormData();
        form.append('topic', 'Math test');
        res = await fetch(baseUrl + '/api/admin/exams/generate', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` },
            body: form
        });
        let genData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(genData));
        console.log("✅ AI Mock Generation successful:", genData.questions.length, "questions returned.");
        
        // 3. Admin create exam
        const now = new Date();
        const later = new Date(now.getTime() + 60*60*1000);
        res = await fetch(baseUrl + '/api/admin/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
            body: JSON.stringify({
                title: 'Integration Test Exam',
                duration_minutes: 15,
                start_time: now.toISOString(),
                end_time: later.toISOString(),
                assigned_to_class_time: 'all',
                questions: genData.questions
            })
        });
        let createData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(createData));
        const examId = createData.exam_id;
        console.log("✅ Exam Created with ID:", examId);

        // 4. Register Student
        const stuEmail = 'stu_' + Date.now() + '@test.com';
        res = await fetch(baseUrl + '/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Student', email: stuEmail, password: '123' })
        });
        let stuData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(stuData));
        const stuToken = stuData.token;
        console.log("✅ Student Registered");

        // 5. Student List Exams
        res = await fetch(baseUrl + '/api/student/exams', {
            headers: { 'Authorization': `Bearer ${stuToken}` }
        });
        let listData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(listData));
        const foundExam = listData.exams.find(e => e.id === examId);
        if (!foundExam) throw new Error("Exam not found in student list!");
        console.log("✅ Student can see the newly created Exam in the list.");

        // 6. Student Start Exam
        res = await fetch(baseUrl + `/api/student/exams/${examId}`, {
            headers: { 'Authorization': `Bearer ${stuToken}` }
        });
        let startData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(startData));
        console.log("✅ Student Started Exam. Received", startData.questions.length, "questions.");

        // 7. Student Submit Exam
        const answers = {};
        startData.questions.forEach(q => answers[q.id] = 'b'); // Just guess 'b' for all
        res = await fetch(baseUrl + `/api/student/exams/${examId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stuToken}` },
            body: JSON.stringify({ answers })
        });
        let submitData = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(submitData));
        console.log("✅ Student Submitted Exam. Score:", submitData.score);
        console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
    } catch (e) {
        console.error("❌ Test failed:", e);
    }
}
runTest();
