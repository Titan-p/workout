# Repository Guidelines

## Project Structure & Module Organization
- `app.py`: Flask app with routes for `/`, `/upload`, `/week`; imports Excel and saves to Supabase.
- `templates/`: Jinja templates (`index.html`, `week.html`, `upload.html`).
- `requirements.txt`: Python runtime dependencies.
- `Dockerfile`: Production image (gunicorn on port `8088`).
- `.env.example`: Example env; copy to `.env` for local use.
- `.github/workflows/docker-image.yml`: Docker publish workflow.
- `vercel.json`: Vercel routing for Python entry.

## Build, Test, and Development Commands
- Create venv: `python3 -m venv .venv && source .venv/bin/activate`
- Install: `pip install -r requirements.txt`
- Run (dev): `python app.py` (Flask debug)
- Run (prod-like): `gunicorn --bind 0.0.0.0:8088 app:app`
- Docker: `docker build -t workout:local . && docker run --env-file .env -p 8088:8088 workout:local`

## Coding Style & Naming Conventions
- Python 3.12, PEP 8, 4-space indentation; add type hints where practical.
- Names: `snake_case` (functions/vars), `PascalCase` (classes), constants UPPER_SNAKE.
- Keep routes thin; put Excel parsing and Supabase I/O in helpers; log via `logging`.
- Prefer f-strings; avoid magic values; keep config in `Config`.

## Testing Guidelines
- No tests yet. Use `pytest` when adding tests.
- Layout: `tests/test_*.py`, fixtures in `tests/conftest.py`.
- Cover: Excel parsing edge cases, Supabase read/write, and responses for `/`, `/upload`, `/week`.
- Run: `pytest -q` (add `pytest` to dev deps when introduced).

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `chore:`; scope optional (e.g., `feat(ui): 优化周视图`).
- PRs include: summary, motivation/linked issue, screenshots for UI, and local run steps.
- Keep changes focused; document schema or env changes explicitly.

## Security & Configuration Tips
- Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional `FLASK_SECRET_KEY`.
- Note: `.env.example` may not include `SUPABASE_SERVICE_ROLE_KEY`—add it locally.
- Supabase table `workout_plans`: `date` (YYYY-MM-DD), JSON `headers`, `remarks`, `plan_data`.
- Never commit secrets; use GitHub Actions secrets for CI.

## Agent-Specific Notes
- Keep patches minimal and scoped; avoid unrelated edits.
- Update this guide when changing structure, env, or workflows.
