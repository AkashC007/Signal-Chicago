# Free cloud deployment

Signal Chicago uses two accounts controlled by Akash:

- **Supabase Free:** PostgreSQL, the protected CTA collector, scheduled jobs, and reliability rollups.
- **Cloudflare Pages Free:** the static public dashboard, automatic GitHub builds, HTTPS, and the custom domain.

The CTA key is stored only in Supabase Function Secrets. The public dashboard receives a publishable key that can execute only the bounded `get_public_dashboard()` function. Row-level security blocks direct access to raw predictions and operational tables.

## Data flow

1. Supabase Cron invokes `collect-cta` every two minutes with a private collector secret.
2. The Edge Function requests up to five arrivals for each of the twelve configured stations.
3. One PostgreSQL RPC validates and loads the complete run, including station-level errors.
4. PostgreSQL refreshes route and station reliability rollups hourly.
5. Raw prediction observations are retained for fourteen days; compact daily reliability summaries remain.
6. The Cloudflare site requests the public dashboard summary every sixty seconds.

## Supabase setup

1. Create a free project named `signal-chicago` in an account owned by Akash.
2. Install and authenticate the Supabase CLI.
3. From the repository root, link the project and apply the migration:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

4. In **Project Settings → Edge Functions → Secrets**, create:

   - `CTA_TRAIN_API_KEY`: the existing CTA Train Tracker key.
   - `COLLECTOR_SECRET`: a new long random value used only by the scheduler.

5. Deploy the collector:

   ```bash
   supabase functions deploy collect-cta --no-verify-jwt
   ```

6. Copy `supabase/setup/schedule_collector.sql.example`, replace its two placeholders locally, and run the edited SQL in Supabase SQL Editor. Never commit the edited secret.
7. Confirm that `collection_runs` receives a new row within two minutes and that `get_public_dashboard()` returns a fresh timestamp.

### Weekly schedule refresh

The `Refresh CTA scheduled headways` GitHub workflow downloads the current CTA GTFS feed every Monday, calculates median scheduled headways by route, station, day type, direction, and time period, then replaces the cloud schedule reference table.

Add these encrypted repository secrets under **GitHub → Settings → Secrets and variables → Actions**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Until those two secrets exist, the workflow exits successfully without attempting a sync.

## Cloudflare Pages setup

1. Create a Pages project from `AkashC007/Signal-Chicago`.
2. Use these build settings:

   - Root directory: `dashboard`
   - Build command: `pnpm build`
   - Build output directory: `out`

3. Add these production environment variables:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the current Supabase publishable key)
   - `NEXT_PUBLIC_SITE_URL` (the final public origin)

4. Deploy and verify the generated `pages.dev` address before connecting a personal domain.
5. Add the custom hostname in Cloudflare Pages and update `NEXT_PUBLIC_SITE_URL` to match it.

## Free-tier controls

- The station cohort and five-arrival response cap bound every CTA run.
- A fourteen-day raw retention window protects the 500 MB free database limit.
- Daily reliability summaries preserve long-term trends after raw observations expire.
- The dashboard makes one small read-only summary request per active visitor per minute.
- Collection runs and station errors remain auditable without storing request URLs or credentials.

## Operational checks

Use these queries in Supabase SQL Editor:

```sql
select * from public.collection_runs order by completed_at desc limit 10;
select public.get_public_dashboard();
select jobid, jobname, schedule, active from cron.job order by jobname;
```

If data is more than fifteen minutes old, inspect Edge Function logs, `collection_errors`, and `cron.job_run_details` before changing the schedule.
