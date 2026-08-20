"""
Walks the naive player heuristic (player_heuristic.py) through the same
10-week horizon, forecast machinery, and realized-cost recursion the
Oracle uses -- the only thing that differs from oracle_rolling.py is HOW
each week's order is decided (a rule-based heuristic instead of a solved
LP). Everything else (forecast computation, disruption-adjusted demand,
recursion.py scoring) is identical, so any cost gap reflects decision
quality, not different information or different accounting.
"""

from typing import Dict, List, Tuple

from oracle_rolling import (
    FacilityRollingResult,
    WeekRecord,
    facility_actual_demand,
    forecast_facility_demand,
)
from player_heuristic import naive_player_week_order
from recursion import arriving_in_week, run_recursion
from scenario import ScenarioData, landed_cost_for_week


def run_facility_player(
    data: ScenarioData, facility_id: str, assignment: Dict[str, str], method_id: str
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
        orders = naive_player_week_order(data, week, on_hand, forecast)

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
        feasible=True,  # the naive heuristic never refuses to order -- it can run backlog, but it always produces *an* order
        procurement_cost=procurement_total,
        holding_cost=holding_total,
        backorder_cost=backorder_total,
        total_cost=procurement_total + holding_total + backorder_total,
        weeks=weeks,
    )


def solve_network_player(data: ScenarioData, opened: tuple, method_id: str) -> dict:
    from network import network_cost

    fixed, transport, assignment = network_cost(data, opened)
    facility_results: Dict[str, FacilityRollingResult] = {}
    ordering_cost = 0.0
    for facility_id in opened:
        result = run_facility_player(data, facility_id, assignment, method_id)
        facility_results[facility_id] = result
        ordering_cost += result.total_cost

    return {
        "opened_facilities": opened,
        "assignment": assignment,
        "fixed_cost": fixed,
        "transport_cost": transport,
        "network_cost": fixed + transport,
        "ordering_cost": ordering_cost,
        "total_cost": fixed + transport + ordering_cost,
        "feasible": True,
        "facility_results": facility_results,
    }
