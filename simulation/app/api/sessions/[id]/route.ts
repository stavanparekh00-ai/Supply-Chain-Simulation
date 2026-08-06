import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(result.rows[0]);
}
