/**
 * Shared scenario data loader -- TypeScript port of shared_schema/schema.py.
 *
 * This is the same data contract used by the (future) Oracle solver. Both
 * sides should ultimately load from the same source of truth
 * (shared_schema/scenario_data.json) so the "identical information"
 * fairness guarantee holds structurally, not just by convention.
 *
 * Contains ONLY data shapes, a loader, and no-lookahead-safe accessors --
 * no game/UI logic here, matching the same separation used in schema.py.
 */

import scenarioDataRaw from "@/data/scenario_data.json";

export interface Supplier {
  id: string;
  name: string;
  origin_country: string;
  tier: "High" | "Medium" | "Low";
  suggested_share_pct: number;
  base_unit_cost: number;
  baseline_tariff_pct: number;
  lead_time_weeks: number;
  reliability_pct: number;
  defect_rate_pct: number;
  capacity_per_facility_per_week: number;
}

export interface CandidateFacility {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  fixed_cost_to_open: number;
}

export interface Customer {
  id: string;
  name: string;
  city: string;
  map_x: number;
  map_y: number;
  weekly_demand: number;
  historical_demand_last_8_weeks: number[];
  actual_demand_ground_truth_by_week: number[];
}

export interface DisruptionEvent {
  week: number;
  type: "tariff_spike" | "demand_spike" | "supplier_capacity_cut";
  description: string;
  target_supplier_id?: string;
  target_customer_id?: string;
  effect: Record<string, number>;
}

export interface ForecastingMethod {
  id: string;
  name: string;
  params: Record<string, unknown>;
}

export interface ScenarioData {
  scenario_metadata: {
    product: string;
    period_unit: string;
    horizon_periods: number;
    notes: string;
  };
  allocation_guidance?: {
    description: string;
    soft_max_share_pct: number;
  };
  suppliers: Supplier[];
  candidate_facilities: CandidateFacility[];
  customers: Customer[];
  transport_cost_matrix: Record<string, Record<string, number>>;
  network_design_reference_solution: {
    opened_facilities: string[];
    closed_facilities: string[];
    customer_assignment: Record<string, string>;
    total_cost: number;
    fixed_cost_component: number;
    transport_cost_component: number;
  };
  per_period_cost_parameters: {
    holding_cost_per_unit_per_week: number;
    backorder_cost_per_unit_per_week: number;
    min_inventory_floor_units: number;
    max_inventory_ceiling_units: number;
    initial_on_hand_inventory_units: number;
    note: string;
  };
  disruption_schedule: DisruptionEvent[];
  forecasting_methods_menu: ForecastingMethod[];
}

export function loadScenarioData(): ScenarioData {
  return scenarioDataRaw as unknown as ScenarioData;
}

export function getSupplierById(data: ScenarioData, supplierId: string): Supplier {
  const s = data.suppliers.find((x) => x.id === supplierId);
  if (!s) throw new Error(`No supplier with id=${supplierId}`);
  return s;
}

export function getCustomerById(data: ScenarioData, customerId: string): Customer {
  const c = data.customers.find((x) => x.id === customerId);
  if (!c) throw new Error(`No customer with id=${customerId}`);
  return c;
}

export function softMaxSharePct(data: ScenarioData): number {
  return data.allocation_guidance?.soft_max_share_pct ?? 50;
}

/**
 * Which customers are served by a given facility, computed dynamically for
 * WHATEVER set of facilities this particular session opened -- never
 * hardcoded to the Oracle's own reference network design. Each customer is
 * assigned to whichever of the session's opened facilities offers it the
 * lowest transport cost (ties broken by facility id for determinism).
 *
 * This must stay dynamic: if a participant opens a different facility set
 * than the Oracle's optimal one, their customer assignment (and therefore
 * each facility's demand) needs to reflect THEIR choice, not the Oracle's.
 */
export function customersForFacility(
  data: ScenarioData,
  openedFacilities: string[],
  facilityId: string
): Customer[] {
  return data.customers.filter((c) => cheapestFacilityFor(data, openedFacilities, c.id) === facilityId);
}

function cheapestFacilityFor(data: ScenarioData, openedFacilities: string[], customerId: string): string {
  let best = openedFacilities[0];
  let bestCost = data.transport_cost_matrix[best][customerId];
  for (const f of openedFacilities.slice(1)) {
    const cost = data.transport_cost_matrix[f][customerId];
    if (cost < bestCost || (cost === bestCost && f < best)) {
      best = f;
      bestCost = cost;
    }
  }
  return best;
}

/** Landed unit cost for a supplier, optionally overriding the tariff (e.g. during a Tariff Spike disruption). */
export function landedUnitCost(supplier: Supplier, tariffPctOverride?: number): number {
  const tariffPct = tariffPctOverride ?? supplier.baseline_tariff_pct;
  return supplier.base_unit_cost * (1 + tariffPct / 100);
}

/**
 * SAFE, no-lookahead accessor: demand history for a single customer usable
 * for FORECASTING before deciding orders in `currentWeek`. Includes
 * pre-simulation history plus every week already revealed
 * (weeks 1..currentWeek-1). Never includes currentWeek's own actual demand
 * or any future week.
 */
export function customerDemandHistoryForForecast(
  data: ScenarioData,
  customerId: string,
  currentWeek: number
): number[] {
  if (currentWeek < 1) throw new Error("currentWeek must be >= 1");
  const customer = getCustomerById(data, customerId);
  return [
    ...customer.historical_demand_last_8_weeks,
    ...customer.actual_demand_ground_truth_by_week.slice(0, currentWeek - 1),
  ];
}

/**
 * SAFE, no-lookahead accessor: total demand for a facility (summed across
 * its assigned customers) usable for charting / legacy aggregate views.
 * Prefer forecasting per customer then summing (see gameEngine).
 */
export function facilityDemandHistoryForForecast(
  data: ScenarioData,
  openedFacilities: string[],
  facilityId: string,
  currentWeek: number
): number[] {
  if (currentWeek < 1) throw new Error("currentWeek must be >= 1");
  const customers = customersForFacility(data, openedFacilities, facilityId);
  const historyLength = customers[0]?.historical_demand_last_8_weeks.length ?? 0;
  const combined: number[] = [];
  for (let i = 0; i < historyLength; i++) {
    combined.push(customers.reduce((sum, c) => sum + c.historical_demand_last_8_weeks[i], 0));
  }
  for (let week = 1; week < currentWeek; week++) {
    combined.push(
      customers.reduce((sum, c) => sum + c.actual_demand_ground_truth_by_week[week - 1], 0)
    );
  }
  return combined;
}

/** SAFE accessor: ground-truth demand for a facility in a given (already-played) week. Scoring only. */
export function facilityActualDemand(
  data: ScenarioData,
  openedFacilities: string[],
  facilityId: string,
  week: number
): number {
  const customers = customersForFacility(data, openedFacilities, facilityId);
  return customers.reduce((sum, c) => sum + c.actual_demand_ground_truth_by_week[week - 1], 0);
}

/** SAFE accessor: disruption(s), if any, occurring exactly in this week. */
export function disruptionsInWeek(data: ScenarioData, week: number): DisruptionEvent[] {
  return data.disruption_schedule.filter((d) => d.week === week);
}

/** SAFE accessor: disruptions that have already happened by the end of currentWeek (inclusive). Never future ones. */
export function disruptionsRevealedThrough(data: ScenarioData, currentWeek: number): DisruptionEvent[] {
  return data.disruption_schedule.filter((d) => d.week <= currentWeek);
}
