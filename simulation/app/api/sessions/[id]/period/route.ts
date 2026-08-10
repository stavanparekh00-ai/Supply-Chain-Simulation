import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { loadScenarioData, disruptionsInWeek } from "@/lib/scenarioData";
import { buildFacilityWeekInfo, forecastFacilityDemand } from "@/lib/gameEngine";
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
  const stateRes = await pool.query(
    `SELECT week, facility_id, on_hand_start, arriving, actual_demand, on_hand_end, backlog,
            procurement_cost, holding_cost, backorder_cost
     FROM period_state
     WHERE session_id = $1
     ORDER BY week ASC, facility_id ASC`,
    [id]
  );

  const previousBacklog = new Map<string, number>();
  let totalDemand = 0;
  let totalFulfilled = 0;
  let cumulativeCost = 0;
  const costByWeek = new Map<number, number>();
  const demandByWeek = new Map<number, number>();
  const forecastByWeek = new Map<number, number>();

  for (const row of stateRes.rows) {
    const facilityId = String(row.facility_id);
    const periodWeek = Number(row.week);
    const backlogStart = previousBacklog.get(facilityId) ?? 0;
    const available = Number(row.on_hand_start) + Number(row.arriving);
    const oldBacklogRemaining = Math.max(0, backlogStart - available);
    const newlyUnfilled = Math.max(0, Number(row.backlog) - oldBacklogRemaining);
    const fulfilled = Math.max(0, Number(row.actual_demand) - newlyUnfilled);
    const rowCost =
      Number(row.procurement_cost) + Number(row.holding_cost) + Number(row.backorder_cost);

    totalDemand += Number(row.actual_demand);
    totalFulfilled += fulfilled;
    cumulativeCost += rowCost;
    costByWeek.set(periodWeek, (costByWeek.get(periodWeek) ?? 0) + rowCost);
    demandByWeek.set(periodWeek, (demandByWeek.get(periodWeek) ?? 0) + Number(row.actual_demand));
    previousBacklog.set(facilityId, Number(row.backlog));
  }

  for (const periodWeek of demandByWeek.keys()) {
    let forecastSum = 0;
    for (const facilityId of openedFacilities) {
      forecastSum += forecastFacilityDemand(data, openedFacilities, facilityId, periodWeek, methodId).forecast;
    }
    forecastByWeek.set(periodWeek, forecastSum);
  }

  let runningCost = 0;
  const cumulativeCostByWeek = Array.from(costByWeek.entries()).map(([periodWeek, cost]) => {
    runningCost += cost;
    return { week: periodWeek, cost: Math.round(runningCost) };
  });

  const demandVsForecast = Array.from(demandByWeek.entries()).map(([periodWeek, demand]) => ({
    week: periodWeek,
    demand,
    forecast: forecastByWeek.get(periodWeek) ?? 0,
  }));

  const latestStates = stateRes.rows.filter((r) => Number(r.week) === week - 1);
  const currentWeekForecast = facilities.reduce((sum, f) => sum + f.forecast, 0);

  // Most recently completed week outcomes (for facility KPI slots on the orders page).
  const lastCompletedWeek = week > 1 ? week - 1 : null;
  const lastOutcomes: Record<
    string,
    { actualDemand: number; fillRatePct: number; served: number; forecast: number }
  > = {};
  if (lastCompletedWeek !== null) {
    const lastRows = stateRes.rows.filter((r) => Number(r.week) === lastCompletedWeek);
    const backlogBeforeLast = new Map<string, number>();
    for (const row of stateRes.rows) {
      if (Number(row.week) >= lastCompletedWeek) break;
      backlogBeforeLast.set(String(row.facility_id), Number(row.backlog));
    }
    for (const row of lastRows) {
      const facilityId = String(row.facility_id);
      const actualDemand = Number(row.actual_demand);
      const backlogStart = backlogBeforeLast.get(facilityId) ?? 0;
      const available = Number(row.on_hand_start) + Number(row.arriving);
      const oldBacklogRemaining = Math.max(0, backlogStart - available);
      const newlyUnfilled = Math.max(0, Number(row.backlog) - oldBacklogRemaining);
      const served = Math.max(0, actualDemand - newlyUnfilled);
      const forecast = forecastFacilityDemand(
        data,
        openedFacilities,
        facilityId,
        lastCompletedWeek,
        methodId
      ).forecast;
      lastOutcomes[facilityId] = {
        actualDemand,
        served,
        forecast,
        fillRatePct: actualDemand > 0 ? (served / actualDemand) * 100 : 100,
      };
    }
  }

  return NextResponse.json({
    week,
    horizonWeeks: data.scenario_metadata.horizon_periods,
    minInventoryFloor: data.per_period_cost_parameters.min_inventory_floor_units,
    maxInventoryCeiling: data.per_period_cost_parameters.max_inventory_ceiling_units,
    disruptionsThisWeek,
    facilities,
    lastCompletedWeek,
    lastOutcomes,
    charts: {
      cumulativeCostByWeek,
      demandVsForecast,
      currentWeekForecast,
    },
    performance: {
      cumulativeCost: Math.round(cumulativeCost),
      fillRatePct: totalDemand > 0 ? (totalFulfilled / totalDemand) * 100 : 100,
      currentBacklog: latestStates.reduce((sum, r) => sum + Number(r.backlog), 0),
      endingInventory: latestStates.reduce((sum, r) => sum + Number(r.on_hand_end), 0),
      cumulativeCostByWeek,
    },
  });
}
