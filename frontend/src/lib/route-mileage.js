/**
 * Route mileage engine.
 *
 * Purpose: given a trip's ordered stops (city/state/location), estimate
 * the *real-world* road miles using OpenStreetMap data. The driver is
 * NOT a navigation user — they only ever see the resulting numbers
 * (Real Route Miles · Company Pay Miles · Difference). This module
 * does NOT render any map UI.
 *
 * Pipeline:
 *   1. Build a list of {label, lat, lon} waypoints from the trip rows.
 *      Each row contributes "{location_name?}, {city}, {state}" — we
 *      forward-geocode that string with Nominatim (OSM).
 *   2. Feed the resulting coordinate list to the OSRM public routing
 *      service. OSRM returns the meters of the optimal driving route.
 *      We convert to miles.
 *   3. Cache geocodes by query and routes by waypoint signature in
 *      localStorage so repeat trips don't hit the public services.
 *
 * Persistence (per spec — only a summary, not GPS logs):
 *   • route_miles                : computed real road miles
 *   • company_pay_miles          : driver-entered pay miles
 *   • mileage_diff               : route_miles − company_pay_miles
 *   • leg_miles[]                : stop-to-stop distances
 *   • route_summary              : { computedAt, waypoints[] }
 *
 * IMPORTANT: Nominatim's usage policy requires a meaningful
 * User-Agent and *low* request volume. We respect both: a Trip
 * Monitor User-Agent is sent automatically (browsers add origin),
 * results are cached, and consecutive identical stops are
 * deduplicated before geocoding.
 *
 * If Nominatim or OSRM are unreachable (offline), we degrade
 * gracefully: the engine throws `RouteEngineError` and the UI shows
 * a friendly retry-later message.
 */

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OSRM_BASE      = "https://router.project-osrm.org";
const GEOCODE_KEY    = "tm_geocode_cache_v1";
const ROUTE_KEY      = "tm_route_cache_v1";
const RESULTS_KEY    = "tm_route_mileage_v1"; // by session_id
const CACHE_TTL_MS   = 1000 * 60 * 60 * 24 * 30; // 30 days

export class RouteEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RouteEngineError";
    this.code = code; // "no-stops" | "geocode-failed" | "route-failed" | "network"
  }
}

/* ───────────────────────── Caches ───────────────────────── */

function loadCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}
function saveCache(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch { /* quota */ }
}
function fresh(entry) {
  return entry && (Date.now() - (entry.at || 0) < CACHE_TTL_MS);
}

/* ───────────────────────── Inputs ───────────────────────── */

/**
 * Build geocode-ready stop strings from a trip session's rows.
 * Skips empty rows. Consecutive duplicates are collapsed (a driver may
 * sit at the same location across multiple seq rows).
 */
export function buildWaypointsFromSession(session) {
  if (!session?.rows) return [];
  const stops = [];
  for (const r of session.rows) {
    const parts = [
      r.location_name,
      r.stop_city && r.stop_state ? `${r.stop_city}, ${r.stop_state}` : null,
    ].filter(Boolean);
    if (parts.length === 0) continue;
    const query = parts.join(" · ");
    if (stops.length > 0 && stops[stops.length - 1].query === query) continue;
    stops.push({ seq: r.seq, query, label: parts.join(", ") });
  }
  return stops;
}

/* ───────────────────────── Geocoding ───────────────────────── */

async function geocodeOne(query) {
  const cache = loadCache(GEOCODE_KEY);
  const hit = cache[query];
  if (fresh(hit) && hit.lat != null) return hit;

  const url = `${NOMINATIM_BASE}/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`;
  let data;
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new RouteEngineError("geocode-failed", `Nominatim ${r.status}`);
    data = await r.json();
  } catch (e) {
    if (e instanceof RouteEngineError) throw e;
    throw new RouteEngineError("network", "Unable to reach geocoder");
  }
  if (!Array.isArray(data) || data.length === 0) {
    cache[query] = { at: Date.now(), notFound: true };
    saveCache(GEOCODE_KEY, cache);
    throw new RouteEngineError("geocode-failed", `No match for "${query}"`);
  }
  const top = data[0];
  const out = {
    at: Date.now(),
    lat: parseFloat(top.lat),
    lon: parseFloat(top.lon),
    display: top.display_name,
  };
  cache[query] = out;
  saveCache(GEOCODE_KEY, cache);
  return out;
}

async function geocodeAll(stops) {
  // Throttle Nominatim: serial with a tiny pause between misses.
  const out = [];
  for (const s of stops) {
    const cache = loadCache(GEOCODE_KEY);
    const hit = cache[s.query];
    if (fresh(hit) && hit.lat != null) {
      out.push({ ...s, ...hit });
      continue;
    }
    const g = await geocodeOne(s.query);
    out.push({ ...s, ...g });
    await sleep(200); // be polite to public Nominatim
  }
  return out;
}

/* ───────────────────────── Routing ───────────────────────── */

function routeKey(geo) {
  return geo.map((g) => `${g.lat.toFixed(4)},${g.lon.toFixed(4)}`).join("|");
}

async function routeBetween(geo) {
  if (geo.length < 2) {
    throw new RouteEngineError("no-stops", "Need at least two valid stops");
  }
  const cache = loadCache(ROUTE_KEY);
  const key = routeKey(geo);
  if (fresh(cache[key])) return cache[key];

  const coords = geo.map((g) => `${g.lon},${g.lat}`).join(";");
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=false&alternatives=false&steps=false&annotations=distance`;

  let data;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new RouteEngineError("route-failed", `OSRM ${r.status}`);
    data = await r.json();
  } catch (e) {
    if (e instanceof RouteEngineError) throw e;
    throw new RouteEngineError("network", "Unable to reach routing service");
  }
  if (data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new RouteEngineError("route-failed", "No route found between stops");
  }
  const route = data.routes[0];
  const totalMeters = route.distance || 0;
  const legs = (route.legs || []).map((l) => l.distance || 0);
  const result = {
    at: Date.now(),
    meters: totalMeters,
    legMeters: legs,
  };
  cache[key] = result;
  saveCache(ROUTE_KEY, cache);
  return result;
}

/* ───────────────────────── Public API ───────────────────────── */

const METERS_PER_MILE = 1609.344;

/**
 * Compute real road miles + leg miles for a given session.
 * Returns null waypoints/legs entries for stops that failed to geocode
 * so the caller can show a precise diagnostic.
 */
export async function computeRouteMileage(session) {
  const stops = buildWaypointsFromSession(session);
  if (stops.length < 2) {
    throw new RouteEngineError("no-stops", "Add at least two stops with location & state to calculate.");
  }
  const geo = await geocodeAll(stops);
  const route = await routeBetween(geo);

  const miles = +(route.meters / METERS_PER_MILE).toFixed(1);
  const legMiles = route.legMeters.map((m) => +(m / METERS_PER_MILE).toFixed(1));
  return {
    routeMiles: miles,
    legMiles,
    waypoints: geo.map((g, i) => ({
      seq: stops[i].seq,
      label: stops[i].label,
      lat: g.lat,
      lon: g.lon,
    })),
    computedAt: Date.now(),
  };
}

/* ───────────────────────── Persistence (client-side) ───────────────────────── */
/* Per spec: only the summary, not detailed GPS logs. */

export function loadMileageResult(sessionId) {
  if (!sessionId) return null;
  const cache = loadCache(RESULTS_KEY);
  return cache[sessionId] || null;
}
export function saveMileageResult(sessionId, result) {
  if (!sessionId) return;
  const cache = loadCache(RESULTS_KEY);
  cache[sessionId] = result;
  saveCache(RESULTS_KEY, cache);
}
export function setCompanyPayMiles(sessionId, payMiles) {
  if (!sessionId) return null;
  const cache = loadCache(RESULTS_KEY);
  const cur = cache[sessionId] || {};
  cur.companyPayMiles = Number.isFinite(+payMiles) ? +payMiles : null;
  cur.updatedAt = Date.now();
  cache[sessionId] = cur;
  saveCache(RESULTS_KEY, cache);
  return cur;
}
export function diff(routeMiles, payMiles) {
  if (!Number.isFinite(routeMiles) || !Number.isFinite(payMiles)) return null;
  return +(routeMiles - payMiles).toFixed(1);
}
export function clearMileageResult(sessionId) {
  if (!sessionId) return;
  const cache = loadCache(RESULTS_KEY);
  delete cache[sessionId];
  saveCache(RESULTS_KEY, cache);
}

/* ───────────────────────── helpers ───────────────────────── */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
