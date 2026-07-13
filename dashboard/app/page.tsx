"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FALLBACK_DASHBOARD,
  chicagoTimestamp,
  fetchLiveDashboard,
  hasLiveDataConfig,
  routeMeta,
  type DashboardPayload,
} from "../lib/signal-data";

type ConnectionMode = "demo" | "loading" | "live" | "retrying";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function liveLabel(payload: DashboardPayload, mode: ConnectionMode): string {
  if (mode === "demo") return "Preview data · cloud not connected";
  if (mode === "loading") return "Connecting to observatory";
  if (mode === "retrying") return "Live feed retrying";
  if (payload.freshness.status === "fresh") {
    const age = payload.freshness.age_minutes ?? 0;
    return `Live · ${age < 1 ? "under 1" : Math.round(age)} min old`;
  }
  if (payload.freshness.status === "delayed") return "Collector delayed";
  if (payload.freshness.status === "stale") return "Collector stale";
  return "Waiting for first snapshot";
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
  const diagramStations = stationRows.slice(0, 6);
  const latestTimestamp = payload.freshness.latest_prediction_at;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Signal Chicago home">
          <span className="brandMark">S</span>
          <span><strong>Signal / Chicago</strong><small>CTA reliability observatory</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#pulse">Network pulse</a>
          <a href="#stations">Stations</a>
          <a href="#method">Method</a>
        </nav>
        <span className={`liveStamp ${payload.freshness.status}`}><i />{liveLabel(payload, connectionMode)}</span>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">FIELD NOTE / {chicagoTimestamp(latestTimestamp)}</p>
          <h1>Chicago trains,<br /><em>read between the lines.</em></h1>
          <p className="lede">
            A continuously updated reliability observatory that records CTA arrival predictions,
            measures how those predictions move, and makes service gaps visible.
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="#pulse">Read the network pulse <span>↓</span></a>
            <a className="textLink" href="#method">How the data moves →</a>
          </div>
        </div>

        <div className="loopCard" aria-label="Observed routes diagram">
          <div className="loopHeader">
            <span>OBSERVED NETWORK</span>
            <b>{payload.coverage.observed_routes || 8} / 8 lines</b>
          </div>
          <div className="routeDiagram">
            <div className="track" />
            {diagramStations.map((row, index) => {
              const meta = routeMeta(row.route);
              return (
                <div className="diagramStop" key={`${row.station_id}-${row.route}`}>
                  <span className="stopDot" style={{ background: meta.color }} />
                  <b>{row.station}</b><small>{meta.name}</small><i>{String(index + 1).padStart(2, "0")}</i>
                </div>
              );
            })}
          </div>
          <p className="diagramNote">
            A live dispatch list, not a geographic map. The cohort covers twelve stations and all eight CTA rail lines.
          </p>
        </div>
      </section>

      <section className="ticker" aria-label="Data coverage summary">
        <span><b>9,282</b> ridership days</span>
        <span><b>136,888</b> scheduled stop events</span>
        <span><b>{formatCount(payload.coverage.predictions_total)}</b> predictions captured</span>
        <span><b>{formatCount(payload.coverage.runs_24h)}</b> collection runs / 24h</span>
      </section>

      <section className="pulseSection" id="pulse">
        <div className="sectionIntro">
          <p className="eyebrow">NETWORK PULSE / LATEST STATION SNAPSHOTS</p>
          <h2>A live reading,<br />with its limits attached.</h2>
          <p>
            Expected wait is the time between CTA&apos;s snapshot and predicted arrival. ETA movement compares the same train across repeated snapshots; lower movement means a steadier prediction.
          </p>
        </div>

        <div className="routeBoard">
          <div className="boardHead">
            <span>LINE</span><span>ARRIVALS</span><span>STATIONS</span><span>AVG EXPECTED WAIT</span><span>ETA MOVEMENT / 14D</span>
          </div>
          {routes.map((route) => {
            const meta = routeMeta(route.code);
            return (
              <button className="boardRow" key={route.code} onClick={() => setActiveRoute(route.code)} aria-label={`Show ${meta.name} stations`}>
                <span className="lineName"><i style={{ background: meta.color }} />{meta.name}</span>
                <span>{String(route.predictions).padStart(2, "0")}</span>
                <span>{String(route.stations).padStart(2, "0")}</span>
                <span className="waitCell"><b style={{ width: `${Math.min(100, route.wait * 5)}%`, background: meta.color }} />{route.wait.toFixed(1)} min</span>
                <span>
                  {route.revision == null ? "building baseline" : `±${route.revision.toFixed(1)} min`}
                  {route.service_gap_index == null ? "" : ` · SGI ${route.service_gap_index.toFixed(2)}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="metricExplainer" aria-label="Reliability metric definitions">
        <article><span>01</span><b>Prediction stability</b><p>How much a train&apos;s promised arrival time changes while riders wait. Smaller revisions are steadier.</p></article>
        <article><span>02</span><b>Predicted service gap</b><p>Minutes between consecutive predicted trains going the same direction from the same platform.</p></article>
        <article><span>03</span><b>Service Gap Index</b><p>Predicted gap divided by scheduled headway. A value above 1.0 means the observed gap is larger than planned.</p></article>
      </section>

      <section className="stationsSection" id="stations">
        <div className="stationHeader">
          <div><p className="eyebrow">STATION DISPATCH</p><h2>Where the wait stretched.</h2></div>
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
              <article className="stationCard" key={`${row.route}-${row.station_id}`}>
                <div className="stationIndex">{String(index + 1).padStart(2, "0")}</div>
                <span className="routePill" style={{ background: meta.color }}>{meta.name}</span>
                <h3>{row.station}</h3>
                <div className="stationMetric"><strong>{row.wait.toFixed(1)}</strong><span>min<br />expected wait</span></div>
                <p>{row.arrivals} upcoming arrivals · {row.delayed.toFixed(0)}% currently marked delayed by CTA.</p>
              </article>
            );
          }) : <p className="emptyState">No current arrivals for this route in the monitored cohort.</p>}
        </div>
      </section>

      <section className="methodSection" id="method">
        <div className="methodQuote">
          <span className="quoteMark">“</span>
          <blockquote>Reliability is a story over time—not a score from one snapshot.</blockquote>
          <p>That sentence is a product rule. Signal Chicago keeps the raw evidence long enough to calculate stability, then preserves compact daily summaries.</p>
        </div>
        <div className="pipeline">
          <p className="eyebrow">THE TWO-MINUTE DATA JOURNEY</p>
          {[
            ["01", "Collect", "A protected Supabase function requests CTA predictions for twelve stations."],
            ["02", "Validate", "Timestamps, station coverage, flags, and errors are checked before loading."],
            ["03", "Compare", "Repeated ETAs become revision and service-gap measurements in PostgreSQL."],
            ["04", "Publish", "The public site requests read-only summaries and refreshes once per minute."],
          ].map(([number, title, copy]) => (
            <div className="pipelineStep" key={number}><span>{number}</span><b>{title}</b><p>{copy}</p></div>
          ))}
        </div>
      </section>

      <section className="buildLog">
        <p className="eyebrow">FROM THE BUILD LOG</p>
        <div className="logGrid">
          <article><time>FOUNDATION</time><b>Twelve stations, all eight lines</b><p>The first cohort balances route coverage, terminals, transfer stations, airport service, and an Illinois Tech connection.</p></article>
          <article><time>LIVE SYSTEM</time><b>Two-minute evidence</b><p>Each successful run writes predictions and an audit record. Partial station failures remain visible instead of silently disappearing.</p></article>
          <article><time>FREE CLOUD</time><b>Raw detail, compact history</b><p>Fourteen days of raw predictions support stability analysis; daily reliability summaries remain for long-term comparisons.</p></article>
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
