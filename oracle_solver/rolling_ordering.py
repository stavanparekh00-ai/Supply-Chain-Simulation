"""
The rolling, no-lookahead per-week ordering decision -- this is what makes
the Oracle actually comparable to a player: at week t it sees exactly what a
player would see (state carried over from previous weeks, the pipeline of
its own past orders, this week's revealed disruptions, and a forecast built
only from revealed history) and must commit to an order before knowing
actual demand for week t or beyond.

Model, per shared_schema/hand_worked_test_cases.md's checkpoint methodology
(Test Cases 1-3): feasibility/cost is evaluated at every intermediate
"checkpoint" k = 1..max_lead_time_among_suppliers, using the SAME flat
one-step forecast held constant across the window (none of the 6 menu
methods model a trend, so there's no principled way to forecast week t+2
differently from week t once already computed).

For checkpoint k (only checkpoints at least one supplier's lead time can
actually reach -- see below):
  supply_k          = (already-committed pipeline arriving by week t+k-1)
                       + (this week's order, counting only suppliers whose
                          lead time qualifies them to arrive within k weeks)
  physical_position_k = (on_hand_start - backlog_start) + supply_k - forecast*k
  physical_position_k <= max_inventory_ceiling_units    (HARD -- always
                          checked against the RAW forecast, never the
                          safety-buffered target below, so the ceiling can't
                          be quietly weakened by the safety margin)

SAFETY MARGIN (newsvendor order-up-to level, see safety_stock.py): rather
than pricing overage/shortage against the raw forecast (which implicitly
targets only the 50th-percentile outcome), the checkpoint's cost-pricing
target is buffered up to the cost-minimizing service level implied by
holding_rate vs backorder_rate:

  margin_k          = z * demand_stddev * sqrt(k)
                       (z = critical-fractile z-score; demand_stddev is the
                       facility's combined per-week demand stddev, estimated
                       from the SAME revealed history the forecast uses)
  buffered_position_k = physical_position_k - margin_k
  overage_k  = max(0,  buffered_position_k)   -- priced at holding_rate
  shortage_k = max(0, -buffered_position_k)   -- priced at backorder_rate

With demand_stddev=0 (the default), margin_k=0 and this collapses back to
exactly the original zero-safety-margin behavior.

IMPORTANT DESIGN NOTE -- why the forecast requirement is priced, not a hard
constraint: an earlier version made "cover the cumulative forecast" a hard
lower bound (physical_position_k >= 0, no exceptions). That is genuinely
infeasible on its own terms in real weeks here: e.g. a network serving all
6 customers from one facility can see a week-1 forecast near ~2,000 units,
but no supplier can deliver anything within 1 week (the fastest lead time
is 2), and even the 2-week checkpoint is capped by domestic_fab's capacity
alone (900/week) -- no order this week can out-run that regardless of
price. So the lower bound is priced instead of hard-enforced, summed across
every checkpoint (matching design brief Section 4.1's "projected holding
cost and projected backorder cost, summed across the full lead-time window
-- not just the next period").

Checkpoints where no supplier's lead time qualifies (k below the fastest
lead time) are skipped entirely: they involve no decision variables at all
(this week's order literally cannot arrive that fast), so encoding them
would only ever produce a spurious "infeasible" from a state this week's
decision had no power to change, or a cost term the decision can't affect.

Objective: minimize procurement cost of this week's order, plus the summed
holding/backorder proxy above (using the safety-buffered target).
"""

import math
from typing import Dict, List, Optional, Tuple

import pulp

from safety_stock import critical_fractile_z
from scenario import HARD_SUPPLIER_SHARE_CAP, ScenarioData, capacity_for_week, landed_cost_for_week


def pipeline_arriving_by(
    order_history: List[Tuple[int, str, int]],  # (week, supplier_id, qty)
    week: int,
    k: int,
    lead_time_by_supplier: Dict[str, int],
) -> int:
    """Units from ALREADY-PLACED past orders (week < `week`) arriving within
    the window [week, week + k - 1] -- i.e. by checkpoint k, not already
    counted in on_hand_start (which only reflects arrivals through week-1)."""
    total = 0
    for order_week, supplier_id, qty in order_history:
        arrival_week = order_week + lead_time_by_supplier[supplier_id] - 1
        if week <= arrival_week <= week + k - 1:
            total += qty
    return total


def diagnose_infeasibility(
    data: ScenarioData,
    facility_id: str,
    week: int,
    on_hand_start: float,
    backlog_start: float,
    order_history: List[Tuple[int, str, int]],
    forecast: float,
) -> str:
    """Called when solve_week_order returns None. Almost always this is a
    ceiling breach forced by ALREADY-COMMITTED pipeline (from past orders
    this week's decision can no longer undo), not something ordering less
    this week could fix -- e.g. an earlier week's forecast spiked, causing
    a large order, which then arrives just as demand cools back down.
    Recomputes each checkpoint with this week's order forced to zero (the
    best case for avoiding ceiling breach) to identify exactly which
    checkpoint is unavoidably over, for a readable error message."""
    ceiling = data.per_period_cost_parameters.max_inventory_ceiling_units
    lead_time = {s.id: s.lead_time_weeks for s in data.suppliers}
    max_lead = max(lead_time.values())
    net_position_start = on_hand_start - backlog_start
    lines = []
    for k in range(1, max_lead + 1):
        if not any(lead_time[s.id] <= k for s in data.suppliers):
            continue
        pipeline_k = pipeline_arriving_by(order_history, week, k, lead_time)
        best_case_position = net_position_start + pipeline_k - forecast * k
        if best_case_position > ceiling:
            lines.append(
                f"checkpoint k={k}: even ordering zero this week, projected position "
                f"{best_case_position:.0f} > ceiling {ceiling:.0f} (already-committed pipeline "
                f"arriving by then = {pipeline_k:.0f})"
            )
    if not lines:
        return "infeasible for a reason other than an unavoidable ceiling breach (capacity/diversification-cap interaction)"
    return "; ".join(lines)


def solve_week_order(
    data: ScenarioData,
    facility_id: str,
    week: int,
    on_hand_start: float,
    backlog_start: float,
    order_history: List[Tuple[int, str, int]],
    forecast: float,
    demand_stddev: float = 0.0,
) -> Optional[Dict[str, int]]:
    suppliers = data.suppliers
    ceiling = data.per_period_cost_parameters.max_inventory_ceiling_units
    holding_rate = data.per_period_cost_parameters.holding_cost_per_unit_per_week
    backorder_rate = data.per_period_cost_parameters.backorder_cost_per_unit_per_week
    lead_time = {s.id: s.lead_time_weeks for s in suppliers}
    share_cap = {s.id: HARD_SUPPLIER_SHARE_CAP for s in suppliers}
    capacity = {s.id: capacity_for_week(data, s, week) for s in suppliers}
    landed_cost = {s.id: landed_cost_for_week(data, s, week) for s in suppliers}
    max_lead = max(lead_time.values())
    z = critical_fractile_z(holding_rate, backorder_rate)

    prob = pulp.LpProblem(f"oracle_week_{facility_id}_{week}", pulp.LpMinimize)
    order = {
        s.id: pulp.LpVariable(f"order_{facility_id}_{week}_{s.id}", lowBound=0, cat="Integer")
        for s in suppliers
    }

    net_position_start = on_hand_start - backlog_start
    checkpoint_cost_terms = []

    for k in range(1, max_lead + 1):
        qualifying = [s for s in suppliers if lead_time[s.id] <= k]
        if not qualifying:
            # No supplier can possibly arrive within k weeks -- this
            # checkpoint is entirely determined by already-committed history,
            # not by anything decided this week. Nothing to constrain or
            # price here.
            continue
        pipeline_k = pipeline_arriving_by(order_history, week, k, lead_time)
        supply_k = pipeline_k + pulp.lpSum(order[s.id] for s in qualifying)
        physical_position_k = net_position_start + supply_k - forecast * k

        # Hard ceiling -- always against the RAW (unbuffered) forecast, so
        # the safety margin below can never weaken this constraint.
        prob += physical_position_k <= ceiling, f"ceiling_{facility_id}_{week}_k{k}"

        margin_k = z * demand_stddev * math.sqrt(k)
        buffered_position_k = physical_position_k - margin_k

        overage_k = pulp.LpVariable(f"overage_{facility_id}_{week}_k{k}", lowBound=0)
        shortage_k = pulp.LpVariable(f"shortage_{facility_id}_{week}_k{k}", lowBound=0)
        prob += overage_k - shortage_k == buffered_position_k, f"split_{facility_id}_{week}_k{k}"

        checkpoint_cost_terms.append(holding_rate * overage_k + backorder_rate * shortage_k)

    total_order = pulp.lpSum(order[s.id] for s in suppliers)
    for s in suppliers:
        prob += order[s.id] <= capacity[s.id], f"cap_{facility_id}_{week}_{s.id}"
        prob += order[s.id] <= share_cap[s.id] * total_order, f"divcap_{facility_id}_{week}_{s.id}"

    procurement = pulp.lpSum(order[s.id] * landed_cost[s.id] for s in suppliers)
    prob += procurement + pulp.lpSum(checkpoint_cost_terms)

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[prob.status] != "Optimal":
        return None

    return {s.id: int(round(order[s.id].value())) for s in suppliers}
