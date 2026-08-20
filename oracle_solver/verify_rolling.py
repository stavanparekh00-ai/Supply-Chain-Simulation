"""
Independent verification for the rolling, no-lookahead Oracle's output.

1. Constraint checks -- capacity, the flat 60% hard diversification cap,
   and the ceiling, re-derived directly from each week's recorded decision.
2. Recursion replay -- feed the exact sequence of committed orders back
   through recursion.py from scratch and confirm the resulting on-hand /
   backlog / cost trace matches what the rolling walk-forward already
   computed. This mainly guards against bookkeeping bugs in
   oracle_rolling.py's loop itself (e.g. state not carried over correctly
   between weeks).

Raises AssertionError on any mismatch.
"""

from typing import Dict

from oracle_rolling import FacilityRollingResult
from recursion import arriving_in_week, run_recursion
from scenario import HARD_SUPPLIER_SHARE_CAP, ScenarioData, capacity_for_week, landed_cost_for_week

TOLERANCE = 1e-3


def verify_facility_rolling_result(data: ScenarioData, facility_id: str, result: FacilityRollingResult) -> None:
    assert result.feasible, f"{facility_id}: not feasible"
    ceiling = data.per_period_cost_parameters.max_inventory_ceiling_units
    initial_on_hand = data.per_period_cost_parameters.initial_on_hand_inventory_units
    lead_time_by_supplier = {s.id: s.lead_time_weeks for s in data.suppliers}

    order_schedule: Dict = {}
    for record in result.weeks:
        week = record.week
        total_t = sum(record.orders.values())
        for s in data.suppliers:
            qty = record.orders[s.id]
            assert qty >= 0 and qty == int(qty), f"{facility_id} w{week} {s.id}: order not a non-negative integer"
            cap = capacity_for_week(data, s, week)
            assert qty <= cap + TOLERANCE, f"{facility_id} w{week} {s.id}: order {qty} exceeds capacity {cap}"
            if total_t > 0:
                share = qty / total_t
                assert share <= HARD_SUPPLIER_SHARE_CAP + 1e-6, (
                    f"{facility_id} w{week} {s.id}: share {share:.1%} exceeds hard cap "
                    f"{HARD_SUPPLIER_SHARE_CAP:.0%}"
                )
            order_schedule[(s.id, week)] = qty
        assert record.on_hand_end <= ceiling + TOLERANCE, f"{facility_id} w{week}: on_hand exceeds ceiling"
        assert record.on_hand_end >= -TOLERANCE, f"{facility_id} w{week}: negative on_hand"
        assert record.backlog_end >= -TOLERANCE, f"{facility_id} w{week}: negative backlog"

    # Independent replay from scratch through recursion.py.
    on_hand = initial_on_hand
    backlog = 0.0
    for record in result.weeks:
        week = record.week
        arriving, _ordered = arriving_in_week(order_schedule, week, lead_time_by_supplier)
        this_weeks_orders = [
            (record.orders[s.id], landed_cost_for_week(data, s, week)) for s in data.suppliers
        ]
        replayed = run_recursion(
            on_hand_start=on_hand,
            backlog_start=backlog,
            arriving=arriving,
            actual_demand=record.actual_demand,
            this_weeks_orders=this_weeks_orders,
            holding_cost_per_unit=data.per_period_cost_parameters.holding_cost_per_unit_per_week,
            backorder_cost_per_unit=data.per_period_cost_parameters.backorder_cost_per_unit_per_week,
        )
        assert abs(replayed["on_hand_end"] - record.on_hand_end) <= TOLERANCE, (
            f"{facility_id} w{week}: replayed on_hand {replayed['on_hand_end']} != recorded {record.on_hand_end}"
        )
        assert abs(replayed["backlog_end"] - record.backlog_end) <= TOLERANCE, (
            f"{facility_id} w{week}: replayed backlog {replayed['backlog_end']} != recorded {record.backlog_end}"
        )
        on_hand, backlog = replayed["on_hand_end"], replayed["backlog_end"]

    replayed_total = sum(
        r.procurement_cost + r.holding_cost + r.backorder_cost for r in result.weeks
    )
    assert abs(replayed_total - result.total_cost) <= TOLERANCE * len(result.weeks), (
        f"{facility_id}: summed weekly costs {replayed_total:.2f} != reported total {result.total_cost:.2f}"
    )


def verify_network_rolling_result(data: ScenarioData, network_result: dict) -> None:
    for facility_id, result in network_result["facility_results"].items():
        verify_facility_rolling_result(data, facility_id, result)
