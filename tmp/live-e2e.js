const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    console.log('Starting Live End-to-End Test (Port 3000)...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Admin Login
        console.log('Navigating to login...');
        await page.goto('http://localhost:3000/login.html');
        await page.fill('input[type="email"]', 'admin@admin.com');
        await page.fill('input[type="password"]', 'adminpassword');
        await page.click('button[type="submit"]');

        await page.waitForTimeout(2000);
        console.log('Admin login successful.');

        // 2. Generate Codes
        console.log('Navigating to Admin Panel...');
        await page.goto('http://localhost:3000/admin.html');
        
        console.log('Generating 5 codes...');
        await page.click('button.generate-btn'); // Matches "Generate 5 Codes" visually
        await page.waitForTimeout(2000);
        
        // Ensure new batch appears
        const batchItem = await page.locator('.batch-item').first();
        assert(await batchItem.isVisible(), 'Batch item should be visible');
        
        console.log('Navigating to Batch Details...');
        const viewBtn = await batchItem.locator('button.view-btn').first();
        await viewBtn.click();
        await page.waitForTimeout(2000);

        // 3. Copy Code
        console.log('Extracting generated code...');
        const codeElement = await page.locator('.code-text').first();
        const codeText = await codeElement.innerText();
        console.log('Copied Code:', codeText);
        assert(codeText.length > 5, 'Code should be non-empty');

        // 4. Logout
        console.log('Logging out as admin...');
        await page.goto('http://localhost:3000/api/logout');
        await page.waitForTimeout(1000);

        // 5. Student Registration & Login
        const studentEmail = `live_test_${Date.now()}@example.com`;
        console.log('Navigating to Register for student:', studentEmail);
        await page.goto('http://localhost:3000/register.html');
        await page.fill('input[id="name"]', 'Live Tester');
        await page.fill('input[id="email"]', studentEmail);
        await page.fill('input[id="password"]', 'password123');
        await page.click('button[type="submit"]');

        await page.waitForTimeout(2000);
        
        console.log('Logging in as new student...');
        await page.goto('http://localhost:3000/login.html');
        await page.fill('input[type="email"]', studentEmail);
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        
        await page.waitForTimeout(2000);
        assert(page.url().includes('dashboard.html'), 'Should redirect to dashboard');

        // 6. Redeem Code
        console.log('Redeeming code...');
        await page.fill('input[id="code-input"]', codeText);
        await page.click('button[onclick="redeemCode()"]');
        
        // Wait for Toast/Alert
        await page.waitForTimeout(2000);

        // 7. Verify Balance
        const balanceElement = await page.locator('#user-coins');
        const balanceText = await balanceElement.innerText();
        console.log('Final Student Balance:', balanceText);
        
        // By default settings we configured earlier, a code should be 10 coins
        // It should definitely NOT be 0.
        assert(parseInt(balanceText.replace(/[^0-9]/g, '')) > 0, 'Balance should increase after redemption');

        console.log('====================================');
        console.log('SUCCESS: Live E2E Verification Complete!');
        console.log('====================================');
    } catch (e) {
        console.error('Test Failed:', e);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
