/**
 * Capa de API: TMDB, proxy de stream y perfiles (backend o directo).
 */
import { RV_CONFIG } from './config.js';
const C = window.RV_CONFIG || {};

function tmdbPath(path, query = '') {
  const q = query ? (query.startsWith('?') ? query : '?' + query) : '';
  if (C.USE_BACKEND) return `/api/tmdb/${path}${q}`;
  return `https://api.themoviedb.org/3/${path}?api_key=${C.TMDB_API_KEY}${query ? '&' + query.replace(/^\?/, '') : ''}`;
}

async function getTmdb(path, query = '') {
  const url = tmdbPath(path, query);
  const r = await fetch(url);
  if (!r.ok) throw new Error('TMDB request failed');
  return r.json();
}

async function getProxyStream(targetUrl) {
  if (C.USE_BACKEND) {
    const r = await fetch('/api/proxy?url=' + encodeURIComponent(targetUrl));
    if (!r.ok) throw new Error('Proxy failed');
    return r.text();
  }
  const r = await fetch(C.WORKER_URL + '?url=' + encodeURIComponent(targetUrl));
  if (!r.ok) throw new Error('Proxy failed');
  return r.text();
}

async function profilesSave(body) {
  const url = C.USE_BACKEND ? '/api/profiles/save' : C.WORKER_URL + 'api/save';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Save failed');
  return r;
}

async function profilesLoad(id) {
  const url = C.USE_BACKEND ? '/api/profiles/load?id=' + encodeURIComponent(id) : C.WORKER_URL + 'api/load?id=' + encodeURIComponent(id);
  const r = await fetch(url);
  if (!r.ok) throw new Error('Load failed');
  return r.json();
}

async function profilesLoadAll() {
  const url = C.USE_BACKEND ? '/api/profiles/load-all' : C.WORKER_URL + 'api/load-all';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!r.ok) throw new Error('Load all failed');
    const data = await r.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.profiles)) return data.profiles;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function profilesDelete(id) {
  const url = C.USE_BACKEND ? '/api/profiles/delete' : C.WORKER_URL + 'api/delete';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) throw new Error('Delete failed');
  return r;
}

async function getRecommendations(items, excludeIds = []) {
  if (!items || items.length === 0) return [];
  if (C.USE_BACKEND) {
    const r = await fetch('/api/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, excludeIds }),
    });
    if (!r.ok) return [];
    return r.json();
  }
  const excludeSet = new Set(excludeIds.map(String));
  const seen = new Set();
  const results = [];
  const maxSeeds = 6;
  for (const { id, type } of items.slice(0, maxSeeds)) {
    if (!id || !type) continue;
    try {
      const path = type === 'movie' ? `movie/${id}/similar` : `tv/${id}/similar`;
      const data = await getTmdb(path);
      const list = data.results || [];
      for (const m of list) {
        const mid = String(m.id);
        if (seen.has(mid) || excludeSet.has(mid)) continue;
        seen.add(mid);
        results.push({ ...m, media_type: type });
        if (results.length >= 20) break;
      }
      if (results.length >= 20) break;
    } catch (_) {}
  }
  return results;
}

export { getTmdb, getProxyStream, profilesSave, profilesLoad, profilesLoadAll, profilesDelete, getRecommendations };
