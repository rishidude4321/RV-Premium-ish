/**
 * Auth0: login y registro. Si Auth0 no está configurado en el backend, se omite (flujo sin login).
 */
const C = window.RV_CONFIG || {};
const API_BASE = (C.API_BASE || '').replace(/\/$/, '');

let auth0Client = null;
let authConfig = null;

async function fetchConfig() {
  try {
    const r = await fetch(API_BASE + '/api/auth/config');
    authConfig = await r.json();
    return authConfig;
  } catch (_) {
    authConfig = {};
    return authConfig;
  }
}

function isCallback() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const params = hash + search;
  return params.includes('state=') && (params.includes('code=') || params.includes('access_token=') || params.includes('id_token='));
}

/**
 * Inicializa Auth0 si el backend devuelve domain/clientId. Si no, auth queda desactivado.
 */
async function init() {
  await fetchConfig();
  if (!authConfig || !authConfig.domain || !authConfig.clientId) {
    return;
  }
  try {
    const { createAuth0Client } = await import('https://esm.sh/@auth0/auth0-spa-js@2.1.0');
    auth0Client = await createAuth0Client({
      domain: authConfig.domain,
      clientId: authConfig.clientId,
      cacheLocation: 'localstorage',
      authorizationParams: {
        redirect_uri: authConfig.callbackUrl || window.location.origin + window.location.pathname,
      },
    });
  } catch (e) {
    console.warn('Auth0 init failed:', e);
  }
}

/**
 * true si estamos en la vuelta del redirect de Auth0.
 */
function isAuthCallback() {
  return isCallback();
}

/**
 * Procesa el callback después del login de Auth0. Llamar solo si isAuthCallback() es true.
 * Limpia el hash de la URL sin recargar la página.
 */
async function handleCallback() {
  if (!auth0Client) throw new Error('Auth0 client not ready');
  await auth0Client.handleRedirectCallback();
  const path = (window.location.pathname || '/') + (window.location.search || '');
  window.history.replaceState({}, document.title, path);
}

/**
 * true si Auth0 no está configurado O si el usuario ya está autenticado.
 */
async function isAuthenticated() {
  if (!authConfig || !authConfig.domain) return true; // Sin Auth0 = no bloquear (comportamiento anterior)
  if (!auth0Client) return false;
  return auth0Client.isAuthenticated();
}

/**
 * Redirige a Auth0 para iniciar sesión.
 */
async function login() {
  if (!auth0Client) return;
  await auth0Client.loginWithRedirect({
    authorizationParams: { screen_hint: 'login' },
  });
}

/**
 * Redirige a Auth0 para registrarse.
 */
async function signUp() {
  if (!auth0Client) return;
  await auth0Client.loginWithRedirect({
    authorizationParams: { screen_hint: 'signup' },
  });
}

/**
 * Cierra sesión en Auth0 y redirige al callback (o recarga si no hay Auth0).
 */
async function logout() {
  if (auth0Client && authConfig && authConfig.domain) {
    const returnTo = authConfig.callbackUrl || window.location.origin + window.location.pathname;
    await auth0Client.logout({ logoutParams: { returnTo } });
  } else {
    window.location.reload();
  }
}

/**
 * Devuelve el usuario de Auth0 (nombre, email, picture, etc.) o null.
 */
async function getUser() {
  if (!auth0Client) return null;
  try {
    return await auth0Client.getUser();
  } catch (_) {
    return null;
  }
}

/**
 * Access token para llamar a la API (MongoDB profiles). Incluye audience si está configurado.
 */
async function getAccessToken() {
  if (!auth0Client) return null;
  try {
    const opts = authConfig?.audience
      ? { authorizationParams: { audience: authConfig.audience } }
      : {};
    return await auth0Client.getTokenSilently(opts);
  } catch (_) {
    return null;
  }
}

export const auth = {
  init,
  isAuthCallback,
  handleCallback,
  isAuthenticated,
  login,
  signUp,
  logout,
  getUser,
  getAccessToken,
  get config() {
    return authConfig;
  },
};
