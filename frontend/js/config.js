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
  IMG_PATH: 'https://image.tmdb.org/t/p/w1280',
  POSTER_PATH: 'https://image.tmdb.org/t/p/w500',
};
