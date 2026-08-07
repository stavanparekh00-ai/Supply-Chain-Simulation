import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const participantName = String(body.participantName ?? "").trim().replace(/\s+/g, " ");
  if (participantName.length < 2 || participantName.length > 60) {
    return NextResponse.json(
      { error: "Please enter a name between 2 and 60 characters." },
      { status: 400 }
    );
  }

  const pool = getPool();
  // Backward-compatible migration for already-deployed Neon databases.
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participant_name TEXT`);
  const result = await pool.query(
    `INSERT INTO sessions (participant_name, status, current_week)
     VALUES ($1, 'setup', 1)
     RETURNING id, participant_name, created_at, status, current_week`,
    [participantName]
  );
  return NextResponse.json(result.rows[0]);
}
