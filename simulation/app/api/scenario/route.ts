import { NextResponse } from "next/server";
import { loadScenarioData } from "@/lib/scenarioData";
import { FORECASTING_METHODS } from "@/lib/forecasting";

/**
 * Public-facing scenario data for the setup screens.
 *
 * IMPORTANT: this intentionally excludes anything that would leak
 * information a participant shouldn't have yet:
 *  - network_design_reference_solution (the Oracle's answer to the facility
 *    network decision -- showing this would defeat the exercise entirely)
 *  - disruption_schedule (revealed week-by-week via /api/sessions/[id]/period
 *    instead, never all at once up front)
 *  - each customer's actual_demand_ground_truth_by_week (future ground
 *    truth -- only historical_demand_last_8_weeks is exposed here)
 */
export async function GET() {
  const data = loadScenarioData();

  return NextResponse.json({
    scenario_metadata: data.scenario_metadata,
    candidate_facilities: data.candidate_facilities,
    customers: data.customers.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city,
      map_x: c.map_x,
      map_y: c.map_y,
      weekly_demand: c.weekly_demand,
      historical_demand_last_8_weeks: c.historical_demand_last_8_weeks,
    })),
    transport_cost_matrix: data.transport_cost_matrix,
    suppliers: data.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      origin_country: s.origin_country,
      tier: s.tier,
      diversification_cap_pct: s.diversification_cap_pct,
      base_unit_cost: s.base_unit_cost,
      baseline_tariff_pct: s.baseline_tariff_pct,
      lead_time_weeks: s.lead_time_weeks,
      reliability_pct: s.reliability_pct,
      defect_rate_pct: s.defect_rate_pct,
      capacity_per_facility_per_week: s.capacity_per_facility_per_week,
    })),
    per_period_cost_parameters: {
      holding_cost_per_unit_per_week: data.per_period_cost_parameters.holding_cost_per_unit_per_week,
      backorder_cost_per_unit_per_week: data.per_period_cost_parameters.backorder_cost_per_unit_per_week,
      min_inventory_floor_units: data.per_period_cost_parameters.min_inventory_floor_units,
      max_inventory_ceiling_units: data.per_period_cost_parameters.max_inventory_ceiling_units,
      initial_on_hand_inventory_units: data.per_period_cost_parameters.initial_on_hand_inventory_units,
    },
    forecasting_methods_menu: FORECASTING_METHODS,
  });
}
