# Shared Data Schema

This folder is the **one coordination point** between the two independent
project deliverables:

1. **The Oracle Solver** (Phase 1 — the portfolio piece)
2. **The Simulation / Case Study** (Phase 2 — the side project)

Both projects should load scenario data through `load_scenario_data()` in
[`schema.py`](./schema.py), which reads [`scenario_data.json`](./scenario_data.json)
into typed, validated Python dataclasses.

## Why this matters

The project's central fairness guarantee — that the Oracle never sees
anything the human participant didn't see at decision time — is only
credible if it's structurally true, not just claimed. Having both sides
load data through this exact same function, from this exact same file,
means there is no code path by which one side could accidentally receive
different or additional information.

## No-lookahead safety

`scenario_data.json` stores the *entire* frozen 10-week actual-demand series
and disruption schedule up front, because both were generated once via a
seeded random process and frozen (see `demand_generation_methodology` in the
JSON). That's necessary for reproducibility, but it means the raw fields
(`Customer.actual_demand_ground_truth_by_week`, `ScenarioData.disruption_schedule`)
technically contain future information a player or the Oracle must never see
before it happens.

`schema.py` provides safe, week-scoped accessors that make this structurally
impossible to violate by accident, rather than relying on remembering not to
peek:

- `demand_history_available_for_forecast(customer_id, current_week)` — only
  the pre-simulation history plus whatever weeks have already played out.
- `disruptions_in_week(week)` / `disruptions_revealed_through(current_week)` —
  only disruptions that have happened by that point.
- `actual_demand(customer_id, week)` — ground truth for one already-played
  week, for scoring only, never for forecasting or deciding.

**Any Oracle or simulation code built later must go through these methods
only** — never iterate `disruption_schedule` or read
`actual_demand_ground_truth_by_week` directly from decision-time logic. This
project already caught one real bug from exactly this category (the Oracle
originally used perfect hindsight before being corrected to
same-information, no-lookahead) — these accessors exist so that mistake is
structurally impossible to repeat, rather than just documented against.

## What's in here

- `scenario_data.json` — the finalized scenario dataset: suppliers, candidate
  facilities, customers, transport costs, per-period cost parameters, the
  disruption schedule, and the forecasting method menu.
- `schema.py` — dataclasses defining the shape of every entity above, plus
  the loader function. Contains **no** optimization or simulation logic —
  that belongs in each project's own codebase.

## Modeling decision: order quantities must be integers

Order quantities ($O_{f,s,t}$) are constrained to whole numbers. This makes
the per-period ordering model an integer program rather than a pure LP —
a different, safer kind of integrality than the MOQ binary that was
considered and dropped (MOQ's disjunctive feasible region could genuinely
conflict with the diversification cap; plain integer bounds don't have
that problem). See `hand_worked_test_cases.md` (Test Case 1) for a worked
example showing why naively rounding a continuous LP solution is unsafe
and the integer program must be solved directly.

This affects both projects:
- **Solver:** declare order-quantity decision variables as integer
  (e.g. `LpInteger` in PuLP), not continuous.
- **Simulation:** the player-facing order-quantity input fields must only
  accept whole numbers (no decimals).

## Status

This is a planning/data artifact. No solver or simulation logic has been
built against this schema yet. Data values are illustrative/synthetic
except where noted (see `scenario_metadata.notes` in the JSON) — the
tariff baseline and spike figures are grounded in real 2025-2026 Section
301 semiconductor tariff policy; all other figures (unit costs, facility
fixed costs, transport costs, capacities) are invented for modeling
purposes and are not sourced from real supplier contracts.

Run `python3 schema.py` from this directory for a quick smoke test that
prints a summary of the loaded scenario.
