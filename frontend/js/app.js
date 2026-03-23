/**
 * App principal: categorías, filas, detalle, modal, búsqueda, filtros, sincronización.
 */
import { RV_CONFIG } from './config.js';
import * as api from './api.js';
import { state, persistUsers } from './state.js';
import * as theme from './theme.js';
import * as profiles from './profiles.js';
import * as player from './player.js';

const C = window.RV_CONFIG || {};
const POSTER_PATH = C.POSTER_PATH || 'https://image.tmdb.org/t/p/w500';
const IMG_PATH = C.IMG_PATH || 'https://image.tmdb.org/t/p/w1280';

const categoryData = [
  { n: 'Trending', path: 'trending/movie/day' },
  { n: 'Recently Added', path: 'movie/now_playing' },
  { n: 'High Rated', path: 'movie/top_rated' },
  { n: 'MCU Universe', path: 'discover/movie', query: 'with_companies=420' },
  { n: 'Sci-Fi Universe', path: 'discover/movie', query: 'with_genres=878' },
  { n: 'Classics', path: 'discover/movie', query: 'sort_by=vote_average.desc&vote_count.gte=15000' },
  { n: 'Horror', path: 'discover/movie', query: 'with_genres=27' },
  { n: 'Action', path: 'discover/movie', query: 'with_genres=28' },
  { n: 'Hidden Gems', path: 'discover/movie', query: 'vote_average.gte=8&vote_count.lte=2000' },
  { n: 'Holiday Hits', path: 'discover/movie', query: 'with_keywords=207317' },
];

const tvCategoryData = [
  { n: 'Trending TV', path: 'trending/tv/day' },
  { n: 'Top Rated TV', path: 'tv/top_rated' },
  { n: 'On Air', path: 'tv/on_the_air' },
  { n: 'Sci-Fi/Fantasy TV', path: 'discover/tv', query: 'with_genres=10765' },
  { n: 'Action TV', path: 'discover/tv', query: 'with_genres=10759' },
  { n: 'Comedy TV', path: 'discover/tv', query: 'with_genres=35' },
  { n: 'Documentary TV', path: 'discover/tv', query: 'with_genres=99' },
  { n: 'Mystery TV', path: 'discover/tv', query: 'with_genres=9648' },
  { n: 'Reality TV', path: 'discover/tv', query: 'with_genres=10764' },
  { n: 'Animation TV', path: 'discover/tv', query: 'with_genres=16' },
];

function buildCategoryUrl(cat) {
  const q = cat.query ? '&' + cat.query : '';
  if (C.USE_BACKEND) return `/api/tmdb/${cat.path}${q ? '?' + q : ''}`;
  return `https://api.themoviedb.org/3/${cat.path}?api_key=${C.TMDB_API_KEY}${q}`;
}

function safeParse(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val || '[]');
  } catch (_) {
    return fallback;
  }
}

async function syncAllProfiles() {
  try {
    const cloudUsers = await api.profilesLoadAll();
    const list = Array.isArray(cloudUsers) ? cloudUsers : [];
    if (list.length > 0) {
      state.users = list.map((u) => ({
        id: parseInt(u.profile_id || u.id, 10) || u.id,
        name: u.name || u.profile_name || 'Profile',
        avatar: u.avatar || 'https://image.tmdb.org/t/p/w185/39U9p9WvK8M4hN8G189R5G0vL0G.jpg',
        continueWatching: safeParse(u.watch_history, []),
        myList: safeParse(u.myList, []),
        favorites: safeParse(u.favorites, []),
        rowPrefs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      }));
      persistUsers();
    }
    profiles.renderProfiles();
    if (state.activeUser) {
      state.activeUser = state.users.find((u) => u.id === state.activeUser.id);
      if (state.activeUser) updateLists();
    }
  } catch (e) {
    console.warn('Cloudflare profiles load failed, using local:', e.message);
    profiles.renderProfiles();
  }
}

function switchType(t) {
  state.curT = t;
  document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
  const id = t === 'movie' ? 'btnMovies' : t === 'tv' ? 'btnTV' : 'btnAnything';
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  initApp();
}

async function initApp() {
  updateLists();
  const dynamic = document.getElementById('dynamicContent');
  if (dynamic) dynamic.innerHTML = '';
  const base = state.curT === 'multi' ? 'trending/all/day' : `trending/${state.curT}/day`;
  const hData = await api.getTmdb(base);
  setupHero(hData.results[0]);

  const user = state.activeUser;
  const recommendationSeeds = [];
  const excludeIds = new Set();
  if (user) {
    const cw = (user.continueWatching || []).slice(0, 5).map((m) => ({ id: m.id, type: m.type || 'movie' }));
    const fav = (user.favorites || []).slice(0, 3).map((m) => ({ id: m.id, type: m.type || 'movie' }));
    const list = (user.myList || []).slice(0, 3).map((m) => ({ id: m.id, type: m.type || 'movie' }));
    const all = [...cw, ...fav, ...list];
    const byId = new Map();
    for (const it of all) {
      byId.set(String(it.id), it);
      excludeIds.add(it.id);
    }
    recommendationSeeds.push(...byId.values());
  }
  if (recommendationSeeds.length > 0) {
    try {
      const recs = await api.getRecommendations(recommendationSeeds, [...excludeIds]);
      if (recs.length > 0) {
        const recSection = document.createElement('div');
        recSection.className = 'category-section';
        recSection.innerHTML = `
          <div class="category-title"><span>Recommended for you</span></div>
          <div class="movie-row">${recs.map((m) => createCard(m)).join('')}</div>`;
        dynamic.appendChild(recSection);
      }
    } catch (_) {}
  }

  const cats = state.curT === 'tv' ? tvCategoryData : categoryData;
  for (const c of cats) {
    const url = buildCategoryUrl(c);
    const d = C.USE_BACKEND ? await api.getTmdb(c.path, c.query || '') : await (await fetch(url)).json();
    renderRow(c.n, d.results || [], url);
  }
}

function renderRow(title, movies, url) {
  const div = document.createElement('div');
  div.className = 'category-section';
  const escapedUrl = (url || '').replace(/'/g, "\\'");
  div.innerHTML = `
    <div class="category-title">
      <span>${title}</span>
      <span style="font-size:0.7rem; color:var(--accent-color); cursor:pointer;" onclick="window.viewAll('${title.replace(/'/g, "\\'")}', '${escapedUrl}')">VIEW ALL ❯</span>
    </div>
    <div class="movie-row">
      ${(movies || []).slice(0, 20).map((m) => createCard(m)).join('')}
      <div class="view-all-card" onclick="window.viewAll('${title.replace(/'/g, "\\'")}', '${escapedUrl}')">SEE ALL</div>
    </div>`;
  const target = document.getElementById('dynamicContent');
  if (target) target.appendChild(div);
}

function createCard(m) {
  const type = m.media_type || (m.title ? 'movie' : 'tv');
  const isSoon = new Date(m.release_date || m.first_air_date || 0) > new Date();
  const poster = m.poster_path ? POSTER_PATH + m.poster_path : 'https://via.placeholder.com/200x300';
  return `<div class="movie-card" onclick="window.navigateTo('${type}', ${m.id})">
    ${isSoon ? `<div class="coming-soon">Soon: ${m.release_date || m.first_air_date}</div>` : ''}
    <img src="${poster}" alt="">
  </div>`;
}

async function navigateTo(type, id) {
  state.historyIndex++;
  state.modalHistory = state.modalHistory.slice(0, state.historyIndex);
  state.modalHistory.push({ type, id });
  if (type === 'person') loadPerson(id);
  else loadDetails(type, id);
  updateArrows();
}

async function loadDetails(type, id) {
  const modal = document.getElementById('mainModal');
  const inner = document.getElementById('modalInnerBody');
  if (modal) modal.style.display = 'block';
  if (inner) inner.innerHTML = '';
  const m = await api.getTmdb(`${type}/${id}`, 'append_to_response=credits,similar');
  const activeUser = state.activeUser;
  if (!activeUser) return;
  const inL = activeUser.myList.some((x) => x.id == m.id);
  const isF = activeUser.favorites.some((x) => x.id == m.id);
  const title = (m.title || m.name || '').replace(/'/g, "\\'");
  const runtimeVal = type === 'movie' ? m.runtime : (m.episode_run_time && m.episode_run_time[0]) || null;
  const displayRuntime = runtimeVal ? `<span style="margin-left:15px; color:var(--secondary-text); font-weight:bold; font-size:0.9rem;">🕒 ${formatRuntime(runtimeVal)}</span>` : '';
  const posterPath = m.poster_path || '';

  let html = `
    <div class="modal-left"><img src="${POSTER_PATH + posterPath}" alt=""></div>
    <div class="modal-right">
      <h2>${m.title || m.name}</h2>
      <div style="margin:10px 0; display:flex; align-items:center;">
        <span class="rating-badge tomato">🍅 ${Math.floor((m.vote_average || 0) * 10)}%</span>
        <span class="rating-badge critic" style="margin-left:10px;">⭐ ${(m.vote_average || 0).toFixed(1)}</span>
        ${displayRuntime}
      </div>
      <p style="font-size:0.9rem; max-height:100px; overflow-y:auto; margin-bottom:15px;">${m.overview || ''}</p>
      <div style="display:flex; gap:10px; margin-bottom:20px;">
        ${type === 'movie' ? `<button class="ctrl-btn" onclick="window.playContent(${m.id},'${title}','${posterPath}','movie')">Watch Now</button>` : ''}
        <button id="lBtn" class="ctrl-btn ${inL ? 'active-btn' : ''}" onclick="window.toggle('myList', ${m.id},'${title}','${posterPath}','${type}')">${inL ? '✓ List' : '+ List'}</button>
        <button id="fBtn" class="ctrl-btn ${isF ? 'active-btn' : ''}" onclick="window.toggle('favorites', ${m.id},'${title}','${posterPath}','${type}')">+ Favorite</button>
      </div>`;

  if (type === 'tv') {
    html += `
      <div style="display:flex; gap:20px; border-bottom:1px solid #333; margin-bottom:15px;">
        <button id="tabEpi" class="type-btn active" onclick="window.switchTab('episodes', ${m.id})">Select Episode</button>
        <button id="tabSim" class="type-btn" onclick="window.switchTab('similar', ${m.id}, 'tv')">Similar Content</button>
      </div>
      <div id="tabContent" style="max-height:350px; overflow-y:auto;"></div>`;
    state.currentShow = m;
  } else {
    const cast = (m.credits && m.credits.cast) || [];
    const similar = (m.similar && m.similar.results) || [];
    html += `
      <div class="cast-row">${cast.slice(0, 8).map((c) => `<div class="cast-card" onclick="window.navigateTo('person', ${c.id})"><img src="${c.profile_path ? POSTER_PATH + c.profile_path : 'https://via.placeholder.com/60'}" alt=""><p>${(c.name || '').replace(/'/g, "\\'")}</p></div>`).join('')}</div>
      <h3 style="margin-top:30px;">Similar Content</h3>
      <div class="similar-row">${similar.slice(0, 6).map((s) => `<div class="similar-card" onclick="window.navigateTo('movie',${s.id})"><img src="${POSTER_PATH + (s.poster_path || '')}" alt=""></div>`).join('')}</div>`;
  }
  html += '</div>';
  if (inner) inner.innerHTML = html;
  if (type === 'tv') renderSeasonPicker(m.id, m.number_of_seasons || 1);
  updateArrows();
}

async function switchTab(tab, id, type = 'tv') {
  const tabEpi = document.getElementById('tabEpi');
  const tabSim = document.getElementById('tabSim');
  const tabContent = document.getElementById('tabContent');
  if (!tabContent) return;
  if (tabEpi) tabEpi.classList.toggle('active', tab === 'episodes');
  if (tabSim) tabSim.classList.toggle('active', tab === 'similar');
  if (tab === 'episodes') {
    const total = (state.currentShow && state.currentShow.number_of_seasons) || 1;
    let h = `<select class="ctrl-btn" style="width:100%; margin-bottom:15px;" onchange="window.loadEpisodes(${id}, this.value)">`;
    for (let i = 1; i <= total; i++) h += `<option value="${i}">Season ${i}</option>`;
    h += `</select><div id="epiGrid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px;"></div>`;
    tabContent.innerHTML = h;
    loadEpisodes(id, 1);
  } else {
    tabContent.innerHTML = 'Loading...';
    const data = await api.getTmdb(`${type}/${id}/similar`);
    const results = (data.results || []).slice(0, 6);
    tabContent.innerHTML = `
      <div class="similar-row">${results.map((s) => `<div class="similar-card" onclick="window.navigateTo('${s.media_type || 'movie'}',${s.id})"><img src="${POSTER_PATH + (s.poster_path || '')}" alt=""></div>`).join('')}</div>`;
  }
}

function renderSeasonPicker(id, total) {
  let h = `<select class="ctrl-btn" style="width:100%; margin-bottom:15px;" onchange="window.loadEpisodes(${id}, this.value)">`;
  for (let i = 1; i <= total; i++) h += `<option value="${i}">Season ${i}</option>`;
  h += `</select><div id="epiGrid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px;"></div>`;
  const tabContent = document.getElementById('tabContent');
  if (tabContent) tabContent.innerHTML = h;
  loadEpisodes(id, 1);
}

async function loadEpisodes(id, s) {
  const g = document.getElementById('epiGrid');
  if (g) g.innerHTML = 'Loading...';
  const d = await api.getTmdb(`tv/${id}/season/${s}`);
  const episodes = d.episodes || [];
  const html = episodes
    .map(
      (e) => `
    <div class="similar-card" onclick="window.playTV(${id}, ${s}, ${e.episode_number}, '${(e.name || '').replace(/'/g, "\\'")}')">
      <img src="${e.still_path ? POSTER_PATH + e.still_path : 'https://via.placeholder.com/140x80'}" style="width:100%; border-radius:4px;" alt="">
      <p style="font-size:0.7rem; font-weight:bold; margin-top:5px;">E${e.episode_number}: ${e.name}</p>
    </div>`
    )
    .join('');
  if (g) g.innerHTML = html;
}

async function loadPerson(id) {
  const p = await api.getTmdb(`person/${id}`, 'append_to_response=combined_credits');
  const inner = document.getElementById('modalInnerBody');
  if (!inner) return;
  const credits = (p.combined_credits && p.combined_credits.cast) || [];
  inner.innerHTML = `
    <div class="modal-left"><img src="${POSTER_PATH + (p.profile_path || '')}" alt=""></div>
    <div class="modal-right">
      <h2>${p.name}</h2>
      <p style="max-height:200px; overflow-y:auto;">${p.biography || 'No biography available.'}</p>
      <h3>Known For</h3>
      <div class="similar-row">${credits.slice(0, 10).map((m) => `<div class="similar-card" onclick="window.navigateTo('${m.media_type || 'movie'}', ${m.id})"><img src="${POSTER_PATH + (m.poster_path || '')}" alt=""></div>`).join('')}</div>
    </div>`;
  updateArrows();
}

function toggle(k, id, t, p, type) {
  const activeUser = state.activeUser;
  if (!activeUser) return;
  if (activeUser[k].some((x) => x.id == id)) activeUser[k] = activeUser[k].filter((x) => x.id != id);
  else activeUser[k].push({ id, title: t, poster_path: p, type });
  save();
  const btn = document.getElementById(k === 'myList' ? 'lBtn' : 'fBtn');
  if (btn) btn.classList.toggle('active-btn');
}

async function save() {
  persistUsers();
  updateLists();
  if (state.activeUser) {
    try {
      await api.profilesSave({
        id: state.activeUser.id,
        name: state.activeUser.name,
        avatar: state.activeUser.avatar,
        watch_history: JSON.stringify(state.activeUser.continueWatching),
        myList: JSON.stringify(state.activeUser.myList || []),
        favorites: JSON.stringify(state.activeUser.favorites || []),
      });
    } catch (_) {}
  }
}

function updateLists() {
  const activeUser = state.activeUser;
  if (!activeUser) return;
  const map = {
    continueWatching: ['continueRow', 'continueSection'],
    myList: ['myListRow', 'myListSection'],
    favorites: ['favRow', 'favSection'],
  };
  for (const [key, [rowId, secId]] of Object.entries(map)) {
    const row = document.getElementById(rowId);
    const sec = document.getElementById(secId);
    const arr = activeUser[key] || [];
    if (sec) sec.style.display = arr.length > 0 ? 'block' : 'none';
    if (row && arr.length > 0) {
      row.innerHTML = arr
        .map(
          (m) => `
        <div class="movie-card">
          <button class="remove-btn" onclick="state.activeUser['${key}']=state.activeUser['${key}'].filter(x=>x.id!=${m.id});window.save();this.closest('.movie-card').remove();">×</button>
          <div onclick="window.navigateTo('${m.type}', ${m.id})">
            <img src="${POSTER_PATH + (m.poster_path || '')}" alt="">
          </div>
        </div>`
        )
        .join('');
    }
  }
}

function triggerSearch() {
  const q = document.getElementById('searchBar')?.value;
  executeSearch(q);
}

async function executeSearch(q) {
  document.getElementById('heroContainer').innerHTML = '';
  document.getElementById('dynamicContent').innerHTML = '<h1 style="padding-left:40px;">Results</h1><div class="full-grid" id="gridBody"></div>';
  const d = await api.getTmdb('search/multi', 'query=' + encodeURIComponent(q || ''));
  const grid = document.getElementById('gridBody');
  if (grid) (d.results || []).filter((m) => m.poster_path).forEach((m) => (grid.innerHTML += createCard(m)));
}

function setupHero(m) {
  if (!m) return;
  const type = m.media_type || (m.title ? 'movie' : 'tv');
  const hero = document.getElementById('heroContainer');
  if (!hero) return;
  hero.innerHTML = `
    <div class="hero" style="background-image:url(${IMG_PATH + (m.backdrop_path || '')})">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <h1>${m.title || m.name}</h1>
        <p>${m.overview || ''}</p>
        <button class="ctrl-btn" onclick="window.navigateTo('${type}', ${m.id})">More Info</button>
      </div>
    </div>`;
}

function closeModal() {
  const modal = document.getElementById('mainModal');
  if (modal) modal.style.display = 'none';
  state.modalHistory = [];
  state.historyIndex = -1;
}

function goBack() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  const h = state.modalHistory[state.historyIndex];
  if (h.type === 'person') loadPerson(h.id);
  else loadDetails(h.type, h.id);
  updateArrows();
}

function goForward() {
  if (state.historyIndex >= state.modalHistory.length - 1) return;
  state.historyIndex++;
  const h = state.modalHistory[state.historyIndex];
  if (h.type === 'person') loadPerson(h.id);
  else loadDetails(h.type, h.id);
  updateArrows();
}

function updateArrows() {
  const back = document.getElementById('backBtn');
  const fwd = document.getElementById('forwardBtn');
  if (back) back.disabled = state.historyIndex <= 0;
  if (fwd) fwd.disabled = state.historyIndex >= state.modalHistory.length - 1;
}

function formatRuntime(n) {
  if (!n) return '';
  const hours = Math.floor(n / 60);
  const mins = n % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function openFilter() {
  const modal = document.getElementById('filterModal');
  if (modal) modal.style.display = 'block';
}

async function applyFilters() {
  const g = document.getElementById('fGenre')?.value || '';
  const s = document.getElementById('fSort')?.value || 'popularity.desc';
  const type = state.curT === 'multi' ? 'movie' : state.curT;
  const path = `discover/${type}`;
  const query = `sort_by=${s}${g ? '&with_genres=' + g : ''}`;
  const url = buildCategoryUrl({ path, query });
  viewAll('Filtered Results', url);
  document.getElementById('filterModal').style.display = 'none';
}

async function viewAll(title, url, append = false) {
  if (!append) {
    window.scrollTo(0, 0);
    document.getElementById('heroContainer').innerHTML = '';
    const escapedTitle = (title || '').replace(/'/g, "\\'");
    const escapedUrl = (url || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    document.getElementById('dynamicContent').innerHTML = `
    <div style="padding:20px 40px;display:flex;justify-content:space-between;">
      <h1>${title}</h1>
      <button class="ctrl-btn" onclick="window.reloadHome()">Home</button>
    </div>
    <div id="gridBody" class="full-grid"></div>
    <div style="text-align:center;padding:40px;">
      <button class="ctrl-btn" onclick="window.viewAll('${escapedTitle}','${escapedUrl}',true)">Load 60 More</button>
    </div>`;
    state.currP = 0;
  }
  state.actU = url;
  for (let i = 0; i < 3; i++) {
    state.currP++;
    const sep = (url || '').includes('?') ? '&' : '?';
    const pageUrl = url + sep + 'page=' + state.currP;
    let d;
    if (C.USE_BACKEND) {
      const pathMatch = (url || '').match(/\/api\/tmdb\/(.+?)(?:\?|$)/);
      const pathPart = pathMatch ? pathMatch[1] : '';
      const qMatch = (url || '').match(/\?(.+)$/);
      const qPart = (qMatch ? qMatch[1] + '&' : '') + 'page=' + state.currP;
      d = await api.getTmdb(pathPart, qPart);
    } else {
      d = await (await fetch(pageUrl)).json();
    }
    const grid = document.getElementById('gridBody');
    if (grid) (d.results || []).filter((m) => m.poster_path).forEach((m) => (grid.innerHTML += createCard(m)));
  }
}

function reloadHome() {
  initApp();
}

function toggleQR() {
  const q = document.getElementById('qr-container');
  const qrcodeEl = document.getElementById('qrcode');
  if (q.style.display === 'block') {
    q.style.display = 'none';
    return;
  }
  q.style.display = 'block';
  if (qrcodeEl) qrcodeEl.innerHTML = '';
  if (window.QRCode) new window.QRCode(qrcodeEl, window.location.href);
}

function surpriseMe() {
  api.getTmdb('movie/top_rated').then((d) => {
    const list = d.results || [];
    if (list.length) navigateTo('movie', list[Math.floor(Math.random() * list.length)].id);
  });
}

// Exponer en window para onclick del HTML
window.handleProfile = profiles.handleProfile;
window.toggleEditMode = profiles.toggleEditMode;
window.openProfileCreation = profiles.openProfileCreation;
window.deleteProfile = profiles.deleteProfile;
window.selectAvatar = profiles.selectAvatar;
window.saveProfile = profiles.saveProfile;
window.closeCreation = profiles.closeCreation;
window.openTheme = theme.openTheme;
window.updateCustomTheme = theme.updateCustomTheme;
window.applyPreset = theme.applyPreset;
window.saveTheme = theme.saveTheme;
window.playContent = player.playContent;
window.playTV = player.playTV;
window.openPlayerOverlay = player.openPlayerOverlay;
window.switchType = switchType;
window.initApp = initApp;
window.reloadHome = reloadHome;
window.navigateTo = navigateTo;
window.loadDetails = loadDetails;
window.loadPerson = loadPerson;
window.switchTab = switchTab;
window.loadEpisodes = loadEpisodes;
window.toggle = toggle;
window.save = save;
window.triggerSearch = triggerSearch;
window.setupHero = setupHero;
window.closeModal = closeModal;
window.goBack = goBack;
window.goForward = goForward;
window.updateArrows = updateArrows;
window.openFilter = openFilter;
window.applyFilters = applyFilters;
window.viewAll = viewAll;
window.toggleQR = toggleQR;
window.surpriseMe = surpriseMe;
window.createCard = createCard;
window.state = state;

// Arranque
// Arranque: mostrar perfiles locales al instante, luego sincronizar con Cloudflare
theme.loadSavedTheme();
profiles.renderProfiles();
syncAllProfiles();
