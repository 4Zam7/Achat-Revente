// ─── SUPABASE CONFIG ───────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dqsrqdmbqlyvwhfrdjvk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc3JxZG1icWx5dndoZnJkanZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDY2NTMsImV4cCI6MjA5MzQ4MjY1M30.JNl6up-Nn49rT9m9XXEqvd3e0dkDhgFh1-02vmyIR7g';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ──────────────────────────────────────────────────────────────────
let D = [];
let sellId = null;
let currentTab = 'overview';
const charts = {};

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
  await Promise.all([loadData(), loadGoal()]);
  hideLoading();
  buildOverview();
  setupRealtimeSync();
  document.getElementById('f-date').value = today();
}

async function loadData() {
  setSyncStatus('syncing');
  try {
    const { data, error } = await sb.from('articles').select('*').order('created_at', { ascending: true });
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
  refreshCurrentPanel();
};

function refreshCurrentPanel() {
  if (currentTab === 'overview') buildOverview();
  else if (currentTab === 'monthly') buildMonthly();
  else if (currentTab === 'items') renderItems(D);
  else if (currentTab === 'stock') buildStock();
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
  renderItems(D.filter(d => d.n.toLowerCase().includes(q)));
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
  if (!nom || isNaN(achat) || achat < 0 || !date) { toast('Remplis tous les champs', 'err'); return; }

  const btn = document.getElementById('btn-add-confirm');
  btn.disabled = true;

  try {
    const cat = document.getElementById('f-cat').value;
    const { error } = await sb.from('articles').insert([{ nom, prix_achat: achat, date_achat: date, categorie: cat || null }]);
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
  if (!it || !confirm(`Supprimer "${it.n}" ?`)) return;
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
  if (!it || !confirm(`Annuler la vente de "${it.n}" ?`)) return;
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
  if (e.key === 'Escape') { closeAddModal(); closeSellModal(); closeEditModal(); closeGoalModal(); }
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

async function loadGoal() {
  try {
    const { data } = await sb.from('settings').select('value').eq('key', 'monthly_goal').single();
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
    await sb.from('settings').upsert({ key: 'monthly_goal', value: String(val) });
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

// ─── REFRESH ─────────────────────────────────────────────────────────────────
window.refreshApp = async function () {
  const btn = document.querySelector(".btn-refresh-header");
  if (btn) btn.classList.add("spinning");
  await loadData();
  refreshCurrentPanel();
  if (btn) setTimeout(() => btn.classList.remove("spinning"), 600);
  toast("Données actualisées", "ok");
};
