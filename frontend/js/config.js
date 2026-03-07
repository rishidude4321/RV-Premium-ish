/**
 * Configuración frontend. Si usas el backend, déjalo en true (API key va en backend).
 * Si abres index.html sin backend, pon USE_BACKEND en false y tu TMDB_API_KEY abajo.
 */
window.RV_CONFIG = {
  USE_BACKEND: true,
  // Base del backend cuando frontend corre en otro puerto (ej. 5173/5500)
  API_BASE: 'http://localhost:3000',
  TMDB_API_KEY: '31b33cade35075a7a011c88568bb1070',
  WORKER_URL: 'https://rv-plus.rishivira4321.workers.dev/',
  /** Worker que sirve segmentos pre-cacheados (page-N.html) para reducir buffering */
  STREAM_TURBO_PROXY_URL: 'https://stream-turbo-proxy.rishivira4321.workers.dev/',
  /** Segmento inicial para modo turbo (ej. 1258). Puede venir del backend en el futuro. */
  TURBO_DEFAULT_START_SEGMENT: 1258,
  /** Si true, intentar usar turbo cuando haya startSegment disponible */
  USE_TURBO_STREAM: false,
  IMG_PATH: 'https://image.tmdb.org/t/p/w1280',
  POSTER_PATH: 'https://image.tmdb.org/t/p/w500',
};
