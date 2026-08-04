import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds

# Same setup as before, but O_dom, O_reg, O_over must now be INTEGERS
forecast, floor, SI = 75, 50, 100
req_k1 = forecast*1 + floor - SI   # x >= req_k1
req_k3 = forecast*3 + floor - SI   # x+y >= req_k3
req_k4 = forecast*4 + floor - SI   # x+y+z >= req_k4

c = np.array([18, 16, 15])  # minimize cost

# Constraints in the form lb <= A@x <= ub
A = [
    [1, 0, 0],       # x >= req_k1
    [1, 1, 0],       # x+y >= req_k3
    [1, 1, 1],       # x+y+z >= req_k4
    [0.3, -0.7, -0.7],   # x <= 0.7(x+y+z)  ->  0.3x -0.7y -0.7z <= 0
    [-0.5, 0.5, -0.5],   # y <= 0.5(x+y+z)
    [-0.25, -0.25, 0.75],# z <= 0.25(x+y+z)
]
lb = [req_k1, req_k3, req_k4, -np.inf, -np.inf, -np.inf]
ub = [np.inf, np.inf, np.inf, 0, 0, 0]

constraints = LinearConstraint(A, lb, ub)
bounds = Bounds([0, 0, 0], [150, 120, 100])
integrality = np.array([1, 1, 1])  # all three variables must be integers

res = milp(c, constraints=constraints, bounds=bounds, integrality=integrality)

print(f"Success: {res.success}")
x, y, z = res.x
print(f"Domestic={x:.0f}, Regional={y:.0f}, Overseas={z:.0f}, Total={x+y+z:.0f}")
print(f"Cost=${res.fun:.2f}")

# Verify constraints
total = x + y + z
print(f"\nVerification:")
print(f"  x >= {req_k1}: {x} -> {'OK' if x >= req_k1 else 'VIOLATED'}")
print(f"  x+y >= {req_k3}: {x+y} -> {'OK' if x+y >= req_k3 - 1e-6 else 'VIOLATED'}")
print(f"  x+y+z >= {req_k4}: {total} -> {'OK' if total >= req_k4 - 1e-6 else 'VIOLATED'}")
print(f"  x <= 0.70*total ({0.7*total:.2f}): {x} -> {'OK' if x <= 0.7*total + 1e-6 else 'VIOLATED'}")
print(f"  y <= 0.50*total ({0.5*total:.2f}): {y} -> {'OK' if y <= 0.5*total + 1e-6 else 'VIOLATED'}")
print(f"  z <= 0.25*total ({0.25*total:.2f}): {z} -> {'OK' if z <= 0.25*total + 1e-6 else 'VIOLATED'}")
