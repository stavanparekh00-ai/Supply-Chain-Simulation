"""
HINDSIGHT / SENSITIVITY comparison -- NOT the Oracle's actual decision
process. Run with:  py full_comparison.py

Solves every candidate network (1-3 open facilities) x every forecasting
method -- 150 combinations -- and reports each one's REALIZED total cost.
This is useful for seeing how much network and method choice matter and
what the best-case outcome across all of them would have been, but picking
"whichever combination realized the lowest cost" is itself a lookahead
violation at the network-design/method-selection stage: it uses the
actual future demand outcome to choose a decision that has to be made
before that future is known. That is NOT what main.py does, and this
script's global-optimum row should never be reported as "the Oracle's
answer" -- for that, run main.py (solve_oracle_no_lookahead), which is
also printed here for direct comparison.
"""

from forecasting import METHOD_IDS
from forecasting_selection import select_best_forecasting_method
from network import cheapest_static_network
from oracle_rolling import solve_oracle_full_grid, solve_oracle_no_lookahead
from scenario import load_scenario_data
from verify_rolling import verify_network_rolling_result


def money(x: float) -> str:
    return f"${x:,.0f}"


def main():
    data = load_scenario_data()

    print("=" * 88)
    print("FULL GRID: every candidate network x every forecasting method")
    print("=" * 88)

    backtest_method, backtest_scores = select_best_forecasting_method(data)
    print("\nForecasting method backtest (historical MAE, pre-simulation data only):")
    for m in sorted(METHOD_IDS, key=lambda m: backtest_scores[m]):
        marker = "  <-- lowest historical error" if m == backtest_method else ""
        print(f"    {m:<16} MAE={backtest_scores[m]:.2f}{marker}")

    grid = solve_oracle_full_grid(data)

    print(f"\n{len(grid)} candidate networks (1-3 open facilities), each fully solved under "
          f"all {len(METHOD_IDS)} methods:\n")

    # --- Comparison table ---
    col_width = 13
    header = f"{'Network':<12}" + "".join(f"{m:>{col_width}}" for m in METHOD_IDS)
    print(header)
    all_results = []  # (opened, method_id, result)
    infeasible_combos = []  # (opened, method_id, result) where a facility hit an unavoidable wall

    def best_feasible_cost(methods):
        costs = [r["total_cost"] for r in methods.values() if r["feasible"]]
        return min(costs) if costs else float("inf")

    for opened, methods in sorted(grid.items(), key=lambda kv: best_feasible_cost(kv[1])):
        row = f"{'+'.join(opened):<12}"
        feasible_costs = [r["total_cost"] for r in methods.values() if r["feasible"]]
        best_in_row = min(feasible_costs) if feasible_costs else None
        for m in METHOD_IDS:
            r = methods[m]
            if not r["feasible"]:
                row += f"{'INFEASIBLE':>{col_width}}"
                infeasible_combos.append((opened, m, r))
            else:
                marker = "*" if r["total_cost"] == best_in_row else " "
                row += f"{money(r['total_cost']) + marker:>{col_width}}"
            all_results.append((opened, m, r))
        print(row)
    print("(* = cheapest method for that network)\n")

    if infeasible_combos:
        print(f"{len(infeasible_combos)} (network, method) combination(s) hit a genuine")
        print("infeasibility -- not a solver bug, but an unavoidable ceiling breach forced by")
        print("ALREADY-COMMITTED pipeline from an earlier week's order (that week's decision")
        print("can no longer be undone), regardless of what's ordered in the failing week:\n")
        for opened, method_id, r in infeasible_combos:
            for fid, fr in r["facility_results"].items():
                if not fr.feasible:
                    print(f"    {'+'.join(opened)} / {method_id}: facility {fid}, week {fr.infeasible_week}")
                    print(f"      {fr.infeasible_reason}")
        print()

    # --- TRUE no-lookahead answer, for direct comparison ---
    true_opened, true_fixed, true_transport, _ = cheapest_static_network(data)
    true_result, true_method, _ = solve_oracle_no_lookahead(data)
    print("=" * 88)
    print(f"THE ACTUAL ORACLE ANSWER (main.py, genuinely no-lookahead): "
          f"{'+'.join(true_opened)} + '{true_method}'")
    print("=" * 88)
    print(f"  Network chosen from static fixed+transport cost (no ordering-cost peek), among")
    print(f"  networks passing the static capacity-margin feasibility check:")
    print(f"    {'+'.join(true_opened)}  (fixed={money(true_fixed)}, transport={money(true_transport)})")
    if true_result["feasible"]:
        print(f"  Realized total cost: {money(true_result['total_cost'])}")
    else:
        print(f"  INFEASIBLE under this network/method.")

    # --- Hindsight-optimal, for contrast -- NOT a fair Oracle answer ---
    best_opened, best_method, best = min(all_results, key=lambda x: x[2]["total_cost"])
    print("\n" + "=" * 88)
    print(f"HINDSIGHT-OPTIMAL (NOT the Oracle's answer -- picked by peeking at REALIZED cost")
    print(f"across all {len(all_results)} combinations): {'+'.join(best_opened)} + '{best_method}'")
    print("=" * 88)
    if true_result["feasible"] and best["total_cost"] < true_result["total_cost"]:
        print(f"  Gap vs. the true no-lookahead answer: "
              f"{money(true_result['total_cost'] - best['total_cost'])} -- this gap is exactly the")
        print(f"  value of hindsight itself, not something a fair decision-maker could capture.")
    elif true_result["feasible"] and true_opened == best_opened and true_method == best_method:
        print(f"  EXACT MATCH -- the no-lookahead Oracle's static reasoning landed on the same")
        print(f"  network and method as the hindsight-optimal search. Gap: $0.")

    print(f"\n  Fixed cost:      {money(best['fixed_cost'])}")
    print(f"  Transport cost:  {money(best['transport_cost'])}")
    print(f"  Ordering cost:   {money(best['ordering_cost'])}")
    print(f"  {'-'*40}")
    print(f"  TOTAL COST:      {money(best['total_cost'])}")

    proc = sum(fr.procurement_cost for fr in best["facility_results"].values())
    hold = sum(fr.holding_cost for fr in best["facility_results"].values())
    back = sum(fr.backorder_cost for fr in best["facility_results"].values())
    print(f"\n  Procurement: {money(proc)}   Holding: {money(hold)}   Backorder: {money(back)}")

    print("\n  Customer assignment:")
    for cid, fid in sorted(best["assignment"].items()):
        print(f"    {cid} -> {fid}")

    for facility_id, fr in best["facility_results"].items():
        print(f"\n  --- Facility {facility_id} weekly trace ---")
        header = (
            f"    {'Wk':<4}{'Forecast':>9}{'Actual':>8}"
            + "".join(f"{s.id:>12}" for s in data.suppliers)
            + f"{'OnHand':>9}{'Backlog':>9}"
        )
        print(header)
        for record in fr.weeks:
            row = f"    {record.week:<4}{record.forecast:>9.0f}{record.actual_demand:>8.0f}"
            for s in data.suppliers:
                row += f"{record.orders[s.id]:>12}"
            row += f"{max(0.0, record.on_hand_end):>9.0f}{max(0.0, record.backlog_end):>9.0f}"
            print(row)

    # --- Verification across the whole grid ---
    print("\n" + "=" * 88)
    print("VERIFICATION (every network x method combination)")
    print("=" * 88)
    checked = 0
    for opened, methods in grid.items():
        for method_id, r in methods.items():
            if r["feasible"]:
                verify_network_rolling_result(data, r)
                checked += 1
    print(f"  [OK] all {checked} feasible (network, method) combinations: capacity/ceiling/")
    print(f"       60%-diversification-cap constraints hold week by week, and every facility's")
    print(f"       full order sequence replayed from scratch through recursion.py reproduces")
    print(f"       the walk-forward's own on-hand/backlog trace and cost exactly.")


if __name__ == "__main__":
    main()
