-- Supply Chain Simulation -- database schema
-- Designed to run identically on local Postgres (dev) and Neon (production).

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'playing', 'completed')),

  -- Step 1: Facility Network Design choice
  opened_facilities JSONB, -- e.g. ["F1", "F3", "F4"]
  network_fixed_cost NUMERIC,
  network_transport_cost NUMERIC,

  -- Step 2: Forecasting Method choice (locked once chosen, cannot change)
  forecasting_method_id TEXT,

  -- Progress tracking
  current_week INT NOT NULL DEFAULT 1
);

-- One row per facility per week per supplier order decision.
CREATE TABLE IF NOT EXISTS decisions (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  week INT NOT NULL,
  facility_id TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  order_quantity INT NOT NULL CHECK (order_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, week, facility_id, supplier_id)
);

-- One row per facility per week, snapshotting realized state AFTER that
-- week's actual demand has played out (via the realized-cost recursion).
-- Computed and stored once, right after a week's decisions are submitted,
-- so results can be displayed without recomputing the whole history.
CREATE TABLE IF NOT EXISTS period_state (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  week INT NOT NULL,
  facility_id TEXT NOT NULL,
  on_hand_start NUMERIC NOT NULL,
  arriving NUMERIC NOT NULL,
  actual_demand NUMERIC NOT NULL,
  on_hand_end NUMERIC NOT NULL,
  backlog NUMERIC NOT NULL,
  procurement_cost NUMERIC NOT NULL,
  holding_cost NUMERIC NOT NULL,
  backorder_cost NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, week, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
CREATE INDEX IF NOT EXISTS idx_period_state_session ON period_state(session_id);
