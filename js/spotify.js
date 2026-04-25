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

// ── SPOTIFY API CALLS ──

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

  const artEl = document.getElementById('sp-art');
  const focusArtEl = document.getElementById('focus-art');
  const placeholder = document.getElementById('sp-art-placeholder');
  if (albumArt) {
    let img = artEl.querySelector('img');
    if (!img) { img = document.createElement('img'); artEl.appendChild(img); }
    img.src = albumArt;
    if (placeholder) placeholder.style.display = 'none';

    let fimg = focusArtEl.querySelector('img');
    if (!fimg) { fimg = document.createElement('img'); focusArtEl.appendChild(fimg); }
    fimg.src = albumArt;
    focusArtEl.querySelector('svg') && (focusArtEl.querySelector('svg').style.display = 'none');
  }

  const pct = Math.round((progress / duration) * 100);
  document.getElementById('sp-progress-bar').style.width = pct + '%';
  document.getElementById('sp-progress-wrap').style.display = '';

  setPlayIcon(isPlaying);
}

function setPlayIcon(playing) {
  const playPath = playing
    ? 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'
    : 'M8 5v14l11-7z';
  document.getElementById('sp-play-icon').querySelector('path').setAttribute('d', playPath);
  document.getElementById('focus-play-icon').querySelector('path').setAttribute('d', playPath);
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
  document.getElementById('sp-track').textContent = 'Connected';
  document.getElementById('sp-artist').textContent = 'Fetching...';
}

function setSpotifyDisconnected() {
  document.getElementById('sp-connect-area').style.display = '';
  document.getElementById('sp-controls-connected').style.display = 'none';
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
