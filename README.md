# Supply-Chain-Simulation

Two independent deliverables sharing one common data schema:

1. **The Oracle Solver** (not yet built) -- a standalone optimization engine, the portfolio piece.
2. **The Simulation** ([`simulation/`](./simulation)) -- the participant-facing web app for the human decision-quality case study. Built with Next.js + Postgres (Neon). See [`simulation/README.md`](./simulation/README.md) for setup and deployment instructions.

The shared data contract both projects use lives in [`shared_schema/`](./shared_schema), along with hand-worked test cases and a project design brief in [`docs/`](./docs).
