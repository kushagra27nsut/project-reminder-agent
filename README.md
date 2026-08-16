# Project Reminder AI Agent 🤖📊

A collaborative project management and reminder application that automatically monitors project schedules from Excel spreadsheets and sends progress-aware email reminders as launch dates approach.

🌐 **[Live Demo](https://project-reminder-agent.onrender.com)**

## ✨ What It Does

Upload an Excel spreadsheet containing your project schedules, and the agent automatically identifies projects, tracks their launch dates, and schedules reminder checkpoints.

Reminders are triggered at:

**Day -30 → -25 → -20 → -15 → -10 → -5 → Launch Day**

### Key Features

* 📊 **Smart Excel Parsing** — Automatically maps different column names such as `Deadline`, `Due Date`, `Launch Date`, and `Project Title`.
* ⏰ **Automated Scheduling** — A daily cron runner checks upcoming projects and triggers the appropriate reminder milestones.
* 👥 **Subscriber Management** — Add team members who should receive project notifications.
* 📅 **Interactive Timeline** — Visualize project progress and upcoming reminder checkpoints.
* 🤖 **AI Assistant Interface** — Query project timelines, summarize notifications, and inspect email history through the integrated assistant UI.
* 📧 **Email Preview System** — Uses Ethereal test email when real SMTP credentials aren't configured, allowing email delivery to be previewed safely during development.

## 🛠️ Tech Stack

**Backend**

* Node.js
* Express.js
* Node-Cron
* Nodemailer

**Frontend**

* HTML
* CSS
* JavaScript

**Data & Processing**

* XLSX / Excel parsing
* JSON-based persistence
* Automated milestone calculations

## 🚀 Getting Started

### Prerequisites

* Node.js 18+

### Installation

```bash
npm install
```

### Run the application

```bash
npm start
```

The application will be available at:

```text
http://localhost:3000
```

### Run tests

```bash
node test.js
```

The integration tests verify Excel processing, project parsing, database updates, subscriber management, and reminder milestone calculations.

## 🌐 Deployment

The application can be deployed as a standard Node.js/Express web service on platforms such as Render.

For deployment, configure the required environment variables using `.env.example`.

> ⚠️ Never commit your `.env` file or real SMTP credentials to the repository.

For persistent production data, the default JSON storage can be replaced with a managed database such as PostgreSQL or MongoDB.

## 📁 Project Structure

```text
├── server.js
├── test.js
├── create_template.js
├── projects_sample.xlsx
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
└── README.md
```

## 🎯 Project Highlights

This project was built to explore practical backend automation concepts including:

* Automated task scheduling
* Excel data processing
* Event-based email notifications
* Project milestone tracking
* Responsive dashboard design
* Backend/frontend integration
* Deployment of a Node.js web application

## ⚠️ Current Limitations

* The current version uses JSON-based storage for simplicity.
* The integrated AI assistant is a simulated assistant interface rather than an LLM-powered system.
* Production deployments should use persistent managed database storage.
* Real email delivery requires SMTP configuration.

## 📌 Future Improvements

* PostgreSQL/MongoDB integration
* Real LLM-powered project assistant
* User authentication and workspaces
* Custom reminder schedules
* Push/browser notifications
* Advanced analytics and reporting
* Production-grade email provider integration

---

Built as a project to explore **automation, scheduling, data processing, and AI-assisted project management**.
