"""
The rolling, no-lookahead Oracle: walks the 10-week horizon one week at a
time, exactly like a player going through the live simulation. At each
week it only uses state carried over from previous weeks (on-hand,
backlog, its own pipeline of not-yet-arrived past orders) plus a forecast
built from revealed history -- never the actual demand for that week or
any future week. Actual demand is revealed only AFTER the order is
committed, to run the same realized-cost recursion the app itself uses
(recursion.py) and produce the next week's starting state.

This directly answers "the solver doesn't know what's going to happen next
week, just like the player" -- it doesn't, by construction.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from forecasting import compute_forecast
from forecasting_selection import select_best_forecasting_method
from network import candidate_networks, cheapest_static_network, network_cost
from recursion import arriving_in_week, run_recursion
from rolling_ordering import diagnose_infeasibility, solve_week_order
from safety_stock import demand_stddev as customer_demand_stddev
from scenario import (
    ScenarioData,
    actual_demand_with_disruptions,
    demand_history_for_forecast,
    landed_cost_for_week,
)


@dataclass
class WeekRecord:
    week: int
    forecast: float
    actual_demand: float
    orders: Dict[str, int]
    on_hand_end: float
    backlog_end: float
    procurement_cost: float
    holding_cost: float
    backorder_cost: float


@dataclass
class FacilityRollingResult:
    facility_id: str
    feasible: bool
    procurement_cost: float = 0.0
    holding_cost: float = 0.0
    backorder_cost: float = 0.0
    total_cost: float = 0.0
    weeks: List[WeekRecord] = field(default_factory=list)
    infeasible_week: Optional[int] = None
    infeasible_reason: Optional[str] = None


def facility_actual_demand(data: ScenarioData, assignment: Dict[str, str], facility_id: str, week: int) -> float:
    customers = [c for c in data.customers if assignment[c.id] == facility_id]
    return sum(actual_demand_with_disruptions(data, c.id, week) for c in customers)


def forecast_facility_demand(
    data: ScenarioData, method_id: str, assignment: Dict[str, str], facility_id: str, week: int
) -> float:
    """Each assigned customer is forecast independently, then summed --
    mirrors simulation/lib/gameEngine.ts:forecastFacilityDemand exactly."""
    customers = [c for c in data.customers if assignment[c.id] == facility_id]
    return sum(
        compute_forecast(method_id, demand_history_for_forecast(data, c.id, week)) for c in customers
    )


def facility_demand_stddev(
    data: ScenarioData, assignment: Dict[str, str], facility_id: str, week: int
) -> float:
    """Facility-level per-week demand stddev, combined from each assigned
    customer's stddev over the SAME revealed-history window the forecast
    itself uses (no lookahead). Customers are assumed independent, so
    variances sum: combined_sigma = sqrt(sum of each customer's sigma^2)."""
    customers = [c for c in data.customers if assignment[c.id] == facility_id]
    variance = sum(
        customer_demand_stddev(demand_history_for_forecast(data, c.id, week)) ** 2 for c in customers
    )
    return variance ** 0.5


def run_facility_rolling(
    data: ScenarioData,
    facility_id: str,
    assignment: Dict[str, str],
    method_id: str,
    use_safety_margin: bool = True,
) -> FacilityRollingResult:
    horizon = data.metadata.horizon_periods
    holding_rate = data.per_period_cost_parameters.holding_cost_per_unit_per_week
    backorder_rate = data.per_period_cost_parameters.backorder_cost_per_unit_per_week
    lead_time_by_supplier = {s.id: s.lead_time_weeks for s in data.suppliers}

    on_hand = data.per_period_cost_parameters.initial_on_hand_inventory_units
    backlog = 0.0
    order_history: List[Tuple[int, str, int]] = []
    weeks: List[WeekRecord] = []
    procurement_total = holding_total = backorder_total = 0.0

    for week in range(1, horizon + 1):
        forecast = forecast_facility_demand(data, method_id, assignment, facility_id, week)
        stddev = facility_demand_stddev(data, assignment, facility_id, week) if use_safety_margin else 0.0
        if week == horizon:
            orders = {s.id: 0 for s in data.suppliers}
        else:
            orders = solve_week_order(
                data, facility_id, week, on_hand, backlog, order_history, forecast, demand_stddev=stddev
            )
        if orders is None:
            reason = diagnose_infeasibility(
                data, facility_id, week, on_hand, backlog, order_history, forecast
            )
            return FacilityRollingResult(
                facility_id=facility_id, feasible=False, infeasible_week=week, infeasible_reason=reason
            )

        for supplier_id, qty in orders.items():
            order_history.append((week, supplier_id, qty))

        order_schedule = {(s_id, w): qty for (w, s_id, qty) in order_history}
        arriving, _ordered = arriving_in_week(order_schedule, week, lead_time_by_supplier)
        actual_demand = facility_actual_demand(data, assignment, facility_id, week)
        this_weeks_orders = [
            (orders[s.id], landed_cost_for_week(data, s, week)) for s in data.suppliers
        ]

        result = run_recursion(
            on_hand_start=on_hand,
            backlog_start=backlog,
            arriving=arriving,
            actual_demand=actual_demand,
            this_weeks_orders=this_weeks_orders,
            holding_cost_per_unit=holding_rate,
            backorder_cost_per_unit=backorder_rate,
        )

        weeks.append(
            WeekRecord(
                week=week,
                forecast=forecast,
                actual_demand=actual_demand,
                orders=orders,
                on_hand_end=result["on_hand_end"],
                backlog_end=result["backlog_end"],
                procurement_cost=result["procurement_cost"],
                holding_cost=result["holding_cost"],
                backorder_cost=result["backorder_cost"],
            )
        )
        procurement_total += result["procurement_cost"]
        holding_total += result["holding_cost"]
        backorder_total += result["backorder_cost"]
        on_hand, backlog = result["on_hand_end"], result["backlog_end"]

    return FacilityRollingResult(
        facility_id=facility_id,
        feasible=True,
        procurement_cost=procurement_total,
        holding_cost=holding_total,
        backorder_cost=backorder_total,
        total_cost=procurement_total + holding_total + backorder_total,
        weeks=weeks,
    )


def solve_network_rolling(
    data: ScenarioData, opened: tuple, method_id: str, use_safety_margin: bool = True
) -> dict:
    fixed, transport, assignment = network_cost(data, opened)
    facility_results: Dict[str, FacilityRollingResult] = {}
    ordering_cost = 0.0
    feasible = True
    for facility_id in opened:
        result = run_facility_rolling(data, facility_id, assignment, method_id, use_safety_margin)
        facility_results[facility_id] = result
        if not result.feasible:
            feasible = False
        else:
            ordering_cost += result.total_cost

    return {
        "opened_facilities": opened,
        "assignment": assignment,
        "fixed_cost": fixed,
        "transport_cost": transport,
        "network_cost": fixed + transport,
        "ordering_cost": ordering_cost if feasible else float("inf"),
        "total_cost": (fixed + transport + ordering_cost) if feasible else float("inf"),
        "feasible": feasible,
        "facility_results": facility_results,
    }


def solve_oracle_no_lookahead(
    data: ScenarioData, max_open: int = 3, use_safety_margin: bool = True
) -> Tuple[dict, str, Dict[str, float]]:
    """THE genuinely fair Oracle run -- the one that should actually be used
    to benchmark a player, because it makes every decision (network,
    forecasting method, and every week's order) using only information
    available at the time that decision has to be made, exactly like a
    player going through the live simulation:

      1. Network: cheapest_static_network() -- fixed + transport cost only,
         the same numbers a player sees on the network design page. No
         ordering-cost simulation is run to compare candidate networks; a
         player can't preview that either before committing.
      2. Forecasting method: select_best_forecasting_method() -- backtested
         against pre-simulation historical demand only (the same "last 20
         weeks" chart a player sees on the forecast page before locking in
         a method).
      3. Ordering: one rolling, week-by-week walkthrough of the chosen
         network under the chosen method (solve_network_rolling).

    An earlier version of this function (previously also named
    solve_oracle_rolling) instead ran EVERY candidate network's full
    10-week simulation and picked whichever realized the lowest total cost
    -- that uses the actual future demand outcome to make the network
    choice, which is a lookahead violation at the network-design stage
    even though the per-week ordering decisions that follow are themselves
    honest. That comparison is still useful as a hindsight/sensitivity
    tool (see solve_oracle_full_grid, used by full_comparison.py) -- it
    just isn't what a fair Oracle benchmark actually does.

    Returns (result, method_id, method_scores) for the single committed
    (network, method) path -- not a sorted list of alternatives.
    """
    opened, _fixed, _transport, _assignment = cheapest_static_network(data, max_open)
    method_id, method_scores = select_best_forecasting_method(data)
    result = solve_network_rolling(data, opened, method_id, use_safety_margin)
    return result, method_id, method_scores


def solve_oracle_full_grid(
    data: ScenarioData, max_open: int = 3, use_safety_margin: bool = True
) -> Dict[tuple, Dict[str, dict]]:
    """Solves EVERY (network, forecasting method) combination, not just the
    single backtested-best method -- lets you see whether the method chosen
    by backtesting historical error is actually the one that produces the
    lowest REALIZED cost against this scenario's specific frozen actual-
    demand draw (backtesting and realized outcome can disagree; that's a
    legitimate finding, not a bug, if it happens).

    Returns {opened_facilities_tuple: {method_id: network_result_dict}} for
    every candidate network (1-3 open facilities)."""
    from forecasting import METHOD_IDS

    grid: Dict[tuple, Dict[str, dict]] = {}
    for opened in candidate_networks(data, max_open):
        grid[opened] = {
            method_id: solve_network_rolling(data, opened, method_id, use_safety_margin)
            for method_id in METHOD_IDS
        }
    return grid
