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
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

// ================= API =================
async function api(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* leer */ }
  if (res.status === 401 && state.user) { state.user = null; render(); }
  if (!res.ok) throw new Error((data && data.error) || `Fehler ${res.status}`);
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
      { page: 'stempeln', label: 'Stempeluhr', icon: 'clock', mobile: true },
      { page: 'zeiten', label: 'Zeiten', icon: 'list', mobile: true },
      { page: 'mitarbeiter', label: 'Mitarbeiter', icon: 'users' },
      { page: 'objekte', label: 'Objekte', icon: 'building' },
      { page: 'auswertung', label: 'Auswertung', icon: 'chart', mobile: true },
      { page: 'einstellungen', label: 'Einstellungen', icon: 'settings' }
    ];
  }
  return [
    { page: 'stempeln', label: 'Stempeluhr', icon: 'clock', mobile: true },
    { page: 'meine-zeiten', label: 'Meine Zeiten', icon: 'list', mobile: true },
    { page: 'konto', label: 'Konto', icon: 'user', mobile: true }
  ];
}

const PAGES = {
  uebersicht: { admin: true, render: pageDashboard },
  stempeln: { render: pageClock },
  zeiten: { admin: true, render: pageEntries },
  mitarbeiter: { admin: true, render: pageUsers },
  objekte: { admin: true, render: pageSites },
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

  let { page, params } = parseHash();
  const def = isAdmin() ? 'uebersicht' : 'stempeln';
  if (!PAGES[page] || (PAGES[page].admin && !isAdmin())) { page = def; history.replaceState(null, '', `#/${def}`); }

  const items = navItems();
  const navLinks = (cls) => items.map((i) =>
    `<a href="#/${i.page}" class="${page === i.page ? 'active' : ''} ${cls === 'bottom' && !i.mobile ? 'hidden' : ''}">${icon(i.icon)}<span>${i.label}</span></a>`
  ).filter((l) => !l.includes(' hidden')).join('');

  const moreActive = isAdmin() && ['mitarbeiter', 'objekte', 'einstellungen', 'nachweis'].includes(page);
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

  const el = $('#page');
  try {
    await PAGES[page].render(el, params);
  } catch (err) {
    el.innerHTML = `<div class="alert error">${esc(err.message)}</div>`;
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
  try { await api('POST', '/api/logout', {}); } catch { /* egal */ }
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
async function loadSites() { state.sites = await api('GET', '/api/sites'); return state.sites; }
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
              <div class="muted small">${esc(e.site_name || 'ohne Objekt')} · seit ${fmtTime(e.start)}${e.start.slice(0, 10) !== localDate() ? ' (' + fmtDate(e.start, false) + ')' : ''}</div></div>
            <div style="display:flex;gap:8px;align-items:center"><span class="dur" data-since="${e.start}"></span>
              <button class="btn small danger" data-stop="${e.id}" title="Ausstempeln">${icon('stop')}</button></div>
          </li>`).join('')}</ul>` : '<div class="empty">Niemand eingestempelt.</div>'}
      </div>
      <div class="card">
        <h2>Heute erfasst</h2>
        ${d.recent.length ? `<ul class="entry-list">${d.recent.map((e) => `
          <li><div><div class="when">${esc(e.user_name)}</div><div class="muted small">${esc(e.site_name || 'ohne Objekt')} · ${fmtTime(e.start)}–${e.end ? fmtTime(e.end) : 'läuft'}</div></div>
          <div class="dur">${fmtDur(e.minutes)}</div></li>`).join('')}</ul>` : '<div class="empty">Heute noch keine Einträge.</div>'}
      </div>
    </div>`;
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
async function pageClock(el) {
  const [c] = await Promise.all([api('GET', '/api/clock'), loadSites()]);
  const r = c.running;
  const lastSite = localStorage.getItem('lastSite') || '';
  el.innerHTML = `
    <div class="page-head"><div><h1>Stempeluhr</h1><div class="muted">Hallo ${esc(state.user.name.split(' ')[0])} · ${fmtDate(localDate())}</div></div></div>
    <div class="card clock-card">
      <div class="clock-status ${r ? 'on' : ''}">${r ? '<span class="live-dot"></span>Eingestempelt seit ' + fmtTime(r.start) : 'Nicht eingestempelt'}</div>
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
    </div>
    <div class="card">
      <h2>Heute: ${fmtDur(c.todayMinutes)}</h2>
      ${c.today.length ? `<ul class="entry-list">${c.today.map((e) => `
        <li><div><div class="when">${fmtTime(e.start)} – ${e.end ? fmtTime(e.end) : 'läuft'}</div><div class="muted small">${esc(e.site_name || 'ohne Objekt')}${e.break_minutes ? ' · ' + e.break_minutes + ' Min Pause' : ''}</div></div>
        <div class="dur">${fmtDur(e.minutes)}</div></li>`).join('')}</ul>` : '<div class="empty">Heute noch nichts erfasst.</div>'}
    </div>`;

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

  $('#clock-btn').onclick = async () => {
    const btn = $('#clock-btn');
    const data = Object.fromEntries(new FormData($('#clock-form')));
    if (!r && !data.site_id && state.sites.length && !confirm('Ohne Objekt einstempeln?')) return;
    btn.disabled = true;
    try {
      if (r) {
        await api('POST', '/api/clock/out', { break_minutes: Number(data.break_minutes || 0), note: data.note });
        toast('Ausgestempelt – schönen Feierabend!');
      } else {
        await api('POST', '/api/clock/in', { site_id: data.site_id || null });
        if (data.site_id) localStorage.setItem('lastSite', data.site_id);
        toast('Eingestempelt');
      }
      render();
    } catch (e) { toast(e.message, true); btn.disabled = false; }
  };
}

// ================= Zeit-Eintrag (Formular) =================
function entryModal(entry, onDone, { asEmployee = false } = {}) {
  const e = entry || {};
  const date = e.start ? e.start.slice(0, 10) : localDate();
  const begin = e.start ? e.start.slice(11, 16) : '';
  const end = e.end ? e.end.slice(11, 16) : '';
  const running = entry && !entry.end;
  const form = openModal(entry ? 'Eintrag bearbeiten' : 'Zeit eintragen', `
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
      if (d.end) endDt = `${d.end <= d.begin ? addDays(d.date, 1) : d.date}T${d.end}`;
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
    if (m <= 0) m += 1440;
    $('#calc').value = fmtDur(m - Number(form.break_minutes.value || 0));
  };
  ['begin', 'end', 'break_minutes'].forEach((n) => form[n].addEventListener('input', calc));
  calc();
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
        <thead><tr><th>Datum</th><th>Mitarbeiter</th><th class="hide-mobile">Objekt</th><th>Zeit</th><th class="right hide-mobile">Pause</th><th class="right">Dauer</th><th class="hide-mobile">Notiz</th><th></th></tr></thead>
        <tbody>${entries.map((e) => `
          <tr>
            <td class="nowrap">${fmtDate(e.start)}</td>
            <td>${esc(e.user_name)}</td>
            <td class="hide-mobile">${esc(e.site_name || '–')}</td>
            <td class="nowrap num">${fmtTime(e.start)} – ${endLabel(e)}</td>
            <td class="right num hide-mobile">${e.break_minutes ? e.break_minutes + ' Min' : '–'}</td>
            <td class="right num nowrap"><strong>${fmtDur(e.minutes)}</strong></td>
            <td class="hide-mobile small muted" style="max-width:200px">${esc(e.note)}</td>
            <td class="right nowrap">${e.running ? `<button class="btn small danger" data-stop="${e.id}" title="Ausstempeln">${icon('stop')}</button> ` : ''}<button class="btn small" data-edit="${e.id}">Bearbeiten</button></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="5" class="hide-mobile">Summe</td><td colspan="3" class="hide-mobile num">${fmtDur(total)}</td></tr></tfoot>
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
            <td><strong>${esc(u.name)}</strong> ${u.role === 'admin' ? '<span class="badge brand">Admin</span>' : ''}</td>
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
    <div class="row">
      <div class="field"><label>Telefon</label><input name="phone" type="tel" value="${esc(x.phone || '')}"></div>
      <div class="field"><label>Rolle</label><select name="role">
        <option value="employee" ${x.role !== 'admin' ? 'selected' : ''}>Mitarbeiter</option>
        <option value="admin" ${x.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
    </div>
    <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Aktiv (darf sich anmelden)</label>
  `, {
    onSave: async (d) => {
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
            <td class="hide-mobile">${s.address ? `<a href="https://maps.google.com/?q=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">${esc(s.address)}</a>` : '–'}</td>
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
  openModal(s ? 'Objekt bearbeiten' : 'Neues Objekt', `
    <div class="field"><label>Bezeichnung</label><input name="name" value="${esc(x.name || '')}" placeholder="z. B. Bürogebäude Hauptstraße" required></div>
    <div class="field"><label>Kunde</label><input name="customer" value="${esc(x.customer || '')}"></div>
    <div class="field"><label>Adresse</label><input name="address" value="${esc(x.address || '')}"></div>
    <div class="field"><label>Notizen (Schlüssel, Zugangscode, Besonderheiten …)</label><textarea name="notes">${esc(x.notes || '')}</textarea></div>
    <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Aktiv</label>
  `, {
    onSave: async (d) => {
      if (s) await api('PUT', `/api/sites/${s.id}`, d); else await api('POST', '/api/sites', d);
      toast('Gespeichert'); render();
    },
    onDelete: s ? async () => { await api('DELETE', `/api/sites/${s.id}`); toast('Gelöscht'); render(); } : null
  });
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
        <thead><tr><th>Mitarbeiter</th><th class="hide-mobile">Anstellung</th><th class="right hide-mobile">Tage</th><th class="right">Stunden</th><th class="right hide-mobile">Lohn/Std.</th><th class="right">Betrag</th><th></th></tr></thead>
        <tbody>${r.byUser.map((u) => `
          <tr>
            <td><strong>${esc(u.name)}</strong></td>
            <td class="hide-mobile">${EMPLOYMENT[u.employment_type] || ''}</td>
            <td class="right num hide-mobile">${u.days}</td>
            <td class="right num nowrap">${fmtDur(u.minutes)}<div class="muted small">${fmtDec(u.minutes)}</div></td>
            <td class="right num hide-mobile">${u.hourly_rate ? money(u.hourly_rate) : '–'}</td>
            <td class="right num nowrap">${money(u.wage)} ${u.minijobWarning ? '<span class="badge warn">über Grenze</span>' : ''}</td>
            <td class="right"><a class="btn small" href="#/nachweis?user=${u.user_id}&month=${m}">${icon('file')} <span class="hide-mobile">Nachweis</span></a></td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td>Summe</td><td class="hide-mobile"></td><td class="hide-mobile"></td><td class="right num">${fmtDur(r.totalMinutes)}</td><td class="hide-mobile"></td><td class="right num">${money(r.totalWage)}</td><td></td></tr></tfoot>
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
          <div class="muted small">${fmtTime(e.start)} – ${e.end ? fmtTime(e.end) : 'läuft'} · ${esc(e.site_name || 'ohne Objekt')}${e.break_minutes ? ' · ' + e.break_minutes + ' Min Pause' : ''}${e.source === 'manual' ? ' · nachgetragen' : ''}</div>
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
  el.innerHTML = `
    <div class="page-head"><div><h1>Mein Konto</h1><div class="muted">${esc(state.user.name)} · ${esc(state.user.username)}</div></div></div>
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
    $('#app').innerHTML = `<div class="loading">Server nicht erreichbar: ${esc(e.message)}</div>`;
    return;
  }
  render();
}

window.addEventListener('hashchange', render);
// Beim Zurückkehren zur App (z. B. Handy entsperrt) Seite aktualisieren
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.user && !$('#modal-root').innerHTML) render();
});
boot();
