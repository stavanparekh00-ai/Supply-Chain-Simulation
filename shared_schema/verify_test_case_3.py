import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from collections import defaultdict

c1_hist = [27, 29, 32, 29, 32, 28, 30, 33]
c2_hist = [41, 50, 45, 50, 52, 45, 40, 45]
f1_hist = [a+b for a, b in zip(c1_hist, c2_hist)]

c1_actual = [31, 32, 34, 27, 32, 35, 35, 26, 32, 31]
c2_actual = [45, 53, 46, 44, 53, 47, 41, 42, 45, 37]
f1_actual = [a+b for a, b in zip(c1_actual, c2_actual)]

suppliers = {
    "Domestic": {"cost": 18, "lead_time": 1, "cap": 150, "div_cap": 0.70},
    "Regional": {"cost": 16, "lead_time": 2, "cap": 120, "div_cap": 0.50},
    "Overseas": {"cost": 15, "lead_time": 4, "cap": 100, "div_cap": 0.25},
}
floor = 50
N_WEEKS = 5

on_hand = 100
backlog = 0
pipeline = defaultdict(lambda: defaultdict(int))
revealed_history = list(f1_hist)
order_log = []

for t in range(1, N_WEEKS + 1):
    forecast = round(sum(revealed_history[-3:]) / 3)
    overseas_cost = 20 if t == 4 else 15
    costs = [suppliers["Domestic"]["cost"], suppliers["Regional"]["cost"], overseas_cost]

    reqs = {}
    cum_demand = 0
    for k in range(1, 5):
        cum_demand += forecast
        existing_pipeline_by_k = sum(sum(pipeline[w].values()) for w in range(t, t + k))
        reqs[k] = cum_demand + floor - on_hand - existing_pipeline_by_k
    req_k1, req_k3, req_k4 = reqs[1], reqs[3], reqs[4]

    c = np.array(costs)
    A = [[1,0,0],[1,1,0],[1,1,1],[0.3,-0.7,-0.7],[-0.5,0.5,-0.5],[-0.25,-0.25,0.75]]
    lb = [req_k1, req_k3, req_k4, -np.inf, -np.inf, -np.inf]
    ub = [np.inf, np.inf, np.inf, 0, 0, 0]
    constraints = LinearConstraint(A, lb, ub)
    bounds = Bounds([0,0,0],[150,120,100])
    integrality = np.array([1,1,1])
    res = milp(c, constraints=constraints, bounds=bounds, integrality=integrality)
    x, y, z = [round(v) for v in res.x]
    cost_this_week = costs[0]*x + costs[1]*y + costs[2]*z

    on_hand_before = on_hand

    pipeline[t + suppliers["Domestic"]["lead_time"] - 1]["Domestic"] += x
    pipeline[t + suppliers["Regional"]["lead_time"] - 1]["Regional"] += y
    pipeline[t + suppliers["Overseas"]["lead_time"] - 1]["Overseas"] += z

    arriving_t = sum(pipeline[t].values())
    available = on_hand + arriving_t
    backlog_served = min(available, backlog)
    remain = available - backlog_served
    actual_demand_t = f1_actual[t - 1]
    new_served = min(remain, actual_demand_t)
    backlog_before = backlog
    backlog = (backlog - backlog_served) + (actual_demand_t - new_served)
    on_hand = remain - new_served

    order_log.append((t, forecast, x, y, z, x+y+z, overseas_cost, cost_this_week,
                       on_hand_before, arriving_t, actual_demand_t, on_hand, backlog))
    revealed_history.append(actual_demand_t)

print(f"{'Wk':>3} | {'Fcst':>4} | {'Dom':>4} | {'Reg':>4} | {'Over':>4} | {'Tot':>4} | {'$Ovr':>5} | "
      f"{'OnHand@Start':>13} | {'Arrives':>7} | {'ActualDem':>9} | {'OnHand@End':>10} | {'Backlog':>7}")
for row in order_log:
    t, fc, x, y, z, tot, ocost, cost, oh_start, arr, ad, oh_end, bl = row
    marker = " <- TARIFF SPIKE" if t == 4 else ""
    print(f"{t:>3} | {fc:>4} | {x:>4} | {y:>4} | {z:>4} | {tot:>4} | ${ocost:>4} | "
          f"{oh_start:>13} | {arr:>7} | {ad:>9} | {oh_end:>10} | {bl:>7}{marker}")
