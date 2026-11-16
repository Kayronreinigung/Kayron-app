'use strict';
/* Zusatzbereiche: Urlaub & Krankheit, Meldungen (Mängel), Schlüsselverwaltung.
   Nutzt die Hilfsfunktionen aus app.js (wird danach geladen; Aufrufe erfolgen erst zur Laufzeit). */

// ======================================================================
// Urlaub & Krankheit
// ======================================================================
const ABSENCE_TYPES = { urlaub: 'Urlaub', krank: 'Krank', kind_krank: 'Kind krank', unbezahlt: 'Unbezahlt frei', sonstiges: 'Sonstiges' };
const SICK = ['krank', 'kind_krank'];

function absenceBadge(a) {
  const cls = a.type === 'urlaub' ? 'brand' : SICK.includes(a.type) ? 'danger' : '';
  return `<span class="badge ${cls}">${ABSENCE_TYPES[a.type] || esc(a.type)}</span>`;
}
function absenceStatusBadge(a) {
  if (a.status === 'genehmigt') return `<span class="badge ok">${SICK.includes(a.type) ? 'gemeldet' : 'genehmigt'}</span>`;
  if (a.status === 'beantragt') return '<span class="badge warn">beantragt</span>';
  return '<span class="badge">abgelehnt</span>';
}
function fmtRange(a) {
  return a.start_date === a.end_date ? fmtDate(a.start_date) : `${fmtDate(a.start_date)} – ${fmtDate(a.end_date)}`;
}
const fmtNum = (n) => Number(n || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 });

function bindAbsenceDecisions(root) {
  $$('[data-approve]', root).forEach((b) => b.onclick = () => decideAbsence(b.dataset.approve, 'genehmigt'));
  $$('[data-reject]', root).forEach((b) => b.onclick = () => decideAbsence(b.dataset.reject, 'abgelehnt'));
}
async function decideAbsence(id, status) {
  const body = { status };
  if (status === 'abgelehnt') {
    const reason = prompt('Grund für die Ablehnung (optional, sieht der Mitarbeiter):');
    if (reason === null) return;
    body.admin_note = reason;
  }
  try {
    await api('PUT', `/api/absences/${id}`, body);
    toast(status === 'genehmigt' ? 'Antrag genehmigt' : 'Antrag abgelehnt');
    render();
  } catch (e) { toast(e.message, true); }
}

function yearPicker(year, page, extra = {}) {
  return `<div class="actions" style="align-items:center">
    <a class="btn small" href="#/${page}?${new URLSearchParams({ ...extra, year: year - 1 })}" aria-label="Vorjahr">${icon('left')}</a>
    <strong class="num" style="min-width:48px;text-align:center">${year}</strong>
    <a class="btn small" href="#/${page}?${new URLSearchParams({ ...extra, year: year + 1 })}" aria-label="Nächstes Jahr">${icon('right')}</a>
  </div>`;
}

async function pageAbsences(el, params) {
  const year = Number(params.get('year')) || new Date().getFullYear();
  const admin = isAdmin();
  const fUser = admin ? params.get('user_id') || '' : '';
  const fType = params.get('type') || '';
  if (admin) await loadUsers();
  const qs = new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31` });
  if (fUser) qs.set('user_id', fUser);
  if (fType) qs.set('type', fType);
  const [summary, list] = await Promise.all([
    api('GET', `/api/absences/summary?year=${year}`),
    api('GET', '/api/absences?' + qs)
  ]);

  if (!admin) {
    const me = summary[0] || { entitlement: 0, taken: 0, planned: 0, requested: 0, remaining: 0, sick: 0 };
    el.innerHTML = `
      <div class="page-head"><div><h1>Urlaub & Krank</h1><div class="muted">Deine Abwesenheiten ${year}</div></div>${yearPicker(year, 'abwesenheiten')}</div>
      <div class="action-row">
        <button class="btn primary big" id="req-vac">${icon('calendar')} Urlaub beantragen</button>
        <button class="btn danger big" id="req-sick">${icon('alert')} Krank melden</button>
      </div>
      <div class="grid stats">
        <div class="card stat"><div class="label">Urlaubsanspruch</div><div class="value">${me.entitlement ? fmtNum(me.entitlement) + ' Tage' : '–'}</div></div>
        <div class="card stat"><div class="label">Genommen / geplant</div><div class="value">${fmtNum(me.taken)} / ${fmtNum(me.planned)}</div></div>
        <div class="card stat"><div class="label">Resturlaub</div><div class="value ${me.remaining < 0 ? 'neg' : ''}">${me.entitlement ? fmtNum(me.remaining) + ' Tage' : '–'}</div>${me.requested ? `<div class="muted small">${fmtNum(me.requested)} Tage beantragt</div>` : ''}</div>
        <div class="card stat"><div class="label">Krankheitstage</div><div class="value">${fmtNum(me.sick)}</div></div>
      </div>
      <div class="card">
        <h2>Meine Abwesenheiten</h2>
        ${list.length ? `<ul class="entry-list">${list.map((a) => `
          <li><div>
              <div class="when">${absenceBadge(a)} ${fmtRange(a)}</div>
              <div class="muted small">${a.days} Arbeitstag${a.days === 1 ? '' : 'e'}${a.note ? ' · ' + esc(a.note) : ''}</div>
              ${a.admin_note ? `<div class="small reply">Chef: ${esc(a.admin_note)}</div>` : ''}
            </div>
            <div class="right">${absenceStatusBadge(a)}${a.status === 'beantragt' ? `<div style="margin-top:6px"><button class="btn small" data-cancel="${a.id}">Zurückziehen</button></div>` : ''}</div></li>`).join('')}</ul>`
          : '<div class="empty">Keine Abwesenheiten in diesem Jahr.</div>'}
        <p class="muted small" style="margin-bottom:0">Bei Krankheit bitte zusätzlich kurz beim Chef anrufen und die Krankmeldung (AU) abgeben.
          Gezählt werden Arbeitstage Mo–Fr ohne bundesweite Feiertage.</p>
      </div>`;
    $('#req-vac').onclick = () => absenceModal(null, { asEmployee: true, type: 'urlaub' });
    $('#req-sick').onclick = () => absenceModal(null, { asEmployee: true, type: 'krank' });
    $$('[data-cancel]', el).forEach((b) => b.onclick = async () => {
      if (!confirm('Antrag zurückziehen?')) return;
      try { await api('DELETE', `/api/absences/${b.dataset.cancel}`); toast('Antrag zurückgezogen'); render(); } catch (e) { toast(e.message, true); }
    });
    return;
  }

  const pending = list.filter((a) => a.status === 'beantragt');
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Urlaub & Krankheit</h1><div class="muted">Abwesenheiten ${year}</div></div>
      <div class="actions">${yearPicker(year, 'abwesenheiten', fUser ? { user_id: fUser } : {})}
        <button class="btn primary" id="add">${icon('plus')} Abwesenheit eintragen</button></div>
    </div>
    ${pending.length ? `<div class="card highlight">
      <h2>${icon('alert')} Offene Anträge (${pending.length})</h2>
      <ul class="entry-list">${pending.map((a) => `
        <li><div><div class="when">${esc(a.user_name)} ${absenceBadge(a)}</div>
          <div class="muted small">${fmtRange(a)} · ${a.days} Arbeitstag${a.days === 1 ? '' : 'e'}${a.note ? ' · „' + esc(a.note) + '“' : ''}</div></div>
          <div class="nowrap"><button class="btn small primary" data-approve="${a.id}">${icon('check')} Genehmigen</button>
          <button class="btn small danger" data-reject="${a.id}">${icon('x')}<span class="hide-mobile">Ablehnen</span></button></div></li>`).join('')}</ul>
    </div>` : ''}
    <div class="card">
      <h2>Urlaubskonto ${year}</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Mitarbeiter</th><th class="right">Anspruch</th><th class="right">Genommen</th><th class="right">Geplant</th><th class="right hide-mobile">Beantragt</th><th class="right">Rest</th><th class="right">Krank</th></tr></thead>
        <tbody>${summary.map((u) => `
          <tr><td><a href="#/abwesenheiten?${new URLSearchParams({ year, user_id: u.user_id })}"><strong>${esc(u.name)}</strong></a></td>
            <td class="right num">${u.entitlement ? fmtNum(u.entitlement) : '<span class="muted" title="Unter Mitarbeiter eintragen">–</span>'}</td>
            <td class="right num">${fmtNum(u.taken)}</td><td class="right num">${fmtNum(u.planned)}</td>
            <td class="right num hide-mobile">${u.requested ? `<span class="badge warn">${fmtNum(u.requested)}</span>` : '–'}</td>
            <td class="right num">${u.entitlement ? `<strong class="${u.remaining < 0 ? 'neg' : ''}">${fmtNum(u.remaining)}</strong>` : '–'}</td>
            <td class="right num">${u.sick ? fmtNum(u.sick) : '–'}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small" style="margin-bottom:0">Arbeitstage Mo–Fr ohne bundesweite Feiertage. Den Urlaubsanspruch trägst du beim Mitarbeiter ein.</p>
    </div>
    <div class="card">
      <form class="filters" id="filters">
        <div class="field"><label>Mitarbeiter</label><select name="user_id">${userOptions(fUser, { emptyLabel: 'Alle' })}</select></div>
        <div class="field"><label>Art</label><select name="type"><option value="">Alle</option>${Object.entries(ABSENCE_TYPES).map(([k, v]) => `<option value="${k}" ${fType === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </form>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Mitarbeiter</th><th>Art</th><th>Zeitraum</th><th class="right">Tage</th><th>Status</th><th class="hide-mobile">Notiz</th><th></th></tr></thead>
        <tbody>${list.map((a) => `
          <tr class="${a.status === 'abgelehnt' ? 'inactive' : ''}"><td>${esc(a.user_name)}</td><td>${absenceBadge(a)}${SICK.includes(a.type) && a.certificate ? ' <span class="badge ok" title="Krankmeldung liegt vor">AU</span>' : ''}</td>
            <td class="nowrap">${fmtRange(a)}</td><td class="right num">${a.days}</td><td>${absenceStatusBadge(a)}</td>
            <td class="hide-mobile small muted">${esc(a.note)}${a.admin_note ? `<div>Chef: ${esc(a.admin_note)}</div>` : ''}</td>
            <td class="right"><button class="btn small" data-edit="${a.id}">Bearbeiten</button></td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">Keine Abwesenheiten.</div>'}
    </div>`;
  bindAbsenceDecisions(el);
  $('#add').onclick = () => absenceModal(null, { userId: fUser });
  $('#filters').onchange = () => go('abwesenheiten', { year, ...Object.fromEntries([...new FormData($('#filters'))].filter(([, v]) => v)) });
  $$('[data-edit]', el).forEach((b) => b.onclick = () => absenceModal(list.find((a) => a.id === Number(b.dataset.edit))));
}

function absenceModal(a, { asEmployee = false, type = 'urlaub', userId = '' } = {}) {
  const x = a || { type, start_date: localDate(), end_date: localDate(), status: 'genehmigt', user_id: userId };
  const title = a ? 'Abwesenheit bearbeiten' : asEmployee ? (type === 'krank' ? 'Krank melden' : 'Urlaub beantragen') : 'Abwesenheit eintragen';
  const form = openModal(title, `
    ${asEmployee ? '' : `<div class="field"><label>Mitarbeiter</label><select name="user_id" required>${userOptions(x.user_id, { emptyLabel: '– wählen –' })}</select></div>`}
    <div class="field"><label>Art</label><select name="type">${Object.entries(ABSENCE_TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="row">
      <div class="field"><label>Von</label><input type="date" name="start_date" value="${x.start_date}" required></div>
      <div class="field"><label id="end-label">Bis</label><input type="date" name="end_date" value="${x.end_date}" required></div>
    </div>
    <div class="muted small" id="wd" style="margin:-6px 0 12px"></div>
    <div class="field"><label>Notiz</label><textarea name="note" placeholder="optional">${esc(x.note || '')}</textarea></div>
    ${asEmployee ? '' : `
      <div class="row">
        <div class="field"><label>Status</label><select name="status">${['genehmigt', 'beantragt', 'abgelehnt'].map((s) => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field" id="au-field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="certificate" ${x.certificate ? 'checked' : ''}> Krankmeldung (AU) liegt vor</label></div>
      </div>
      <div class="field"><label>Notiz vom Chef <span class="muted small">(sieht der Mitarbeiter)</span></label><input name="admin_note" value="${esc(x.admin_note || '')}"></div>`}
    ${asEmployee ? '<p class="muted small" id="emp-hint" style="margin:0"></p>' : ''}
  `, {
    saveLabel: asEmployee ? (type === 'krank' ? 'Krankmeldung senden' : 'Antrag senden') : 'Speichern',
    onSave: async (d) => {
      if (!asEmployee && !d.user_id) throw new Error('Bitte Mitarbeiter wählen');
      if (d.end_date < d.start_date) throw new Error('Das Ende liegt vor dem Beginn');
      if (a) await api('PUT', `/api/absences/${a.id}`, d);
      else await api('POST', '/api/absences', d);
      toast(asEmployee ? (SICK.includes(d.type) ? 'Krankmeldung gesendet – gute Besserung!' : 'Urlaubsantrag gesendet') : 'Gespeichert');
      render();
    },
    onDelete: a && !asEmployee ? async () => { await api('DELETE', `/api/absences/${a.id}`); toast('Gelöscht'); render(); } : null
  });
  const update = async () => {
    const sick = SICK.includes(form.type.value);
    $('#end-label').textContent = sick && asEmployee ? 'Voraussichtlich bis' : 'Bis';
    const au = $('#au-field');
    if (au) au.style.visibility = sick ? 'visible' : 'hidden';
    const hint = $('#emp-hint');
    if (hint) hint.textContent = sick ? 'Die Krankmeldung geht sofort an den Chef. Bitte die AU-Bescheinigung nachreichen.' : 'Der Chef bekommt deinen Antrag und genehmigt ihn.';
    if (form.end_date.value < form.start_date.value) form.end_date.value = form.start_date.value;
    try {
      const r = await api('GET', `/api/workdays?from=${form.start_date.value}&to=${form.end_date.value}`);
      $('#wd').textContent = `= ${r.days} Arbeitstag${r.days === 1 ? '' : 'e'} (Mo–Fr, ohne Feiertage)`;
    } catch { $('#wd').textContent = ''; }
  };
  ['type', 'start_date', 'end_date'].forEach((n) => form[n].addEventListener('change', update));
  update();
}

// ======================================================================
// Meldungen (Mängel, Material, Schäden)
// ======================================================================
const ISSUE_CATEGORIES = {
  defekt: 'Defekt / Reparatur', material: 'Material fehlt', schaden: 'Schaden',
  verschmutzung: 'Starke Verschmutzung', schluessel: 'Schlüssel / Zugang', sonstiges: 'Sonstiges'
};
const ISSUE_STATUS = { offen: 'Offen', in_bearbeitung: 'In Bearbeitung', erledigt: 'Erledigt' };
const ISSUE_EXAMPLES = {
  defekt: 'z. B. Lampe im 2. OG defekt, Tür schließt nicht', material: 'z. B. Putzmittel leer, Müllbeutel fehlen',
  schaden: 'z. B. Fliese gesprungen, Wasserschaden im Keller', verschmutzung: 'z. B. Graffiti, Sperrmüll im Hausflur',
  schluessel: 'z. B. Schlüssel verloren, Code funktioniert nicht', sonstiges: 'Was ist los?'
};

function issueCategoryBadge(i) {
  const cls = { material: 'brand', schaden: 'danger', schluessel: 'danger', defekt: 'warn' }[i.category] || '';
  return `<span class="badge ${cls}">${ISSUE_CATEGORIES[i.category] || esc(i.category)}</span>`;
}
function issueStatusBadge(i) {
  const cls = { offen: 'warn', in_bearbeitung: 'brand', erledigt: 'ok' }[i.status] || '';
  return `<span class="badge ${cls}">${ISSUE_STATUS[i.status] || esc(i.status)}</span>`;
}

function issueCard(i, { admin }) {
  return `<div class="issue-card ${i.status}">
    <div class="issue-head">
      <div>${issueCategoryBadge(i)} <strong>${esc(i.site_name || 'ohne Objekt')}</strong></div>
      ${i.pending ? `<span class="badge warn">${icon('wifi_off')}wartet auf Internet</span>` : issueStatusBadge(i)}
    </div>
    ${i.description ? `<div class="issue-text">${esc(i.description)}</div>` : ''}
    ${i.photos && i.photos.length ? (i.pending
      ? `<div class="photo-grid small">${i.photos.map((src) => `<div class="photo-thumb"><img src="${src}" alt=""></div>`).join('')}</div>`
      : `<div class="photo-grid small" data-issue-photos="${i.id}">${photoGrid(i.photos, { showWho: false }).replace(/^<div class="photo-grid">|<\/div>$/g, '')}</div>`) : ''}
    <div class="muted small issue-meta">${admin ? esc(i.user_name) + ' · ' : ''}${fmtDate(i.created_at)}, ${fmtTime(i.created_at)} Uhr
      ${i.lat !== null && i.lat !== undefined ? ` · <a href="${mapsUrl(i.lat, i.lng)}" target="_blank" rel="noopener">Ort</a>` : ''}
      ${i.offline ? ' · offline erfasst' : ''}</div>
    ${i.admin_note ? `<div class="reply small"><strong>Chef:</strong> ${esc(i.admin_note)}</div>` : ''}
    ${admin && !i.pending ? `<div class="issue-actions">
      ${i.status !== 'in_bearbeitung' && i.status !== 'erledigt' ? `<button class="btn small" data-issue-status="${i.id}:in_bearbeitung">In Bearbeitung</button>` : ''}
      ${i.status !== 'erledigt' ? `<button class="btn small primary" data-issue-status="${i.id}:erledigt">${icon('check')} Erledigt</button>` : `<button class="btn small" data-issue-status="${i.id}:offen">Wieder öffnen</button>`}
      <button class="btn small" data-issue-edit="${i.id}">Notiz / Bearbeiten</button>
    </div>` : ''}
  </div>`;
}

async function pageIssues(el, params) {
  const admin = isAdmin();
  const status = params.get('status') || (admin ? 'aktiv' : '');
  const siteId = params.get('site_id') || '';
  await loadSites();
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (siteId) qs.set('site_id', siteId);
  // Ohne Netz: Seite trotzdem anzeigen, damit man neue Meldungen erfassen kann
  let issues = [], offline = false;
  try {
    issues = await api('GET', '/api/issues?' + qs);
    if (!admin) try { localStorage.setItem('issuesCache:' + state.user.id, JSON.stringify(issues.map((i) => ({ ...i, photos: [] })))); } catch { /* egal */ }
  } catch (e) {
    if (!e.network) throw e;
    offline = true;
    if (!admin) try { issues = JSON.parse(localStorage.getItem('issuesCache:' + state.user.id) || '[]'); } catch { issues = []; }
  }

  // Offline gespeicherte Meldungen anzeigen
  const pending = (await Offline.pending(state.user.id)).filter((it) => it.url === '/api/issues').map((it) => {
    const site = state.sites.find((x) => String(x.id) === String(it.body.site_id));
    return { id: 'p-' + it.id, pending: true, category: it.body.category, description: it.body.description, site_name: site ? site.name : '',
      created_at: it.body.at, photos: it.body.images || [], user_name: state.user.name, status: 'offen' };
  });
  const all = [...pending, ...issues];

  const tabs = admin
    ? [['aktiv', 'Offen & in Bearbeitung'], ['offen', 'Offen'], ['in_bearbeitung', 'In Bearbeitung'], ['erledigt', 'Erledigt'], ['', 'Alle']]
    : [];
  el.innerHTML = `
    <div class="page-head">
      <div><h1>${admin ? 'Meldungen' : 'Meldung machen'}</h1><div class="muted">${admin ? 'Mängel, fehlendes Material, Schäden' : 'Etwas kaputt, Material leer oder ein Schaden? Hier melden.'}</div></div>
      <div class="actions"><button class="btn primary ${admin ? '' : 'big'}" id="new-issue">${icon('plus')} Neue Meldung</button></div>
    </div>
    ${offline ? `<div class="alert warn">${icon('wifi_off')} Kein Internet – neue Meldungen werden gespeichert und automatisch gesendet.${admin ? '' : ' Unten siehst du den letzten bekannten Stand.'}</div>` : ''}
    ${admin ? `<div class="card" style="padding:12px 18px">
      <div class="chips">${tabs.map(([k, v]) => `<a class="chip ${status === k ? 'active' : ''}" href="#/meldungen?${new URLSearchParams({ ...(k ? { status: k } : { status: 'alle' }), ...(siteId ? { site_id: siteId } : {}) })}">${v}</a>`).join('')}</div>
      <div class="field" style="margin:10px 0 0;max-width:340px"><select id="site-filter">${siteOptions(siteId, { includeInactive: true, emptyLabel: 'Alle Objekte' })}</select></div>
    </div>` : ''}
    ${all.length ? `<div class="issue-list">${all.map((i) => issueCard(i, { admin })).join('')}</div>`
      : `<div class="card empty">${admin ? 'Keine Meldungen.' : 'Du hast noch nichts gemeldet.'}</div>`}`;

  $('#new-issue').onclick = () => issueNewModal();
  const sf = $('#site-filter');
  if (sf) sf.onchange = () => go('meldungen', { status: status || 'alle', ...(sf.value ? { site_id: sf.value } : {}) });
  // Fotos öffnen
  issues.forEach((i) => { const box = $(`[data-issue-photos="${i.id}"]`, el); if (box) bindPhotoGrid(box, i.photos.map((p) => ({ ...p, user_name: i.user_name, site_name: i.site_name }))); });
  $$('[data-issue-status]', el).forEach((b) => b.onclick = async () => {
    const [id, st] = b.dataset.issueStatus.split(':');
    try { await api('PUT', `/api/issues/${id}`, { status: st }); toast(`Status: ${ISSUE_STATUS[st]}`); render(); } catch (e) { toast(e.message, true); }
  });
  $$('[data-issue-edit]', el).forEach((b) => b.onclick = () => issueAdminModal(issues.find((i) => i.id === Number(b.dataset.issueEdit))));
}

function issueNewModal() {
  const images = [];
  const lastSite = localStorage.getItem('lastSite') || '';
  const form = openModal('Neue Meldung', `
    <div class="field"><label>Objekt</label><select name="site_id">${siteOptions(lastSite, { emptyLabel: '– Objekt wählen –' })}</select></div>
    <div class="field"><label>Was ist los?</label>
      <div class="chips" id="cat-chips">${Object.entries(ISSUE_CATEGORIES).map(([k, v], i) => `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-cat="${k}">${v}</button>`).join('')}</div>
      <input type="hidden" name="category" value="defekt">
    </div>
    <div class="field"><label>Beschreibung</label><textarea name="description" id="issue-desc" placeholder="${ISSUE_EXAMPLES.defekt}"></textarea></div>
    <div class="field"><label>Fotos <span class="muted small">(optional, max. 6)</span></label>
      <input type="file" id="iss-cam" accept="image/*" capture="environment" hidden>
      <input type="file" id="iss-gal" accept="image/*" multiple hidden>
      <div class="photo-actions">
        <button type="button" class="btn" id="iss-cam-btn">${icon('camera')} Foto machen</button>
        <button type="button" class="btn" id="iss-gal-btn">${icon('image')} Galerie</button>
      </div>
      <div class="photo-grid small" id="iss-previews" style="margin-top:10px"></div>
    </div>
  `, {
    saveLabel: 'Meldung senden',
    onSave: async (d) => {
      if (!d.description.trim() && !images.length) throw new Error('Bitte kurz beschreiben, was los ist, oder ein Foto anhängen');
      const loc = await getLocation(6000);
      const r = await Offline.send('/api/issues', {
        site_id: d.site_id || null, category: d.category, description: d.description, images, location: loc.error ? null : loc
      }, { label: 'Meldung „' + (ISSUE_CATEGORIES[d.category] || '') + '“', userId: state.user.id });
      toast(r.queued ? 'Ohne Internet gespeichert – Meldung wird automatisch gesendet' : 'Meldung gesendet – danke!');
      if (parseHash().page === 'meldungen') render(); else go('meldungen');
    }
  });
  $$('#cat-chips .chip').forEach((ch) => ch.onclick = () => {
    $$('#cat-chips .chip').forEach((x) => x.classList.remove('active'));
    ch.classList.add('active');
    form.category.value = ch.dataset.cat;
    $('#issue-desc').placeholder = ISSUE_EXAMPLES[ch.dataset.cat];
  });
  const previews = () => {
    $('#iss-previews').innerHTML = images.map((src, i) => `<div class="photo-thumb"><img src="${src}" alt=""><button type="button" class="thumb-remove" data-rm="${i}" aria-label="Entfernen">✕</button></div>`).join('');
    $$('[data-rm]').forEach((b) => b.onclick = () => { images.splice(Number(b.dataset.rm), 1); previews(); });
  };
  const add = async (input) => {
    for (const f of [...input.files]) {
      if (images.length >= 6) { toast('Maximal 6 Fotos', true); break; }
      try { images.push(await compressImage(f)); } catch (e) { toast(e.message, true); }
    }
    input.value = '';
    previews();
  };
  $('#iss-cam-btn').onclick = () => $('#iss-cam').click();
  $('#iss-gal-btn').onclick = () => $('#iss-gal').click();
  $('#iss-cam').onchange = (e) => add(e.target);
  $('#iss-gal').onchange = (e) => add(e.target);
  form.site_id.onchange = () => form.site_id.value && localStorage.setItem('lastSite', form.site_id.value);
}

function issueAdminModal(i) {
  if (!i) return;
  openModal('Meldung bearbeiten', `
    <p style="margin-top:0">${issueCategoryBadge(i)} <strong>${esc(i.site_name || 'ohne Objekt')}</strong><br>
      <span class="muted small">${esc(i.user_name)} · ${fmtDate(i.created_at)}, ${fmtTime(i.created_at)} Uhr</span></p>
    ${i.description ? `<div class="issue-text" style="margin-bottom:12px">${esc(i.description)}</div>` : ''}
    <div class="field"><label>Status</label><select name="status">${Object.entries(ISSUE_STATUS).map(([k, v]) => `<option value="${k}" ${i.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>Notiz <span class="muted small">(sieht der Mitarbeiter, z. B. „Hausverwaltung informiert“)</span></label><textarea name="admin_note">${esc(i.admin_note)}</textarea></div>
  `, {
    onSave: async (d) => { await api('PUT', `/api/issues/${i.id}`, d); toast('Gespeichert'); render(); },
    onDelete: async () => { await api('DELETE', `/api/issues/${i.id}`); toast('Meldung gelöscht'); render(); }
  });
}

// ======================================================================
// Schlüsselverwaltung
// ======================================================================
const KEY_STATUS = { buero: 'Im Büro', ausgegeben: 'Ausgegeben', verloren: 'Verloren' };
const KEY_ACTIONS = { angelegt: 'Angelegt', ausgabe: 'Ausgegeben an', rueckgabe: 'Zurückgegeben von', verloren: 'Als verloren gemeldet', gefunden: 'Wiedergefunden' };

function keyStatusCell(k) {
  if (k.status === 'ausgegeben') return `<span class="badge brand">${icon('user')}${esc(k.holder_name || '?')}</span><div class="muted small">seit ${fmtDate(k.since, false)}</div>`;
  if (k.status === 'verloren') return `<span class="badge danger">Verloren</span><div class="muted small">${k.holder_name ? 'bei ' + esc(k.holder_name) + ', ' : ''}${fmtDate(k.since, false)}</div>`;
  return '<span class="badge ok">Im Büro</span>';
}

async function pageKeys(el, params) {
  const fSite = params.get('site_id') || '', fStatus = params.get('status') || '', fUser = params.get('user_id') || '';
  const [keys] = await Promise.all([api('GET', '/api/keys'), loadUsers(), loadSites()]);
  const list = keys.filter((k) => (!fSite || String(k.site_id) === fSite) && (!fStatus || k.status === fStatus) && (!fUser || String(k.holder_id) === fUser && k.status === 'ausgegeben'));
  const active = keys.filter((k) => k.active);
  const count = (st) => active.filter((k) => k.status === st).length;
  el.innerHTML = `
    <div class="page-head">
      <div><h1>Schlüssel</h1><div class="muted">Wer hat welchen Schlüssel?</div></div>
      <div class="actions"><button class="btn primary" id="add">${icon('plus')} Schlüssel anlegen</button></div>
    </div>
    <div class="grid stats">
      <div class="card stat"><div class="label">Schlüssel gesamt</div><div class="value">${active.length}</div></div>
      <div class="card stat"><div class="label">Im Büro</div><div class="value">${count('buero')}</div></div>
      <div class="card stat"><div class="label">Ausgegeben</div><div class="value">${count('ausgegeben')}</div></div>
      <div class="card stat"><div class="label">Verloren</div><div class="value ${count('verloren') ? 'neg' : ''}">${count('verloren')}</div></div>
    </div>
    <div class="card">
      <form class="filters" id="filters">
        <div class="field"><label>Objekt</label><select name="site_id">${siteOptions(fSite, { includeInactive: true, emptyLabel: 'Alle' })}</select></div>
        <div class="field"><label>Status</label><select name="status"><option value="">Alle</option>${Object.entries(KEY_STATUS).map(([k, v]) => `<option value="${k}" ${fStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label>Bei Mitarbeiter</label><select name="user_id">${userOptions(fUser, { emptyLabel: 'Alle' })}</select></div>
      </form>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Schlüssel</th><th>Objekt</th><th>Wo ist er?</th><th></th></tr></thead>
        <tbody>${list.map((k) => `
          <tr class="${k.active ? '' : 'inactive'}">
            <td><strong>${esc(k.label)}</strong>${k.number ? `<div class="muted small">Nr. ${esc(k.number)}</div>` : ''}${k.notes ? `<div class="muted small">${esc(k.notes)}</div>` : ''}</td>
            <td>${esc(k.site_name || '–')}</td>
            <td>${keyStatusCell(k)}</td>
            <td class="right key-actions">
              ${k.status === 'ausgegeben' ? `<button class="btn small" data-return="${k.id}">Zurück ins Büro</button> <button class="btn small" data-handout="${k.id}">Weitergeben</button>`
                : k.status === 'verloren' ? `<button class="btn small" data-return="${k.id}">Wiedergefunden</button>`
                : `<button class="btn small primary" data-handout="${k.id}">Ausgeben</button>`}
              <button class="btn small" data-history="${k.id}" title="Verlauf">${icon('history')}</button>
              <button class="btn small" data-edit="${k.id}">Bearbeiten</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty">${keys.length ? 'Keine Schlüssel für diesen Filter.' : 'Noch keine Schlüssel angelegt. Lege z. B. „Haupteingang“ für jedes Objekt an.'}</div>`}
    </div>`;
  const byId = (id) => keys.find((k) => k.id === Number(id));
  $('#add').onclick = () => keyModal(null, fSite);
  $('#filters').onchange = () => go('schluessel', Object.fromEntries([...new FormData($('#filters'))].filter(([, v]) => v)));
  $$('[data-edit]', el).forEach((b) => b.onclick = () => keyModal(byId(b.dataset.edit)));
  $$('[data-handout]', el).forEach((b) => b.onclick = () => handoutModal(byId(b.dataset.handout)));
  $$('[data-history]', el).forEach((b) => b.onclick = () => keyHistoryModal(byId(b.dataset.history)));
  $$('[data-return]', el).forEach((b) => b.onclick = async () => {
    const k = byId(b.dataset.return);
    const q = k.status === 'verloren' ? `„${k.label}“ wiedergefunden und zurück im Büro?` : `„${k.label}“ von ${k.holder_name} zurückgenommen?`;
    if (!confirm(q)) return;
    try { await api('POST', `/api/keys/${k.id}/return`, {}); toast('Schlüssel ist im Büro'); render(); } catch (e) { toast(e.message, true); }
  });
}

function keyModal(k, presetSite = '') {
  const x = k || { active: 1, site_id: presetSite };
  openModal(k ? 'Schlüssel bearbeiten' : 'Neuer Schlüssel', `
    <div class="field"><label>Objekt</label><select name="site_id">${siteOptions(x.site_id, { includeInactive: true })}</select></div>
    <div class="row">
      <div class="field"><label>Bezeichnung</label><input name="label" value="${esc(x.label || '')}" placeholder="z. B. Haupteingang" required></div>
      <div class="field"><label>Schlüssel-Nr.</label><input name="number" value="${esc(x.number || '')}" placeholder="z. B. 4711 / B-3"></div>
    </div>
    <div class="field"><label>Notizen</label><textarea name="notes" placeholder="z. B. passt auch für Keller, Chip für Tiefgarage">${esc(x.notes || '')}</textarea></div>
    <label class="check"><input type="checkbox" name="active" ${x.active ? 'checked' : ''}> Aktiv</label>
  `, {
    onSave: async (d) => {
      if (k) await api('PUT', `/api/keys/${k.id}`, d); else await api('POST', '/api/keys', d);
      toast('Gespeichert'); render();
    },
    onDelete: k ? async () => { await api('DELETE', `/api/keys/${k.id}`); toast('Gelöscht'); render(); } : null
  });
}

function handoutModal(k) {
  openModal(`„${k.label}“ ausgeben`, `
    ${k.status === 'ausgegeben' ? `<div class="alert warn">Hat aktuell: <strong>${esc(k.holder_name)}</strong> – wird direkt weitergegeben.</div>` : ''}
    <div class="field"><label>An Mitarbeiter</label><select name="user_id" required>${userOptions('', { emptyLabel: '– wählen –' })}</select></div>
    <div class="field"><label>Notiz</label><input name="note" placeholder="optional, z. B. für Urlaubsvertretung"></div>
  `, {
    saveLabel: 'Ausgeben',
    onSave: async (d) => {
      if (!d.user_id) throw new Error('Bitte Mitarbeiter wählen');
      await api('POST', `/api/keys/${k.id}/handout`, d);
      toast('Schlüssel ausgegeben'); render();
    }
  });
}

async function keyHistoryModal(k) {
  const events = await api('GET', `/api/keys/${k.id}/events`).catch((e) => { toast(e.message, true); return null; });
  if (!events) return;
  openModal(`Verlauf: ${k.label}`, `
    <p class="muted small" style="margin-top:0">${esc(k.site_name || 'ohne Objekt')}${k.number ? ' · Nr. ' + esc(k.number) : ''}</p>
    <ul class="entry-list">${events.map((e) => `
      <li><div><div class="when">${KEY_ACTIONS[e.action] || e.action}${e.holder_name && ['ausgabe', 'rueckgabe'].includes(e.action) ? ' ' + esc(e.holder_name) : ''}${e.action === 'verloren' && e.holder_name ? ' (bei ' + esc(e.holder_name) + ')' : ''}</div>
        <div class="muted small">${fmtDate(e.at)}, ${fmtTime(e.at)} Uhr${e.by_name ? ' · durch ' + esc(e.by_name) : ''}${e.note ? ' · ' + esc(e.note) : ''}</div></div></li>`).join('')}</ul>
    <div class="modal-foot" style="padding:12px 0 0">
      ${k.status !== 'verloren' ? '<button class="btn danger" id="key-lost">Als verloren melden</button>' : ''}
      <span class="spacer"></span><button class="btn" data-close>Schließen</button>
    </div>
  `, { footer: false });
  $$('#modal-root [data-close]').forEach((b) => b.onclick = (e) => { e.preventDefault(); closeModal(); });
  const lost = $('#key-lost');
  if (lost) lost.onclick = async (e) => {
    e.preventDefault();
    const note = prompt(`„${k.label}“ als verloren melden.\nNotiz (optional, z. B. wo/wann):`);
    if (note === null) return;
    try { await api('POST', `/api/keys/${k.id}/lost`, { note }); toast('Als verloren gemeldet'); render(); } catch (err) { toast(err.message, true); }
  };
}
