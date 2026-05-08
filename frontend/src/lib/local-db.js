/**
 * Local Data Store — replaces the FastAPI backend entirely.
 *
 * All data lives in IndexedDB via localforage. No network calls.
 * This module exposes the same logical operations the backend provided
 * (CRUD for sessions, profile, learning dictionaries, stats, achievements,
 * recap) but computed entirely client-side.
 *
 * Database: `tm-data` (separate from `tm-keychain`, `tm-auth`, `tm-storage`)
 * Collections:
 *   - sessions   — trip session documents
 *   - profile    — single driver profile document
 *   - locations  — { name, count }
 *   - trailers   — { number, type, count }
 *   - cities     — { city, state, count }
 */

import localforage from 'localforage';

// ─── Store instances ────────────────────────────────────────────────────────

const sessionsStore = localforage.createInstance({ name: 'tm-data', storeName: 'sessions' });
const profileStore = localforage.createInstance({ name: 'tm-data', storeName: 'profile' });
const locationsStore = localforage.createInstance({ name: 'tm-data', storeName: 'locations' });
const trailersStore = localforage.createInstance({ name: 'tm-data', storeName: 'trailers' });
const citiesStore = localforage.createInstance({ name: 'tm-data', storeName: 'cities' });

// ─── Helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function nowISO() {
  return new Date().toISOString();
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function authLocal({ device_id, role, display_username, driver_id }) {
  // In offline mode, "auth" is just confirming we know who the device is.
  // The real auth is handled by local-auth.js (PIN + master code).
  // We return a user object so the rest of the app works unchanged.
  return {
    user_id: device_id,
    email: '',
    name: display_username || '',
    role: role || null,
  };
}

export async function authMe(deviceId) {
  return {
    user_id: deviceId,
    email: '',
    name: '',
    role: null,
  };
}

export async function authLogout() {
  // No-op in offline mode; local-auth.js handles the actual lock.
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function getProfile() {
  const p = await profileStore.getItem('default');
  return p || null;
}

export async function saveProfile(profile) {
  const existing = await profileStore.getItem('default');
  const merged = { ...existing, ...profile, updated_at: nowISO() };
  await profileStore.setItem('default', merged);
  return merged;
}

// ─── Trip Sessions ──────────────────────────────────────────────────────────

export async function listSessions() {
  const items = [];
  await sessionsStore.iterate((v) => { items.push(v); });
  // Sort by created_at descending
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return items;
}

export async function getActiveSession() {
  const items = await listSessions();
  return items.find(s => s.status === 'active') || null;
}

export async function getSession(sessionId) {
  return await sessionsStore.getItem(sessionId) || null;
}

export async function createSession(payload) {
  const sessionId = `ts_${uuid()}`;
  const now = nowISO();
  const doc = {
    session_id: sessionId,
    status: 'active',
    created_at: now,
    updated_at: now,
    finished_at: null,
    ...payload,
  };
  await sessionsStore.setItem(sessionId, doc);
  return doc;
}

export async function updateSession(sessionId, payload) {
  const existing = await sessionsStore.getItem(sessionId);
  if (!existing) throw new Error('Session not found');
  const updated = { ...existing, ...payload, updated_at: nowISO() };
  await sessionsStore.setItem(sessionId, updated);
  return updated;
}

export async function finishSession(sessionId) {
  const existing = await sessionsStore.getItem(sessionId);
  if (!existing) throw new Error('Session not found');
  if (existing.status !== 'active') throw new Error('Session is not active');

  // Validate total_trip_miles
  const miles = existing.total_trip_miles || 0;
  if (!miles || miles <= 0) {
    const err = new Error('Total trip miles is required');
    err.status = 422;
    err.detail = 'Total trip miles must be a positive number before finishing';
    throw err;
  }

  const now = nowISO();
  const updated = {
    ...existing,
    status: 'finished',
    finished_at: now,
    updated_at: now,
  };
  await sessionsStore.setItem(sessionId, updated);
  return updated;
}

export async function reopenSession(sessionId) {
  const existing = await sessionsStore.getItem(sessionId);
  if (!existing) throw new Error('Session not found');

  // Abandon any other active session
  const all = await listSessions();
  for (const s of all) {
    if (s.status === 'active' && s.session_id !== sessionId) {
      await sessionsStore.setItem(s.session_id, {
        ...s,
        status: 'abandoned',
        updated_at: nowISO(),
      });
    }
  }

  const updated = {
    ...existing,
    status: 'active',
    finished_at: null,
    updated_at: nowISO(),
  };
  await sessionsStore.setItem(sessionId, updated);
  return updated;
}

export async function deleteSession(sessionId) {
  await sessionsStore.removeItem(sessionId);
}

// ─── Learning: Locations ────────────────────────────────────────────────────

export async function listLocations() {
  const items = [];
  await locationsStore.iterate((v) => { items.push(v); });
  items.sort((a, b) => (b.count || 0) - (a.count || 0));
  return items.slice(0, 500);
}

export async function bumpLocation(name) {
  if (!name) return;
  const key = name.toLowerCase().trim();
  const existing = await locationsStore.getItem(key);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    await locationsStore.setItem(key, existing);
  } else {
    await locationsStore.setItem(key, { name, count: 1 });
  }
}

// ─── Learning: Trailers ─────────────────────────────────────────────────────

export async function listTrailers() {
  const items = [];
  await trailersStore.iterate((v) => { items.push(v); });
  items.sort((a, b) => (b.count || 0) - (a.count || 0));
  return items.slice(0, 500);
}

export async function bumpTrailer(number, type) {
  if (!number) return;
  const key = number.toLowerCase().trim();
  const existing = await trailersStore.getItem(key);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    await trailersStore.setItem(key, existing);
  } else {
    await trailersStore.setItem(key, { number, type: type || null, count: 1 });
  }
}

// ─── Learning: Cities ───────────────────────────────────────────────────────

export async function listCities() {
  const items = [];
  await citiesStore.iterate((v) => { items.push(v); });
  items.sort((a, b) => (b.count || 0) - (a.count || 0));
  return items.slice(0, 500);
}

export async function bumpCity(city, state) {
  if (!city || !state) return;
  const key = `${city.toLowerCase().trim()}|${state.toLowerCase().trim()}`;
  const existing = await citiesStore.getItem(key);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    await citiesStore.setItem(key, existing);
  } else {
    await citiesStore.setItem(key, { city, state, count: 1 });
  }
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getStats() {
  const profile = await getProfile();
  const sessions = await listSessions();
  const finished = sessions.filter(s => s.status === 'finished');
  const active = sessions.find(s => s.status === 'active');

  const totalStops = finished.reduce((sum, s) => {
    return sum + (Array.isArray(s.rows) ? s.rows.filter(r => r.event_code || r.location_name || r.stop_city || r.trailer_number).length : 0);
  }, 0);

  const milesInApp = finished.reduce((sum, s) => sum + (s.total_trip_miles || 0), 0);
  const baselineMiles = profile?.lifetime_miles || 0;

  // Miles today
  const todayStr = new Date().toISOString().slice(0, 10);
  const milesToday = finished
    .filter(s => (s.finished_at || '').slice(0, 10) === todayStr)
    .reduce((sum, s) => sum + (s.total_trip_miles || 0), 0);

  const tripsTotal = finished.length;

  return {
    miles_today: milesToday,
    miles_in_app: milesInApp,
    miles_lifetime: baselineMiles + milesInApp,
    total_stops: totalStops,
    trips_total: tripsTotal,
    current_truck: profile?.truck_number || active?.truck_number || null,
    active_session_id: active?.session_id || null,
  };
}

// ─── Weekly Stats ───────────────────────────────────────────────────────────

export async function getWeeklyStats() {
  const profile = await getProfile();
  const sessions = await listSessions();
  const finished = sessions.filter(s => s.status === 'finished');

  const tz = profile?.time_zone || 'UTC';
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build 7 daily buckets oldest → newest
  const buckets = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const label = dayLabels[d.getDay()];
    const isToday = i === 0;
    buckets.push({ date: dateStr, label, is_today: isToday, miles: 0, trips: 0 });
  }

  for (const s of finished) {
    const finishedDate = (s.finished_at || '').slice(0, 10);
    const bucket = buckets.find(b => b.date === finishedDate);
    if (bucket) {
      bucket.miles += s.total_trip_miles || 0;
      bucket.trips += 1;
    }
  }

  const milesTotal7d = buckets.reduce((s, b) => s + b.miles, 0);
  const tripsTotal7d = buckets.reduce((s, b) => s + b.trips, 0);
  const milesMax = Math.max(...buckets.map(b => b.miles), 0);

  return {
    days: buckets,
    miles_total_7d: milesTotal7d,
    trips_total_7d: tripsTotal7d,
    miles_max: milesMax,
  };
}

// ─── Achievements ───────────────────────────────────────────────────────────

const MILESTONE_TIERS = [
  { label: '100K Miles', threshold: 100000 },
  { label: '250K Miles', threshold: 250000 },
  { label: '500K Miles', threshold: 500000 },
  { label: '1M Miles', threshold: 1000000 },
  { label: '2M Miles', threshold: 2000000 },
  { label: '3M Miles', threshold: 3000000 },
  { label: '5M Miles', threshold: 5000000 },
];

const SERVICE_TIERS = [
  { label: '1 Year', threshold: 1 },
  { label: '5 Years', threshold: 5 },
  { label: '10 Years', threshold: 10 },
  { label: '15 Years', threshold: 15 },
  { label: '20 Years', threshold: 20 },
  { label: '25 Years', threshold: 25 },
  { label: '30 Years', threshold: 30 },
];

const TRIP_TIERS = [
  { label: '10 Trips', threshold: 10 },
  { label: '25 Trips', threshold: 25 },
  { label: '50 Trips', threshold: 50 },
  { label: '100 Trips', threshold: 100 },
  { label: '250 Trips', threshold: 250 },
  { label: '500 Trips', threshold: 500 },
  { label: '1000 Trips', threshold: 1000 },
];

function milesLabel(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M Miles`;
  if (n >= 1000) return `${Math.round(n / 1000)}K Miles`;
  return `${n} Miles`;
}

export async function getAchievements() {
  const profile = await getProfile();
  const sessions = await listSessions();
  const finished = sessions.filter(s => s.status === 'finished');

  const lifetimeMiles = (profile?.lifetime_miles || 0) +
    finished.reduce((s, t) => s + (t.total_trip_miles || 0), 0);
  const yearsExp = profile?.years_experience || 0;
  const tripsCount = finished.length;

  const badges = [];

  // Mileage badges
  for (const tier of MILESTONE_TIERS) {
    badges.push({
      kind: 'mileage',
      label: tier.label,
      threshold: tier.threshold,
      progress: Math.min(lifetimeMiles, tier.threshold),
      earned: lifetimeMiles >= tier.threshold,
    });
  }

  // Service year badges
  for (const tier of SERVICE_TIERS) {
    badges.push({
      kind: 'service',
      label: tier.label,
      threshold: tier.threshold,
      progress: Math.min(yearsExp, tier.threshold),
      earned: yearsExp >= tier.threshold,
    });
  }

  // Trip count badges
  for (const tier of TRIP_TIERS) {
    badges.push({
      kind: 'trips',
      label: tier.label,
      threshold: tier.threshold,
      progress: Math.min(tripsCount, tier.threshold),
      earned: tripsCount >= tier.threshold,
    });
  }

  return { badges, summary: { lifetime_miles: lifetimeMiles, years_experience: yearsExp, trips_total: tripsCount } };
}

// ─── Trip Recap ─────────────────────────────────────────────────────────────

export async function getTripRecap(sessionId) {
  const session = await sessionsStore.getItem(sessionId);
  if (!session || session.status !== 'finished') {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }

  const profile = await getProfile();
  const sessions = await listSessions();
  const finished = sessions.filter(s => s.status === 'finished');
  const baselineMiles = profile?.lifetime_miles || 0;
  const milesInApp = finished.reduce((s, t) => s + (t.total_trip_miles || 0), 0);
  const lifetimeMiles = baselineMiles + milesInApp;
  const careerBefore = lifetimeMiles - (session.total_trip_miles || 0);

  // Miles today
  const todayStr = new Date().toISOString().slice(0, 10);
  const milesToday = finished
    .filter(s => (s.finished_at || '').slice(0, 10) === todayStr)
    .reduce((s, t) => s + (t.total_trip_miles || 0), 0);

  // Miles this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const milesWeek = finished
    .filter(s => new Date(s.finished_at) >= weekAgo)
    .reduce((s, t) => s + (t.total_trip_miles || 0), 0);

  // Next milestone
  const nextMilestone = MILESTONE_TIERS.find(t => lifetimeMiles < t.threshold);
  const milestoneInfo = nextMilestone ? {
    label: nextMilestone.label,
    threshold: nextMilestone.threshold,
    remaining: nextMilestone.threshold - lifetimeMiles,
    progress_pct: Math.round((lifetimeMiles / nextMilestone.threshold) * 100),
  } : null;

  // Compute new badges earned by THIS trip
  const prevBadges = (await _computeBadges(careerBefore, profile?.years_experience || 0, finished.length - 1));
  const currBadges = (await _computeBadges(lifetimeMiles, profile?.years_experience || 0, finished.length));
  const newBadgeLabels = currBadges.filter((b, i) => b.earned && !prevBadges[i].earned).map(b => b.label);

  return {
    trip_miles: session.total_trip_miles || 0,
    career_before: careerBefore,
    career_after: lifetimeMiles,
    miles_today: milesToday,
    miles_week: milesWeek,
    next_milestone: milestoneInfo,
    new_badges: newBadgeLabels,
    trips_total: finished.length,
    mileage_mode: session.mileage_mode_at_finish || profile?.mileage_mode || 'workflow',
  };
}

async function _computeBadges(lifetimeMiles, yearsExp, tripsCount) {
  const badges = [];
  for (const t of MILESTONE_TIERS) badges.push({ earned: lifetimeMiles >= t.threshold, label: t.label });
  for (const t of SERVICE_TIERS) badges.push({ earned: yearsExp >= t.threshold, label: t.label });
  for (const t of TRIP_TIERS) badges.push({ earned: tripsCount >= t.threshold, label: t.label });
  return badges;
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

export async function seedIfEmpty() {
  const existing = await listCities();
  if (existing.length > 0) return; // already seeded

  // Pre-seed major US cities
  const cities = [
    { city: 'Dallas', state: 'TX' }, { city: 'Houston', state: 'TX' },
    { city: 'San Antonio', state: 'TX' }, { city: 'Austin', state: 'TX' },
    { city: 'Fort Worth', state: 'TX' }, { city: 'El Paso', state: 'TX' },
    { city: 'Arlington', state: 'TX' }, { city: 'Corpus Christi', state: 'TX' },
    { city: 'Laredo', state: 'TX' }, { city: 'Lubbock', state: 'TX' },
    { city: 'Oklahoma City', state: 'OK' }, { city: 'Tulsa', state: 'OK' },
    { city: 'Norman', state: 'OK' }, { city: 'Broken Arrow', state: 'OK' },
    { city: 'Little Rock', state: 'AR' }, { city: 'Fort Smith', state: 'AR' },
    { city: 'Fayetteville', state: 'AR' }, { city: 'Springdale', state: 'AR' },
    { city: 'Memphis', state: 'TN' }, { city: 'Nashville', state: 'TN' },
    { city: 'Knoxville', state: 'TN' }, { city: 'Chattanooga', state: 'TN' },
    { city: 'Birmingham', state: 'AL' }, { city: 'Montgomery', state: 'AL' },
    { city: 'Huntsville', state: 'AL' }, { city: 'Mobile', state: 'AL' },
    { city: 'Jackson', state: 'MS' }, { city: 'Gulfport', state: 'MS' },
    { city: 'Baton Rouge', state: 'LA' }, { city: 'New Orleans', state: 'LA' },
    { city: 'Shreveport', state: 'LA' }, { city: 'Lafayette', state: 'LA' },
    { city: 'Atlanta', state: 'GA' }, { city: 'Savannah', state: 'GA' },
    { city: 'Jacksonville', state: 'FL' }, { city: 'Miami', state: 'FL' },
    { city: 'Tampa', state: 'FL' }, { city: 'Orlando', state: 'FL' },
    { city: 'Tallahassee', state: 'FL' }, { city: 'Pensacola', state: 'FL' },
    { city: 'Chicago', state: 'IL' }, { city: 'Springfield', state: 'IL' },
    { city: 'Indianapolis', state: 'IN' }, { city: 'Fort Wayne', state: 'IN' },
    { city: 'Columbus', state: 'OH' }, { city: 'Cleveland', state: 'OH' },
    { city: 'Cincinnati', state: 'OH' }, { city: 'Kansas City', state: 'MO' },
    { city: 'St. Louis', state: 'MO' }, { city: 'Springfield', state: 'MO' },
    { city: 'Denver', state: 'CO' }, { city: 'Colorado Springs', state: 'CO' },
    { city: 'Phoenix', state: 'AZ' }, { city: 'Tucson', state: 'AZ' },
    { city: 'Las Vegas', state: 'NV' }, { city: 'Reno', state: 'NV' },
    { city: 'Albuquerque', state: 'NM' }, { city: 'Santa Fe', state: 'NM' },
    { city: 'Los Angeles', state: 'CA' }, { city: 'San Diego', state: 'CA' },
    { city: 'San Francisco', state: 'CA' }, { city: 'Sacramento', state: 'CA' },
    { city: 'Fresno', state: 'CA' }, { city: 'Bakersfield', state: 'CA' },
    { city: 'Seattle', state: 'WA' }, { city: 'Tacoma', state: 'WA' },
    { city: 'Portland', state: 'OR' }, { city: 'Eugene', state: 'OR' },
    { city: 'Salt Lake City', state: 'UT' }, { city: 'Provo', state: 'UT' },
    { city: 'Boise', state: 'ID' }, { city: 'Billings', state: 'MT' },
    { city: 'Cheyenne', state: 'WY' }, { city: 'Sioux Falls', state: 'SD' },
    { city: 'Rapid City', state: 'SD' }, { city: 'Omaha', state: 'NE' },
    { city: 'Lincoln', state: 'NE' }, { city: 'Des Moines', state: 'IA' },
    { city: 'Cedar Rapids', state: 'IA' }, { city: 'Minneapolis', state: 'MN' },
    { city: 'St. Paul', state: 'MN' }, { city: 'Duluth', state: 'MN' },
    { city: 'Milwaukee', state: 'WI' }, { city: 'Madison', state: 'WI' },
    { city: 'Detroit', state: 'MI' }, { city: 'Grand Rapids', state: 'MI' },
    { city: 'Pittsburgh', state: 'PA' }, { city: 'Philadelphia', state: 'PA' },
    { city: 'Harrisburg', state: 'PA' }, { city: 'Erie', state: 'PA' },
    { city: 'New York', state: 'NY' }, { city: 'Buffalo', state: 'NY' },
    { city: 'Albany', state: 'NY' }, { city: 'Syracuse', state: 'NY' },
    { city: 'Boston', state: 'MA' }, { city: 'Worcester', state: 'MA' },
    { city: 'Hartford', state: 'CT' }, { city: 'New Haven', state: 'CT' },
    { city: 'Providence', state: 'RI' }, { city: 'Burlington', state: 'VT' },
    { city: 'Portland', state: 'ME' }, { city: 'Manchester', state: 'NH' },
    { city: 'Wilmington', state: 'DE' }, { city: 'Baltimore', state: 'MD' },
    { city: 'Richmond', state: 'VA' }, { city: 'Virginia Beach', state: 'VA' },
    { city: 'Norfolk', state: 'VA' }, { city: 'Raleigh', state: 'NC' },
    { city: 'Charlotte', state: 'NC' }, { city: 'Durham', state: 'NC' },
    { city: 'Greensboro', state: 'NC' }, { city: 'Charleston', state: 'SC' },
    { city: 'Columbia', state: 'SC' }, { city: 'Greenville', state: 'SC' },
  ];
  for (const c of cities) {
    const key = `${c.city.toLowerCase()}|${c.state.toLowerCase()}`;
    await citiesStore.setItem(key, { ...c, count: 0 });
  }

  // Pre-seed event codes
  // (These are used by TripSheetForm; stored as city entries with special prefix for lookup)
  // Actually, event codes are in constants.js — no need to store them here.

  // Pre-seed common trailer types
  const trailers = [
    { number: 'VT-', type: 'Van' },
    { number: 'RT-', type: 'Reefer' },
    { number: 'FT-', type: 'Flatbed' },
    { number: 'TT-', type: 'Tanker' },
    { number: 'DT-', type: 'Dry Van' },
  ];
  for (const t of trailers) {
    const key = t.number.toLowerCase();
    await trailersStore.setItem(key, { ...t, count: 0 });
  }
}