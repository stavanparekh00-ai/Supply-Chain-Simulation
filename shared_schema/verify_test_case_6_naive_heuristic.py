import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from collections import defaultdict

c3_hist = [18, 14, 37, 31, 34, 28, 13, 21]
c5_hist = [27, 29, 24, 28, 19, 15, 38, 21]
f3_hist = [a+b for a, b in zip(c3_hist, c5_hist)]

c3_actual = [28, 31, 23, 34, 36, 26, 30, 15, 14, 37]
c5_actual = [23, 25, 19, 17, 15, 58, 35, 30, 17, 18]
f3_actual = [a+b for a, b in zip(c3_actual, c5_actual)]

floor = 50

def run_policy(policy_name, myopic):
    """myopic=True -> naive heuristic (only covers THIS week's need, no 4-week lookahead)
       myopic=False -> Oracle (full 4-week checkpoint lookahead, as before)"""
    on_hand = 100
    backlog = 0
    pipeline = defaultdict(lambda: defaultdict(int))
    revealed_history = list(f3_hist)
    rows = []

    for t in range(1, 7):
        forecast = round(sum(revealed_history[-3:]) / 3)
        costs = [18, 16, 15]

        if myopic:
            # Naive heuristic: only look at THIS week's own need, ignore lead times entirely
            shortfall = max(0, forecast + floor - on_hand)
            req_k1 = shortfall  # myopic "requirement" -- treated as if any supplier could cover it
            req_k3 = shortfall
            req_k4 = shortfall
        else:
            reqs = {}
            cum = 0
            for k in range(1, 5):
                cum += forecast
                pipe_by_k = sum(sum(pipeline[w].values()) for w in range(t, t + k))
                reqs[k] = cum + floor - on_hand - pipe_by_k
            req_k1, req_k3, req_k4 = reqs[1], reqs[3], reqs[4]

        A = [[1,0,0],[1,1,0],[1,1,1],[0.3,-0.7,-0.7],[-0.5,0.5,-0.5],[-0.25,-0.25,0.75]]
        lb = [req_k1, req_k3, req_k4, -np.inf, -np.inf, -np.inf]
        ub = [np.inf, np.inf, np.inf, 0, 0, 0]
        res = milp(np.array(costs), constraints=LinearConstraint(A, lb, ub),
                   bounds=Bounds([0,0,0],[150,120,100]), integrality=np.array([1,1,1]))
        x, y, z = [round(v) for v in res.x] if res.success else (0, 0, 0)

        on_hand_before = on_hand
        pipeline[t]["Domestic"] += x
        pipeline[t+1]["Regional"] += y
        pipeline[t+3]["Overseas"] += z

        arriving_t = sum(pipeline[t].values())
        available = on_hand + arriving_t
        backlog_served = min(available, backlog)
        remain = available - backlog_served
        actual_demand_t = f3_actual[t-1]
        new_served = min(remain, actual_demand_t)
        backlog = (backlog - backlog_served) + (actual_demand_t - new_served)
        on_hand = remain - new_served

        rows.append((t, forecast, x, y, z, x+y+z, on_hand_before, arriving_t, actual_demand_t, on_hand, backlog))
        revealed_history.append(actual_demand_t)

    print(f"\n=== {policy_name} ===")
    print(f"{'Wk':>3} | {'Fcst':>4} | {'Dom':>4} | {'Reg':>4} | {'Over':>4} | {'Tot':>4} | "
          f"{'OnHand@Start':>12} | {'Arrives':>7} | {'ActDem':>6} | {'OnHand@End':>10} | {'Backlog':>7}")
    for r in rows:
        t, fc, x, y, z, tot, oh0, arr, ad, oh1, bl = r
        marker = "  <- DEMAND SPIKE" if t == 6 else ""
        print(f"{t:>3} | {fc:>4} | {x:>4} | {y:>4} | {z:>4} | {tot:>4} | "
              f"{oh0:>12} | {arr:>7} | {ad:>6} | {oh1:>10} | {bl:>7}{marker}")
    return rows

oracle_rows = run_policy("ORACLE (full 4-week lookahead)", myopic=False)
naive_rows = run_policy("NAIVE HEURISTIC (only covers this week's own need, no lookahead)", myopic=True)

def run_no_floor_policy(policy_name):
    """Even more naive: no safety floor concept at all, just order exactly forecasted need."""
    on_hand = 100
    backlog = 0
    pipeline = defaultdict(lambda: defaultdict(int))
    revealed_history = list(f3_hist)
    rows = []

    for t in range(1, 11):  # extend to full 10 weeks this time
        forecast = round(sum(revealed_history[-3:]) / 3)
        costs = [18, 16, 15]
        shortfall = max(0, forecast - on_hand)  # NO floor buffer at all
        req_k1 = req_k3 = req_k4 = shortfall

        A = [[1,0,0],[1,1,0],[1,1,1],[0.3,-0.7,-0.7],[-0.5,0.5,-0.5],[-0.25,-0.25,0.75]]
        lb = [req_k1, req_k3, req_k4, -np.inf, -np.inf, -np.inf]
        ub = [np.inf, np.inf, np.inf, 0, 0, 0]
        res = milp(np.array(costs), constraints=LinearConstraint(A, lb, ub),
                   bounds=Bounds([0,0,0],[150,120,100]), integrality=np.array([1,1,1]))
        x, y, z = [round(v) for v in res.x] if res.success else (0, 0, 0)

        on_hand_before = on_hand
        pipeline[t]["Domestic"] += x
        pipeline[t+1]["Regional"] += y
        pipeline[t+3]["Overseas"] += z

        arriving_t = sum(pipeline[t].values())
        available = on_hand + arriving_t
        backlog_served = min(available, backlog)
        remain = available - backlog_served
        actual_demand_t = f3_actual[t-1]
        new_served = min(remain, actual_demand_t)
        backlog = (backlog - backlog_served) + (actual_demand_t - new_served)
        on_hand = remain - new_served

        rows.append((t, forecast, x, y, z, x+y+z, on_hand_before, arriving_t, actual_demand_t, on_hand, backlog))
        revealed_history.append(actual_demand_t)

    print(f"\n=== {policy_name} ===")
    print(f"{'Wk':>3} | {'Fcst':>4} | {'Dom':>4} | {'Reg':>4} | {'Over':>4} | {'Tot':>4} | "
          f"{'OnHand@Start':>12} | {'Arrives':>7} | {'ActDem':>6} | {'OnHand@End':>10} | {'Backlog':>7}")
    for r in rows:
        t, fc, x, y, z, tot, oh0, arr, ad, oh1, bl = r
        marker = "  <- DEMAND SPIKE" if t == 6 else ""
        print(f"{t:>3} | {fc:>4} | {x:>4} | {y:>4} | {z:>4} | {tot:>4} | "
              f"{oh0:>12} | {arr:>7} | {ad:>6} | {oh1:>10} | {bl:>7}{marker}")
    return rows

run_no_floor_policy("NO-FLOOR NAIVE HEURISTIC (react to forecast only, no buffer, full 10 weeks)")
