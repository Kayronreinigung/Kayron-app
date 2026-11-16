'use strict';
/* Offline-Modus: Aktionen (Stempeln, Fotos, Meldungen) werden ohne Netz auf dem Handy gespeichert
   und automatisch übertragen, sobald wieder Verbindung besteht. */

const Offline = (() => {
  const DB_NAME = 'kayron-offline';
  const STORE = 'queue';
  let dbPromise = null;
  let syncing = null;
  const listeners = new Set();

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const out = fn(store);
      tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  function nowStamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  async function all() {
    try {
      const items = (await run('readonly', (s) => s.getAll())) || [];
      return items.sort((a, b) => a.created - b.created);
    } catch { return []; }
  }
  async function add(item) { await run('readwrite', (s) => s.put(item)); notify(); }
  async function remove(id) { await run('readwrite', (s) => s.delete(id)); notify(); }

  async function pending(userId) {
    const items = await all();
    return userId ? items.filter((i) => i.userId === userId) : items;
  }

  function notify() { listeners.forEach((fn) => { try { fn(); } catch { /* egal */ } }); }
  function onChange(fn) { listeners.add(fn); }

  // Schickt eine Aktion ab – oder speichert sie, falls kein Netz da ist.
  // Ergebnis: Serverantwort, oder { queued: true } wenn offline gespeichert.
  async function send(url, body, { label, userId }) {
    const item = {
      id: uuid(), url, label, userId, created: Date.now(),
      body: { ...body, client_id: undefined, at: nowStamp() }
    };
    item.body.client_id = item.id;
    // Reihenfolge einhalten: erst ältere wartende Aktionen übertragen
    if ((await pending(userId)).length) await sync();
    const stillWaiting = (await pending(userId)).length > 0;
    if (!stillWaiting && navigator.onLine !== false) {
      try {
        return await api('POST', url, item.body, { timeout: 45000 });
      } catch (e) {
        if (!e.network) throw e;
      }
    }
    await add(item);
    return { queued: true, at: item.body.at };
  }

  // Überträgt alle wartenden Aktionen der Reihe nach
  function sync() {
    if (syncing) return syncing;
    syncing = (async () => {
      const result = { sent: 0, failed: [] };
      for (const item of await all()) {
        if (state.user && item.userId !== state.user.id) continue; // fremde Einträge (anderer Login) überspringen
        try {
          await api('POST', item.url, item.body, { timeout: 60000, silent401: true });
          await remove(item.id);
          result.sent++;
        } catch (e) {
          if (e.network || e.status === 401) break; // später erneut versuchen
          // Server hat die Aktion abgelehnt (z. B. "bereits eingestempelt") -> nicht endlos wiederholen
          await remove(item.id);
          result.failed.push({ label: item.label, at: item.body.at, error: e.message });
        }
      }
      return result;
    })().finally(() => { syncing = null; });
    return syncing;
  }

  return { send, sync, pending, onChange, nowStamp };
})();

// Automatisch übertragen: wenn das Netz zurückkommt, beim Öffnen der App und alle 30 Sekunden
async function offlineSync({ quiet = false } = {}) {
  if (!state.user || navigator.onLine === false) return;
  const r = await Offline.sync();
  if (r.sent && !quiet) toast(r.sent === 1 ? '1 offline gespeicherte Aktion übertragen' : `${r.sent} offline gespeicherte Aktionen übertragen`);
  if (r.failed.length) {
    alert('Folgende offline gespeicherte Aktionen konnten nicht übernommen werden:\n\n' +
      r.failed.map((f) => `• ${f.label} (${f.at.replace('T', ' ')}): ${f.error}`).join('\n') +
      '\n\nBitte beim Chef melden.');
  }
  if (r.sent || r.failed.length) {
    const page = parseHash().page;
    if (!$('#modal-root').innerHTML && ['stempeln', 'meine-zeiten', 'meldungen', ''].includes(page)) render();
  }
}

window.addEventListener('online', () => { updateOfflineBanner(); offlineSync(); });
window.addEventListener('offline', updateOfflineBanner);
setInterval(() => offlineSync(), 30000);
Offline.onChange(updateOfflineBanner);

async function updateOfflineBanner() {
  const el = document.getElementById('offline-banner');
  if (!el || !state.user) return;
  const n = (await Offline.pending(state.user.id)).length;
  const offline = navigator.onLine === false;
  if (!offline && !n) { el.hidden = true; return; }
  el.hidden = false;
  el.className = 'offline-banner' + (offline ? ' off' : '');
  el.innerHTML = (offline ? '<strong>Kein Internet.</strong> Stempeln, Fotos und Meldungen werden auf dem Handy gespeichert. ' : '') +
    (n ? `<span>${n} ${n === 1 ? 'Aktion wartet' : 'Aktionen warten'} auf Übertragung.</span>` : '') +
    (!offline && n ? ' <button class="btn small" id="sync-now">Jetzt senden</button>' : '');
  const b = document.getElementById('sync-now');
  if (b) b.onclick = () => offlineSync();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
