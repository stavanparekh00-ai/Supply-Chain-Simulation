import {
  ScenarioData,
  disruptionsInWeek,
  facilityActualDemand,
  landedUnitCost,
} from "@/lib/scenarioData";
import { arrivingInWeek, OrderDecision, runRecursion } from "@/lib/recursion";
import { ForecastingMethodId } from "@/lib/forecasting";

/**
 * The Oracle benchmark -- NOT a perfect-foresight solve. This is the actual
 * output of the standalone no-lookahead solver (../../oracle_solver/), which
 * makes every decision -- network design, forecasting method, and every
 * week's order -- using only information available at the time that
 * decision has to be made, exactly like a player:
 *
 *   1. Network: chosen from static fixed + transport cost alone, restricted
 *      to networks where total supplier capacity covers every facility's
 *      average demand with enough margin to survive real lead-time
 *      ramp-up (no order ever arrives before week 2 here). No candidate
 *      network's 10-week outcome was simulated to make this choice.
 *   2. Forecasting method: backtested against the same pre-simulation
 *      historical demand a player sees on the forecast page, from the same
 *      6-method menu. Picked exponential smoothing (lowest historical MAE).
 *   3. Orders: decided one week at a time by a checkpoint-based MILP with a
 *      newsvendor safety margin, never seeing that week's or any future
 *      week's actual demand before committing.
 *
 * The order quantities below are that solver's literal output for this
 * scenario (see oracle_solver/main.py) -- everything else (arrivals, costs,
 * fill rate) is recomputed here via the exact same recursion.ts every
 * player's own decisions are scored by, so this benchmark and a player's
 * results are on identical footing. To regenerate after any scenario_data
 * change, re-run `python3 main.py` in oracle_solver/ and copy its per-week,
 * per-supplier order quantities back into ORACLE_ORDERS below.
 */
export const ORACLE_FACILITIES = ["F3", "F4"] as const;
export const ORACLE_METHOD_ID: ForecastingMethodId = "exp_smoothing";

const SUPPLIERS = [
  "domestic_fab",
  "regional_partner",
  "overseas_manufacturer",
] as const;

type BenchmarkFacility = (typeof ORACLE_FACILITIES)[number];
type BenchmarkSupplier = (typeof SUPPLIERS)[number];

const ORACLE_ORDERS: Record<
  BenchmarkFacility,
  Record<BenchmarkSupplier, number[]>
> = {
  F3: {
    domestic_fab: [710, 434, 355, 467, 255, 0, 691, 342, 109, 0],
    regional_partner: [231, 332, 419, 700, 382, 411, 494, 582, 624, 0],
    overseas_manufacturer: [800, 800, 800, 0, 0, 616, 800, 800, 800, 0],
  },
  F4: {
    domestic_fab: [900, 92, 369, 615, 561, 379, 39, 0, 87, 0],
    regional_partner: [396, 418, 471, 700, 700, 559, 586, 388, 574, 0],
    overseas_manufacturer: [800, 763, 800, 0, 0, 800, 800, 580, 800, 0],
  },
};

export interface BenchmarkWeek {
  week: number;
  procurementCost: number;
  holdingCost: number;
  backorderCost: number;
  totalCost: number;
  cumulativeCost: number;
  onHand: number;
  backlog: number;
  shipped: number;
  demand: number;
  fillRatePct: number;
}

export interface OracleBenchmark {
  status: "verified_precomputed";
  notice: string;
  methodId: ForecastingMethodId;
  methodName: string;
  openedFacilities: string[];
  totals: {
    fixedCost: number;
    transportCost: number;
    procurementCost: number;
    holdingCost: number;
    backorderCost: number;
    totalCost: number;
  };
  byWeek: BenchmarkWeek[];
}

/** Same one-time network cost formula as app/api/sessions/[id]/network/route.ts:
 * fixed cost to open each facility, plus each customer's transport cost from
 * whichever open facility is cheapest for it, at baseline weekly_demand. */
function oracleNetworkCost(data: ScenarioData): { fixedCost: number; transportCost: number } {
  const opened = new Set<string>(ORACLE_FACILITIES);
  const fixedCost = data.candidate_facilities
    .filter((f) => opened.has(f.id))
    .reduce((sum, f) => sum + f.fixed_cost_to_open, 0);
  let transportCost = 0;
  for (const customer of data.customers) {
    const rates = ORACLE_FACILITIES.map((f) => data.transport_cost_matrix[f][customer.id]);
    transportCost += Math.min(...rates) * customer.weekly_demand;
  }
  return { fixedCost, transportCost };
}

/**
 * The Oracle's own facility-week actual-demand rows (week, facility_id,
 * actual_demand), in the same shape scoreForecastAccuracy() already expects
 * for a player's period_state rows -- lets forecast accuracy be scored the
 * exact same way for both, rather than needing a separate "perfect
 * foresight" code path. The Oracle always uses F3+F4 regardless of which
 * network a given player opened, since it's one fixed benchmark shared by
 * everyone (the scenario is identical for all participants).
 */
export function buildOracleActualDemandRows(
  data: ScenarioData
): { week: number; facility_id: string; actual_demand: number }[] {
  const rows: { week: number; facility_id: string; actual_demand: number }[] = [];
  for (let week = 1; week <= data.scenario_metadata.horizon_periods; week += 1) {
    for (const facility of ORACLE_FACILITIES) {
      rows.push({
        week,
        facility_id: facility,
        actual_demand: facilityActualDemand(data, [...ORACLE_FACILITIES], facility, week),
      });
    }
  }
  return rows;
}

export function buildOracleBenchmark(data: ScenarioData): OracleBenchmark {
  const leadTimeBySupplier = Object.fromEntries(
    data.suppliers.map((supplier) => [supplier.id, supplier.lead_time_weeks])
  );
  const state = new Map<string, { onHand: number; backlog: number }>();
  const decisions = new Map<string, OrderDecision[]>();
  for (const facility of ORACLE_FACILITIES) {
    state.set(facility, {
      onHand: data.per_period_cost_parameters.initial_on_hand_inventory_units,
      backlog: 0,
    });
    decisions.set(facility, []);
  }

  const { fixedCost, transportCost } = oracleNetworkCost(data);

  const byWeek: BenchmarkWeek[] = [];
  let cumulativeCost = fixedCost + transportCost;

  for (let week = 1; week <= data.scenario_metadata.horizon_periods; week += 1) {
    let procurementCost = 0;
    let holdingCost = 0;
    let backorderCost = 0;
    let onHand = 0;
    let backlog = 0;
    let shipped = 0;
    let demand = 0;

    const tariff = disruptionsInWeek(data, week).find(
      (event) => event.type === "tariff_spike"
    );

    for (const facility of ORACLE_FACILITIES) {
      const facilityDecisions = decisions.get(facility)!;
      const thisWeeksOrders = SUPPLIERS.map((supplierId) => {
        const quantity = ORACLE_ORDERS[facility][supplierId][week - 1] ?? 0;
        facilityDecisions.push({ week, supplierId, quantity });
        const supplier = data.suppliers.find((item) => item.id === supplierId)!;
        const tariffOverride =
          tariff?.target_supplier_id === supplierId
            ? tariff.effect.tariff_pct_override
            : undefined;
        return {
          supplierId,
          quantity,
          landedUnitCost: landedUnitCost(supplier, tariffOverride),
        };
      });

      const arrivals = arrivingInWeek(
        facilityDecisions,
        week,
        leadTimeBySupplier
      );
      const previous = state.get(facility)!;
      const actualDemand = facilityActualDemand(
        data,
        [...ORACLE_FACILITIES],
        facility,
        week
      );
      const result = runRecursion({
        onHandStart: previous.onHand,
        backlogStart: previous.backlog,
        arriving: arrivals.arriving,
        arrivingOrdered: arrivals.ordered,
        actualDemand,
        thisWeeksOrders,
        holdingCostPerUnit:
          data.per_period_cost_parameters.holding_cost_per_unit_per_week,
        backorderCostPerUnit:
          data.per_period_cost_parameters.backorder_cost_per_unit_per_week,
      });

      state.set(facility, {
        onHand: result.onHandEnd,
        backlog: result.backlogEnd,
      });
      procurementCost += result.procurementCost;
      holdingCost += result.holdingCost;
      backorderCost += result.backorderCost;
      onHand += result.onHandEnd;
      backlog += result.backlogEnd;
      shipped += result.backlogServed + result.newServed;
      demand += actualDemand;
    }

    const totalCost = procurementCost + holdingCost + backorderCost;
    cumulativeCost += totalCost;
    byWeek.push({
      week,
      procurementCost,
      holdingCost,
      backorderCost,
      totalCost,
      cumulativeCost,
      onHand,
      backlog,
      shipped,
      demand,
      fillRatePct: demand > 0 ? Math.min(100, (shipped / demand) * 100) : 100,
    });
  }

  return {
    status: "verified_precomputed",
    notice:
      "The MILP Solver's real decisions: network and forecasting method chosen from only " +
      "pre-week-1 information, orders decided one week at a time with no visibility " +
      "into future demand -- the same rules a player plays by, not a perfect-foresight ceiling.",
    methodId: ORACLE_METHOD_ID,
    methodName: "Exponential Smoothing",
    openedFacilities: [...ORACLE_FACILITIES],
    totals: {
      fixedCost,
      transportCost,
      procurementCost: byWeek.reduce((sum, row) => sum + row.procurementCost, 0),
      holdingCost: byWeek.reduce((sum, row) => sum + row.holdingCost, 0),
      backorderCost: byWeek.reduce((sum, row) => sum + row.backorderCost, 0),
      totalCost:
        fixedCost + transportCost + byWeek.reduce((sum, row) => sum + row.totalCost, 0),
    },
    byWeek,
  };
}
