// server/db.mjs
import pkg from "pg";
const { Pool } = pkg;

const cn = process.env.DATABASE_URL || "";

export const pool = new Pool({
  connectionString: cn || undefined,
  ssl: cn && !/localhost|127\.0\.0\.1/.test(cn)
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY,
      phone TEXT UNIQUE,
      name TEXT,
      email TEXT,
      birthday DATE,
      tags TEXT[],
      bonus_balance INTEGER NOT NULL DEFAULT 0,
      consent BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS promos (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,             -- 'percent' | 'amount' | 'happy_hour' | 'birthday'
      value NUMERIC NOT NULL,         -- % або сума в UAH
      active BOOLEAN DEFAULT TRUE,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      days JSONB,                     -- напр. [1,2,3,4,5] (дні тижня 0..6)
      time_from TIME,
      time_to TIME,
      min_hours NUMERIC,
      extra JSONB,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bonus_ledger (
      id UUID PRIMARY KEY,
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      delta INTEGER NOT NULL,
      reason TEXT,
      reference TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id UUID PRIMARY KEY,
      customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}
