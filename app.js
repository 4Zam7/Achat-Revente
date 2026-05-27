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

// ─── AUTH ────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    showApp();
  } else {
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    setTimeout(() => document.getElementById('email-input').focus(), 300);
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
  await Promise.all([loadData(), loadGoal(), loadMarques()]);
  hideLoading();
  buildOverview();
  setupRealtimeSync();
  document.getElementById('f-date').value = today();
}

async function loadData() {
  setSyncStatus('syncing');
  try {
    let query = sb.from('articles').select('*').order('created_at', { ascending: true });
    if (CURRENT_BOUTIQUE) query = query.eq('boutique_id', CURRENT_BOUTIQUE.id);
    const { data, error } = await query;
    if (error) throw error;
    D = data.map(normalize);
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
    cat: row.categorie || '',
    boutique_id: row.boutique_id,
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
  else refreshCurrentPanel();
};

function refreshCurrentPanel() {
  if (currentTab === 'overview') buildOverview();
  else if (currentTab === 'monthly') buildMonthly();
  else if (currentTab === 'items') renderItems(D);
  else if (currentTab === 'stock') buildStock();
  else if (currentTab === 'bilan') buildBilanSelectors();
  else if (currentTab === 'radar') filterRadar();
}

// ─── STATS ───────────────────────────────────────────────────────────────────
function stats() {
  const sold = D.filter(d => d.r !== null);
  const stock = D.filter(d => d.r === null);
  const totalRevente = sold.reduce((s, d) => s + d.r, 0);
  const coutVendus = sold.reduce((s, d) => s + d.a, 0);
  const benefice = totalRevente - coutVendus;
  const roi = coutVendus > 0 ? (benefice / coutVendus) * 100 : 0;
  const capitalStock = stock.reduce((s, d) => s + d.a, 0);
  const totalAchat = D.reduce((s, d) => s + d.a, 0);
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
  "Livres":"#6DC8EC","Sport":"#FF85C2","Autres":"#9B9890"
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
}

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
    document.getElementById('items-body').innerHTML = `<tr><td colspan="6" class="empty-state">Aucun article trouvé</td></tr>`;
    return;
  }
  document.getElementById('items-body').innerHTML = items.map(d => {
    const pv = d.r !== null ? d.r - d.a : null;
    const m = d.r !== null && d.a > 0 ? d.r / d.a : null;
    let pvHtml = '—';
    if (pv !== null) { pvHtml = `<span class="${pv >= 0 ? 'pv-pos' : 'pv-neg'}">${pv >= 0 ? '+' : ''}${pv.toFixed(2)}€</span>`; }
    const catBadge = d.cat ? `<span class="badge-cat">${d.cat}</span>` : '—';
    const actionBtns = d.r === null
      ? `<button class="btn-action btn-action-sell" onclick="openSellModal(${d.id})">
           <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
           Vendu
         </button>
         <button class="btn-action btn-action-del" onclick="delItem(${d.id})" title="Supprimer">
           <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
         </button>`
      : `<button class="btn-action btn-action-cancel" onclick="cancelSell(${d.id})">
           <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M10 4A5 5 0 1 0 10 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 1v3H7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
           Annuler
         </button>
         <button class="btn-action btn-action-del" onclick="delItem(${d.id})" title="Supprimer">
           <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
         </button>`;
    return `<tr>
      <td class="td-name td-clickable" title="Cliquer pour modifier" onclick="openEditModal(${d.id})">${d.n}</td>
      <td>${catBadge}</td>
      <td class="td-num">${d.a.toFixed(2)}€</td>
      <td class="td-num">${d.r !== null ? d.r.toFixed(2) + '€' : '<span class="td-empty">—</span>'}</td>
      <td class="td-num">${pvHtml}</td>
      <td>${d.r !== null ? '<span class="badge b-green">Vendu</span>' : '<span class="badge b-amber">Stock</span>'}</td>
      <td class="td-actions">${actionBtns}</td>
    </tr>`;
  }).join('');
}

window.filterTable = function () {
  const q = document.getElementById('srch').value.toLowerCase();
  const statut = document.getElementById('f-statut').value;
  const cat = document.getElementById('f-categorie').value;
  const tri = document.getElementById('f-tri').value;

  let items = D.filter(d => {
    if (q && !d.n.toLowerCase().includes(q)) return false;
    if (statut === 'stock' && d.r !== null) return false;
    if (statut === 'vendu' && d.r === null) return false;
    if (cat && d.cat !== cat) return false;
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
  const hasFilter = q || statut || cat || tri !== 'default';
  countEl.textContent = hasFilter ? `${items.length} article${items.length > 1 ? 's' : ''}` : '';

  renderItems(items);
};

window.resetFilters = function () {
  document.getElementById('srch').value = '';
  document.getElementById('f-statut').value = '';
  document.getElementById('f-categorie').value = '';
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
}

// ─── ADD ARTICLE ─────────────────────────────────────────────────────────────
window.openAddModal = function () {
  document.getElementById('f-nom').value = '';
  const alertEl = document.getElementById('radar-alert'); if(alertEl) alertEl.style.display='none';
  document.getElementById('f-achat').value = '';
  document.getElementById('f-date').value = today();
  document.getElementById('f-cat').value = '';
  document.getElementById('add-modal').classList.add('open');
  setTimeout(() => document.getElementById('f-nom').focus(), 100);
};
window.closeAddModal = function () { document.getElementById('add-modal').classList.remove('open'); };

window.addArticle = async function () {
  const nom = document.getElementById('f-nom').value.trim();
  const achat = parseFloat(document.getElementById('f-achat').value);
  const date = document.getElementById('f-date').value;
  const cat = document.getElementById('f-cat').value;
  if (!nom || isNaN(achat) || achat < 0 || !date) { toast('Remplis tous les champs', 'err'); return; }

  const btn = document.getElementById('btn-add-confirm');
  btn.disabled = true;

  try {
    const { error } = await sb.from('articles').insert([{ nom, prix_achat: achat, date_achat: date, categorie: cat || null, boutique_id: CURRENT_BOUTIQUE ? CURRENT_BOUTIQUE.id : null }]);
    if (error) throw error;
    const inserted = await sb.from('articles').select('*').eq('nom', nom).eq('date_achat', date).order('created_at', { ascending: false }).limit(1).single();
    if (inserted.data) D.push(normalize(inserted.data));
    closeAddModal();
    refreshCurrentPanel();
    toast(`"${nom}" ajouté au stock`, 'ok');
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
  document.getElementById('m-date').value = today();
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
  const ok = await showConfirm('Annuler la vente', `Remettre <strong>${it.n}</strong> en stock ?<br><br>Les informations de vente seront effacées.`);
  if (!ok) return;
  try {
    const { error } = await sb.from("articles").update({ prix_revente: null, date_revente: null }).eq("id", id);
    if (error) throw error;
    const item = D.find(d => d.id === id);
    if (item) { item.r = null; item.dr = null; }
    refreshCurrentPanel();
    toast(`Vente de "${it.n}" annulée`, "ok");
  } catch (e) {
    toast("Erreur lors de l'annulation", "err");
  }
};


// ─── EDIT ARTICLE ─────────────────────────────────────────────────────────────
let editId = null;

window.openEditModal = function (id) {
  editId = id;
  const it = D.find(d => d.id === id);
  document.getElementById('e-nom').value = it.n;
  document.getElementById('e-cat').value = it.cat || '';
  document.getElementById('e-achat').value = it.a;
  document.getElementById('e-date-achat').value = it.da;
  document.getElementById('e-vente').value = it.r !== null ? it.r : '';
  document.getElementById('e-date-vente').value = it.dr || '';
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
  if (!nom || isNaN(achat) || !dateAchat) { toast('Nom, prix et date achat requis', 'err'); return; }
  const vente = venteVal !== '' ? parseFloat(venteVal) : null;
  const btn = document.getElementById('btn-edit-confirm');
  btn.disabled = true;
  try {
    const { error } = await sb.from('articles').update({
      nom,
      categorie: cat || null,
      prix_achat: achat,
      date_achat: dateAchat,
      prix_revente: vente,
      date_revente: (vente !== null && dateVente) ? dateVente : null,
    }).eq('id', editId);
    if (error) throw error;
    const item = D.find(d => d.id === editId);
    if (item) { item.n = nom; item.cat = cat || ''; item.a = achat; item.da = dateAchat; item.r = vente; item.dr = (vente !== null && dateVente) ? dateVente : null; }
    closeEditModal();
    refreshCurrentPanel();
    toast(`"${nom}" modifié`, 'ok');
  } catch (e) {
    toast('Erreur lors de la modification', 'err');
  } finally {
    btn.disabled = false;
  }
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
document.getElementById('edit-modal').addEventListener('click', function (e) { if (e.target === this) closeEditModal(); });
document.getElementById('goal-modal').addEventListener('click', function (e) { if (e.target === this) closeGoalModal(); });

// Close modals on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAddModal(); closeSellModal(); closeEditModal(); closeGoalModal(); closeNewBoutiqueModal(); closeRadarAddModal(); closeConfirm(false); document.getElementById('global-results').classList.remove('open'); }
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
  return CURRENT_BOUTIQUE ? `monthly_goal_${CURRENT_BOUTIQUE.id}` : 'monthly_goal';
}

async function loadGoal() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', goalKey()).single();
    cachedGoal = data ? parseFloat(data.value) || 0 : 0;
  } catch(e) {
    cachedGoal = 0;
  }
}

function buildGoal() {
  const goal = cachedGoal;
  const current = getCurrentMonthRevenue();
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const pctReal = goal > 0 ? (current / goal) * 100 : 0;

  document.getElementById('goal-month-label').textContent = getMonthLabel();
  document.getElementById('goal-current').textContent = current.toFixed(0) + '€';
  document.getElementById('goal-target-display').textContent = goal > 0 ? goal.toFixed(0) + '€' : 'Non défini';

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
async function loadBoutiques() {
  try {
    const { data, error } = await sb.from('boutiques').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    BOUTIQUES = data;
    if (!CURRENT_BOUTIQUE && BOUTIQUES.length > 0) {
      const saved = localStorage.getItem('ar_boutique_id');
      CURRENT_BOUTIQUE = BOUTIQUES.find(b => b.id === parseInt(saved)) || BOUTIQUES[0];
    }
    renderBoutiqueToggle();
  } catch(e) {
    console.error('Erreur boutiques', e);
  }
}

function renderBoutiqueToggle() {
  const html = BOUTIQUES.map(b => `
    <button class="btq-pill ${CURRENT_BOUTIQUE && b.id === CURRENT_BOUTIQUE.id ? 'active' : ''}"
      onclick="switchBoutique(${b.id})">
      ${b.nom}
    </button>
  `).join('') + `<button class="btq-pill btq-add" onclick="openNewBoutiqueModal()" title="Nouvelle boutique">+</button>`;
  const c1 = document.getElementById('boutique-toggle');
  const c2 = document.getElementById('mobile-boutique-toggle');
  if (c1) c1.innerHTML = html;
  if (c2) c2.innerHTML = html;
}

window.switchBoutique = async function(id) {
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
    closeNewBoutiqueModal();
    await switchBoutique(data.id);
    toast(`Boutique "${nom}" créée`, 'ok');
  } catch(e) {
    toast('Erreur lors de la création', 'err');
  } finally {
    btn.disabled = false;
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
  const recettes = sold.reduce((s, d) => s + d.r, 0);
  const coutVendus = sold.reduce((s, d) => s + d.a, 0);
  const benefice = recettes - coutVendus;
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
          ${d.cat ? `<div class="bilan-achat-cat">${d.cat}</div>` : ''}
          <div class="bilan-achat-price">${d.a.toFixed(2)}€</div>
          ${d.r !== null ? `<span class="badge b-green" style="margin-left:6px;font-size:10px">Vendu</span>` : `<span class="badge b-amber" style="margin-left:6px;font-size:10px">Stock</span>`}
        </div>`).join('')
    : '<div class="empty-state">Aucun article acheté ce mois</div>';
};

window.buildBilanYear = function() {
  const year = document.getElementById('bilan-year-select').value;
  if (!year) return;

  const sold = D.filter(d => d.r !== null && d.dr && d.dr.startsWith(year));
  const bought = D.filter(d => d.da && d.da.startsWith(year));
  const recettes = sold.reduce((s, d) => s + d.r, 0);
  const coutVendus = sold.reduce((s, d) => s + d.a, 0);
  const benefice = recettes - coutVendus;
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
};


// ─── RECHERCHE GLOBALE ────────────────────────────────────────────────────────
window.doGlobalSearch = function () {
  const q = document.getElementById('global-search').value.trim().toLowerCase();
  const container = document.getElementById('global-results');

  if (!q) { container.classList.remove('open'); container.innerHTML = ''; return; }

  const results = D.filter(d => d.n.toLowerCase().includes(q));
  container.classList.add('open');

  if (!results.length) {
    container.innerHTML = `<div class="search-empty">Aucun résultat pour "${q}"</div>`;
    return;
  }

  container.innerHTML = `
    <div class="search-result-label">${results.length} résultat${results.length > 1 ? 's' : ''}</div>
    ${results.slice(0, 8).map(d => {
      const pv = d.r !== null ? +(d.r - d.a).toFixed(2) : null;
      return `<div class="search-result-item" onclick="goToItem(${d.id})">
        <div class="sri-icon ${d.r !== null ? 'sri-sold' : 'sri-stock'}" style="flex-shrink:0">${d.r !== null ? '✓' : '·'}</div>
        <div style="flex:1;min-width:0">
          <div class="sri-name">${d.n}</div>
          <div class="sri-meta">
            <span class="sri-cat">${d.cat || '—'}</span>
            <span class="sri-price">${d.a.toFixed(2)}€${d.r !== null ? ' → ' + d.r.toFixed(2) + '€' : ''}</span>
            ${pv !== null ? `<span class="sri-pv">+${pv}€</span>` : ''}
            <span class="badge ${d.r !== null ? 'b-green' : 'b-amber'}">${d.r !== null ? 'Vendu' : 'Stock'}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
    ${results.length > 8 ? `<div class="search-empty">+ ${results.length - 8} autres — affinez la recherche</div>` : ''}
  `;
};


window.doMobileSearch = function () {
  const q = document.getElementById('mobile-search').value.trim().toLowerCase();
  const container = document.getElementById('mobile-results');
  if (!q) { container.classList.remove('open'); container.innerHTML = ''; return; }

  const results = D.filter(d => d.n.toLowerCase().includes(q));
  container.classList.add('open');

  if (!results.length) {
    container.innerHTML = `<div class="search-empty">Aucun résultat pour "${q}"</div>`;
    return;
  }

  container.innerHTML = `
    <div class="search-result-label">${results.length} résultat${results.length > 1 ? 's' : ''}</div>
    ${results.slice(0, 8).map(d => {
      const pv = d.r !== null ? +(d.r - d.a).toFixed(2) : null;
      return `<div class="search-result-item" onclick="goToItemMobile(${d.id})">
        <div class="sri-icon ${d.r !== null ? 'sri-sold' : 'sri-stock'}" style="flex-shrink:0">${d.r !== null ? '✓' : '·'}</div>
        <div style="flex:1;min-width:0">
          <div class="sri-name">${d.n}</div>
          <div class="sri-meta">
            <span class="sri-cat">${d.cat || '—'}</span>
            <span class="sri-price">${d.a.toFixed(2)}€${d.r !== null ? ' → ' + d.r.toFixed(2) + '€' : ''}</span>
            ${pv !== null ? `<span class="sri-pv">+${pv}€</span>` : ''}
            <span class="badge ${d.r !== null ? 'b-green' : 'b-amber'}">${d.r !== null ? 'Vendu' : 'Stock'}</span>
          </div>
        </div>
      </div>`;
    }).join('')}
    ${results.length > 8 ? `<div class="search-empty">+ ${results.length - 8} autres — affinez la recherche</div>` : ''}
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

function showConfirm(title, body) {
  return new Promise(resolve => {
    confirmResolve = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').innerHTML = body;
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

  // ── Feuille 1 : Tous les articles ──────────────────────────────────────────
  const articlesData = [
    ['ID', 'Nom', 'Catégorie', 'Prix achat (€)', 'Date achat', 'Prix vente (€)', 'Date vente', 'Plus-value (€)', 'Multiplicateur', 'Statut']
  ];
  D.forEach(d => {
    const pv = d.r !== null ? +(d.r - d.a).toFixed(2) : '';
    const mult = d.r !== null && d.a > 0 ? +(d.r / d.a).toFixed(2) : '';
    articlesData.push([
      d.id, d.n, d.cat || '', d.a, d.da,
      d.r !== null ? d.r : '', d.dr || '',
      pv, mult,
      d.r !== null ? 'Vendu' : 'En stock'
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(articlesData);
  ws1['!cols'] = [
    {wch:6},{wch:32},{wch:16},{wch:14},{wch:12},
    {wch:14},{wch:12},{wch:14},{wch:13},{wch:10}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Articles');

  // ── Feuille 2 : Résumé global ──────────────────────────────────────────────
  const s = stats();
  const resumeData = [
    ['📊 RÉSUMÉ GLOBAL', ''],
    ['Date export', new Date().toLocaleDateString('fr-FR')],
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
      if (!mm[k]) mm[k] = { vendus: 0, recettes: 0, cout: 0, achetes: 0, montantAchete: 0 };
      mm[k].vendus++; mm[k].recettes += d.r; mm[k].cout += d.a;
    }
    if (d.da) {
      const ka = d.da.slice(0,7);
      if (!mm[ka]) mm[ka] = { vendus: 0, recettes: 0, cout: 0, achetes: 0, montantAchete: 0 };
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

  // ── Génération du fichier ──────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Laney_backup_${date}.xlsx`);
  toast('Export Excel téléchargé ✓', 'ok');
};

// ─── RADAR ────────────────────────────────────────────────────────────────────
let MARQUES = [];
let currentRadarId = null;
let radarEditMode = false;

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
    const stars = '⭐'.repeat(m.rarete || 2) + '<span style="opacity:.3">' + '⭐'.repeat(3 - (m.rarete || 2)) + '</span>';
    const found = D.filter(d => d.n.toLowerCase().includes(m.nom.toLowerCase()));
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
      <div class="rc-range">${m.prix_min}–${m.prix_max}€ <span class="rc-range-label">Vinted</span></div>
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
  renderRadarGrid(q ? MARQUES.filter(m => m.nom.toLowerCase().includes(q) || (m.categorie||'').toLowerCase().includes(q)) : MARQUES);
};

window.openRadarDetail = function(id) {
  const m = MARQUES.find(x => x.id === id);
  if (!m) return;
  currentRadarId = id;
  document.getElementById('rd-name').textContent = m.nom;
  document.getElementById('rd-cat').textContent = (m.categorie || '') + ' · ' + '⭐'.repeat(m.rarete||2);
  document.getElementById('rd-note').textContent = m.note || 'Aucune note';
  document.getElementById('rd-note').style.display = m.note ? 'block' : 'none';

  const found = D.filter(d => d.n.toLowerCase().includes(m.nom.toLowerCase()));
  const sold = found.filter(d => d.r !== null);
  const avgPv = sold.length > 0 ? (sold.reduce((s,d) => s+(d.r-d.a),0)/sold.length).toFixed(0) : '—';
  document.getElementById('rd-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Prix Vinted</div><div class="metric-value">${m.prix_min}–${m.prix_max}€</div></div>
    <div class="metric"><div class="metric-label">Trouvé</div><div class="metric-value mv-green">${found.length}×</div></div>
    <div class="metric"><div class="metric-label">Moy. bénéfice</div><div class="metric-value mv-amber">${avgPv !== '—' ? '+'+avgPv+'€' : '—'}</div></div>`;

  document.getElementById('rd-calc-input').value = 5;
  updateCalc();

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

window.updateCalc = function() {
  const m = MARQUES.find(x => x.id === currentRadarId);
  if (!m) return;
  const achat = parseFloat(document.getElementById('rd-calc-input').value) || 0;
  const minPv = (m.prix_min - achat).toFixed(0);
  const maxPv = (m.prix_max - achat).toFixed(0);
  document.getElementById('rd-calc-result').textContent = `+${minPv} à +${maxPv}€`;
};

window.openRadarAddModal = function() {
  radarEditMode = false;
  document.getElementById('rn-nom').value = '';
  document.getElementById('rn-cat').value = '';
  document.getElementById('rn-rarete').value = '2';
  document.getElementById('rn-pmin').value = '';
  document.getElementById('rn-pmax').value = '';
  document.getElementById('rn-note').value = '';
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
  document.getElementById('rn-rarete').value = m.rarete || 2;
  document.getElementById('rn-pmin').value = m.prix_min;
  document.getElementById('rn-pmax').value = m.prix_max;
  document.getElementById('rn-note').value = m.note || '';
  document.getElementById('radar-add-modal').classList.add('open');
};

window.saveRadarMarque = async function() {
  const nom = document.getElementById('rn-nom').value.trim();
  const pmin = parseFloat(document.getElementById('rn-pmin').value);
  const pmax = parseFloat(document.getElementById('rn-pmax').value);
  if (!nom || isNaN(pmin) || isNaN(pmax)) { toast('Nom et prix requis', 'err'); return; }
  const btn = document.getElementById('btn-radar-save');
  btn.disabled = true;
  const payload = {
    nom, categorie: document.getElementById('rn-cat').value.trim() || null,
    rarete: parseInt(document.getElementById('rn-rarete').value),
    prix_min: pmin, prix_max: pmax,
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
  const match = MARQUES.find(m => nom.toLowerCase().includes(m.nom.toLowerCase()));
  const alert = document.getElementById('radar-alert');
  const alertText = document.getElementById('radar-alert-text');
  if (match && alert && alertText) {
    alertText.innerHTML = `Marque niche détectée : <strong>${match.nom}</strong> — fourchette Vinted estimée : <strong>${match.prix_min}–${match.prix_max}€</strong>. Ne bradez pas !`;
    alert.style.display = 'flex';
  } else if (alert) {
    alert.style.display = 'none';
  }
}
