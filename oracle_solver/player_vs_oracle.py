"""
Compares the naive player heuristic (player_heuristic.py, player_rolling.py)
against the Oracle benchmark (oracle_rolling.py), under a few scenarios:

  A. Same network as the Oracle (F1+F4+F5) + naive forecasting method --
     isolates the pure ordering-decision-quality gap, holding everything
     else fixed at the Oracle's own choices.
  B. Same network, but sweeping all 6 forecasting methods -- shows how much
     of the gap (if any) forecasting method choice alone can close.
  C. A naive network choice (cheapest visible fixed+transport cost, with NO
     capacity/feasibility reasoning -- what a player who just reads the
     network page numbers would likely pick) + naive forecasting method --
     compounds a naive network choice with a naive ordering policy.

Also independently verifies the player's results: capacity is re-checked
directly from the raw orders (the 60% diversification cap is NOT checked,
since that's an Oracle-only risk-management rule -- players are never
constrained that way, per decisions/route.ts's own comment), and the full
order sequence is replayed from scratch through recursion.py to confirm
the reported costs are genuine, not just self-consistent.
"""

from network import candidate_networks, cheapest_static_network, network_cost
from oracle_rolling import solve_oracle_no_lookahead
from player_rolling import solve_network_player
from recursion import arriving_in_week, run_recursion
from scenario import ScenarioData, capacity_for_week, landed_cost_for_week, load_scenario_data

TOLERANCE = 1e-3


def money(x: float) -> str:
    return f"${x:,.0f}"


def verify_player_result(data: ScenarioData, result: dict) -> None:
    """Capacity + recursion-replay check (no 60% diversification check --
    that rule doesn't apply to players)."""
    for facility_id, fr in result["facility_results"].items():
        for record in fr.weeks:
            for s in data.suppliers:
                qty = record.orders[s.id]
                assert qty >= 0 and qty == int(qty), f"{facility_id} w{record.week} {s.id}: bad qty {qty}"
                cap = capacity_for_week(data, s, record.week)
                assert qty <= cap + TOLERANCE, f"{facility_id} w{record.week} {s.id}: {qty} > capacity {cap}"

        order_schedule = {
            (s.id, r.week): r.orders[s.id] for r in fr.weeks for s in data.suppliers
        }
        lead_time = {s.id: s.lead_time_weeks for s in data.suppliers}
        on_hand = data.per_period_cost_parameters.initial_on_hand_inventory_units
        backlog = 0.0
        for record in fr.weeks:
            arriving, _ = arriving_in_week(order_schedule, record.week, lead_time)
            this_weeks_orders = [
                (record.orders[s.id], landed_cost_for_week(data, s, record.week)) for s in data.suppliers
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
            assert abs(replayed["on_hand_end"] - record.on_hand_end) <= TOLERANCE
            assert abs(replayed["backlog_end"] - record.backlog_end) <= TOLERANCE
            on_hand, backlog = replayed["on_hand_end"], replayed["backlog_end"]


def naive_network_choice(data: ScenarioData, max_open: int = 3) -> tuple:
    """What a player who just reads the network design page's numbers (no
    capacity/feasibility reasoning) would most likely pick: minimize
    fixed+transport cost with no other consideration at all."""
    best = None
    for opened in candidate_networks(data, max_open):
        fixed, transport, _ = network_cost(data, opened)
        total = fixed + transport
        if best is None or total < best[0]:
            best = (total, opened)
    return best[1]


def breakdown(r: dict):
    proc = sum(fr.procurement_cost for fr in r["facility_results"].values())
    hold = sum(fr.holding_cost for fr in r["facility_results"].values())
    back = sum(fr.backorder_cost for fr in r["facility_results"].values())
    return proc, hold, back


def print_row(label, r):
    proc, hold, back = breakdown(r)
    print(
        f"{label:<38}{money(r['fixed_cost']):>10}{money(r['transport_cost']):>11}"
        f"{money(proc):>11}{money(hold):>10}{money(back):>11}{money(r['total_cost']):>13}"
    )


def main():
    data = load_scenario_data()

    oracle_result, oracle_method, _ = solve_oracle_no_lookahead(data)
    oracle_opened, _, _, _ = cheapest_static_network(data)

    print("=" * 100)
    print("NAIVE PLAYER vs. ORACLE")
    print("=" * 100)
    header = f"{'Scenario':<38}{'Fixed':>10}{'Transport':>11}{'Procure':>11}{'Holding':>10}{'Backorder':>11}{'Total':>13}"
    print(header)
    print("-" * len(header))

    print_row(f"ORACLE ({'+'.join(oracle_opened)}, {oracle_method})", oracle_result)

    # A: same network, naive method
    same_net_naive = solve_network_player(data, oracle_opened, "naive")
    print_row(f"Player, SAME network, naive forecast", same_net_naive)
    verify_player_result(data, same_net_naive)

    # B: same network, sweep all methods
    print()
    print(f"Player on {'+'.join(oracle_opened)}, all 6 forecasting methods:")
    for method_id in ["naive", "ma_2", "ma_3", "ma_4", "weighted_ma", "exp_smoothing"]:
        r = solve_network_player(data, oracle_opened, method_id)
        verify_player_result(data, r)
        print_row(f"  Player, {method_id}", r)

    # C: naive network choice + naive forecast
    naive_opened = naive_network_choice(data)
    print()
    naive_net_naive = solve_network_player(data, naive_opened, "naive")
    verify_player_result(data, naive_net_naive)
    print_row(f"Player, NAIVE network ({'+'.join(naive_opened)}), naive fc", naive_net_naive)

    naive_net_best_fc = solve_network_player(data, naive_opened, "exp_smoothing")
    verify_player_result(data, naive_net_best_fc)
    print_row(f"Player, NAIVE network, exp_smoothing", naive_net_best_fc)

    print()
    print("=" * 100)
    print("SUMMARY")
    print("=" * 100)
    print(f"Oracle total cost:                                    {money(oracle_result['total_cost'])}")
    print(f"Best-case player (same network, best of 6 methods):   "
          f"{money(min(solve_network_player(data, oracle_opened, m)['total_cost'] for m in ['naive','ma_2','ma_3','ma_4','weighted_ma','exp_smoothing']))}")
    print(f"Realistic player (same network, naive forecast):      {money(same_net_naive['total_cost'])}")
    print(f"Realistic+naive-network player (naive net, naive fc): {money(naive_net_naive['total_cost'])}")
    print()
    gap_pct_same = (same_net_naive['total_cost'] - oracle_result['total_cost']) / oracle_result['total_cost'] * 100
    gap_pct_naive = (naive_net_naive['total_cost'] - oracle_result['total_cost']) / oracle_result['total_cost'] * 100
    print(f"Gap (same network, naive forecast):   +{money(same_net_naive['total_cost'] - oracle_result['total_cost'])}  ({gap_pct_same:.1f}% worse)")
    print(f"Gap (naive network, naive forecast):  +{money(naive_net_naive['total_cost'] - oracle_result['total_cost'])}  ({gap_pct_naive:.1f}% worse)")


if __name__ == "__main__":
    main()
