# Cloud ownership checklist

The production system must be created under accounts controlled by Akash.

## GitHub

- Repository owner is Akash's GitHub username.
- The repository is public only after credential and generated-data checks pass.
- `.env`, database files, raw downloads, and API keys remain ignored.
- CI runs tests and secret scanning on every push.

## Database and scheduler

- Supabase project owner is Akash's email/account.
- Raw prediction tables are protected by row-level security.
- Public visitors can execute only a bounded summary function.
- Public visitors never receive direct database credentials.
- Fourteen days of raw observations feed permanent daily reliability summaries.

## Collector

- CTA key is stored as a secret in Akash's cloud account.
- Default cadence is one cohort run every 120 seconds.
- Runs cannot overlap and every run produces a health record.
- Request volume is monitored and kept within CTA's published allowance.

## Website and domain

- Cloudflare Pages project owner is Akash's account.
- Production access is public and requires no third-party sign-in.
- DNS and domain registration are controlled by Akash.
- Recommended hostname: `transit.<Akash's domain>`.
- The current private deployment is a temporary preview, not production.
