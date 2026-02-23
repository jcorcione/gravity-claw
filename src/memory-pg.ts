import postgres from "postgres";

// Lazily initialized — created on first call to initMemory()
// This ensures env vars are available before we attempt to connect.
let sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
    if (!sql) {
        const connectionString = process.env.SUPABASE_DB_URL;
        if (!connectionString) throw new Error("SUPABASE_DB_URL is not set");
        sql = postgres(connectionString, { ssl: "require" });
    }
    return sql;
}

export interface User {
    id: string; // The user's Telegram ID or Web OAuth sub ID
    email: string | null;
    name: string | null;
    google_refresh_token: string | null;
    password_hash?: string | null;
}

export interface ChatMessage {
    role: "user" | "assistant" | "tool" | "system";
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    timestamp?: string;
    user_id?: string;
}

export interface Fact {
    id: number;
    entity: string;
    attribute: string;
    value: string;
    created_at: string;
    user_id?: string;
}

export interface Schedule {
    id: number;
    name: string;
    cron: string;
    prompt: string;
    enabled: number;
    created_at: string;
    user_id?: string;
}

// ─── Initialization ──────────────────────────────────────────────

export async function initMemory() {
    if (!process.env.SUPABASE_DB_URL) {
        console.warn("⚠️ SUPABASE_DB_URL is missing. Postgres memory cannot be initialized.");
        return;
    }

    const db = getSql();

    await db`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT,
            name TEXT,
            google_refresh_token TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `;

    await db`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `;

    await db`
        CREATE TABLE IF NOT EXISTS facts (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            entity TEXT NOT NULL,
            attribute TEXT NOT NULL,
            value TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, entity, attribute)
        )
    `;

    await db`
        CREATE TABLE IF NOT EXISTS schedules (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            cron TEXT NOT NULL,
            prompt TEXT NOT NULL,
            enabled SMALLINT DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `;

    // Alter existing tables gracefully if migrating from Level < 15
    try {
        await db`ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default_user'`;
        await db`ALTER TABLE facts ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default_user'`;
        await db`ALTER TABLE schedules ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default_user'`;
        await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;

        // Attempt to constrain email to unique (ignore if fails or already exists)
        await db`ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)`.catch(() => { });

        // Attempt to drop the old UNIQUE constraint on facts and add the multi-tenant one.
        // It might throw if facts_entity_attribute_key doesn't exist, so we catch silently.
        // Note: IF EXISTS isn't standard in postgres for DROP CONSTRAINT until newer versions, but we execute dynamically.
        await db`ALTER TABLE facts DROP CONSTRAINT IF EXISTS facts_entity_attribute_key`;

        // Only add the new constraint if it doesn't already exist.
        // Easiest is to catch error if it already exists.
        await db`ALTER TABLE facts ADD CONSTRAINT facts_user_id_entity_attribute_key UNIQUE (user_id, entity, attribute)`
            .catch(() => { });

    } catch (e: any) {
        console.log("Migration for user_id columns already applied or skipped:", e.message);
    }
}

// ─── Users ───────────────────────────────────────────────────────

export async function upsertUser(id: string, email: string | null, name: string | null, refreshToken: string | null): Promise<void> {
    if (!process.env.SUPABASE_DB_URL) return;

    // We coalesce with EXCLUDED.xxx so we only update fields that are provided
    await getSql()`
        INSERT INTO users (id, email, name, google_refresh_token)
        VALUES (${id}, ${email}, ${name}, ${refreshToken})
        ON CONFLICT (id) 
        DO UPDATE SET 
            email = COALESCE(EXCLUDED.email, users.email),
            name = COALESCE(EXCLUDED.name, users.name),
            google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, users.google_refresh_token)
    `;
}

export async function registerUser(id: string, email: string, name: string, passwordHash: string): Promise<User | null> {
    if (!process.env.SUPABASE_DB_URL) return null;
    try {
        await getSql()`
            INSERT INTO users (id, email, name, password_hash)
            VALUES (${id}, ${email}, ${name}, ${passwordHash})
        `;
        return { id, email, name, google_refresh_token: null, password_hash: passwordHash } as User;
    } catch (err: any) {
        if (err.message.includes("unique") || err.message.includes("users_email_key")) {
            throw new Error("Email already exists");
        }
        throw err;
    }
}

export async function getUser(id: string): Promise<User | null> {
    if (!process.env.SUPABASE_DB_URL) return null;
    const rows = await getSql()`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
    if (!process.env.SUPABASE_DB_URL) return null;
    const rows = await getSql()`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
    return rows.length > 0 ? (rows[0] as unknown as User) : null;
}

export async function getAllUsers(): Promise<User[]> {
    if (!process.env.SUPABASE_DB_URL) return [];
    const rows = await getSql()`SELECT * FROM users ORDER BY created_at ASC`;
    return rows as unknown as User[];
}

export async function getGlobalStats(): Promise<{ userCount: number; dbByteSize: number }> {
    if (!process.env.SUPABASE_DB_URL) return { userCount: 0, dbByteSize: 0 };
    const userRows = await getSql()`SELECT COUNT(*) as count FROM users`;
    const sizeRows = await getSql()`SELECT pg_database_size(current_database()) as size`;
    return {
        userCount: parseInt(userRows[0].count),
        dbByteSize: parseInt(sizeRows[0].size)
    };
}

// ─── Messages (Tier 1) ───────────────────────────────────────────

export async function saveMessage(role: string, content: string, userId: string = 'default_user'): Promise<void> {
    if (!process.env.SUPABASE_DB_URL) return;
    await getSql()`INSERT INTO messages (user_id, role, content) VALUES (${userId}, ${role}, ${content})`;
}

export async function getTranscript(limit = 20, userId: string = 'default_user'): Promise<ChatMessage[]> {
    if (!process.env.SUPABASE_DB_URL) return [];

    const rows = await getSql()`
        SELECT role, content, created_at as timestamp 
        FROM messages 
        WHERE user_id = ${userId}
        ORDER BY id DESC 
        LIMIT ${limit}
    `;

    return rows.reverse().map(row => ({
        role: row.role as ChatMessage["role"],
        content: row.content,
        timestamp: row.timestamp
    }));
}

export async function clearTranscript(userId: string = 'default_user'): Promise<void> {
    if (!process.env.SUPABASE_DB_URL) return;
    await getSql()`DELETE FROM messages WHERE user_id = ${userId}`;
}

// ─── Facts (Tier 2) ──────────────────────────────────────────────

export async function upsertFact(entity: string, attribute: string, value: string, userId: string = 'default_user'): Promise<void> {
    if (!process.env.SUPABASE_DB_URL) return;

    await getSql()`
        INSERT INTO facts (user_id, entity, attribute, value)
        VALUES (${userId}, ${entity}, ${attribute}, ${value})
        ON CONFLICT (user_id, entity, attribute) 
        DO UPDATE SET 
            value = EXCLUDED.value,
            created_at = CURRENT_TIMESTAMP
    `;
}

export async function getAllFacts(userId: string = 'default_user'): Promise<Fact[]> {
    if (!process.env.SUPABASE_DB_URL) return [];
    const rows = await getSql()`SELECT * FROM facts WHERE user_id = ${userId} ORDER BY entity ASC, attribute ASC`;
    return rows as unknown as Fact[];
}

// ─── Schedules ──────────────────────────────────────────────────

export async function addSchedule(name: string, cron: string, prompt: string, userId: string = 'default_user'): Promise<Schedule> {
    if (!process.env.SUPABASE_DB_URL) throw new Error("DB not connected");

    const rows = await getSql()`
        INSERT INTO schedules (user_id, name, cron, prompt) 
        VALUES (${userId}, ${name}, ${cron}, ${prompt}) 
        RETURNING *
    `;
    return rows[0] as unknown as Schedule;
}

export async function listSchedules(userId: string = 'default_user'): Promise<Schedule[]> {
    if (!process.env.SUPABASE_DB_URL) return [];

    const rows = await getSql()`SELECT * FROM schedules WHERE user_id = ${userId} AND enabled = 1 ORDER BY created_at ASC`;
    return rows as unknown as Schedule[];
}

export async function removeSchedule(id: number, userId: string = 'default_user'): Promise<boolean> {
    if (!process.env.SUPABASE_DB_URL) return false;

    const result = await getSql()`DELETE FROM schedules WHERE id = ${id} AND user_id = ${userId} RETURNING id`;
    return result.length > 0;
}

export async function getScheduleCount(userId: string = 'default_user'): Promise<number> {
    if (!process.env.SUPABASE_DB_URL) return 0;

    const rows = await getSql()`SELECT COUNT(*) as count FROM schedules WHERE user_id = ${userId} AND enabled = 1`;
    return parseInt(rows[0].count);
}

export async function getMemoryCount(userId: string = 'default_user'): Promise<number> {
    if (!process.env.SUPABASE_DB_URL) return 0;

    const msgRows = await getSql()`SELECT COUNT(*) as count FROM messages WHERE user_id = ${userId}`;
    const factRows = await getSql()`SELECT COUNT(*) as count FROM facts WHERE user_id = ${userId}`;

    return parseInt(msgRows[0].count) + parseInt(factRows[0].count);
}

export async function closeDatabase(): Promise<void> {
    if (sql) await sql.end();
}
