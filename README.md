# Project Reminder AI Agent 🤖📊

A beautifully designed, collaborative, multi-device web application that monitors upcoming project schedules uploaded via Excel spreadsheets. The agent automatically schedules and dispatches progress-aware email reminders starting **one month before** each launch, repeating **every 5 days**.

---

## Key Features

1. **Excel Parsing Engine**: Auto-maps column headers containing names and dates (resilient to different labels like "Deadline", "Due Date", "Project Title", etc.).
2. **Cron Scheduler Agent**: A built-in daily runner scans projects and schedules notifications at Day -30, -25, -20, -15, -10, -5, and Day 0.
3. **Subscribers Management**: Add team members who need to receive these project reminders.
4. **Interactive Timeline**: Visualizing all upcoming milestones with a progressive, color-coded checkpoint track showing past, next, and locked warning milestones.
5. **Simulated AI Assistant**: An interactive chat shell enabling you to query active project timelines, summarize notifications, or check email history.
6. **Ethereal Mail Previews**: If real SMTP parameters are omitted, the agent auto-provisions a free Ethereal test inbox and links delivery reports directly inside the dashboard.

---

## Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)

### 2. Installation
Navigate to the project root and install the dependencies:
```bash
npm install
```

### 3. Running the Server
Start the Express server:
```bash
npm start
```
The server will boot on: `http://localhost:3000`

---

## Deploying to Render

This app is a standard Node/Express web service.

1. Push the project to a private GitHub repository.
2. Create a Render **Web Service** from that repository.
3. Use these commands:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables from `.env.example` in the Render dashboard.
5. Do not upload your local `.env` file. It contains private SMTP and webhook credentials.

### Persistent Data

The app stores users, workspaces, projects, subscribers, and logs in `data/db.json` by default.
For deployment, attach a persistent disk and set:

```bash
DATA_DIR=/var/data
UPLOAD_DIR=/var/data/uploads
```

Without persistent storage, deployed user/project data can reset after redeploys. For production-grade usage, migrate this file storage to MongoDB Atlas, PostgreSQL, or another managed database.

---

## How to Share with Other Members & Devices

To allow other laptops, tablets, and mobile phones to access the interface and register subscribers, choose one of these sharing methods:

### Option A: Local Wi-Fi Network Sharing (Easiest & Free)

If your devices are connected to the same Wi-Fi router:

1. **Find your computer's local IP address**:
   - On Windows: Open Command Prompt/PowerShell and run `ipconfig`. Look for the **IPv4 Address** (e.g., `192.168.1.45`).
   - On macOS/Linux: Open Terminal and run `ifconfig` or `ip a` (look for `inet` under your Wi-Fi interface, usually `en0` or `wlan0`).
2. **Access from other devices**:
   - Open any browser on your phone, tablet, or secondary laptop.
   - Navigate to: `http://<YOUR_LOCAL_IP>:3000` (e.g., `http://192.168.1.45:3000`).
3. **Troubleshooting Windows Firewall**:
   - If other devices fail to connect, Windows Firewall might be blocking incoming connections to Node.js.
   - Go to Windows Defender Firewall -> "Allow an app or feature through Windows Defender Firewall" -> Check both Private and Public boxes next to "Node.js JavaScript Runtime".

---

### Option B: Internet Hosting (Global Sharing)

To host the application so team members can access it from anywhere in the world:

1. **Deploy to Render, Railway, or Glitch**:
   - Push this directory to a private GitHub repository.
   - Connect it to a hosting provider like [Render](https://render.com) or [Railway](https://railway.app).
   - Set the build command to `npm install` and start command to `node server.js`.
2. **Add Environment Variables (Optional)**:
   - By default, the system runs with Ethereal SMTP simulation. To send real emails to your team, define these variables in the dashboard setup of your hosting provider:
     - `SMTP_HOST`: e.g., `smtp.gmail.com` or `smtp.sendgrid.net`
     - `SMTP_PORT`: `587` (TLS) or `465` (SSL)
     - `SMTP_USER`: Your email address or API user
     - `SMTP_PASS`: Your app-specific password or API key
     - `SMTP_SECURE`: `false` (for 587) or `true` (for 465)

---

## Project Structure

- `server.js` - Main backend logic: Express routes, Excel parser, Node-cron scheduler, SQLite-like file database, Nodemailer configurations.
- `test.js` - Complete integration tests asserting project parsing, database updates, subscriber changes, and email notification conditions.
- `create_template.js` - Generates a dynamic test spreadsheet (`projects_sample.xlsx`) relative to the current calendar date.
- `data/db.json` - Automatically created database file storing projects, team subscriber settings, and history audit records.
- `frontend/` - Frontend files:
  - `index.html` - Dashboard skeleton, timeline views, team inputs, AI chat panel, logs table.
  - `styles.css` - Custom premium dark-theme variables, glassmorphic filters, responsive styles, animations.
  - `app.js` - Client-side router, timeline milestone progressive visual rendering, email preview modals, chatbot interactions.
- `projects_sample.xlsx` - Demonstration sheet with projects relative to execution day.

---

## Verifying Code correctness

Run the automated integration test script to verify Excel processing and milestone calculations:
```bash
node test.js
```
All assertions should print green checkmarks, showing correct email logs in the database.
