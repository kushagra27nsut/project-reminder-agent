import express from 'express';
import cors from 'cors';
import multer from 'multer';
import xlsx from 'xlsx';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import fs from 'fs';
import bcrypt from 'bcryptjs'; // Import bcryptjs for password hashing
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Host-only admin email — only this account can access user analytics
const ADMIN_EMAIL = 'kushagra.sharma.ug25@nsut.ac.in';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Database File setup
const DB_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Database helper functions
const getInitialDB = () => {
  const salt = bcrypt.genSaltSync(10);
  const adminPassword = bcrypt.hashSync('password123', salt);
  return {
    users: [
      { id: 'usr-1', name: 'Kushagra Sharma', email: 'kushagra.sharma.ug25@nsut.ac.in', password: adminPassword, role: 'admin', createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() }
    ],
  workspaces: {},
  projects: [],
  subscribers: [
    { id: '1', name: 'Kushagra Sharma', email: 'kushagra.sharma.ug25@nsut.ac.in', phone: '+91 98765 43210', active: true }
  ],
  settings: {
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: process.env.SMTP_PORT || '587',
    smtpUser: process.env.SMTP_USER || 'kushagra.sharma.ug25@nsut.ac.in',
    slackWebhook: process.env.SLACK_WEBHOOK_URL || '',
    twilioSid: process.env.TWILIO_ACCOUNT_SID || ''
  },
  logs: []
}};

const readDB = () => {
  if (!fs.existsSync(DB_FILE)) {
    const initial = getInitialDB();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(data);
    if (!db.users) db.users = [];
    if (!db.workspaces) db.workspaces = {};
    return db;
  } catch (err) {
    console.error('Error reading database file, resetting to initial structure:', err);
    return getInitialDB();
  }
};

const getContextDB = (req) => {
  const db = readDB();
  const authToken = req.headers['x-auth-token']; // Get auth token from header

  if (authToken) {
    const user = db.users.find(u => u.sessionToken === authToken);
    if (!user || !db.workspaces[user.email]) {
      return null; // No valid user or workspace for this token
    }
    return {
      db,
      userEmail: user.email, // Use email from the found user
      projects: db.workspaces[user.email].projects,
      subscribers: db.workspaces[user.email].subscribers,
      logs: db.workspaces[user.email].logs,
      save: () => writeDB(db)
    };
  }
  // Fallback for guest or invalid token
  return {
    db,
    userEmail: null,
    projects: db.projects || [],
    subscribers: db.subscribers || [], // Guest mode uses global subscribers
    logs: db.logs || [],
    save: () => writeDB(db)
  };
};

const writeDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// Multer upload config
const upload = multer({ dest: UPLOAD_DIR });

// Email Transporter Config
let transporter;
const setupEmailTransporter = async () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    console.log('Real SMTP transporter configured.');
  } else {
    // Generate Ethereal testing account as fallback
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log('--- Ethereal Test Email Account Configured ---');
      console.log(`User: ${testAccount.user}`);
      console.log(`Pass: ${testAccount.pass}`);
      console.log('----------------------------------------------');
    } catch (err) {
      console.error('Failed to create Ethereal account, falling back to mock logger:', err);
      transporter = {
        sendMail: async (mailOptions) => {
          console.log('[MOCK EMAIL SENT]', mailOptions);
          return { messageId: 'mock-id-' + Date.now(), previewUrl: '#' };
        }
      };
    }
  }
};

// Find matching keys in objects for fuzzy-matching column names
const findColumnValue = (row, possibleNames) => {
  const keys = Object.keys(row);
  for (const name of possibleNames) {
    const matchedKey = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (matchedKey !== undefined) {
      return row[matchedKey];
    }
  }
  return null;
};

// Date Parsing Helper
const parseExcelDate = (val) => {
  if (!val) return null;
  // If it's a number (Excel serial date representation)
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  // Try direct parsing
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }
  return null;
};

// Helper: Send Slack Webhook Notification
const sendSlackNotification = async (project, diffDays) => {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return null;
  }

  const statusMsg = diffDays === 0 ? 'Starts Today! 🚀' : `Happening in *${diffDays} days* ⚠️`;
  const payload = {
    text: `⚠️ Project Alert: "${project.name}" starts in ${diffDays} days!`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📢 Project Milestone Alert!",
          emoji: true
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Project Name:* ${project.name}\n*Target Date:* ${project.date}\n*Days Remaining:* ${statusMsg}\n*Description:* _${project.description || 'N/A'}_`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "🤖 _Alert generated by your Project Reminder AI Agent._"
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Slack API responded with status ${response.status}`);
    }
    console.log(`[Slack Notification] Sent successfully for "${project.name}" (${diffDays} days)`);
    return true;
  } catch (err) {
    console.error('[Slack Notification] Error sending to Slack:', err.message);
    return false;
  }
};

// Helper: Send Twilio WhatsApp Notification
const sendTwilioWhatsApp = async (subscriber, project, diffDays) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !fromPhone) {
    return null;
  }

  if (!subscriber.phone) {
    return null;
  }

  // Sanitize and format phone number
  const cleanPhone = subscriber.phone.replace(/[^0-9+]/g, '');
  const to = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
  const statusMsg = diffDays === 0 ? 'Starts Today!' : `Happening in ${diffDays} days`;
  const messageBody = `⚠️ Project Alert: "${project.name}" starts on ${project.date} (${statusMsg}). Description: ${project.description || 'None'}`;

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: `whatsapp:${to}`,
        From: `whatsapp:${fromPhone}`,
        Body: messageBody
      })
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(resData.message || `Twilio error status ${response.status}`);
    }
    console.log(`[Twilio WhatsApp] Sent successfully to ${to} for "${project.name}"`);
    return true;
  } catch (err) {
    console.error('[Twilio WhatsApp] Error sending via Twilio:', err.message);
    return false;
  }
};

const checkAndSendRemindersForWorkspace = async (workspace, workspaceEmail, db) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let sentCount = 0;
  const activeSubscribers = workspace.subscribers ? workspace.subscribers.filter(s => s.active) : [];
  if (activeSubscribers.length === 0) {
    console.log(`[Workspace Check: ${workspaceEmail}] No active subscribers found.`);
    return { success: true, sentCount: 0, message: 'No active subscribers in this workspace.' };
  }
  for (const project of workspace.projects || []) {
    if (!project.date || project.completed) continue;
    const projDate = new Date(project.date);
    projDate.setHours(0, 0, 0, 0);
    const diffTime = projDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const reminderMilestones = [30, 25, 20, 15, 10, 5, 0];
    if (reminderMilestones.includes(diffDays)) {
      // Merge global subscribers with project-specific team members
      const projectRecipients = [...activeSubscribers];
      if (project.teamMembers && Array.isArray(project.teamMembers)) {
        project.teamMembers.forEach(email => {
          if (email && !projectRecipients.some(s => s.email.toLowerCase() === email.toLowerCase())) {
            projectRecipients.push({
              id: 'team-' + Math.random().toString(36).substr(2, 6),
              name: email.split('@')[0],
              email: email,
              phone: '',
              active: true
            });
          }
        });
      }

      for (const subscriber of projectRecipients) {
        // --- Email Dispatch ---
        const emailAlreadySent = (workspace.logs || []).some(
          l => l.projectId === project.id && 
               l.daysRemaining === diffDays && 
               l.subscriberEmail === subscriber.email &&
               l.status === 'success'
        );
        if (!emailAlreadySent) {
          const mailOptions = {
            from: '"Project RemindAI Agent" <agent@projectreminder.ai>',
            to: subscriber.email,
            subject: `⚠️ Reminder: "${project.name}" is in ${diffDays} Days!`,
            html: `
              <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #eaeaea; border-radius: 8px;">
                <h2 style="color: #6366f1; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">Project Milestone Alert</h2>
                <p>Hello <strong>${subscriber.name}</strong>,</p>
                <p>This is your Project Reminder AI Agent. We are checking in on your upcoming project schedules.</p>
                <div style="background-color: #f9fafb; padding: 15px; border-left: 4px solid #6366f1; border-radius: 4px; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0;"><strong>Project:</strong> ${project.name}</p>
                  <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${project.date}</p>
                  <p style="margin: 0;"><strong>Status:</strong> ${diffDays === 0 ? 'Starts Today!' : `Happening in <strong>${diffDays} days</strong>`}</p>
                </div>
                <p style="font-size: 0.9em; color: #6b7280;">You will receive ongoing reminders for this project every 5 days leading up to the start date.</p>
                <hr style="border: 0; border-top: 1px solid #f3f4f6; margin: 20px 0;" />
                <p style="font-size: 0.8em; color: #9ca3af; text-align: center;">Project RemindAI Agent Dashboard &copy; 2026</p>
              </div>
            `
          };

          try {
            const info = await transporter.sendMail(mailOptions);
            const previewUrl = nodemailer.getTestMessageUrl(info) || '#';
            if (!workspace.logs) workspace.logs = [];
            workspace.logs.unshift({
              id: 'log-' + Math.random().toString(36).substr(2, 9),
              projectId: project.id,
              projectName: project.name,
              projectDate: project.date,
              subscriberEmail: subscriber.email,
              daysRemaining: diffDays,
              sentAt: new Date().toISOString(),
              status: 'success',
              previewUrl,
              message: `Successfully sent email notification.`
            });
            sentCount++;
            console.log(`[Workspace Check: ${workspaceEmail}] Email sent to ${subscriber.email} for "${project.name}" (Days: ${diffDays})`);
          } catch (mailErr) {
            console.error(`[Workspace Check: ${workspaceEmail}] Error sending email to ${subscriber.email}:`, mailErr);
            if (!workspace.logs) workspace.logs = [];
            workspace.logs.unshift({
              id: 'log-' + Math.random().toString(36).substr(2, 9),
              projectId: project.id,
              projectName: project.name,
              projectDate: project.date,
              subscriberEmail: subscriber.email,
              daysRemaining: diffDays,
              sentAt: new Date().toISOString(),
              status: 'failed',
              message: mailErr.message
            });
          }
        }
        // --- Twilio WhatsApp Dispatch (If configured) ---
        if (subscriber.phone && process.env.TWILIO_ACCOUNT_SID) {
          const waAlreadySent = (workspace.logs || []).some(
            l => l.projectId === project.id && 
                 l.daysRemaining === diffDays && 
                 l.subscriberEmail === `${subscriber.email} (WhatsApp)` &&
                 l.status === 'success'
          );

          if (!waAlreadySent) {
            try {
              const waSuccess = await sendTwilioWhatsApp(subscriber, project, diffDays);
              if (waSuccess) {
                if (!workspace.logs) workspace.logs = [];
                workspace.logs.unshift({
                  id: 'log-' + Math.random().toString(36).substr(2, 9),
                  projectId: project.id,
                  projectName: project.name,
                  projectDate: project.date,
                  subscriberEmail: `${subscriber.email} (WhatsApp)`,
                  daysRemaining: diffDays,
                  sentAt: new Date().toISOString(),
                  status: 'success',
                  message: `Successfully sent automated Twilio WhatsApp text to ${subscriber.phone}.`
                });
                console.log(`[Workspace Check: ${workspaceEmail}] Twilio WhatsApp sent to ${subscriber.phone} for "${project.name}"`);
              }
            } catch (waErr) {
              console.error(`[Workspace Check: ${workspaceEmail}] Twilio WhatsApp failed:`, waErr);
              if (!workspace.logs) workspace.logs = [];
              workspace.logs.unshift({
                id: 'log-' + Math.random().toString(36).substr(2, 9),
                projectId: project.id,
                projectName: project.name,
                projectDate: project.date,
                subscriberEmail: `${subscriber.email} (WhatsApp)`,
                daysRemaining: diffDays,
                sentAt: new Date().toISOString(),
                status: 'failed',
                message: waErr.message
              });
            }
          }
        }
      }
    }
  }
  return { success: true, sentCount, message: `Successfully ran check. Sent ${sentCount} reminders.` };
};

// Trigger reminders calculation for all workspaces (for CRON)
const checkAndSendRemindersCron = async () => {
  console.log(`[CRON] Initiating daily check for all workspaces...`);
  const db = readDB();
  let totalSent = 0;
  for (const workspaceEmail in db.workspaces) {
    if (db.workspaces.hasOwnProperty(workspaceEmail)) {
      console.log(`[CRON] Processing workspace: ${workspaceEmail}`);
      const workspace = db.workspaces[workspaceEmail];
      const result = await checkAndSendRemindersForWorkspace(workspace, workspaceEmail, db);
      if (result && result.sentCount > 0) {
        totalSent += result.sentCount;
      }
    }
  }
  writeDB(db); // Save all accumulated changes
  console.log(`[CRON] Daily check complete. Total reminders sent across all workspaces: ${totalSent}.`);
};

// API Endpoints

// Authentication Endpoints
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Name, email, and password (min 6 chars) are required.' });
  }
  const db = readDB();
  const cleanEmail = email.trim().toLowerCase();
  if (db.users.some(u => u.email === cleanEmail)) {
    return res.status(400).json({ error: 'Account with this email already exists.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const sessionToken = Math.random().toString(36).substr(2) + Date.now().toString(36);
  const newUser = {
    id: 'usr-' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    email: cleanEmail,
    password: hashedPassword,
    role: 'user',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    sessionToken: sessionToken
  };
  db.users.push(newUser);
  if (!db.workspaces[cleanEmail]) {
    db.workspaces[cleanEmail] = { projects: [], subscribers: [{ id: 'sub-self', name: name.trim(), email: cleanEmail, active: true }], logs: [] };
  }
  writeDB(db);
  res.status(201).json({ success: true, user: { id: newUser.id, name: newUser.name, email: newUser.email, sessionToken } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const db = readDB();
  const cleanEmail = email.trim().toLowerCase();
  const user = db.users.find(u => u.email === cleanEmail);
  if (!user || !user.password) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }
  const sessionToken = Math.random().toString(36).substr(2) + Date.now().toString(36);
  user.lastLoginAt = new Date().toISOString();
  user.sessionToken = sessionToken;
  if (!db.workspaces[cleanEmail]) {
    db.workspaces[cleanEmail] = { projects: [], subscribers: [{ id: 'sub-self', name: user.name, email: cleanEmail, active: true }], logs: [] };
  }
  writeDB(db);
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, sessionToken } });
});

app.post('/api/auth/google', (req, res) => {
  const { name, email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const db = readDB();
  const cleanEmail = email.trim().toLowerCase();
  let user = db.users.find(u => u.email === cleanEmail);
  const sessionToken = Math.random().toString(36).substr(2) + Date.now().toString(36);
  if (!user) {
    user = {
      id: 'usr-' + Math.random().toString(36).substr(2, 9),
      name: (name || email.split('@')[0]).trim(),
      email: cleanEmail,
      provider: 'google',
      role: 'user',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      sessionToken: sessionToken
    };
    db.users.push(user);
  } else {
    user.lastLoginAt = new Date().toISOString();
    user.sessionToken = sessionToken;
  }
  if (!db.workspaces[cleanEmail]) {
    db.workspaces[cleanEmail] = { projects: [], subscribers: [{ id: 'sub-self', name: user.name, email: cleanEmail, active: true }], logs: [] };
  }
  writeDB(db);
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, sessionToken } });
});

app.get('/api/auth/session', (req, res) => {
  const authToken = req.headers['x-auth-token'];
  if (!authToken) {
    return res.status(401).json({ error: 'No active user session.' });
  }
  const db = readDB();
  const user = db.users.find(u => u.sessionToken === authToken);
  if (!user) {
    return res.status(404).json({ error: 'Account not found or session expired.' });
  }
  user.lastLoginAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, sessionToken: user.sessionToken } });
});

app.post('/api/auth/profile', (req, res) => {
  const authToken = req.headers['x-auth-token'];
  if (!authToken) return res.status(401).json({ error: 'Please sign in first.' });
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  const db = readDB();
  const user = db.users.find(u => u.sessionToken === authToken);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  const cleanEmail = email.trim().toLowerCase();
  const existing = db.users.find(u => u.email === cleanEmail && u.id !== user.id);
  if (existing) return res.status(400).json({ error: 'Another account already uses this email.' });

  if (cleanEmail !== user.email) {
    if (db.workspaces && db.workspaces[cleanEmail]) {
      return res.status(400).json({ error: 'A workspace already exists for that email.' });
    }
    if (db.workspaces && db.workspaces[user.email]) {
      db.workspaces[cleanEmail] = db.workspaces[user.email];
      delete db.workspaces[user.email];
    }
  }

  user.name = name.trim();
  user.email = cleanEmail;
  user.role = cleanEmail === ADMIN_EMAIL ? 'admin' : (user.role === 'admin' ? 'user' : user.role);
  user.lastLoginAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, sessionToken: user.sessionToken } });
});

app.post('/api/auth/change-password', async (req, res) => {
  const authToken = req.headers['x-auth-token'];
  if (!authToken) return res.status(401).json({ error: 'Please sign in first.' });
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const db = readDB();
  const user = db.users.find(u => u.sessionToken === authToken);
  if (!user) return res.status(404).json({ error: 'Account not found.' });

  if (user.password) { // Only check current password if one is set
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
  } else if (currentPassword) { // User has no password (Google auth) but provided one
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.provider = user.provider || 'password';
  user.lastPasswordChangeAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, message: 'Password changed successfully.' });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const db = readDB();
  const cleanEmail = email.trim().toLowerCase();
  const user = db.users.find(u => u.email === cleanEmail);
  if (!user) return res.status(404).json({ error: 'No account exists for this email.' });

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.provider = user.provider || 'password';
  user.lastPasswordResetAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, message: 'Password reset successfully. Your workspace data is unchanged.' });
});

// Admin User Tracking Analytics — RESTRICTED to host only
app.get('/api/admin/stats', (req, res) => {
  const ctx = getContextDB(req); // Use context to get authenticated user
  if (!ctx || ctx.userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden: Admin access only.' });
  }
  const db = readDB();
  const totalUsers = db.users.length;
  const liveUsers = db.users.filter(u => u.sessionToken).length; // Count users with active session tokens
  res.json({
    totalUsers,
    liveUsers,
    users: db.users.map(u => ({ id: u.id, name: u.name, email: u.email, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt }))
  });
});

// Logout — clears active session flag
app.post('/api/auth/logout', (req, res) => {
  const authToken = req.headers['x-auth-token'];
  if (!authToken) return res.json({ success: true }); // Already logged out or no token
  const db = readDB();
  const user = db.users.find(u => u.sessionToken === authToken);
  if (user) { user.sessionToken = null; writeDB(db); }

  res.json({ success: true });
});

// Project lists (Context-aware per user)
app.get('/api/projects', (req, res) => {
  const ctx = getContextDB(req);
  if (!ctx) {
    return res.json([]); // Should not happen if guest fallback works, but as a safeguard
  }
  res.json(ctx.projects || []);
});

// Create single project manually
app.post('/api/projects', (req, res) => {
  const { name, date, description } = req.body;
  if (!name || !date) {
    return res.status(400).json({ error: 'Project name and date are required.' });
  }
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'You must be logged in to add a project.' });
  }
  const newProj = {
    id: 'proj-' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    date: date,
    description: description ? description.trim() : 'Manual entry',
    completed: false,
    teamMembers: []
  };
  ctx.projects.push(newProj);
  ctx.save();
  res.status(201).json(newProj);
});

// Toggle Project Completion
app.patch('/api/projects/:id/toggle-complete', (req, res) => {
  const { id } = req.params;
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const proj = ctx.projects.find(p => p.id === id);
  if (!proj) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  proj.completed = !proj.completed;
  ctx.save();
  res.json({ success: true, completed: proj.completed, project: proj });
});

// Invite Team Member to Project
app.post('/api/projects/:id/invite', (req, res) => {
  const { id } = req.params;
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const proj = ctx.projects.find(p => p.id === id);
  if (!proj) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  if (!proj.teamMembers) proj.teamMembers = [];
  const cleanEmail = email.trim().toLowerCase();
  if (!proj.teamMembers.includes(cleanEmail)) {
    proj.teamMembers.push(cleanEmail);
    ctx.save();
  }
  res.json({ success: true, teamMembers: proj.teamMembers });
});

// Delete Project
app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const index = ctx.projects.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Project not found.' });
  }
  ctx.projects.splice(index, 1);
  ctx.save();
  res.json({ success: true, message: 'Project deleted successfully.' });
});

// Subscribers endpoints
app.get('/api/subscribers', (req, res) => {
  const ctx = getContextDB(req);
  if (!ctx) {
    return res.json([]);
  }
  res.json(ctx.subscribers || []);
});

app.post('/api/subscribers', (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'You must be logged in to add subscribers.' });
  }
  const existing = ctx.subscribers.find(s => s.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'Subscriber with this email already exists.' });
  }
  const newSub = {
    id: 'sub-' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    active: true
  };
  ctx.subscribers.push(newSub);
  ctx.save();
  res.status(201).json(newSub);
});

app.delete('/api/subscribers/:id', (req, res) => {
  const { id } = req.params;
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const index = ctx.subscribers.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Subscriber not found.' });
  }
  ctx.subscribers.splice(index, 1);
  ctx.save();
  res.json({ success: true, message: 'Subscriber removed.' });
});

// Reminders endpoints
app.get('/api/reminders', (req, res) => {
  const ctx = getContextDB(req);
  if (!ctx) {
    return res.json([]);
  }
  res.json(ctx.logs || []);
});

// Upload Excel
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }
  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.status(401).json({ error: 'You must be logged in to upload projects.' });
  }
  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    fs.unlinkSync(req.file.path);

    const parsedProjects = [];
    const dateNames = ['date', 'deadline', 'due date', 'start date', 'target date', 'time'];
    const titleNames = ['project name', 'project', 'title', 'name', 'activity'];

    data.forEach((row, index) => {
      const name = findColumnValue(row, titleNames) || `Project ${index + 1}`;
      const rawDate = findColumnValue(row, dateNames);
      const formattedDate = parseExcelDate(rawDate);
      if (formattedDate) {
        parsedProjects.push({
          id: 'proj-' + Math.random().toString(36).substr(2, 9),
          name: String(name).trim(),
          date: formattedDate,
          description: row.description || row.Description || 'Uploaded schedule',
          completed: false,
          teamMembers: []
        });
      }
    });

    if (parsedProjects.length === 0) {
      return res.status(400).json({ error: 'No valid projects found.' });
    }

    ctx.projects = parsedProjects;
    ctx.save();

    res.json({ success: true, count: parsedProjects.length, projects: parsedProjects });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file.' });
  }
});

// Settings endpoints
app.get('/api/settings', (req, res) => {
  const db = readDB();
  res.json(db.settings || {});
});

app.post('/api/settings', (req, res) => {
  const ctx = getContextDB(req);
  if (!ctx || ctx.userEmail !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Forbidden: Admin access only.' });
  }
  const db = ctx.db; // Use the db object from context
  db.settings = { ...(db.settings || {}), ...req.body };
  writeDB(db);
  res.json({ success: true, settings: db.settings });
});

// Trigger reminders scan manually
app.post('/api/reminders/check', async (req, res) => {
  const ctx = getContextDB(req);
  if (!ctx || !ctx.userEmail) {
    return res.status(401).json({ error: 'Authentication required to run a manual check.' });
  }
  try {
    const workspace = ctx.db.workspaces[ctx.userEmail];
    const result = await checkAndSendRemindersForWorkspace(workspace, ctx.userEmail, ctx.db);
    ctx.save(); // Save any changes to the DB
    res.json(result);
  } catch (err) {
    console.error(`[Manual Check Error] for ${ctx.userEmail}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Clear logs and databases for debug/refresh
app.post('/api/reset', (req, res) => {
  const db = getInitialDB();
  writeDB(db);
  res.json({ success: true, message: 'Database reset to initial template.' });
});

// Simulated AI Chatbot
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message content is required.' });
  }

  const ctx = getContextDB(req);
  if (!ctx.userEmail) {
    return res.json({ reply: "I can't access your workspace details. Please sign in to ask about your projects or team." });
  }
  const query = message.toLowerCase();
  let reply = '';

  if (query.includes('project') || query.includes('schedule') || query.includes('list')) {
    if (ctx.projects.length === 0) {
      reply = "There are currently no active projects loaded in your workspace. Upload an Excel spreadsheet or add one manually in the Projects tab!";
    } else {
      reply = `I found **${ctx.projects.length} project(s)** scheduled in your workspace: \n\n` + 
        ctx.projects.map(p => `- **${p.name}** starting on *${p.date}* (${p.completed ? 'Completed' : 'Active'})`).join('\n');
    }
  } else if (query.includes('remind') || query.includes('subscriber') || query.includes('team') || query.includes('member')) {
    const active = ctx.subscribers.filter(s => s.active);
    if (active.length === 0) {
      reply = "There are no active team subscribers registered in your workspace panel!";
    } else {
      reply = `Email notifications are enabled for **${active.length} subscriber(s)**:\n\n` +
        active.map(s => `- **${s.name}** (${s.email})`).join('\n');
    }
  } else {
    reply = `Hello! I am your Project Reminder AI Agent. I manage your isolated workspace schedules and automate team notification dispatches.`;
  }

  res.json({ reply });
});

// Health check endpoint for tests
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Setup server and start
setupEmailTransporter().then(() => {
  app.listen(PORT, () => {
    console.log(`Project Reminder Agent backend running on port ${PORT}`);
    
    cron.schedule('0 0 * * *', () => {
      checkAndSendRemindersCron().catch(err => {
        console.error('Error running daily cron check:', err);
      });
    });
  });
});
