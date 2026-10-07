import "dotenv/config";
import { readFileSync } from "node:fs";
import { sql } from "../src/lib/db";

await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
console.log("schema applied");
await sql.end();
