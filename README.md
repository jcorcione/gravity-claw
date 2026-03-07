# AgenticHQ (AgenticHQ) — Quickstart Guide

Welcome to **AgenticHQ**, a multi-tenant, cloud-native personal AI assistant powered by Groq, Claude, Supabase, Pinecone, and Vercel. 

This guide will help you understand how to access and interact with your AI assistant depending on your environment.

---

## 1. Web Portal (For Deep Work & Family Members)
The Web Portal is the primary way for you and any authorized users to interact with the AgenticHQ chat interface. It features a rich, native ChatGPT-style experience and fully supports memory isolation.

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

## 3. Telegram (For On-The-Go & Voice Notes)
Because AgenticHQ is integrated with Groq Whisper, it can handle robust voice transcriptions. Telegram is the best way to interact on mobile.

* **Active Bot:** `@JCAntiGravBot` ← use this (Railway backend)
* **Legacy Bot:** `@JohsClawBot` (old EC2 instance — retiring soon, do not use)
* **Proactive Alerts:** Telegram receives the 8:00 AM Morning Briefing and mid-day Smart Recommendations.
* **Security:** Admin-only mode — ignores any Telegram ID not in the `ALLOWED_USER_IDS` whitelist.

---

## 4. Discord Bot
* **Invite:** [Add to Server](https://discord.com/oauth2/authorize?client_id=1477087703165046785)
* Use when you're already in Discord and want Jarvis without switching apps.

---

## 5. Terminal UI (For Developers)
If you are actively coding or managing the server infrastructure, you can talk to AgenticHQ without leaving your command line.

* **How to run:**
  ```bash
  cd path/to/gravity-claw
  npm run cli
  ```
* **Why use it?** It is distraction-free, lightning-fast, and connects directly to the live memory databases via the terminal.

---

### Core Principles of AgenticHQ
1. **Factual Memory:** If you tell AgenticHQ a specific fact (e.g., "I just learned React"), it will permanently save it to your Supabase profile so it never asks again.
2. **Semantic Memory:** Long conversations and conceptual ideas are vectorized and saved to Pinecone, allowing the AI to organically recall past discussions.
3. **Data Privacy:** Every single database table has a strict `user_id` constraint. User A can never accidentally query or view User B's memory, emails, or calendar events.

---

### Desktop Services (Required for Video Pipeline)
These must be running on your desktop PC for video creation to work:

| Service | Command | Tailscale Path |
|---|---|---|
| Flask FFmpeg Compiler | `cd C:\Users\jcorc\video_compilation && python grace_note_compiler_fixed.py` | `/compiler` |
| ComfyUI (Thumbnails) | Run `nvidia_gpu.bat` | `/comfy` |

Tailscale Funnel is path-routed on `https://desktop-4ekcfdi.tail787c77.ts.net` — both services coexist on the same public URL.
