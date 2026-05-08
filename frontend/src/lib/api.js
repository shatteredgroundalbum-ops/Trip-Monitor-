/**
 * Offline-first API shim — replaces axios-based backend calls
 * with local IndexedDB operations via local-db.js.
 *
 * All api.get/post/put/delete calls throughout the app continue to
 * work unchanged, but now resolve against local data store instead
 * of hitting a server. Returns { data: ... } to match axios envelope.
 */

import * as db from './local-db';

function wrap(val) {
  return { data: val };
}

const api = {
  async get(url) {
    if (url === '/auth/me') {
      const { getDeviceId } = await import('./local-auth');
      const deviceId = await getDeviceId();
      return wrap(await db.authMe(deviceId));
    }
    if (url === '/profile') return wrap(await db.getProfile());
    if (url === '/trip-sessions') return wrap(await db.listSessions());
    if (url === '/trip-sessions/active') return wrap(await db.getActiveSession());

    const recapMatch = url.match(/^\/trip-sessions\/([^/]+)\/recap$/);
    if (recapMatch) return wrap(await db.getTripRecap(recapMatch[1]));

    const sessionMatch = url.match(/^\/trip-sessions\/([^/]+)$/);
    if (sessionMatch) return wrap(await db.getSession(sessionMatch[1]));

    if (url === '/locations') return wrap(await db.listLocations());
    if (url === '/trailers') return wrap(await db.listTrailers());
    if (url === '/cities') return wrap(await db.listCities());
    if (url === '/stats') return wrap(await db.getStats());
    if (url === '/stats/week') return wrap(await db.getWeeklyStats());
    if (url === '/achievements') return wrap(await db.getAchievements());

    console.warn('[api shim] Unhandled GET:', url);
    return wrap(null);
  },

  async post(url, payload) {
    if (url === '/auth/local') return wrap(await db.authLocal(payload));
    if (url === '/auth/logout') { await db.authLogout(); return wrap({}); }
    if (url === '/auth/role') return wrap({});
    if (url === '/profile') return wrap(await db.saveProfile(payload));
    if (url === '/trip-sessions') return wrap(await db.createSession(payload));

    const finishMatch = url.match(/^\/trip-sessions\/([^/]+)\/finish$/);
    if (finishMatch) return wrap(await db.finishSession(finishMatch[1]));

    const reopenMatch = url.match(/^\/trip-sessions\/([^/]+)\/reopen$/);
    if (reopenMatch) return wrap(await db.reopenSession(reopenMatch[1]));

    if (url === '/locations/bump') { await db.bumpLocation(payload && payload.name); return wrap({}); }
    if (url === '/trailers/bump') { await db.bumpTrailer(payload && payload.number, payload && payload.type); return wrap({}); }
    if (url === '/cities/bump') { await db.bumpCity(payload && payload.city, payload && payload.state); return wrap({}); }
    if (url === '/email/send-trip-sheet') return wrap({ sent: false, reason: 'offline' });

    console.warn('[api shim] Unhandled POST:', url);
    return wrap(null);
  },

  async put(url, payload) {
    const sessionMatch = url.match(/^\/trip-sessions\/([^/]+)$/);
    if (sessionMatch) return wrap(await db.updateSession(sessionMatch[1], payload));

    console.warn('[api shim] Unhandled PUT:', url);
    return wrap(null);
  },

  async delete(url) {
    const sessionMatch = url.match(/^\/trip-sessions\/([^/]+)$/);
    if (sessionMatch) { await db.deleteSession(sessionMatch[1]); return wrap({}); }

    console.warn('[api shim] Unhandled DELETE:', url);
    return wrap(null);
  },
};

// Seed data on first load
db.seedIfEmpty().catch(() => {});

export { api };
export const API = '/api';
export const BACKEND_URL = '';