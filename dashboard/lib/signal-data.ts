export type RouteMetric = {
  code: string;
  predictions: number;
  stations: number;
  wait: number;
  scheduled: number;
  delayed: number;
  approaching: number;
  latest_snapshot_at: string | null;
  revision: number | null;
  p90_revision: number | null;
  gap: number | null;
  max_gap: number | null;
  scheduled_headway?: number | null;
  service_gap_index?: number | null;
};

export type StationMetric = {
  route: string;
  station_id: number;
  station: string;
  arrivals: number;
  wait: number;
  delayed: number;
  latest_snapshot_at: string | null;
};

export type DashboardPayload = {
  generated_at: string | null;
  freshness: {
    latest_prediction_at: string | null;
    age_minutes: number | null;
    status: "fresh" | "delayed" | "stale" | "missing";
  };
  coverage: {
    predictions_total: number;
    runs_total: number;
    station_failures_total: number;
    runs_24h: number;
    cohort_stations: number;
    observed_routes: number;
  };
  routes: RouteMetric[];
  stations: StationMetric[];
};

export const ROUTE_META: Record<string, { name: string; color: string; order: number }> = {
  Red: { name: "Red Line", color: "#c60c30", order: 1 },
  Blue: { name: "Blue Line", color: "#00a1de", order: 2 },
  Brn: { name: "Brown Line", color: "#62361b", order: 3 },
  G: { name: "Green Line", color: "#009b3a", order: 4 },
  Org: { name: "Orange Line", color: "#f9461c", order: 5 },
  P: { name: "Purple Line", color: "#522398", order: 6 },
  Pink: { name: "Pink Line", color: "#e27ea6", order: 7 },
  Y: { name: "Yellow Line", color: "#f4cf00", order: 8 },
};

const fallbackRoutes: RouteMetric[] = [
  { code: "Red", predictions: 15, stations: 3, wait: 10.54, scheduled: 13.33, delayed: 0, approaching: 6.67, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "Blue", predictions: 1, stations: 1, wait: 1.73, scheduled: 0, delayed: 0, approaching: 0, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "Brn", predictions: 1, stations: 1, wait: 0.65, scheduled: 0, delayed: 0, approaching: 100, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "G", predictions: 22, stations: 5, wait: 12.79, scheduled: 9.09, delayed: 0, approaching: 4.55, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "Org", predictions: 6, stations: 2, wait: 16.04, scheduled: 16.67, delayed: 0, approaching: 0, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "P", predictions: 0, stations: 0, wait: 0, scheduled: 0, delayed: 0, approaching: 0, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "Pink", predictions: 10, stations: 2, wait: 14.93, scheduled: 20, delayed: 0, approaching: 0, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
  { code: "Y", predictions: 0, stations: 0, wait: 0, scheduled: 0, delayed: 0, approaching: 0, latest_snapshot_at: null, revision: null, p90_revision: null, gap: null, max_gap: null },
];

export const FALLBACK_DASHBOARD: DashboardPayload = {
  generated_at: null,
  freshness: { latest_prediction_at: null, age_minutes: null, status: "missing" },
  coverage: {
    predictions_total: 114,
    runs_total: 2,
    station_failures_total: 0,
    runs_24h: 0,
    cohort_stations: 12,
    observed_routes: 8,
  },
  routes: fallbackRoutes,
  stations: [
    { route: "G", station_id: 41120, station: "35th-Bronzeville-IIT", arrivals: 5, wait: 12.39, delayed: 0, latest_snapshot_at: null },
    { route: "Org", station_id: 40120, station: "35th/Archer", arrivals: 5, wait: 18.91, delayed: 0, latest_snapshot_at: null },
    { route: "Pink", station_id: 40580, station: "54th/Cermak", arrivals: 5, wait: 18.43, delayed: 0, latest_snapshot_at: null },
    { route: "Red", station_id: 40450, station: "95th/Dan Ryan", arrivals: 5, wait: 12.71, delayed: 0, latest_snapshot_at: null },
    { route: "Blue", station_id: 40890, station: "O'Hare", arrivals: 1, wait: 1.73, delayed: 0, latest_snapshot_at: null },
    { route: "Brn", station_id: 41290, station: "Kimball", arrivals: 1, wait: 0.65, delayed: 0, latest_snapshot_at: null },
  ],
};

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePayload(value: unknown): DashboardPayload {
  const payload = value as Partial<DashboardPayload>;
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  const stations = Array.isArray(payload.stations) ? payload.stations : [];
  const normalizedRoutes = routes.map((route) => ({
    ...route,
    predictions: numberValue(route.predictions),
    stations: numberValue(route.stations),
    wait: numberValue(route.wait),
    scheduled: numberValue(route.scheduled),
    delayed: numberValue(route.delayed),
    approaching: numberValue(route.approaching),
    revision: route.revision == null ? null : numberValue(route.revision),
    p90_revision: route.p90_revision == null ? null : numberValue(route.p90_revision),
    gap: route.gap == null ? null : numberValue(route.gap),
    max_gap: route.max_gap == null ? null : numberValue(route.max_gap),
    scheduled_headway: route.scheduled_headway == null ? null : numberValue(route.scheduled_headway),
    service_gap_index: route.service_gap_index == null ? null : numberValue(route.service_gap_index),
  }));
  const routeByCode = new Map(normalizedRoutes.map((route) => [route.code, route]));
  return {
    generated_at: payload.generated_at ?? null,
    freshness: {
      latest_prediction_at: payload.freshness?.latest_prediction_at ?? null,
      age_minutes: payload.freshness?.age_minutes == null ? null : numberValue(payload.freshness.age_minutes),
      status: payload.freshness?.status ?? "missing",
    },
    coverage: {
      predictions_total: numberValue(payload.coverage?.predictions_total),
      runs_total: numberValue(payload.coverage?.runs_total),
      station_failures_total: numberValue(payload.coverage?.station_failures_total),
      runs_24h: numberValue(payload.coverage?.runs_24h),
      cohort_stations: numberValue(payload.coverage?.cohort_stations, 12),
      observed_routes: numberValue(payload.coverage?.observed_routes),
    },
    routes: Object.keys(ROUTE_META).map((code) => routeByCode.get(code) ?? {
      code,
      predictions: 0,
      stations: 0,
      wait: 0,
      scheduled: 0,
      delayed: 0,
      approaching: 0,
      latest_snapshot_at: null,
      revision: null,
      p90_revision: null,
      gap: null,
      max_gap: null,
      scheduled_headway: null,
      service_gap_index: null,
    }).sort((a, b) => ROUTE_META[a.code].order - ROUTE_META[b.code].order),
    stations: stations.map((station) => ({
      ...station,
      station_id: numberValue(station.station_id),
      arrivals: numberValue(station.arrivals),
      wait: numberValue(station.wait),
      delayed: numberValue(station.delayed),
    })),
  };
}

export function hasLiveDataConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function fetchLiveDashboard(signal?: AbortSignal): Promise<DashboardPayload> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Live data environment variables are not configured");

  const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
  if (key.split(".").length === 3) headers.authorization = `Bearer ${key}`;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/get_public_dashboard`, {
    method: "POST",
    headers,
    body: "{}",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(`Live data request failed with status ${response.status}`);
  return normalizePayload(await response.json());
}

export function routeMeta(code: string): { name: string; color: string; order: number } {
  return ROUTE_META[code] ?? { name: `${code} Line`, color: "#55514a", order: 99 };
}

export function chicagoTimestamp(value: string | null): string {
  if (!value) return "DEVELOPMENT SNAPSHOT";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value)).toUpperCase();
}
