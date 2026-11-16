'use strict';
// Kayron Zeiterfassung – Server
// Keine externen Abhängigkeiten: Node.js >= 22.5 (eingebautes node:sqlite)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = 30;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'kayron.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','employee')),
  hourly_rate REAL NOT NULL DEFAULT 0,
  employment_type TEXT NOT NULL DEFAULT 'minijob',
  phone TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  start TEXT NOT NULL,          -- lokale Zeit 'YYYY-MM-DDTHH:MM'
  end TEXT,                     -- NULL = läuft gerade
  break_minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual', -- 'clock' oder 'manual'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(user_id, start);
CREATE INDEX IF NOT EXISTS idx_entries_start ON entries(start);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL, accuracy REAL,
  taken_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_entry ON photos(entry_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken ON photos(taken_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migrationen: neue Spalten für Standort (bestehende Datenbanken werden ergänzt)
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
for (const p of ['start', 'end']) {
  addColumn('entries', `${p}_lat`, 'REAL');
  addColumn('entries', `${p}_lng`, 'REAL');
  addColumn('entries', `${p}_acc`, 'REAL');
}
addColumn('sites', 'lat', 'REAL');
addColumn('sites', 'lng', 'REAL');

const PHOTO_DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const DEFAULT_SETTINGS = {
  company_name: 'Kayron Reinigung',
  minijob_limit: '603',      // €/Monat (Stand 2026)
  minimum_wage: '13.90',     // €/Stunde (Stand 2026)
  allow_employee_manual: '0' // Mitarbeiter dürfen Zeiten nachtragen
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}

// ---------- Hilfsfunktionen ----------

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function getSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function minutesBetween(start, end) {
  const a = new Date(start + ':00');
  const b = new Date(end + ':00');
  return Math.round((b - a) / 60000);
}

function workedMinutes(e) {
  const end = e.end || nowLocal();
  return Math.max(0, minutesBetween(e.start, end) - (e.break_minutes || 0));
}

// Standort aus Anfrage lesen: { lat, lng, accuracy } oder null
function parseLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.lat), lng = Number(loc.lng), acc = Number(loc.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, accuracy: Number.isFinite(acc) ? Math.round(acc) : null };
}

// Entfernung in Metern (Haversine)
function distanceM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, body, headers = {}) {
  const isString = typeof body === 'string' || Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(isString ? body : JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Anfrage zu groß');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Ungültiges JSON'); }
}

function str(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function num(v, def = 0) { const n = Number(v); return Number.isFinite(n) ? n : def; }

// ---------- Login-Schutz (einfaches Rate-Limit) ----------
const loginAttempts = new Map();
function checkRate(key) {
  const now = Date.now();
  const rec = loginAttempts.get(key) || { count: 0, first: now };
  if (now - rec.first > 15 * 60 * 1000) { rec.count = 0; rec.first = now; }
  rec.count++;
  loginAttempts.set(key, rec);
  if (rec.count > 10) throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte 15 Minuten warten.');
}

// ---------- Session ----------
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
}

function currentUser(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`).get(token, Date.now());
  return row || null;
}

// ---------- Router ----------
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth ?? 'user', bodyLimit: opts.bodyLimit });
}

// ----- Setup & Auth -----
route('GET', '/api/status', (ctx) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const s = getSettings();
  return { needsSetup: count === 0, companyName: s.company_name, user: publicUser(ctx.user) };
}, { auth: 'none' });

route('POST', '/api/setup', (ctx) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) throw new HttpError(400, 'Einrichtung bereits abgeschlossen');
  const b = ctx.body;
  const name = str(b.name, 100), username = str(b.username, 50), password = String(b.password || '');
  if (!name || !username) throw new HttpError(400, 'Name und Benutzername erforderlich');
  if (password.length < 6) throw new HttpError(400, 'Passwort muss mindestens 6 Zeichen haben');
  if (b.companyName) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(str(b.companyName, 100), 'company_name');
  const r = db.prepare(`INSERT INTO users (name, username, password_hash, role, employment_type)
    VALUES (?, ?, ?, 'admin', 'inhaber')`).run(name, username, hashPassword(password));
  createSession(ctx.res, Number(r.lastInsertRowid));
  return { ok: true };
}, { auth: 'none' });

route('POST', '/api/login', (ctx) => {
  const username = str(ctx.body.username, 50);
  checkRate((ctx.req.socket.remoteAddress || '') + '|' + username.toLowerCase());
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !verifyPassword(String(ctx.body.password || ''), user.password_hash)) {
    throw new HttpError(401, 'Benutzername oder Passwort falsch');
  }
  createSession(ctx.res, user.id);
  return { user: publicUser(user) };
}, { auth: 'none' });

route('POST', '/api/logout', (ctx) => {
  const token = parseCookies(ctx.req).sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  ctx.res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return { ok: true };
}, { auth: 'none' });

route('POST', '/api/me/password', (ctx) => {
  const { oldPassword, newPassword } = ctx.body;
  if (!verifyPassword(String(oldPassword || ''), ctx.user.password_hash)) throw new HttpError(400, 'Altes Passwort ist falsch');
  if (String(newPassword || '').length < 6) throw new HttpError(400, 'Neues Passwort muss mindestens 6 Zeichen haben');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(newPassword)), ctx.user.id);
  return { ok: true };
});

// ----- Einstellungen -----
route('GET', '/api/settings', () => getSettings());
route('PUT', '/api/settings', (ctx) => {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(ctx.body)) {
    if (allowed.includes(k)) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(str(v, 200), k);
  }
  return getSettings();
}, { auth: 'admin' });

// ----- Mitarbeiter -----
route('GET', '/api/users', () =>
  db.prepare('SELECT * FROM users ORDER BY active DESC, name COLLATE NOCASE').all().map(publicUser),
{ auth: 'admin' });

function userFields(b) {
  const role = b.role === 'admin' ? 'admin' : 'employee';
  const types = ['minijob', 'teilzeit', 'vollzeit', 'aushilfe', 'inhaber'];
  return {
    name: str(b.name, 100),
    username: str(b.username, 50),
    role,
    hourly_rate: Math.max(0, num(b.hourly_rate)),
    employment_type: types.includes(b.employment_type) ? b.employment_type : 'minijob',
    phone: str(b.phone, 50),
    active: b.active === false || b.active === 0 ? 0 : 1
  };
}

route('POST', '/api/users', (ctx) => {
  const f = userFields(ctx.body);
  const pw = String(ctx.body.password || '');
  if (!f.name || !f.username) throw new HttpError(400, 'Name und Benutzername erforderlich');
  if (pw.length < 4) throw new HttpError(400, 'Passwort/PIN muss mindestens 4 Zeichen haben');
  try {
    const r = db.prepare(`INSERT INTO users (name, username, password_hash, role, hourly_rate, employment_type, phone, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(f.name, f.username, hashPassword(pw), f.role, f.hourly_rate, f.employment_type, f.phone, f.active);
    return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(400, 'Benutzername ist bereits vergeben');
    throw e;
  }
}, { auth: 'admin' });

route('PUT', '/api/users/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, 'Mitarbeiter nicht gefunden');
  const f = userFields({ ...publicUser(existing), ...ctx.body });
  if (!f.name || !f.username) throw new HttpError(400, 'Name und Benutzername erforderlich');
  if (id === ctx.user.id && (f.role !== 'admin' || !f.active)) {
    throw new HttpError(400, 'Du kannst dir selbst die Admin-Rechte nicht entziehen oder dich deaktivieren');
  }
  try {
    db.prepare(`UPDATE users SET name=?, username=?, role=?, hourly_rate=?, employment_type=?, phone=?, active=? WHERE id=?`)
      .run(f.name, f.username, f.role, f.hourly_rate, f.employment_type, f.phone, f.active, id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(400, 'Benutzername ist bereits vergeben');
    throw e;
  }
  if (ctx.body.password) {
    if (String(ctx.body.password).length < 4) throw new HttpError(400, 'Passwort/PIN muss mindestens 4 Zeichen haben');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(ctx.body.password)), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  if (!f.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  return publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}, { auth: 'admin' });

route('DELETE', '/api/users/:id', (ctx) => {
  const id = Number(ctx.params.id);
  if (id === ctx.user.id) throw new HttpError(400, 'Du kannst dich nicht selbst löschen');
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM entries WHERE user_id = ?').get(id).c;
  if (cnt > 0) throw new HttpError(400, `Mitarbeiter hat ${cnt} Zeiteinträge. Bitte stattdessen deaktivieren (Zeiten bleiben erhalten).`);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true };
}, { auth: 'admin' });

// ----- Objekte / Kunden -----
route('GET', '/api/sites', (ctx) => {
  const sql = ctx.user.role === 'admin'
    ? 'SELECT * FROM sites ORDER BY active DESC, name COLLATE NOCASE'
    : 'SELECT id, name, customer, address FROM sites WHERE active = 1 ORDER BY name COLLATE NOCASE';
  return db.prepare(sql).all();
});

function siteFields(b) {
  return {
    name: str(b.name, 150), customer: str(b.customer, 150), address: str(b.address, 300),
    notes: str(b.notes, 2000), active: b.active === false || b.active === 0 ? 0 : 1,
    lat: b.lat === '' || b.lat === null || b.lat === undefined || !Number.isFinite(Number(b.lat)) ? null : Number(b.lat),
    lng: b.lng === '' || b.lng === null || b.lng === undefined || !Number.isFinite(Number(b.lng)) ? null : Number(b.lng)
  };
}
route('POST', '/api/sites', (ctx) => {
  const f = siteFields(ctx.body);
  if (!f.name) throw new HttpError(400, 'Name des Objekts erforderlich');
  const r = db.prepare('INSERT INTO sites (name, customer, address, notes, active, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(f.name, f.customer, f.address, f.notes, f.active, f.lat, f.lng);
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(Number(r.lastInsertRowid));
}, { auth: 'admin' });

route('PUT', '/api/sites/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const existing = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, 'Objekt nicht gefunden');
  const f = siteFields({ ...existing, ...ctx.body });
  if (!f.name) throw new HttpError(400, 'Name des Objekts erforderlich');
  db.prepare('UPDATE sites SET name=?, customer=?, address=?, notes=?, active=?, lat=?, lng=? WHERE id=?')
    .run(f.name, f.customer, f.address, f.notes, f.active, f.lat, f.lng, id);
  return db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
}, { auth: 'admin' });

route('DELETE', '/api/sites/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM entries WHERE site_id = ?').get(id).c;
  if (cnt > 0) throw new HttpError(400, `Objekt hat ${cnt} Zeiteinträge. Bitte stattdessen deaktivieren.`);
  db.prepare('DELETE FROM sites WHERE id = ?').run(id);
  return { ok: true };
}, { auth: 'admin' });

// ----- Zeiteinträge -----
const ENTRY_SELECT = `
  SELECT e.*, u.name AS user_name, s.name AS site_name, s.lat AS site_lat, s.lng AS site_lng,
    (SELECT COUNT(*) FROM photos p WHERE p.entry_id = e.id) AS photo_count
  FROM entries e JOIN users u ON u.id = e.user_id LEFT JOIN sites s ON s.id = e.site_id`;

function decorate(e) {
  return {
    ...e, minutes: workedMinutes(e), running: !e.end,
    start_distance: distanceM(e.start_lat, e.start_lng, e.site_lat, e.site_lng),
    end_distance: distanceM(e.end_lat, e.end_lng, e.site_lat, e.site_lng)
  };
}

function queryEntries({ from, to, userId, siteId }) {
  const where = [], args = [];
  if (from) { where.push('e.start >= ?'); args.push(from + 'T00:00'); }
  if (to) { where.push('e.start <= ?'); args.push(to + 'T23:59'); }
  if (userId) { where.push('e.user_id = ?'); args.push(userId); }
  if (siteId) { where.push('e.site_id = ?'); args.push(siteId); }
  const sql = ENTRY_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY e.start DESC';
  return db.prepare(sql).all(...args).map(decorate);
}

function entryFilters(ctx) {
  const q = ctx.query;
  const from = DATE_RE.test(q.get('from') || '') ? q.get('from') : null;
  const to = DATE_RE.test(q.get('to') || '') ? q.get('to') : null;
  let userId = q.get('user_id') ? Number(q.get('user_id')) : null;
  const siteId = q.get('site_id') ? Number(q.get('site_id')) : null;
  if (ctx.user.role !== 'admin') userId = ctx.user.id;
  return { from, to, userId, siteId };
}

route('GET', '/api/entries', (ctx) => queryEntries(entryFilters(ctx)));

function validateEntry(b, { requireEnd }) {
  const start = str(b.start, 16);
  const end = b.end ? str(b.end, 16) : null;
  if (!DT_RE.test(start)) throw new HttpError(400, 'Ungültige Startzeit');
  if (end && !DT_RE.test(end)) throw new HttpError(400, 'Ungültige Endzeit');
  if (requireEnd && !end) throw new HttpError(400, 'Endzeit erforderlich');
  const brk = Math.max(0, Math.round(num(b.break_minutes)));
  if (end) {
    const dur = minutesBetween(start, end);
    if (dur <= 0) throw new HttpError(400, 'Ende muss nach dem Beginn liegen');
    if (dur > 24 * 60) throw new HttpError(400, 'Ein Eintrag darf höchstens 24 Stunden lang sein');
    if (brk >= dur) throw new HttpError(400, 'Pause ist länger als die Arbeitszeit');
  }
  const siteId = b.site_id ? Number(b.site_id) : null;
  if (siteId && !db.prepare('SELECT 1 FROM sites WHERE id = ?').get(siteId)) throw new HttpError(400, 'Objekt nicht gefunden');
  return { start, end, break_minutes: brk, site_id: siteId, note: str(b.note, 1000) };
}

route('POST', '/api/entries', (ctx) => {
  const isAdmin = ctx.user.role === 'admin';
  if (!isAdmin && getSettings().allow_employee_manual !== '1') throw new HttpError(403, 'Nachtragen ist nur für Admins erlaubt');
  const userId = isAdmin && ctx.body.user_id ? Number(ctx.body.user_id) : ctx.user.id;
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw new HttpError(400, 'Mitarbeiter nicht gefunden');
  const f = validateEntry(ctx.body, { requireEnd: true });
  const r = db.prepare(`INSERT INTO entries (user_id, site_id, start, end, break_minutes, note, source)
    VALUES (?, ?, ?, ?, ?, ?, 'manual')`).run(userId, f.site_id, f.start, f.end, f.break_minutes, f.note);
  return decorate(db.prepare(ENTRY_SELECT + ' WHERE e.id = ?').get(Number(r.lastInsertRowid)));
});

route('PUT', '/api/entries/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, 'Eintrag nicht gefunden');
  const merged = { ...existing, ...ctx.body };
  const f = validateEntry(merged, { requireEnd: false });
  const userId = ctx.body.user_id ? Number(ctx.body.user_id) : existing.user_id;
  db.prepare(`UPDATE entries SET user_id=?, site_id=?, start=?, end=?, break_minutes=?, note=?, updated_at=datetime('now') WHERE id=?`)
    .run(userId, f.site_id, f.start, f.end, f.break_minutes, f.note, id);
  return decorate(db.prepare(ENTRY_SELECT + ' WHERE e.id = ?').get(id));
}, { auth: 'admin' });

route('DELETE', '/api/entries/:id', (ctx) => {
  const id = Number(ctx.params.id);
  for (const p of db.prepare('SELECT * FROM photos WHERE entry_id = ?').all(id)) deletePhoto(p);
  db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  return { ok: true };
}, { auth: 'admin' });

// ----- Stempeluhr -----
function runningEntry(userId) {
  return db.prepare(ENTRY_SELECT + ' WHERE e.user_id = ? AND e.end IS NULL ORDER BY e.start DESC LIMIT 1').get(userId);
}

route('GET', '/api/clock', (ctx) => {
  const r = runningEntry(ctx.user.id);
  const today = nowLocal().slice(0, 10);
  const todays = queryEntries({ from: today, to: today, userId: ctx.user.id });
  return {
    running: r ? decorate(r) : null,
    todayMinutes: todays.reduce((s, e) => s + e.minutes, 0),
    today: todays,
    photos: queryPhotos({ from: today, to: today, userId: ctx.user.id })
  };
});

route('POST', '/api/clock/in', (ctx) => {
  if (runningEntry(ctx.user.id)) throw new HttpError(400, 'Du bist bereits eingestempelt');
  const siteId = ctx.body.site_id ? Number(ctx.body.site_id) : null;
  if (siteId && !db.prepare('SELECT 1 FROM sites WHERE id = ? AND active = 1').get(siteId)) throw new HttpError(400, 'Objekt nicht gefunden');
  const loc = parseLocation(ctx.body.location);
  db.prepare(`INSERT INTO entries (user_id, site_id, start, note, source, start_lat, start_lng, start_acc)
    VALUES (?, ?, ?, ?, 'clock', ?, ?, ?)`)
    .run(ctx.user.id, siteId, nowLocal(), str(ctx.body.note, 1000), loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null);
  return { ok: true };
});

route('POST', '/api/clock/out', (ctx) => {
  const r = runningEntry(ctx.user.id);
  if (!r) throw new HttpError(400, 'Du bist nicht eingestempelt');
  const end = nowLocal();
  const dur = Math.max(0, minutesBetween(r.start, end));
  const brk = Math.min(Math.max(0, Math.round(num(ctx.body.break_minutes))), dur);
  const note = ctx.body.note !== undefined ? str(ctx.body.note, 1000) : r.note;
  const loc = parseLocation(ctx.body.location);
  db.prepare(`UPDATE entries SET end=?, break_minutes=?, note=?, end_lat=?, end_lng=?, end_acc=?, updated_at=datetime('now') WHERE id=?`)
    .run(end, brk, note, loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null, r.id);
  return { ok: true };
});

// Admin: Mitarbeiter auf Abstand ausstempeln (z.B. vergessen)
route('POST', '/api/entries/:id/stop', (ctx) => {
  const id = Number(ctx.params.id);
  const e = db.prepare('SELECT * FROM entries WHERE id = ? AND end IS NULL').get(id);
  if (!e) throw new HttpError(404, 'Kein laufender Eintrag');
  db.prepare(`UPDATE entries SET end=?, updated_at=datetime('now') WHERE id=?`).run(nowLocal(), id);
  return { ok: true };
}, { auth: 'admin' });

// ----- Fotos (Nachweis der Reinigung) -----
const PHOTO_SELECT = `
  SELECT p.id, p.entry_id, p.user_id, p.site_id, p.note, p.lat, p.lng, p.accuracy, p.taken_at,
    u.name AS user_name, s.name AS site_name
  FROM photos p JOIN users u ON u.id = p.user_id LEFT JOIN sites s ON s.id = p.site_id`;

function queryPhotos({ from, to, userId, siteId, entryId, limit }) {
  const where = [], args = [];
  if (from) { where.push('p.taken_at >= ?'); args.push(from + 'T00:00'); }
  if (to) { where.push('p.taken_at <= ?'); args.push(to + 'T23:59'); }
  if (userId) { where.push('p.user_id = ?'); args.push(userId); }
  if (siteId) { where.push('p.site_id = ?'); args.push(siteId); }
  if (entryId) { where.push('p.entry_id = ?'); args.push(entryId); }
  let sql = PHOTO_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.taken_at DESC, p.id DESC';
  if (limit) sql += ' LIMIT ' + Number(limit);
  return db.prepare(sql).all(...args);
}

function deletePhoto(p) {
  try { fs.unlinkSync(path.join(PHOTO_DIR, path.basename(p.filename))); } catch { /* schon weg */ }
  db.prepare('DELETE FROM photos WHERE id = ?').run(p.id);
}

const IMAGE_TYPES = {
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  png: { mime: 'image/png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { mime: 'image/webp', magic: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' }
};

route('GET', '/api/photos', (ctx) => {
  const f = entryFilters(ctx);
  const entryId = ctx.query.get('entry_id') ? Number(ctx.query.get('entry_id')) : null;
  const limit = Math.min(500, Number(ctx.query.get('limit')) || 200);
  return queryPhotos({ ...f, entryId, limit });
});

route('POST', '/api/photos', (ctx) => {
  const b = ctx.body;
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(String(b.image || ''));
  if (!m) throw new HttpError(400, 'Bitte ein Bild (JPG, PNG oder WebP) auswählen');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || !IMAGE_TYPES[ext].magic(buf)) throw new HttpError(400, 'Ungültige Bilddatei');

  // Eintrag zuordnen: angegebener Eintrag, sonst laufender, sonst letzter Eintrag von heute
  let entry = null;
  if (b.entry_id) {
    entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(b.entry_id));
    if (!entry) throw new HttpError(404, 'Eintrag nicht gefunden');
    if (ctx.user.role !== 'admin' && entry.user_id !== ctx.user.id) throw new HttpError(403, 'Keine Berechtigung');
  } else {
    entry = runningEntry(ctx.user.id) ||
      db.prepare('SELECT * FROM entries WHERE user_id = ? AND start >= ? ORDER BY start DESC LIMIT 1')
        .get(ctx.user.id, nowLocal().slice(0, 10) + 'T00:00');
  }
  if (!entry && ctx.user.role !== 'admin') throw new HttpError(400, 'Bitte zuerst einstempeln, dann Fotos hochladen');

  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, filename), buf);
  const loc = parseLocation(b.location);
  const r = db.prepare(`INSERT INTO photos (entry_id, user_id, site_id, filename, note, lat, lng, accuracy, taken_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    entry ? entry.id : null, entry ? entry.user_id : ctx.user.id, entry ? entry.site_id : null,
    filename, str(b.note, 300), loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null, nowLocal());
  return db.prepare(PHOTO_SELECT + ' WHERE p.id = ?').get(Number(r.lastInsertRowid));
}, { bodyLimit: 15_000_000 });

route('GET', '/api/photos/:id/file', (ctx) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(ctx.params.id));
  if (!p) throw new HttpError(404, 'Foto nicht gefunden');
  if (ctx.user.role !== 'admin' && p.user_id !== ctx.user.id) throw new HttpError(403, 'Keine Berechtigung');
  const file = path.join(PHOTO_DIR, path.basename(p.filename));
  if (!fs.existsSync(file)) throw new HttpError(404, 'Datei fehlt');
  const ext = path.extname(file).slice(1);
  ctx.res.writeHead(200, {
    'Content-Type': IMAGE_TYPES[ext]?.mime || 'application/octet-stream',
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(ctx.res);
  return undefined;
});

route('DELETE', '/api/photos/:id', (ctx) => {
  const p = db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(ctx.params.id));
  if (!p) throw new HttpError(404, 'Foto nicht gefunden');
  // Mitarbeiter dürfen eigene Fotos nur am selben Tag löschen
  if (ctx.user.role !== 'admin' && (p.user_id !== ctx.user.id || p.taken_at.slice(0, 10) !== nowLocal().slice(0, 10))) {
    throw new HttpError(403, 'Keine Berechtigung');
  }
  deletePhoto(p);
  return { ok: true };
});

// ----- Übersicht & Auswertung -----
route('GET', '/api/dashboard', () => {
  const today = nowLocal().slice(0, 10);
  const month = today.slice(0, 7);
  const running = db.prepare(ENTRY_SELECT + ' WHERE e.end IS NULL ORDER BY e.start').all().map(decorate);
  const todays = queryEntries({ from: today, to: today });
  const monthEntries = queryEntries({ from: month + '-01', to: month + '-31' });
  return {
    running,
    todayMinutes: todays.reduce((s, e) => s + e.minutes, 0),
    todayCount: todays.length,
    monthMinutes: monthEntries.reduce((s, e) => s + e.minutes, 0),
    activeEmployees: db.prepare("SELECT COUNT(*) AS c FROM users WHERE active = 1").get().c,
    activeSites: db.prepare('SELECT COUNT(*) AS c FROM sites WHERE active = 1').get().c,
    recent: todays.slice(0, 15),
    photos: queryPhotos({ limit: 12 })
  };
}, { auth: 'admin' });

function monthBounds(m) {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(y, mo, 0).getDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
}

route('GET', '/api/report', (ctx) => {
  const m = ctx.query.get('month');
  if (!MONTH_RE.test(m || '')) throw new HttpError(400, 'Monat im Format JJJJ-MM angeben');
  const { from, to } = monthBounds(m);
  const entries = queryEntries({ from, to });
  const users = db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all();
  const sites = db.prepare('SELECT * FROM sites ORDER BY name COLLATE NOCASE').all();
  const settings = getSettings();
  const limit = num(settings.minijob_limit);

  const byUser = users.map((u) => {
    const own = entries.filter((e) => e.user_id === u.id);
    const minutes = own.reduce((s, e) => s + e.minutes, 0);
    const wage = Math.round((minutes / 60) * u.hourly_rate * 100) / 100;
    const days = new Set(own.map((e) => e.start.slice(0, 10))).size;
    return {
      user_id: u.id, name: u.name, employment_type: u.employment_type, hourly_rate: u.hourly_rate,
      minutes, wage, days, entries: own.length,
      minijobWarning: u.employment_type === 'minijob' && limit > 0 && wage > limit
    };
  }).filter((r) => {
    const u = users.find((x) => x.id === r.user_id);
    return r.entries > 0 || (u.active && u.role === 'employee');
  });

  const bySite = sites.map((s) => {
    const own = entries.filter((e) => e.site_id === s.id);
    return { site_id: s.id, name: s.name, customer: s.customer, minutes: own.reduce((a, e) => a + e.minutes, 0), entries: own.length };
  }).filter((r) => r.entries > 0);
  const noSite = entries.filter((e) => !e.site_id);
  if (noSite.length) bySite.push({ site_id: null, name: '(ohne Objekt)', customer: '', minutes: noSite.reduce((a, e) => a + e.minutes, 0), entries: noSite.length });

  return {
    month: m, from, to, byUser, bySite,
    totalMinutes: entries.reduce((s, e) => s + e.minutes, 0),
    totalWage: Math.round(byUser.reduce((s, r) => s + r.wage, 0) * 100) / 100,
    settings
  };
}, { auth: 'admin' });

// Stundennachweis eines Mitarbeiters (Admin für alle, Mitarbeiter für sich selbst)
route('GET', '/api/timesheet', (ctx) => {
  const m = ctx.query.get('month');
  if (!MONTH_RE.test(m || '')) throw new HttpError(400, 'Monat im Format JJJJ-MM angeben');
  let userId = Number(ctx.query.get('user_id')) || ctx.user.id;
  if (ctx.user.role !== 'admin') userId = ctx.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new HttpError(404, 'Mitarbeiter nicht gefunden');
  const { from, to } = monthBounds(m);
  const entries = queryEntries({ from, to, userId }).reverse();
  const minutes = entries.reduce((s, e) => s + e.minutes, 0);
  return {
    month: m, user: publicUser(user), entries, minutes,
    wage: Math.round((minutes / 60) * user.hourly_rate * 100) / 100,
    companyName: getSettings().company_name
  };
});

// CSV-Export (Excel-kompatibel: Semikolon, UTF-8 BOM, deutsches Zahlenformat)
route('GET', '/api/export.csv', (ctx) => {
  const entries = queryEntries(entryFilters(ctx)).reverse();
  const users = new Map(db.prepare('SELECT id, hourly_rate FROM users').all().map((u) => [u.id, u.hourly_rate]));
  const esc = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const de = (n) => n.toFixed(2).replace('.', ',');
  const lines = [['Datum', 'Mitarbeiter', 'Objekt', 'Beginn', 'Ende', 'Pause (Min)', 'Stunden', 'Stundenlohn', 'Betrag', 'Notiz', 'Fotos', 'Standort Beginn', 'Standort Ende'].join(';')];
  const geo = (lat, lng) => (lat === null || lat === undefined ? '' : `https://www.google.com/maps?q=${lat},${lng}`);
  for (const e of entries) {
    const hours = e.minutes / 60;
    const rate = users.get(e.user_id) || 0;
    const [d, t] = e.start.split('T');
    lines.push([
      d.split('-').reverse().join('.'), e.user_name, e.site_name || '', t,
      e.end ? (e.end.slice(0, 10) === d ? e.end.slice(11) : e.end.replace('T', ' ')) : 'läuft',
      e.break_minutes, de(hours), de(rate), de(hours * rate), e.note, e.photo_count || 0,
      geo(e.start_lat, e.start_lng), geo(e.end_lat, e.end_lng)
    ].map(esc).join(';'));
  }
  const name = `zeiten_${entryFilters(ctx).from || 'alle'}_${entryFilters(ctx).to || ''}.csv`.replace(/_\.csv$/, '.csv');
  ctx.res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store'
  });
  ctx.res.end('﻿' + lines.join('\r\n'));
  return undefined;
}, { auth: 'admin' });

// Datensicherung
route('GET', '/api/backup', (ctx) => {
  const data = {
    exported_at: new Date().toISOString(),
    settings: getSettings(),
    users: db.prepare('SELECT * FROM users').all().map(publicUser),
    sites: db.prepare('SELECT * FROM sites').all(),
    entries: db.prepare('SELECT * FROM entries').all(),
    photos: db.prepare('SELECT * FROM photos').all()
  };
  ctx.res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="kayron-backup-${nowLocal().slice(0, 10)}.json"`
  });
  ctx.res.end(JSON.stringify(data, null, 2));
  return undefined;
}, { auth: 'admin' });

// ---------- Statische Dateien ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Verboten');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = path.join(PUBLIC_DIR, 'index.html');
  const ext = path.extname(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Methode nicht erlaubt');
    return serveStatic(req, res, url.pathname);
  }
  try {
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'Nicht gefunden');
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
    const user = currentUser(req);
    if (r.auth !== 'none' && !user) throw new HttpError(401, 'Bitte anmelden');
    if (r.auth === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Keine Berechtigung');
    // CSRF-Schutz: schreibende Anfragen nur als JSON
    if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) {
      throw new HttpError(415, 'Content-Type application/json erforderlich');
    }
    const body = req.method === 'GET' ? {} : await readBody(req, r.bodyLimit);
    const result = await r.handler({ req, res, params, query: url.searchParams, body, user });
    if (result !== undefined && !res.headersSent) send(res, 200, result);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Interner Fehler' : err.message });
  }
});

// abgelaufene Sessions aufräumen
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600000).unref();

server.listen(PORT, () => {
  console.log(`Kayron Zeiterfassung läuft auf http://localhost:${PORT}`);
});
