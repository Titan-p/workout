# Vercel Next.js Migration

## Current Slice

- Added a new `frontend/` Next.js App Router application.
- Moved the web runtime pages and training APIs into Next.js.
- Kept plan parsing and Kdocs/Supabase upload as a local script workflow.

## What Works In This Slice

- `frontend/app/page.tsx` renders the daily dashboard.
- `frontend/app/training/page.tsx` handles training, set logging, finish summary, cancellation, history, and load monitor views.
- `frontend/app/week/page.tsx` renders the weekly plan.
- `frontend/app/upload/page.tsx` points to the local sync script.
- `frontend/app/api/**` covers the runtime JSON API:
  - plan read: `today-plan`, `plans/[date]`, `week`
  - training flow: `start-training`, `next-set`, `current-session`, `finish-training`, `cancel-training`
  - analysis and history: `load-monitor`, `load-monitor/day`, `training-history`, `training-history/[sessionId]`

## Local Run

```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

Required variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Vercel Cutover

1. Point the Vercel project's Root Directory to `frontend`.
2. Set Framework Preset to `Next.js`.
3. Copy the Supabase environment variables into the Vercel project.
4. Keep `frontend/vercel.json` committed so the deployment overrides stale project-level Vite output settings.

## Deployment Flow

Production deployment is handled by Vercel Git Integration. Commit locally, then run:

```bash
git push origin main
```

The push to `main` triggers Vercel automatically. Manual `vercel deploy` is only for exceptional ad hoc checks.

## Plan Sync

Plan parsing and upload stay in the local Python script:

```bash
python3 scripts/upload_workout_plans.py --env-file .env
```

Exercise target units use `config/exercise_unit_overrides.json` before heuristic fallback. Refresh the override file locally with AI when the plan introduces new movement patterns:

```bash
python3 scripts/classify_exercise_units.py --input /path/to/parsed-plan.json --env-file .env
```

The Next.js `/api/upload-plan` endpoint returns the local command and does not parse Excel files in the web runtime.
