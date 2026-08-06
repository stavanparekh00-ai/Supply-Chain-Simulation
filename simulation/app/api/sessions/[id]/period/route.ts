import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { loadScenarioData, disruptionsInWeek } from "@/lib/scenarioData";
import { buildFacilityWeekInfo } from "@/lib/gameEngine";
import { ForecastingMethodId } from "@/lib/forecasting";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getPool();
  const sessionRes = await pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
  if (sessionRes.rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  const session = sessionRes.rows[0];
  if (!session.opened_facilities || !session.forecasting_method_id) {
    return NextResponse.json({ error: "Session setup is not complete yet" }, { status: 409 });
  }

  const data = loadScenarioData();
  const week: number = session.current_week;
  const openedFacilities: string[] = session.opened_facilities;
  const methodId: ForecastingMethodId = session.forecasting_method_id;

  const facilities = await Promise.all(
    openedFacilities.map((facilityId) =>
      buildFacilityWeekInfo(pool, data, id, openedFacilities, facilityId, week, methodId)
    )
  );

  const disruptionsThisWeek = disruptionsInWeek(data, week);

  return NextResponse.json({
    week,
    horizonWeeks: data.scenario_metadata.horizon_periods,
    minInventoryFloor: data.per_period_cost_parameters.min_inventory_floor_units,
    maxInventoryCeiling: data.per_period_cost_parameters.max_inventory_ceiling_units,
    disruptionsThisWeek,
    facilities,
  });
}
