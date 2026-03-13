# Gravity Claw

![Repo Size](https://img.shields.io/github/repo-size/jcorcione/gravity-claw?style=flat-square)
![Last Commit](https://img.shields.io/github/last-commit/jcorcione/gravity-claw?style=flat-square)
![Issues](https://img.shields.io/github/issues/jcorcione/gravity-claw?style=flat-square)
![License](https://img.shields.io/github/license/jcorcione/gravity-claw?style=flat-square&color=red)

**Gravity Claw** is the core open-source runtime powering the **AgenticHQ** platform.

AgenticHQ is an experimental architecture for building **modular AI agents capable of orchestrating real-world tools, automation workflows, and persistent memory systems** using open infrastructure.

This repository contains the Gravity Claw runtime, developer tooling, and architecture experiments that power the AgenticHQ system.

Repository:  
https://github.com/jcorcione/gravity-claw

---

# What is AgenticHQ?

AgenticHQ is a modular AI agent platform designed to explore how autonomous systems can safely coordinate:

- developer tools  
- workflow automation systems  
- persistent memory  
- API integrations  
- content generation pipelines  
- productivity workflows  

The platform prioritizes:

- **developer control**
- **transparent architecture**
- **local or lightweight deployment**
- **privacy-first data isolation**

AgenticHQ aims to demonstrate how AI agent systems can be built using **open infrastructure instead of proprietary black-box platforms**.

---

# What is Gravity Claw?

Gravity Claw is the **primary runtime implementation** of the AgenticHQ architecture.

It provides the system responsible for coordinating:

- tool execution
- automation workflows
- agent memory retrieval
- developer interaction via CLI
- messaging integrations

Gravity Claw integrates several open technologies including:

- Node.js runtime
- Supabase (structured memory)
- Pinecone (vector memory)
- Groq Whisper transcription
- workflow orchestration
- FFmpeg media pipelines

---

# Key Features

### Modular Agent Architecture
Gravity Claw is built as a modular runtime that allows AI agents to orchestrate tools and workflows rather than operate as a single monolithic chatbot.

### Multi-Layer Memory System
The platform uses two types of persistent memory:

**Factual Memory**

Stored in **Supabase**, allowing the agent to retain structured facts about users.

Example:
> "I just learned React."

The system permanently stores that fact so it does not repeatedly request the same information.

**Semantic Memory**

Long conversations are vectorized and stored in **Pinecone**, allowing the system to recall past discussions organically.

### Privacy-First Design

Every database table enforces a strict `user_id` constraint.

This ensures:

- user data isolation
- zero cross-account memory leakage
- secure automation workflows

### Developer-First Tooling

Gravity Claw includes multiple interfaces for interacting with the agent system depending on the environment.

---

# How to Access the Agent

This guide explains how to interact with the AgenticHQ assistant depending on your environment.

---

# 1. Web Portal (Primary Interface)

The Web Portal provides a full **ChatGPT-style interface** for interacting with the agent.

URL  
https://gravity-claw-sigma.vercel.app

### Login

Use the email address and password associated with your account.

New users can register using the **Register here** option.

Each session is tied to the authenticated profile, ensuring **memory isolation between users**.

The agent will remember:

- personal facts
- schedules
- previous conversations

without mixing them with other accounts.

---

# 2. Admin Dashboard

The Admin Dashboard acts as a **Command Center** for the system owner.

URL  
https://gravity-claw-sigma.vercel.app/admin.html

### Authentication

The dashboard verifies that the authenticated user matches the `ALLOWED_USER_IDS` environment whitelist.

### Capabilities

**System Monitoring**

- database usage (Supabase / Pinecone)
- active user sessions

**Automation Control**

- trigger Recruiter Email Scanner
- launch background automation workflows

**Task Management**

- morning briefing automation
- recommendation engine triggers

---

# 3. Telegram Integration

Telegram provides the best mobile interface for interacting with the agent.

Because AgenticHQ integrates **Groq Whisper**, voice messages are automatically transcribed.

### Active Bot

`@JCAntiGravBot`

Railway backend deployment.

### Legacy Bot

`@JohsClawBot`

Old EC2 instance.  
Scheduled for retirement.

### Capabilities

- voice message transcription
- proactive alerts
- daily briefing notifications

### Security

The Telegram bot operates in **admin-only mode**.

Any Telegram ID not listed in `ALLOWED_USER_IDS` is ignored.

---

# 4. Discord Bot

Discord can also be used to interact with the agent.

Invite Link  
https://discord.com/oauth2/authorize?client_id=1477087703165046785

This allows you to access the agent without leaving Discord.

---

# 5. Terminal Interface (Developers)

Developers can interact with the agent directly from the command line.

cd gravity-claw npm run cli

The CLI connects directly to the system's memory databases and provides a fast environment for testing workflows.

Advantages:

- distraction-free interface
- rapid testing of agent behavior
- direct system access

---

# Core Principles of AgenticHQ

### Factual Memory

User-provided facts are permanently stored in Supabase.

The system retains personal knowledge so it does not repeatedly ask for the same information.

### Semantic Memory

Long conversations are vectorized and stored in Pinecone.

This allows the agent to recall relevant discussions from past sessions.

### Data Privacy

Every database table enforces strict `user_id` isolation.

Users cannot access:

- other users' memory
- email data
- calendar events

This ensures secure multi-user deployments.

---

# Desktop Services (Video Pipeline)

These services must be running on the desktop host machine for media generation workflows.

| Service | Command | Tailscale Path |
|---|---|---|
| Flask FFmpeg Compiler | `cd C:\Users\jcorc\video_compilation && python grace_note_compiler_fixed.py` | `/compiler` |
| ComfyUI (Thumbnail Generation) | run `nvidia_gpu.bat` | `/comfy` |

Both services are routed using **Tailscale Funnel**:

https://desktop-4ekcfdi.tail787c77.ts.net

---

# Project Goals

Gravity Claw serves as an experimentation platform for:

- agent-driven automation systems
- AI developer tooling
- workflow orchestration
- open agent architectures

The long-term goal is to provide **reproducible patterns for building modular AI agents using open infrastructure**.

---

# Contributing

Gravity Claw is an experimental open-source project exploring practical AI agent architectures.

Contributions, architecture discussions, and feedback are welcome.
