# Vercel Next.js Migration

## Current Slice

- Added a new `frontend/` Next.js App Router application.
- Migrated the training page first-screen data read into TypeScript.
- Kept the existing Flask application and tests untouched.

## What Works In This Slice

- `frontend/app/training/page.tsx` reads:
  - today's workout plan from `workout_plans`
  - current active training session from `training_sessions`
  - today's load summary from `training_sessions` and `training_day_metrics`
- `frontend/app/api/today-plan/route.ts` exposes the plan summary in Next.js.
- `frontend/app/api/training/snapshot/route.ts` exposes a combined payload for the training page.

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
4. Keep the current Flask app available during migration until write APIs move over.

## Next Slice

- Port the training write flow:
  - `start-training`
  - `next-set`
  - `finish-training`
  - `cancel-training`
- Move history and weekly load monitor into Next.js route handlers.
