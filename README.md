# RV Plus

Proyecto personal de catálogo de películas y series con perfiles, listas y reproducción vía proxy. Arquitectura separada en **frontend** (HTML/CSS/JS modular) y **backend** (Node.js/Express) en JavaScript.

## Estructura

```
RV-Premium-ish/
├── backend/           # API Node.js (Express)
│   ├── server.js     # Proxy TMDB, proxy stream, perfiles
│   ├── package.json
│   └── .env.example
├── frontend/         # Interfaz estática
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── config.js   # RV_CONFIG (USE_BACKEND, TMDB key, Worker URL)
│       ├── api.js     # getTmdb, getProxyStream, profiles*
│       ├── state.js   # Estado global (users, activeUser, curT, etc.)
│       ├── theme.js   # Tema y persistencia
│       ├── profiles.js # Login, perfiles, crear/editar/borrar
│       ├── player.js  # playContent, playTV, overlay
│       └── app.js     # initApp, categorías, detalle, búsqueda, filtros
├── index.html        # Versión monolítica original (por si la quieres usar)
└── README.md
```

## Cómo arrancar

### Con backend (recomendado)

1. **Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Edita .env: TMDB_API_KEY, WORKER_PROXY_URL
   npm install
   npm start
   ```
   Servidor en `http://localhost:3000`. Sirve el frontend y las rutas `/api/*`.

2. **Frontend**  
   Se sirve desde el mismo origen. Abre `http://localhost:3000`.  
   En `frontend/js/config.js` deja `USE_BACKEND: true` para usar el proxy del backend (la API key no va en el navegador).

### Sin backend (solo frontend)

1. Pon en `frontend/js/config.js`: `USE_BACKEND: false` y tu `TMDB_API_KEY`.
2. Abre `frontend/index.html` con un servidor estático (p. ej. `npx serve frontend`) o desde el backend sin `TMDB_API_KEY` en `.env` (el frontend llamará a TMDB y al Worker directamente).

## Variables de entorno (backend)

| Variable          | Descripción                          |
|-------------------|--------------------------------------|
| `PORT`            | Puerto (default 3000)                 |
| `TMDB_API_KEY`    | API key de TMDB                      |
| `WORKER_PROXY_URL`| URL del Worker de Cloudflare (proxy) |

## Rutas API (backend)

- `GET /api/tmdb/*` – Proxy a TMDB (añade `api_key`).
- `GET /api/proxy?url=...` – Proxy de stream (Worker).
- `POST /api/profiles/save` – Guardar perfil (reenvío al Worker).
- `GET /api/profiles/load?id=` – Cargar perfil.
- `GET /api/profiles/load-all` – Cargar todos los perfiles.
- `POST /api/profiles/delete` – Borrar perfil.

## Mejoras incluidas

- **Frontend/backend separados** en JavaScript.
- **Módulos ES** en el frontend (api, state, theme, profiles, player, app).
- **Tema** y estilos en `css/styles.css`; componentes (cards, modales, hero, filtros) conservados.
- **switchTab** en detalle de TV (pestañas Episodios / Similar).
- **Paginación** en View All con `currP`/`actU` y botón “Load 60 More”.
- **Config** única: `USE_BACKEND` para elegir proxy backend o llamadas directas a TMDB/Worker.

Si tienes el favicon `rvpluslogo1.jpeg`, cópialo en `frontend/` para que se vea en la pestaña.
