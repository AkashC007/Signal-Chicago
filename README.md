# Signal Chicago - CTA Reliability Observatory

A personally owned, continuously updated data engineering and analytics project
built with official Chicago Transit Authority and City of Chicago data. Signal
Chicago tracks how train arrival predictions change over time and compares
predicted service gaps with scheduled service.

> Current phase: validated development pipeline and visual prototype. Continuous
> cloud collection and the public domain are the next production milestones.

## Why this project

The finished platform will answer practical questions such as:

- How have bus and rail ridership patterns changed over time?
- Which weekdays, seasons, and unusual periods produce the largest changes?
- How do weather and service alerts relate to ridership and train reliability?
- Which routes and stations experience the most unreliable service?
- How often does a train's expected arrival change while passengers are waiting?
- When do predicted gaps become materially larger than scheduled headways?

## Architecture roadmap

1. **Historical MVP:** City of Chicago Socrata API -> Python validation -> SQLite
   warehouse -> tested SQL analytics.
2. **Scheduled service:** CTA GTFS files -> normalized schedule and station models.
3. **Real-time ingestion:** CTA Train Tracker snapshots -> raw/cleaned tables.
4. **Analytics layer:** dbt models, data-quality tests, and documented KPIs.
5. **Delivery:** dashboard, Docker services, orchestration, CI, and cloud deployment.

SQLite keeps milestone one easy to run anywhere. PostgreSQL, Airflow, and dbt will
be introduced when they add demonstrable engineering value rather than only
appearing as resume keywords.

## Official data sources

- CTA daily ridership: `https://data.cityofchicago.org/resource/6iiy-9s97.json`
- CTA developer center and GTFS: `https://www.transitchicago.com/developers/`
- CTA Train Tracker: `https://www.transitchicago.com/developers/traintracker/`

## Quick start

Requires Python 3.11 or newer.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
cta-pipeline ingest-ridership
cta-pipeline ingest-gtfs
cta-pipeline ingest-train-arrivals --station-id 40380
cta-pipeline collect-network-snapshot --station-limit 10 --max-results 5
cta-pipeline collect-recurring --runs 1 --max-results 5
cta-pipeline export-metrics
cta-pipeline summarize
python -m unittest discover -s tests -v
```

The warehouse is written to `data/warehouse/cta_reliability.db`. Generated data
is intentionally excluded from Git.

To limit a development run:

```bash
cta-pipeline ingest-ridership --limit 100
```

## Data model

`daily_ridership`

| Column | Meaning |
|---|---|
| `service_date` | CTA service date; primary key |
| `day_type` | `W` weekday, `A` Saturday, `U` Sunday/holiday |
| `bus_rides` | Bus boardings |
| `rail_rides` | Rail boardings |
| `total_rides` | Bus plus rail boardings |
| `source_updated_at` | Time the row was fetched by this pipeline |

The GTFS schedule and real-time prediction tables are described in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Collector safeguards and interpretation limits are in
[`docs/OPERATIONS.md`](docs/OPERATIONS.md).
The approved product definition and delivery plan are in
[`docs/PRODUCT_BRIEF.md`](docs/PRODUCT_BRIEF.md) and
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Credential safety

Copy `.env.example` to `.env` when credentials are introduced. Never commit a
CTA API key, Socrata token, password, or cloud credential.

## Status

- [x] Repository scaffold
- [x] Public ridership ingestion and validation
- [x] Idempotent SQLite load
- [x] Unit tests for source-record transformation
- [x] Real-time Train Tracker extraction and snapshot storage
- [x] Rail-focused GTFS schedule ingestion
- [x] Bounded multi-station collection with run auditing
- [x] Route and station snapshot metric exports
- [ ] Weather enrichment
- [ ] Orchestrated recurring snapshot collection
- [ ] dbt analytics models and tests
- [ ] Dashboard and cloud deployment
