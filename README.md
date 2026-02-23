# Nexus AI (Gravity Claw) — Quickstart Guide

Welcome to **Nexus AI**, a multi-tenant, cloud-native personal AI assistant powered by Groq, Claude, Supabase, Pinecone, and Vercel. 

This guide will help you understand how to access and interact with your AI assistant depending on your environment.

---

## 1. Web Portal (For Deep Work & Family Members)
The Web Portal is the primary way for you and any authorized users to interact with the Nexus AI chat interface. It features a rich, native ChatGPT-style experience and fully supports memory isolation.

* **URL:** [https://gravity-claw-sigma.vercel.app](https://gravity-claw-sigma.vercel.app)
* **How to login:** 
  - Use the email address and password associated with your account.
  - If you are a new user, you can use the "Register here" button.

Once logged in, your session is securely tied to your profile. The AI will remember your individual facts, schedule, and conversational context without mixing it with other family members.

---

## 2. Admin Dashboard (For the Super User)
The Admin Dashboard is a specialized "Command Center" designed exclusively for the system owner. It is styled similarly to Open WebUI and allows you to monitor system health and trigger background automation.

* **URL:** [https://gravity-claw-sigma.vercel.app/admin.html](https://gravity-claw-sigma.vercel.app/admin.html)
* **How to login:** 
  - Log in using the system owner email (e.g., `admin@nexus.ai`) and password.
  - The system will verify that your underlying `user_id` matches the `ALLOWED_USER_IDS` environment whitelist before granting access.
* **Capabilities:** 
  - **Dashboard:** Monitor database sizes (Supabase/Pinecone) and active user counts.
  - **Campaigns:** Manually trigger the Recruiter Email Scanner (Lead Generation).
  - **Tasks:** Trigger background cron jobs like the Morning Briefing or Smart Recommendations.

---

## 3. Telegram Channel (For On-The-Go & Voice Notes)
Because Nexus AI is integrated with Groq Whisper, it can handle robust voice transcriptions. Telegram is the best way to interact with the bot when you are away from your desk.

* **How it works:** Simply text or send a voice note to the `@FreshClawdBot` on Telegram.
* **Proactive Alerts:** Telegram is the exclusive channel where Nexus AI will push proactive alerts (such as the 8:00 AM Morning Briefing or mid-day email recommendations).
* **Security:** The Telegram bot runs strictly in "Admin Only" mode. It will ignore and reject messages from any Telegram ID not explicitly whitelisted in the `.env` file.

---

## 4. Terminal UI (For Developers)
If you are actively coding or managing the server infrastructure, you can talk to Nexus AI without leaving your command line.

* **How to run:**
  ```bash
  cd path/to/gravity-claw
  npm run cli
  ```
* **Why use it?** It is distraction-free, lightning-fast, and connects directly to the live memory databases via the terminal.

---

### Core Principles of Nexus AI
1. **Factual Memory:** If you tell Nexus AI a specific fact (e.g., "I just learned React"), it will permanently save it to your Supabase profile so it never asks again.
2. **Semantic Memory:** Long conversations and conceptual ideas are vectorized and saved to Pinecone, allowing the AI to organically recall past discussions.
3. **Data Privacy:** Every single database table has a strict `user_id` constraint. User A can never accidentally query or view User B's memory, emails, or calendar events.

> *System Configuration locked until Monday, February 23rd, 2026 @ 8:30 AM.*
