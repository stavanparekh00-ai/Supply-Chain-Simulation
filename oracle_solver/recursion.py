"""
Python port of simulation/lib/recursion.ts -- the exact realized-cost
recursion the live app uses to score decisions after the fact. Used by
verify.py to independently replay the Oracle's chosen order schedule and
confirm its self-reported cost matches what the app's own accounting would
produce, rather than trusting the MILP's internal bookkeeping blindly.
"""

import math
from typing import Dict, List, Tuple


def arriving_in_week(
    order_schedule: Dict[Tuple[str, int], int],
    target_week: int,
    lead_time_by_supplier: Dict[str, int],
    fill_rate_by_supplier: Dict[str, float] = None,
) -> Tuple[int, int]:
    fill_rate_by_supplier = fill_rate_by_supplier or {}
    arriving = 0
    ordered = 0
    for (supplier_id, week), qty in order_schedule.items():
        if week + lead_time_by_supplier[supplier_id] - 1 != target_week:
            continue
        rate = fill_rate_by_supplier.get(supplier_id, 1)
        delivered = math.floor(qty * rate)
        ordered += qty
        arriving += delivered
    return arriving, ordered


def run_recursion(
    on_hand_start: float,
    backlog_start: float,
    arriving: float,
    actual_demand: float,
    this_weeks_orders: List[Tuple[int, float]],  # (quantity, landed_unit_cost)
    holding_cost_per_unit: float,
    backorder_cost_per_unit: float,
) -> dict:
    available = on_hand_start + arriving
    backlog_served = min(available, backlog_start)
    remain = available - backlog_served
    new_served = min(remain, actual_demand)
    backlog_end = backlog_start - backlog_served + (actual_demand - new_served)
    on_hand_end = remain - new_served

    procurement_cost = sum(qty * cost for qty, cost in this_weeks_orders)
    holding_cost = holding_cost_per_unit * on_hand_end
    backorder_cost = backorder_cost_per_unit * backlog_end

    return {
        "on_hand_end": on_hand_end,
        "backlog_end": backlog_end,
        "procurement_cost": procurement_cost,
        "holding_cost": holding_cost,
        "backorder_cost": backorder_cost,
        "total_cost": procurement_cost + holding_cost + backorder_cost,
    }
