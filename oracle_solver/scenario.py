"""
Loads the shared scenario data (shared_schema/schema.py + scenario_data.json)
and adds disruption-adjusted accessors the Oracle needs but schema.py doesn't
provide directly.

schema.py's own `actual_demand()` returns the raw, un-spiked ground-truth
value. The TypeScript port the live simulation actually uses
(simulation/lib/scenarioData.ts:customerActualDemand) additionally applies
demand_spike disruption multipliers on top of that base value before a
player ever sees it. The functions below replicate that exact behavior so
the Oracle is scored against precisely the same demand path a participant
would face -- not the pre-disruption raw series.
"""

import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "shared_schema"))

from schema import (  # noqa: E402
    DisruptionEvent,
    ScenarioData,
    Supplier,
    load_scenario_data,
)

__all__ = [
    "load_scenario_data",
    "ScenarioData",
    "Supplier",
    "DisruptionEvent",
    "js_round",
    "actual_demand_with_disruptions",
    "demand_history_for_forecast",
    "landed_cost_for_week",
    "capacity_for_week",
    "fill_rate_for_arrival_week",
    "HARD_SUPPLIER_SHARE_CAP",
]

# Hard per-supplier diversification cap used by BOTH solvers (ordering.py /
# rolling_ordering.py) as a risk-management constraint: no single supplier
# may supply more than this fraction of a facility's order in any one week.
# This is solver-only -- players in the live simulation are never
# constrained this way (suggested_share_pct / allocation_guidance are only
# ever shown to players as soft guidance, per gameEngine.ts and
# decisions/route.ts's own comment: "Supplier share limits are soft
# guidance only for players -- do not block submit"). A flat 60% for every
# supplier, chosen explicitly instead of each supplier's own
# suggested_share_pct (70/50/25), which described risk-TIER guidance for
# human players, not the Oracle's own risk-management rule.
HARD_SUPPLIER_SHARE_CAP = 0.60


def js_round(x: float) -> int:
    """Round-half-up, matching JavaScript's Math.round (Python's built-in
    round() uses banker's rounding, which can disagree on exact .5 ties)."""
    return math.floor(x + 0.5)


def _demand_spike_multiplier(data: ScenarioData, customer_id: str, week: int) -> float:
    multiplier = 1.0
    for d in data.disruptions_in_week(week):
        if d.type == "demand_spike" and d.target_customer_id == customer_id:
            multiplier *= float(d.effect.get("demand_multiplier", 1))
    return multiplier


def actual_demand_with_disruptions(data: ScenarioData, customer_id: str, week: int) -> int:
    """Ground-truth demand for one customer/week, with demand-spike
    disruptions applied -- mirrors scenarioData.ts:customerActualDemand."""
    base = data.actual_demand(customer_id, week)
    return js_round(base * _demand_spike_multiplier(data, customer_id, week))


def demand_history_for_forecast(data: ScenarioData, customer_id: str, current_week: int):
    """No-lookahead demand history usable for forecasting BEFORE deciding
    orders in `current_week`: pre-simulation history plus every week already
    revealed (1..current_week-1), disruption-adjusted -- mirrors
    scenarioData.ts:customerDemandHistoryForForecast exactly (which, unlike
    schema.py's demand_history_available_for_forecast, applies demand-spike
    disruptions to the revealed weeks). Never includes current_week itself
    or any future week."""
    if current_week < 1:
        raise ValueError("current_week must be >= 1")
    customer = data.customer_by_id(customer_id)
    revealed = [actual_demand_with_disruptions(data, customer_id, w) for w in range(1, current_week)]
    return list(customer.historical_demand_last_20_weeks) + revealed


def tariff_pct_for_week(data: ScenarioData, supplier: Supplier, week: int) -> float:
    for d in data.disruptions_in_week(week):
        if d.type == "tariff_spike" and d.target_supplier_id == supplier.id:
            return float(d.effect["tariff_pct_override"])
    return supplier.baseline_tariff_pct


def landed_cost_for_week(data: ScenarioData, supplier: Supplier, week: int) -> float:
    return supplier.landed_unit_cost(
        tariff_pct_override=tariff_pct_for_week(data, supplier, week)
    )


def capacity_for_week(data: ScenarioData, supplier: Supplier, week: int) -> int:
    multiplier = 1.0
    for d in data.disruptions_in_week(week):
        if d.type == "supplier_capacity_cut" and d.target_supplier_id == supplier.id:
            multiplier = float(d.effect["capacity_multiplier"])
    return math.floor(supplier.capacity_per_facility_per_week * multiplier)


def fill_rate_for_arrival_week(data: ScenarioData, supplier_id: str, arrival_week: int) -> float:
    """Fraction of an order that actually arrives in `arrival_week`, given a
    supplier_partial_fill disruption landing in that week. Not exercised by
    the current scenario_data.json (no such event exists in it today), but
    implemented for completeness/robustness if that ever changes."""
    for d in data.disruptions_in_week(arrival_week):
        if d.type == "supplier_partial_fill" and d.target_supplier_id == supplier_id:
            return float(d.effect.get("fill_rate", 1))
    return 1.0
