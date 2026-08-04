from scipy.optimize import linprog

# Facility F1, Period 1, flat forecast = 75/week (F1 = C1+C2 baseline)
# Suppliers: Domestic ($18, LT=1wk, cap150), Regional ($16, LT=2wk, cap120), Overseas ($15 landed, LT=4wk, cap100)
# MinFloor=50, forecast=75/wk

def check_feasibility(SI, forecast=75, floor=50):
    # Checkpoint requirements (cumulative demand + floor - starting inventory)
    # k=1: only Domestic arrives (LT=1)
    # k=2,3: Domestic+Regional arrive (LT<=2), but k=3 cumulative demand is higher with no new arrivals -> k=3 dominates
    # k=4: all three arrive
    req_k1 = forecast*1 + floor - SI   # x >= req_k1
    req_k3 = forecast*3 + floor - SI   # x+y >= req_k3 (dominates k=2's forecast*2+floor-SI)
    req_k4 = forecast*4 + floor - SI   # x+y+z >= req_k4

    print(f"SI={SI}: req_k1(x>=)={req_k1}, req_k3(x+y>=)={req_k3}, req_k4(x+y+z>=)={req_k4}")

    # cost vector
    c = [18, 16, 15]

    # Inequality constraints in form A_ub @ x <= b_ub
    A_ub = []
    b_ub = []

    # x >= req_k1  ->  -x <= -req_k1
    A_ub.append([-1, 0, 0]); b_ub.append(-req_k1)
    # x + y >= req_k3 -> -x-y <= -req_k3
    A_ub.append([-1, -1, 0]); b_ub.append(-req_k3)
    # x + y + z >= req_k4 -> -x-y-z <= -req_k4
    A_ub.append([-1, -1, -1]); b_ub.append(-req_k4)

    # diversification: x <= 0.7(x+y+z) -> 0.3x -0.7y -0.7z <= 0
    A_ub.append([0.3, -0.7, -0.7]); b_ub.append(0)
    # y <= 0.5(x+y+z) -> -0.5x +0.5y -0.5z <= 0
    A_ub.append([-0.5, 0.5, -0.5]); b_ub.append(0)
    # z <= 0.25(x+y+z) -> -0.25x -0.25y +0.75z <= 0
    A_ub.append([-0.25, -0.25, 0.75]); b_ub.append(0)

    bounds = [(0, 150), (0, 120), (0, 100)]

    res = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method="highs")
    if res.success:
        x, y, z = res.x
        print(f"  FEASIBLE. Optimal: Domestic={x:.2f}, Regional={y:.2f}, Overseas={z:.2f}, "
              f"Total={x+y+z:.2f}, Cost=${res.fun:.2f}")
    else:
        print(f"  INFEASIBLE: {res.message}")
    print()

# First confirm: is a true cold start (SI=0) feasible at all?
check_feasibility(SI=0)

# Now with a proposed starting inventory
check_feasibility(SI=100)

print("=== Checking SI=100 across all open facilities ===")
print("F1 (demand=75/wk):")
check_feasibility(SI=100, forecast=75)
print("F3 (demand=53/wk):")
check_feasibility(SI=100, forecast=53)
print("F4 (demand=75/wk, same as F1):")
check_feasibility(SI=100, forecast=75)
