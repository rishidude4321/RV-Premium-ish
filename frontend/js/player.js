/**
 * Reproductor: películas, series (episodios), overlay a pantalla completa.
 * Usa decodeHexFormat para obtener URL directa del stream y reducir anuncios.
 */
import * as api from './api.js';
import { state } from './state.js';
import { extractDecodedStreamUrl } from './streamDecode.js';

const C = window.RV_CONFIG || {};

let hlsScriptPromise = null;
function ensureHlsJs() {
  if (typeof window.Hls !== 'undefined') return Promise.resolve();
  if (hlsScriptPromise) return hlsScriptPromise;
  hlsScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7';
    s.onload = () => resolve();
    s.onerror = reject;
    (document.head || document.documentElement).appendChild(s);
  });
  return hlsScriptPromise;
}

async function renderHlsPlayer(containerEl, titleText, streamUrl) {
  containerEl.innerHTML = `
    <div style="width:100vw; height:100vh; position:relative; display:flex; flex-direction:column; background:#000;">
      <div style="padding:15px; background:rgba(30,30,30,0.9); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:bold; color:var(--accent-color);">${titleText}</span>
        <button class="ctrl-btn" onclick="document.getElementById('fsPlayerOverlay').remove()" style="padding:5px 15px;">✕ Close Player</button>
      </div>
      <div style="position:relative; width:100%; height:calc(100vh - 60px); background:#000; overflow:hidden;">
        <video id="rv-video" controls autoplay playsinline style="width:100%;height:100%;object-fit:contain;background:#000;"></video>
      </div>
    </div>`;

  const video = document.getElementById('rv-video');
  if (!video) return;

  await ensureHlsJs();

  if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
    const hls = new window.Hls({ enableWorker: true });
    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      // elegir siempre el nivel de mayor resolución
      const levels = hls.levels || [];
      let best = -1;
      let bestHeight = 0;
      levels.forEach((lvl, i) => {
        if (lvl.height && lvl.height > bestHeight) {
          bestHeight = lvl.height;
          best = i;
        }
      });
      if (best >= 0) hls.currentLevel = best;
    });
    hls.on(window.Hls.Events.ERROR, (_, data) => {
      if (data && data.fatal) {
        console.error('HLS fatal error', data);
        try { hls.destroy(); } catch {}
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl;
  } else {
    containerEl.innerHTML = '<div style="color:#fff;padding:20px;">HLS not supported in this browser.</div>';
  }
}

async function playContent(id, title, posterPath, type) {
  if (!state.activeUser) return;
  state.activeUser.continueWatching = [
    { id, title, poster_path: posterPath, type },
    ...state.activeUser.continueWatching.filter((x) => x.id !== id),
  ].slice(0, 10);
  if (typeof window.save === 'function') window.save();

  const targetUrl =
    type === 'movie'
      ? `https://vidsrc.me/embed/movie?tmdb=${id}`
      : `https://vidsrc.me/embed/tv?tmdb=${id}&sea=1&epi=1`;

  let playerDiv = document.getElementById('fsPlayerOverlay');
  if (!playerDiv) {
    playerDiv = document.createElement('div');
    playerDiv.id = 'fsPlayerOverlay';
    playerDiv.style.cssText = 'position:fixed; inset:0; z-index:10000; background:#000; display:flex; justify-content:center; align-items:center; overflow:hidden;';
    document.body.appendChild(playerDiv);
  }
  playerDiv.innerHTML = '<div style="color:white; font-family:sans-serif;">Loading Secure Stream...</div>';
  try {
    const html = await api.getProxyStream(targetUrl);
    const directUrl = extractDecodedStreamUrl(html);

    // Si conseguimos un .m3u8, usamos nuestro propio player HLS para mejor calidad y sin ads del player.
    if (directUrl && directUrl.includes('.m3u8')) {
      const streamUrl = C.WORKER_URL
        ? C.WORKER_URL + '?url=' + encodeURIComponent(directUrl)
        : directUrl;
      await renderHlsPlayer(playerDiv, title, streamUrl);
      return;
    }

    const finalHtml = directUrl
      ? `<iframe src="${directUrl}" style="width:100%; height:100%; border:none; position:absolute; top:0; left:0;" allowfullscreen></iframe>`
      : html;
    playerDiv.innerHTML = `
      <div style="width:100vw; height:100vh; position:relative; display:flex; flex-direction:column; background:#000;">
        <div style="padding:15px; background:rgba(30,30,30,0.9); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:bold; color:var(--accent-color);">${title}</span>
          <button class="ctrl-btn" onclick="document.getElementById('fsPlayerOverlay').remove()" style="padding:5px 15px;">✕ Close Player</button>
        </div>
        <div style="position:relative; width:100%; height:calc(100vh - 60px); background:#000; overflow:hidden;">
          <div id="proxyContent" style="position:absolute; inset:0; width:100%; height:100%;">
            ${finalHtml}
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      const frame = document.querySelector('#proxyContent iframe');
      if (frame) frame.style.cssText = 'width:100% !important; height:100% !important; border:none; position:absolute; top:0; left:0;';
    }, 100);
  } catch (_) {
    playerDiv.innerHTML = '<div style="color:red; padding:20px;">Error loading stream. Check Worker proxy.</div>';
  }
}

function playTV(id, s, e, title) {
  const vidsrcUrl = `https://vidsrc.to/embed/tv/${id}/${s}/${e}`;
  openPlayerOverlay(vidsrcUrl, `${title} - S${s} E${e}`);
}

async function openPlayerOverlay(targetUrl, displayTitle) {
  let p = document.getElementById('fsPlayerOverlay');
  if (!p) {
    p = document.createElement('div');
    p.id = 'fsPlayerOverlay';
    p.style.cssText = 'position:fixed; inset:0; z-index:10000; background:#000; display:flex; justify-content:center; align-items:center; overflow:hidden;';
    document.body.appendChild(p);
  }
  p.innerHTML = '<div style="color:white;">Loading Secure Stream...</div>';
  try {
    const h = await api.getProxyStream(targetUrl);
    const directUrl = extractDecodedStreamUrl(h);

    if (directUrl && directUrl.includes('.m3u8')) {
      const streamUrl = C.WORKER_URL
        ? C.WORKER_URL + '?url=' + encodeURIComponent(directUrl)
        : directUrl;
      await renderHlsPlayer(p, displayTitle, streamUrl);
      return;
    }

    const hClean = directUrl
      ? `<iframe src="${directUrl}" style="width:100%; height:100%; border:none; position:absolute; top:0; left:0;" allowfullscreen></iframe>`
      : h.replace(/<style[\s\S]*?<\/style>/gi, '');
    p.innerHTML = `
      <div style="width:100vw; height:100vh; position:relative; display:flex; flex-direction:column; background:#000;">
        <div style="padding:10px 15px; background:rgba(30,30,30,0.9); display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:bold; color:var(--accent-color);">${displayTitle}</span>
          <button class="ctrl-btn" onclick="document.getElementById('fsPlayerOverlay').remove()" style="padding:5px 15px;">✕ Close Player</button>
        </div>
        <div style="position:relative; width:100%; height:calc(100vh - 60px); background:#000; overflow:hidden;">
          <div id="proxyContent" style="position:absolute; inset:0; width:100%; height:100%;">
            ${hClean}
          </div>
        </div>
      </div>`;
    setTimeout(() => {
      const frame = document.querySelector('#proxyContent iframe');
      if (frame) frame.style.cssText = 'width:100% !important; height:100% !important; border:none; position:absolute; top:0; left:0;';
    }, 100);
  } catch (_) {
    p.innerHTML = '<div style="color:red; padding:20px;">Error loading stream.</div>';
  }
}

export { playContent, playTV, openPlayerOverlay };
