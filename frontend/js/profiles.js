/**
 * Perfiles: login, logout, crear/editar/borrar, sincronización con backend/worker.
 */
import * as api from './api.js';
import { state, persistUsers } from './state.js';

const C = window.RV_CONFIG || {};
const POSTER_PATH = C.POSTER_PATH || 'https://image.tmdb.org/t/p/w500';

function renderProfiles() {
  const list = document.getElementById('profileList');
  if (!list) return;
  const users = state.users;
  list.innerHTML = users
    .map(
      (u) => `
    <div class="profile-item" onclick="window.handleProfile(${u.id})">
      <img src="${u.avatar}" alt=""><p>${u.name}</p>
    </div>`
    )
    .join('');
}

function handleProfile(id) {
  if (state.editMode) openProfileCreation(id);
  else login(id);
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  const btn = document.getElementById('editBtn');
  if (btn) btn.innerText = state.editMode ? 'Done' : 'Settings';
  renderProfiles();
}

async function login(id) {
  const users = state.users;
  state.activeUser = users.find((u) => u.id === id);
  try {
    const cloudData = await api.profilesLoad(id);
    if (cloudData && cloudData.watch_history) {
      state.activeUser.continueWatching = JSON.parse(cloudData.watch_history);
    }
  } catch (_) {}
  document.getElementById('profileGate').style.display = 'none';
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('mainHeader').style.display = 'block';
  const nameEl = document.getElementById('navUserName');
  const avatarEl = document.getElementById('navUserAvatar');
  if (nameEl) nameEl.innerText = state.activeUser.name;
  if (avatarEl) avatarEl.src = state.activeUser.avatar;
  if (typeof window.initApp === 'function') window.initApp();
}

function logout() {
  location.reload();
}

function openProfileCreation(id = null) {
  state.editingProfileId = id;
  const deleteArea = document.getElementById('deleteArea');
  const title = document.getElementById('creationTitle');
  const nameInput = document.getElementById('pName');
  const customAvInput = document.getElementById('pCustom');
  document.getElementById('profileGate').style.display = 'none';
  document.getElementById('profileCreation').style.display = 'flex';
  const users = state.users;

  if (id) {
    const profile = users.find((u) => u.id === id);
    title.innerText = 'Edit Profile';
    nameInput.value = profile.name;
    state.selectedAv = profile.avatar;
    if (users.length > 1) {
      deleteArea.innerHTML = `<button class="ctrl-btn" style="background:#800; color:white; width:100%;" onclick="window.deleteProfile(${id})">Delete Profile</button>`;
    } else {
      deleteArea.innerHTML = '';
    }
  } else {
    title.innerText = 'Create Profile';
    nameInput.value = '';
    if (customAvInput) customAvInput.value = '';
    deleteArea.innerHTML = '';
    state.selectedAv = '';
  }
}

async function deleteProfile(id) {
  if (!confirm('Are you sure you want to delete this profile? It will be removed from all devices.')) return;
  try {
    await api.profilesDelete(id);
    state.users = state.users.filter((u) => u.id !== id);
    persistUsers();
    renderProfiles();
    closeCreation();
  } catch (err) {
    console.error('Delete failed:', err);
    alert('Could not delete from cloud. Please check your connection.');
  }
}

function selectAvatar(element) {
  document.querySelectorAll('#avatarGallery img').forEach((img) => (img.style.borderColor = 'transparent'));
  element.style.borderColor = 'var(--accent-color)';
  state.selectedAv = element.src;
}

async function saveProfile() {
  const n = document.getElementById('pName')?.value?.trim();
  const customAv = document.getElementById('pCustom')?.value?.trim();
  const finalAv = customAv || state.selectedAv || 'https://image.tmdb.org/t/p/w185/39U9p9WvK8M4hN8G189R5G0vL0G.jpg';
  if (!n) {
    alert('Please enter a name');
    return;
  }
  const profileId = state.editingProfileId || Date.now();
  const profileData = {
    id: profileId,
    name: n,
    avatar: finalAv,
    watch_history: JSON.stringify([]),
  };
  try {
    await api.profilesSave(profileData);
    const users = state.users;
    if (state.editingProfileId) {
      const index = users.findIndex((u) => u.id === state.editingProfileId);
      users[index].name = n;
      users[index].avatar = finalAv;
    } else {
      users.push({
        id: profileId,
        name: n,
        avatar: finalAv,
        myList: [],
        favorites: [],
        continueWatching: [],
        rowPrefs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      });
    }
    state.users = users;
    persistUsers();
    renderProfiles();
    closeCreation();
  } catch (err) {
    console.error('Save failed:', err);
    alert('Could not save to cloud. Ensure your Worker is deployed and Binding is set.');
  }
}

function closeCreation() {
  document.getElementById('profileCreation').style.display = 'none';
  document.getElementById('profileGate').style.display = 'flex';
}

export {
  renderProfiles,
  handleProfile,
  toggleEditMode,
  login,
  logout,
  openProfileCreation,
  deleteProfile,
  selectAvatar,
  saveProfile,
  closeCreation,
};
