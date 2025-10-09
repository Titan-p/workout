# Repository Guidelines

## Project Structure & Module Organization
- `app.py`: Entry-point that exposes the backend Flask app (imports from `backend.workout`).
- `backend/`: Flask API only; handles Excel ingestion, Supabase I/O, and training session state.
- `frontend/`: React + Vite PWA responsible for the mobile-first UI.
- `requirements.txt`: Aggregates runtime dependencies (delegates to `backend/requirements.txt`).
- `Dockerfile`: Production image for the backend API (gunicorn on port `8088`).
- `.env.example`: Example env; copy to `.env` for local use.
- `.github/workflows/docker-image.yml`: Docker publish workflow.
- `vercel.json`: Dual deploy config (frontend static build + backend Python API).

## Build, Test, and Development Commands
- Backend: create venv `python3 -m venv .venv && source .venv/bin/activate`
- Backend install: `pip install -r backend/requirements.txt`
- Backend dev server: `python app.py` (Flask debug on 5000)
- Backend prod-like: `gunicorn --bind 0.0.0.0:8088 app:app`
- Frontend install: `cd frontend && npm install`
- Frontend dev server: `npm run dev` (proxy to backend at `localhost:5000`)
- Frontend env: copy `frontend/.env.example` to `frontend/.env` and adjust `VITE_API_BASE` if needed.
- Frontend build: `npm run build` (outputs to `frontend/dist`)
- Docker: `docker build -t workout:local . && docker run --env-file .env -p 8088:8088 workout:local`

## Coding Style & Naming Conventions
- Python 3.12, PEP 8, 4-space indentation; add type hints where practical.
- Names: `snake_case` (functions/vars), `PascalCase` (classes), constants UPPER_SNAKE.
- Keep routes thin; put Excel parsing and Supabase I/O in helpers; log via `logging`.
- Frontend: React 18 + TypeScript, favor function components and hooks. Keep shared logic in `src/hooks` & `src/lib`.
- Prefer f-strings; avoid magic values; keep config in `Config`.

## Testing Guidelines
- Python tests live under `tests/` (pytest). Keep Supabase interactions stubbed via fixtures.
- Cover: Excel parsing edge cases, Supabase read/write, and JSON API responses (plans, session workflow).
- Run: `pytest -q`.

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`; scope optional (e.g., `feat(ui): 优化周视图`).
- PRs include: summary, motivation/linked issue, screenshots for UI, and local run steps.
- Keep changes focused; document schema or env changes explicitly.

## Security & Configuration Tips
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `FLASK_SECRET_KEY`.
- Note: `.env.example` may not include `SUPABASE_SERVICE_ROLE_KEY`—add it locally.
- Supabase table `workout_plans`: `date` (YYYY-MM-DD), JSON `headers`, `remarks`, `plan_data`.
- New training feature expects Supabase tables `training_sessions` and `training_sets`; see `docs/training_schema.sql` for DDL.
- Never commit secrets; use GitHub Actions secrets for CI.

## Agent-Specific Notes
- Keep patches minimal and scoped; avoid unrelated edits.
- Update this guide when changing structure, env, or workflows.
- When additional context is needed, proactively call available MCP tools first (e.g., `mcp:ask`, `mcp:search`) before asking the user.
