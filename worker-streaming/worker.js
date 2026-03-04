/**
 * Cloudflare Worker: proxy de streaming seguro
 * - Stream vía ReadableStream (sin buffer completo en memoria)
 * - Preserva Range / 206 Partial Content
 * - CORS correcto
 * - Opcional: strip de ruido (rt_ping.php, tracking) en HTML
 * - Opcional: prefetch de siguientes páginas y metadata en KV
 *
 * Uso: GET /?url=https://origin.example/page-1.html
 *      GET /?url=https://origin.example/video.mp4  (Range reenviado)
 */

const DEFAULT_ORIGIN = '*'; // En producción: lista de orígenes permitidos
const ALLOWED_ORIGIN_PATTERNS = []; // Ej: [/^https:\/\/yourfront\.com$/, /^https:\/\/localhost/];

// Dominios permitidos para el proxy (evitar SSRF). Ajustar a tu origen real.
const ALLOWED_ORIGIN_HOSTS = [
  'vidsrc.to',
  'vidsrc.me',
  '2embed.cc',
  'rivestream.org',
  'cinemaos.tech',
  'localhost',
];

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin') || '';
  if (DEFAULT_ORIGIN !== '*' && ALLOWED_ORIGIN_PATTERNS.length) {
    const allowed = ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin));
    return allowed ? origin : null;
  }
  return DEFAULT_ORIGIN;
}

function corsHeaders(request) {
  const origin = getCorsOrigin(request);
  const h = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function isAllowedUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return ALLOWED_ORIGIN_HOSTS.some((host) => u.hostname === host || u.hostname.endsWith('.' + host));
  } catch {
    return false;
  }
}

/** Strip conocidos de tracking/ads en HTML (sin cargar todo en memoria: solo para respuestas pequeñas) */
async function stripTrackingFromHtml(html) {
  if (!html || typeof html !== 'string') return html;
  return html
    .replace(/\brt_ping\.php[^"'\s]*/gi, '')
    .replace(/[\s\S]*?<script[^>]*src="[^"]*tracking[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/fetch\s*\(\s*["']https?:\/\/[^"']*\/rt_ping[^"']*["']\s*\)/gi, '/* stripped */');
}

/**
 * Proxy streaming: reenvía el body del origen al cliente sin buffering.
 * Preserva Range: reenvía Range al origen y devuelve 206 + Content-Range.
 */
async function proxyStream(targetUrl, request, env, ctx) {
  const urlObj = new URL(targetUrl);
  const isSegment = /\.(ts|m4s|mp4|m4v)(\?|$)/i.test(urlObj.pathname);
  if (isSegment) {
    const cached = await caches.default.match(request);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
      return new Response(cached.body, { status: cached.status, headers: h });
    }
  }

  const reqHeaders = new Headers();
  const range = request.headers.get('Range');
  if (range) reqHeaders.set('Range', range);
  // Opcional: reenviar Accept para que el origen devuelva el tipo correcto
  const accept = request.headers.get('Accept');
  if (accept) reqHeaders.set('Accept', accept);

  const originRequest = new Request(targetUrl, {
    method: request.method,
    headers: reqHeaders,
    redirect: 'follow',
  });

  const res = await fetch(originRequest, {
    cf: { cacheTtl: 3600, cacheEverything: false },
  });

  const resHeaders = new Headers(res.headers);
  resHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  resHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  // Cache API: segmentos de vídeo. Un stream al cliente, otro (clone) al cache.
  if (isSegment && res.ok && res.status === 200 && res.body && ctx) {
    try {
      const cacheReq = new Request(request.url, { method: 'GET' });
      const clone = res.clone();
      ctx.waitUntil(caches.default.put(cacheReq, new Response(clone.body, { status: clone.status, headers: resHeaders })));
    } catch (_) { /* ignore */ }
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
  });
}

/**
 * Proxy para page-xxxx.html: opcionalmente strip tracking y prefetch siguientes 5 a KV.
 * Si la respuesta es pequeña, se puede strip en memoria; si es grande, se reenvía en stream.
 */
async function proxyPageHtml(targetUrl, request, env) {
  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.9' },
  });

  if (!res.ok) return proxyStream(targetUrl, request, env, null);

  const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html') || /page-\d+_?html/i.test(targetUrl);

  if (!isHtml) return proxyStream(targetUrl, request, env, null);

  // Respuesta HTML: leer (puede ser grande; en producción considerar TransformStream)
  const html = await res.text();
  const stripped = await stripTrackingFromHtml(html);

  // --- Experimento seguro: intentar extraer .m3u8 y devolver un player HLS propio ---
  const directUrl = extractM3u8(html);
  if (directUrl) {
    const streamUrl = request.url.split('?')[0] + '?url=' + encodeURIComponent(directUrl);
    const body = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Stream</title>
<meta name="referrer" content="no-referrer">
<style>
  html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}
  #wrap{position:fixed;inset:0;display:flex;flex-direction:column;background:#000;}
  #bar{padding:8px 12px;background:rgba(20,20,20,.9);color:#fff;font-family:sans-serif;font-size:14px;display:flex;justify-content:space-between;align-items:center;}
  #vid-wrap{flex:1;position:relative;}
  video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;}
</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7"></script></head>
<body><div id="wrap"><div id="bar"><span>Streaming via Worker</span></div>
<div id="vid-wrap"><video id="v" controls autoplay playsinline></video></div></div>
<script>
(function(){
  var v=document.getElementById('v');var url=${JSON.stringify(streamUrl)};
  if(window.Hls&&Hls.isSupported()){var h=new Hls({enableWorker:true});h.loadSource(url);h.attachMedia(v);
    h.on(Hls.Events.MANIFEST_PARSED,function(){
      var lv=h.levels||[],best=-1,bh=0;lv.forEach(function(l,i){if(l.height&&l.height>bh){bh=l.height;best=i;}});if(best>=0)h.currentLevel=best;
    });
  }else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=url;} else {v.src=url;}
})();
</script></body></html>`;
    const headers = new Headers(res.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
    return new Response(body, { status: 200, headers });
  }

  // Prefetch siguientes 5 páginas (metadata en KV) si existe patrón page-N.html
  const match = targetUrl.match(/(.*\/)(page-)(\d+)(_?html?)(\?.*)?$/i);
  if (match && env.KV_METADATA) {
    const [, base, prefix, num, suffix, qs] = match;
    const n = parseInt(num, 10);
    const key = `page:${base}${prefix}${n}${suffix}`;
    await env.KV_METADATA.put(key, JSON.stringify({
      url: targetUrl,
      next: Array.from({ length: 5 }, (_, i) => `${base}${prefix}${n + i + 1}${suffix}${qs || ''}`),
      ts: Date.now(),
    }), { expirationTtl: 3600 });
  }

  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  headers.set('Content-Length', String(new TextEncoder().encode(stripped).length));

  return new Response(stripped, { status: res.status, headers });
}

// Decoder simple estilo VidSrc: intenta sacar una URL .m3u8 desde HTML/JS
function extractM3u8(html) {
  if (!html || typeof html !== 'string') return null;

  function decodeHexFormat(encoded) {
    const reversed = encoded.split('').reverse().join('');
    let adjusted = '';
    for (let i = 0; i < reversed.length; i++) {
      adjusted += String.fromCharCode(reversed.charCodeAt(i) - 1);
    }
    const hexClean = adjusted.replace(/[^0-9a-fA-F]/g, '');
    let decoded = '';
    for (let i = 0; i < hexClean.length; i += 2) {
      decoded += String.fromCharCode(parseInt(hexClean.substr(i, 2), 16));
    }
    return decoded;
  }

  function isM3u8(url) {
    return typeof url === 'string' && url.startsWith('http') && url.includes('.m3u8');
  }

  const patterns = [
    /["']([a-fA-F0-9]{80,})["']/g,
    /sources?\s*[=:]\s*\[?\s*["']([^"']{50,})["']/gi,
    /file\s*[=:]\s*["']([^"']{50,})["']/gi,
    /atob\s*\(\s*["']([^"']+)["']\s*\)/gi,
  ];

  for (const rg of patterns) {
    const re = new RegExp(rg.source, rg.flags);
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw = (m[1] || '').trim();
      if (isM3u8(raw)) return raw;
      const decoded = decodeHexFormat(raw);
      if (isM3u8(decoded)) return decoded;
    }
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // OPTIONS: CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
    }

    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing query parameter: url' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }

    if (!isAllowedUrl(targetUrl)) {
      return new Response(JSON.stringify({ error: 'URL not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }

    try {
      // Para HTML de “páginas” (page-xxxx.html) se puede usar strip + KV
      const isPageHtml = /page-\d+_?html/i.test(targetUrl);
      if (isPageHtml && env.KV_METADATA) {
        return proxyPageHtml(targetUrl, request, env);
      }
      // Resto (vídeo, segmentos, cualquier URL): streaming puro con Range
      return proxyStream(targetUrl, request, env, ctx);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Proxy error', message: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
      });
    }
  },
};
