/**
 * Estado global de la app (usuarios, usuario activo, tipo, modal history, viewAll pagination).
 * Con Auth0: cada usuario tiene sus perfiles en localStorage bajo rv_users_${auth0Sub}.
 */
const storage = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem: () => {} };
const defaultUsers = [
  {
    id: 1,
    name: 'Guest',
    avatar: 'https://image.tmdb.org/t/p/w185/39U9p9WvK8M4hN8G189R5G0vL0G.jpg',
    myList: [],
    favorites: [],
    continueWatching: [],
    rowPrefs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
];

function loadUsersFromKey(key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export const state = {
  curT: 'movie',
  activeUser: null,
  editMode: false,
  selectedAv: '',
  modalHistory: [],
  historyIndex: -1,
  editingProfileId: null,
  currentShow: null,
  currP: 0,
  actU: '',
  /** Clave de localStorage para perfiles: 'rv_users' sin Auth0, 'rv_users_${sub}' con Auth0 */
  storageKey: 'rv_users',
  users: (() => {
    const loaded = loadUsersFromKey('rv_users');
    return loaded.length ? loaded : [...defaultUsers];
  })(),
};

/**
 * Cuando hay Auth0, asocia los perfiles al usuario (sub). Cada usuario solo ve los suyos.
 */
export function setAuth0User(sub) {
  if (!sub) return;
  const key = 'rv_users_' + sub;
  state.storageKey = key;
  const loaded = loadUsersFromKey(key);
  state.users = loaded.length ? loaded : [...defaultUsers];
}

export function persistUsers() {
  storage.setItem(state.storageKey, JSON.stringify(state.users));
}
