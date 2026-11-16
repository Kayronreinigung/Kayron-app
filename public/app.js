'use strict';
/* Kayron Zeiterfassung – Frontend (ohne Framework) */

// ================= Hilfsfunktionen =================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localMonth(d = new Date()) { return localDate(d).slice(0, 7); }
function addDays(dateStr, n) { const d = new Date(dateStr + 'T12:00'); d.setDate(d.getDate() + n); return localDate(d); }
function shiftMonth(m, n) { const [y, mo] = m.split('-').map(Number); return localMonth(new Date(y, mo - 1 + n, 1)); }
function monthEnd(m) { const [y, mo] = m.split('-').map(Number); return `${m}-${pad(new Date(y, mo, 0).getDate())}`; }

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function fmtDate(d, withDay = true) {
  const [y, m, day] = d.slice(0, 10).split('-');
  const wd = WEEKDAYS[new Date(`${y}-${m}-${day}T12:00`).getDay()];
  return (withDay ? wd + ', ' : '') + `${day}.${m}.${y}`;
}
function fmtTime(dt) { return dt ? dt.slice(11, 16) : '–'; }
function fmtMonth(m) { const [y, mo] = m.split('-'); return `${MONTHS[Number(mo) - 1]} ${y}`; }
function fmtDur(min) { min = Math.max(0, Math.round(min)); return `${Math.floor(min / 60)}:${pad(min % 60)} h`; }
function fmtDec(min) { return (min / 60).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const money = (n) => Number(n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

function endLabel(e) {
  if (!e.end) return '<span class="badge ok"><span class="live-dot"></span>läuft</span>';
  const t = fmtTime(e.end);
  return e.end.slice(0, 10) !== e.start.slice(0, 10) ? `${t} <span class="muted small">(+1)</span>` : t;
}

const EMPLOYMENT = { minijob: 'Minijob', teilzeit: 'Teilzeit', vollzeit: 'Vollzeit', aushilfe: 'Aushilfe', inhaber: 'Inhaber/in' };

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  wifi_off: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.1-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-11.3-3.7M12 20h.01"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

// ================= Standort =================
// Ermittelt den aktuellen GPS-Standort. Bei Ablehnung/Fehler kommt { error } zurück – Stempeln geht trotzdem.
function getLocation(timeoutMs = 12000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'Gerät unterstützt keinen Standort' });
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    setTimeout(() => finish({ error: 'Standort nicht rechtzeitig gefunden' }), timeoutMs + 1000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => finish({ error: err.code === 1 ? 'Standortzugriff wurde nicht erlaubt' : 'Standort nicht verfügbar' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
function fmtDist(m) { return m >= 1000 ? (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' km' : m + ' m'; }

// Standort-Anzeige für Beginn ('start') oder Ende ('end') eines Eintrags
function locBadge(e, which) {
  const lat = e[which + '_lat'], lng = e[which + '_lng'];
  if (lat === null || lat === undefined) return '<span class="badge" title="Kein Standort gespeichert">kein Standort</span>';
  const dist = e[which + '_distance'];
  let cls = 'brand', txt = 'Karte';
  if (dist !== null && dist !== undefined) {
    const tolerance = 250 + (e[which + '_acc'] || 0);
    cls = dist <= tolerance ? 'ok' : 'warn';
    txt = dist <= tolerance ? 'am Objekt' : fmtDist(dist) + ' entfernt';
  }
  return `<a class="badge ${cls} loc" href="${mapsUrl(lat, lng)}" target="_blank" rel="noopener" title="Genauigkeit ±${e[which + '_acc'] ?? '?'} m">${icon('pin')}${txt}</a>`;
}

// ================= Fotos =================
// Verkleinert ein Foto im Browser (max. 1600 px, JPEG), damit der Upload mobil schnell geht
function compressImage(file, maxSide = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}
const photoUrl = (p) => `/api/photos/${p.id}/file`;

function photoGrid(photos, { showWho = true, showDate = false } = {}) {
  if (!photos.length) return '<div class="empty">Keine Fotos.</div>';
  return `<div class="photo-grid">${photos.map((p) => `
    <button type="button" class="photo-thumb" data-photo="${p.id}" title="${esc(p.note)}">
      <img src="${photoUrl(p)}" alt="${esc(p.note || 'Foto')}" loading="lazy">
      <span class="photo-cap">${p.note ? esc(p.note) + '<br>' : ''}${showDate ? fmtDate(p.taken_at, false) + ' ' : ''}${fmtTime(p.taken_at)}${showWho ? ' · ' + esc(p.user_name) : ''}</span>
    </button>`).join('')}</div>`;
}

// Klick auf ein Vorschaubild öffnet die Großansicht
function bindPhotoGrid(root, photos, onChange) {
  $$('[data-photo]', root).forEach((b) => b.onclick = () => {
    const p = photos.find((x) => x.id === Number(b.dataset.photo));
    if (p) openPhoto(p, onChange);
  });
}

function openPhoto(p, onChange) {
  const canDelete = isAdmin() || (p.user_id === state.user.id && p.taken_at.slice(0, 10) === localDate());
  openModal(p.note || 'Foto', `
    <img src="${photoUrl(p)}" alt="" style="width:100%;border-radius:10px;display:block;background:#eee">
    <p class="small" style="margin:10px 0 0">
      <strong>${esc(p.user_name)}</strong> · ${fmtDate(p.taken_at)}, ${fmtTime(p.taken_at)} Uhr<br>
      ${esc(p.site_name || 'ohne Objekt')}
      ${p.lat !== null ? ` · <a href="${mapsUrl(p.lat, p.lng)}" target="_blank" rel="noopener">Aufnahmeort auf Karte</a>` : ''}
    </p>`, {
    wide: true, saveLabel: 'Original öffnen',
    onSave: async () => { window.open(photoUrl(p), '_blank'); },
    onDelete: canDelete ? async () => { await api('DELETE', `/api/photos/${p.id}`); toast('Foto gelöscht'); onChange ? onChange() : render(); } : null
  });
}

// Lädt ein oder mehrere Fotos hoch (Standort wird mitgeschickt, wenn verfügbar).
// Ohne Internet werden sie auf dem Handy gespeichert und später automatisch hochgeladen.
async function uploadPhotos(files, note, { entryId } = {}) {
  const loc = await getLocation(6000);
  const out = { sent: 0, queued: 0 };
  for (const file of files) {
    const image = await compressImage(file);
    const r = await Offline.send('/api/photos', { image, note, entry_id: entryId || null, location: loc.error ? null : loc },
      { label: 'Foto' + (note ? ' „' + note + '“' : ''), userId: state.user.id });
    if (r.queued) out.queued++; else out.sent++;
  }
  return out;
}

// ================= API =================
const netError = () => Object.assign(new Error('Keine Internetverbindung'), { network: true });

async function api(method, url, body, { timeout = 30000, silent401 = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const opts = { method, headers: {}, credentials: 'same-origin', signal: ctrl.signal };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res, data = null;
  try {
    res = await fetch(url, opts);
    try { data = await res.json(); } catch { /* leer */ }
  } catch {
    throw netError();
  } finally {
    clearTimeout(timer);
  }
  if ([502, 503, 504].includes(res.status)) throw netError();
  if (res.status === 401 && state.user && !silent401 && url !== '/api/status') {
    state.user = null;
    try { localStorage.removeItem('lastUser'); } catch { /* egal */ }
    render();
  }
  if (!res.ok) throw Object.assign(new Error((data && data.error) || `Fehler ${res.status}`), { status: res.status });
  return data;
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = ''; }, 3200);
}

// ================= Zustand & Router =================
const state = { user: null, companyName: 'Kayron Reinigung', needsSetup: false, settings: null, sites: [], users: [] };
let timers = [];
function clearTimers() { timers.forEach(clearInterval); timers = []; }

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?');
  return { page: p || '', params: new URLSearchParams(q || '') };
}
function go(page, params) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  location.hash = `#/${page}${q}`;
}

const isAdmin = () => state.user && state.user.role === 'admin';

function navItems() {
  if (isAdmin()) {
    return [
      { page: 'uebersicht', label: 'Übersicht', icon: 'home', mobile: true },
      { page: 'stempeln', label: 'Stempeluhr', icon: 'clock' },
      { page: 'zeiten', label: 'Zeiten', icon: 'list', mobile: true },
      { page: 'abwesenheiten', label: 'Urlaub & Krank', short: 'Abwesend', icon: 'calendar', mobile: true, badge: 'absences' },
      { page: 'meldungen', label: 'Meldungen', icon: 'alert', mobile: true, badge: 'issues' },
      { page: 'mitarbeiter', label: 'Mitarbeiter', icon: 'users' },
      { page: 'objekte', label: 'Objekte', icon: 'building' },
      { page: 'schluessel', label: 'Schlüssel', icon: 'key' },
      { page: 'fotos', label: 'Fotos', icon: 'camera' },
      { page: 'auswertung', label: 'Auswertung', icon: 'chart' },
      { page: 'einstellungen', label: 'Einstellungen', icon: 'settings' }
    ];
  }
  return [
    { page: 'stempeln', label: 'Stempeluhr', short: 'Stempeln', icon: 'clock', mobile: true },
    { page: 'meine-zeiten', label: 'Meine Zeiten', short: 'Zeiten', icon: 'list', mobile: true },
    { page: 'abwesenheiten', label: 'Urlaub & Krank', short: 'Urlaub', icon: 'calendar', mobile: true },
    { page: 'meldungen', label: 'Meldung machen', short: 'Melden', icon: 'alert', mobile: true },
    { page: 'konto', label: 'Konto', icon: 'user', mobile: true }
  ];
}

const PAGES = {
  uebersicht: { admin: true, render: pageDashboard },
  stempeln: { render: pageClock },
  zeiten: { admin: true, render: pageEntries },
  abwesenheiten: { render: pageAbsences },
  meldungen: { render: pageIssues },
  mitarbeiter: { admin: true, render: pageUsers },
  objekte: { admin: true, render: pageSites },
  schluessel: { admin: true, render: pageKeys },
  fotos: { admin: true, render: pagePhotos },
  auswertung: { admin: true, render: pageReport },
  einstellungen: { admin: true, render: pageSettings },
  nachweis: { render: pageTimesheet },
  'meine-zeiten': { render: pageMyEntries },
  konto: { render: pageAccount }
};

async function render() {
  clearTimers();
  closeModal();
  const app = $('#app');
  if (state.needsSetup) return renderSetup(app);
  if (!state.user) return renderLogin(app);
  try { localStorage.setItem('lastUser', JSON.stringify({ user: state.user, companyName: state.companyName })); } catch { /* egal */ }

  let { page, params } = parseHash();
  const def = isAdmin() ? 'uebersicht' : 'stempeln';
  if (!PAGES[page] || (PAGES[page].admin && !isAdmin())) { page = def; history.replaceState(null, '', `#/${def}`); }

  const items = navItems();
  const navLinks = (where) => items.filter((i) => where === 'side' || i.mobile).map((i) =>
    `<a href="#/${i.page}" class="${page === i.page ? 'active' : ''}">${icon(i.icon)}<span>${where === 'bottom' ? (i.short || i.label) : i.label}</span>` +
    (i.badge ? `<b class="nav-badge" data-badge="${i.badge}" hidden></b>` : '') + '</a>'
  ).join('');

  const moreActive = isAdmin() && !items.some((i) => i.page === page && i.mobile);
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><img src="/icon.svg" alt=""><span>${esc(state.companyName)}</span></div>
        <nav class="nav">${navLinks('side')}</nav>
        <div class="sidebar-foot">
          <div class="who">${esc(state.user.name)}</div>
          <div style="opacity:.7">${isAdmin() ? 'Administrator' : 'Mitarbeiter'}</div>
          <button class="btn small light" data-action="logout">${icon('logout')} Abmelden</button>
        </div>
      </aside>
      <div style="flex:1;min-width:0">
        <header class="topbar">
          <div class="brand"><img src="/icon.svg" alt=""><span>${esc(state.companyName)}</span></div>
          <button class="btn small light" data-action="logout" aria-label="Abmelden">${icon('logout')}</button>
        </header>
        <div id="offline-banner" hidden></div>
        <main class="main" id="page"><div class="loading">Lädt …</div></main>
      </div>
    </div>
    <nav class="bottom-nav">
      ${navLinks('bottom')}
      ${isAdmin() ? `<a href="#" data-action="more" class="${moreActive ? 'active' : ''}">${icon('more')}<span>Mehr</span></a>` : ''}
    </nav>`;

  $$('[data-action="logout"]', app).forEach((b) => b.onclick = logout);
  const more = $('[data-action="more"]', app);
  if (more) more.onclick = (e) => { e.preventDefault(); openMoreMenu(); };
  updateOfflineBanner();
  if (isAdmin()) {
    api('GET', '/api/badges', undefined, { timeout: 8000 }).then((b) => {
      $$('[data-badge]').forEach((el) => {
        const n = b[el.dataset.badge] || 0;
        el.textContent = n > 99 ? '99+' : n;
        el.hidden = !n;
      });
    }).catch(() => {});
  }

  const el = $('#page');
  try {
    await PAGES[page].render(el, params);
  } catch (err) {
    el.innerHTML = err.network
      ? `<div class="card empty">${icon('wifi_off')}<p><strong>Keine Internetverbindung.</strong><br>Diese Seite braucht Internet. Stempeln, Fotos und Meldungen funktionieren auch offline.</p>
          <button class="btn" onclick="render()">Erneut versuchen</button></div>`
      : `<div class="alert error">${esc(err.message)}</div>`;
  }
}

function openMoreMenu() {
  const items = navItems().filter((i) => !i.mobile);
  openModal('Menü', `
    <div class="grid" style="gap:8px">
      ${items.map((i) => `<a class="btn" style="justify-content:flex-start" href="#/${i.page}">${icon(i.icon)} ${i.label}</a>`).join('')}
      <button class="btn danger" style="justify-content:flex-start" data-action="logout">${icon('logout')} Abmelden</button>
    </div>`, { footer: false });
  $$('#modal-root a').forEach((a) => a.onclick = () => closeModal());
  $('#modal-root [data-action="logout"]').onclick = logout;
}

async function logout() {
  const waiting = (await Offline.pending(state.user && state.user.id)).length;
  if (waiting && !confirm(`Es warten noch ${waiting} offline gespeicherte Aktionen auf Übertragung. Sie werden gesendet, sobald du dich wieder anmeldest.

Trotzdem abmelden?`)) return;
  try { await api('POST', '/api/logout', {}); } catch { /* egal */ }
  try { localStorage.removeItem('lastUser'); } catch { /* egal */ }
  state.user = null;
  location.hash = '';
  render();
}

// ================= Modal =================
function openModal(title, bodyHtml, { onSave, saveLabel = 'Speichern', onDelete, footer = true, wide = false } = {}) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="max-width:720px"' : ''}>
        <div class="modal-head"><h2 style="margin:0">${esc(title)}</h2><button class="btn ghost small" data-close aria-label="Schließen">✕</button></div>
        <form class="modal-body" novalidate>
          <div class="alert error" hidden></div>
          ${bodyHtml}
          <button type="submit" hidden></button>
        </form>
        ${footer ? `<div class="modal-foot">
          ${onDelete ? '<button class="btn danger" data-delete>Löschen</button><span class="spacer"></span>' : ''}
          <button class="btn" data-close>Abbrechen</button>
          <button class="btn primary" data-save>${esc(saveLabel)}</button>
        </div>` : ''}
      </div>
    </div>`;
  const backdrop = $('.modal-backdrop', root);
  const form = $('form', root);
  const errBox = $('.alert.error', root);
  $$('[data-close]', root).forEach((b) => b.onclick = (e) => { e.preventDefault(); closeModal(); });
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closeModal(); });
  const doSave = async (e) => {
    e && e.preventDefault();
    if (!onSave) return;
    const btn = $('[data-save]', root);
    if (btn) btn.disabled = true;
    errBox.hidden = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      $$('input[type=checkbox]', form).forEach((c) => { data[c.name] = c.checked; });
      await onSave(data, form);
      closeModal();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  form.onsubmit = doSave;
  const saveBtn = $('[data-save]', root);
  if (saveBtn) saveBtn.onclick = doSave;
  const delBtn = $('[data-delete]', root);
  if (delBtn) delBtn.onclick = async (e) => {
    e.preventDefault();
    if (!confirm('Wirklich löschen?')) return;
    try { await onDelete(); closeModal(); } catch (err) { errBox.textContent = err.message; errBox.hidden = false; }
  };
  const first = $('input:not([type=hidden]), select, textarea', form);
  if (first && window.matchMedia('(min-width: 861px)').matches) first.focus();
  return form;
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ================= Daten laden =================
async function loadSites() {
  try {
    state.sites = await api('GET', '/api/sites');
    try { localStorage.setItem('sitesCache', JSON.stringify(state.sites)); } catch { /* egal */ }
  } catch (e) {
    if (!e.network) throw e;
    try { state.sites = JSON.parse(localStorage.getItem('sitesCache') || '[]'); } catch { state.sites = []; }
  }
  return state.sites;
}
async function loadUsers() { state.users = await api('GET', '/api/users'); return state.users; }
async function loadSettings() { state.settings = await api('GET', '/api/settings'); return state.settings; }

function siteOptions(selected, { includeInactive = false, emptyLabel = '– kein Objekt –' } = {}) {
  return `<option value="">${esc(emptyLabel)}</option>` + state.sites
    .filter((s) => includeInactive || s.active !== 0 || String(s.id) === String(selected))
    .map((s) => `<option value="${s.id}" ${String(s.id) === String(selected) ? 'selected' : ''}>${esc(s.name)}${s.customer ? ' – ' + esc(s.customer) : ''}</option>`).join('');
}
function userOptions(selected, { emptyLabel } = {}) {
  return (emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : '') + state.users
    .filter((u) => u.active || String(u.id) === String(selected))
    .map((u) => `<option value="${u.id}" ${String(u.id) === String(selected) ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
}

// ================= Login / Einrichtung =================
function renderLogin(app) {
  app.innerHTML = `
    <div class="auth-wrap">
      <form class="auth-card" id="login-form">
        <img class="logo" src="/icon.svg" alt="">
        <h1>${esc(state.companyName)}</h1>
        <p class="muted" style="margin-top:0">Zeiterfassung – bitte anmelden</p>
        <div class="alert error" hidden></div>
        <div class="field"><label for="u">Benutzername</label><input id="u" name="username" autocomplete="username" autocapitalize="none" required></div>
        <div class="field"><label for="p">Passwort / PIN</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn primary" type="submit">Anmelden</button>
      </form>
    </div>`;
  const form = $('#login-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.alert', form);
    err.hidden = true;
    try {
      const r = await api('POST', '/api/login', Object.fromEntries(new FormData(form)));
      state.user = r.user;
      render();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
  $('#u').focus();
}

function renderSetup(app) {
  app.innerHTML = `
    <div class="auth-wrap">
      <form class="auth-card" id="setup-form">
        <img class="logo" src="/icon.svg" alt="">
        <h1>Willkommen!</h1>
        <p class="muted" style="margin-top:0">Lege einmalig dein Admin-Konto an.</p>
        <div class="alert error" hidden></div>
        <div class="field"><label>Firmenname</label><input name="companyName" value="Kayron Reinigung" required></div>
        <div class="field"><label>Dein Name</label><input name="name" required autocomplete="name"></div>
        <div class="field"><label>Benutzername</label><input name="username" required autocapitalize="none" autocomplete="username"></div>
        <div class="field"><label>Passwort (min. 6 Zeichen)</label><input name="password" type="password" required autocomplete="new-password"></div>
        <button class="btn primary" type="submit">Konto anlegen</button>
      </form>
    </div>`;
  const form = $('#setup-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('.alert', form);
    err.hidden = true;
    try {
      await api('POST', '/api/setup', Object.fromEntries(new FormData(form)));
      await boot();
      go('mitarbeiter');
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
}

// ================= Seite: Übersicht (Admin) =================
async function pageDashboard(el) {
  const d = await api('GET', '/api/dashboard');
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Übersicht</h1><div class="muted">${fmtDate(localDate())}</div></div>
      <div class="actions">
        <button class="btn primary" id="add-entry">${icon('plus')} Zeit eintragen</button>
      </div>
    </div>
    <div class="grid stats">
      <div class="card stat"><div class="label">Gerade im Einsatz</div><div class="value">${d.running.length}</div></div>
      <div class="card stat"><div class="label">Stunden heute</div><div class="value">${fmtDur(d.todayMinutes)}</div></div>
      <div class="card stat"><div class="label">Stunden ${MONTHS[new Date().getMonth()]}</div><div class="value">${fmtDur(d.monthMinutes)}</div></div>
      <div class="card stat"><div class="label">Aktive Mitarbeiter / Objekte</div><div class="value">${d.activeEmployees} / ${d.activeSites}</div></div>
    </div>
    <div class="grid two-col">
      <div class="card">
        <h2><span class="live-dot"></span>Jetzt im Einsatz</h2>
        ${d.running.length ? `<ul class="entry-list">${d.running.map((e) => `
          <li>
            <div><div class="when">${esc(e.user_name)}</div>
              <div class="muted small">${esc(e.site_name || 'ohne Objekt')} · seit ${fmtTime(e.start)}${e.start.slice(0, 10) !== localDate() ? ' (' + fmtDate(e.start, false) + ')' : ''}</div>
              <div style="margin-top:4px">${locBadge(e, 'start')}${e.photo_count ? ` <span class="badge">${e.photo_count} Foto${e.photo_count > 1 ? 's' : ''}</span>` : ''}</div></div>
            <div style="display:flex;gap:8px;align-items:center"><span class="dur" data-since="${e.start}"></span>
              <button class="btn small danger" data-stop="${e.id}" title="Ausstempeln">${icon('stop')}</button></div>
          </li>`).join('')}</ul>` : '<div class="empty">Niemand eingestempelt.</div>'}
      </div>
      <div class="card">
        <h2>Heute erfasst</h2>
        ${d.recent.length ? `<ul class="entry-list">${d.recent.map((e) => `
          <li><div><div class="when">${esc(e.user_name)}</div><div class="muted small">${esc(e.site_name || 'ohne Objekt')} · ${fmtTime(e.start)}–${e.end ? fmtTime(e.end) : 'läuft'}${e.photo_count ? ' · ' + e.photo_count + ' Foto' + (e.photo_count > 1 ? 's' : '') : ''}</div></div>
          <div class="dur">${fmtDur(e.minutes)}</div></li>`).join('')}</ul>` : '<div class="empty">Heute noch keine Einträge.</div>'}
      </div>
    </div>
    <div class="grid two-col" style="margin-top:16px">
      <div class="card">
        <div class="page-head" style="margin-bottom:8px"><h2 style="margin:0">${icon('calendar')} Abwesend & Anträge</h2><a class="btn small" href="#/abwesenheiten">Alle</a></div>
        ${d.absentToday.length ? `<ul class="entry-list">${d.absentToday.map((a) => `
          <li><div><div class="when">${esc(a.user_name)}</div><div class="muted small">bis ${fmtDate(a.end_date)}</div></div>${absenceBadge(a)}</li>`).join('')}</ul>`
          : '<div class="muted small" style="padding:6px 0 10px">Heute niemand abwesend.</div>'}
        ${d.pendingAbsences.length ? `<h3 style="margin-top:12px">Offene Anträge (${d.pendingAbsences.length})</h3>
          <ul class="entry-list">${d.pendingAbsences.slice(0, 5).map((a) => `
          <li><div><div class="when">${esc(a.user_name)} ${absenceBadge(a)}</div><div class="muted small">${fmtRange(a)} · ${a.days} Arbeitstag${a.days === 1 ? '' : 'e'}</div></div>
            <div class="nowrap"><button class="btn small" data-approve="${a.id}" title="Genehmigen">${icon('check')}</button> <button class="btn small danger" data-reject="${a.id}" title="Ablehnen">${icon('x')}</button></div></li>`).join('')}</ul>` : ''}
      </div>
      <div class="card">
        <div class="page-head" style="margin-bottom:8px"><h2 style="margin:0">${icon('alert')} Offene Meldungen${d.openIssueCount ? ` (${d.openIssueCount})` : ''}</h2><a class="btn small" href="#/meldungen">Alle</a></div>
        ${d.openIssues.length ? `<ul class="entry-list">${d.openIssues.map((i) => `
          <li><div><div class="when">${issueCategoryBadge(i)} ${esc(i.site_name || 'ohne Objekt')}</div>
            <div class="small">${esc(i.description).slice(0, 90)}${i.description.length > 90 ? ' …' : ''}</div>
            <div class="muted small">${esc(i.user_name)} · ${fmtDate(i.created_at, false)} ${fmtTime(i.created_at)}</div></div>${issueStatusBadge(i)}</li>`).join('')}</ul>`
          : '<div class="empty">Keine offenen Meldungen.</div>'}
        ${d.keysOut || d.keysLost ? `<p class="small" style="margin-bottom:0"><a href="#/schluessel">${icon('key')} ${d.keysOut} Schlüssel ausgegeben${d.keysLost ? ` · <span style="color:var(--danger)">${d.keysLost} verloren</span>` : ''}</a></p>` : ''}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="page-head" style="margin-bottom:8px"><h2 style="margin:0">${icon('camera')} Neueste Fotos</h2><a class="btn small" href="#/fotos">Alle Fotos</a></div>
      ${photoGrid(d.photos, { showDate: true })}
    </div>`;
  bindPhotoGrid(el, d.photos);
  bindAbsenceDecisions(el);
  startLiveDurations(el);
  $$('[data-stop]', el).forEach((b) => b.onclick = async () => {
    if (!confirm('Diesen Mitarbeiter jetzt ausstempeln?')) return;
    try { await api('POST', `/api/entries/${b.dataset.stop}/stop`, {}); toast('Ausgestempelt'); render(); } catch (e) { toast(e.message, true); }
  });
  $('#add-entry').onclick = async () => { await Promise.all([loadUsers(), loadSites()]); entryModal(null, render); };
}

function startLiveDurations(root) {
  const tick = () => $$('[data-since]', root).forEach((s) => {
    const mins = (Date.now() - new Date(s.dataset.since + ':00').getTime()) / 60000;
    s.textContent = fmtDur(mins);
  });
  tick();
  timers.push(setInterval(tick, 15000));
}

// ================= Seite: Stempeluhr =================
const PHOTO_LABELS = ['Treppenhaus', 'Eingang', 'Flur', 'Büro', 'Sanitär', 'Küche', 'Fenster'];

// Stempeluhr-Daten: vom Server – oder ohne Netz aus dem Zwischenspeicher, ergänzt um offline gespeicherte Aktionen
async function loadClockData() {
  await loadSites();
  const key = 'clockCache:' + state.user.id;
  const today = localDate();
  let c;
  try {
    c = await api('GET', '/api/clock', undefined, { timeout: 12000 });
    try { localStorage.setItem(key, JSON.stringify(c)); } catch { /* egal */ }
  } catch (e) {
    if (!e.network) throw e;
    try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch { c = null; }
    c = c || { running: null, today: [], photos: [] };
    c.today = c.today.filter((x) => x.start.slice(0, 10) === today || !x.end);
    c.photos = c.photos.filter((x) => x.taken_at.slice(0, 10) === today);
    c.offline = true;
  }
  const mins = (a, b) => Math.max(0, Math.round((new Date(b + ':00') - new Date(a + ':00')) / 60000));
  c.pendingPhotos = [];
  for (const it of await Offline.pending(state.user.id)) {
    if (it.url === '/api/clock/in') {
      const site = state.sites.find((x) => String(x.id) === String(it.body.site_id));
      c.running = { id: 'p-' + it.id, start: it.body.at, site_id: it.body.site_id, site_name: site ? site.name : '', note: '', break_minutes: 0, photo_count: 0, pending: true };
      c.today = [c.running, ...c.today];
    } else if (it.url === '/api/clock/out' && c.running) {
      const done = { ...c.running, end: it.body.at, break_minutes: it.body.break_minutes || 0, pending: true };
      c.today = c.today.map((x) => (x.id === c.running.id ? done : x));
      c.running = null;
    } else if (it.url === '/api/photos') {
      c.pendingPhotos.push(it);
    }
  }
  const now = Offline.nowStamp();
  c.today.forEach((x) => { x.minutes = Math.max(0, mins(x.start, x.end || now) - (x.break_minutes || 0)); });
  c.todayMinutes = c.today.filter((x) => x.start.slice(0, 10) === today).reduce((sum, x) => sum + x.minutes, 0);
  return c;
}

async function pageClock(el) {
  const c = await loadClockData();
  const r = c.running;
  const lastSite = localStorage.getItem('lastSite') || '';
  const canPhoto = !!(r || c.today.length);
  el.innerHTML = `
    <div class="page-head"><div><h1>Stempeluhr</h1><div class="muted">Hallo ${esc(state.user.name.split(' ')[0])} · ${fmtDate(localDate())}</div></div></div>
    <div class="card clock-card">
      ${c.offline ? `<div class="badge warn" style="margin-bottom:10px">${icon('wifi_off')}Offline – wird später übertragen</div>` : ''}
      <div class="clock-status ${r ? 'on' : ''}">${r ? '<span class="live-dot"></span>Eingestempelt seit ' + fmtTime(r.start) + (r.start.slice(0, 10) !== localDate() ? ' (' + fmtDate(r.start, false) + ')' : '') : 'Nicht eingestempelt'}</div>
      ${r ? `<div class="muted">${esc(r.site_name || 'ohne Objekt')}</div>` : ''}
      <div class="clock-time" id="clock-time">${r ? '0:00:00' : new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
      ${r ? `
        <form class="clock-form" id="clock-form">
          <div class="field"><label>Pause</label>
            <div class="chips" id="break-chips">${[0, 15, 30, 45, 60].map((m) => `<button type="button" class="chip ${m === 0 ? 'active' : ''}" data-min="${m}">${m} Min</button>`).join('')}</div>
            <input type="hidden" name="break_minutes" value="0">
          </div>
          <div class="field"><label>Notiz (optional)</label><input name="note" value="${esc(r.note)}" placeholder="z. B. Sonderreinigung Fenster"></div>
        </form>
        <button class="big-btn stop" id="clock-btn">${icon('stop')} Ausstempeln</button>
      ` : `
        <form class="clock-form" id="clock-form">
          <div class="field"><label for="site">Objekt / Kunde</label>
            <select id="site" name="site_id">${siteOptions(lastSite, { emptyLabel: '– Objekt wählen –' })}</select></div>
        </form>
        <button class="big-btn start" id="clock-btn">${icon('play')} Einstempeln</button>
      `}
      <div class="geo-hint muted small" id="geo-hint">${icon('pin')} Beim Stempeln wird dein Standort gespeichert.</div>
    </div>

    <div class="card">
      <h2>${icon('camera')} Fotos der Reinigung</h2>
      ${canPhoto ? `
        <p class="muted small" style="margin-top:-6px">Mach nach der Arbeit ein Foto, z. B. vom gereinigten Treppenhaus.</p>
        <div class="field"><label>Was ist auf dem Foto?</label>
          <div class="chips" id="photo-chips">${PHOTO_LABELS.map((l, i) => `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-label="${esc(l)}">${esc(l)}</button>`).join('')}</div>
          <input id="photo-note" value="${PHOTO_LABELS[0]}" maxlength="300" style="margin-top:8px" placeholder="Beschreibung">
        </div>
        <input type="file" id="photo-input" accept="image/*" capture="environment" multiple hidden>
        <input type="file" id="photo-gallery" accept="image/*" multiple hidden>
        <div class="photo-actions">
          <button class="btn primary" id="photo-btn">${icon('camera')} Foto machen</button>
          <button class="btn" id="gallery-btn">${icon('image')} Aus Galerie</button>
        </div>
        <div id="photo-status" class="muted small" style="margin-top:8px"></div>
        <div id="photo-list" style="margin-top:12px">${c.photos.length ? photoGrid(c.photos, { showWho: false }) : ''}</div>
        ${c.pendingPhotos.length ? `<div class="muted small" style="margin:12px 0 6px">${icon('wifi_off')} Warten auf Internet (${c.pendingPhotos.length}):</div>
          <div class="photo-grid">${c.pendingPhotos.map((it) => `<div class="photo-thumb pending"><img src="${it.body.image}" alt=""><span class="photo-cap">${esc(it.body.note || '')}<br>${fmtTime(it.body.at)} · wartet</span></div>`).join('')}</div>` : ''}
      ` : '<div class="empty">Bitte zuerst einstempeln – danach kannst du hier Fotos hochladen.</div>'}
    </div>

    <div class="card">
      <h2>Heute: ${fmtDur(c.todayMinutes)}</h2>
      ${c.today.length ? `<ul class="entry-list">${c.today.map((e) => `
        <li><div><div class="when">${fmtTime(e.start)} – ${e.end ? fmtTime(e.end) : 'läuft'}</div><div class="muted small">${esc(e.site_name || 'ohne Objekt')}${e.break_minutes ? ' · ' + e.break_minutes + ' Min Pause' : ''}${e.photo_count ? ' · ' + e.photo_count + ' Foto' + (e.photo_count > 1 ? 's' : '') : ''}${e.pending ? ' · <span style="color:var(--warn)">wartet auf Internet</span>' : ''}</div></div>
        <div class="dur">${fmtDur(e.minutes)}</div></li>`).join('')}</ul>` : '<div class="empty">Heute noch nichts erfasst.</div>'}
    </div>`;

  // Laufende Uhr
  const timeEl = $('#clock-time');
  if (r) {
    const startMs = new Date(r.start + ':00').getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      timeEl.textContent = `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    };
    tick(); timers.push(setInterval(tick, 1000));
    $$('#break-chips .chip').forEach((ch) => ch.onclick = () => {
      $$('#break-chips .chip').forEach((x) => x.classList.remove('active'));
      ch.classList.add('active');
      $('[name=break_minutes]').value = ch.dataset.min;
    });
  } else {
    timers.push(setInterval(() => { timeEl.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }, 10000));
  }

  // Ein-/Ausstempeln mit Standort
  $('#clock-btn').onclick = async () => {
    const btn = $('#clock-btn');
    const hint = $('#geo-hint');
    const data = Object.fromEntries(new FormData($('#clock-form')));
    if (!r && !data.site_id && state.sites.length && !confirm('Ohne Objekt einstempeln?')) return;
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.textContent = 'Standort wird ermittelt …';
    const loc = await getLocation();
    if (loc.error) {
      hint.innerHTML = `<span style="color:var(--warn)">${icon('pin')} ${esc(loc.error)} – es wird ohne Standort gestempelt.</span>`;
    }
    btn.textContent = r ? 'Wird ausgestempelt …' : 'Wird eingestempelt …';
    const location = loc.error ? null : loc;
    const opts = { userId: state.user.id };
    try {
      if (r) {
        const res = await Offline.send('/api/clock/out', { break_minutes: Number(data.break_minutes || 0), note: data.note, location }, { ...opts, label: 'Ausstempeln' });
        toast(res.queued ? 'Ausgestempelt – ohne Internet gespeichert, wird automatisch übertragen' : 'Ausgestempelt – schönen Feierabend!' + (location ? '' : ' (ohne Standort)'));
      } else {
        const res = await Offline.send('/api/clock/in', { site_id: data.site_id || null, location }, { ...opts, label: 'Einstempeln' });
        if (data.site_id) localStorage.setItem('lastSite', data.site_id);
        toast(res.queued ? 'Eingestempelt – ohne Internet gespeichert, wird automatisch übertragen' : 'Eingestempelt' + (location ? ' – Standort gespeichert' : ' (ohne Standort)'));
      }
      render();
    } catch (e) { toast(e.message, true); btn.disabled = false; btn.innerHTML = label; }
  };

  // Fotos
  if (canPhoto) {
    bindPhotoGrid(el, c.photos);
    $$('#photo-chips .chip').forEach((ch) => ch.onclick = () => {
      $$('#photo-chips .chip').forEach((x) => x.classList.remove('active'));
      ch.classList.add('active');
      $('#photo-note').value = ch.dataset.label;
    });
    $('#photo-btn').onclick = () => $('#photo-input').click();
    $('#gallery-btn').onclick = () => $('#photo-gallery').click();
    const onFiles = async (input) => {
      const files = [...input.files];
      input.value = '';
      if (!files.length) return;
      const status = $('#photo-status');
      $('#photo-btn').disabled = $('#gallery-btn').disabled = true;
      status.textContent = files.length > 1 ? `${files.length} Fotos werden hochgeladen …` : 'Foto wird hochgeladen …';
      try {
        const n = await uploadPhotos(files, $('#photo-note').value);
        if (n.queued) toast(`${n.queued === 1 ? 'Foto' : n.queued + ' Fotos'} ohne Internet gespeichert – wird automatisch hochgeladen`);
        else toast(n.sent > 1 ? `${n.sent} Fotos hochgeladen` : 'Foto hochgeladen');
        render();
      } catch (e) {
        status.textContent = '';
        toast(e.message, true);
        $('#photo-btn').disabled = $('#gallery-btn').disabled = false;
      }
    };
    $('#photo-input').onchange = (e) => onFiles(e.target);
    $('#photo-gallery').onchange = (e) => onFiles(e.target);
  }
}

// ================= Zeit-Eintrag (Formular) =================
function entryModal(entry, onDone, { asEmployee = false } = {}) {
  const e = entry || {};
  const date = e.start ? e.start.slice(0, 10) : localDate();
  const begin = e.start ? e.start.slice(11, 16) : '';
  const end = e.end ? e.end.slice(11, 16) : '';
  const running = entry && !entry.end;
  const details = entry && !asEmployee ? `
    <div class="entry-details">
      <div class="row">
        <div><div class="muted small">Standort Einstempeln</div>${entry.source === 'clock' ? locBadge(entry, 'start') : '<span class="muted small">nachgetragen</span>'}</div>
        <div><div class="muted small">Standort Ausstempeln</div>${entry.source === 'clock' && entry.end ? locBadge(entry, 'end') : '–'}</div>
      </div>
      <div id="entry-photos" style="margin-top:10px">${entry.photo_count ? '<span class="muted small">Fotos werden geladen …</span>' : '<span class="muted small">Keine Fotos zu diesem Einsatz.</span>'}</div>
    </div>` : '';
  const form = openModal(entry ? 'Eintrag bearbeiten' : 'Zeit eintragen', `
    ${details}
    ${asEmployee ? '' : `<div class="field"><label>Mitarbeiter</label><select name="user_id" required>${userOptions(e.user_id, { emptyLabel: '– wählen –' })}</select></div>`}
    <div class="field"><label>Objekt / Kunde</label><select name="site_id">${siteOptions(e.site_id)}</select></div>
    <div class="row3">
      <div class="field"><label>Datum</label><input type="date" name="date" value="${date}" required></div>
      <div class="field"><label>Beginn</label><input type="time" name="begin" value="${begin}" required></div>
      <div class="field"><label>Ende ${running ? '<span class="muted small">(leer = läuft)</span>' : ''}</label><input type="time" name="end" value="${end}" ${running ? '' : 'required'}></div>
    </div>
    <div class="row">
      <div class="field"><label>Pause (Minuten)</label><input type="number" name="break_minutes" min="0" step="5" value="${e.break_minutes || 0}"></div>
      <div class="field"><label>Arbeitszeit</label><input type="text" id="calc" disabled></div>
    </div>
    <div class="field"><label>Notiz</label><textarea name="note" placeholder="optional">${esc(e.note || '')}</textarea></div>
    <p class="muted small" style="margin:0">Liegt das Ende vor dem Beginn, wird es dem Folgetag zugerechnet (Nachtschicht).</p>
  `, {
    onSave: async (d) => {
      if (!asEmployee && !d.user_id) throw new Error('Bitte Mitarbeiter wählen');
      if (!d.date || !d.begin) throw new Error('Datum und Beginn angeben');
      if (!d.end && !running) throw new Error('Ende angeben');
      const start = `${d.date}T${d.begin}`;
      let endDt = null;
      if (d.end) endDt = `${d.end < d.begin ? addDays(d.date, 1) : d.date}T${d.end}`;
      const body = { site_id: d.site_id || null, start, end: endDt, break_minutes: Number(d.break_minutes || 0), note: d.note };
      if (!asEmployee) body.user_id = Number(d.user_id);
      if (entry) await api('PUT', `/api/entries/${entry.id}`, body);
      else await api('POST', '/api/entries', body);
      toast('Gespeichert');
      onDone && onDone();
    },
    onDelete: entry && !asEmployee ? async () => { await api('DELETE', `/api/entries/${entry.id}`); toast('Gelöscht'); onDone && onDone(); } : null
  });
  const calc = () => {
    const b = form.begin.value, en = form.end.value;
    if (!b || !en) { $('#calc').value = '–'; return; }
    let m = (Number(en.slice(0, 2)) * 60 + Number(en.slice(3))) - (Number(b.slice(0, 2)) * 60 + Number(b.slice(3)));
    if (m < 0) m += 1440;
    $('#calc').value = fmtDur(m - Number(form.break_minutes.value || 0));
  };
  ['begin', 'end', 'break_minutes'].forEach((n) => form[n].addEventListener('input', calc));
  calc();
  if (entry && entry.photo_count && !asEmployee) {
    api('GET', `/api/photos?entry_id=${entry.id}`).then((photos) => {
      const box = $('#entry-photos');
      if (!box) return;
      box.innerHTML = photoGrid(photos, { showWho: false });
      bindPhotoGrid(box, photos, onDone);
    }).catch(() => {});
  }
}

// ================= Seite: Zeiten (Admin) =================
async function pageEntries(el, params) {
  await Promise.all([loadUsers(), loadSites()]);
  const m = localMonth();
  const f = {
    from: params.get('from') || `${m}-01`,
    to: params.get('to') || monthEnd(m),
    user_id: params.get('user_id') || '',
    site_id: params.get('site_id') || ''
  };
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const entries = await api('GET', '/api/entries?' + qs);
  const total = entries.reduce((s, e) => s + e.minutes, 0);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Arbeitszeiten</h1><div class="muted">${entries.length} Einträge · ${fmtDur(total)} (${fmtDec(total)} Std.)</div></div>
      <div class="actions">
        <a class="btn" href="/api/export.csv?${qs}">${icon('download')} CSV / Excel</a>
        <button class="btn primary" id="add">${icon('plus')} Zeit eintragen</button>
      </div>
    </div>
    <div class="card">
      <form class="filters" id="filters">
        <div class="field narrow"><label>Von</label><input type="date" name="from" value="${f.from}"></div>
        <div class="field narrow"><label>Bis</label><input type="date" name="to" value="${f.to}"></div>
        <div class="field"><label>Mitarbeiter</label><select name="user_id">${userOptions(f.user_id, { emptyLabel: 'Alle' })}</select></div>
        <div class="field"><label>Objekt</label><select name="site_id">${siteOptions(f.site_id, { includeInactive: true, emptyLabel: 'Alle' })}</select></div>
      </form>
      ${entries.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Datum</th><th>Mitarbeiter</th><th class="hide-mobile">Objekt</th><th>Zeit</th><th class="right hide-mobile">Pause</th><th class="right">Dauer</th><th class="hide-mobile">Standort Ein / Aus · Fotos</th><th class="hide-mobile hide-mid">Notiz</th><th></th></tr></thead>
        <tbody>${entries.map((e) => `
          <tr>
            <td class="nowrap">${fmtDate(e.start)}</td>
            <td>${esc(e.user_name)}</td>
            <td class="hide-mobile">${esc(e.site_name || '–')}</td>
            <td class="nowrap num">${fmtTime(e.start)} – ${endLabel(e)}</td>
            <td class="right num hide-mobile">${e.break_minutes ? e.break_minutes + ' Min' : '–'}</td>
            <td class="right num nowrap"><strong>${fmtDur(e.minutes)}</strong></td>
            <td class="hide-mobile loc-cell">${e.source === 'clock' ? `${locBadge(e, 'start')} ${e.end ? locBadge(e, 'end') : ''}` : '<span class="muted small">nachgetragen</span>'}${e.photo_count ? ` <span class="badge brand">${icon('camera')}${e.photo_count}</span>` : ''}</td>
            <td class="hide-mobile hide-mid small muted" style="max-width:200px">${esc(e.note)}</td>
            <td class="right nowrap">${e.running ? `<button class="btn small danger" data-stop="${e.id}" title="Ausstempeln">${icon('stop')}</button> ` : ''}<button class="btn small" data-edit="${e.id}">Bearbeiten</button></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5" class="hide-mobile">Summe</td><td colspan="4" class="hide-mobile num">${fmtDur(total)}</td></tr></tfoot>
      </table></div>` : '<div class="empty">Keine Einträge im gewählten Zeitraum.</div>'}
    </div>`;

  $('#filters').onchange = () => go('zeiten', Object.fromEntries([...new FormData($('#filters'))].filter(([, v]) => v)));
  $('#add').onclick = () => entryModal(null, render);
  $$('[data-edit]', el).forEach((b) => b.onclick = () => entryModal(entries.find((e) => e.id === Number(b.dataset.edit)), render));
  $$('[data-stop]', el).forEach((b) => b.onclick = async () => {
    if (!confirm('Jetzt ausstempeln?')) return;
    try { await api('POST', `/api/entries/${b.dataset.stop}/stop`, {}); render(); } catch (e) { toast(e.message, true); }
  });
}

// ================= Seite: Mitarbeiter =================
async function pageUsers(el) {
  const [users, settings] = await Promise.all([loadUsers(), loadSettings()]);
  const minWage = Number(settings.minimum_wage) || 0;
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Mitarbeiter</h1><div class="muted">${users.filter((u) => u.active).length} aktiv</div></div>
      <div class="actions"><button class="btn primary" id="add">${icon('plus')} Mitarbeiter anlegen</button></div>
    </div>
    <div class="card">
      ${users.length <= 1 ? '<div class="alert warn">Lege jetzt deine Mitarbeiter an. Jeder bekommt einen Benutzernamen und eine PIN, mit der er sich auf dem Handy anmeldet und ein-/ausstempelt.</div>' : ''}
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Benutzername</th><th class="hide-mobile">Anstellung</th><th class="right">Stundenlohn</th><th class="hide-mobile">Telefon</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => `
          <tr class="${u.active ? '' : 'inactive'}">
            <td><strong>${esc(u.name)}</strong> ${u.role === 'admin' ? '<span class="badge brand">Admin</span>' : ''}${u.keys_held ? ` <span class="badge" title="Hat ${u.keys_held} Schlüssel">${icon('key')}${u.keys_held}</span>` : ''}</td>
            <td>${esc(u.username)}</td>
            <td class="hide-mobile">${EMPLOYMENT[u.employment_type] || '–'}</td>
            <td class="right num nowrap">${u.hourly_rate ? money(u.hourly_rate) : '–'} ${u.hourly_rate && minWage && u.hourly_rate < minWage && u.employment_type !== 'inhaber' ? '<span class="badge warn" title="Unter Mindestlohn">!</span>' : ''}</td>
            <td class="hide-mobile">${u.phone ? `<a href="tel:${esc(u.phone)}">${esc(u.phone)}</a>` : '–'}</td>
            <td>${u.active ? '<span class="badge ok">aktiv</span>' : '<span class="badge">inaktiv</span>'}</td>
            <td class="right"><button class="btn small" data-edit="${u.id}">Bearbeiten</button></td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  $('#add').onclick = () => userModal(null, minWage);
  $$('[data-edit]', el).forEach((b) => b.onclick = () => userModal(users.find((u) => u.id === Number(b.dataset.edit)), minWage));
}

function userModal(u, minWage) {
  const x = u || { employment_type: 'minijob', role: 'employee', active: 1, hourly_rate: minWage };
  const form = openModal(u ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter', `
    <div class="field"><label>Vor- und Nachname</label><input name="name" value="${esc(x.name || '')}" required></div>
    <div class="row">
      <div class="field"><label>Benutzername</label><input name="username" value="${esc(x.username || '')}" autocapitalize="none" required></div>
      <div class="field"><label>${u ? 'Neue PIN / Passwort' : 'PIN / Passwort'}</label><input name="password" type="text" autocomplete="off" placeholder="${u ? 'leer = unverändert' : 'mind. 4 Zeichen'}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Anstellung</label><select name="employment_type">${Object.entries(EMPLOYMENT).map(([k, v]) => `<option value="${k}" ${x.employment_type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Stundenlohn (€)</label><input name="hourly_rate" type="number" step="0.01" min="0" value="${x.hourly_rate ?? ''}"></div>
    </div>
    <div class="alert warn" id="wage-warn" hidden>Achtung: unter dem gesetzlichen Mindestlohn (${money(minWage)}).</div>
    <div class="field"><label>Urlaubsanspruch (Arbeitstage pro Jahr)</label><input name="vacation_days" type="number" step="0.5" min="0" value="${x.vacation_days ?? ''}" placeholder="z. B. 20"></div>
    <div class="row">
      <div class="field"><label>Telefon</label><input name="phone" type="tel" value="${esc(x.phone || '')}"></div>
      <div class="field"><label>Rolle</label><select name="role">
        <option value="employee" ${x.role !== 'admin' ? 'selected' : ''}>Mitarbeiter</option>
        <option value="admin" ${x.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
    </div>
    <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Aktiv (darf sich anmelden)</label>
    ${u && u.keys_held ? `<div class="alert warn" style="margin:12px 0 0">${icon('key')} Hat noch ${u.keys_held} Schlüssel – vor dem Ausscheiden bitte unter <a href="#/schluessel">Schlüssel</a> zurücknehmen.</div>` : ''}
  `, {
    onSave: async (d) => {
      d.vacation_days = Number(String(d.vacation_days || 0).replace(',', '.')) || 0;
      d.hourly_rate = Number(String(d.hourly_rate).replace(',', '.')) || 0;
      if (!d.password) delete d.password;
      if (u) await api('PUT', `/api/users/${u.id}`, d);
      else await api('POST', '/api/users', d);
      toast('Gespeichert');
      render();
    },
    onDelete: u && u.id !== state.user.id ? async () => { await api('DELETE', `/api/users/${u.id}`); toast('Gelöscht'); render(); } : null
  });
  const checkWage = () => {
    const v = Number(String(form.hourly_rate.value).replace(',', '.'));
    $('#wage-warn').hidden = !(minWage && v > 0 && v < minWage && form.employment_type.value !== 'inhaber');
  };
  form.hourly_rate.addEventListener('input', checkWage);
  form.employment_type.addEventListener('change', checkWage);
  checkWage();
}

// ================= Seite: Objekte =================
async function pageSites(el) {
  const sites = await loadSites();
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Objekte & Kunden</h1><div class="muted">Einsatzorte, an denen gereinigt wird</div></div>
      <div class="actions"><button class="btn primary" id="add">${icon('plus')} Objekt anlegen</button></div>
    </div>
    <div class="card">
      ${sites.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Objekt</th><th>Kunde</th><th class="hide-mobile">Adresse</th><th>Status</th><th></th></tr></thead>
        <tbody>${sites.map((s) => `
          <tr class="${s.active ? '' : 'inactive'}">
            <td><strong>${esc(s.name)}</strong>${s.notes ? `<div class="muted small">${esc(s.notes)}</div>` : ''}</td>
            <td>${esc(s.customer || '–')}</td>
            <td class="hide-mobile">${s.address ? `<a href="https://maps.google.com/?q=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">${esc(s.address)}</a>` : '–'}
              ${s.lat !== null && s.lat !== undefined ? ' <span class="badge ok" title="GPS-Position hinterlegt">GPS</span>' : ' <span class="badge" title="Keine GPS-Position – Entfernung beim Stempeln kann nicht geprüft werden">kein GPS</span>'}</td>
            <td>${s.active ? '<span class="badge ok">aktiv</span>' : '<span class="badge">inaktiv</span>'}</td>
            <td class="right"><button class="btn small" data-edit="${s.id}">Bearbeiten</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">Noch keine Objekte. Lege z. B. „Büro Müller GmbH“ oder „Praxis Dr. Schmidt“ an.</div>'}
    </div>`;
  $('#add').onclick = () => siteModal(null);
  $$('[data-edit]', el).forEach((b) => b.onclick = () => siteModal(sites.find((s) => s.id === Number(b.dataset.edit))));
}

function siteModal(s) {
  const x = s || { active: 1 };
  const form = openModal(s ? 'Objekt bearbeiten' : 'Neues Objekt', `
    <div class="field"><label>Bezeichnung</label><input name="name" value="${esc(x.name || '')}" placeholder="z. B. Bürogebäude Hauptstraße" required></div>
    <div class="field"><label>Kunde</label><input name="customer" value="${esc(x.customer || '')}"></div>
    <div class="field"><label>Adresse</label><input name="address" value="${esc(x.address || '')}"></div>
    <div class="field">
      <label>GPS-Position des Objekts <span class="muted small">(für die Prüfung „am Objekt“ beim Stempeln)</span></label>
      <div class="row">
        <input name="lat" inputmode="decimal" placeholder="Breitengrad, z. B. 52.5200" value="${x.lat ?? ''}">
        <input name="lng" inputmode="decimal" placeholder="Längengrad, z. B. 13.4050" value="${x.lng ?? ''}">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button type="button" class="btn small" id="site-here">${icon('pin')} Aktuellen Standort übernehmen</button>
        ${x.lat !== null && x.lat !== undefined ? `<a class="btn small" href="${mapsUrl(x.lat, x.lng)}" target="_blank" rel="noopener">Auf Karte zeigen</a>` : ''}
      </div>
      <div class="muted small" style="margin-top:6px">Tipp: Beim ersten Besuch vor Ort auf „Aktuellen Standort übernehmen“ tippen – oder Koordinaten aus Google Maps kopieren (Rechtsklick auf den Ort).</div>
    </div>
    <div class="field"><label>Notizen (Schlüssel, Zugangscode, Besonderheiten …)</label><textarea name="notes">${esc(x.notes || '')}</textarea></div>
    <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Aktiv</label>
  `, {
    onSave: async (d) => {
      // Koordinaten aus Google Maps können als "52.52, 13.40" in einem Feld eingefügt werden
      const both = String(d.lat).match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (both) { d.lat = both[1]; d.lng = both[2]; }
      d.lat = String(d.lat).trim(); d.lng = String(d.lng).trim();
      if ((d.lat === '') !== (d.lng === '')) throw new Error('Bitte Breiten- und Längengrad angeben');
      if (s) await api('PUT', `/api/sites/${s.id}`, d); else await api('POST', '/api/sites', d);
      toast('Gespeichert'); render();
    },
    onDelete: s ? async () => { await api('DELETE', `/api/sites/${s.id}`); toast('Gelöscht'); render(); } : null
  });
  $('#site-here').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true; b.textContent = 'Standort wird ermittelt …';
    const loc = await getLocation();
    b.disabled = false; b.innerHTML = `${icon('pin')} Aktuellen Standort übernehmen`;
    if (loc.error) return toast(loc.error, true);
    form.lat.value = loc.lat.toFixed(6); form.lng.value = loc.lng.toFixed(6);
    toast(`Standort übernommen (±${loc.accuracy} m)`);
  };
}

// ================= Seite: Fotos (Admin) =================
async function pagePhotos(el, params) {
  await Promise.all([loadUsers(), loadSites()]);
  const f = {
    from: params.get('from') || addDays(localDate(), -6),
    to: params.get('to') || localDate(),
    user_id: params.get('user_id') || '',
    site_id: params.get('site_id') || ''
  };
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const photos = await api('GET', '/api/photos?limit=500&' + qs);
  const byDay = {};
  photos.forEach((p) => { (byDay[p.taken_at.slice(0, 10)] ||= []).push(p); });
  el.innerHTML = `
    <div class="page-head"><div><h1>Fotos</h1><div class="muted">${photos.length} Fotos · Nachweis der Reinigung</div></div></div>
    <div class="card">
      <form class="filters" id="filters">
        <div class="field narrow"><label>Von</label><input type="date" name="from" value="${f.from}"></div>
        <div class="field narrow"><label>Bis</label><input type="date" name="to" value="${f.to}"></div>
        <div class="field"><label>Mitarbeiter</label><select name="user_id">${userOptions(f.user_id, { emptyLabel: 'Alle' })}</select></div>
        <div class="field"><label>Objekt</label><select name="site_id">${siteOptions(f.site_id, { includeInactive: true, emptyLabel: 'Alle' })}</select></div>
      </form>
      ${photos.length ? Object.entries(byDay).map(([day, list]) => `
        <h3 style="margin-top:16px">${fmtDate(day)}</h3>
        ${Object.entries(list.reduce((acc, p) => { (acc[p.site_name || 'ohne Objekt'] ||= []).push(p); return acc; }, {})).map(([site, ps]) => `
          <div class="muted small" style="margin:6px 0">${icon('building')} ${esc(site)}</div>${photoGrid(ps)}`).join('')}
      `).join('') : '<div class="empty">Keine Fotos im gewählten Zeitraum.</div>'}
    </div>`;
  $('#filters').onchange = () => go('fotos', Object.fromEntries([...new FormData($('#filters'))].filter(([, v]) => v)));
  bindPhotoGrid(el, photos);
}

// ================= Seite: Auswertung =================
function monthPicker(m, page, extra = {}) {
  return `<div class="actions" style="align-items:center">
    <a class="btn small" href="#/${page}?${new URLSearchParams({ ...extra, month: shiftMonth(m, -1) })}" aria-label="Vormonat">${icon('left')}</a>
    <input type="month" value="${m}" id="month-input" style="width:auto">
    <a class="btn small" href="#/${page}?${new URLSearchParams({ ...extra, month: shiftMonth(m, 1) })}" aria-label="Nächster Monat">${icon('right')}</a>
  </div>`;
}
function bindMonthPicker(page, extra = {}) {
  const inp = $('#month-input');
  if (inp) inp.onchange = () => inp.value && go(page, { ...extra, month: inp.value });
}

async function pageReport(el, params) {
  const m = params.get('month') || localMonth();
  const r = await api('GET', '/api/report?month=' + m);
  const warn = r.byUser.filter((u) => u.minijobWarning);
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Auswertung</h1><div class="muted">${fmtMonth(m)}</div></div>
      ${monthPicker(m, 'auswertung')}
    </div>
    ${warn.length ? `<div class="alert warn"><strong>Minijob-Grenze überschritten (${money(r.settings.minijob_limit)}):</strong> ${warn.map((w) => esc(w.name) + ' (' + money(w.wage) + ')').join(', ')}</div>` : ''}
    <div class="grid stats">
      <div class="card stat"><div class="label">Gesamtstunden</div><div class="value">${fmtDur(r.totalMinutes)}</div></div>
      <div class="card stat"><div class="label">Dezimal</div><div class="value">${fmtDec(r.totalMinutes)} Std.</div></div>
      <div class="card stat"><div class="label">Lohnsumme (brutto)</div><div class="value">${money(r.totalWage)}</div></div>
    </div>
    <div class="card">
      <div class="page-head" style="margin-bottom:8px"><h2 style="margin:0">Nach Mitarbeiter</h2>
        <a class="btn small" href="/api/export.csv?from=${r.from}&to=${r.to}">${icon('download')} CSV / Excel</a></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Mitarbeiter</th><th class="hide-mobile">Anstellung</th><th class="right hide-mobile">Tage</th><th class="right hide-mobile">Urlaub</th><th class="right hide-mobile">Krank</th><th class="right">Stunden</th><th class="right hide-mobile">Lohn/Std.</th><th class="right">Betrag</th><th></th></tr></thead>
        <tbody>${r.byUser.map((u) => `
          <tr>
            <td><strong>${esc(u.name)}</strong></td>
            <td class="hide-mobile">${EMPLOYMENT[u.employment_type] || ''}</td>
            <td class="right num hide-mobile">${u.days}</td>
            <td class="right num hide-mobile">${u.vacationDays || '–'}</td>
            <td class="right num hide-mobile">${u.sickDays || '–'}</td>
            <td class="right num nowrap">${fmtDur(u.minutes)}<div class="muted small">${fmtDec(u.minutes)}</div></td>
            <td class="right num hide-mobile">${u.hourly_rate ? money(u.hourly_rate) : '–'}</td>
            <td class="right num nowrap">${money(u.wage)} ${u.minijobWarning ? '<span class="badge warn">über Grenze</span>' : ''}</td>
            <td class="right"><a class="btn small" href="#/nachweis?user=${u.user_id}&month=${m}">${icon('file')} <span class="hide-mobile">Nachweis</span></a></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td>Summe</td><td class="hide-mobile"></td><td class="hide-mobile"></td><td class="hide-mobile"></td><td class="hide-mobile"></td><td class="right num">${fmtDur(r.totalMinutes)}</td><td class="hide-mobile"></td><td class="right num">${money(r.totalWage)}</td><td></td></tr></tfoot>
      </table></div>
    </div>
    <div class="card">
      <h2>Nach Objekt / Kunde</h2>
      ${r.bySite.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Objekt</th><th class="hide-mobile">Kunde</th><th class="right">Einsätze</th><th class="right">Stunden</th><th class="right">Dezimal</th></tr></thead>
        <tbody>${r.bySite.map((s) => `
          <tr><td><strong>${esc(s.name)}</strong></td><td class="hide-mobile">${esc(s.customer || '–')}</td><td class="right num">${s.entries}</td>
          <td class="right num">${fmtDur(s.minutes)}</td><td class="right num">${fmtDec(s.minutes)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">Keine Einträge in diesem Monat.</div>'}
    </div>`;
  bindMonthPicker('auswertung');
}

// ================= Seite: Stundennachweis =================
async function pageTimesheet(el, params) {
  const m = params.get('month') || localMonth();
  const userId = isAdmin() ? (params.get('user') || state.user.id) : state.user.id;
  if (isAdmin()) await loadUsers();
  const t = await api('GET', `/api/timesheet?month=${m}&user_id=${userId}`);
  const byDay = {};
  t.entries.forEach((e) => { (byDay[e.start.slice(0, 10)] ||= []).push(e); });
  el.innerHTML = `
    <div class="page-head no-print">
      <div><h1>Stundennachweis</h1><div class="muted">${esc(t.user.name)} · ${fmtMonth(m)}</div></div>
      <div class="actions">
        ${isAdmin() ? `<select id="ts-user" style="width:auto">${userOptions(userId)}</select>` : ''}
        ${monthPicker(m, 'nachweis', isAdmin() ? { user: userId } : {})}
        <button class="btn primary" onclick="window.print()">${icon('print')} Drucken / PDF</button>
      </div>
    </div>
    <div class="sheet">
      <div class="sheet-head">
        <div><h1>Stundennachweis ${fmtMonth(m)}</h1><div><strong>${esc(t.user.name)}</strong> · ${EMPLOYMENT[t.user.employment_type] || ''}</div></div>
        <div class="right"><strong>${esc(t.companyName)}</strong><div class="muted small">erstellt am ${fmtDate(localDate(), false)}</div></div>
      </div>
      ${t.entries.length ? `<table>
        <thead><tr><th>Datum</th><th>Objekt</th><th>Beginn</th><th>Ende</th><th class="right">Pause</th><th class="right">Stunden</th><th>Notiz</th></tr></thead>
        <tbody>${Object.entries(byDay).map(([, list]) => list.map((e) => `
          <tr><td class="nowrap">${fmtDate(e.start)}</td><td>${esc(e.site_name || '–')}</td><td class="num">${fmtTime(e.start)}</td><td class="num">${e.end ? endLabel(e) : 'läuft'}</td>
          <td class="right num">${e.break_minutes ? e.break_minutes + ' Min' : '–'}</td><td class="right num">${fmtDur(e.minutes)}</td><td class="small">${esc(e.note)}</td></tr>`).join('')).join('')}</tbody>
        <tfoot>
          <tr><td colspan="5">Gesamt (${Object.keys(byDay).length} Arbeitstage)</td><td class="right num nowrap">${fmtDur(t.minutes)}</td><td class="num">${fmtDec(t.minutes)} Std.</td></tr>
          ${t.user.hourly_rate ? `<tr><td colspan="5">Bruttolohn (${money(t.user.hourly_rate)} / Std.)</td><td class="right num nowrap" colspan="2">${money(t.wage)}</td></tr>` : ''}
        </tfoot>
      </table>` : '<div class="empty">Keine Einträge in diesem Monat.</div>'}
      ${t.absences.length ? `<h3 style="margin-top:20px">Abwesenheiten</h3>
        <table><thead><tr><th>Zeitraum</th><th>Art</th><th class="right">Arbeitstage im Monat</th></tr></thead>
        <tbody>${t.absences.map((a) => `<tr><td>${fmtRange(a)}</td><td>${ABSENCE_TYPES[a.type] || a.type}${SICK.includes(a.type) && a.certificate ? ' (AU liegt vor)' : ''}</td><td class="right num">${a.daysInRange}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="signatures"><div>Datum, Unterschrift Mitarbeiter/in</div><div>Datum, Unterschrift Arbeitgeber</div></div>
    </div>`;
  bindMonthPicker('nachweis', isAdmin() ? { user: userId } : {});
  const sel = $('#ts-user');
  if (sel) sel.onchange = () => go('nachweis', { user: sel.value, month: m });
}

// ================= Seite: Meine Zeiten (Mitarbeiter) =================
async function pageMyEntries(el, params) {
  const m = params.get('month') || localMonth();
  const [entries, settings] = await Promise.all([api('GET', `/api/entries?from=${m}-01&to=${monthEnd(m)}`), loadSettings(), loadSites()]);
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const canAdd = settings.allow_employee_manual === '1';
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Meine Zeiten</h1><div class="muted">${fmtMonth(m)}</div></div>
      ${monthPicker(m, 'meine-zeiten')}
    </div>
    <div class="grid stats">
      <div class="card stat"><div class="label">Stunden im Monat</div><div class="value">${fmtDur(total)}</div></div>
      <div class="card stat"><div class="label">Arbeitstage</div><div class="value">${new Set(entries.map((e) => e.start.slice(0, 10))).size}</div></div>
    </div>
    <div class="card">
      <div class="page-head" style="margin-bottom:6px"><h2 style="margin:0">Einträge</h2>
        <div class="actions">
          <a class="btn small" href="#/nachweis?month=${m}">${icon('file')} Nachweis</a>
          ${canAdd ? `<button class="btn small primary" id="add">${icon('plus')} Nachtragen</button>` : ''}
        </div></div>
      ${entries.length ? `<ul class="entry-list">${entries.map((e) => `
        <li><div><div class="when">${fmtDate(e.start)}</div>
          <div class="muted small">${fmtTime(e.start)} – ${e.end ? fmtTime(e.end) : 'läuft'} · ${esc(e.site_name || 'ohne Objekt')}${e.break_minutes ? ' · ' + e.break_minutes + ' Min Pause' : ''}${e.source === 'manual' ? ' · nachgetragen' : ''}${e.photo_count ? ' · ' + e.photo_count + ' Foto' + (e.photo_count > 1 ? 's' : '') : ''}</div>
          ${e.note ? `<div class="small">${esc(e.note)}</div>` : ''}</div>
          <div class="dur">${fmtDur(e.minutes)}</div></li>`).join('')}</ul>` : '<div class="empty">Keine Einträge in diesem Monat.</div>'}
      ${!canAdd ? '<p class="muted small">Zeit vergessen zu stempeln? Bitte kurz beim Chef melden – der kann sie nachtragen.</p>' : ''}
    </div>`;
  bindMonthPicker('meine-zeiten');
  const add = $('#add');
  if (add) add.onclick = () => entryModal(null, render, { asEmployee: true });
}

// ================= Seite: Konto =================
function passwordCard() {
  return `<div class="card">
    <h2>Passwort ändern</h2>
    <form id="pw-form" style="max-width:380px">
      <div class="field"><label>Aktuelles Passwort / PIN</label><input type="password" name="oldPassword" autocomplete="current-password" required></div>
      <div class="field"><label>Neues Passwort (min. 6 Zeichen)</label><input type="password" name="newPassword" autocomplete="new-password" required></div>
      <button class="btn primary" type="submit">Ändern</button>
    </form></div>`;
}
function bindPasswordForm() {
  const f = $('#pw-form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/me/password', Object.fromEntries(new FormData(f))); f.reset(); toast('Passwort geändert'); }
    catch (ex) { toast(ex.message, true); }
  };
}

async function pageAccount(el) {
  const keys = await api('GET', '/api/keys/mine').catch(() => []);
  el.innerHTML = `
    <div class="page-head"><div><h1>Mein Konto</h1><div class="muted">${esc(state.user.name)} · ${esc(state.user.username)}</div></div></div>
    <div class="card">
      <h2>${icon('key')} Meine Schlüssel</h2>
      ${keys.length ? `<ul class="entry-list">${keys.map((k) => `
        <li><div><div class="when">${esc(k.label)}${k.number ? ` <span class="muted small">Nr. ${esc(k.number)}</span>` : ''}</div>
          <div class="muted small">${esc(k.site_name || 'ohne Objekt')}</div></div>
          <div class="muted small nowrap">seit ${fmtDate(k.since, false)}</div></li>`).join('')}</ul>
        <p class="muted small" style="margin-bottom:0">Schlüssel verloren? Bitte sofort über „Melden“ Bescheid geben.</p>`
        : '<div class="muted">Du hast aktuell keine Schlüssel.</div>'}
    </div>
    ${passwordCard()}
    <div class="card"><button class="btn danger" id="lo">${icon('logout')} Abmelden</button></div>`;
  bindPasswordForm();
  $('#lo').onclick = logout;
}

// ================= Seite: Einstellungen =================
async function pageSettings(el) {
  const s = await loadSettings();
  el.innerHTML = `
    <div class="page-head"><div><h1>Einstellungen</h1></div></div>
    <div class="card">
      <h2>Firma & Regeln</h2>
      <form id="settings-form" style="max-width:520px">
        <div class="field"><label>Firmenname</label><input name="company_name" value="${esc(s.company_name)}"></div>
        <div class="row">
          <div class="field"><label>Minijob-Grenze (€/Monat)</label><input name="minijob_limit" type="number" step="1" value="${esc(s.minijob_limit)}"></div>
          <div class="field"><label>Mindestlohn (€/Std.)</label><input name="minimum_wage" type="number" step="0.01" value="${esc(s.minimum_wage)}"></div>
        </div>
        <label class="check field"><input type="checkbox" name="allow_employee_manual" ${s.allow_employee_manual === '1' ? 'checked' : ''}> Mitarbeiter dürfen vergessene Zeiten selbst nachtragen</label>
        <button class="btn primary" type="submit">Speichern</button>
      </form>
    </div>
    ${passwordCard()}
    <div class="card">
      <h2>Datensicherung</h2>
      <p class="muted">Lade regelmäßig eine Sicherung aller Daten (Mitarbeiter, Objekte, Zeiten) herunter.</p>
      <a class="btn" href="/api/backup">${icon('download')} Sicherung herunterladen (JSON)</a>
      <a class="btn" href="/api/export.csv">${icon('download')} Alle Zeiten als CSV</a>
    </div>`;
  const f = $('#settings-form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    d.allow_employee_manual = f.allow_employee_manual.checked ? '1' : '0';
    try {
      const r = await api('PUT', '/api/settings', d);
      state.companyName = r.company_name;
      toast('Gespeichert');
      render();
    } catch (ex) { toast(ex.message, true); }
  };
  bindPasswordForm();
}

// ================= Start =================
async function boot() {
  try {
    const s = await api('GET', '/api/status');
    state.needsSetup = s.needsSetup;
    state.companyName = s.companyName;
    state.user = s.user;
    document.title = `${s.companyName} – Zeiterfassung`;
  } catch (e) {
    // Ohne Netz: mit dem zuletzt angemeldeten Benutzer weiterarbeiten (Stempeln geht offline)
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('lastUser') || 'null'); } catch { /* egal */ }
    if (e.network && cached && cached.user) {
      state.user = cached.user;
      state.companyName = cached.companyName || state.companyName;
      render();
      return;
    }
    $('#app').innerHTML = `<div class="loading">Server nicht erreichbar: ${esc(e.message)}<br><br><button class="btn" onclick="boot()">Erneut versuchen</button></div>`;
    return;
  }
  render();
  offlineSync();
}

window.addEventListener('hashchange', render);
// Beim Zurückkehren zur App (z. B. Handy entsperrt) Seite aktualisieren
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && !$('#modal-root').innerHTML) { render(); offlineSync({ quiet: false }); }
});
boot();
