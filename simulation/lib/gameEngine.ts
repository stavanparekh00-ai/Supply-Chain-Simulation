import { Pool, PoolClient } from "pg";

type Queryable = Pool | PoolClient;
import {
  ScenarioData,
  facilityDemandHistoryForForecast,
  disruptionsInWeek,
  landedUnitCost,
  getSupplierById,
} from "@/lib/scenarioData";
import { computeForecast, ForecastingMethodId } from "@/lib/forecasting";
import { arrivingInWeek, OrderDecision } from "@/lib/recursion";

export interface FacilityWeekInfo {
  facilityId: string;
  onHandStart: number;
  backlogStart: number;
  forecast: number;
  arrivingThisWeek: number;
  suppliers: {
    id: string;
    name: string;
    originCountry: string;
    tier: string;
    reliabilityPct: number;
    defectRatePct: number;
    leadTimeWeeks: number;
    landedUnitCost: number;
    capacityThisWeek: number;
    diversificationCapPct: number;
  }[];
}

export async function getFacilityStateBeforeWeek(
  pool: Queryable,
  sessionId: string,
  facilityId: string,
  week: number,
  initialOnHand: number
): Promise<{ onHand: number; backlog: number }> {
  if (week === 1) {
    return { onHand: initialOnHand, backlog: 0 };
  }
  const result = await pool.query(
    `SELECT on_hand_end, backlog FROM period_state WHERE session_id = $1 AND facility_id = $2 AND week = $3`,
    [sessionId, facilityId, week - 1]
  );
  if (result.rows.length === 0) {
    // No prior state recorded (shouldn't normally happen) -- fall back to initial.
    return { onHand: initialOnHand, backlog: 0 };
  }
  return { onHand: Number(result.rows[0].on_hand_end), backlog: Number(result.rows[0].backlog) };
}

export async function getPastDecisions(pool: Queryable, sessionId: string, facilityId: string): Promise<OrderDecision[]> {
  const result = await pool.query(
    `SELECT week, supplier_id, order_quantity FROM decisions WHERE session_id = $1 AND facility_id = $2`,
    [sessionId, facilityId]
  );
  return result.rows.map((r) => ({ week: r.week, supplierId: r.supplier_id, quantity: Number(r.order_quantity) }));
}

export async function buildFacilityWeekInfo(
  pool: Queryable,
  data: ScenarioData,
  sessionId: string,
  openedFacilities: string[],
  facilityId: string,
  week: number,
  forecastingMethodId: ForecastingMethodId
): Promise<FacilityWeekInfo> {
  const { onHand, backlog } = await getFacilityStateBeforeWeek(
    pool,
    sessionId,
    facilityId,
    week,
    data.per_period_cost_parameters.initial_on_hand_inventory_units
  );

  const history = facilityDemandHistoryForForecast(data, openedFacilities, facilityId, week);
  const forecast = computeForecast(forecastingMethodId, history);

  const pastDecisions = await getPastDecisions(pool, sessionId, facilityId);
  const leadTimeBySupplier: Record<string, number> = {};
  for (const s of data.suppliers) leadTimeBySupplier[s.id] = s.lead_time_weeks;
  const arrivingThisWeek = arrivingInWeek(pastDecisions, week, leadTimeBySupplier);

  const weekDisruptions = disruptionsInWeek(data, week);
  const tariffSpike = weekDisruptions.find((d) => d.type === "tariff_spike");
  const capacityCut = weekDisruptions.find((d) => d.type === "supplier_capacity_cut");

  const suppliers = data.suppliers.map((s) => {
    const tariffOverride =
      tariffSpike && tariffSpike.target_supplier_id === s.id ? tariffSpike.effect.tariff_pct_override : undefined;
    const capacityMultiplier =
      capacityCut && capacityCut.target_supplier_id === s.id ? capacityCut.effect.capacity_multiplier : 1;
    return {
      id: s.id,
      name: s.name,
      originCountry: s.origin_country,
      tier: s.tier,
      reliabilityPct: s.reliability_pct,
      defectRatePct: s.defect_rate_pct,
      leadTimeWeeks: s.lead_time_weeks,
      landedUnitCost: landedUnitCost(s, tariffOverride),
      capacityThisWeek: Math.floor(s.capacity_per_facility_per_week * capacityMultiplier),
      diversificationCapPct: s.diversification_cap_pct,
    };
  });

  return {
    facilityId,
    onHandStart: onHand,
    backlogStart: backlog,
    forecast,
    arrivingThisWeek,
    suppliers,
  };
}

export function getSupplierLandedCostMap(
  data: ScenarioData,
  week: number
): Record<string, number> {
  const weekDisruptions = disruptionsInWeek(data, week);
  const tariffSpike = weekDisruptions.find((d) => d.type === "tariff_spike");
  const map: Record<string, number> = {};
  for (const s of data.suppliers) {
    const tariffOverride =
      tariffSpike && tariffSpike.target_supplier_id === s.id ? tariffSpike.effect.tariff_pct_override : undefined;
    map[s.id] = landedUnitCost(s, tariffOverride);
  }
  return map;
}

export { getSupplierById };
