// ── PKCE HELPERS ──

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function loginSpotify() {
  const verifier = generateRandomString(128);
  const challenge = await generateCodeChallenge(verifier);
  localStorage.setItem('sp_verifier', verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location = 'https://accounts.spotify.com/authorize?' + params.toString();
}

async function exchangeCode(code) {
  const verifier = localStorage.getItem('sp_verifier');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('sp_access_token', data.access_token);
    localStorage.setItem('sp_refresh_token', data.refresh_token);
    localStorage.setItem('sp_expires_at', Date.now() + data.expires_in * 1000);
    localStorage.removeItem('sp_verifier');
    window.history.replaceState({}, '', '/');
    initSpotify();
  }
}

async function refreshToken() {
  const rt = localStorage.getItem('sp_refresh_token');
  if (!rt) return false;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: rt,
    }),
  });
  const data = await res.json();
  if (data.access_token) {
    localStorage.setItem('sp_access_token', data.access_token);
    localStorage.setItem('sp_expires_at', Date.now() + data.expires_in * 1000);
    if (data.refresh_token) localStorage.setItem('sp_refresh_token', data.refresh_token);
    return true;
  }
  return false;
}

async function getToken() {
  const exp = parseInt(localStorage.getItem('sp_expires_at') || '0');
  if (Date.now() > exp - 60000) {
    const ok = await refreshToken();
    if (!ok) { clearSpotifyAuth(); return null; }
  }
  return localStorage.getItem('sp_access_token');
}

function clearSpotifyAuth() {
  localStorage.removeItem('sp_access_token');
  localStorage.removeItem('sp_refresh_token');
  localStorage.removeItem('sp_expires_at');
  setSpotifyDisconnected();
}

// ── SPOTIFY API ──

async function spFetch(endpoint, method = 'GET', body = null) {
  const token = await getToken();
  if (!token) return null;
  const opts = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch('https://api.spotify.com/v1' + endpoint, opts);
  if (res.status === 204 || res.status === 202) return {};
  if (!res.ok) return null;
  try { return await res.json(); } catch { return {}; }
}

async function fetchCurrentTrack() {
  const data = await spFetch('/me/player/currently-playing');
  if (!data || !data.item) {
    const player = await spFetch('/me/player');
    if (!player || !player.item) { updateSpotifyUI(null); return; }
    updateSpotifyUI(player);
    return;
  }
  updateSpotifyUI(data);
}

// ── PLAYLISTS ──

let playlistsLoaded = false;

async function fetchPlaylists() {
  if (playlistsLoaded) return;
  const data = await spFetch('/me/playlists?limit=20');
  if (!data || !data.items) return;
  playlistsLoaded = true;
  const container = document.getElementById('playlist-items');
  container.innerHTML = '';
  data.items.forEach(pl => {
    const img = pl.images?.[0]?.url || '';
    const div = document.createElement('div');
    div.className = 'playlist-item';
    div.innerHTML = `
      <div class="pl-art" style="${img ? `background-image:url('${img}');background-size:cover;background-position:center;` : ''}">
        ${!img ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="white" opacity="0.6"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' : ''}
      </div>
      <span class="pl-name">${escHtmlSp(pl.name)}</span>
      <button class="pl-play-btn" onclick="playPlaylist('${pl.uri}', '${escHtmlSp(pl.name)}')" title="Play">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>
      </button>`;
    container.appendChild(div);
  });
}

function escHtmlSp(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function playPlaylist(uri, name) {
  await spFetch('/me/player/play', 'PUT', { context_uri: uri });
  setTimeout(fetchCurrentTrack, 600);
  togglePlaylistPanel(false);
}

let playlistPanelOpen = false;

function togglePlaylistPanel(forceState) {
  const panel = document.getElementById('playlist-panel');
  playlistPanelOpen = forceState !== undefined ? forceState : !playlistPanelOpen;
  panel.classList.toggle('open', playlistPanelOpen);
  if (playlistPanelOpen) fetchPlaylists();
}

// close panel when clicking outside
document.addEventListener('click', (e) => {
  if (!playlistPanelOpen) return;
  const panel = document.getElementById('playlist-panel');
  const btn = document.getElementById('playlist-toggle-btn');
  if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
    togglePlaylistPanel(false);
  }
});

// ── VOLUME ──

let currentVolume = 70;

async function fetchVolume() {
  const player = await spFetch('/me/player');
  if (player && player.device && typeof player.device.volume_percent === 'number') {
    currentVolume = player.device.volume_percent;
    document.getElementById('volume-slider').value = currentVolume;
    updateVolumeIcon(currentVolume);
  }
}

async function setVolume(val) {
  currentVolume = parseInt(val);
  updateVolumeIcon(currentVolume);
  await spFetch(`/me/player/volume?volume_percent=${currentVolume}`, 'PUT');
}

function updateVolumeIcon(vol) {
  const path = vol === 0
    ? 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'
    : vol < 50
    ? 'M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z'
    : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
  document.querySelectorAll('.vol-icon-path').forEach(el => el.setAttribute('d', path));
}

function toggleVolume() {
  const wrap = document.getElementById('volume-wrap');
  wrap.classList.toggle('open');
  if (wrap.classList.contains('open')) fetchVolume();
}

// ── UI UPDATE ──

function updateSpotifyUI(data) {
  if (!data || !data.item) {
    document.getElementById('sp-track').textContent = 'Nothing playing';
    document.getElementById('sp-artist').textContent = 'Open Spotify and play something';
    document.getElementById('focus-track-name').textContent = 'Nothing playing';
    setPlayIcon(false);
    return;
  }
  const track = data.item;
  const isPlaying = data.is_playing;
  const trackName = track.name;
  const artistName = track.artists?.map(a => a.name).join(', ') || '';
  const albumArt = track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '';
  const progress = data.progress_ms || 0;
  const duration = track.duration_ms || 1;

  document.getElementById('sp-track').textContent = trackName;
  document.getElementById('sp-artist').textContent = artistName;
  document.getElementById('focus-track-name').textContent = trackName + (artistName ? ' · ' + artistName : '');

  // current track URI for open in spotify link
  const trackUri = track.external_urls?.spotify || 'https://open.spotify.com';
  document.getElementById('open-spotify-link').href = trackUri;
  document.getElementById('focus-open-spotify').href = trackUri;

  // Album art
  ['sp-art', 'focus-art'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (albumArt) {
      let img = el.querySelector('img');
      if (!img) { img = document.createElement('img'); el.appendChild(img); }
      img.src = albumArt;
      const ph = el.querySelector('svg, .spotify-art-placeholder');
      if (ph) ph.style.display = 'none';
    }
  });
  const placeholder = document.getElementById('sp-art-placeholder');
  if (placeholder && albumArt) placeholder.style.display = 'none';

  const pct = Math.round((progress / duration) * 100);
  document.getElementById('sp-progress-bar').style.width = pct + '%';
  document.getElementById('sp-progress-wrap').style.display = '';

  setPlayIcon(isPlaying);
}

function setPlayIcon(playing) {
  const playPath = playing ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z' : 'M8 5v14l11-7z';
  document.querySelectorAll('.sp-play-path').forEach(el => el.setAttribute('d', playPath));
}

async function spPlayPause() {
  const player = await spFetch('/me/player');
  if (!player) return;
  if (player.is_playing) {
    await spFetch('/me/player/pause', 'PUT');
    setPlayIcon(false);
  } else {
    await spFetch('/me/player/play', 'PUT');
    setPlayIcon(true);
  }
  setTimeout(fetchCurrentTrack, 300);
}

async function spPrev() {
  await spFetch('/me/player/previous', 'POST');
  setTimeout(fetchCurrentTrack, 500);
}

async function spNext() {
  await spFetch('/me/player/next', 'POST');
  setTimeout(fetchCurrentTrack, 500);
}

function setSpotifyConnected() {
  document.getElementById('sp-connect-area').style.display = 'none';
  document.getElementById('sp-controls-connected').style.display = '';
  document.getElementById('sp-extra-controls').style.display = '';
  document.getElementById('sp-track').textContent = 'Connected';
  document.getElementById('sp-artist').textContent = 'Fetching...';
}

function setSpotifyDisconnected() {
  document.getElementById('sp-connect-area').style.display = '';
  document.getElementById('sp-controls-connected').style.display = 'none';
  document.getElementById('sp-extra-controls').style.display = 'none';
  document.getElementById('sp-progress-wrap').style.display = 'none';
  document.getElementById('sp-track').textContent = 'Not connected';
  document.getElementById('sp-artist').textContent = '—';
  document.getElementById('focus-track-name').textContent = '—';
}

function initSpotify() {
  setSpotifyConnected();
  fetchCurrentTrack();
  setInterval(fetchCurrentTrack, 5000);
}