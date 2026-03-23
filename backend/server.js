/**
 * Backend RV Plus - Express server
 * Proxy a TMDB, proxy de streams (Worker) y API de perfiles.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'OPTIONS']
}));
const { extractDecodedStreamUrl, sanitizeEmbedHtml } = require('./streamDecode.js');

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '31b33cade35075a7a011c88568bb1070';
const WORKER_PROXY_URL = (process.env.WORKER_PROXY_URL || 'https://rv-plus.rishivira4321.workers.dev/').replace(/\/?$/, '/');
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '05c437e42e29cced67609faebf5051aee251d';

function workerHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (CLOUDFLARE_API_TOKEN) h['Authorization'] = 'Bearer ' + CLOUDFLARE_API_TOKEN;
  return h;
}

app.use(cors());
app.use(express.json());

// Servir frontend estático
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// --- Proxy TMDB (opcional: oculta API key en el cliente) ---
app.get(/^\/api\/tmdb\/?(.*)/, async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(503).json({ error: 'TMDB_API_KEY not configured' });
  }
  const rawPath = req.path.replace(/^\/api\/tmdb\/?/, '') || '';
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  const fullUrl = `https://api.themoviedb.org/3/${rawPath}?${query ? query + '&' : ''}api_key=${TMDB_API_KEY}`;
  try {
    const r = await fetch(fullUrl);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'TMDB proxy error' });
  }
});

// --- Proxy de stream (Worker): extrae URL directa para evitar anuncios/redirects ---
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');
  try {
    const opts = { headers: {} };
    if (CLOUDFLARE_API_TOKEN) opts.headers['Authorization'] = 'Bearer ' + CLOUDFLARE_API_TOKEN;
    const r = await fetch(WORKER_PROXY_URL + '?url=' + encodeURIComponent(targetUrl), opts);
    let html = await r.text();
    const directUrl = extractDecodedStreamUrl(html);
    if (directUrl) {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head><body style="margin:0;overflow:hidden;"><iframe src="${directUrl.replace(/"/g, '&quot;')}" style="position:fixed;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe></body></html>`;
    } else {
      html = sanitizeEmbedHtml(html);
    }
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    res.status(502).send('Proxy error');
  }
});

// --- Perfiles: reenvío al Worker (D1) ---
app.post('/api/profiles/save', async (req, res) => {
  try {
    const r = await fetch(WORKER_PROXY_URL + 'api/save', {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify(req.body),
    });
    const text = await r.text();
    res.status(r.status).send(text || undefined);
  } catch (e) {
    res.status(502).json({ error: 'Profile save failed' });
  }
});

app.get('/api/profiles/load', async (req, res) => {
  try {
    const r = await fetch(WORKER_PROXY_URL + 'api/load?id=' + encodeURIComponent(req.query.id || ''), { headers: workerHeaders() });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Profile load failed' });
  }
});

app.get('/api/profiles/load-all', async (req, res) => {
  try {
    const r = await fetch(WORKER_PROXY_URL + 'api/load-all', { headers: workerHeaders() });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Load all failed' });
  }
});

app.post('/api/profiles/delete', async (req, res) => {
  try {
    const r = await fetch(WORKER_PROXY_URL + 'api/delete', {
      method: 'POST',
      headers: workerHeaders(),
      body: JSON.stringify(req.body),
    });
    res.status(r.status).send();
  } catch (e) {
    res.status(502).json({ error: 'Profile delete failed' });
  }
});

// --- Recomendaciones por usuario (similar a lo que ha visto/guardado) ---
app.post('/api/recommendations', async (req, res) => {
  if (!TMDB_API_KEY) return res.status(503).json({ error: 'TMDB_API_KEY not configured' });
  const { items = [], excludeIds = [] } = req.body || {};
  const excludeSet = new Set(excludeIds.map(String));
  const seen = new Set();
  const results = [];
  const maxSeeds = 6;
  const seeds = items.slice(0, maxSeeds);
  for (const { id, type } of seeds) {
    if (!id || !type) continue;
    try {
      const path = type === 'movie' ? `movie/${id}/similar` : `tv/${id}/similar`;
      const r = await fetch(`https://api.themoviedb.org/3/${path}?api_key=${TMDB_API_KEY}`);
      const data = await r.json();
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
  res.json(results);
});

// Ruta principal: enviar index del frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RV Plus backend running at http://localhost:${PORT}`);
  if (!TMDB_API_KEY) console.warn('TMDB_API_KEY not set: frontend will use its own config for TMDB.');
});
