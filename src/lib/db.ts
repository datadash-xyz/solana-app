import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

// Reuse one pool across Next.js hot reloads.
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
export const sql = g.__sql ?? postgres(url, { ssl: "require", max: 5, prepare: false });
if (process.env.NODE_ENV !== "production") g.__sql = sql;

export const ts = (unix: number | string | null | undefined) =>
  unix === null || unix === undefined || unix === "" ? null : new Date(Number(unix) * 1000);
