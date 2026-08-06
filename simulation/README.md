# Supply Chain Decision Simulation

The Phase 2 participant-facing web app: a "quiet instrument" for collecting
supply chain ordering decisions under demand uncertainty and disruption,
built with Next.js (App Router) + TypeScript + Tailwind CSS, backed by
Postgres (Neon in production).

## Status

Functional end-to-end: session creation, facility network design,
forecasting method selection, the 10-week period-decision loop (backed by
the realized-cost recursion), and a results summary. **Oracle comparison
is not yet wired in** -- that depends on the separate solver project, which
hasn't been built yet. The results page currently shows only the
participant's own outcomes.

## Local development

1. Install dependencies: `npm install`
2. Set up a Postgres database (local Postgres works fine for development --
   Neon is fully Postgres-wire-protocol compatible, so the same code path
   is used for both):
   ```bash
   createdb supply_chain_sim
   psql -d supply_chain_sim -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
   psql -d supply_chain_sim -f db/schema.sql
   ```
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to your local
   (or Neon) connection string.
4. `npm run dev`, then open http://localhost:3000

## Deploying to production (Vercel + Neon)

1. **Create a Neon project** at [neon.tech](https://neon.tech) (a free tier
   is sufficient at this project's scale). Copy the pooled connection
   string from the Neon dashboard.
2. **Apply the schema to Neon**: run `psql "<your Neon connection string>" -f db/schema.sql`
   (or paste `db/schema.sql`'s contents into Neon's SQL editor).
   `pgcrypto` is available by default on Neon, so `gen_random_uuid()` works
   without extra setup.
3. **Connect this repo to Vercel**: import the project from the Vercel
   dashboard (New Project -> Import Git Repository), and set the **Root
   Directory** to `simulation/` (since this app lives in a subfolder of
   the monorepo).
4. **Set the environment variable**: in the Vercel project's Settings ->
   Environment Variables, add `DATABASE_URL` with the Neon connection
   string from step 1.
5. Deploy. Every push to the connected branch will auto-deploy.

## Data source

Scenario data (`data/scenario_data.json`) is a copy of
`../shared_schema/scenario_data.json` -- the same canonical dataset the
future Oracle solver will use, so both sides work from identical
information. If the shared schema is updated, re-copy it here.

## Architecture notes

- `lib/scenarioData.ts` -- typed loader + **no-lookahead-safe accessors**
  for the shared scenario data (mirrors `shared_schema/schema.py`'s
  safeguards). Decision-time code must only use these accessors, never
  read future weeks' actual demand or disruptions directly.
- `lib/forecasting.ts` -- the fixed forecasting-method menu (naive, moving
  averages, weighted moving average, exponential smoothing).
- `lib/recursion.ts` -- the realized-cost recursion (on-hand/backlog/cost
  bookkeeping *after* a week's decisions are placed, using actual demand).
  No optimization logic lives here -- that's the Oracle's job.
- `lib/gameEngine.ts` -- glues scenario data + database state together for
  the API routes. Customer-to-facility assignment is computed **dynamically**
  for whichever facilities a given session opened, never hardcoded to the
  Oracle's own reference network design -- a participant may open a
  different facility set than the Oracle's optimum, and their demand
  assignment needs to reflect their own choice.
