"use client";

import { useMemo, useState } from "react";

type RouteMetric = {
  code: string;
  name: string;
  color: string;
  predictions: number;
  stations: number;
  wait: number;
  scheduled: number;
};

const routes: RouteMetric[] = [
  { code: "Red", name: "Red Line", color: "#c60c30", predictions: 15, stations: 3, wait: 10.54, scheduled: 13.33 },
  { code: "Blue", name: "Blue Line", color: "#00a1de", predictions: 1, stations: 1, wait: 1.73, scheduled: 0 },
  { code: "G", name: "Green Line", color: "#009b3a", predictions: 22, stations: 5, wait: 12.79, scheduled: 9.09 },
  { code: "Brn", name: "Brown Line", color: "#62361b", predictions: 1, stations: 1, wait: 0.65, scheduled: 0 },
  { code: "Org", name: "Orange Line", color: "#f9461c", predictions: 6, stations: 2, wait: 16.04, scheduled: 16.67 },
  { code: "Pink", name: "Pink Line", color: "#e27ea6", predictions: 10, stations: 2, wait: 14.93, scheduled: 20 },
];

const stationRows = [
  { route: "G", station: "43rd", arrivals: 5, wait: 19.78 },
  { route: "Org", station: "35th/Archer", arrivals: 5, wait: 18.91 },
  { route: "Pink", station: "54th/Cermak", arrivals: 5, wait: 18.43 },
  { route: "Red", station: "63rd", arrivals: 5, wait: 12.71 },
  { route: "G", station: "35th–Bronzeville–IIT", arrivals: 5, wait: 12.39 },
  { route: "Pink", station: "18th", arrivals: 5, wait: 11.44 },
  { route: "G", station: "47th", arrivals: 5, wait: 11.02 },
  { route: "Red", station: "69th", arrivals: 5, wait: 8.7 },
];

const routeByCode = Object.fromEntries(routes.map((route) => [route.code, route]));

export default function Home() {
  const [activeRoute, setActiveRoute] = useState("All");
  const visibleStations = useMemo(
    () => stationRows.filter((row) => activeRoute === "All" || row.route === activeRoute),
    [activeRoute],
  );

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Signal Chicago home">
          <span className="brandMark">S</span>
          <span><strong>Signal / Chicago</strong><small>an independent transit data study</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#pulse">Network pulse</a>
          <a href="#stations">Stations</a>
          <a href="#method">Method</a>
        </nav>
        <span className="liveStamp"><i /> Snapshot complete</span>
      </header>

      <section className="hero" id="top">
        <div className="heroCopy">
          <p className="eyebrow">FIELD NOTE 001 · JUL 10, 2026 · 3:37 PM CT</p>
          <h1>Chicago trains,<br /><em>read between the lines.</em></h1>
          <p className="lede">
            A working data platform that combines CTA schedules, live arrival predictions,
            and twenty-five years of ridership history—built to make reliability visible.
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="#pulse">Read the network pulse <span>↓</span></a>
            <a className="textLink" href="#method">How the data moves →</a>
          </div>
        </div>

        <div className="loopCard" aria-label="Observed routes diagram">
          <div className="loopHeader"><span>OBSERVED NETWORK</span><b>6 / 8 lines</b></div>
          <div className="routeDiagram">
            <div className="track" />
            {[
              ["18th", "Pink", "01"], ["35th–Bronzeville–IIT", "G", "02"],
              ["43rd", "G", "03"], ["47th", "Red", "04"],
              ["63rd", "Red", "05"], ["69th", "Red", "06"],
            ].map(([station, route, number]) => (
              <div className="diagramStop" key={`${station}-${route}`}>
                <span className="stopDot" style={{ background: routeByCode[route]?.color }} />
                <b>{station}</b><small>{routeByCode[route]?.name}</small><i>{number}</i>
              </div>
            ))}
          </div>
          <p className="diagramNote">Not a geographic map. Stops shown are part of this prototype’s first collection cohort.</p>
        </div>
      </section>

      <section className="ticker" aria-label="Data coverage summary">
        <span><b>9,282</b> ridership days</span>
        <span><b>136,888</b> scheduled stop events</span>
        <span><b>55</b> live predictions captured</span>
        <span><b>0</b> failed station requests</span>
      </section>

      <section className="pulseSection" id="pulse">
        <div className="sectionIntro">
          <p className="eyebrow">NETWORK PULSE / ONE CONTROLLED SNAPSHOT</p>
          <h2>A first look,<br />not a final verdict.</h2>
          <p>Expected wait is calculated from CTA’s prediction timestamp to its predicted arrival. Longer waits here are observations, not proof of chronic delay.</p>
        </div>

        <div className="routeBoard">
          <div className="boardHead">
            <span>LINE</span><span>ARRIVALS</span><span>STATIONS</span><span>AVG EXPECTED WAIT</span><span>FEED TYPE</span>
          </div>
          {routes.map((route) => (
            <button className="boardRow" key={route.code} onClick={() => setActiveRoute(route.code)} aria-label={`Show ${route.name} stations`}>
              <span className="lineName"><i style={{ background: route.color }} />{route.name}</span>
              <span>{String(route.predictions).padStart(2, "0")}</span>
              <span>{String(route.stations).padStart(2, "0")}</span>
              <span className="waitCell"><b style={{ width: `${Math.min(100, route.wait * 5)}%`, background: route.color }} />{route.wait.toFixed(1)} min</span>
              <span>{route.scheduled ? `${route.scheduled.toFixed(0)}% scheduled` : "live only"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stationsSection" id="stations">
        <div className="stationHeader">
          <div><p className="eyebrow">STATION DISPATCH</p><h2>Where the wait stretched.</h2></div>
          <div className="filterGroup" aria-label="Filter station observations by line">
            {["All", "Red", "G", "Org", "Pink"].map((code) => (
              <button key={code} className={activeRoute === code ? "active" : ""} onClick={() => setActiveRoute(code)}>
                {code === "All" ? "All observed" : routeByCode[code].name}
              </button>
            ))}
          </div>
        </div>
        <div className="stationGrid">
          {visibleStations.length ? visibleStations.map((row, index) => (
            <article className="stationCard" key={`${row.route}-${row.station}`}>
              <div className="stationIndex">{String(index + 1).padStart(2, "0")}</div>
              <span className="routePill" style={{ background: routeByCode[row.route].color }}>{routeByCode[row.route].name}</span>
              <h3>{row.station}</h3>
              <div className="stationMetric"><strong>{row.wait.toFixed(1)}</strong><span>min<br />expected wait</span></div>
              <p>{row.arrivals} upcoming arrivals in the station’s latest collected snapshot.</p>
            </article>
          )) : <p className="emptyState">This route was observed at Clark/Lake only in the initial sample.</p>}
        </div>
      </section>

      <section className="methodSection" id="method">
        <div className="methodQuote">
          <span className="quoteMark">“</span>
          <blockquote>Reliability is a story over time—not a score from one snapshot.</blockquote>
          <p>That sentence is a product rule. This dashboard refuses to turn a thin sample into a dramatic claim.</p>
        </div>
        <div className="pipeline">
          <p className="eyebrow">THE DATA JOURNEY</p>
          {[
            ["01", "Collect", "Official ridership, GTFS schedules, and Train Tracker predictions."],
            ["02", "Validate", "Schema checks, reconciled totals, timestamps, and relationship tests."],
            ["03", "Model", "Route, station, schedule, and timestamped prediction tables in SQL."],
            ["04", "Explain", "Metrics labeled by source and limitations shown beside the result."],
          ].map(([number, title, copy]) => (
            <div className="pipelineStep" key={number}><span>{number}</span><b>{title}</b><p>{copy}</p></div>
          ))}
        </div>
      </section>

      <section className="buildLog">
        <p className="eyebrow">FROM THE BUILD LOG</p>
        <div className="logGrid">
          <article><time>15:28:59</time><b>The first signal</b><p>Clark/Lake returned a valid prediction. The timestamp format differed from CTA’s older documentation, so the parser learned both.</p></article>
          <article><time>15:37:10</time><b>Ten stations, zero failures</b><p>A bounded collection run captured 50 predictions and wrote an audit record for every request.</p></article>
          <article><time>NEXT</time><b>Let time accumulate</b><p>Recurring snapshots will turn this point-in-time view into a defensible reliability study.</p></article>
        </div>
      </section>

      <footer>
        <div><strong>Signal / Chicago</strong><p>Designed and engineered by Akash Chenchugan.</p></div>
        <p>Independent educational project. Not affiliated with or endorsed by the Chicago Transit Authority.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
