# Collector operations

## One bounded snapshot

```bash
cta-pipeline collect-network-snapshot --station-limit 10 --max-results 5
cta-pipeline export-metrics
```

The collector discovers parent rail stations from the current GTFS feed. It is
bounded to 1-50 stations per run and 1-20 predictions per station. The defaults
use 10 stations and 5 predictions to make accidental high-volume collection less
likely during development.

Every run writes an audit record to `collection_runs`. Station-level failures are
stored in `collection_errors`, while successful station responses remain usable.
Error messages never include request URLs because Train Tracker URLs contain the
private API key.

## Exported datasets

`cta-pipeline export-metrics` writes:

- `data/processed/route_snapshot_metrics.csv`
- `data/processed/station_snapshot_metrics.csv`

These files summarize the most recent snapshot available for each observed
station. They are inputs for dashboard development, not evidence of historical
on-time performance.

## Interpretation limits

CTA Train Tracker returns predicted arrival times and flags such as `isDly`; it
does not provide a complete actual-arrival history. We need repeated observations
over several days before discussing patterns, and any delay measure must identify
whether it is a CTA flag or our derived metric.

## Recurring collection plan

The next orchestration milestone will:

1. define a representative station cohort across all eight rail routes;
2. run on a controlled interval;
3. prevent overlapping runs;
4. record API failures and data freshness;
5. monitor request volume against CTA's published allowance;
6. retain raw response samples for debugging without retaining credentials.

