'use strict';
/* ================= CONFIG ================= */
const KEY = 'shiftly.v1';
const DAY = 864e5;
const DEFAULTS = {
  refDate: '2026-11-01', rate: 100, currency: 'INR', theme: 'light',
  shifts: {
    inter:   { name: 'Inter Shift',   start: '16:00', end: '00:00', color: '#c026d3' },
    morning: { name: 'Morning Shift', start: '08:00', end: '16:00', color: '#f97316' },
    night:   { name: 'Night Shift',   start: '00:00', end: '08:00', color: '#2563eb' },
    rest:    { name: 'Rest Day',                                      color: '#16a34a' }
  }
};
// 21-day cycle: Day 0 rest · 1–7 inter · 8 rest · 9–12 morning · 13 rest · 14–20 night
const CYCLE = ['rest', ...Array(7).fill('inter'), 'rest', ...Array(4).fill('morning'), 'rest', ...Array(7).fill('night')];
const ICON = { inter: 'sunset', morning: 'sunrise', night: 'moon', rest: 'coffee' };
const WORK = ['inter', 'morning', 'night'];

/* ================= STORE ================= */
const merge = (a, b) => { for (const k in b) (b[k] && typeof b[k] === 'object' && a[k]) ? merge(a[k], b[k]) : a[k] = b[k]; return a; };
const clone = o => JSON.parse(JSON.stringify(o));
let S = (() => { try { return merge(clone(DEFAULTS), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return clone(DEFAULTS); } })();
// migrate browsers that saved the old Inter purple (too close to Night blue)
if (S.shifts.inter.color === '#7c3aed') S.shifts.inter.color = DEFAULTS.shifts.inter.color;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage blocked */ } };

/* ================= SCHEDULE LOGIC (no DOM) ================= */
// Day numbers = whole calendar days since 1970-01-01, built from Y/M/D via Date.UTC,
// so DST or device time zone can never shift a date.
const toDN = (y, m, d) => Math.round(Date.UTC(y, m, d) / DAY);
const parts = dn => { const t = new Date(dn * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), w: t.getUTCDay() }; };
const isoToDN = s => { const [y, m, d] = s.split('-').map(Number); return toDN(y, m - 1, d); };
const dayIndex = dn => (((dn - isoToDN(S.refDate)) % CYCLE.length) + CYCLE.length) % CYCLE.length; // always 0–20
const typeOf = dn => CYCLE[dayIndex(dn)];
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
// [startMin, endMin] – end > 1440 means the shift runs past midnight
const span = k => { const s = S.shifts[k]; const a = toMin(s.start); let b = toMin(s.end); if (b <= a) b += 1440; return [a, b]; };
const hoursOf = k => k === 'rest' ? 0 : (([a, b]) => (b - a) / 60)(span(k));
// "Now" in Indian Standard Time, independent of the device time zone
function nowIST() {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(new Date()).forEach(x => { if (x.type !== 'literal') p[x.type] = +x.value; });
  return { dn: toDN(p.year, p.month - 1, p.day), min: p.hour * 60 + p.minute + p.second / 60, y: p.year, m: p.month - 1 };
}
// Next working shift. Today's shift counts only if it has not started yet.
function nextShift(n) {
  for (let i = 0; i < 40; i++) {
    const dn = n.dn + i, t = typeOf(dn);
    if (t !== 'rest' && !(i === 0 && n.min >= span(t)[0])) return { dn, t, i };
  }
}
// Real-calendar totals for one month (uses actual dates, not the 21-day cycle)
function monthTotals(y, m) {
  const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), s = toDN(y, m, 1);
  const r = { n, cnt: { inter: 0, morning: 0, night: 0, rest: 0 }, hours: 0, amt: 0, days: [] };
  for (let i = 0; i < n; i++) { const t = typeOf(s + i), h = hoursOf(t); r.cnt[t]++; r.hours += h; r.amt += h * S.rate; r.days.push({ dn: s + i, t, h }); }
  r.work = n - r.cnt.rest;
  return r;
}

/* ================= FORMAT HELPERS ================= */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ic = (n, c = '') => `<i data-lucide="${n}" class="${c}"></i>`;
const money = v => new Intl.NumberFormat(S.currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency: S.currency, maximumFractionDigits: 2 }).format(v);
const dfmt = (dn, o) => new Date(dn * DAY).toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
const longDate = dn => dfmt(dn, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const t12 = t => { let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
const range = k => k === 'rest' ? 'No working hours' : `${t12(S.shifts[k].start)} – ${t12(S.shifts[k].end)}`;
const hh = h => Number.isInteger(h) ? h : h.toFixed(1);
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }));
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
const refreshIcons = () => window.lucide && lucide.createIcons();
const clr = k => `style="--c:${S.shifts[k].color}"`;

/* ================= DASHBOARD ================= */
function renderHero() {
  const n = nowIST(), t = typeOf(n.dn), sh = S.shifts[t], nx = nextShift(n);
  let state, big, bigLabel, pct = 0;
  const fmt = m => { m = Math.max(0, Math.floor(m * 60)); return `${Math.floor(m / 3600)}h ${String(Math.floor(m % 3600 / 60)).padStart(2, '0')}m ${String(m % 60).padStart(2, '0')}s`; };
  if (t === 'rest') {
    state = 'REST DAY'; big = fmt((nx.dn - n.dn) * 1440 + span(nx.t)[0] - n.min); bigLabel = 'until your next shift starts';
  } else {
    const [a, b] = span(t);
    if (n.min < a) { state = 'WORKING DAY · STARTS LATER'; big = fmt(a - n.min); bigLabel = 'until your shift starts'; }
    else if (n.min < b) { state = 'WORKING DAY · ON SHIFT'; big = fmt(b - n.min); bigLabel = 'left in your shift'; pct = (n.min - a) / (b - a) * 100; }
    else { state = 'WORKING DAY · SHIFT COMPLETE'; big = '✓ Done'; bigLabel = 'Nice work today'; pct = 100; }
  }
  const nxS = S.shifts[nx.t];
  $('#hero').innerHTML = `
  <div ${clr(t)}>
    <span class="tag">${ic(ICON[t])}${state}</span>
    <p class="date">Today · ${longDate(n.dn)}</p>
    <h1>${sh.name}</h1>
    <p class="sub">${t === 'rest' ? 'Enjoy your day off!' : range(t) + ' IST'}</p>
    <div class="count">${big}</div><p class="sub" style="margin:0">${bigLabel}</p>
    ${t === 'rest' ? '' : `<div class="bar"><i style="width:${pct}%"></i></div><div class="pct"><span>Shift progress</span><span>${Math.round(pct)}%</span></div>`}
  </div>
  <div class="next" style="--c:${nxS.color}"><small>Next shift</small>
    <h3><span class="dot"></span>${nxS.name}</h3>
    <p>${nx.i === 0 ? 'Today' : dfmt(nx.dn, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <p class="sub" style="margin-top:2px">${range(nx.t)}</p>
    <p class="sub" style="margin-top:12px">Day ${dayIndex(n.dn)} of 21 in your cycle</p>
  </div>`;
  refreshIcons();
}
function renderCards() {
  const info = k => k === 'rest'
    ? [`${CYCLE.filter(x => x === 'rest').length} rest days per complete cycle`, 'No working hours']
    : [`<b>${CYCLE.filter(x => x === k).length}</b> working days · <b>${hh(hoursOf(k) * CYCLE.filter(x => x === k).length)}</b> working hours`, range(k)];
  $('#shiftCards').innerHTML = ['inter', 'morning', 'night', 'rest'].map(k => `
    <article class="scard" ${clr(k)}><div class="sico">${ic(ICON[k])}</div><h3>${S.shifts[k].name}</h3><p>${info(k)[1]}</p><p style="margin-top:4px">${info(k)[0]}</p></article>`).join('');
  const n = nowIST();
  $('#upcoming').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const dn = n.dn + i, t = typeOf(dn);
    return `<div class="li" data-dn="${dn}" ${clr(t)}><span class="d">${i === 0 ? 'Today' : dfmt(dn, { weekday: 'short', day: 'numeric', month: 'short' })}</span><span class="n"><span class="dot"></span>${S.shifts[t].name}</span><span class="t">${range(t)}</span></div>`;
  }).join('');
}

/* ================= CALENDAR ================= */
let cal = { y: 0, m: 0 };
function renderCal() {
  const n = nowIST(), first = toDN(cal.y, cal.m, 1), lead = parts(first).w, tot = monthTotals(cal.y, cal.m);
  $('#calTitle').textContent = `${MONTHS[cal.m]} ${cal.y}`;
  $('#calGrid').innerHTML = '<span class="cell blank"></span>'.repeat(lead) + tot.days.map(d => {
    const day = parts(d.dn).d;
    return `<button class="cell${d.dn === n.dn ? ' today' : ''}" data-dn="${d.dn}" ${clr(d.t)} aria-label="${longDate(d.dn)}, ${S.shifts[d.t].name}"><span class="num">${day}</span><span class="nm"><span class="full">${S.shifts[d.t].name}</span><span class="sh">${S.shifts[d.t].name.split(' ')[0]}</span></span><span class="hr">${d.t === 'rest' ? '' : range(d.t).replace(/ (AM|PM)/g, m => m.trim().toLowerCase())}</span></button>`;
  }).join('');
  $('#legend').innerHTML = ['inter', 'morning', 'night', 'rest'].map(k => `<span ${clr(k)}><i class="dot"></i>${S.shifts[k].name}</span>`).join('');
  $('#calStats').innerHTML = `<span><b>${tot.work}</b> working days</span><span><b>${tot.cnt.rest}</b> rest days</span>`;
  refreshIcons();
}
function openDay(dn) {
  const t = typeOf(dn), sh = S.shifts[t];
  $('#dayBody').innerHTML = `<div class="dd" ${clr(t)}><span class="tag">${ic(ICON[t])}${t === 'rest' ? 'REST DAY' : 'WORKING DAY'}</span>
    <h3>${sh.name}</h3><p style="margin:0">${longDate(dn)}</p>
    <dl><dt>Status</dt><dd>${t === 'rest' ? 'Rest day' : 'Working day'}</dd><dt>Hours</dt><dd>${range(t)}</dd>
    <dt>Working hours</dt><dd>${hh(hoursOf(t))}</dd><dt>Earnings</dt><dd>${money(hoursOf(t) * S.rate)}</dd><dt>Cycle day</dt><dd>${dayIndex(dn)} of 20</dd></dl></div>`;
  $('#dayDlg').showModal(); refreshIcons();
}

/* ================= EARNINGS ================= */
let chart;
function renderEarnings() {
  const y = +$('#eY').value, m = +$('#eM').value;
  $('#cycleTbl').innerHTML = (() => {
    let d = 0, h = 0, a = 0;
    const rows = WORK.map(k => { const dd = CYCLE.filter(x => x === k).length, hr = hoursOf(k); d += dd; h += dd * hr; a += dd * hr * S.rate;
      return `<tr ${clr(k)}><td><span class="dot"></span> ${S.shifts[k].name}</td><td>${dd}</td><td>${hh(hr)}</td><td>${hh(dd * hr)}</td><td>${money(dd * hr * S.rate)}</td></tr>`; }).join('');
    return `<thead><tr><th>Shift</th><th>Working days</th><th>Hours/day</th><th>Total hours</th><th>Total amount</th></tr></thead><tbody>${rows}
      <tr><td>Rest days</td><td>${CYCLE.length - d}</td><td>–</td><td>0</td><td>${money(0)}</td></tr></tbody>
      <tfoot><tr><td>Full 21-day cycle</td><td>${d}</td><td>${hh(h / d)}</td><td>${hh(h)}</td><td>${money(a)}</td></tr></tfoot>`;
  })();
  const mt = monthTotals(y, m), yr = Array.from({ length: 12 }, (_, i) => monthTotals(y, i));
  const yTot = yr.reduce((s, r) => s + r.amt, 0), yHrs = yr.reduce((s, r) => s + r.hours, 0);
  const st = (l, v) => `<div class="stat"><small>${l}</small><b>${v}</b></div>`;
  $('#eStats').innerHTML = st(`${MONTHS[m]} ${y} earnings`, money(mt.amt)) + st('Working hours (month)', hh(mt.hours)) +
    st('Working / rest days', `${mt.work} / ${mt.cnt.rest}`) + st(`Estimated ${y} total (${hh(yHrs)} h)`, money(yTot));
  $('#shiftWise').innerHTML = WORK.map(k => `<div class="sw" ${clr(k)}><i class="dot"></i><div><b>${S.shifts[k].name}</b><small>${mt.cnt[k]} days · ${hh(mt.cnt[k] * hoursOf(k))} h</small></div><b>${money(mt.cnt[k] * hoursOf(k) * S.rate)}</b></div>`).join('')
    + `<div class="sw"><div><b>Total</b></div><b>${money(mt.amt)}</b></div>`;
  $('#daily').innerHTML = mt.days.map(d => `<div class="li" ${clr(d.t)}><span class="d">${dfmt(d.dn, { weekday: 'short', day: 'numeric' })}</span><span class="n"><span class="dot"></span>${S.shifts[d.t].name}</span><span class="t">${hh(d.h)} h · <b>${money(d.h * S.rate)}</b></span></div>`).join('');
  drawChart(yr, y);
}
function drawChart(yr, y) {
  if (!window.Chart || $('#view-earnings').hidden) return;
  yr = yr || Array.from({ length: 12 }, (_, i) => monthTotals(+$('#eY').value, i)); y = y || +$('#eY').value;
  const css = getComputedStyle(document.documentElement), muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--hair').trim();
  if (chart) chart.destroy();
  chart = new Chart($('#chart'), {
    type: 'bar',
    data: { labels: MONTHS.map(x => x.slice(0, 3)), datasets: [{ label: `Earnings ${y}`, data: yr.map(r => r.amt), backgroundColor: yr.map((_, i) => i === +$('#eM').value ? '#ff385c' : '#ffb3c0'), borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => money(c.raw) } } },
      scales: { x: { ticks: { color: muted }, grid: { display: false } }, y: { ticks: { color: muted, callback: v => money(v) }, grid: { color: line }, beginAtZero: true } },
      onClick: (_, el) => { if (el[0]) { $('#eM').value = el[0].index; renderEarnings(); } } }
  });
}

/* ================= SETTINGS ================= */
function renderSettings() {
  $('#sRef').value = S.refDate; $('#sRate').value = S.rate; $('#sCur').value = S.currency; $('#sTheme').value = S.theme;
  $('#shiftSet').innerHTML = ['inter', 'morning', 'night', 'rest'].map(k => {
    const s = S.shifts[k], time = k === 'rest' ? '' : `<label class="field"><span>Starts (IST)</span><input type="time" data-k="${k}" data-f="start" value="${s.start}" required></label><label class="field"><span>Ends (IST)</span><input type="time" data-k="${k}" data-f="end" value="${s.end}" required></label>`;
    return `<div class="srow"><label class="field"><span>Shift name</span><input data-k="${k}" data-f="name" value="${s.name}" maxlength="24" required></label>${time}<label class="field"><span>Color</span><input type="color" data-k="${k}" data-f="color" value="${s.color}"></label></div>`;
  }).join('');
}
function saveSettings(e) {
  e.preventDefault();
  const rate = parseFloat($('#sRate').value), ref = $('#sRef').value, err = $('#setErr');
  if (!ref || isNaN(isoToDN(ref))) return err.textContent = 'Choose a valid cycle starting date.';
  if (!(rate >= 0)) return err.textContent = 'Enter an hourly rate of 0 or more.';
  for (const k of WORK) { const a = $(`[data-k=${k}][data-f=start]`).value, b = $(`[data-k=${k}][data-f=end]`).value; if (a === b) return err.textContent = `${S.shifts[k].name}: start and end times can't be the same.`; }
  err.textContent = '';
  S.refDate = ref; S.rate = rate; S.currency = $('#sCur').value; S.theme = $('#sTheme').value;
  $$('#shiftSet [data-k]').forEach(i => { const v = i.value.trim(); if (v) S.shifts[i.dataset.k][i.dataset.f] = v; });
  persist(); applyTheme(); renderAll(); toast('Settings saved');
}

/* ================= APP ================= */
const applyTheme = () => document.documentElement.dataset.theme = S.theme;
function show(v) {
  $$('.view').forEach(e => e.hidden = e.id !== 'view-' + v);
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#nav').classList.remove('open'); history.replaceState(null, '', '#' + v);
  if (v === 'earnings') drawChart(); scrollTo(0, 0);
}
function renderAll() {
  $('#rate').value = S.rate; renderCards(); renderHero(); renderCal(); renderEarnings(); renderSettings(); tickChip(); refreshIcons();
}
function tickChip() { $('#chipDate').textContent = longDate(nowIST().dn).replace(/^(\w+) /, '$1, ') + ' · IST'; }
function initFilters() {
  const n = nowIST();
  $('#eM').innerHTML = MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
  $('#eY').innerHTML = Array.from({ length: 11 }, (_, i) => n.y - 3 + i).map(y => `<option>${y}</option>`).join('');
  $('#eM').value = n.m; $('#eY').value = n.y; cal = { y: n.y, m: n.m };
}
function init() {
  applyTheme(); initFilters();
  $$('#nav button').forEach(b => b.onclick = () => show(b.dataset.view));
  $('#burger').onclick = () => $('#nav').classList.toggle('open');
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; $('#dow').innerHTML = dow.map(d => `<span>${d}</span>`).join('');
  const step = d => { cal.m += d; if (cal.m > 11) { cal.m = 0; cal.y++; } if (cal.m < 0) { cal.m = 11; cal.y--; } renderCal(); };
  $('#prevM').onclick = () => step(-1); $('#nextM').onclick = () => step(1);
  $('#todayBtn').onclick = () => { const n = nowIST(); cal = { y: n.y, m: n.m }; renderCal(); };
  document.addEventListener('click', e => { const c = e.target.closest('[data-dn]'); if (c && !c.closest('#daily')) openDay(+c.dataset.dn); });
  $('#dayClose').onclick = () => $('#dayDlg').close();
  $('#rate').oninput = e => { const v = parseFloat(e.target.value); if (v >= 0) { S.rate = v; persist(); renderEarnings(); $('#sRate').value = v; } };
  $('#eM').onchange = $('#eY').onchange = renderEarnings;
  $('#setForm').onsubmit = saveSettings;
  $('#sTheme').onchange = e => { S.theme = e.target.value; applyTheme(); drawChart(); };
  $('#resetBtn').onclick = () => $('#confirmDlg').showModal();
  $('#noReset').onclick = () => $('#confirmDlg').close();
  $('#yesReset').onclick = () => { S = clone(DEFAULTS); persist(); applyTheme(); $('#confirmDlg').close(); renderAll(); toast('Default schedule restored'); };
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  renderAll();
  const h = location.hash.slice(1); show(['dashboard', 'calendar', 'earnings', 'settings'].includes(h) ? h : 'dashboard');
  // live updates: countdown each second; rebuild date-dependent views when IST day rolls over
  let day = nowIST().dn;
  setInterval(() => { renderHero(); const n = nowIST(); if (n.dn !== day) { day = n.dn; tickChip(); renderCards(); renderCal(); } }, 1000);
}
document.addEventListener('DOMContentLoaded', init);
