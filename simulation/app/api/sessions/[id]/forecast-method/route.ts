import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { FORECASTING_METHODS, ForecastingMethodId } from "@/lib/forecasting";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const methodId: ForecastingMethodId = body.methodId;

  if (!FORECASTING_METHODS.some((m) => m.id === methodId)) {
    return NextResponse.json({ error: `Invalid forecasting method id: ${methodId}` }, { status: 400 });
  }

  const pool = getPool();
  const existing = await pool.query(`SELECT forecasting_method_id, status FROM sessions WHERE id = $1`, [id]);
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (existing.rows[0].forecasting_method_id) {
    return NextResponse.json(
      { error: "Forecasting method is locked once chosen and cannot be changed." },
      { status: 409 }
    );
  }

  const result = await pool.query(
    `UPDATE sessions SET forecasting_method_id = $1, status = 'playing' WHERE id = $2 RETURNING *`,
    [methodId, id]
  );
  return NextResponse.json(result.rows[0]);
}
