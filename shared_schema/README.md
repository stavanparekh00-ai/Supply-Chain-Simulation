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

## What's in here

- `scenario_data.json` — the finalized scenario dataset: suppliers, candidate
  facilities, customers, transport costs, per-period cost parameters, the
  disruption schedule, and the forecasting method menu.
- `schema.py` — dataclasses defining the shape of every entity above, plus
  the loader function. Contains **no** optimization or simulation logic —
  that belongs in each project's own codebase.

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
