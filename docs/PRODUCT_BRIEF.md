# Signal Chicago product brief

## Product statement

Signal Chicago is a public, personally owned, and continuously updated CTA
Reliability Observatory. It collects real train predictions every two minutes,
tracks how those predictions change, compares predicted service gaps with CTA
schedules, and displays route and station reliability through an interactive
website.

The source code will live in Akash Chenchugan's GitHub account, operational data
will live in his cloud database, and the public site will use his domain without
requiring third-party authentication.

## The user problem

An arrival board shows only the latest estimate. It does not show that an arrival
originally predicted for 3:10 PM changed to 3:15, then 3:18. Signal Chicago saves
each estimate so visitors can see whether a prediction stayed dependable or
continued moving.

## Core metrics

### Expected wait

The difference between the collection time and CTA's predicted arrival time.

### ETA revision

The number of minutes a predicted arrival moved compared with the previous
observation for the same train run and station.

### Prediction stability

A documented score describing how much a train's ETA changes as it approaches a
station. A stable prediction changes little; an unstable prediction repeatedly
moves forward or backward. The exact scoring formula will be versioned and
tested before publication.

### Predicted service gap

The number of minutes between consecutive predicted train arrivals on the same
route, station, and direction.

### Service Gap Index

Predicted service gap divided by the scheduled headway. A value of `2.0` means
the predicted gap is twice the scheduled gap.

### Data freshness

The age of the most recent successful collection. The website will visibly label
fresh, delayed, and stale data.

## Claims we will not make

- We will not call a snapshot a long-term trend.
- We will not describe CTA predictions as actual arrivals.
- We will not publish an on-time-performance percentage without an appropriate
  actual-arrival source or a clearly documented proxy.
- We will not add machine learning until enough historical observations exist.

## Ownership target

| Asset | Final owner |
|---|---|
| GitHub repository | Akash's GitHub account |
| CTA API key | Akash; stored only as a secret |
| PostgreSQL database | Akash's cloud account |
| Scheduled collector | Akash's cloud account |
| Domain and DNS | Akash's registrar/DNS account |
| Public dashboard | Akash's hosting account and domain |
