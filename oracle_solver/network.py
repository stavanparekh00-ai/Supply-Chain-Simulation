"""
Stage 0: facility network design.

Mirrors simulation/lib/scenarioData.ts (customersForFacility /
cheapestFacilityFor) and simulation/app/api/sessions/[id]/network/route.ts
exactly: given a set of OPEN facilities, each customer is served by
whichever open facility is cheapest to ship to (using the static
per-unit transport_cost_matrix and each customer's baseline weekly_demand,
not any single week's actual demand -- this is a one-time network cost,
independent of the 10-week ordering decisions).
"""

import itertools
from typing import Dict, Iterable, List, Tuple

from scenario import ScenarioData

MAX_OPEN_FACILITIES = 3


def cheapest_open_facility(data: ScenarioData, opened: Iterable[str], customer_id: str) -> str:
    return min(opened, key=lambda f: (data.transport_cost_matrix[f][customer_id], f))


def customer_assignment(data: ScenarioData, opened: Iterable[str]) -> Dict[str, str]:
    return {c.id: cheapest_open_facility(data, opened, c.id) for c in data.customers}


def network_cost(data: ScenarioData, opened: Iterable[str]) -> Tuple[float, float, Dict[str, str]]:
    """Returns (fixed_cost, transport_cost, customer_assignment)."""
    opened = list(opened)
    fixed = sum(f.fixed_cost_to_open for f in data.candidate_facilities if f.id in opened)
    assignment = customer_assignment(data, opened)
    transport = sum(
        data.transport_cost_matrix[assignment[c.id]][c.id] * c.weekly_demand
        for c in data.customers
    )
    return fixed, transport, assignment


def candidate_networks(data: ScenarioData, max_open: int = MAX_OPEN_FACILITIES) -> Iterable[Tuple[str, ...]]:
    """Every facility subset of size 1..max_open, matching the simulation's
    own MAX_OPEN_FACILITIES=3 rule (network/page.tsx, network/route.ts)."""
    ids = [f.id for f in data.candidate_facilities]
    for k in range(1, max_open + 1):
        yield from itertools.combinations(ids, k)


def facility_customer_demand(data: ScenarioData, assignment: Dict[str, str], facility_id: str) -> float:
    """Average weekly demand a facility must serve -- sum of its assigned
    customers' baseline weekly_demand (the same figure network_cost already
    uses for transport cost, not any single week's noisy actual demand)."""
    return sum(c.weekly_demand for c in data.customers if assignment[c.id] == facility_id)


def max_cumulative_supply_by_week(data: ScenarioData, horizon: int) -> Dict[int, float]:
    """The most ANY facility could possibly have received by week k, if it
    ordered at full capacity from every supplier starting week 1 -- a hard
    physical upper bound on deliverable supply, independent of ordering
    skill or forecast quality (no policy can order more than full capacity,
    or receive an order before its lead time elapses). Captures the
    lead-time RAMP-UP explicitly: e.g. nothing at all arrives in week 1
    (the fastest supplier still takes 2 weeks), so early weeks deliver far
    less than the eventual steady-state throughput once the pipeline is
    full. Simply summing every supplier's capacity_per_facility_per_week
    (2400/week here) describes only that eventual steady state and
    silently assumes it's available from day one, which overstates what a
    facility can actually receive during ramp-up."""
    lead_time = {s.id: s.lead_time_weeks for s in data.suppliers}
    capacity = {s.id: s.capacity_per_facility_per_week for s in data.suppliers}
    initial_on_hand = data.per_period_cost_parameters.initial_on_hand_inventory_units

    arriving_by_week: Dict[int, float] = {}
    for order_week in range(1, horizon + 1):
        for s in data.suppliers:
            arrival_week = order_week + lead_time[s.id] - 1
            if arrival_week <= horizon:
                arriving_by_week[arrival_week] = arriving_by_week.get(arrival_week, 0) + capacity[s.id]

    cumulative: Dict[int, float] = {}
    running = initial_on_hand
    for week in range(1, horizon + 1):
        running += arriving_by_week.get(week, 0)
        cumulative[week] = running
    return cumulative


def max_sustainable_average_demand(data: ScenarioData) -> float:
    """The tightest average weekly demand a facility could possibly keep up
    with, given true lead-time ramp-up -- not just steady-state capacity.
    Checks cumulative deliverable supply against cumulative demand (at a
    flat average rate) at EVERY week and returns the most binding one. In
    this scenario the binding week is week 2 (only initial on-hand plus the
    fastest supplier's first delivery has landed by then), giving a cap of
    1,250/week -- well below the naive 2,400/week steady-state total."""
    horizon = data.metadata.horizon_periods
    cumulative_supply = max_cumulative_supply_by_week(data, horizon)
    return min(cumulative_supply[k] / k for k in cumulative_supply)


def facility_demand_violations(data: ScenarioData, opened: Iterable[str]) -> Dict[str, Tuple[float, float]]:
    """STATIC feasibility check, evaluated using only information published
    before week 1: a facility's average (baseline) customer demand must not
    exceed max_sustainable_average_demand -- the tightest weekly rate the
    facility could structurally keep up with, given real lead-time
    ramp-up. This is legitimate ex-ante reasoning, not a lookahead
    violation: it never touches actual/realized demand, only the same
    baseline weekly_demand figure the fixed+transport cost calculation
    itself already uses, plus each supplier's published lead_time_weeks
    and capacity_per_facility_per_week, and the published
    initial_on_hand_inventory_units.

    No calibration constant is needed here (unlike an earlier version of
    this check, which used a total-capacity-vs-demand ratio tuned against
    empirical outcomes) -- the cap is derived directly from the mechanics
    of the ordering model itself, so it's exact rather than approximated.
    This deliberately only catches STRUCTURAL infeasibility (can the
    facility keep up with average demand at all); volatility around that
    average (this scenario's +/-75% weekly noise) is a separate concern,
    handled at ordering time by the newsvendor safety margin
    (safety_stock.py), not here.

    Returns {facility_id: (demand, max_sustainable_average_demand)} for
    every facility that VIOLATES this rule; an empty dict means the
    network is statically viable."""
    cap = max_sustainable_average_demand(data)
    assignment = customer_assignment(data, opened)
    violations = {}
    for facility_id in opened:
        demand = facility_customer_demand(data, assignment, facility_id)
        if demand > cap:
            violations[facility_id] = (demand, cap)
    return violations


def cheapest_static_network(
    data: ScenarioData, max_open: int = MAX_OPEN_FACILITIES
) -> Tuple[Tuple[str, ...], float, float, Dict[str, str]]:
    """The network a genuinely no-lookahead decision-maker actually picks:
    minimize fixed_cost + transport_cost, restricted to networks that pass
    the static capacity-margin feasibility check above -- using nothing but
    statically-known information available BEFORE week 1 (the network
    design page's own numbers, plus supplier capacity, which is published
    in the game just as much as the transport matrix is).

    This deliberately does NOT compare candidate networks by running each
    one's 10-week ordering simulation and picking whichever realizes the
    lowest total cost -- doing that would use the ACTUAL future demand
    outcome to make a decision that has to be made before that future is
    known, which is a lookahead violation at the network-design stage even
    if the per-week ordering decisions that follow are themselves honest.
    The capacity-margin check above is different in kind: it's a pure
    function of published, pre-week-1 numbers, so applying it here is not
    lookahead -- it's the same category of reasoning as minimizing
    fixed+transport cost itself.

    Returns (opened_facilities, fixed_cost, transport_cost, assignment).
    """
    best = None
    for opened in candidate_networks(data, max_open):
        if facility_demand_violations(data, opened):
            continue
        fixed, transport, assignment = network_cost(data, opened)
        total = fixed + transport
        if best is None or total < best[0]:
            best = (total, opened, fixed, transport, assignment)
    if best is None:
        raise ValueError(
            "No candidate network (up to max_open facilities) passes the static "
            "capacity-margin feasibility check -- max_open may need to be raised."
        )
    _, opened, fixed, transport, assignment = best
    return opened, fixed, transport, assignment
