"""
A "naive player" stand-in -- NOT an optimizer, a rule-based heuristic
meant to approximate how an unaided human might actually play the live
simulation, for comparison against the Oracle benchmark.

Per shared_schema/hand_worked_test_cases.md Test Case 6's already-validated
definition ("No-floor naive heuristic"): reacts only to the forecast, with
no lead-time awareness, no backlog awareness, no pipeline awareness, and no
safety-buffer concept at all --

    shortfall = max(0, forecast - on_hand)

This is deliberately not "the dumbest possible policy" -- it's the natural
first mental model most people reach for ("how much do I think I'll need
this week, minus what I already have on the shelf"), which is exactly why
Test Case 6 uses it as the naive baseline and documents that it genuinely
backorders against the Oracle on identical demand data. The mistake is a
believable one: forgetting that today's order won't physically arrive for
2-3 weeks, and forgetting that a backlog carried from last week needs to be
paid down before new demand can be served at all.

Supplier allocation: split the shortfall across suppliers cheapest-first,
capped at each supplier's own suggested_share_pct (the soft guidance shown
on the order-entry panel) and hard capacity -- a plausible approximation of
"try to save money by leaning on the cheap supplier, but don't blow past
the guidance chip shown on screen." If capacity/share caps leave a residual
un-ordered, top up from whichever supplier still has room, cheapest first
-- a player under visible pressure orders more rather than accepting a
known shortfall.
"""

from typing import Dict

from scenario import ScenarioData, capacity_for_week, landed_cost_for_week


def naive_player_week_order(
    data: ScenarioData,
    week: int,
    on_hand_start: float,
    forecast: float,
) -> Dict[str, int]:
    shortfall = max(0.0, forecast - on_hand_start)
    suppliers_cheapest_first = sorted(data.suppliers, key=lambda s: landed_cost_for_week(data, s, week))
    capacity = {s.id: capacity_for_week(data, s, week) for s in data.suppliers}
    share_cap = {s.id: s.suggested_share_pct / 100 for s in data.suppliers}

    orders = {s.id: 0 for s in data.suppliers}
    remaining = shortfall
    for s in suppliers_cheapest_first:
        cap = min(capacity[s.id], share_cap[s.id] * shortfall)
        qty = int(round(min(remaining, max(0.0, cap))))
        orders[s.id] = qty
        remaining -= qty

    if remaining > 0.5:
        for s in suppliers_cheapest_first:
            room = capacity[s.id] - orders[s.id]
            if room <= 0:
                continue
            extra = int(round(min(remaining, room)))
            orders[s.id] += extra
            remaining -= extra
            if remaining <= 0.5:
                break

    return orders
