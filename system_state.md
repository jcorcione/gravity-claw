# CORE SYSTEM STATE AND MIGRATIONS

*This file contains the current overarching status of major architectural decisions, projects, and recent pivots. Jarvis should treat this information as the absolute truth for current context, superseding older memories.*

## Recent Migrations
* **March 2026: YouTube Database Pivot**
  * The entire content creation pipeline (Grace Note & Gigawerx) has been successfully migrated from **Baserow** to **Supabase** (PostgreSQL).
  * Baserow is no longer used for anything.
  * All tools, API endpoints, and data operations now point exclusively to Supabase via the `@supabase/supabase-js` client.
  * The core tools for interacting with the database are now `supabase_content` and `create_short_video`.
