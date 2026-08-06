// ─── SUPABASE CONFIG ───────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dqsrqdmbqlyvwhfrdjvk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc3JxZG1icWx5dndoZnJkanZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDY2NTMsImV4cCI6MjA5MzQ4MjY1M30.JNl6up-Nn49rT9m9XXEqvd3e0dkDhgFh1-02vmyIR7g';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ──────────────────────────────────────────────────────────────────
let D = [];
let sellId = null;
let currentTab = 'overview';
const charts = {};
let BOUTIQUES = [];
let CURRENT_BOUTIQUE = null;
let BOUTIQUE_ORDER = [];
let ALL_FILTER = null; // null = toutes, sinon array d'IDs
let draggingBoutiqueId = null;
let _dragMoved = false; // évite le click après drag

// ─── ADMIN / PROFILS ─────────────────────────────────────────────────────────
let USER_PROFILE = null;
let ALL_PROFILES  = [];
const ALL_TABS   = ['overview','monthly','items','stock','bilan','radar','urssaf'];
const TAB_LABELS = { overview:'Vue d\'ensemble', monthly:'Par mois', items:'Articles', stock:'Stock', bilan:'Bilan', radar:'Radar', urssaf:'URSSAF' };

// ─── AUTH ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showApp();
  } else {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    setTimeout(() => document.getElementById('email-input').focus(), 300);
    const msg = sessionStorage.getItem('laney_auth_msg');
    if (msg) { sessionStorage.removeItem('laney_auth_msg'); toast(msg, 'err'); }
  }
});

window.doLogin = async function () {
  const email = document.getElementById('email-input').value.trim();
  const password = document.getElementById('pwd-input').value;
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  if (!email || !password) { err.textContent = 'Remplis tous les champs'; return; }
  btn.disabled = true;
  btn.textContent = '…';
  err.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    err.textContent = 'Email ou mot de passe incorrect';
    document.getElementById('pwd-input').value = '';
    document.getElementById('pwd-input').classList.add('shake');
    setTimeout(() => document.getElementById('pwd-input').classList.remove('shake'), 500);
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  } else {
    showApp();
  }
};

window.doLogout = async function () {
  await sb.auth.signOut();
  location.reload();
};

async function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('loading-screen').style.display = 'flex';
  await loadBoutiques();
  await Promise.all([loadData(), loadGoal(), loadMarques(), loadUserProfile()]);
  hideLoading();
  buildOverview();
  setupRealtimeSync();
  dpSetValue('f-date', today());
}

async function loadData() {
  setSyncStatus('syncing');
  try {
    let query = sb.from('articles').select('*').order('created_at', { ascending: true });
    if (CURRENT_BOUTIQUE) {
      query = query.eq('boutique_id', CURRENT_BOUTIQUE.id);
    } else if (ALL_FILTER !== null && ALL_FILTER.length > 0) {
      query = query.in('boutique_id', ALL_FILTER);
    }
    const { data, error } = await query;
    if (error) throw error;
    D = data.map(normalize);
    buildGrossisteFilter();
    setSyncStatus('ok');
  } catch (e) {
    setSyncStatus('error');
    toast('Erreur de connexion', 'err');
  }
}

function normalize(row) {
  return {
    id: row.id,
    n: row.nom,
    a: parseFloat(row.prix_achat),
    r: row.prix_revente != null ? parseFloat(row.prix_revente) : null,
    da: row.date_achat,
    dr: row.date_revente || null,
    de: row.date_encaissement || null,
    cat: row.categorie || '',
    boutique_id: row.boutique_id,
    sku: row.sku || '',
    cmd: row.num_commande || '',
    grossiste: row.grossiste || '',
    qty: row.quantite || 1,
    ref: row.identifiant || '',
  };
}

function setupRealtimeSync() {
  sb.channel('articles-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, async () => {
      await loadData();
      refreshCurrentPanel();
    })
    .subscribe();
}

function hideLoading() {
  setTimeout(() => {
    const ls = document.getElementById('loading-screen');
    ls.style.opacity = '0';
    setTimeout(() => {
      ls.style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
    }, 400);
  }, 1200);
}

// ─── SYNC STATUS ────────────────────────────────────────────────────────────
function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (state === 'ok') { el.textContent = '● Synchronisé'; el.className = 'brand-sub'; }
  else if (state === 'syncing') { el.textContent = '● Synchronisation…'; el.className = 'brand-sub syncing'; }
  else { el.textContent = '● Hors ligne'; el.className = 'brand-sub error'; }
}

// ─── TABS ────────────────────────────────────────────────────────────────────
window.showTab = function (id) {
  currentTab = id;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
  if (id === 'bilan') buildBilanSelectors();
  else if (id === 'radar') { filterRadar(); }
  else if (id === 'urssaf') buildUrssaf();
  else refreshCurrentPanel();
};

function buildGrossisteFilter() {
  const sel = document.getElementById('f-grossiste-filter');
  if (!sel) return;
  const current = sel.value;
  const vals = [...new Set(D.map(d => d.grossiste).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  sel.innerHTML = `<option value="">Tous grossistes</option>` +
    vals.map(v => `<option value="${v.replace(/"/g, '&quot;')}"${v === current ? ' selected' : ''}>${v}</option>`).join('');
}

function refreshCurrentPanel() {
  buildGrossisteFilter();
  if (currentTab === 'overview') buildOverview();
  else if (currentTab === 'monthly') buildMonthly();
  else if (currentTab === 'items') renderItems(D);
  else if (currentTab === 'stock') buildStock();
  else if (currentTab === 'bilan') buildBilanSelectors();
  else if (currentTab === 'radar') filterRadar();
  else if (currentTab === 'urssaf') buildUrssaf();
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function stats() {
  const sold = D.filter(d => d.r !== null);
  const stock = D.filter(d => d.r === null);
  const totalRevente = sold.reduce((s, d) => s + d.r, 0);
  const coutVendus   = sold.reduce((s, d) => s + d.a, 0);
  const benefice     = totalRevente - coutVendus;
  const roi          = coutVendus > 0 ? (benefice / coutVendus) * 100 : 0;
  const capitalStock = stock.reduce((s, d) => s + d.a, 0);
  const totalAchat   = D.reduce((s, d) => s + d.a, 0);
  return { sold, stock, totalAchat, totalRevente, coutVendus, benefice, roi, count: D.length, capitalStock };
}

function mkKey(ds) { return ds ? ds.slice(0, 7) : null; }
function fmtM(k) {
  const ms = ["Jan", "Fév", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
  const [y, mo] = k.split('-');
  return ms[parseInt(mo) - 1] + ' ' + y.slice(2);
}
function catOf(d) {
  return d.cat || "Autres";
}
const CC = {
  "Vêtements":"#5B8FF9","Chaussures":"#5AD8A6","Jeux vidéo":"#F6BD16",
  "Consoles":"#F4664A","Électronique":"#7B61FF","Jouets":"#FF9F7F",
  "Décoration":"#36CFC9","Ustensiles":"#9FDB1D","Outils":"#E8684A",
  "Livres":"#6DC8EC","Sport":"#FF85C2","Accessoires":"#C47AFF","Autres":"#9B9890"
};
function killChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

const DL = {
  display: true,
  color: 'rgba(255,255,255,0.7)',
  font: { size: 10, family: 'DM Mono', weight: '500' },
  anchor: 'end', align: 'end', offset: 2,
  formatter: v => v > 0 ? v.toFixed(0)+'€' : '',
  clip: false,
};
const DL_LINE = {
  display: true,
  color: '#F6BD16',
  font: { size: 10, family: 'DM Mono', weight: '500' },
  anchor: 'end', align: 'top', offset: 4,
  formatter: v => v > 0 ? v.toFixed(0)+'€' : '',
  clip: false,
};
const DL_COUNT = {
  display: true,
  color: 'rgba(255,255,255,0.7)',
  font: { size: 10, family: 'DM Mono', weight: '500' },
  anchor: 'end', align: 'end', offset: 2,
  formatter: v => v > 0 ? v : '',
  clip: false,
};

function chartDefaults() {
  return {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', maxRotation: 40, autoSkip: false }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', callback: v => v + '€' }, grid: { color: 'rgba(255,255,255,0.04)' } }
    }
  };
}

function buildMonthMap() {
  const m = {};
  D.forEach(d => {
    if (d.r !== null) {
      const k = mkKey(d.dr);
      if (!m[k]) m[k] = { v: 0, b: 0, cnt: 0, a: 0 };
      m[k].v += d.r; m[k].b += (d.r - d.a); m[k].cnt++;
    }
    const ka = mkKey(d.da);
    if (!m[ka]) m[ka] = { v: 0, b: 0, cnt: 0, a: 0 };
    m[ka].a += d.a;
  });
  return m;
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function buildOverview() {
  const s = stats();
  const pct = s.count > 0 ? Math.round(s.sold.length / s.count * 100) : 0;
  document.getElementById('m-overview').innerHTML = `
    <div class="metric"><div class="metric-label">Achetés</div><div class="metric-value">${s.count}</div><div class="metric-sub">articles</div></div>
    <div class="metric"><div class="metric-label">Vendus</div><div class="metric-value">${s.sold.length}</div><div class="metric-sub">${pct}% du stock</div></div>
    <div class="metric"><div class="metric-label">En stock</div><div class="metric-value">${s.stock.length}</div><div class="metric-sub">${s.capitalStock.toFixed(0)}€ immo.</div></div>
    <div class="metric"><div class="metric-label">Coût vendus</div><div class="metric-value mv-amber">${s.coutVendus.toFixed(0)}€</div><div class="metric-sub">articles vendus</div></div>
    <div class="metric"><div class="metric-label">Recettes</div><div class="metric-value mv-blue">${s.totalRevente.toFixed(0)}€</div><div class="metric-sub">encaissé</div></div>
    <div class="metric"><div class="metric-label">Bénéfice</div><div class="metric-value mv-green">${s.benefice.toFixed(0)}€</div><div class="metric-sub">+${s.roi.toFixed(0)}% ROI</div></div>`;

  const coutTotal = s.coutVendus + s.capitalStock;
  const posGlobale = s.totalRevente - coutTotal;
  const posClass = posGlobale >= 0 ? 'mv-green' : 'mv-red';
  const posSign  = posGlobale >= 0 ? '+' : '';
  const posPct = coutTotal > 0 ? (posGlobale / coutTotal) * 100 : 0;
  document.getElementById('m-overview-global').innerHTML = `
    <div class="metric"><div class="metric-label">Coût total investi</div><div class="metric-value mv-amber">${coutTotal.toFixed(0)}€</div><div class="metric-sub">${s.coutVendus.toFixed(0)}€ vendus + ${s.capitalStock.toFixed(0)}€ stock</div></div>
    <div class="metric"><div class="metric-label">Recettes</div><div class="metric-value mv-blue">${s.totalRevente.toFixed(0)}€</div><div class="metric-sub">encaissé</div></div>
    <div class="metric"><div class="metric-label">Position globale</div><div class="metric-value ${posClass}">${posSign}${posGlobale.toFixed(0)}€</div><div class="metric-sub">recettes − coût total · ${posSign}${posPct.toFixed(0)}%</div></div>`;

  const mm = buildMonthMap();
  const keys = Object.keys(mm).sort().slice(-10);
  const lbls = keys.map(fmtM);

  killChart('c1');
  charts.c1 = new Chart(document.getElementById('c1'), {
    plugins: [ChartDataLabels],
    type: 'bar',
    data: {
      labels: lbls,
      datasets: [
        {
          label: 'Achats',
          data: keys.map(k => +(mm[k].a || 0).toFixed(2)),
          backgroundColor: '#5B8FF9', borderRadius: 4,
          datalabels: {
            display: true,
            color: 'rgba(255,255,255,0.75)',
            font: { size: 9, family: 'DM Mono', weight: '500' },
            anchor: 'end', align: 'end', offset: 2,
            formatter: (v) => v > 0 ? v.toFixed(0)+'€' : '',
          }
        },
        {
          label: 'Ventes',
          data: keys.map(k => +(mm[k].v || 0).toFixed(2)),
          backgroundColor: '#5AD8A6', borderRadius: 4,
          datalabels: {
            display: true,
            color: 'rgba(255,255,255,0.75)',
            font: { size: 9, family: 'DM Mono', weight: '500' },
            anchor: 'end', align: 'end', offset: 2,
            formatter: (v) => v > 0 ? v.toFixed(0)+'€' : '',
          }
        },
        {
          label: 'Bénéfice',
          data: keys.map(k => +(mm[k].b || 0).toFixed(2)),
          type: 'line', borderColor: '#F6BD16',
          backgroundColor: 'rgba(246,189,22,0.06)',
          fill: true, tension: 0.35, pointRadius: 3, borderWidth: 2, yAxisID: 'y',
          datalabels: { display: false }
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', maxRotation: 40, autoSkip: false }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', callback: v => v + '€' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

    const cc = {};
  s.sold.forEach(d => { const c = catOf(d); cc[c] = (cc[c] || 0) + 1; });
  const cats = Object.keys(cc);
  document.getElementById('leg2').innerHTML = cats.map(c => `<span><span class="ldot" style="background:${CC[c] || '#888'}"></span>${c} (${cc[c]})</span>`).join('');
  killChart('c2');
  charts.c2 = new Chart(document.getElementById('c2'), {
    type: 'doughnut',
    data: { labels: cats, datasets: [{ data: cats.map(c => cc[c]), backgroundColor: cats.map(c => CC[c] || '#888'), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' }
  });

  buildGoal();
  const top = s.sold.slice().sort((a, b) => (b.r - b.a) - (a.r - a.a)).slice(0, 18);
  const h = top.length * 32 + 40;
  document.getElementById('pv-wrap').innerHTML = `<div style="position:relative;height:${h}px"><canvas id="c5"></canvas></div>`;
  charts.c5 = new Chart(document.getElementById('c5'), { plugins: [ChartDataLabels],
    type: 'bar',
    data: { labels: top.map(d => d.n.length > 28 ? d.n.slice(0, 28) + '…' : d.n), datasets: [{
      data: top.map(d => +(d.r - d.a).toFixed(2)),
      backgroundColor: top.map(d => (d.r - d.a) >= 10 ? '#5AD8A6' : '#5B8FF9'),
      borderRadius: 4,
      datalabels: {
        display: true,
        color: 'rgba(255,255,255,0.8)',
        font: { size: 10, family: 'DM Mono', weight: '600' },
        anchor: 'end', align: 'end', offset: 4,
        formatter: (v) => '+' + v.toFixed(0) + '€',
        clip: false,
      }
    }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 55 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', callback: v => v + '€' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#9b9890' }, grid: { display: false } }
      }
    }
  });

  buildWeekSales();
}

// ─── VENTES DE LA SEMAINE (sidebar, reset chaque lundi 0h) ──────────────────
function getWeekBounds(ref = new Date()) {
  const dt = new Date(ref);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay(); // 0=dim ... 6=sam
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(dt);
  start.setDate(dt.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}
function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function buildWeekList(prefix, dateField, emptyLabel, unitLabel) {
  const wrap = document.getElementById(prefix + '-list');
  if (!wrap) return;
  const { start, end } = getWeekBounds();
  const startStr = ymd(start), endStr = ymd(end);
  const items = D.filter(d => d.r !== null && d[dateField] && d[dateField] >= startStr && d[dateField] < endStr)
                 .sort((a, b) => a[dateField].localeCompare(b[dateField]));

  const fmtDay = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const lastDay = new Date(end); lastDay.setDate(lastDay.getDate() - 1);
  document.getElementById(prefix + '-range').textContent = `${fmtDay(start)} – ${fmtDay(lastDay)}`;

  const totalEl = document.getElementById(prefix + '-total');
  if (items.length === 0) {
    wrap.innerHTML = `<div class="week-sales-empty">${emptyLabel}</div>`;
    totalEl.innerHTML = '';
    return;
  }

  wrap.innerHTML = items.map(d => {
    const pv = d.r - d.a;
    const btq = CURRENT_BOUTIQUE ? '' : (BOUTIQUES.find(b => b.id === d.boutique_id)?.nom || '');
    return `<div class="week-sales-item">
      <div class="week-sales-name-row">
        <span class="week-sales-name">${d.n}</span>
        ${btq ? `<span class="week-sales-btq">${btq}</span>` : ''}
      </div>
      <div class="week-sales-prices">
        <span class="week-sales-buy">${d.a.toFixed(2)}€</span>
        <span class="week-sales-arrow">→</span>
        <span class="week-sales-sell">${d.r.toFixed(2)}€</span>
        <span class="${pv >= 0 ? 'pv-pos' : 'pv-neg'}">${pv >= 0 ? '+' : ''}${pv.toFixed(2)}€</span>
      </div>
    </div>`;
  }).join('');

  const totalVente = items.reduce((s, d) => s + d.r, 0);
  const totalPv = items.reduce((s, d) => s + (d.r - d.a), 0);
  totalEl.innerHTML = `<span>${items.length} ${unitLabel}${items.length > 1 ? 's' : ''} · ${totalVente.toFixed(0)}€</span><span class="${totalPv >= 0 ? 'pv-pos' : 'pv-neg'}">${totalPv >= 0 ? '+' : ''}${totalPv.toFixed(2)}€</span>`;
}
function buildWeekSales() {
  buildWeekList('encaisser-week', 'de', 'Aucun encaissement cette semaine', 'encaissement');
  buildWeekList('sales-week', 'dr', 'Aucune vente cette semaine', 'vente');
}
setInterval(buildWeekSales, 60 * 1000);

// ─── MONTHLY ─────────────────────────────────────────────────────────────────
function buildMonthly() {
  const mm = buildMonthMap();
  const keys = Object.keys(mm).filter(k => mm[k].cnt > 0).sort();
  const lbls = keys.map(fmtM);
  const bData = keys.map(k => +(mm[k].b).toFixed(2));

  killChart('c-mois');
  charts['c-mois'] = new Chart(document.getElementById('c-mois'), {
    plugins: [ChartDataLabels],
    type: 'bar',
    data: {
      labels: lbls,
      datasets: [{
        data: bData,
        backgroundColor: bData.map(v => v >= 0 ? 'rgba(90,216,166,0.7)' : 'rgba(244,102,74,0.7)'),
        borderRadius: 4,
        datalabels: {
          display: true,
          color: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 0 ? 'rgba(90,216,166,0.95)' : 'rgba(244,102,74,0.95)',
          font: { size: 10, family: 'DM Mono', weight: '600' },
          anchor: 'end', align: 'end', offset: 2,
          formatter: (v) => v !== 0 ? v.toFixed(0)+'€' : '',
        }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', maxRotation: 40, autoSkip: false }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', callback: v => v + '€' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

    let cum = 0;
  const cumD = keys.map(k => { cum += mm[k].b; return +cum.toFixed(2); });
  killChart('c3');
  charts.c3 = new Chart(document.getElementById('c3'), {
    plugins: [ChartDataLabels],
    type: 'line',
    data: {
      labels: lbls,
      datasets: [{
        data: cumD,
        borderColor: '#5AD8A6', backgroundColor: 'rgba(90,216,166,0.06)',
        fill: true, tension: 0.35, pointRadius: 4, borderWidth: 2, pointBackgroundColor: '#5AD8A6',
        datalabels: {
          display: true,
          color: '#5AD8A6',
          font: { size: 10, family: 'DM Mono', weight: '600' },
          anchor: 'end', align: 'top', offset: 4,
          formatter: (v) => v.toFixed(0)+'€',
        }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', maxRotation: 40, autoSkip: false }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', callback: v => v + '€' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

    killChart('c4');
  charts.c4 = new Chart(document.getElementById('c4'), {
    plugins: [ChartDataLabels],
    type: 'bar',
    data: {
      labels: lbls,
      datasets: [{
        data: keys.map(k => mm[k].cnt),
        backgroundColor: '#5B8FF9', borderRadius: 4,
        datalabels: {
          display: true,
          color: 'rgba(255,255,255,0.75)',
          font: { size: 10, family: 'DM Mono', weight: '600' },
          anchor: 'end', align: 'end', offset: 2,
          formatter: (v) => v > 0 ? String(v) : '',
        }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#5c5a57', maxRotation: 40, autoSkip: false }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { stepSize: 1, font: { size: 10, family: 'DM Mono' }, color: '#5c5a57' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ─── ITEMS ───────────────────────────────────────────────────────────────────
function renderItems(items) {
  if (items.length === 0) {
    document.getElementById('items-body').innerHTML = `<tr><td colspan="8" class="empty-state">Aucun article trouvé</td></tr>`;
    return;
  }
  const copyIco = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const tr = s => s.length > 12 ? s.slice(0, 12) + '…' : s;
  document.getElementById('items-body').innerHTML = items.map(d => {
    const pv = d.r !== null ? d.r - d.a : null;
    let pvHtml = '—';
    if (pv !== null) { pvHtml = `<span class="${pv >= 0 ? 'pv-pos' : 'pv-neg'}">${pv >= 0 ? '+' : ''}${pv.toFixed(2)}€</span>`; }
    let pvPctHtml = '—';
    if (pv !== null && d.a > 0) {
      const pct = pv / d.a * 100;
      pvPctHtml = `<span class="${pct >= 0 ? 'pv-pos' : 'pv-neg'}">${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%</span>`;
    }
    const catBadge = d.cat ? `<span class="badge-cat">${d.cat}</span>` : '—';
    const refHtml = d.ref ? `<span class="td-meta-tag td-meta-blue">ID ${tr(d.ref)}<button class="td-copy-btn" data-copy="${d.ref}" onclick="copyToClip(this.dataset.copy)" title="Copier ID">${copyIco}</button></span>` : '';
    const skuHtml = d.sku ? `<span class="td-meta-tag td-meta-orange">SKU ${tr(d.sku)}<button class="td-copy-btn" data-copy="${d.sku.replace(/"/g,'&quot;')}" onclick="copyToClip(this.dataset.copy)" title="Copier SKU">${copyIco}</button></span>` : '';
    const cmdHtml = d.cmd ? `<span class="td-meta-tag td-meta-orange">Cmd ${tr(d.cmd)}<button class="td-copy-btn" data-copy="${d.cmd.replace(/"/g,'&quot;')}" onclick="copyToClip(this.dataset.copy)" title="Copier Cmd">${copyIco}</button></span>` : '';
    const metaTags = (refHtml || skuHtml || cmdHtml) ? `<div class="td-meta-row">${refHtml}${skuHtml}${cmdHtml}</div>` : '';
    const delBtn = `<button class="btn-action btn-action-del" onclick="delItem(${d.id})" title="Supprimer"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`;
    const cancelBtn = `<button class="btn-action btn-action-cancel" onclick="openCancelChoice(${d.id})"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M10 4A5 5 0 1 0 10 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 1v3H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Annuler</button>`;
    let actionsCell;
    if (d.r === null) {
      actionsCell = `<button class="btn-action btn-action-sell" onclick="openSellModal(${d.id})"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Vendu</button>${delBtn}`;
    } else if (d.de === null) {
      actionsCell = `<span class="badge b-green">Vendu</span><button class="btn-action btn-action-encaisser" onclick="openEncaisserModal(${d.id})"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M1 4h10v5H1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3.5 6.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> Encaisser</button>${cancelBtn}${delBtn}`;
    } else {
      actionsCell = `<span class="badge b-green">Vendu</span><span class="badge b-blue">Encaissé</span>${cancelBtn}${delBtn}`;
    }
    const grossisteHtml = d.grossiste ? `<span class="td-grossiste">${d.grossiste}</span>` : '<span class="td-empty">—</span>';
    return `<tr>
      <td class="td-name"><span class="name-link" onclick="openEditModal(${d.id})">${d.n}</span>${metaTags}</td>
      <td>${catBadge}</td>
      <td class="td-grossiste-cell">${grossisteHtml}</td>
      <td class="td-num">${d.a.toFixed(2)}€</td>
      <td class="td-num">${d.r !== null ? d.r.toFixed(2) + '€' : '<span class="td-empty">—</span>'}</td>
      <td class="td-num">${pvHtml}</td>
      <td class="td-num">${pvPctHtml}</td>
      <td class="td-actions"><div class="td-actions-inner">${actionsCell}</div></td>
    </tr>`;
  }).join('');
}

// Cherche par mot-clé : chaque mot de la requête doit se retrouver quelque
// part (nom, SKU, N° commande, grossiste ou ID), peu importe l'ordre —
// "short levi's" retrouve "Short en jean Levi's". Les apostrophes typographiques
// (’ ‘ ´ — ex : saisies sur iPhone avec la correction automatique) sont
// normalisées en apostrophe droite pour ne pas casser la recherche
function normApostrophes(s) {
  return s.replace(/[‘’ʼ´]/g, "'");
}
function itemHaystack(d) {
  return normApostrophes([d.n, d.sku, d.cmd, d.grossiste, d.ref].filter(Boolean).join(' ').toLowerCase());
}
function matchesSearch(d, query) {
  const keywords = normApostrophes(query.toLowerCase()).trim().split(/\s+/).filter(Boolean);
  if (keywords.length === 0) return true;
  const hay = itemHaystack(d);
  return keywords.every(k => hay.includes(k));
}

window.filterTable = function () {
  const q = document.getElementById('srch').value;
  const statut = document.getElementById('f-statut').value;
  const cat = document.getElementById('f-categorie').value;
  const tri = document.getElementById('f-tri').value;
  const grossisteFilter = document.getElementById('f-grossiste-filter').value;

  let items = D.filter(d => {
    if (q && !matchesSearch(d, q)) return false;
    if (statut === 'stock' && d.r !== null) return false;
    if (statut === 'vendu' && d.r === null) return false;
    if (cat && d.cat !== cat) return false;
    if (grossisteFilter && d.grossiste !== grossisteFilter) return false;
    return true;
  });

  if (tri === 'pv-desc') items = items.slice().sort((a, b) => (b.r !== null ? b.r - b.a : -999) - (a.r !== null ? a.r - a.a : -999));
  else if (tri === 'pv-asc') items = items.slice().sort((a, b) => (a.r !== null ? a.r - a.a : 999) - (b.r !== null ? b.r - b.a : 999));
  else if (tri === 'achat-desc') items = items.slice().sort((a, b) => b.a - a.a);
  else if (tri === 'achat-asc') items = items.slice().sort((a, b) => a.a - b.a);
  else if (tri === 'date-desc') items = items.slice().sort((a, b) => b.da.localeCompare(a.da));
  else if (tri === 'date-asc') items = items.slice().sort((a, b) => a.da.localeCompare(b.da));
  else if (tri === 'nom-asc') items = items.slice().sort((a, b) => a.n.localeCompare(b.n));

  const countEl = document.getElementById('filter-count');
  const hasFilter = q || statut || cat || grossisteFilter || tri !== 'default';
  countEl.textContent = hasFilter ? `${items.length} article${items.length > 1 ? 's' : ''}` : '';

  renderItems(items);
};

window.scrollItemsToBottom = function () {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
};

window.scrollItemsToTop = function () {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── BARRES DE RECHERCHE : croix pour effacer ───────────────────────────────
window.toggleClearBtn = function (inputEl) {
  const btn = inputEl.parentElement.querySelector('.input-clear-btn');
  if (btn) btn.style.display = inputEl.value ? 'flex' : 'none';
};

window.clearSearchInput = function (inputId) {
  const input = document.getElementById(inputId);
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
};

window.resetFilters = function () {
  document.getElementById('srch').value = '';
  document.getElementById('f-statut').value = '';
  document.getElementById('f-categorie').value = '';
  document.getElementById('f-grossiste-filter').value = '';
  document.getElementById('f-tri').value = 'default';
  document.getElementById('filter-count').textContent = '';
  renderItems(D);
};

// ─── STOCK ───────────────────────────────────────────────────────────────────
function buildStock() {
  const s = stats();
  const tx = s.count > 0 ? Math.round(s.sold.length / s.count * 100) : 0;
  document.getElementById('m-stock').innerHTML = `
    <div class="metric"><div class="metric-label">En stock</div><div class="metric-value">${s.stock.length}</div><div class="metric-sub">articles</div></div>
    <div class="metric"><div class="metric-label">Capital immo.</div><div class="metric-value mv-amber">${s.capitalStock.toFixed(0)}€</div><div class="metric-sub">non récupéré</div></div>
    <div class="metric"><div class="metric-label">Rotation</div><div class="metric-value">${tx}%</div><div class="metric-sub">articles vendus</div></div>`;

  const top = s.stock.slice().sort((a, b) => b.a - a.a);
  const h = top.length * 26 + 20;
  document.getElementById('pv-wrap2').innerHTML = `<div style="position:relative;height:${h}px"><canvas id="c6"></canvas></div>`;
  charts.c6 = new Chart(document.getElementById('c6'), {
    plugins: [ChartDataLabels],
    type: 'bar',
    data: {
      labels: top.map(d => d.n.length > 28 ? d.n.slice(0, 28) + '…' : d.n),
      datasets: [{
        data: top.map(d => d.a),
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 3,
        datalabels: {
          display: true,
          color: 'rgba(255,255,255,0.75)',
          font: { size: 10, family: 'DM Mono', weight: '600' },
          anchor: 'end', align: 'end', offset: 6,
          formatter: (v) => v.toFixed(2) + '€',
          clip: false,
        }
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 60 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { ticks: { font: { size: 10, family: 'DM Mono' }, color: '#9b9890' }, grid: { display: false } }
      }
    }
  });

  // Stock par SKU
  const copyIcoSku = `<svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.6"/><path d="M3 8H2a1 1 0 01-1-1V2a1 1 0 011-1h5a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const skuMap = {};
  D.filter(d => d.sku && d.r === null).forEach(d => {
    if (!skuMap[d.sku]) skuMap[d.sku] = { sku: d.sku, items: [], total: 0, grossistes: new Set(), prices: new Set() };
    skuMap[d.sku].items.push(d);
    skuMap[d.sku].total += d.a;
    if (d.grossiste) skuMap[d.sku].grossistes.add(d.grossiste);
    skuMap[d.sku].prices.add(d.a);
  });
  const skuList = Object.values(skuMap).sort((a, b) => b.items.length - a.items.length);
  const skuWrap = document.getElementById('sku-stock-wrap');
  if (skuWrap) {
    if (!skuList.length) {
      skuWrap.innerHTML = '<div class="empty-state">Aucun article en stock avec un SKU</div>';
    } else {
      skuWrap.innerHTML = `<div class="sku-scroll-wrap"><table class="sku-table">
        <thead><tr><th>SKU</th><th>ID</th><th>Grossiste</th><th>Articles</th><th>Qté stock</th><th>Val. unité</th><th>Valeur totale</th></tr></thead>
        <tbody>${skuList.map(g => {
          const skuTag = `<span class="td-meta-tag td-meta-orange sku-tag">${g.sku}<button class="td-copy-btn" data-copy="${g.sku.replace(/"/g,'&quot;')}" onclick="copyToClip(this.dataset.copy)" title="Copier SKU">${copyIcoSku}</button></span>`;
          const ref = g.items.find(d => d.ref)?.ref || null;
          const idCell = ref ? `<span class="td-meta-tag td-meta-blue sku-tag">${ref}<button class="td-copy-btn" data-copy="${ref}" onclick="copyToClip(this.dataset.copy)" title="Copier ID">${copyIcoSku}</button></span>` : '<span class="sku-no-id">—</span>';
          const grossisteCell = g.grossistes.size ? [...g.grossistes].join(', ') : '—';
          const prices = [...g.prices].sort((a,b) => a - b);
          const unitCell = prices.length === 1 ? `${prices[0].toFixed(2)}€` : `${prices[0].toFixed(2)}–${prices[prices.length-1].toFixed(2)}€`;
          return `<tr>
            <td class="sku-cell-tag">${skuTag}</td>
            <td class="sku-cell-tag">${idCell}</td>
            <td class="sku-grossiste">${grossisteCell}</td>
            <td class="sku-names">${[...new Set(g.items.map(d => d.n))].join(', ')}</td>
            <td class="sku-qty"><span class="sku-badge">${g.items.length}</span></td>
            <td class="td-num">${unitCell}</td>
            <td class="td-num">${g.total.toFixed(2)}€</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
    }
  }
}

// ─── ADD ARTICLE ─────────────────────────────────────────────────────────────
window.openAddModal = function () {
  if (!CURRENT_BOUTIQUE) return;
  document.getElementById('f-nom').value = '';
  const alertEl = document.getElementById('radar-alert'); if(alertEl) alertEl.style.display='none';
  document.getElementById('f-achat').value = '';
  dpSetValue('f-date', today());
  document.getElementById('f-cat').value = '';
  document.getElementById('f-sku').value = '';
  document.getElementById('f-cmd').value = '';
  document.getElementById('f-grossiste').value = '';
  document.getElementById('f-quantite').value = '1';
  document.getElementById('f-ref').value = '';
  onSkuChange('f-sku', 'f-ref', 'btn-gen-f');
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('f-nom').focus(), 100);
};

// Construit la map SKU → ID à partir des données existantes
function buildSkuRefMap() {
  const map = {};
  D.forEach(d => { if (d.sku && d.ref) map[d.sku] = d.ref; });
  return map;
}

// Appelé quand le champ SKU change : auto-remplit l'ID si le SKU en a déjà un
window.onSkuChange = function(skuFieldId, refFieldId, genBtnId) {
  const sku = document.getElementById(skuFieldId).value.trim();
  const refField = document.getElementById(refFieldId);
  const genBtn  = document.getElementById(genBtnId);
  const linked  = buildSkuRefMap()[sku];
  if (sku && linked) {
    refField.value    = linked;
    refField.readOnly = true;
    refField.classList.add('field-auto');
    if (genBtn) genBtn.style.display = 'none';
  } else {
    refField.readOnly = false;
    refField.classList.remove('field-auto');
    if (genBtn) genBtn.style.display = '';
  }
};

window.generateRef = function(fieldId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const existing = new Set(Object.values(buildSkuRefMap()).concat(D.map(d => d.ref).filter(Boolean)));
  let id;
  do { id = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (existing.has(id));
  document.getElementById(fieldId).value = id;
};

window.changeQty = function(delta) {
  const el = document.getElementById('f-quantite');
  el.value = Math.max(1, Math.min(99, (parseInt(el.value) || 1) + delta));
};
window.closeAddModal = function () { document.getElementById('add-modal').classList.remove('open'); };

window.addArticle = async function () {
  const nom = document.getElementById('f-nom').value.trim();
  const achat = parseFloat(document.getElementById('f-achat').value);
  const date = document.getElementById('f-date').value;
  const cat = document.getElementById('f-cat').value;
  const sku = document.getElementById('f-sku').value.trim() || null;
  const cmd = document.getElementById('f-cmd').value.trim() || null;
  const grossiste = document.getElementById('f-grossiste').value.trim() || null;
  const qty = Math.max(1, Math.min(99, parseInt(document.getElementById('f-quantite').value) || 1));
  const rawRef = document.getElementById('f-ref').value.trim().toUpperCase() || null;
  if (!nom || isNaN(achat) || achat < 0 || !date) { toast('Remplis tous les champs', 'err'); return; }
  const skuRefMap = buildSkuRefMap();
  // Si le SKU a déjà un ID lié, on force cet ID
  const ref = (sku && skuRefMap[sku]) ? skuRefMap[sku] : rawRef;
  // Vérif : l'ID saisi n'est pas déjà lié à un autre SKU
  if (ref) {
    const conflict = D.find(d => d.ref === ref && d.sku !== (sku || null));
    if (conflict) { toast(`L'ID ${ref} est déjà lié au SKU ${conflict.sku}`, 'err'); return; }
  }
  // qty > 1 : interdit de créer un nouvel ID sur plusieurs articles à la fois
  if (ref && qty > 1 && !skuRefMap[sku]) { toast("L'ID ne peut être assigné qu'à un seul article à la fois", 'err'); return; }

  const btn = document.getElementById('btn-add-confirm');
  btn.disabled = true;

  try {
    const rows = Array.from({ length: qty }, () => ({
      nom, prix_achat: achat, date_achat: date,
      categorie: cat || null,
      boutique_id: CURRENT_BOUTIQUE ? CURRENT_BOUTIQUE.id : null,
      sku, num_commande: cmd, grossiste, identifiant: ref || null,
    }));
    const { data: insertedData, error } = await sb.from('articles').insert(rows).select('*');
    if (error) throw error;
    if (insertedData) insertedData.forEach(row => D.push(normalize(row)));
    closeAddModal();
    refreshCurrentPanel();
    toast(qty > 1 ? `${qty}× "${nom}" ajoutés au stock` : `"${nom}" ajouté au stock`, 'ok');
  } catch (e) {
    toast('Erreur lors de l\'ajout', 'err');
  } finally {
    btn.disabled = false;
  }
};

// ─── SELL ARTICLE ─────────────────────────────────────────────────────────────
window.openSellModal = function (id) {
  sellId = id;
  const it = D.find(d => d.id === id);
  document.getElementById('modal-name').textContent = it.n + ' — acheté ' + it.a.toFixed(2) + '€ le ' + it.da;
  document.getElementById('m-prix').value = '';
  dpSetValue('m-date', today());
  document.getElementById('sell-modal').classList.add('open');
  setTimeout(() => document.getElementById('m-prix').focus(), 100);
};
window.closeSellModal = function () { document.getElementById('sell-modal').classList.remove('open'); sellId = null; };

window.confirmSell = async function () {
  const prix = parseFloat(document.getElementById('m-prix').value);
  const date = document.getElementById('m-date').value;
  if (isNaN(prix) || prix <= 0 || !date) { toast('Prix ou date invalide', 'err'); return; }

  const btn = document.getElementById('btn-sell-confirm');
  btn.disabled = true;

  try {
    const it = D.find(d => d.id === sellId);
    const { error } = await sb.from('articles').update({ prix_revente: prix, date_revente: date }).eq('id', sellId);
    if (error) throw error;
    const item = D.find(d => d.id === sellId);
    if (item) { item.r = prix; item.dr = date; }
    closeSellModal();
    refreshCurrentPanel();
    const pv = (prix - it.a).toFixed(2);
    toast(`"${it.n}" vendu ${prix.toFixed(2)}€ — bénéf. +${pv}€`, 'ok');
  } catch (e) {
    toast('Erreur lors de la vente', 'err');
  } finally {
    btn.disabled = false;
  }
};

// ─── ENCAISSER (réception du paiement) ─────────────────────────────────────────
let encaisserId = null;

window.openEncaisserModal = function (id) {
  encaisserId = id;
  const it = D.find(d => d.id === id);
  document.getElementById('encaisser-modal-name').textContent = it.n + ' — vendu ' + it.r.toFixed(2) + '€ le ' + it.dr;
  dpSetValue('m-date-encaissement', today());
  document.getElementById('encaisser-modal').classList.add('open');
};
window.closeEncaisserModal = function () { document.getElementById('encaisser-modal').classList.remove('open'); encaisserId = null; };

window.confirmEncaisser = async function () {
  const date = document.getElementById('m-date-encaissement').value;
  if (!date) { toast('Date invalide', 'err'); return; }

  const btn = document.getElementById('btn-encaisser-confirm');
  btn.disabled = true;

  try {
    const it = D.find(d => d.id === encaisserId);
    const { error } = await sb.from('articles').update({ date_encaissement: date }).eq('id', encaisserId);
    if (error) throw error;
    if (it) { it.de = date; }
    closeEncaisserModal();
    refreshCurrentPanel();
    toast(`"${it.n}" encaissé`, 'ok');
  } catch (e) {
    toast("Erreur lors de l'encaissement", 'err');
  } finally {
    btn.disabled = false;
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
window.delItem = async function (id) {
  const it = D.find(d => d.id === id);
  if (!it) return;
  const ok = await showConfirm('Supprimer cet article', `Supprimer définitivement <strong>${it.n}</strong> ?<br><br>Cette action est irréversible.`);
  if (!ok) return;
  try {
    const { error } = await sb.from('articles').delete().eq('id', id);
    if (error) throw error;
    D = D.filter(d => d.id !== id);
    refreshCurrentPanel();
    toast(`"${it.n}" supprimé`, 'ok');
  } catch (e) {
    toast('Erreur lors de la suppression', 'err');
  }
};

// ─── CANCEL SELL ─────────────────────────────────────────────────────────────
window.cancelSell = async function (id) {
  const it = D.find(d => d.id === id);
  if (!it) return;
  const ok = await showConfirm('Annuler la vente', `Remettre <strong>${it.n}</strong> en stock ?<br><br>Les informations de vente et d'encaissement seront effacées.`);
  if (!ok) return;
  try {
    const { error } = await sb.from("articles").update({ prix_revente: null, date_revente: null, date_encaissement: null }).eq("id", id);
    if (error) throw error;
    const item = D.find(d => d.id === id);
    if (item) { item.r = null; item.dr = null; item.de = null; }
    refreshCurrentPanel();
    toast(`Vente de "${it.n}" annulée`, "ok");
  } catch (e) {
    toast("Erreur lors de l'annulation", "err");
  }
};

// ─── CANCEL ENCAISSER ───────────────────────────────────────────────────────
window.cancelEncaisser = async function (id) {
  const it = D.find(d => d.id === id);
  if (!it) return;
  const ok = await showConfirm('Annuler l\'encaissement', `Remettre <strong>${it.n}</strong> en "vendu non encaissé" ?`, { btnClass: 'btn-confirm-blue', okLabel: 'Annuler l\'encaissement' });
  if (!ok) return;
  try {
    const { error } = await sb.from("articles").update({ date_encaissement: null }).eq("id", id);
    if (error) throw error;
    const item = D.find(d => d.id === id);
    if (item) { item.de = null; }
    refreshCurrentPanel();
    toast(`Encaissement de "${it.n}" annulé`, "ok");
  } catch (e) {
    toast("Erreur lors de l'annulation", "err");
  }
};

// ─── CHOIX ANNULATION (vente encaissée : encaissement ou vente ?) ──────────
let cancelChoiceId = null;
window.openCancelChoice = function (id) {
  const it = D.find(d => d.id === id);
  if (!it) return;
  if (it.de === null) { cancelSell(id); return; }
  cancelChoiceId = id;
  document.getElementById('cancel-choice-name').textContent = it.n;
  document.getElementById('cancel-choice-modal').classList.add('open');
};
window.closeCancelChoiceModal = function () { document.getElementById('cancel-choice-modal').classList.remove('open'); cancelChoiceId = null; };
window.cancelEncaisserFromChoice = function () {
  const id = cancelChoiceId;
  closeCancelChoiceModal();
  cancelEncaisser(id);
};
window.cancelSellFromChoice = function () {
  const id = cancelChoiceId;
  closeCancelChoiceModal();
  cancelSell(id);
};


// ─── EDIT ARTICLE ─────────────────────────────────────────────────────────────
let editId = null;

window.openEditModal = function (id) {
  editId = id;
  const it = D.find(d => d.id === id);
  document.getElementById('e-nom').value = it.n;
  document.getElementById('e-cat').value = it.cat || '';
  document.getElementById('e-achat').value = it.a;
  dpSetValue('e-date-achat', it.da);
  document.getElementById('e-vente').value = it.r !== null ? it.r : '';
  dpSetValue('e-date-vente', it.dr || '');
  dpSetValue('e-date-encaissement', it.de || '');
  document.getElementById('e-sku').value = it.sku || '';
  document.getElementById('e-cmd').value = it.cmd || '';
  document.getElementById('e-grossiste').value = it.grossiste || '';
  document.getElementById('e-ref').value = it.ref || '';
  onSkuChange('e-sku', 'e-ref', 'btn-gen-e');
  document.getElementById('edit-modal').classList.add('open');
  setTimeout(() => document.getElementById('e-nom').focus(), 100);
};

window.closeEditModal = function () {
  document.getElementById('edit-modal').classList.remove('open');
  editId = null;
};

window.confirmEdit = async function () {
  const nom = document.getElementById('e-nom').value.trim();
  const cat = document.getElementById('e-cat').value;
  const achat = parseFloat(document.getElementById('e-achat').value);
  const dateAchat = document.getElementById('e-date-achat').value;
  const venteVal = document.getElementById('e-vente').value;
  const dateVente = document.getElementById('e-date-vente').value;
  const dateEncaissement = document.getElementById('e-date-encaissement').value;
  const sku = document.getElementById('e-sku').value.trim() || null;
  const cmd = document.getElementById('e-cmd').value.trim() || null;
  const grossiste = document.getElementById('e-grossiste').value.trim() || null;
  const rawRef = document.getElementById('e-ref').value.trim().toUpperCase() || null;
  if (!nom || isNaN(achat) || !dateAchat) { toast('Nom, prix et date achat requis', 'err'); return; }
  const skuRefMap = buildSkuRefMap();
  const ref = (sku && skuRefMap[sku]) ? skuRefMap[sku] : rawRef;
  if (ref) {
    const conflict = D.find(d => d.ref === ref && d.sku !== (sku || null) && d.id !== editId);
    if (conflict) { toast(`L'ID ${ref} est déjà lié au SKU ${conflict.sku}`, 'err'); return; }
  }
  const vente = venteVal !== '' ? parseFloat(venteVal) : null;
  const dr = (vente !== null && dateVente) ? dateVente : null;
  const de = (dr !== null && dateEncaissement) ? dateEncaissement : null;
  const btn = document.getElementById('btn-edit-confirm');
  btn.disabled = true;
  try {
    const { error } = await sb.from('articles').update({
      nom,
      categorie: cat || null,
      prix_achat: achat,
      date_achat: dateAchat,
      prix_revente: vente,
      date_revente: dr,
      date_encaissement: de,
      sku,
      num_commande: cmd,
      grossiste,
      identifiant: ref || null,
    }).eq('id', editId);
    if (error) throw error;
    const item = D.find(d => d.id === editId);
    if (item) { item.n = nom; item.cat = cat || ''; item.a = achat; item.da = dateAchat; item.r = vente; item.dr = dr; item.de = de; item.sku = sku || ''; item.cmd = cmd || ''; item.grossiste = grossiste || ''; item.ref = ref || ''; }
    closeEditModal();
    refreshCurrentPanel();
    toast(`"${nom}" modifié`, 'ok');
  } catch (e) {
    toast('Erreur lors de la modification', 'err');
  } finally {
    btn.disabled = false;
  }
};

window.copyToClip = function(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copié !', 'ok'));
};

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = '', 3500);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

// Close modals on overlay click
document.getElementById('add-modal').addEventListener('click', function (e) { if (e.target === this) closeAddModal(); });
document.getElementById('sell-modal').addEventListener('click', function (e) { if (e.target === this) closeSellModal(); });
document.getElementById('encaisser-modal').addEventListener('click', function (e) { if (e.target === this) closeEncaisserModal(); });
document.getElementById('cancel-choice-modal').addEventListener('click', function (e) { if (e.target === this) closeCancelChoiceModal(); });
document.getElementById('edit-modal').addEventListener('click', function (e) { if (e.target === this) closeEditModal(); });
document.getElementById('goal-modal').addEventListener('click', function (e) { if (e.target === this) closeGoalModal(); });
document.getElementById('edit-boutique-modal').addEventListener('click', function (e) { if (e.target === this) closeEditBoutiqueModal(); });

// Close modals on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAddModal(); closeSellModal(); closeEncaisserModal(); closeCancelChoiceModal(); closeEditModal(); closeGoalModal(); closeNewBoutiqueModal(); closeEditBoutiqueModal(); closeRadarAddModal(); closeConfirm(false); document.getElementById('global-results').classList.remove('open'); }
});


// ─── OBJECTIF MENSUEL ─────────────────────────────────────────────────────────
let cachedGoal = 0;

function getMonthLabel() {
  const ms = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const now = new Date();
  return ms[now.getMonth()] + ' ' + now.getFullYear();
}

function getCurrentMonthRevenue() {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  return D.filter(d => d.r !== null && d.dr && d.dr.startsWith(key))
          .reduce((s, d) => s + d.r, 0);
}

function goalKey() {
  return CURRENT_BOUTIQUE ? `monthly_goal_${CURRENT_BOUTIQUE.id}` : 'monthly_goal_all';
}

async function loadGoal() {
  if (!CURRENT_BOUTIQUE) {
    // All : somme des objectifs de chaque boutique
    try {
      const keys = BOUTIQUES.map(b => `monthly_goal_${b.id}`);
      if (!keys.length) { cachedGoal = 0; return; }
      const { data } = await sb.from('settings').select('key,value').in('key', keys);
      cachedGoal = data ? data.reduce((s, r) => s + (parseFloat(r.value) || 0), 0) : 0;
    } catch(e) { cachedGoal = 0; }
  } else {
    try {
      const { data } = await sb.from('settings').select('value').eq('key', goalKey()).single();
      cachedGoal = data ? parseFloat(data.value) || 0 : 0;
    } catch(e) { cachedGoal = 0; }
  }
}

function buildGoal() {
  const goal = cachedGoal;
  const current = getCurrentMonthRevenue();
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const pctReal = goal > 0 ? (current / goal) * 100 : 0;

  // Bouton édition : visible uniquement sur une boutique spécifique
  const editBtn = document.querySelector('.goal-edit-btn');
  if (editBtn) editBtn.style.display = CURRENT_BOUTIQUE ? '' : 'none';

  // Sous-titre adapté au mode
  const subtitle = document.getElementById('goal-subtitle');
  if (subtitle) {
    subtitle.innerHTML = CURRENT_BOUTIQUE
      ? `Recettes de vente — <span id="goal-month-label">${getMonthLabel()}</span>`
      : `Somme des objectifs boutiques — <span id="goal-month-label">${getMonthLabel()}</span>`;
  } else {
    document.getElementById('goal-month-label').textContent = getMonthLabel();
  }
  document.getElementById('goal-current').textContent = current.toFixed(0) + '€';
  document.getElementById('goal-target-display').textContent = goal > 0 ? goal.toFixed(0) + '€' : (CURRENT_BOUTIQUE ? 'Non défini' : '—');

  const fill = document.getElementById('goal-bar-fill');
  const pctEl = document.getElementById('goal-pct');
  const hint = document.getElementById('goal-hint');

  fill.style.width = pct + '%';

  if (goal <= 0) {
    fill.style.background = 'rgba(255,255,255,0.1)';
    fill.style.boxShadow = 'none';
    pctEl.textContent = '';
    hint.textContent = '';
    return;
  }

  if (pctReal >= 100) {
    fill.style.background = 'linear-gradient(90deg, #5AD8A6, #3ecf8e)';
    fill.style.boxShadow = '0 0 12px rgba(90,216,166,0.4)';
    pctEl.textContent = '✓ Objectif atteint !';
    pctEl.style.color = 'var(--green)';
    hint.textContent = `Bravo ! ${(current - goal).toFixed(0)}€ de plus que l'objectif 🎉`;
    hint.style.color = 'var(--green-text)';
  } else if (pctReal >= 75) {
    fill.style.background = 'linear-gradient(90deg, #5B8FF9, #5AD8A6)';
    fill.style.boxShadow = 'none';
    pctEl.textContent = Math.round(pctReal) + '%';
    pctEl.style.color = 'var(--accent)';
    hint.textContent = `Plus que ${(goal - current).toFixed(0)}€ pour atteindre l'objectif 💪`;
    hint.style.color = 'var(--text2)';
  } else if (pctReal >= 40) {
    fill.style.background = 'linear-gradient(90deg, #5B8FF9, #7B61FF)';
    fill.style.boxShadow = 'none';
    pctEl.textContent = Math.round(pctReal) + '%';
    pctEl.style.color = 'var(--accent)';
    hint.textContent = `${(goal - current).toFixed(0)}€ restants pour atteindre l'objectif`;
    hint.style.color = 'var(--text3)';
  } else {
    fill.style.background = 'linear-gradient(90deg, #F6BD16, #F4A316)';
    fill.style.boxShadow = 'none';
    pctEl.textContent = Math.round(pctReal) + '%';
    pctEl.style.color = 'var(--amber)';
    hint.textContent = `${(goal - current).toFixed(0)}€ restants — encore un effort !`;
    hint.style.color = 'var(--amber-text)';
  }
}

window.openGoalModal = function () {
  if (!CURRENT_BOUTIQUE) return; // En mode All, l'objectif est la somme des boutiques
  document.getElementById('goal-input').value = cachedGoal > 0 ? cachedGoal : '';
  document.getElementById('goal-modal').classList.add('open');
  setTimeout(() => document.getElementById('goal-input').focus(), 100);
};

window.closeGoalModal = function () {
  document.getElementById('goal-modal').classList.remove('open');
};

window.saveGoal = async function () {
  const val = parseFloat(document.getElementById('goal-input').value);
  if (isNaN(val) || val < 0) { toast('Montant invalide', 'err'); return; }
  const btn = document.querySelector('#goal-modal .btn-primary');
  if (btn) btn.disabled = true;
  try {
    await sb.from('settings').upsert({ key: goalKey(), value: String(val) });
    cachedGoal = val;
    closeGoalModal();
    buildGoal();
    toast(`Objectif fixé à ${val}€`, 'ok');
  } catch(e) {
    toast('Erreur lors de la sauvegarde', 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
};


// ─── BOUTIQUES ────────────────────────────────────────────────────────────────
async function loadBoutiqueOrder() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'boutique_order').single();
    if (data && data.value) {
      BOUTIQUE_ORDER = JSON.parse(data.value);
      localStorage.setItem('ar_boutique_order', data.value);
      return;
    }
  } catch(e) { /* ignore, fall through to localStorage */ }
  try {
    const raw = localStorage.getItem('ar_boutique_order');
    BOUTIQUE_ORDER = raw ? JSON.parse(raw) : [];
  } catch(e) { BOUTIQUE_ORDER = []; }
}

function saveBoutiqueOrder() {
  const json = JSON.stringify(BOUTIQUE_ORDER);
  localStorage.setItem('ar_boutique_order', json);
  sb.from('settings').upsert({ key: 'boutique_order', value: json }).then(() => {});
}

function loadAllFilter() {
  try {
    const raw = localStorage.getItem('ar_all_filter');
    ALL_FILTER = raw ? JSON.parse(raw) : null;
  } catch(e) { ALL_FILTER = null; }
}

function saveAllFilter() {
  if (ALL_FILTER === null) localStorage.removeItem('ar_all_filter');
  else localStorage.setItem('ar_all_filter', JSON.stringify(ALL_FILTER));
}

function renderAllFilter() {
  const bar = document.getElementById('all-filter-bar');
  if (!bar) return;
  if (CURRENT_BOUTIQUE !== null) { bar.style.display = 'none'; return; }
  const sorted = sortedBoutiques();
  if (!sorted.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const allIds = sorted.map(b => b.id);
  // clean up stale IDs from deleted boutiques
  if (ALL_FILTER !== null) {
    const cleaned = ALL_FILTER.filter(id => allIds.includes(id));
    if (cleaned.length !== ALL_FILTER.length) {
      ALL_FILTER = cleaned.length === allIds.length ? null : (cleaned.length ? cleaned : null);
      saveAllFilter();
    }
  }
  const activeIds = ALL_FILTER !== null ? ALL_FILTER : allIds;
  bar.innerHTML = `<span class="all-filter-label">Inclure :</span>` +
    sorted.map(b => {
      const on = activeIds.includes(b.id);
      return `<button class="all-filter-pill ${on ? 'active' : ''}" onclick="toggleAllFilter(${b.id})">
        ${on ? `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
        ${b.nom}
      </button>`;
    }).join('');
}

window.toggleAllFilter = async function(id) {
  const allIds = sortedBoutiques().map(b => b.id);
  const activeIds = ALL_FILTER !== null ? [...ALL_FILTER] : [...allIds];
  const idx = activeIds.indexOf(id);
  if (idx >= 0) {
    if (activeIds.length <= 1) { toast('Sélectionne au moins une boutique', 'err'); return; }
    activeIds.splice(idx, 1);
  } else {
    activeIds.push(id);
  }
  ALL_FILTER = activeIds.length === allIds.length ? null : activeIds;
  saveAllFilter();
  renderAllFilter();
  await loadData();
  refreshCurrentPanel();
};

function sortedBoutiques() {
  const ordered = [];
  BOUTIQUE_ORDER.forEach(id => { const b = BOUTIQUES.find(b => b.id === id); if (b) ordered.push(b); });
  BOUTIQUES.forEach(b => { if (!BOUTIQUE_ORDER.includes(b.id)) ordered.push(b); });
  return ordered;
}

async function loadBoutiques() {
  try {
    const { data, error } = await sb.from('boutiques').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    BOUTIQUES = data;
    await loadBoutiqueOrder();
    loadAllFilter();
    const saved = localStorage.getItem('ar_boutique_id');
    if (saved === 'all') {
      CURRENT_BOUTIQUE = null;
    } else if (!CURRENT_BOUTIQUE && BOUTIQUES.length > 0) {
      CURRENT_BOUTIQUE = BOUTIQUES.find(b => b.id === parseInt(saved)) || BOUTIQUES[0];
    }
    renderBoutiqueToggle();
  } catch(e) {
    console.error('Erreur boutiques', e);
  }
}

function renderBoutiqueToggle() {
  const allActive = CURRENT_BOUTIQUE === null ? 'active' : '';
  const html = `<button class="btq-pill btq-all ${allActive}" onclick="switchToAll()">All</button>` +
    sortedBoutiques().map(b => `
      <button class="btq-pill ${CURRENT_BOUTIQUE && b.id === CURRENT_BOUTIQUE.id ? 'active' : ''}"
        draggable="true"
        data-btq-id="${b.id}"
        onclick="switchBoutique(${b.id})"
        ondragstart="btqDragStart(event,${b.id})"
        ondragenter="btqDragEnter(event,${b.id})"
        ondragleave="btqDragLeave(event)"
        ondragover="event.preventDefault()"
        ondrop="btqDrop(event,${b.id})"
        ondragend="btqDragEnd(event)">
        ${b.nom}
      </button>
    `).join('') + `<button class="btq-pill btq-add" onclick="openNewBoutiqueModal()" title="Nouvelle boutique">+</button>`;
  const c1 = document.getElementById('boutique-toggle');
  const c2 = document.getElementById('mobile-boutique-toggle');
  if (c1) c1.innerHTML = html;
  if (c2) c2.innerHTML = html;
  updateBoutiqueActionsBar();
  renderAllFilter();
  const addBtn = document.querySelector('.btn-add-header');
  if (addBtn) addBtn.style.display = CURRENT_BOUTIQUE ? '' : 'none';
  const importBtn = document.querySelector('.btn-import-header');
  if (importBtn) importBtn.style.display = CURRENT_BOUTIQUE ? '' : 'none';
}

// ─── DRAG & DROP BOUTIQUES ────────────────────────────────────────────────────
window.btqDragStart = function(e, id) {
  draggingBoutiqueId = id;
  _dragMoved = false;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('btq-dragging'), 0);
};

window.btqDragEnter = function(e, id) {
  if (draggingBoutiqueId === null || draggingBoutiqueId === id) return;
  e.preventDefault();
  document.querySelectorAll('.btq-drag-over').forEach(el => el.classList.remove('btq-drag-over'));
  e.currentTarget.classList.add('btq-drag-over');
};

window.btqDragLeave = function(e) {
  e.currentTarget.classList.remove('btq-drag-over');
};

window.btqDrop = function(e, targetId) {
  e.preventDefault();
  if (draggingBoutiqueId === null || draggingBoutiqueId === targetId) return;
  const sorted = sortedBoutiques();
  const newOrder = sorted.map(b => b.id);
  const fromIdx = newOrder.indexOf(draggingBoutiqueId);
  const toIdx = newOrder.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return;
  newOrder.splice(fromIdx, 1);
  newOrder.splice(toIdx, 0, draggingBoutiqueId);
  BOUTIQUE_ORDER = newOrder;
  _dragMoved = true;
  saveBoutiqueOrder();
  draggingBoutiqueId = null;
  renderBoutiqueToggle();
};

window.btqDragEnd = function(e) {
  draggingBoutiqueId = null;
  document.querySelectorAll('.btq-dragging, .btq-drag-over').forEach(el => {
    el.classList.remove('btq-dragging', 'btq-drag-over');
  });
  setTimeout(() => { _dragMoved = false; }, 100);
};

function updateBoutiqueActionsBar() {
  const bar = document.getElementById('boutique-actions-bar');
  const nameEl = document.getElementById('boutique-actions-name');
  if (!bar) return;
  if (!CURRENT_BOUTIQUE) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  if (nameEl) nameEl.textContent = CURRENT_BOUTIQUE.nom;
}

window.switchToAll = async function() {
  if (CURRENT_BOUTIQUE === null) return;
  CURRENT_BOUTIQUE = null;
  localStorage.setItem('ar_boutique_id', 'all');
  renderBoutiqueToggle();
  renderAllFilter();
  await Promise.all([loadData(), loadGoal()]);
  refreshCurrentPanel();
  toast('All — toutes les boutiques', 'ok');
};

window.deleteBoutiqueFromPanel = async function() {
  if (!CURRENT_BOUTIQUE) return;
  editBoutiqueId = CURRENT_BOUTIQUE.id;
  await deleteBoutique();
};

window.switchBoutique = async function(id) {
  if (_dragMoved) return;
  const b = BOUTIQUES.find(b => b.id === id);
  if (!b || (CURRENT_BOUTIQUE && b.id === CURRENT_BOUTIQUE.id)) return;
  CURRENT_BOUTIQUE = b;
  localStorage.setItem('ar_boutique_id', id);
  renderBoutiqueToggle();
  await Promise.all([loadData(), loadGoal()]);
  refreshCurrentPanel();
  toast(`Boutique : ${b.nom}`, 'ok');
};

window.openNewBoutiqueModal = function() {
  document.getElementById('new-boutique-name').value = '';
  document.getElementById('new-boutique-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-boutique-name').focus(), 100);
};
window.closeNewBoutiqueModal = function() {
  document.getElementById('new-boutique-modal').classList.remove('open');
};

window.createBoutique = async function() {
  const nom = document.getElementById('new-boutique-name').value.trim();
  if (!nom) { toast('Nomme ta boutique', 'err'); return; }
  const colors = ['#185FA5', '#1D9E75', '#BA7517', '#A32D2D', '#7B1A2E', '#533AB7'];
  const couleur = colors[BOUTIQUES.length % colors.length];
  const btn = document.getElementById('btn-create-boutique');
  btn.disabled = true;
  try {
    const { data, error } = await sb.from('boutiques').insert([{ nom, couleur }]).select().single();
    if (error) throw error;
    BOUTIQUES.push(data);
    BOUTIQUE_ORDER.push(data.id);
    saveBoutiqueOrder();
    closeNewBoutiqueModal();
    await switchBoutique(data.id);
    toast(`Boutique "${nom}" créée`, 'ok');
  } catch(e) {
    toast('Erreur lors de la création', 'err');
  } finally {
    btn.disabled = false;
  }
};

// ─── EDIT / DELETE BOUTIQUE ───────────────────────────────────────────────────
let editBoutiqueId = null;

window.openEditBoutiqueModal = function(id) {
  editBoutiqueId = id;
  const b = BOUTIQUES.find(b => b.id === id);
  if (!b) return;
  document.getElementById('edit-boutique-name').value = b.nom;
  document.getElementById('edit-boutique-modal').classList.add('open');
  setTimeout(() => document.getElementById('edit-boutique-name').focus(), 100);
};

window.closeEditBoutiqueModal = function() {
  document.getElementById('edit-boutique-modal').classList.remove('open');
  editBoutiqueId = null;
};

window.saveBoutiqueRename = async function() {
  const nom = document.getElementById('edit-boutique-name').value.trim();
  if (!nom) { toast('Nomme ta boutique', 'err'); return; }
  const btn = document.getElementById('btn-rename-boutique');
  btn.disabled = true;
  try {
    const { error } = await sb.from('boutiques').update({ nom }).eq('id', editBoutiqueId);
    if (error) throw error;
    const b = BOUTIQUES.find(b => b.id === editBoutiqueId);
    if (b) b.nom = nom;
    if (CURRENT_BOUTIQUE && CURRENT_BOUTIQUE.id === editBoutiqueId) CURRENT_BOUTIQUE.nom = nom;
    closeEditBoutiqueModal();
    renderBoutiqueToggle();
    toast(`Boutique renommée en "${nom}"`, 'ok');
  } catch(e) {
    toast('Erreur lors de la modification', 'err');
  } finally {
    btn.disabled = false;
  }
};

window.deleteBoutique = async function() {
  const b = BOUTIQUES.find(b => b.id === editBoutiqueId);
  if (!b) return;
  const ok = await showConfirm('Supprimer la boutique', `Supprimer <strong>${b.nom}</strong> ?<br><br>Tous les articles de cette boutique seront également supprimés. Cette action est irréversible.`);
  if (!ok) return;
  const deletedId = editBoutiqueId;
  try {
    const { error } = await sb.from('boutiques').delete().eq('id', deletedId);
    if (error) throw error;
    const nom = b.nom;
    BOUTIQUES = BOUTIQUES.filter(b => b.id !== deletedId);
    BOUTIQUE_ORDER = BOUTIQUE_ORDER.filter(id => id !== deletedId);
    saveBoutiqueOrder();
    closeEditBoutiqueModal();
    if (CURRENT_BOUTIQUE && CURRENT_BOUTIQUE.id === deletedId) {
      CURRENT_BOUTIQUE = BOUTIQUES.length > 0 ? BOUTIQUES[0] : null;
      if (CURRENT_BOUTIQUE) localStorage.setItem('ar_boutique_id', CURRENT_BOUTIQUE.id);
      else localStorage.setItem('ar_boutique_id', 'all');
    }
    renderBoutiqueToggle();
    await Promise.all([loadData(), loadGoal()]);
    refreshCurrentPanel();
    toast(`Boutique "${nom}" supprimée`, 'ok');
  } catch(e) {
    toast('Erreur lors de la suppression', 'err');
  }
};

// ─── REFRESH ─────────────────────────────────────────────────────────────────
window.refreshApp = async function () {
  const btn = document.querySelector(".btn-refresh-header");
  if (btn) btn.classList.add("spinning");
  await loadData();
  refreshCurrentPanel();
  if (btn) setTimeout(() => btn.classList.remove("spinning"), 600);
  toast("Données actualisées", "ok");
};

// ─── BILAN ───────────────────────────────────────────────────────────────────
let bilanCharts = {};

function killBilanChart(id) { if (bilanCharts[id]) { bilanCharts[id].destroy(); delete bilanCharts[id]; } }

window.showBilanTab = function(tab) {
  document.getElementById('btab-month').classList.toggle('active', tab === 'month');
  document.getElementById('btab-year').classList.toggle('active', tab === 'year');
  document.getElementById('bilan-month').style.display = tab === 'month' ? 'block' : 'none';
  document.getElementById('bilan-year').style.display = tab === 'year' ? 'block' : 'none';
};

function buildBilanSelectors() {
  const monthSet = new Set();
  const yearSet = new Set();
  D.forEach(d => {
    if (d.dr) { monthSet.add(d.dr.slice(0, 7)); yearSet.add(d.dr.slice(0, 4)); }
    if (d.da) { monthSet.add(d.da.slice(0, 7)); yearSet.add(d.da.slice(0, 4)); }
  });

  const years = [...yearSet].sort().reverse();
  const ySel = document.getElementById('bilan-year-select');
  const ySelAnnual = document.getElementById('bilan-year-select');

  // Populate year selector for monthly tab
  const myYSel = document.getElementById('bilan-month-year');
  myYSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

  // Populate year selector for annual tab
  const ayYSel = document.getElementById('bilan-year-select');
  ayYSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

  filterBilanMonths();
  buildBilanYear();
}

window.filterBilanMonths = function() {
  const year = document.getElementById('bilan-month-year').value;
  const ms = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const monthSet = new Set();
  D.forEach(d => {
    if (d.dr && d.dr.startsWith(year)) monthSet.add(d.dr.slice(0, 7));
    if (d.da && d.da.startsWith(year)) monthSet.add(d.da.slice(0, 7));
  });
  const months = [...monthSet].sort().reverse();
  const mSel = document.getElementById('bilan-month-select');
  mSel.innerHTML = months.map(k => {
    const [y, m] = k.split('-');
    return `<option value="${k}">${ms[parseInt(m)-1]}</option>`;
  }).join('');
  buildBilanMonth();
};

function bilanMetricsHTML(metrics) {
  return metrics.map(m => `
    <div class="metric">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value ${m.color||''}">${m.value}</div>
      ${m.sub ? `<div class="metric-sub">${m.sub}</div>` : ''}
    </div>`).join('');
}

function bilanTopHTML(items, limit) {
  return items.slice(0, limit).map((d, i) => `
    <div class="bilan-top-item">
      <div class="bilan-top-rank">${i+1}</div>
      <div class="bilan-top-name" title="${d.n}">${d.n}</div>
      <div class="bilan-top-pv">+${(d.r - d.a).toFixed(2)}€</div>
    </div>`).join('');
}

function bilanCatChart(canvasId, sold, legendId) {
  killBilanChart(canvasId);
  const cc = {};
  sold.forEach(d => { const c = catOf(d); cc[c] = (cc[c]||0) + 1; });
  const cats = Object.keys(cc);
  if (!cats.length) return;
  document.getElementById(legendId).innerHTML = cats.map(c =>
    `<span><span class="ldot" style="background:${CC[c]||'#888'}"></span>${c} (${cc[c]})</span>`
  ).join('');
  bilanCharts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'doughnut',
    data: { labels: cats, datasets: [{ data: cats.map(c => cc[c]), backgroundColor: cats.map(c => CC[c]||'#888'), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { display: false } }, cutout: '62%' }
  });
}

window.buildBilanMonth = function() {
  const key = document.getElementById('bilan-month-select').value;
  if (!key) return;

  const sold = D.filter(d => d.r !== null && d.dr && d.dr.startsWith(key));
  const bought = D.filter(d => d.da && d.da.startsWith(key));
  const recettes      = sold.reduce((s, d) => s + d.r, 0);
  const coutVendus    = sold.reduce((s, d) => s + d.a, 0);
  const benefice      = recettes - coutVendus;
  const montantAchete = bought.reduce((s, d) => s + d.a, 0);
  const roi = coutVendus > 0 ? (benefice / coutVendus * 100) : 0;

  document.getElementById('bilan-m-metrics').innerHTML = bilanMetricsHTML([
    { label: 'Articles vendus', value: sold.length, sub: `ce mois` },
    { label: 'Articles achetés', value: bought.length, sub: `${montantAchete.toFixed(0)}€ investis` },
    { label: 'Coût vendus', value: coutVendus.toFixed(0)+'€', color: 'mv-amber' },
    { label: 'Recettes', value: recettes.toFixed(0)+'€', color: 'mv-blue' },
    { label: 'Bénéfice', value: benefice.toFixed(0)+'€', color: 'mv-green', sub: `+${roi.toFixed(0)}% ROI` },
    { label: 'Marge moy./article', value: sold.length > 0 ? (benefice/sold.length).toFixed(0)+'€' : '—' },
  ]);

  bilanCatChart('bilan-c-cat-m', sold, 'bilan-m-leg');

  const top5 = sold.slice().sort((a, b) => (b.r - b.a) - (a.r - a.a));
  document.getElementById('bilan-m-top').innerHTML = top5.length
    ? bilanTopHTML(top5, 5)
    : '<div class="empty-state">Aucun article vendu ce mois</div>';

  document.getElementById('bilan-m-achats').innerHTML = bought.length
    ? bought.map(d => `
        <div class="bilan-achat-item">
          <div class="bilan-achat-name">${d.n}</div>
          <div class="bilan-achat-cat">${d.cat || ''}</div>
          <div class="bilan-achat-price">${d.a.toFixed(2)}€</div>
          ${d.r !== null ? `<span class="badge b-green bilan-achat-status">Vendu</span>` : `<span class="badge b-amber bilan-achat-status">Stock</span>`}
        </div>`).join('')
    : '<div class="empty-state">Aucun article acheté ce mois</div>';

  const soldThisMonth = sold.slice().sort((a, b) => (b.r - b.a) - (a.r - a.a));
  document.getElementById('bilan-m-vendus').innerHTML = soldThisMonth.length
    ? soldThisMonth.map(d => `
        <div class="bilan-achat-item">
          <div class="bilan-achat-name">${d.n}</div>
          <div class="bilan-achat-cat">${d.cat || ''}</div>
          <div class="bilan-achat-price">${d.r.toFixed(2)}€</div>
          <span class="pv-pos bilan-achat-status">+${(d.r - d.a).toFixed(0)}€</span>
        </div>`).join('')
    : '<div class="empty-state">Aucun article vendu ce mois</div>';
};

window.buildBilanYear = function() {
  const year = document.getElementById('bilan-year-select').value;
  if (!year) return;

  const sold = D.filter(d => d.r !== null && d.dr && d.dr.startsWith(year));
  const bought = D.filter(d => d.da && d.da.startsWith(year));
  const recettes      = sold.reduce((s, d) => s + d.r, 0);
  const coutVendus    = sold.reduce((s, d) => s + d.a, 0);
  const benefice      = recettes - coutVendus;
  const montantAchete = bought.reduce((s, d) => s + d.a, 0);
  const roi = coutVendus > 0 ? (benefice / coutVendus * 100) : 0;
  const meilleurMois = () => {
    const mm = {};
    sold.forEach(d => { const k = d.dr.slice(0,7); mm[k] = (mm[k]||0) + (d.r - d.a); });
    const best = Object.entries(mm).sort((a,b) => b[1]-a[1])[0];
    if (!best) return '—';
    const ms = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
    const mo = parseInt(best[0].split('-')[1]) - 1;
    return `${ms[mo]} (+${best[1].toFixed(0)}€)`;
  };

  document.getElementById('bilan-y-metrics').innerHTML = bilanMetricsHTML([
    { label: 'Articles vendus', value: sold.length, sub: `en ${year}` },
    { label: 'Articles achetés', value: bought.length, sub: `${montantAchete.toFixed(0)}€ investis` },
    { label: 'Coût vendus', value: coutVendus.toFixed(0)+'€', color: 'mv-amber' },
    { label: 'Recettes', value: recettes.toFixed(0)+'€', color: 'mv-blue' },
    { label: 'Bénéfice', value: benefice.toFixed(0)+'€', color: 'mv-green', sub: `+${roi.toFixed(0)}% ROI` },
    { label: 'Meilleur mois', value: meilleurMois(), sub: 'en bénéfice' },
  ]);

  bilanCatChart('bilan-c-cat-y', sold, 'bilan-y-leg');

  // Monthly bar chart for the year
  const ms = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
  const monthlyB = Array(12).fill(0);
  sold.forEach(d => { const mo = parseInt(d.dr.slice(5,7))-1; monthlyB[mo] += (d.r - d.a); });
  killBilanChart('bilan-c-monthly-y');
  bilanCharts['bilan-c-monthly-y'] = new Chart(document.getElementById('bilan-c-monthly-y'), {
    plugins: [ChartDataLabels],
    type: 'bar',
    data: { labels: ms, datasets: [{
      data: monthlyB.map(v => +v.toFixed(2)),
      backgroundColor: monthlyB.map(v => v >= 0 ? 'rgba(90,216,166,0.7)' : 'rgba(244,102,74,0.7)'),
      borderRadius: 4,
      datalabels: {
        display: (ctx) => ctx.dataset.data[ctx.dataIndex] !== 0,
        color: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 0 ? 'rgba(90,216,166,0.95)' : 'rgba(244,102,74,0.95)',
        font: { size: 9, family: 'DM Mono', weight: '600' },
        anchor: 'end', align: 'end', offset: 2,
        formatter: (v) => v !== 0 ? v.toFixed(0)+'€' : '',
      }
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 20 } },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9, family: 'DM Mono' }, color: '#5c5a57' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { callback: v => v+'€', font: { size: 9, family: 'DM Mono' }, color: '#5c5a57' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

  const top10 = sold.slice().sort((a, b) => (b.r - b.a) - (a.r - a.a));
  document.getElementById('bilan-y-top').innerHTML = top10.length
    ? bilanTopHTML(top10, 10)
    : '<div class="empty-state">Aucun article vendu cette année</div>';

  const boughtSorted = bought.slice().sort((a, b) => (b.da || '').localeCompare(a.da || ''));
  document.getElementById('bilan-y-achats').innerHTML = boughtSorted.length
    ? boughtSorted.map(d => `
        <div class="bilan-achat-item">
          <div class="bilan-achat-name">${d.n}</div>
          <div class="bilan-achat-cat">${d.cat || ''}</div>
          <div class="bilan-achat-price">${d.a.toFixed(2)}€</div>
          ${d.r !== null ? `<span class="badge b-green bilan-achat-status">Vendu</span>` : `<span class="badge b-amber bilan-achat-status">Stock</span>`}
        </div>`).join('')
    : '<div class="empty-state">Aucun article acheté cette année</div>';

  const soldSorted = sold.slice().sort((a, b) => (b.dr || '').localeCompare(a.dr || ''));
  document.getElementById('bilan-y-vendus').innerHTML = soldSorted.length
    ? soldSorted.map(d => `
        <div class="bilan-achat-item">
          <div class="bilan-achat-name">${d.n}</div>
          <div class="bilan-achat-cat">${d.cat || ''}</div>
          <div class="bilan-achat-price">${d.r.toFixed(2)}€</div>
          <span class="pv-pos bilan-achat-status">+${(d.r - d.a).toFixed(0)}€</span>
        </div>`).join('')
    : '<div class="empty-state">Aucun article vendu cette année</div>';
};


// ─── URSSAF ──────────────────────────────────────────────────────────────────

const URSSAF_TAUX_SOCIAL = 0.123;  // 12.3% cotisations sociales 2025 (BIC ventes de marchandises)
const URSSAF_TAUX_CFP    = 0.001;  // 0.1% CFP
let URSSAF_EXCLUDED = new Set(); // boutique IDs excluded from URSSAF

function urssafMonths() {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months; // [current, -1, -2]
}

function urssafMonthLabel(key) {
  const [y, m] = key.split('-');
  const ms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  return `${ms[parseInt(m) - 1]} ${y}`;
}

function urssafCaForMonth(key) {
  // Recettes encaissées (et non simplement vendues) : c'est la date de
  // réception du paiement qui fait foi pour la déclaration URSSAF, pas
  // la date de la vente (régime BIC auto-entrepreneur)
  const sold = D.filter(d => {
    if (d.r === null || !d.de || !d.de.startsWith(key)) return false;
    if (URSSAF_EXCLUDED.has(d.boutique_id)) return false;
    if (CURRENT_BOUTIQUE && d.boutique_id !== CURRENT_BOUTIQUE.id) return false;
    return true;
  });
  const total = sold.reduce((s, d) => s + d.r, 0);
  const byBoutique = {};
  sold.forEach(d => {
    const bid = d.boutique_id;
    if (!byBoutique[bid]) byBoutique[bid] = 0;
    byBoutique[bid] += d.r;
  });
  return { total, byBoutique, count: sold.length };
}

async function loadUrssafStatus(key) {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', `urssaf_${key}`).single();
    return data ? JSON.parse(data.value) : null;
  } catch(e) { return null; }
}

async function saveUrssafStatus(key, status) {
  await sb.from('settings').upsert({ key: `urssaf_${key}`, value: JSON.stringify(status) });
}

async function loadUrssafExcluded() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'urssaf_excluded').single();
    URSSAF_EXCLUDED = data ? new Set(JSON.parse(data.value)) : new Set();
  } catch(e) { URSSAF_EXCLUDED = new Set(); }
}

async function saveUrssafExcluded() {
  await sb.from('settings').upsert({ key: 'urssaf_excluded', value: JSON.stringify(Array.from(URSSAF_EXCLUDED)) });
}

window.toggleUrssafBoutique = async function(bid) {
  bid = parseInt(bid);
  if (URSSAF_EXCLUDED.has(bid)) URSSAF_EXCLUDED.delete(bid);
  else URSSAF_EXCLUDED.add(bid);
  await saveUrssafExcluded();
  buildUrssaf();
};

async function cleanupOldUrssaf() {
  const keep = new Set([...urssafMonths().map(k => `urssaf_${k}`), 'urssaf_excluded']);
  try {
    const { data } = await sb.from('settings').select('key').like('key', 'urssaf_%');
    if (!data) return;
    const toDelete = data.map(r => r.key).filter(k => !keep.has(k));
    if (toDelete.length) await sb.from('settings').delete().in('key', toDelete);
  } catch(e) {}
}

async function buildUrssaf() {
  const months = urssafMonths();
  cleanupOldUrssaf();
  await loadUrssafExcluded();

  const statuses = await Promise.all(months.map(k => loadUrssafStatus(k)));

  const wrap = document.getElementById('urssaf-wrap');
  if (!wrap) return;

  const configEl = document.getElementById('urssaf-config');
  if (configEl) {
    if (CURRENT_BOUTIQUE) {
      const bid = CURRENT_BOUTIQUE.id;
      const isOn = !URSSAF_EXCLUDED.has(bid);
      configEl.innerHTML = `<div class="urssaf-toggle-wrap">
        <label class="urssaf-toggle">
          <input type="checkbox" ${isOn ? 'checked' : ''} onchange="toggleUrssafBoutique(${bid})">
          <span class="urssaf-toggle-track"></span>
        </label>
      </div>`;
    } else {
      configEl.innerHTML = '';
    }
  }
  const isOff = CURRENT_BOUTIQUE ? URSSAF_EXCLUDED.has(CURRENT_BOUTIQUE.id) : false;
  wrap.className = 'urssaf-grid' + (isOff ? ' urssaf-grid-off' : '');

  const now = new Date();
  const isCurrentMonth = (key) => {
    const [y, m] = key.split('-');
    return parseInt(y) === now.getFullYear() && parseInt(m) === now.getMonth() + 1;
  };

  wrap.innerHTML = months.map((key, i) => {
    const ca = urssafCaForMonth(key);
    const cotisations = ca.total * URSSAF_TAUX_SOCIAL;
    const cfp = ca.total * URSSAF_TAUX_CFP;
    const total = cotisations + cfp;
    const status = statuses[i];
    const declared = status?.declared;
    const declaredAt = status?.declared_at || '';
    const isCurrent = isCurrentMonth(key);

    // Boutique breakdown
    const boutiqueLines = Object.entries(ca.byBoutique).map(([bid, val]) => {
      const b = BOUTIQUES.find(b => b.id === parseInt(bid));
      return `<div class="urssaf-boutique-row">
        <span>${b ? b.nom : 'Boutique'}</span>
        <span class="td-num">${val.toFixed(2)}€</span>
      </div>`;
    }).join('');

    return `<div class="urssaf-card ${declared ? 'urssaf-declared' : ''} ${isCurrent ? 'urssaf-current' : ''}">
      <div class="urssaf-card-header">
        <div>
          <div class="urssaf-month">${urssafMonthLabel(key)}</div>
          ${isCurrent ? '<div class="urssaf-tag urssaf-tag-current">Mois en cours</div>' : ''}
          ${declared ? `<div class="urssaf-tag urssaf-tag-done">✓ Déclaré${declaredAt ? ' le ' + declaredAt : ''}</div>` : (!isCurrent ? '<div class="urssaf-tag urssaf-tag-pending">À déclarer</div>' : '')}
        </div>
        ${declared ? `<button class="urssaf-undeclare" onclick="toggleUrssafDeclared('${key}', false)">Annuler</button>` : ''}
      </div>

      <div class="urssaf-amounts">
        <div class="urssaf-row urssaf-row-main">
          <span>Chiffre d'affaires</span>
          <span class="urssaf-ca">${ca.total.toFixed(2)}€</span>
        </div>
        <div class="urssaf-sub-label">Ventes de marchandises (BIC) — ${ca.count} article${ca.count > 1 ? 's' : ''} encaissé${ca.count > 1 ? 's' : ''}</div>
        ${boutiqueLines ? `<div class="urssaf-boutiques">${boutiqueLines}</div>` : ''}
      </div>

      <div class="urssaf-cotisations">
        <div class="urssaf-row">
          <span>Cotisations sociales <span class="urssaf-rate">12.3%</span></span>
          <span>${cotisations.toFixed(2)}€</span>
        </div>
        <div class="urssaf-row">
          <span>CFP <span class="urssaf-rate">0.1%</span></span>
          <span>${cfp.toFixed(2)}€</span>
        </div>
        <div class="urssaf-row urssaf-row-total">
          <span>Total estimé</span>
          <span>${total.toFixed(2)}€</span>
        </div>
      </div>

      ${!declared ? `<button class="urssaf-declare-btn" onclick="toggleUrssafDeclared('${key}', true)">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Marquer comme déclaré
      </button>` : ''}
    </div>`;
  }).join('');
}

window.toggleUrssafDeclared = async function(key, declared) {
  const today_str = new Date().toLocaleDateString('fr-FR');
  const status = declared ? { declared: true, declared_at: today_str } : { declared: false };
  await saveUrssafStatus(key, status);
  buildUrssaf();
  toast(declared ? 'Déclaration enregistrée' : 'Déclaration annulée', 'ok');
};

// ─── DATE PICKER ─────────────────────────────────────────────────────────────
let _dpTarget = null, _dpYear = 0, _dpMonth = 0;

function _dpRender() {
  const MO = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  document.getElementById('dp-title').textContent = `${MO[_dpMonth]} ${_dpYear}`;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const sel = _dpTarget?.value || '';
  const firstDay = new Date(_dpYear, _dpMonth, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const dim = new Date(_dpYear, _dpMonth + 1, 0).getDate();
  let h = '';
  for (let i = 0; i < offset; i++) h += '<span class="dp-empty"></span>';
  for (let d = 1; d <= dim; d++) {
    const ymd = `${_dpYear}-${String(_dpMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = 'dp-cell' + (ymd === todayStr ? ' dp-today' : '') + (ymd === sel ? ' dp-sel' : '');
    h += `<button class="${cls}" onclick="dpSelect('${ymd}')">${d}</button>`;
  }
  document.getElementById('dp-grid').innerHTML = h;
}

window.dpOpen = function(input) {
  _dpTarget = input;
  const val = input.value;
  const now = new Date();
  if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    _dpYear = parseInt(val.slice(0,4)); _dpMonth = parseInt(val.slice(5,7)) - 1;
  } else {
    _dpYear = now.getFullYear(); _dpMonth = now.getMonth();
  }
  _dpRender();
  const rect = input.getBoundingClientRect();
  const panel = document.getElementById('dp-panel');
  document.getElementById('dp').style.display = 'block';
  let top = rect.bottom + 6, left = rect.left;
  if (left + 284 > window.innerWidth - 8) left = window.innerWidth - 284 - 8;
  if (top + 290 > window.innerHeight) top = rect.top - 290 - 6;
  panel.style.top = Math.max(8, top) + 'px';
  panel.style.left = Math.max(8, left) + 'px';
};

window.dpClose = function() {
  document.getElementById('dp').style.display = 'none';
  _dpTarget = null;
};

window.dpMove = function(dir) {
  _dpMonth += dir;
  if (_dpMonth < 0) { _dpMonth = 11; _dpYear--; }
  if (_dpMonth > 11) { _dpMonth = 0; _dpYear++; }
  _dpRender();
};

window.dpSelect = function(ymd) {
  if (_dpTarget) {
    _dpTarget.value = ymd;
    const clr = document.getElementById('clr-' + _dpTarget.id);
    if (clr) clr.style.display = 'inline-flex';
    _dpTarget.dispatchEvent(new Event('change', { bubbles: true }));
  }
  dpClose();
};

window.dpClear = function(id) {
  const el = document.getElementById(id);
  if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
  const clr = document.getElementById('clr-' + id);
  if (clr) clr.style.display = 'none';
};

window.dpSetValue = function(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = val || '';
  const clr = document.getElementById('clr-' + id);
  if (clr) clr.style.display = val ? 'inline-flex' : 'none';
};

// ─── RECHERCHE GLOBALE ────────────────────────────────────────────────────────
window.doGlobalSearch = function () {
  const q = document.getElementById('global-search').value.trim();
  const container = document.getElementById('global-results');

  if (!q) { container.classList.remove('open'); container.innerHTML = ''; return; }

  const results = D.filter(d => matchesSearch(d, q));
  container.classList.add('open');

  if (!results.length) {
    container.innerHTML = `<div class="search-empty">Aucun résultat pour "${q}"</div>`;
    return;
  }

  container.innerHTML = `
    <div class="search-result-label">${results.length} résultat${results.length > 1 ? 's' : ''}</div>
    ${results.slice(0, 10).map(d => {
      const pv = d.r !== null ? +(d.r - d.a).toFixed(2) : null;
      return `<div class="search-result-item" onclick="goToItem(${d.id})">
        <div class="sri-icon ${d.r !== null ? 'sri-sold' : 'sri-stock'}">${d.r !== null ? '✓' : '○'}</div>
        <div class="sri-body">
          <div class="sri-top">
            <span class="sri-name">${d.n}</span>
            <span class="badge ${d.r !== null ? 'b-green' : 'b-amber'}" style="flex-shrink:0">${d.r !== null ? 'Vendu' : 'Stock'}</span>
          </div>
          <div class="sri-bottom">
            ${d.cat ? `<span class="sri-cat">${d.cat}</span><span class="sri-sep">·</span>` : ''}
            <span class="sri-price">Achat ${d.a.toFixed(2)}€</span>
            ${d.r !== null ? `<span class="sri-arrow">→</span><span class="sri-price">${d.r.toFixed(2)}€</span>` : ''}
            ${pv !== null ? `<span class="sri-pv">+${pv.toFixed(2)}€</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
    ${results.length > 10 ? `<div class="search-empty">+ ${results.length - 10} autres — affinez la recherche</div>` : ''}
  `;
};


window.doMobileSearch = function () {
  const q = document.getElementById('mobile-search').value.trim();
  const container = document.getElementById('mobile-results');
  if (!q) { container.classList.remove('open'); container.innerHTML = ''; return; }

  const results = D.filter(d => matchesSearch(d, q));
  container.classList.add('open');

  if (!results.length) {
    container.innerHTML = `<div class="search-empty">Aucun résultat pour "${q}"</div>`;
    return;
  }

  container.innerHTML = `
    <div class="search-result-label">${results.length} résultat${results.length > 1 ? 's' : ''}</div>
    ${results.slice(0, 10).map(d => {
      const pv = d.r !== null ? +(d.r - d.a).toFixed(2) : null;
      return `<div class="search-result-item" onclick="goToItemMobile(${d.id})">
        <div class="sri-icon ${d.r !== null ? 'sri-sold' : 'sri-stock'}">${d.r !== null ? '✓' : '○'}</div>
        <div class="sri-body">
          <div class="sri-top">
            <span class="sri-name">${d.n}</span>
            <span class="badge ${d.r !== null ? 'b-green' : 'b-amber'}" style="flex-shrink:0">${d.r !== null ? 'Vendu' : 'Stock'}</span>
          </div>
          <div class="sri-bottom">
            ${d.cat ? `<span class="sri-cat">${d.cat}</span><span class="sri-sep">·</span>` : ''}
            <span class="sri-price">Achat ${d.a.toFixed(2)}€</span>
            ${d.r !== null ? `<span class="sri-arrow">→</span><span class="sri-price">${d.r.toFixed(2)}€</span>` : ''}
            ${pv !== null ? `<span class="sri-pv">+${pv.toFixed(2)}€</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
    ${results.length > 10 ? `<div class="search-empty">+ ${results.length - 10} autres — affinez la recherche</div>` : ''}
  `;
};

window.goToItemMobile = function (id) {
  document.getElementById('mobile-search').value = '';
  document.getElementById('mobile-results').classList.remove('open');
  showTab('items');
  const it = D.find(d => d.id === id);
  if (it) { document.getElementById('srch').value = it.n; filterTable(); }
};

window.goToItem = function (id) {
  document.getElementById('global-search').value = '';
  document.getElementById('global-results').classList.remove('open');
  showTab('items');
  const it = D.find(d => d.id === id);
  if (it) { document.getElementById('srch').value = it.n; filterTable(); }
};

// Close search dropdown on click outside
document.addEventListener('click', function(e) {
  const wrap = document.querySelector('.header-search-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('global-results').classList.remove('open');
  }
  const mWrap = document.querySelector('.mobile-search-wrap');
  if (mWrap && !mWrap.contains(e.target)) {
    const mr = document.getElementById('mobile-results');
    if (mr) mr.classList.remove('open');
  }
});


// ─── CONFIRM DIALOG ───────────────────────────────────────────────────────────
let confirmResolve = null;

function showConfirm(title, body, opts = {}) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').innerHTML = body;
    const btn = document.getElementById('btn-confirm-yes');
    btn.className = opts.btnClass || 'btn-confirm-delete';
    document.getElementById('confirm-yes-label').textContent = opts.okLabel || 'Supprimer';
    const icon = document.getElementById('confirm-yes-icon');
    if (opts.icon) icon.innerHTML = opts.icon;
    else icon.innerHTML = '<path d="M3 7h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    document.getElementById('confirm-modal').classList.add('open');
  });
}

window.closeConfirm = function(result) {
  document.getElementById('confirm-modal').classList.remove('open');
  if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
};

// ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────
window.exportExcel = function () {
  const wb = XLSX.utils.book_new();
  const ms = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const boutiqueLabel = CURRENT_BOUTIQUE ? CURRENT_BOUTIQUE.nom : 'Toutes';

  // ── Feuille 1 : Tous les articles ──────────────────────────────────────────
  const articlesData = [
    ['ID', 'Nom', 'SKU', 'N° commande', 'Grossiste', 'Catégorie', 'Boutique',
     'Prix achat (€)', 'Date achat', 'Prix vente (€)', 'Date vente', 'Date encaissement',
     'Plus-value (€)', 'Multiplicateur', 'Statut']
  ];
  D.forEach(d => {
    const pv  = d.r !== null ? +(d.r - d.a).toFixed(2) : '';
    const mult = d.r !== null && d.a > 0 ? +(d.r / d.a).toFixed(2) : '';
    const btq  = BOUTIQUES.find(b => b.id === d.boutique_id)?.nom || '';
    const statut = d.r === null ? 'En stock' : (d.de !== null ? 'Encaissé' : 'Vendu');
    articlesData.push([
      d.id, d.n, d.sku || '', d.cmd || '', d.grossiste || '', d.cat || '', btq,
      d.a, d.da,
      d.r !== null ? d.r : '', d.dr || '', d.de || '',
      pv, mult,
      statut
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(articlesData);
  ws1['!cols'] = [
    {wch:6},{wch:32},{wch:18},{wch:18},{wch:18},{wch:16},{wch:18},
    {wch:14},{wch:12},{wch:14},{wch:12},{wch:16},{wch:14},{wch:13},{wch:10}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Articles');

  // ── Feuille 2 : Résumé global ──────────────────────────────────────────────
  const s = stats();
  const resumeData = [
    ['📊 RÉSUMÉ', ''],
    ['Date export', new Date().toLocaleDateString('fr-FR')],
    ['Boutique', boutiqueLabel],
    ['', ''],
    ['Articles achetés', s.count],
    ['Articles vendus', s.sold.length],
    ['Articles en stock', s.stock.length],
    ['Taux de rotation', `${Math.round(s.sold.length / s.count * 100)}%`],
    ['', ''],
    ['Total investi (tous articles)', `${s.totalAchat.toFixed(2)} €`],
    ['Coût articles vendus', `${s.coutVendus.toFixed(2)} €`],
    ['Capital en stock', `${s.capitalStock.toFixed(2)} €`],
    ['Recettes de vente', `${s.totalRevente.toFixed(2)} €`],
    ['Bénéfice net', `${s.benefice.toFixed(2)} €`],
    ['ROI', `+${s.roi.toFixed(0)}%`],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(resumeData);
  ws2['!cols'] = [{wch:28},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Résumé');

  // ── Feuille 3 : Bilan par mois ─────────────────────────────────────────────
  const mm = {};
  D.forEach(d => {
    if (d.dr) {
      const k = d.dr.slice(0,7);
      if (!mm[k]) mm[k] = { vendus: 0, recettes: 0, cout: 0, benefice: 0, achetes: 0, montantAchete: 0 };
      mm[k].vendus++; mm[k].recettes += d.r; mm[k].cout += d.a;
    }
    if (d.da) {
      const ka = d.da.slice(0,7);
      if (!mm[ka]) mm[ka] = { vendus: 0, recettes: 0, cout: 0, benefice: 0, achetes: 0, montantAchete: 0 };
      mm[ka].achetes++; mm[ka].montantAchete += d.a;
    }
  });
  const mensuelData = [
    ['Mois', 'Articles vendus', 'Recettes (€)', 'Coût vendus (€)', 'Bénéfice (€)', 'ROI', 'Articles achetés', 'Montant acheté (€)']
  ];
  Object.keys(mm).sort().forEach(k => {
    const m = mm[k];
    const benef = m.recettes - m.cout;
    const roi = m.cout > 0 ? `+${(benef/m.cout*100).toFixed(0)}%` : '—';
    const [y, mo] = k.split('-');
    mensuelData.push([
      `${ms[parseInt(mo)-1]} ${y}`,
      m.vendus, +m.recettes.toFixed(2), +m.cout.toFixed(2),
      +benef.toFixed(2), roi, m.achetes, +m.montantAchete.toFixed(2)
    ]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(mensuelData);
  ws3['!cols'] = [{wch:16},{wch:16},{wch:14},{wch:16},{wch:14},{wch:8},{wch:16},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Bilan mensuel');

  // ── Feuille 4 : Stock par SKU ──────────────────────────────────────────────
  const skuMap = {};
  D.filter(d => d.sku && d.r === null).forEach(d => {
    if (!skuMap[d.sku]) skuMap[d.sku] = { sku: d.sku, articles: [], totalAchat: 0 };
    skuMap[d.sku].articles.push(d.n);
    skuMap[d.sku].totalAchat += d.a;
  });
  const skuData = [
    ['SKU', 'Quantité en stock', 'Valeur totale (€)', 'Articles']
  ];
  Object.values(skuMap)
    .sort((a, b) => b.articles.length - a.articles.length)
    .forEach(g => {
      skuData.push([
        g.sku,
        g.articles.length,
        +g.totalAchat.toFixed(2),
        g.articles.join(', ')
      ]);
    });
  if (skuData.length > 1) {
    const ws4 = XLSX.utils.aoa_to_sheet(skuData);
    ws4['!cols'] = [{wch:22},{wch:18},{wch:18},{wch:60}];
    XLSX.utils.book_append_sheet(wb, ws4, 'Stock par SKU');
  }

  // ── Génération du fichier ──────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0,10);
  const suffix = CURRENT_BOUTIQUE ? `_${CURRENT_BOUTIQUE.nom.replace(/\s+/g,'_')}` : '';
  XLSX.writeFile(wb, `Laney_${date}${suffix}.xlsx`);
  toast('Export Excel téléchargé ✓', 'ok');
};

// ─── RADAR ────────────────────────────────────────────────────────────────────
function normStr(s) {
  return s.toLowerCase().replace(/[‘’ʼ`´]/g, "'");
}

let MARQUES = [];
let currentRadarId = null;
let radarEditMode = false;
let radarCategories = [];

function renderRadarCategoriesForm() {
  const container = document.getElementById('rn-categories-list');
  if (!radarCategories.length) { container.innerHTML = ''; return; }
  container.innerHTML = radarCategories.map((c, i) => `
    <div class="rn-cat-row">
      <input class="rn-cat-nom" type="text" value="${(c.nom||'').replace(/"/g,'&quot;')}" oninput="radarCategories[${i}].nom=this.value" placeholder="Ex : Jean slim">
      <input class="rn-cat-price" type="number" value="${c.pmin||''}" oninput="radarCategories[${i}].pmin=+this.value" placeholder="Min" min="0" inputmode="decimal">
      <span class="rn-cat-sep">–</span>
      <input class="rn-cat-price" type="number" value="${c.pmax||''}" oninput="radarCategories[${i}].pmax=+this.value" placeholder="Max" min="0" inputmode="decimal">
      <span class="rn-cat-unit">€</span>
      <button type="button" class="btn-remove-cat" onclick="removeRadarCategory(${i})">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
}

window.addRadarCategory = function() {
  radarCategories.push({ nom: '', pmin: '', pmax: '' });
  renderRadarCategoriesForm();
};

window.removeRadarCategory = function(i) {
  radarCategories.splice(i, 1);
  renderRadarCategoriesForm();
};

async function loadMarques() {
  try {
    const { data, error } = await sb.from('marques_niches').select('*').order('nom', { ascending: true });
    if (error) throw error;
    MARQUES = data || [];
  } catch(e) { MARQUES = []; }
}

function renderRadarGrid(items) {
  const grid = document.getElementById('radar-grid');
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state" style="padding:3rem">Aucune marque niche — clique sur "Ajouter une marque" pour commencer !</div>';
    return;
  }
  grid.innerHTML = items.map(m => {
    const stars = '⭐'.repeat(m.rarete || 4) + '<span style="opacity:.3">' + '⭐'.repeat(7 - (m.rarete || 4)) + '</span>';
    const found = D.filter(d => normStr(d.n).includes(normStr(m.nom)));
    const sold = found.filter(d => d.r !== null);
    const avgPv = sold.length > 0 ? sold.reduce((s, d) => s + (d.r - d.a), 0) / sold.length : null;
    return `<div class="radar-card" onclick="openRadarDetail(${m.id})">
      <div class="rc-header">
        <div>
          <div class="rc-name">${m.nom}</div>
          <div class="rc-cat">${m.categorie || '—'}</div>
        </div>
        <div class="rc-stars">${stars}</div>
      </div>
      ${(() => {
        const cats = m.categories;
        if (cats && cats.length) {
          return cats.slice(0,2).map(c => `<div class="rc-range"><span>${c.nom||'—'}</span><span>${c.pmin}–${c.pmax}€</span></div>`).join('') +
            (cats.length > 2 ? `<div class="rc-cat" style="margin-top:2px">+${cats.length-2} autre${cats.length-2>1?'s':''}</div>` : '');
        }
        return m.prix_min != null ? `<div class="rc-range">${m.prix_min}–${m.prix_max}€ <span class="rc-range-label">Vinted</span></div>` : '';
      })()}
      ${m.note ? `<div class="rc-note">${m.note}</div>` : ''}
      <div class="rc-footer">
        <span class="rc-found">Trouvé <strong>${found.length}×</strong>${avgPv !== null ? ' · moy. <strong>+' + avgPv.toFixed(0) + '€</strong>' : ''}</span>
        <button class="btn-action btn-action-del" onclick="event.stopPropagation();deleteMarque(${m.id})" title="Supprimer">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

window.filterRadar = function() {
  const q = document.getElementById('radar-search').value.toLowerCase();
  const stars = parseInt(document.getElementById('radar-filter-stars').value) || 0;
  let list = MARQUES;
  if (q) list = list.filter(m => m.nom.toLowerCase().includes(q) || (m.categorie||'').toLowerCase().includes(q) || (m.categories||[]).some(c => (c.nom||'').toLowerCase().includes(q)));
  if (stars) list = list.filter(m => (m.rarete || 4) === stars);
  renderRadarGrid(list);
};

window.openRadarDetail = function(id) {
  const m = MARQUES.find(x => x.id === id);
  if (!m) return;
  currentRadarId = id;
  document.getElementById('rd-name').textContent = m.nom;
  document.getElementById('rd-cat').textContent = m.categorie ? m.categorie + ' · ' + '⭐'.repeat(m.rarete||4) : '⭐'.repeat(m.rarete||4);
  document.getElementById('rd-note').textContent = m.note || 'Aucune note';
  document.getElementById('rd-note').style.display = m.note ? 'block' : 'none';

  const found = D.filter(d => normStr(d.n).includes(normStr(m.nom)));
  const sold = found.filter(d => d.r !== null);
  const avgPv = sold.length > 0 ? (sold.reduce((s,d) => s+(d.r-d.a),0)/sold.length).toFixed(0) : '—';
  const cats = m.categories;
  const prixLabel = cats && cats.length
    ? `${Math.min(...cats.map(c=>c.pmin))}–${Math.max(...cats.map(c=>c.pmax))}€`
    : (m.prix_min != null ? `${m.prix_min}–${m.prix_max}€` : '—');
  document.getElementById('rd-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Prix Vinted</div><div class="metric-value">${prixLabel}</div></div>
    <div class="metric"><div class="metric-label">Trouvé</div><div class="metric-value mv-green">${found.length}×</div></div>
    <div class="metric"><div class="metric-label">Moy. bénéfice</div><div class="metric-value mv-amber">${avgPv !== '—' ? '+'+avgPv+'€' : '—'}</div></div>`;

  const catsEl = document.getElementById('rd-categories');
  if (cats && cats.length) {
    catsEl.innerHTML = cats.map(c => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem .75rem;background:var(--bg3);border-radius:var(--radius-sm);margin-bottom:5px">
        <span style="font-size:13px;color:var(--text)">${c.nom || '—'}</span>
        <span style="font-size:13px;font-weight:500;font-family:'DM Mono',monospace;color:var(--text)">${c.pmin}–${c.pmax}€</span>
      </div>`).join('');
    catsEl.style.display = 'block';
  } else {
    catsEl.style.display = 'none';
  }

  document.getElementById('rd-history').innerHTML = found.length
    ? found.map(d => `<div class="bilan-top-item">
        <div class="bilan-top-rank" style="flex-shrink:0">${d.r !== null ? '✓' : '·'}</div>
        <div class="bilan-top-name">${d.n}</div>
        <span style="font-size:11px;color:var(--text3)">${d.da}</span>
        <div class="bilan-top-pv">${d.r !== null ? '+' + (d.r-d.a).toFixed(2)+'€' : 'En stock'}</div>
      </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Aucun article de cette marque trouvé</div>';

  document.getElementById('radar-detail').style.display = 'block';
  document.getElementById('radar-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.closeRadarDetail = function() {
  document.getElementById('radar-detail').style.display = 'none';
  currentRadarId = null;
};


window.openRadarAddModal = function() {
  radarEditMode = false;
  document.getElementById('rn-nom').value = '';
  document.getElementById('rn-cat').value = '';
  document.getElementById('rn-rarete').value = '4';
  document.getElementById('rn-note').value = '';
  radarCategories = [];
  renderRadarCategoriesForm();
  document.getElementById('radar-add-modal').classList.add('open');
  setTimeout(() => document.getElementById('rn-nom').focus(), 100);
};
window.closeRadarAddModal = function() { document.getElementById('radar-add-modal').classList.remove('open'); };

window.openRadarEditModal = function() {
  const m = MARQUES.find(x => x.id === currentRadarId);
  if (!m) return;
  radarEditMode = true;
  document.getElementById('rn-nom').value = m.nom;
  document.getElementById('rn-cat').value = m.categorie || '';
  document.getElementById('rn-rarete').value = m.rarete || 4;
  radarCategories = m.categories ? JSON.parse(JSON.stringify(m.categories))
    : (m.prix_min != null ? [{ nom: m.sous_categorie || '', pmin: m.prix_min, pmax: m.prix_max }] : []);
  renderRadarCategoriesForm();
  document.getElementById('rn-note').value = m.note || '';
  document.getElementById('radar-add-modal').classList.add('open');
};

window.saveRadarMarque = async function() {
  const nom = document.getElementById('rn-nom').value.trim();
  const validCats = radarCategories.filter(c => c.nom.trim() && c.pmin >= 0 && c.pmax >= 0);
  if (!nom || !validCats.length) { toast('Nom et au moins une catégorie avec prix requis', 'err'); return; }
  const btn = document.getElementById('btn-radar-save');
  btn.disabled = true;
  const payload = {
    nom,
    categorie: document.getElementById('rn-cat').value || null,
    sous_categorie: validCats[0].nom || null,
    categories: validCats,
    prix_min: Math.min(...validCats.map(c => c.pmin)),
    prix_max: Math.max(...validCats.map(c => c.pmax)),
    rarete: parseInt(document.getElementById('rn-rarete').value),
    note: document.getElementById('rn-note').value.trim() || null
  };
  try {
    if (radarEditMode && currentRadarId) {
      const { error } = await sb.from('marques_niches').update(payload).eq('id', currentRadarId);
      if (error) throw error;
      const idx = MARQUES.findIndex(m => m.id === currentRadarId);
      if (idx >= 0) MARQUES[idx] = { ...MARQUES[idx], ...payload };
      toast(`"${nom}" mis à jour`, 'ok');
      openRadarDetail(currentRadarId);
    } else {
      const { data, error } = await sb.from('marques_niches').insert([payload]).select().single();
      if (error) throw error;
      MARQUES.push(data);
      MARQUES.sort((a,b) => a.nom.localeCompare(b.nom));
      toast(`"${nom}" ajouté au Radar`, 'ok');
    }
    closeRadarAddModal();
    filterRadar();
  } catch(e) { toast('Erreur lors de la sauvegarde', 'err'); }
  finally { btn.disabled = false; }
};

window.deleteMarque = async function(id) {
  const m = MARQUES.find(x => x.id === id);
  if (!m) return;
  const ok = await showConfirm('Supprimer du Radar', `Supprimer <strong>${m.nom}</strong> de ton Radar ?<br><br>L'historique de tes trouvailles ne sera pas affecté.`);
  if (!ok) return;
  try {
    const { error } = await sb.from('marques_niches').delete().eq('id', id);
    if (error) throw error;
    MARQUES = MARQUES.filter(x => x.id !== id);
    if (currentRadarId === id) closeRadarDetail();
    filterRadar();
    toast(`"${m.nom}" supprimé`, 'ok');
  } catch(e) { toast('Erreur', 'err'); }
};

function checkRadarAlert(nom) {
  const match = MARQUES.find(m => normStr(nom).includes(normStr(m.nom)));
  const alert = document.getElementById('radar-alert');
  const alertText = document.getElementById('radar-alert-text');
  if (match && alert && alertText) {
    alertText.innerHTML = `Marque niche détectée : <strong>${match.nom}</strong> — fourchette Vinted estimée : <strong>${match.prix_min}–${match.prix_max}€</strong>. Ne bradez pas !`;
    alert.style.display = 'flex';
  } else if (alert) {
    alert.style.display = 'none';
  }
}

// ─── PROFILS & PERMISSIONS ───────────────────────────────────────────────────
async function loadUserProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    // JWT périmé ou invalide → déconnexion + rechargement propre
    await sb.auth.signOut();
    location.reload();
    return;
  }
  const { data: profile } = await sb.from('profiles').select('*').eq('user_id', user.id).single();
  if (!profile) {
    // Aucun profil = compte supprimé par l'admin → déconnexion + rechargement
    await sb.auth.signOut();
    sessionStorage.setItem('laney_auth_msg', 'Compte supprimé ou non autorisé.');
    location.reload();
    return;
  }
  USER_PROFILE = profile;
  applyPermissions();
}

function applyPermissions() {
  if (!USER_PROFILE) return;
  const perms = USER_PROFILE.permissions || ALL_TABS;
  const isAdmin = USER_PROFILE.is_admin;

  const adminBtn = document.getElementById('btn-admin');
  if (adminBtn) adminBtn.style.display = isAdmin ? '' : 'none';

  document.querySelectorAll('.tab[data-tab]').forEach(btn => {
    btn.style.display = (isAdmin || perms.includes(btn.dataset.tab)) ? '' : 'none';
  });

  if (!isAdmin && !perms.includes(currentTab)) {
    const first = ALL_TABS.find(t => perms.includes(t)) || 'overview';
    showTab(first);
  }
}

// ─── PANNEAU ADMIN ───────────────────────────────────────────────────────────
window.openAdminPanel = function () {
  document.getElementById('admin-panel').classList.add('open');
  loadAllProfiles();
};
window.closeAdminPanel = function () {
  document.getElementById('admin-panel').classList.remove('open');
};

async function loadAllProfiles() {
  const { data } = await sb.from('profiles').select('*').order('created_at');
  ALL_PROFILES = data || [];
  renderAdminUserList();
}

function renderAdminUserList() {
  const el = document.getElementById('admin-users-list');
  if (!ALL_PROFILES.length) { el.innerHTML = '<div class="admin-empty">Aucun profil trouvé.</div>'; return; }
  el.innerHTML = ALL_PROFILES.map(p => {
    const isSelf = p.user_id === USER_PROFILE?.user_id;
    const perms  = p.permissions || ALL_TABS;
    return `<div class="admin-user-card">
      <div class="admin-user-header">
        <div>
          <div class="admin-user-email">${p.email}</div>
          ${p.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
        </div>
        ${!isSelf ? `<label class="admin-toggle-wrap" title="Accorder/retirer le rôle Admin">
          <input type="checkbox" onchange="toggleAdmin('${p.user_id}', this.checked)" ${p.is_admin ? 'checked' : ''}>
          <span class="admin-toggle-label">Admin</span>
        </label>` : '<span class="admin-self-label">Vous</span>'}
      </div>
      <div class="admin-perm-grid">
        ${ALL_TABS.map(tab => `
          <label class="admin-perm-item${p.is_admin ? ' admin-perm-disabled' : ''}">
            <input type="checkbox"
              data-uid="${p.user_id}" data-tab="${tab}"
              ${perms.includes(tab) ? 'checked' : ''}
              ${p.is_admin ? 'disabled' : ''}
              onchange="updatePermissions('${p.user_id}')">
            <span>${TAB_LABELS[tab]}</span>
          </label>`).join('')}
      </div>
      ${!isSelf ? `<div class="admin-user-actions">
        <button class="btn-admin-action btn-admin-reset" onclick="togglePwdForm('${p.user_id}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="7" width="12" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11" r="1" fill="currentColor"/></svg>
          Modifier MDP
        </button>
        <button class="btn-admin-action btn-admin-delete" onclick="deleteUserAccount('${p.user_id}', '${p.email}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M6 4V2.5h4V4M5 4l.5 9h5l.5-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Supprimer le compte
        </button>
      </div>
      <div class="admin-pwd-form" id="pwd-form-${p.user_id}" style="display:none">
        <input type="password" id="pwd-input-${p.user_id}" class="admin-pwd-input" placeholder="Nouveau mot de passe (min. 6 car.)">
        <button class="btn-confirm-blue btn-admin-save-pwd" id="pwd-btn-${p.user_id}" onclick="savePwdChange('${p.user_id}', '${p.email}')">Enregistrer</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

window.toggleAdmin = async function (userId, isAdmin) {
  const { error } = await sb.from('profiles').update({ is_admin: isAdmin }).eq('user_id', userId);
  if (error) { toast('Erreur', 'err'); return; }
  const p = ALL_PROFILES.find(x => x.user_id === userId);
  if (p) p.is_admin = isAdmin;
  renderAdminUserList();
  toast(isAdmin ? 'Rôle Admin accordé' : 'Rôle Admin retiré', 'ok');
};

window.updatePermissions = async function (userId) {
  const checked = [...document.querySelectorAll(`input[data-uid="${userId}"][data-tab]`)]
    .filter(cb => cb.checked).map(cb => cb.dataset.tab);
  const { error } = await sb.from('profiles').update({ permissions: checked }).eq('user_id', userId);
  if (error) { toast('Erreur', 'err'); return; }
  const p = ALL_PROFILES.find(x => x.user_id === userId);
  if (p) p.permissions = checked;
  toast('Permissions sauvegardées', 'ok');
};

window.adminCreateUser = async function () {
  const email = document.getElementById('admin-new-email').value.trim();
  const pwd   = document.getElementById('admin-new-pwd').value.trim();
  const btn   = document.getElementById('btn-admin-create');
  if (!email || !pwd) { showAdminMsg('Remplis email et mot de passe', 'err'); return; }
  if (pwd.length < 6) { showAdminMsg('Mot de passe minimum 6 caractères', 'err'); return; }
  btn.disabled = true;
  try {
    const { data: { session: adminSession } } = await sb.auth.getSession();
    const { data: signUpData, error } = await sb.auth.signUp({ email, password: pwd });
    if (error) throw error;
    // Restore admin session if signUp changed it (email confirmation OFF)
    if (adminSession) {
      const { data: { session: cur } } = await sb.auth.getSession();
      if (!cur || cur.user.id !== adminSession.user.id)
        await sb.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token });
    }
    // Insert profile immediately so user appears in list without waiting for first login
    if (signUpData?.user?.id) {
      const newProf = { user_id: signUpData.user.id, email, is_admin: false, permissions: ALL_TABS };
      await sb.from('profiles').insert(newProf);
      ALL_PROFILES.push(newProf);
      renderAdminUserList();
    }
    document.getElementById('admin-new-email').value = '';
    document.getElementById('admin-new-pwd').value   = '';
    showAdminMsg(`Compte créé pour ${email}. L'utilisateur peut maintenant se connecter.`, 'ok');
  } catch (e) {
    showAdminMsg(e.message || 'Erreur lors de la création', 'err');
  } finally {
    btn.disabled = false;
  }
};

function showAdminMsg(msg, type) {
  const el = document.getElementById('admin-create-msg');
  el.innerHTML = `<div class="admin-msg admin-msg-${type}">${msg}</div>`;
  setTimeout(() => { if (el) el.innerHTML = ''; }, 5000);
}

window.deleteUserAccount = async function (userId, email) {
  const ok = await showConfirm(
    'Supprimer le compte',
    `Supprimer définitivement le compte de <strong>${email}</strong> ?<br><br>Cette action est irréversible — le compte sera supprimé de Supabase Auth.`
  );
  if (!ok) return;
  const { error } = await sb.rpc('admin_delete_user', { target_user_id: userId });
  if (error) { toast(error.message || 'Erreur lors de la suppression', 'err'); return; }
  ALL_PROFILES = ALL_PROFILES.filter(p => p.user_id !== userId);
  renderAdminUserList();
  toast(`Compte de ${email} supprimé`, 'ok');
};

window.togglePwdForm = function (userId) {
  const form = document.getElementById(`pwd-form-${userId}`);
  const isHidden = form.style.display === 'none' || !form.style.display;
  form.style.display = isHidden ? 'flex' : 'none';
  if (isHidden) document.getElementById(`pwd-input-${userId}`).focus();
};

window.savePwdChange = async function (userId, email) {
  const input = document.getElementById(`pwd-input-${userId}`);
  const btn   = document.getElementById(`pwd-btn-${userId}`);
  const pwd   = input.value.trim();
  if (pwd.length < 6) { toast('Mot de passe minimum 6 caractères', 'err'); return; }
  btn.disabled = true;
  const { error } = await sb.rpc('admin_update_password', { target_user_id: userId, new_password: pwd });
  btn.disabled = false;
  if (error) { toast(error.message || 'Erreur', 'err'); return; }
  input.value = '';
  document.getElementById(`pwd-form-${userId}`).style.display = 'none';
  toast(`Mot de passe modifié pour ${email}`, 'ok');
};

// ─── IMPORT SQL ───────────────────────────────────────────────────────────────
const IMPORT_TEMPLATE = `INSERT INTO articles (nom, prix_achat, date_achat, prix_revente, date_revente, categorie, sku, num_commande, grossiste, identifiant) VALUES\n('Veste Adidas', 5.00, '2025-06-01', 18.00, '2025-09-10', 'Vêtements', 'VEST-ADI-001', 'CMD-2024-001', 'Brocante', 'ABC123'),\n('Jean Levi''s 501', 3.50, '2025-06-15', NULL, NULL, 'Vêtements', NULL, NULL, 'Temu', NULL);`;

window.openImportModal = function () {
  const info = document.getElementById('import-boutique-info');
  if (CURRENT_BOUTIQUE) {
    info.textContent = `Les articles seront importés dans : ${CURRENT_BOUTIQUE.nom}`;
    info.className = 'import-info';
  } else {
    info.textContent = '⚠️ Mode All — les articles seront importés sans boutique assignée.';
    info.className = 'import-info warn';
  }
  document.getElementById('import-result').innerHTML = '';
  document.getElementById('import-modal').classList.add('open');
};

window.closeImportModal = function () {
  document.getElementById('import-modal').classList.remove('open');
};

window.copyImportTemplate = function () {
  navigator.clipboard.writeText(IMPORT_TEMPLATE);
  toast('Modèle copié', 'ok');
};

function parseSQLInsert(sql) {
  const clean = sql.replace(/--[^\n]*/g, '').trim();
  const colMatch = clean.match(/INSERT\s+INTO\s+articles\s*\(\s*([^)]+)\s*\)/i);
  if (!colMatch) throw new Error('Format invalide — attendu : INSERT INTO articles (...) VALUES ...');
  const columns = colMatch[1].split(',').map(c => c.trim().toLowerCase().replace(/[`"[\]]/g, ''));

  const valIdx = clean.search(/\bVALUES\b/i);
  if (valIdx === -1) throw new Error('Clause VALUES introuvable');
  const str = clean.slice(valIdx + 6).trim().replace(/;\s*$/, '');

  const rows = [];
  let pos = 0;

  while (pos < str.length) {
    while (pos < str.length && /[\s,]/.test(str[pos])) pos++;
    if (pos >= str.length || str[pos] !== '(') break;
    pos++;
    const vals = [];

    while (pos < str.length) {
      while (pos < str.length && /\s/.test(str[pos])) pos++;
      if (str[pos] === ')') { pos++; break; }

      if (str[pos] === "'") {
        pos++;
        let s = '';
        while (pos < str.length) {
          if (str[pos] === "'" && str[pos + 1] === "'") { s += "'"; pos += 2; }
          else if (str[pos] === "'") { pos++; break; }
          else s += str[pos++];
        }
        vals.push(s);
      } else if (/^null/i.test(str.slice(pos))) {
        vals.push(null); pos += 4;
      } else {
        let n = '';
        while (pos < str.length && /[0-9.\-]/.test(str[pos])) n += str[pos++];
        vals.push(n !== '' ? parseFloat(n) : null);
      }

      while (pos < str.length && /\s/.test(str[pos])) pos++;
      if (str[pos] === ',') pos++;
    }

    const obj = {};
    columns.forEach((col, i) => { obj[col] = i < vals.length ? vals[i] : null; });
    rows.push(obj);
  }

  if (!rows.length) throw new Error('Aucune ligne trouvée — vérifiez la syntaxe SQL');
  return rows;
}

function showImportResult(msg, type) {
  document.getElementById('import-result').innerHTML =
    `<div class="import-result-${type === 'ok' ? 'ok' : 'err'}">${msg}</div>`;
}

window.importSQL = async function () {
  const sql = document.getElementById('import-sql-input').value.trim();
  if (!sql) { showImportResult('Aucun SQL saisi', 'err'); return; }

  let parsed;
  try { parsed = parseSQLInsert(sql); }
  catch (e) { showImportResult(e.message, 'err'); return; }

  const invalid = parsed.filter(r => !r.nom || r.prix_achat == null || !r.date_achat);
  if (invalid.length) {
    showImportResult(`${invalid.length} ligne(s) sans nom, prix_achat ou date_achat — importation annulée`, 'err'); return;
  }

  // Vérifie la cohérence SKU→ID : un même ID ne peut être lié qu'à un seul SKU
  const skuRefMap = buildSkuRefMap();
  for (const r of parsed) {
    if (!r.identifiant) continue;
    const sku = r.sku || null;
    const existing = D.find(d => d.ref === r.identifiant && d.sku !== sku);
    if (existing) {
      showImportResult(`ID "${r.identifiant}" est déjà lié au SKU "${existing.sku}" — importation annulée`, 'err'); return;
    }
    if (sku && skuRefMap[sku] && skuRefMap[sku] !== r.identifiant) {
      showImportResult(`SKU "${sku}" est déjà lié à l'ID "${skuRefMap[sku]}" — utilisez cet ID ou laissez le champ vide`, 'err'); return;
    }
  }

  const btn = document.getElementById('btn-import-confirm');
  btn.disabled = true;
  try {
    const rows = parsed.map(r => ({
      nom: r.nom,
      prix_achat: r.prix_achat,
      date_achat: r.date_achat,
      prix_revente: r.prix_revente != null ? r.prix_revente : null,
      date_revente: r.date_revente || null,
      categorie: r.categorie || null,
      sku: r.sku || null,
      num_commande: r.num_commande || null,
      grossiste: r.grossiste || null,
      identifiant: r.identifiant || null,
      boutique_id: CURRENT_BOUTIQUE ? CURRENT_BOUTIQUE.id : null,
    }));

    const { data: inserted, error } = await sb.from('articles').insert(rows).select('*');
    if (error) throw error;
    if (inserted) inserted.forEach(row => D.push(normalize(row)));

    document.getElementById('import-sql-input').value = '';
    refreshCurrentPanel();
    const n = inserted.length;
    showImportResult(`${n} article${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''} avec succès`, 'ok');
    toast(`${n} article${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`, 'ok');
  } catch (e) {
    showImportResult(`Erreur : ${e.message || 'inconnue'}`, 'err');
  } finally {
    btn.disabled = false;
  }
};
