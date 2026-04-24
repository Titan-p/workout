# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: Next.js App Router runtime deployed on Vercel; owns pages and `/api/*` route handlers.
- `app.py`, `workout/`, `templates/`: legacy Flask implementation kept for reference and Python test coverage during migration.
- `docs/product_plan.md`: Product roadmap covering training loop, analysis, plan sync, and mobile priorities.
- `docs/vercel_next_migration.md`: Current Next.js deployment and migration notes.
- `scripts/upload_workout_plans.py`: Pull the latest Kdocs workout sheet locally and replace `workout_plans` in Supabase.
- `requirements.txt`: Python dependencies for legacy Flask tests and local plan sync.
- `Dockerfile`: Legacy Python image (gunicorn on port `8088`).
- `.env.example`: Example env; copy to `.env` for local use.
- `.github/workflows/docker-image.yml`: Docker publish workflow.
- `frontend/vercel.json`: Vercel framework override for the Next.js runtime.

## Build, Test, and Development Commands
- Create venv: `python3 -m venv .venv && source .venv/bin/activate`
- Install: `pip install -r requirements.txt`
- Frontend install: `cd frontend && pnpm install`
- Frontend dev: `cd frontend && pnpm dev`
- Frontend build: `cd frontend && pnpm build`
- Frontend typecheck: `cd frontend && pnpm typecheck`
- Legacy Flask dev: `python app.py`
- Sync workout plans from Kdocs: `python3 scripts/upload_workout_plans.py --env-file .env`
- Docker: `docker build -t workout:local . && docker run --env-file .env -p 8088:8088 workout:local`

## Coding Style & Naming Conventions
- Python 3.12, PEP 8, 4-space indentation; add type hints where practical.
- TypeScript for `frontend/`; prefer App Router server functions for Supabase reads and route handlers for mutations.
- Names: `snake_case` (functions/vars), `PascalCase` (classes), constants UPPER_SNAKE.
- Keep routes thin; put Excel parsing and Supabase I/O in helpers; log via `logging`.
- Prefer f-strings; avoid magic values; keep config in `Config`.

## Testing Guidelines
- Layout: `tests/test_*.py`, fixtures in `tests/conftest.py`.
- Cover: plan parsing, Supabase read/write behavior, training session flows, and API responses.
- Python tests: `.venv/bin/python -m pytest -q`
- Frontend checks: `cd frontend && pnpm typecheck && pnpm build`

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`; scope optional (e.g., `feat(ui): 优化周视图`).
- PRs include: summary, motivation/linked issue, screenshots for UI, and local run steps.
- Keep changes focused; document schema or env changes explicitly.

## Security & Configuration Tips
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`; optional `FLASK_SECRET_KEY`.
- Local Kdocs sync expects `KDOCS_WORKOUT_FILE_ID`; `KDOCS_CLI_BIN` is optional when `kdocs-cli` is already on PATH.
- Supabase table `workout_plans`: `date` (YYYY-MM-DD), JSON `headers`, `remarks`, `plan_data`.
- Training features expect Supabase tables `training_sessions`, `training_sets`, and `training_day_metrics`; see `docs/training_schema.sql` for DDL.
- Never commit secrets; use GitHub Actions secrets for CI.

## Agent-Specific Notes
- Keep patches minimal and scoped; avoid unrelated edits.
- Update this guide when changing structure, env, or workflows.
- When additional context is needed, proactively call available MCP tools first (e.g., `mcp:ask`, `mcp:search`) before asking the user.
