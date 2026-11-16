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

CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                 -- urlaub, krank, kind_krank, unbezahlt, sonstiges
  start_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'beantragt', -- beantragt, genehmigt, abgelehnt
  note TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  certificate INTEGER NOT NULL DEFAULT 0, -- Krankmeldung (AU) liegt vor
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_absences_user ON absences(user_id, start_date);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'sonstiges',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'offen', -- offen, in_bearbeitung, erledigt
  admin_note TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  offline INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS site_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'buero', -- buero, ausgegeben, verloren
  holder_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  since TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS key_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id INTEGER NOT NULL REFERENCES site_keys(id) ON DELETE CASCADE,
  action TEXT NOT NULL,               -- angelegt, ausgabe, rueckgabe, verloren
  holder_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

-- Offline-Aktionen, die schon verarbeitet wurden (verhindert doppelte Einträge)
CREATE TABLE IF NOT EXISTS processed_ops (
  client_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
addColumn('entries', 'offline', 'INTEGER NOT NULL DEFAULT 0');
addColumn('photos', 'issue_id', 'INTEGER');
addColumn('photos', 'offline', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'vacation_days', 'REAL NOT NULL DEFAULT 0');
db.exec('CREATE INDEX IF NOT EXISTS idx_photos_issue ON photos(issue_id)');
db.prepare("DELETE FROM processed_ops WHERE created_at < datetime('now', '-30 days')").run();

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

// Zeitpunkt einer Aktion: Bei Offline-Aktionen schickt das Handy die echte Uhrzeit mit ('at').
function clientTime(b) {
  const now = nowLocal();
  if (!b || !b.at) return { at: now, offline: 0 };
  const at = str(b.at, 16);
  if (!DT_RE.test(at)) throw new HttpError(400, 'Ungültige Zeitangabe');
  const diff = minutesBetween(at, now); // > 0: liegt in der Vergangenheit
  if (diff < -10) throw new HttpError(400, 'Die Uhrzeit des Handys liegt in der Zukunft – bitte Uhrzeit prüfen');
  if (diff > 72 * 60) throw new HttpError(400, 'Offline-Eintrag ist älter als 3 Tage – bitte beim Chef melden');
  return diff > 2 ? { at, offline: 1 } : { at: now, offline: 0 };
}

// Führt eine Aktion mit client_id nur einmal aus (wichtig, wenn das Handy offline gespeicherte Aktionen erneut sendet)
function once(ctx, fn) {
  const cid = ctx.body && ctx.body.client_id ? str(ctx.body.client_id, 64) : null;
  if (cid) {
    const done = db.prepare('SELECT result FROM processed_ops WHERE client_id = ? AND user_id = ?').get(cid, ctx.user.id);
    if (done) return { ...JSON.parse(done.result || '{}'), duplicate: true };
  }
  const result = fn();
  if (cid) {
    db.prepare('INSERT OR IGNORE INTO processed_ops (client_id, user_id, result) VALUES (?, ?, ?)')
      .run(cid, ctx.user.id, JSON.stringify(result && result.id ? { ok: true, id: result.id } : result || { ok: true }));
  }
  return result;
}

// ---- Arbeitstage (Mo–Fr ohne bundesweite Feiertage) ----
function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDaysStr(dateStr, n) { const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); }
const holidayCache = new Map();
function holidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  // Osterdatum (Gauß/Anonymer Gregorianischer Algorithmus)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const set = new Set([
    `${y}-01-01`, addDaysStr(easter, -2), addDaysStr(easter, 1), `${y}-05-01`,
    addDaysStr(easter, 39), addDaysStr(easter, 50), `${y}-10-03`, `${y}-12-25`, `${y}-12-26`
  ]);
  holidayCache.set(y, set);
  return set;
}
function workdays(from, to) {
  if (!from || !to || from > to) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays(Number(d.slice(0, 4))).has(d)) n++;
  }
  return n;
}
const maxStr = (...a) => a.filter(Boolean).sort().pop();
const minStr = (...a) => a.filter(Boolean).sort()[0];
const fmtD = (d) => d.split('-').reverse().join('.');

// ---- Bilder ----
const IMAGE_TYPES = {
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  png: { mime: 'image/png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  webp: { mime: 'image/webp', magic: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' }
};
function decodeImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Bitte ein Bild (JPG, PNG oder WebP) auswählen');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || !IMAGE_TYPES[ext].magic(buf)) throw new HttpError(400, 'Ungültige Bilddatei');
  return { buf, ext };
}
function savePhotoFile({ buf, ext }) {
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PHOTO_DIR, filename), buf);
  return filename;
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
  db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM site_keys k WHERE k.holder_id = u.id AND k.status = 'ausgegeben') AS keys_held
    FROM users u ORDER BY u.active DESC, u.name COLLATE NOCASE`).all().map(publicUser),
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
    vacation_days: Math.max(0, Math.min(365, num(b.vacation_days))),
    active: b.active === false || b.active === 0 ? 0 : 1
  };
}

route('POST', '/api/users', (ctx) => {
  const f = userFields(ctx.body);
  const pw = String(ctx.body.password || '');
  if (!f.name || !f.username) throw new HttpError(400, 'Name und Benutzername erforderlich');
  if (pw.length < 4) throw new HttpError(400, 'Passwort/PIN muss mindestens 4 Zeichen haben');
  try {
    const r = db.prepare(`INSERT INTO users (name, username, password_hash, role, hourly_rate, employment_type, phone, active, vacation_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(f.name, f.username, hashPassword(pw), f.role, f.hourly_rate, f.employment_type, f.phone, f.active, f.vacation_days);
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
    db.prepare(`UPDATE users SET name=?, username=?, role=?, hourly_rate=?, employment_type=?, phone=?, active=?, vacation_days=? WHERE id=?`)
      .run(f.name, f.username, f.role, f.hourly_rate, f.employment_type, f.phone, f.active, f.vacation_days, id);
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

route('POST', '/api/clock/in', (ctx) => once(ctx, () => {
  const { at, offline } = clientTime(ctx.body);
  const running = runningEntry(ctx.user.id);
  if (running) throw new HttpError(400, `Du bist bereits eingestempelt (seit ${fmtD(running.start.slice(0, 10))} ${running.start.slice(11)})`);
  const siteId = ctx.body.site_id ? Number(ctx.body.site_id) : null;
  if (siteId && !db.prepare('SELECT 1 FROM sites WHERE id = ?').get(siteId)) throw new HttpError(400, 'Objekt nicht gefunden');
  const loc = parseLocation(ctx.body.location);
  const r = db.prepare(`INSERT INTO entries (user_id, site_id, start, note, source, start_lat, start_lng, start_acc, offline)
    VALUES (?, ?, ?, ?, 'clock', ?, ?, ?, ?)`)
    .run(ctx.user.id, siteId, at, str(ctx.body.note, 1000), loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null, offline);
  return { ok: true, id: Number(r.lastInsertRowid), at };
}));

route('POST', '/api/clock/out', (ctx) => once(ctx, () => {
  const { at, offline } = clientTime(ctx.body);
  const r = runningEntry(ctx.user.id);
  if (!r) throw new HttpError(400, 'Du bist nicht eingestempelt');
  const end = at < r.start ? r.start : at;
  const dur = Math.max(0, minutesBetween(r.start, end));
  const brk = Math.min(Math.max(0, Math.round(num(ctx.body.break_minutes))), dur);
  const note = ctx.body.note !== undefined ? str(ctx.body.note, 1000) : r.note;
  const loc = parseLocation(ctx.body.location);
  db.prepare(`UPDATE entries SET end=?, break_minutes=?, note=?, end_lat=?, end_lng=?, end_acc=?,
      offline = MAX(offline, ?), updated_at=datetime('now') WHERE id=?`)
    .run(end, brk, note, loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null, offline, r.id);
  return { ok: true, id: r.id, at: end };
}));

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
  SELECT p.id, p.entry_id, p.issue_id, p.user_id, p.site_id, p.note, p.lat, p.lng, p.accuracy, p.taken_at, p.offline,
    u.name AS user_name, s.name AS site_name
  FROM photos p JOIN users u ON u.id = p.user_id LEFT JOIN sites s ON s.id = p.site_id`;

function queryPhotos({ from, to, userId, siteId, entryId, issueId, limit }) {
  const where = [], args = [];
  if (issueId) { where.push('p.issue_id = ?'); args.push(issueId); } else where.push('p.issue_id IS NULL');
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

route('GET', '/api/photos', (ctx) => {
  const f = entryFilters(ctx);
  const entryId = ctx.query.get('entry_id') ? Number(ctx.query.get('entry_id')) : null;
  const limit = Math.min(500, Number(ctx.query.get('limit')) || 200);
  return queryPhotos({ ...f, entryId, limit });
});

route('POST', '/api/photos', (ctx) => once(ctx, () => {
  const b = ctx.body;
  const img = decodeImage(b.image);
  const { at, offline } = clientTime(b);

  // Eintrag zuordnen: angegebener Eintrag, sonst der Einsatz zum Aufnahmezeitpunkt, sonst letzter Eintrag des Tages
  let entry = null;
  if (b.entry_id) {
    entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(Number(b.entry_id));
    if (!entry) throw new HttpError(404, 'Eintrag nicht gefunden');
    if (ctx.user.role !== 'admin' && entry.user_id !== ctx.user.id) throw new HttpError(403, 'Keine Berechtigung');
  } else {
    entry = db.prepare(`SELECT * FROM entries WHERE user_id = ? AND start <= ? AND (end IS NULL OR end >= ?)
        ORDER BY start DESC LIMIT 1`).get(ctx.user.id, at, at) ||
      db.prepare('SELECT * FROM entries WHERE user_id = ? AND start >= ? AND start <= ? ORDER BY start DESC LIMIT 1')
        .get(ctx.user.id, at.slice(0, 10) + 'T00:00', at.slice(0, 10) + 'T23:59');
  }
  if (!entry && ctx.user.role !== 'admin') throw new HttpError(400, 'Bitte zuerst einstempeln, dann Fotos hochladen');

  const filename = savePhotoFile(img);
  const loc = parseLocation(b.location);
  const r = db.prepare(`INSERT INTO photos (entry_id, user_id, site_id, filename, note, lat, lng, accuracy, taken_at, offline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    entry ? entry.id : null, entry ? entry.user_id : ctx.user.id, entry ? entry.site_id : null,
    filename, str(b.note, 300), loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null, at, offline);
  return db.prepare(PHOTO_SELECT + ' WHERE p.id = ?').get(Number(r.lastInsertRowid));
}), { bodyLimit: 15_000_000 });

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

// ----- Abwesenheiten (Urlaub, Krankheit) -----
const ABSENCE_TYPES = ['urlaub', 'krank', 'kind_krank', 'unbezahlt', 'sonstiges'];
const ABSENCE_STATUS = ['beantragt', 'genehmigt', 'abgelehnt'];
const SICK_TYPES = ['krank', 'kind_krank'];
const ABSENCE_SELECT = 'SELECT a.*, u.name AS user_name FROM absences a JOIN users u ON u.id = a.user_id';

function decorateAbsence(a) { return { ...a, days: workdays(a.start_date, a.end_date) }; }

// Abwesenheiten, die den Zeitraum berühren (ohne abgelehnte), mit Arbeitstagen innerhalb des Zeitraums
function absencesIn(userId, from, to) {
  const where = ['a.start_date <= ?', 'a.end_date >= ?', "a.status != 'abgelehnt'"], args = [to, from];
  if (userId) { where.push('a.user_id = ?'); args.push(userId); }
  return db.prepare(ABSENCE_SELECT + ' WHERE ' + where.join(' AND ') + ' ORDER BY a.start_date').all(...args)
    .map((a) => ({ ...decorateAbsence(a), daysInRange: workdays(maxStr(a.start_date, from), minStr(a.end_date, to)) }));
}
function absenceDays(userId, types, from, to) {
  return absencesIn(userId, from, to).filter((a) => types.includes(a.type) && a.status === 'genehmigt')
    .reduce((s, a) => s + a.daysInRange, 0);
}

function validateAbsence(b) {
  const type = ABSENCE_TYPES.includes(b.type) ? b.type : null;
  if (!type) throw new HttpError(400, 'Bitte Art der Abwesenheit wählen');
  const start = str(b.start_date, 10), end = str(b.end_date || b.start_date, 10);
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) throw new HttpError(400, 'Bitte gültige Daten angeben');
  if (end < start) throw new HttpError(400, 'Das Ende liegt vor dem Beginn');
  if (addDaysStr(start, 366) < end) throw new HttpError(400, 'Zeitraum ist zu lang (max. 1 Jahr)');
  return { type, start_date: start, end_date: end, note: str(b.note, 1000) };
}
function checkAbsenceOverlap(userId, start, end, excludeId = 0) {
  const o = db.prepare(`SELECT * FROM absences WHERE user_id = ? AND status != 'abgelehnt'
    AND start_date <= ? AND end_date >= ? AND id != ?`).get(userId, end, start, excludeId);
  if (o) throw new HttpError(400, `Überschneidet sich mit einer bestehenden Abwesenheit (${fmtD(o.start_date)} – ${fmtD(o.end_date)})`);
}

route('GET', '/api/workdays', (ctx) => {
  const from = ctx.query.get('from'), to = ctx.query.get('to') || from;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw new HttpError(400, 'Datum fehlt');
  return { days: workdays(from, to) };
});

route('GET', '/api/absences', (ctx) => {
  const q = ctx.query, where = [], args = [];
  let userId = q.get('user_id') ? Number(q.get('user_id')) : null;
  if (ctx.user.role !== 'admin') userId = ctx.user.id;
  if (userId) { where.push('a.user_id = ?'); args.push(userId); }
  if (DATE_RE.test(q.get('from') || '')) { where.push('a.end_date >= ?'); args.push(q.get('from')); }
  if (DATE_RE.test(q.get('to') || '')) { where.push('a.start_date <= ?'); args.push(q.get('to')); }
  if (ABSENCE_STATUS.includes(q.get('status'))) { where.push('a.status = ?'); args.push(q.get('status')); }
  if (ABSENCE_TYPES.includes(q.get('type'))) { where.push('a.type = ?'); args.push(q.get('type')); }
  return db.prepare(ABSENCE_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY a.start_date DESC').all(...args).map(decorateAbsence);
});

route('POST', '/api/absences', (ctx) => {
  const isAdmin = ctx.user.role === 'admin';
  const userId = isAdmin && ctx.body.user_id ? Number(ctx.body.user_id) : ctx.user.id;
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) throw new HttpError(400, 'Mitarbeiter nicht gefunden');
  const f = validateAbsence(ctx.body);
  let status;
  if (isAdmin) status = ABSENCE_STATUS.includes(ctx.body.status) ? ctx.body.status : 'genehmigt';
  else status = SICK_TYPES.includes(f.type) ? 'genehmigt' : 'beantragt'; // Krankmeldungen gelten sofort
  if (status !== 'abgelehnt') checkAbsenceOverlap(userId, f.start_date, f.end_date);
  const r = db.prepare(`INSERT INTO absences (user_id, type, start_date, end_date, status, note, admin_note, certificate, created_by, decided_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, f.type, f.start_date, f.end_date, status, f.note,
    isAdmin ? str(ctx.body.admin_note, 1000) : '', isAdmin && ctx.body.certificate ? 1 : 0, ctx.user.id,
    isAdmin ? nowLocal() : null);
  return decorateAbsence(db.prepare(ABSENCE_SELECT + ' WHERE a.id = ?').get(Number(r.lastInsertRowid)));
});

route('PUT', '/api/absences/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const existing = db.prepare('SELECT * FROM absences WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, 'Abwesenheit nicht gefunden');
  const merged = { ...existing, ...ctx.body };
  const f = validateAbsence(merged);
  const status = ABSENCE_STATUS.includes(merged.status) ? merged.status : existing.status;
  const userId = Number(merged.user_id);
  if (status !== 'abgelehnt') checkAbsenceOverlap(userId, f.start_date, f.end_date, id);
  db.prepare(`UPDATE absences SET user_id=?, type=?, start_date=?, end_date=?, status=?, note=?, admin_note=?, certificate=?,
      decided_at = CASE WHEN status != ? THEN ? ELSE decided_at END WHERE id=?`)
    .run(userId, f.type, f.start_date, f.end_date, status, f.note, str(merged.admin_note, 1000),
      merged.certificate === true || merged.certificate === 1 ? 1 : 0, status, nowLocal(), id);
  return decorateAbsence(db.prepare(ABSENCE_SELECT + ' WHERE a.id = ?').get(id));
}, { auth: 'admin' });

route('DELETE', '/api/absences/:id', (ctx) => {
  const a = db.prepare('SELECT * FROM absences WHERE id = ?').get(Number(ctx.params.id));
  if (!a) throw new HttpError(404, 'Abwesenheit nicht gefunden');
  if (ctx.user.role !== 'admin' && (a.user_id !== ctx.user.id || a.status !== 'beantragt')) {
    throw new HttpError(403, 'Nur offene Anträge können zurückgezogen werden');
  }
  db.prepare('DELETE FROM absences WHERE id = ?').run(a.id);
  return { ok: true };
});

// Urlaubskonto pro Jahr
route('GET', '/api/absences/summary', (ctx) => {
  const today = nowLocal().slice(0, 10);
  const y = Number(ctx.query.get('year')) || Number(today.slice(0, 4));
  const from = `${y}-01-01`, to = `${y}-12-31`, tomorrow = addDaysStr(today, 1);
  const users = ctx.user.role === 'admin'
    ? db.prepare(`SELECT * FROM users WHERE active = 1 OR id IN (SELECT user_id FROM absences WHERE start_date <= ? AND end_date >= ?)
        ORDER BY name COLLATE NOCASE`).all(to, from)
    : [ctx.user];
  return users.map((u) => {
    const list = absencesIn(u.id, from, to);
    const vac = list.filter((a) => a.type === 'urlaub');
    const approved = vac.filter((a) => a.status === 'genehmigt');
    const taken = approved.reduce((s, a) => s + workdays(maxStr(a.start_date, from), minStr(a.end_date, to, today)), 0);
    const planned = approved.reduce((s, a) => s + workdays(maxStr(a.start_date, from, tomorrow), minStr(a.end_date, to)), 0);
    const requested = vac.filter((a) => a.status === 'beantragt').reduce((s, a) => s + a.daysInRange, 0);
    const sick = list.filter((a) => SICK_TYPES.includes(a.type) && a.status === 'genehmigt').reduce((s, a) => s + a.daysInRange, 0);
    return {
      user_id: u.id, name: u.name, entitlement: u.vacation_days || 0, taken, planned, requested,
      remaining: (u.vacation_days || 0) - taken - planned, sick
    };
  });
});

// ----- Meldungen (Mängel, fehlendes Material, Schäden) -----
const ISSUE_CATEGORIES = ['defekt', 'material', 'schaden', 'verschmutzung', 'schluessel', 'sonstiges'];
const ISSUE_STATUS = ['offen', 'in_bearbeitung', 'erledigt'];
const ISSUE_SELECT = `SELECT i.*, u.name AS user_name, s.name AS site_name, s.address AS site_address
  FROM issues i JOIN users u ON u.id = i.user_id LEFT JOIN sites s ON s.id = i.site_id`;

function decorateIssue(i) {
  return { ...i, photos: queryPhotos({ issueId: i.id }).reverse() };
}

route('GET', '/api/issues', (ctx) => {
  const q = ctx.query, where = [], args = [];
  if (ctx.user.role !== 'admin') { where.push('i.user_id = ?'); args.push(ctx.user.id); }
  const st = q.get('status');
  if (st === 'aktiv') where.push("i.status != 'erledigt'");
  else if (ISSUE_STATUS.includes(st)) { where.push('i.status = ?'); args.push(st); }
  if (q.get('site_id')) { where.push('i.site_id = ?'); args.push(Number(q.get('site_id'))); }
  const limit = Math.min(500, Number(q.get('limit')) || 200);
  return db.prepare(ISSUE_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ` ORDER BY i.created_at DESC, i.id DESC LIMIT ${limit}`).all(...args).map(decorateIssue);
});

route('POST', '/api/issues', (ctx) => once(ctx, () => {
  const b = ctx.body;
  const { at, offline } = clientTime(b);
  const category = ISSUE_CATEGORIES.includes(b.category) ? b.category : 'sonstiges';
  const description = str(b.description, 2000);
  const images = Array.isArray(b.images) ? b.images.slice(0, 6).map(decodeImage) : [];
  if (!description && !images.length) throw new HttpError(400, 'Bitte beschreiben, was los ist, oder ein Foto anhängen');
  const siteId = b.site_id ? Number(b.site_id) : null;
  if (siteId && !db.prepare('SELECT 1 FROM sites WHERE id = ?').get(siteId)) throw new HttpError(400, 'Objekt nicht gefunden');
  const loc = parseLocation(b.location);
  const r = db.prepare(`INSERT INTO issues (user_id, site_id, category, description, lat, lng, offline, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(ctx.user.id, siteId, category, description, loc?.lat ?? null, loc?.lng ?? null, offline, at);
  const issueId = Number(r.lastInsertRowid);
  for (const img of images) {
    db.prepare(`INSERT INTO photos (issue_id, user_id, site_id, filename, note, lat, lng, accuracy, taken_at, offline)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?)`).run(issueId, ctx.user.id, siteId, savePhotoFile(img),
      loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy ?? null, at, offline);
  }
  return decorateIssue(db.prepare(ISSUE_SELECT + ' WHERE i.id = ?').get(issueId));
}), { bodyLimit: 40_000_000 });

route('PUT', '/api/issues/:id', (ctx) => {
  const id = Number(ctx.params.id);
  const i = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  if (!i) throw new HttpError(404, 'Meldung nicht gefunden');
  const status = ISSUE_STATUS.includes(ctx.body.status) ? ctx.body.status : i.status;
  const note = ctx.body.admin_note !== undefined ? str(ctx.body.admin_note, 2000) : i.admin_note;
  const resolved = status === 'erledigt' ? (i.resolved_at || nowLocal()) : null;
  db.prepare("UPDATE issues SET status=?, admin_note=?, resolved_at=?, updated_at=? WHERE id=?").run(status, note, resolved, nowLocal(), id);
  return decorateIssue(db.prepare(ISSUE_SELECT + ' WHERE i.id = ?').get(id));
}, { auth: 'admin' });

route('DELETE', '/api/issues/:id', (ctx) => {
  const id = Number(ctx.params.id);
  for (const p of db.prepare('SELECT * FROM photos WHERE issue_id = ?').all(id)) deletePhoto(p);
  db.prepare('DELETE FROM issues WHERE id = ?').run(id);
  return { ok: true };
}, { auth: 'admin' });

// ----- Schlüsselverwaltung -----
const KEY_SELECT = `SELECT k.*, s.name AS site_name, u.name AS holder_name
  FROM site_keys k LEFT JOIN sites s ON s.id = k.site_id LEFT JOIN users u ON u.id = k.holder_id`;
function keyEvent(keyId, action, holderId, byId, note) {
  db.prepare('INSERT INTO key_events (key_id, action, holder_id, by_user_id, at, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(keyId, action, holderId || null, byId || null, nowLocal(), str(note, 500));
}
function getKey(id) {
  const k = db.prepare(KEY_SELECT + ' WHERE k.id = ?').get(Number(id));
  if (!k) throw new HttpError(404, 'Schlüssel nicht gefunden');
  return k;
}
function keyFields(b) {
  const label = str(b.label, 150);
  if (!label) throw new HttpError(400, 'Bitte eine Bezeichnung angeben (z. B. „Haupteingang“)');
  const siteId = b.site_id ? Number(b.site_id) : null;
  if (siteId && !db.prepare('SELECT 1 FROM sites WHERE id = ?').get(siteId)) throw new HttpError(400, 'Objekt nicht gefunden');
  return { label, number: str(b.number, 100), notes: str(b.notes, 1000), site_id: siteId, active: b.active === false || b.active === 0 ? 0 : 1 };
}

route('GET', '/api/keys', () => db.prepare(KEY_SELECT + ' ORDER BY k.active DESC, s.name COLLATE NOCASE, k.label COLLATE NOCASE').all(), { auth: 'admin' });
route('GET', '/api/keys/mine', (ctx) => db.prepare(KEY_SELECT + " WHERE k.holder_id = ? AND k.status = 'ausgegeben' ORDER BY s.name, k.label").all(ctx.user.id));

route('POST', '/api/keys', (ctx) => {
  const f = keyFields(ctx.body);
  const r = db.prepare('INSERT INTO site_keys (site_id, label, number, notes, active, since) VALUES (?, ?, ?, ?, ?, ?)')
    .run(f.site_id, f.label, f.number, f.notes, f.active, nowLocal());
  const id = Number(r.lastInsertRowid);
  keyEvent(id, 'angelegt', null, ctx.user.id, '');
  return getKey(id);
}, { auth: 'admin' });

route('PUT', '/api/keys/:id', (ctx) => {
  const k = getKey(ctx.params.id);
  const f = keyFields({ ...k, ...ctx.body });
  db.prepare('UPDATE site_keys SET site_id=?, label=?, number=?, notes=?, active=? WHERE id=?')
    .run(f.site_id, f.label, f.number, f.notes, f.active, k.id);
  return getKey(k.id);
}, { auth: 'admin' });

route('DELETE', '/api/keys/:id', (ctx) => {
  const k = getKey(ctx.params.id);
  if (k.status === 'ausgegeben') throw new HttpError(400, 'Schlüssel ist noch ausgegeben – bitte erst zurücknehmen');
  db.prepare('DELETE FROM site_keys WHERE id = ?').run(k.id);
  return { ok: true };
}, { auth: 'admin' });

route('POST', '/api/keys/:id/handout', (ctx) => {
  const k = getKey(ctx.params.id);
  const userId = Number(ctx.body.user_id);
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(userId);
  if (!u) throw new HttpError(400, 'Bitte einen aktiven Mitarbeiter wählen');
  if (k.status === 'ausgegeben' && k.holder_id === userId) throw new HttpError(400, `${u.name} hat den Schlüssel bereits`);
  if (k.status === 'ausgegeben') keyEvent(k.id, 'rueckgabe', k.holder_id, ctx.user.id, 'Weitergabe an ' + u.name);
  db.prepare("UPDATE site_keys SET status='ausgegeben', holder_id=?, since=? WHERE id=?").run(userId, nowLocal(), k.id);
  keyEvent(k.id, 'ausgabe', userId, ctx.user.id, ctx.body.note);
  return getKey(k.id);
}, { auth: 'admin' });

route('POST', '/api/keys/:id/return', (ctx) => {
  const k = getKey(ctx.params.id);
  if (k.status === 'buero') throw new HttpError(400, 'Schlüssel ist bereits im Büro');
  db.prepare("UPDATE site_keys SET status='buero', holder_id=NULL, since=? WHERE id=?").run(nowLocal(), k.id);
  keyEvent(k.id, k.status === 'verloren' ? 'gefunden' : 'rueckgabe', k.holder_id, ctx.user.id, ctx.body.note);
  return getKey(k.id);
}, { auth: 'admin' });

route('POST', '/api/keys/:id/lost', (ctx) => {
  const k = getKey(ctx.params.id);
  if (k.status === 'verloren') throw new HttpError(400, 'Schlüssel ist bereits als verloren gemeldet');
  db.prepare("UPDATE site_keys SET status='verloren', since=? WHERE id=?").run(nowLocal(), k.id);
  keyEvent(k.id, 'verloren', k.holder_id, ctx.user.id, ctx.body.note);
  return getKey(k.id);
}, { auth: 'admin' });

route('GET', '/api/keys/:id/events', (ctx) => {
  getKey(ctx.params.id);
  return db.prepare(`SELECT e.*, h.name AS holder_name, b.name AS by_name FROM key_events e
    LEFT JOIN users h ON h.id = e.holder_id LEFT JOIN users b ON b.id = e.by_user_id
    WHERE e.key_id = ? ORDER BY e.at DESC, e.id DESC`).all(Number(ctx.params.id));
}, { auth: 'admin' });

// Zähler für die Navigation (offene Anträge / Meldungen)
route('GET', '/api/badges', () => ({
  absences: db.prepare("SELECT COUNT(*) AS c FROM absences WHERE status = 'beantragt'").get().c,
  issues: db.prepare("SELECT COUNT(*) AS c FROM issues WHERE status = 'offen'").get().c
}), { auth: 'admin' });

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
    photos: queryPhotos({ limit: 12 }),
    absentToday: absencesIn(null, today, today).filter((a) => a.status === 'genehmigt'),
    pendingAbsences: db.prepare(ABSENCE_SELECT + " WHERE a.status = 'beantragt' ORDER BY a.start_date").all().map(decorateAbsence),
    openIssues: db.prepare(ISSUE_SELECT + " WHERE i.status != 'erledigt' ORDER BY i.created_at DESC LIMIT 6").all(),
    openIssueCount: db.prepare("SELECT COUNT(*) AS c FROM issues WHERE status != 'erledigt'").get().c,
    keysOut: db.prepare("SELECT COUNT(*) AS c FROM site_keys WHERE status = 'ausgegeben'").get().c,
    keysLost: db.prepare("SELECT COUNT(*) AS c FROM site_keys WHERE status = 'verloren' AND active = 1").get().c
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
      vacationDays: absenceDays(u.id, ['urlaub'], from, to),
      sickDays: absenceDays(u.id, SICK_TYPES, from, to),
      minijobWarning: u.employment_type === 'minijob' && limit > 0 && wage > limit
    };
  }).filter((r) => {
    const u = users.find((x) => x.id === r.user_id);
    return r.entries > 0 || r.vacationDays > 0 || r.sickDays > 0 || (u.active && u.role === 'employee');
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
    absences: absencesIn(userId, from, to).filter((a) => a.status === 'genehmigt'),
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
    photos: db.prepare('SELECT * FROM photos').all(),
    absences: db.prepare('SELECT * FROM absences').all(),
    issues: db.prepare('SELECT * FROM issues').all(),
    keys: db.prepare('SELECT * FROM site_keys').all(),
    key_events: db.prepare('SELECT * FROM key_events').all()
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
    'Cache-Control': 'no-cache',
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
