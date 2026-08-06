import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getPool();

  const sessionRes = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (sessionRes.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const session = sessionRes.rows[0];

  const periodStateRes = await pool.query(
    `SELECT * FROM period_state WHERE session_id = $1 ORDER BY week ASC, facility_id ASC`,
    [id]
  );
  const decisionsRes = await pool.query(
    `SELECT * FROM decisions WHERE session_id = $1 ORDER BY week ASC, facility_id ASC, supplier_id ASC`,
    [id]
  );

  const totalProcurementCost = periodStateRes.rows.reduce((s, r) => s + Number(r.procurement_cost), 0);
  const totalHoldingCost = periodStateRes.rows.reduce((s, r) => s + Number(r.holding_cost), 0);
  const totalBackorderCost = periodStateRes.rows.reduce((s, r) => s + Number(r.backorder_cost), 0);
  const totalCost = totalProcurementCost + totalHoldingCost + totalBackorderCost;
  const totalBackorderedUnits = periodStateRes.rows.reduce((s, r) => s + Number(r.backlog), 0);

  return NextResponse.json({
    session,
    periodState: periodStateRes.rows,
    decisions: decisionsRes.rows,
    totals: {
      totalProcurementCost,
      totalHoldingCost,
      totalBackorderCost,
      totalCost,
      totalBackorderedUnits,
    },
  });
}
