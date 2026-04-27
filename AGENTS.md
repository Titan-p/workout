# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: Next.js App Router runtime deployed on Vercel; owns pages and `/api/*` route handlers.
- `docs/product_plan.md`: Product roadmap covering training loop, analysis, plan sync, and mobile priorities.
- `docs/vercel_next_migration.md`: Current Next.js deployment and migration notes.
- `scripts/upload_workout_plans.py`: Pull the latest Kdocs workout sheet locally and replace `workout_plans` in Supabase.
- `scripts/classify_exercise_units.py`: Use AI locally to refresh exercise unit overrides.
- `config/exercise_unit_overrides.json`: Reviewable exercise target-unit overrides consumed by the sync script.
- `requirements.txt`: Python dependencies for local plan sync scripts.
- `.env.example`: Example env; copy to `.env` for local use.
- `frontend/vercel.json`: Vercel framework override for the Next.js runtime.

## Build, Test, and Development Commands
- Create venv: `python3 -m venv .venv && source .venv/bin/activate`
- Install: `pip install -r requirements.txt`
- Frontend install: `cd frontend && pnpm install`
- Frontend dev: `cd frontend && pnpm dev`
- Frontend build: `cd frontend && pnpm build`
- Frontend typecheck: `cd frontend && pnpm typecheck`
- Production deploy: `git push origin main` triggers Vercel Git Integration automatically; prefer this over manual Vercel deploy.
- Sync workout plans from Kdocs: `python3 scripts/upload_workout_plans.py --env-file .env`
- Classify exercise units locally: `python3 scripts/classify_exercise_units.py --input /path/to/parsed-plan.json --env-file .env`

## Coding Style & Naming Conventions
- Python 3.12, PEP 8, 4-space indentation; add type hints where practical.
- TypeScript for `frontend/`; prefer App Router server functions for Supabase reads and route handlers for mutations.
- Names: `snake_case` (functions/vars), `PascalCase` (classes), constants UPPER_SNAKE.
- Keep routes thin; put Excel parsing and Supabase I/O in helpers; log via `logging`.
- Prefer f-strings; avoid magic values; keep config in `Config`.

## Testing Guidelines
- Layout: `tests/test_*.py`.
- Cover: Kdocs plan parsing, exercise-unit overrides, and local sync script behavior.
- Python tests: `.venv/bin/python -m pytest -q`
- Frontend checks: `cd frontend && pnpm typecheck && pnpm build`

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`; scope optional (e.g., `feat(ui): 优化周视图`).
- PRs include: summary, motivation/linked issue, screenshots for UI, and local run steps.
- Keep changes focused; document schema or env changes explicitly.

## Security & Configuration Tips
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Login env: `WORKOUT_AUTH_PASSWORD`, `WORKOUT_AUTH_SECRET`.
- Local Kdocs sync expects `KDOCS_WORKOUT_FILE_ID`; `KDOCS_CLI_BIN` is optional when `kdocs-cli` is already on PATH.
- Supabase table `workout_plans`: `date` (YYYY-MM-DD), JSON `headers`, `remarks`, `plan_data`.
- Training features expect Supabase tables `training_sessions`, `training_sets`, and `training_day_metrics`; see `docs/training_schema.sql` for DDL.
- Never commit secrets; use GitHub Actions secrets for CI.

## Agent-Specific Notes
- Keep patches minimal and scoped; avoid unrelated edits.
- Update this guide when changing structure, env, or workflows.
- When additional context is needed, proactively call available MCP tools first (e.g., `mcp:ask`, `mcp:search`) before asking the user.
