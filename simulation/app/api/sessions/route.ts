import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function POST() {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO sessions (status, current_week) VALUES ('setup', 1) RETURNING id, created_at, status, current_week`
  );
  return NextResponse.json(result.rows[0]);
}
