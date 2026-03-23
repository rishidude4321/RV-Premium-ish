/**
 * Tema: colores, presets, persistencia en localStorage.
 */
const root = typeof document !== 'undefined' ? document.documentElement : null;

function adjustColor(hex, amt) {
  let usePound = false;
  if (hex[0] === '#') { hex = hex.slice(1); usePound = true; }
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amt;
  let g = ((num >> 8) & 0x00ff) + amt;
  let b = (num & 0x0000ff) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return (usePound ? '#' : '') + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function rgbToHex(rgb) {
  if (!rgb || rgb === '') return '#0a0a0a';
  if (rgb.startsWith('#')) return rgb;
  const parts = rgb.match(/\d+/g);
  if (!parts) return '#0a0a0a';
  return '#' + parts.map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('');
}

function applyThemeStyles(bg, accent, text) {
  if (!root) return;
  const cardBg = adjustColor(bg, 10);
  root.style.setProperty('--bg-color', bg);
  root.style.setProperty('--accent-color', accent);
  root.style.setProperty('--text-color', text);
  root.style.setProperty('--card-bg', cardBg);
  if (typeof document !== 'undefined') document.body.style.backgroundColor = bg;
}

function openTheme() {
  const modal = document.getElementById('themeModal');
  if (modal) modal.style.display = 'block';
  const style = root && getComputedStyle(root);
  const currentBg = style ? style.getPropertyValue('--bg-color').trim() : '';
  const currentAccent = style ? style.getPropertyValue('--accent-color').trim() : '';
  const bgEl = document.getElementById('bgPicker');
  const accentEl = document.getElementById('accentPicker');
  if (bgEl) bgEl.value = rgbToHex(currentBg);
  if (accentEl) accentEl.value = rgbToHex(currentAccent);
}

function updateCustomTheme() {
  const bg = document.getElementById('bgPicker')?.value;
  const accent = document.getElementById('accentPicker')?.value;
  if (bg && accent) applyThemeStyles(bg, accent, '#ffffff');
}

function applyPreset(bg, accent, text) {
  applyThemeStyles(bg, accent, text);
  const bgEl = document.getElementById('bgPicker');
  const accentEl = document.getElementById('accentPicker');
  if (bgEl) bgEl.value = bg;
  if (accentEl) accentEl.value = accent;
}

function saveTheme() {
  const modal = document.getElementById('themeModal');
  if (modal) modal.style.display = 'none';
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (root && storage) {
    storage.setItem(
      'rv_theme_persistent',
      JSON.stringify({
        bg: root.style.getPropertyValue('--bg-color'),
        accent: root.style.getPropertyValue('--accent-color'),
        text: root.style.getPropertyValue('--text-color'),
      })
    );
  }
}

function loadSavedTheme() {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null;
  if (!storage) return;
  const saved = storage.getItem('rv_theme_persistent');
  if (saved) {
    try {
      const t = JSON.parse(saved);
      if (t.bg && t.accent && t.text) applyThemeStyles(t.bg, t.accent, t.text);
    } catch (_) {}
  }
}

export { openTheme, updateCustomTheme, applyPreset, saveTheme, applyThemeStyles, adjustColor, rgbToHex, loadSavedTheme };
