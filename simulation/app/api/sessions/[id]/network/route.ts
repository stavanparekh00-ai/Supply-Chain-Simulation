import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { loadScenarioData } from "@/lib/scenarioData";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const openedFacilities: string[] = body.openedFacilities;

  const MAX_OPEN_FACILITIES = 3;

  if (!Array.isArray(openedFacilities) || openedFacilities.length === 0) {
    return NextResponse.json({ error: "openedFacilities must be a non-empty array" }, { status: 400 });
  }
  if (openedFacilities.length > MAX_OPEN_FACILITIES) {
    return NextResponse.json(
      { error: `You can open at most ${MAX_OPEN_FACILITIES} facilities (got ${openedFacilities.length}).` },
      { status: 400 }
    );
  }

  const data = loadScenarioData();
  const validIds = new Set(data.candidate_facilities.map((f) => f.id));
  const unique = new Set(openedFacilities);
  if (unique.size !== openedFacilities.length) {
    return NextResponse.json({ error: "Duplicate facility ids are not allowed" }, { status: 400 });
  }
  for (const f of openedFacilities) {
    if (!validIds.has(f)) {
      return NextResponse.json({ error: `Invalid facility id: ${f}` }, { status: 400 });
    }
  }

  const fixedCost = data.candidate_facilities
    .filter((f) => openedFacilities.includes(f.id))
    .reduce((sum, f) => sum + f.fixed_cost_to_open, 0);

  // Transport cost: each customer picks the cheapest OPENED facility available to it.
  let transportCost = 0;
  for (const customer of data.customers) {
    const rates = openedFacilities.map((f) => data.transport_cost_matrix[f][customer.id]);
    transportCost += Math.min(...rates) * customer.weekly_demand;
  }

  const pool = getPool();
  const result = await pool.query(
    `UPDATE sessions
     SET opened_facilities = $1, network_fixed_cost = $2, network_transport_cost = $3
     WHERE id = $4
     RETURNING *`,
    [JSON.stringify(openedFacilities), fixedCost, transportCost, id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(result.rows[0]);
}
