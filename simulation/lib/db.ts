import { Pool } from "pg";

// Uses a standard Postgres connection string, so the exact same code path
// works against local Postgres in development and Neon in production --
// no Neon-specific driver magic needed.
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local for development, " +
          "or set it in your Vercel project's Environment Variables for production."
      );
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}
