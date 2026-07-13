import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { STATIONS, type Station } from "../_shared/stations.ts";

const CTA_URL = "https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx";
const MAX_RESULTS = 5;
const CONCURRENCY = 4;

type CtaEta = {
  staId: string;
  stpId: string;
  staNm: string;
  stpDe: string;
  rn: string;
  rt: string;
  destNm: string;
  prdt: string;
  arrT: string;
  isApp: string;
  isSch: string;
  isDly: string;
  lat?: string;
  lon?: string;
  heading?: string;
};

type CtaRoot = {
  tmst: string;
  errCd: string;
  errNm?: string;
  eta?: CtaEta[];
};

type PredictionInput = {
  snapshot_at: string;
  sta_id: string;
  stp_id: string;
  sta_nm: string;
  stp_de: string;
  rn: string;
  rt: string;
  dest_nm: string;
  prdt: string;
  arr_t: string;
  is_app: string;
  is_sch: string;
  is_dly: string;
  lat?: string;
  lon?: string;
  heading?: string;
};
type CollectionError = { station_id: number; error_message: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

function sanitizedError(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "CTA request timed out";
  if (error instanceof Error) return error.message.slice(0, 240);
  return "Unknown CTA collection error";
}

async function fetchStation(station: Station, apiKey: string): Promise<PredictionInput[]> {
  const url = new URL(CTA_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("mapid", String(station.stationId));
  url.searchParams.set("max", String(MAX_RESULTS));
  url.searchParams.set("outputType", "JSON");

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "signal-chicago-observatory/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(sanitizedError(error));
  }
  if (!response.ok) throw new Error(`CTA request failed with status ${response.status}`);

  const payload = (await response.json()) as { ctatt?: CtaRoot };
  const root = payload.ctatt;
  if (!root) throw new Error("CTA returned an unexpected response structure");
  if (String(root.errCd) !== "0") {
    throw new Error(`CTA error ${root.errCd}: ${(root.errNm || "unknown error").slice(0, 160)}`);
  }

  return (root.eta ?? []).map((eta) => ({
    snapshot_at: root.tmst,
    sta_id: eta.staId,
    stp_id: eta.stpId,
    sta_nm: eta.staNm,
    stp_de: eta.stpDe,
    rn: eta.rn,
    rt: eta.rt,
    dest_nm: eta.destNm,
    prdt: eta.prdt,
    arr_t: eta.arrT,
    is_app: eta.isApp,
    is_sch: eta.isSch,
    is_dly: eta.isDly,
    lat: eta.lat,
    lon: eta.lon,
    heading: eta.heading,
  }));
}

async function collectStations(apiKey: string): Promise<{
  predictions: PredictionInput[];
  errors: CollectionError[];
  succeeded: number;
}> {
  const predictions: PredictionInput[] = [];
  const errors: CollectionError[] = [];
  let succeeded = 0;

  for (let offset = 0; offset < STATIONS.length; offset += CONCURRENCY) {
    const batch = STATIONS.slice(offset, offset + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((station) => fetchStation(station, apiKey)));
    results.forEach((result, index) => {
      const station = batch[index];
      if (result.status === "fulfilled") {
        succeeded += 1;
        predictions.push(...result.value);
      } else {
        errors.push({ station_id: station.stationId, error_message: sanitizedError(result.reason) });
      }
    });
  }

  return { predictions, errors, succeeded };
}

async function persistSnapshot(input: {
  runId: string;
  startedAt: string;
  completedAt: string;
  predictions: PredictionInput[];
  errors: CollectionError[];
  succeeded: number;
}): Promise<unknown> {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_cta_snapshot`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_run_id: input.runId,
      p_started_at: input.startedAt,
      p_completed_at: input.completedAt,
      p_stations_requested: STATIONS.length,
      p_stations_succeeded: input.succeeded,
      p_stations_failed: input.errors.length,
      p_predictions: input.predictions,
      p_errors: input.errors,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Snapshot persistence failed (${response.status}): ${detail}`);
  }
  return response.json();
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    return json({ service: "signal-chicago-collector", status: "ready", stations: STATIONS.length });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const configuredSecret = requiredEnv("COLLECTOR_SECRET");
  const providedSecret = request.headers.get("x-collector-secret") ?? "";
  if (!safeEqual(providedSecret, configuredSecret)) return json({ error: "Unauthorized" }, 401);

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  try {
    const apiKey = requiredEnv("CTA_TRAIN_API_KEY");
    const collection = await collectStations(apiKey);
    const completedAt = new Date().toISOString();
    const result = await persistSnapshot({ runId, startedAt, completedAt, ...collection });
    return json({ run_id: runId, ...result });
  } catch (error) {
    console.error("Collector run failed", sanitizedError(error));
    return json({ run_id: runId, error: sanitizedError(error) }, 500);
  }
});
