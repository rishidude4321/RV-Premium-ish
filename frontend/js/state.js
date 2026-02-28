/**
 * Estado global de la app (usuarios, usuario activo, tipo, modal history, viewAll pagination).
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

function loadUsers() {
  try {
    const raw = storage.getItem('rv_users');
    return raw ? JSON.parse(raw) : [...defaultUsers];
  } catch (_) {
    return [...defaultUsers];
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
  users: loadUsers(),
};

export function persistUsers() {
  storage.setItem('rv_users', JSON.stringify(state.users));
}
