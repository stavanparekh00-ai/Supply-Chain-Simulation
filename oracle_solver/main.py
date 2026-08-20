"""
CLI entry point for the TRUE no-lookahead Oracle -- run with:
    py main.py          (or: python3 main.py)

This is the model that should actually be used to benchmark a player:
every decision -- network design, forecasting method, and every week's
order -- is made using only information available at the time that
decision has to be made, exactly like a player going through the live
simulation:

  1. Network chosen from static fixed + transport cost alone (the numbers
     shown on the network design page -- no ordering-cost preview exists
     there, so none is used here either).
  2. Forecasting method chosen by backtesting pre-simulation historical
     demand (the "last 20 weeks" chart shown on the forecast page).
  3. Orders decided one week at a time using only state and history
     revealed by that point -- never that week's or any future week's
     actual demand.

See oracle_rolling.py:solve_oracle_no_lookahead for why an earlier version
of this script instead compared all 25 candidate networks' REALIZED costs
and picked the cheapest -- that used the actual future outcome to make the
network-design decision, a lookahead violation at that stage even though
the per-week ordering was already honest. That comparison is still useful
as a hindsight/sensitivity tool -- see full_comparison.py -- just not as
what a fair Oracle benchmark actually does.
"""

from forecasting import METHOD_IDS
from network import cheapest_static_network, max_sustainable_average_demand
from oracle_rolling import solve_oracle_no_lookahead
from scenario import load_scenario_data
from verify_rolling import verify_network_rolling_result


def money(x: float) -> str:
    return f"${x:,.2f}"


def print_report(data, result, method_id, method_scores, opened, fixed, transport):
    print("=" * 78)
    print("TRUE NO-LOOKAHEAD ORACLE -- network, forecast, and every order chosen")
    print("using only information available at decision time")
    print(f"Scenario: {data.metadata.product} ({data.metadata.horizon_periods} {data.metadata.period_unit}s)")
    print("=" * 78)

    cap = max_sustainable_average_demand(data)
    print(f"\nStep 1 -- Network design: minimize fixed + transport cost, restricted to")
    print(f"networks where every facility's average demand is within {cap:.0f}/week -- the")
    print(f"tightest weekly rate any facility could structurally keep up with given real")
    print(f"lead-time ramp-up (STATIC, pre-week-1 numbers: supplier lead times/capacity,")
    print(f"initial on-hand, baseline weekly_demand -- not a lookahead into how the 10")
    print(f"weeks actually play out):")
    print(f"    Chosen: {'+'.join(opened)}  (fixed={money(fixed)}, transport={money(transport)}, "
          f"total={money(fixed + transport)})")
    print(f"    No candidate network's ordering cost was simulated to make this choice --")
    print(f"    a player can't preview that either before committing.")

    print("\nStep 2 -- Forecasting method (backtested once, globally, against the")
    print("pre-simulation historical demand -- same fixed menu offered to players):")
    for m in sorted(METHOD_IDS, key=lambda m: method_scores[m]):
        marker = "  <-- selected" if m == method_id else ""
        print(f"    {m:<16} MAE={method_scores[m]:.2f}{marker}")

    print(f"\nStep 3 -- Ordering: one rolling, week-by-week walkthrough of {'+'.join(opened)}")
    print(f"under '{method_id}' forecasting.")

    if not result["feasible"]:
        print("\n" + "=" * 78)
        print("RESULT: INFEASIBLE")
        print("=" * 78)
        for fid, fr in result["facility_results"].items():
            if not fr.feasible:
                print(f"  Facility {fid}, week {fr.infeasible_week}: {fr.infeasible_reason}")
        return

    print("\n" + "=" * 78)
    print(f"RESULT: {'+'.join(result['opened_facilities'])}")
    print("=" * 78)
    print(f"  Fixed cost (facility opening):    {money(result['fixed_cost'])}")
    print(f"  Transport cost (network design):  {money(result['transport_cost'])}")
    print(f"  Ordering cost (10-week horizon):  {money(result['ordering_cost'])}")
    print(f"  {'-' * 50}")
    print(f"  TOTAL COST:                       {money(result['total_cost'])}")

    print("\n  Customer assignment:")
    for cid, fid in sorted(result["assignment"].items()):
        print(f"    {cid} -> {fid}")

    proc = sum(fr.procurement_cost for fr in result["facility_results"].values())
    hold = sum(fr.holding_cost for fr in result["facility_results"].values())
    back = sum(fr.backorder_cost for fr in result["facility_results"].values())
    print("\n  Ordering cost breakdown (across all open facilities, all 10 weeks):")
    print(f"    Procurement:  {money(proc)}")
    print(f"    Holding:      {money(hold)}")
    print(f"    Backorder:    {money(back)}")

    for facility_id, fr in result["facility_results"].items():
        print(f"\n  --- Facility {facility_id} weekly trace (forecast decided BEFORE actual revealed) ---")
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

    print("\n" + "=" * 78)
    print("VERIFICATION")
    print("=" * 78)
    verify_network_rolling_result(data, result)
    print("  [OK] capacity/ceiling/60%-diversification-cap constraints hold week by week,")
    print("       and the full order sequence replayed from scratch through recursion.py")
    print("       reproduces the walk-forward's own on-hand/backlog trace and cost exactly.")


if __name__ == "__main__":
    data = load_scenario_data()
    opened, fixed, transport, _assignment = cheapest_static_network(data)
    result, method_id, method_scores = solve_oracle_no_lookahead(data)
    print_report(data, result, method_id, method_scores, opened, fixed, transport)
