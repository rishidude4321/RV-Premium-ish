/**
 * Backend RV Plus - Express server
 * Proxy a TMDB, proxy de streams (Worker) y API de perfiles.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const WORKER_PROXY_URL = (process.env.WORKER_PROXY_URL || 'https://rv-plus.rishivira4321.workers.dev/').replace(/\/?$/, '/');
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';

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

// --- Proxy de stream (Worker) ---
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url');
  try {
    const opts = { headers: {} };
    if (CLOUDFLARE_API_TOKEN) opts.headers['Authorization'] = 'Bearer ' + CLOUDFLARE_API_TOKEN;
    const r = await fetch(WORKER_PROXY_URL + '?url=' + encodeURIComponent(targetUrl), opts);
    const html = await r.text();
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

// Ruta principal: enviar index del frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RV Plus backend running at http://localhost:${PORT}`);
  if (!TMDB_API_KEY) console.warn('TMDB_API_KEY not set: frontend will use its own config for TMDB.');
});
