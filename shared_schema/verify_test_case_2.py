import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds

# --- Step 1: Facility F3's historical demand (C3 + C5, week by week) ---
c3_hist = [25, 23, 28, 21, 21, 24, 29, 26]
c5_hist = [30, 24, 27, 30, 31, 32, 27, 29]
f3_hist = [a + b for a, b in zip(c3_hist, c5_hist)]
print("F3 historical demand (last 20 weeks before simulation start):")
print(f"  C3: {c3_hist}")
print(f"  C5: {c5_hist}")
print(f"  F3 total (C3+C5): {f3_hist}")

# --- Step 2: Compute the forecast for Week 1 using 3-period moving average ---
last_3 = f3_hist[-3:]
forecast = round(sum(last_3) / 3)
print(f"\nForecast method: 3-period moving average")
print(f"  Last 3 weeks used: {last_3}")
print(f"  Raw average: {sum(last_3)/3:.2f} -> rounded forecast: {forecast} units/week")
print(f"  (Held flat at {forecast}/week for all future checkpoints k=1..4, since no further info is available)")

# --- Step 3: Checkpoint requirements ---
floor = 50
SI = 100  # initial on-hand inventory, same as Test Case 1
req_k1 = forecast*1 + floor - SI
req_k2 = forecast*2 + floor - SI
req_k3 = forecast*3 + floor - SI
req_k4 = forecast*4 + floor - SI
print(f"\nCheckpoint requirements (forecast={forecast}, floor={floor}, starting inventory={SI}):")
print(f"  k=1 (Domestic only):          Domestic >= {req_k1}")
print(f"  k=2 (Domestic+Regional):      Dom+Reg  >= {req_k2}")
print(f"  k=3 (Domestic+Regional):      Dom+Reg  >= {req_k3}  <- dominates k=2")
print(f"  k=4 (all three):              Dom+Reg+Over >= {req_k4}")

# --- Step 4: Solve as an integer program ---
c = np.array([18, 16, 15])  # Domestic, Regional, Overseas landed unit cost
A = [
    [1, 0, 0],
    [1, 1, 0],
    [1, 1, 1],
    [0.3, -0.7, -0.7],
    [-0.5, 0.5, -0.5],
    [-0.25, -0.25, 0.75],
]
lb = [req_k1, req_k3, req_k4, -np.inf, -np.inf, -np.inf]
ub = [np.inf, np.inf, np.inf, 0, 0, 0]
constraints = LinearConstraint(A, lb, ub)
bounds = Bounds([0, 0, 0], [150, 120, 100])
integrality = np.array([1, 1, 1])

res = milp(c, constraints=constraints, bounds=bounds, integrality=integrality)
x, y, z = res.x
total = x + y + z
print(f"\n=== SOLVED ORDER QUANTITIES (integer-optimal) ===")
print(f"  Domestic Fab:          {x:.0f} units")
print(f"  Regional Partner:      {y:.0f} units")
print(f"  Overseas Manufacturer: {z:.0f} units")
print(f"  TOTAL ORDERED:         {total:.0f} units")
print(f"  TOTAL PROCUREMENT COST: ${res.fun:.2f}")

print(f"\nConstraint check:")
print(f"  Domestic >= {req_k1}: {x:.0f} -> {'OK' if x >= req_k1 else 'VIOLATED'}")
print(f"  Dom+Reg >= {req_k3}: {x+y:.0f} -> {'OK' if x+y >= req_k3 else 'VIOLATED'}")
print(f"  Total >= {req_k4}: {total:.0f} -> {'OK' if total >= req_k4 else 'VIOLATED'}")
print(f"  Domestic share <= 70%: {x/total*100:.1f}% -> {'OK' if x/total <= 0.70+1e-6 else 'VIOLATED'}")
print(f"  Regional share <= 50%: {y/total*100:.1f}% -> {'OK' if y/total <= 0.50+1e-6 else 'VIOLATED'}")
print(f"  Overseas share <= 25%: {z/total*100:.1f}% -> {'OK' if z/total <= 0.25+1e-6 else 'VIOLATED'}")
