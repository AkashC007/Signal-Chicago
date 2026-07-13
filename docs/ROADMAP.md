# Reliability Observatory roadmap

## Completed foundation

- Official ridership ingestion: 9,282 daily records.
- Rail GTFS ingestion: 8 routes, 441 stops, 5,053 trips, and 136,888 stop events.
- Secure Train Tracker connection and timestamp normalization.
- Audited bounded collection: 10 successful stations and 50 predictions in one run.
- SQLite development warehouse and eight automated tests.
- First interactive visual prototype with honest snapshot labeling.

## Milestone 1 - Owned source

- Publish one canonical repository in Akash's GitHub account.
- Flatten the temporary preview deployment repository into the main project.
- Add CI tests and secret scanning.

## Milestone 2 - Continuous collection

- Use the versioned 12-station cohort in `config/stations.json`.
- Collect up to five arrivals per station every two minutes.
- Prevent overlapping runs and record run health.
- Display the most recent successful collection time.

## Milestone 3 - Cloud data

- Move operational tables from local SQLite to PostgreSQL.
- Store credentials in the hosting provider's secret manager.
- Add retention, indexing, backup, and data-volume monitoring.

## Milestone 4 - Reliability analytics

- Link repeated observations by train run, station, route, and direction.
- Calculate ETA revisions and prediction stability.
- Derive predicted gaps and scheduled headways.
- Publish a versioned Service Gap Index with test cases.
- Accumulate at least 7-14 days before presenting comparative conclusions.

## Milestone 5 - Live public product

- Replace embedded snapshot values with a read-only backend API.
- Refresh dashboard data every 30-60 seconds.
- Add data-freshness and collection-health indicators.
- Deploy publicly under Akash's domain with no third-party login.

## Milestone 6 - Visual storytelling

- Animated but accessible route map.
- ETA revision timelines and stability sparklines.
- Route/station heatmaps and time-of-day filters.
- "What changed?" narrative feed.
- Weather and service-alert context.
- Mobile commuter view and reduced-motion support.
