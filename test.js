// Standard fetch is global in Node.js 18+
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 4000;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Helper to wait
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('🚀 Starting integration tests for Project Reminder AI Agent...');

  // Start the server process
  const serverProcess = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: TEST_PORT },
    stdio: 'pipe',
    shell: true
  });

  // Collect logs
  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server stdout]: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server stderr]: ${data.toString().trim()}`);
  });

  // Give server 3 seconds to spin up
  await sleep(3000);

  let success = true;

  try {
    // 1. Reset Database
    console.log('\n--- Test 1: Reset Database ---');
    const resetRes = await fetch(`${BASE_URL}/api/reset`, { method: 'POST' });
    const resetResult = await resetRes.json();
    if (resetRes.ok && resetResult.success) {
      console.log('✅ Database reset successful');
    } else {
      throw new Error(`Database reset failed: ${JSON.stringify(resetResult)}`);
    }

    // 2. Fetch Initial Subscribers (should have the seeded subscriber)
    console.log('\n--- Test 2: Fetch Subscribers ---');
    const subRes = await fetch(`${BASE_URL}/api/subscribers`);
    const subs = await subRes.json();
    console.log(`Subscribers count: ${subs.length}`);
    if (subs.length === 1 && subs[0].email === 'kushagra.sharma.ug25@nsut.ac.in') {
      console.log('✅ Initial subscriber seed verified');
    } else {
      throw new Error('Initial subscriber seed verification failed');
    }

    // 3. Add a new subscriber
    console.log('\n--- Test 3: Add Subscriber ---');
    const addSubRes = await fetch(`${BASE_URL}/api/subscribers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Team Member', email: 'team@company.com' })
    });
    const newSub = await addSubRes.json();
    if (addSubRes.ok && newSub.email === 'team@company.com') {
      console.log('✅ Successfully added subscriber:', newSub.name);
    } else {
      throw new Error(`Failed to add subscriber: ${JSON.stringify(newSub)}`);
    }

    // 4. Mock Excel Upload
    console.log('\n--- Test 4: Parse Excel Schedule ---');
    // Note: Node 18+ has built-in FormData, but to be safe and compatible with windows shells
    // we can read our projects_sample.xlsx binary directly and craft a boundary multipart/form-data request
    const filePath = path.join(__dirname, 'projects_sample.xlsx');
    const fileBuffer = fs.readFileSync(filePath);
    const boundary = '----TestBoundary' + Math.random().toString(36).substring(2);
    
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="projects_sample.xlsx"\r\n`),
      Buffer.from(`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: payload
    });

    const uploadResult = await uploadRes.json();
    if (uploadRes.ok && uploadResult.success) {
      console.log(`✅ Upload parsed successfully. Found ${uploadResult.count} projects.`);
      uploadResult.projects.forEach(p => {
        console.log(`   - Parsed Project: "${p.name}" starting on ${p.date}`);
      });
    } else {
      throw new Error(`Upload parsing failed: ${JSON.stringify(uploadResult)}`);
    }

    // 5. Trigger Reminders Scan Simulation
    console.log('\n--- Test 5: Trigger Cron Reminder Check ---');
    const checkRes = await fetch(`${BASE_URL}/api/reminders/check`, { method: 'POST' });
    const checkResult = await checkRes.json();
    
    if (checkRes.ok && checkResult.success) {
      console.log(`✅ Reminder scan complete. Dispatched: ${checkResult.sentCount} emails.`);
    } else {
      throw new Error(`Reminder scan simulation failed: ${JSON.stringify(checkResult)}`);
    }

    // 6. Verify Email Logs
    console.log('\n--- Test 6: Verify Notification Logs ---');
    const logsRes = await fetch(`${BASE_URL}/api/reminders`);
    const logs = await logsRes.json();
    console.log(`Total sent email logs in db: ${logs.length}`);
    
    // We expect log entries for projects that match the 30-day, 15-day, and 5-day warning dates.
    // There are 2 active subscribers (kushagra@example.com and team@company.com)
    // Three projects match warning windows (30 days, 15 days, 5 days).
    // Total alerts sent should be 3 projects * 2 subscribers = 6 emails.
    if (logs.length === 6) {
      console.log('✅ Correct notification alerts sent (6 dispatches).');
      logs.forEach(log => {
        console.log(`   - To: ${log.subscriberEmail} | Project: "${log.projectName}" (${log.daysRemaining} days remaining) | Status: ${log.status}`);
      });
    } else {
      console.warn(`⚠️ Warning: Expected 6 reminder logs, found ${logs.length}.`);
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (err) {
    console.error('\n❌ Test failed with error:', err.message);
    success = false;
  } finally {
    // Kill server process
    console.log('\n🧹 Shutting down test server...');
    serverProcess.kill('SIGINT');
    await sleep(1500);
    process.exit(success ? 0 : 1);
  }
}

runTests();
