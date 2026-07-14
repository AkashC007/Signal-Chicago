"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_DASHBOARD,
  chicagoTimestamp,
  fetchLiveDashboard,
  hasLiveDataConfig,
  routeMeta,
  type DashboardPayload,
  type RouteMetric,
  type StationMetric,
} from "../lib/signal-data";

type ConnectionMode = "demo" | "loading" | "live" | "retrying";
type StatusTone = "good" | "watch" | "concern" | "unknown";

type RiderStatus = {
  label: string;
  tone: StatusTone;
  explanation: string;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function liveLabel(payload: DashboardPayload, mode: ConnectionMode): string {
  if (mode === "demo") return "Preview data - cloud not connected";
  if (mode === "loading") return "Connecting to live data";
  if (mode === "retrying") return "Live data retrying";
  if (payload.freshness.status === "fresh") {
    const age = payload.freshness.age_minutes ?? 0;
    return `Live - ${age < 1 ? "under 1" : Math.round(age)} min old`;
  }
  if (payload.freshness.status === "delayed") return "Data collection delayed";
  if (payload.freshness.status === "stale") return "Data may be out of date";
  return "Waiting for the first update";
}

function etaExplanation(revision: number | null): string {
  if (revision == null) return "We are still building the ETA-change history.";
  if (revision <= 0.5) return "The arrival estimate has been fairly steady so far.";
  if (revision <= 1) return "The arrival estimate has moved a little between checks.";
  return "The arrival estimate has been changing more noticeably between checks.";
}

function routeRiderStatus(route: RouteMetric): RiderStatus {
  if (route.predictions === 0) {
    return {
      label: "No current arrivals",
      tone: "unknown",
      explanation: "CTA is not currently returning enough arrivals for this monitored sample.",
    };
  }

  const ratio = route.service_gap_index;
  const etaCopy = etaExplanation(route.revision);
  if (ratio == null) {
    return {
      label: "Limited gap data",
      tone: "unknown",
      explanation: `There are current arrivals, but not enough consecutive trains to compare their spacing. ${etaCopy}`,
    };
  }
  if (ratio >= 1.75) {
    return {
      label: "Much larger gaps",
      tone: "concern",
      explanation: `Current predictions show trains about ${ratio.toFixed(1)}x farther apart than the schedule. ${etaCopy}`,
    };
  }
  if (ratio >= 1.3) {
    return {
      label: "Larger gaps",
      tone: "watch",
      explanation: `Current predictions show trains about ${ratio.toFixed(1)}x farther apart than the schedule. ${etaCopy}`,
    };
  }
  if (route.wait >= 15) {
    return {
      label: "Longer wait right now",
      tone: "watch",
      explanation: `Train spacing is near the schedule, but the current average predicted wait is ${route.wait.toFixed(1)} minutes. ${etaCopy}`,
    };
  }
  return {
    label: "Close to schedule",
    tone: "good",
    explanation: `Current train spacing is close to what CTA scheduled. ${etaCopy}`,
  };
}

function stationSnapshotStatus(station: StationMetric): string {
  if (station.wait >= 15) return "Longer wait in this snapshot";
  if (station.wait >= 8) return "Moderate wait in this snapshot";
  return "Shorter wait in this snapshot";
}

function metric(value: number | null | undefined, suffix = " min"): string {
  return value == null ? "Not enough data" : `${value.toFixed(1)}${suffix}`;
}

export default function Home() {
  const [activeRoute, setActiveRoute] = useState("All");
  const [payload, setPayload] = useState<DashboardPayload>(FALLBACK_DASHBOARD);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    hasLiveDataConfig() ? "loading" : "demo",
  );

  useEffect(() => {
    if (!hasLiveDataConfig()) return;
    let mounted = true;
    let activeController: AbortController | null = null;

    const refresh = async () => {
      activeController?.abort();
      activeController = new AbortController();
      try {
        const nextPayload = await fetchLiveDashboard(activeController.signal);
        if (mounted) {
          setPayload(nextPayload);
          setConnectionMode("live");
        }
      } catch (error) {
        if (mounted && !(error instanceof DOMException && error.name === "AbortError")) {
          setConnectionMode("retrying");
        }
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      mounted = false;
      activeController?.abort();
      window.clearInterval(interval);
    };
  }, []);

  const routes = payload.routes.length ? payload.routes : FALLBACK_DASHBOARD.routes;
  const stationRows = payload.stations.length ? payload.stations : FALLBACK_DASHBOARD.stations;
  const visibleStations = useMemo(
    () => stationRows.filter((row) => activeRoute === "All" || row.route === activeRoute),
    [activeRoute, stationRows],
  );
  const routesWithLargerGaps = routes.filter((route) => (route.service_gap_index ?? 0) >= 1.3).length;
  const latestTimestamp = payload.freshness.latest_prediction_at;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Signal Chicago home">
          <span className="brandMark">S</span>
          <span><strong>Signal / Chicago</strong><small>CTA reliability, explained simply</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#now">Right now</a>
          <a href="#stations">Stations</a>
          <a href="#story">Why I built it</a>
        </nav>
        <span className={`liveStamp ${payload.freshness.status}`}><i />{liveLabel(payload, connectionMode)}</span>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">BUILT FROM A RIDER&apos;S FRUSTRATION / {chicagoTimestamp(latestTimestamp)}</p>
          <h1>Can I trust this<br /><em>arrival time?</em></h1>
          <p className="lede">
            CTA and Ventra tell us when a train is expected. Signal Chicago checks whether that estimate
            stays steady and whether trains are coming as evenly as the schedule says they should.
          </p>
          <p className="heroNote">
            I built this after repeatedly planning around an ETA that changed while I was waiting.
            The goal is to help another rider understand the situation before making the same decision.
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="#now">Check the CTA right now <span>↓</span></a>
            <a className="textLink" href="#explanation">How it works in 30 seconds →</a>
          </div>
        </div>

        <aside className="riderCard" aria-label="What Signal Chicago helps riders answer">
          <div className="riderCardHeader"><span>THE RIDER CHECK</span><b>3 questions</b></div>
          <ol>
            <li><span>01</span><div><b>How long is the wait right now?</b><p>We summarize CTA&apos;s current arrival predictions for the stations we monitor.</p></div></li>
            <li><span>02</span><div><b>Does the ETA keep changing?</b><p>We save each estimate and check whether the promised arrival time moves.</p></div></li>
            <li><span>03</span><div><b>Are trains spaced as planned?</b><p>We compare the predicted gap between trains with CTA&apos;s published schedule.</p></div></li>
          </ol>
          <div className="riderCardFoot"><b>12 stations</b><b>8 CTA lines</b><b>Checked every 2 min</b></div>
        </aside>
      </section>

      <section className="ticker" aria-label="Live data summary">
        <span><b>{formatCount(payload.coverage.predictions_total)}</b> arrival estimates saved</span>
        <span><b>{formatCount(payload.coverage.runs_24h)}</b> checks in the last 24h</span>
        <span><b>{payload.coverage.cohort_stations || 12}</b> stations monitored</span>
        <span><b>{routesWithLargerGaps}</b> lines with larger gaps now</span>
      </section>

      <section className="simpleExplainer" id="explanation">
        <div className="sectionIntro compactIntro">
          <p className="eyebrow">THE 30-SECOND EXPLANATION</p>
          <h2>We do not replace the CTA estimate.<br />We test how dependable it looks.</h2>
        </div>
        <div className="explainSteps">
          <article><span>1</span><b>CTA posts an ETA</b><p>For example: “Your train should arrive in 8 minutes.”</p></article>
          <article><span>2</span><b>We save it</b><p>Two minutes later, we save the next estimate for the same train.</p></article>
          <article><span>3</span><b>We compare it</b><p>If 8 minutes becomes 11, then 13, the promise has not been steady.</p></article>
          <article><span>4</span><b>We explain it</b><p>The rider sees a simple status. The arrow reveals the analyst evidence.</p></article>
        </div>
      </section>

      <section className="pulseSection" id="now">
        <div className="sectionIntro">
          <p className="eyebrow">HOW THE CTA LOOKS RIGHT NOW</p>
          <h2>Start with the plain-English answer.</h2>
          <p>
            These are current predictions, not permanent grades. Open the arrow on any line to see
            the exact measurements and formulas behind the simple status.
          </p>
          <div className="statusKey" aria-label="Status guide">
            <span className="good">Close to schedule</span>
            <span className="watch">Larger gaps</span>
            <span className="concern">Much larger gaps</span>
            <span className="unknown">Limited data</span>
          </div>
        </div>

        <div className="routeList">
          {routes.map((route) => {
            const meta = routeMeta(route.code);
            const status = routeRiderStatus(route);
            return (
              <details className={`routeDisclosure ${status.tone}`} key={route.code}>
                <summary>
                  <span className="disclosureArrow" aria-hidden="true">⌄</span>
                  <span className="lineName"><i style={{ background: meta.color }} />{meta.name}</span>
                  <span className={`riderStatus ${status.tone}`}>{status.label}</span>
                  <span className="simpleWait"><b>{route.wait.toFixed(1)} min</b><small>average predicted wait</small></span>
                  <span className="routeExplanation">{status.explanation}</span>
                </summary>
                <div className="analystPanel">
                  <div className="analystHeading"><span>ANALYST VIEW</span><h3>Evidence behind the rider status</h3></div>
                  <div className="analystMetrics">
                    <div><small>Current average wait</small><b>{route.wait.toFixed(1)} min</b><p>Average time from the latest CTA snapshot to the upcoming predicted arrivals.</p></div>
                    <div><small>ETA movement</small><b>{route.revision == null ? "Building history" : `±${route.revision.toFixed(1)} min`}</b><p>Average absolute change in the same train&apos;s promised arrival time.</p></div>
                    <div><small>Predicted train gap</small><b>{metric(route.gap)}</b><p>Spacing between consecutive predicted trains in the same direction.</p></div>
                    <div><small>Scheduled spacing</small><b>{metric(route.scheduled_headway)}</b><p>Typical spacing calculated from CTA&apos;s GTFS schedule for this time period.</p></div>
                    <div><small>Gap vs. schedule</small><b>{route.service_gap_index == null ? "Not enough data" : `${route.service_gap_index.toFixed(2)}x`}</b><p>Predicted gap divided by scheduled spacing. 1.0x is close to plan; 2.0x is about double.</p></div>
                    <div><small>Snapshot coverage</small><b>{route.predictions} arrivals / {route.stations} stations</b><p>This is the monitored sample behind the current route reading.</p></div>
                  </div>
                  <div className="analystActions">
                    <p><b>Formula:</b> Gap vs. schedule = predicted train gap ÷ scheduled spacing. These labels are Signal Chicago display rules, not official CTA categories.</p>
                    <button onClick={() => setActiveRoute(route.code)}>Show {meta.name} stations ↓</button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="metricExplainer" aria-label="Plain-language metric definitions">
        <article><span>RIDER QUESTION 01</span><b>Can I trust the ETA?</b><p>We call the analyst measurement ETA movement. Smaller changes mean the promised time has been steadier.</p></article>
        <article><span>RIDER QUESTION 02</span><b>Are trains coming evenly?</b><p>Gap vs. schedule compares the predicted spacing between trains with what CTA planned for this time of day.</p></article>
        <article><span>RIDER QUESTION 03</span><b>Is this station reliable?</b><p>A live wait is only one moment. We need repeated days before giving a fair historical station reliability grade.</p></article>
      </section>

      <section className="stationsSection" id="stations">
        <div className="stationHeader">
          <div>
            <p className="eyebrow">MONITORED STATIONS / LIVE SNAPSHOT</p>
            <h2>Check the wait without mistaking it for a grade.</h2>
            <p className="stationIntro">The cards are sorted by current predicted wait. Open an arrow for the raw snapshot details.</p>
          </div>
          <div className="filterGroup" aria-label="Filter station observations by line">
            {["All", ...routes.map((route) => route.code)].map((code) => (
              <button key={code} className={activeRoute === code ? "active" : ""} onClick={() => setActiveRoute(code)}>
                {code === "All" ? "All observed" : routeMeta(code).name}
              </button>
            ))}
          </div>
        </div>
        <div className="stationGrid">
          {visibleStations.length ? visibleStations.map((row, index) => {
            const meta = routeMeta(row.route);
            return (
              <details className="stationCard" key={`${row.route}-${row.station_id}`}>
                <summary>
                  <span className="stationIndex">{String(index + 1).padStart(2, "0")}</span>
                  <span className="stationArrow" aria-hidden="true">⌄</span>
                  <span className="routePill" style={{ background: meta.color }}>{meta.name}</span>
                  <h3>{row.station}</h3>
                  <div className="stationMetric"><strong>{row.wait.toFixed(1)}</strong><span>min<br />predicted wait</span></div>
                  <p className="stationStatus">{stationSnapshotStatus(row)}</p>
                </summary>
                <div className="stationAnalystPanel">
                  <span>SNAPSHOT DETAILS</span>
                  <p><b>{row.arrivals}</b> upcoming arrivals currently visible.</p>
                  <p><b>{row.delayed.toFixed(0)}%</b> are explicitly marked delayed by CTA.</p>
                  <p><b>Station reliability history:</b> still collecting a fair multi-day baseline.</p>
                  <small>Important: a long wait right now does not automatically make this an unreliable station.</small>
                </div>
              </details>
            );
          }) : <p className="emptyState">No current arrivals for this route in the monitored station sample.</p>}
        </div>
      </section>

      <section className="methodSection" id="story">
        <div className="methodQuote">
          <p className="eyebrow">WHY I BUILT SIGNAL CHICAGO</p>
          <span className="quoteMark">“</span>
          <blockquote>The ETA helped me plan - until it kept changing while I waited.</blockquote>
          <p>
            I wanted a way to look beyond one arrival number. Signal Chicago keeps the earlier estimates,
            checks how they change, and asks whether the gap between trains matches the schedule.
          </p>
          <p className="byline">- Akash Chenchugan, Chicago rider and project creator</p>
        </div>
        <div className="pipeline">
          <p className="eyebrow">WHAT HAPPENS EVERY TWO MINUTES</p>
          {[
            ["01", "Ask CTA", "A protected cloud function requests new arrival estimates for twelve stations."],
            ["02", "Save the promise", "The database keeps each estimate so it does not disappear when CTA updates it."],
            ["03", "Check the change", "Repeated ETAs become stability measurements; train gaps are compared with the schedule."],
            ["04", "Explain it", "The site shows the rider answer first and keeps the analyst evidence one arrow away."],
          ].map(([number, title, copy]) => (
            <div className="pipelineStep" key={number}><span>{number}</span><b>{title}</b><p>{copy}</p></div>
          ))}
          <details className="methodDisclosure">
            <summary><span>⌄</span> Open the technical architecture</summary>
            <div>
              <p><b>Source:</b> CTA Train Tracker API and CTA GTFS schedule files.</p>
              <p><b>Collector:</b> Supabase Edge Function triggered by Supabase Cron every two minutes.</p>
              <p><b>Storage:</b> PostgreSQL with validation, collection audit records, 14-day raw retention, and daily summaries.</p>
              <p><b>Website:</b> Static Next.js dashboard on Cloudflare Pages, requesting a read-only summary every minute.</p>
              <p><b>Rider labels:</b> Below 1.3x is close to schedule; 1.3x-1.74x is a larger gap; 1.75x or more is a much larger gap. A 15+ minute average wait can also trigger a watch label. These are Signal Chicago rules, not CTA standards.</p>
            </div>
          </details>
        </div>
      </section>

      <section className="buildLog">
        <p className="eyebrow">READ THIS PROJECT HONESTLY</p>
        <div className="logGrid">
          <article><time>WHAT IT TELLS YOU NOW</time><b>Current prediction behavior</b><p>How long the predicted wait looks, whether ETAs have been steady, and whether train gaps look larger than scheduled.</p></article>
          <article><time>WHAT IT DOES NOT CLAIM</time><b>Official on-time performance</b><p>The observatory studies CTA predictions for a 12-station sample. It does not yet track every completed arrival across the full network.</p></article>
          <article><time>WHAT GROWS WITH TIME</time><b>Fair station reliability</b><p>As more days are collected, Signal Chicago can compare stations by time of day without judging them from one bad moment.</p></article>
        </div>
      </section>

      <footer>
        <div><strong>Signal / Chicago</strong><p>Designed and engineered by Akash Chenchugan.</p></div>
        <p>Independent educational project. Not affiliated with or endorsed by the Chicago Transit Authority.</p>
        <a href="https://github.com/AkashC007/Signal-Chicago" target="_blank" rel="noreferrer">View source ↗</a>
      </footer>
    </main>
  );
}
