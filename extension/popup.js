import { login, logout, isLoggedIn, currentEmail } from './lib/supabase.js';
import {
  getState, saveSettings, setAccountBoutique, fetchBoutiques, processPending, applyEvent,
  setEventStatus, reclassifyOld, diagnostic, resetEvents, missing, cleanup, removeAccount, undoEvent,
} from './lib/sync.js';

const LANEY_URL = 'https://achat-revente-sigma.vercel.app';
const FULL = new URLSearchParams(location.search).get('view') === 'tab';
if (FULL) document.body.classList.add('full');

const FIELD = { created: 'article créé', prix_revente: 'prix', date_revente: 'date de vente', client: 'client', date_encaissement: 'encaissement' };
const fieldsText = list => [...new Set(list.filter(f => f !== 'date_revente' || !list.includes('prix_revente')))].map(f => FIELD[f]).join(', ');

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => (n != null ? Number(n).toFixed(2).replace('.', ',') + ' €' : '—');
const fr = d => (d ? d.split('-').reverse().join('/') : '');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), 2600);
}

// ─── ÉTAT DE L'INTERFACE ────────────────────────────────────────────────────
let STATE = null;
let BOUTIQUES = null;
let ACCOUNTS = {};
let FILTER = 'all';
let SEARCH = '';
const pref = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  ['pending', 'history', 'settings'].forEach(p => { $(`panel-${p}`).hidden = p !== name; });
  pref.set('laney-tab', name);
}

// ─── RENDU ──────────────────────────────────────────────────────────────────
async function render() {
  const logged = await isLoggedIn();
  $('login').hidden = logged;
  $('main').hidden = !logged;
  $('btn-sync').hidden = !logged;
  if (!logged) { $('status-line').textContent = 'Non connecté'; $('email').focus(); return; }

  STATE = await getState();
  const { settings, stats } = STATE;
  ACCOUNTS = settings.accounts;
  await loadBoutiques();

  $('stat-pending').textContent = stats.pending;
  $('stat-sales').textContent = stats.sales;
  $('stat-cash').textContent = stats.cash;
  $('pending-count').textContent = stats.pending || '';
  $('start-date').value = settings.startDate;
  $('auto').checked = settings.auto;
  renderStatus(settings);
  renderAccounts(settings.accounts);
  renderPending();
  renderHistory();
}

function renderStatus(settings) {
  const ids = Object.keys(settings.accounts);
  const unset = ids.filter(id => !settings.accounts[id].boutiqueId);
  $('settings-alert').hidden = !(unset.length || !ids.length);
  if (!ids.length) { $('status-line').textContent = 'Aucun compte Vinted détecté'; return; }
  if (unset.length) { $('status-line').innerHTML = `<span class="amber">${unset.length} compte(s) sans boutique</span>`; return; }
  const parts = ids.map(id => `${accountName(id)} → ${boutiqueName(settings.accounts[id].boutiqueId)}`);
  $('status-line').innerHTML = `<span class="ok">●</span> ${esc(parts.join(' · '))}`;
}

async function loadBoutiques() {
  if (BOUTIQUES) return;
  try { BOUTIQUES = await fetchBoutiques(); } catch (e) { toast(e.message, true); }
}
const boutiqueName = id => ((BOUTIQUES || []).find(b => b.id === id) || {}).nom || '—';

const accountName = id => {
  if (id === 'unknown') return 'Compte non identifié';
  const a = ACCOUNTS[id] || {};
  return a.login ? a.login : `Compte n°${id}`;
};

function renderAccounts(accounts) {
  const ids = Object.keys(accounts);
  $('accounts').innerHTML = ids.length
    ? ids.map(id => `
        <div class="acc">
          <span class="acc-name">${esc(accountName(id))}<small>ID Vinted ${esc(id)}</small></span>
          <select data-account="${esc(id)}" class="${accounts[id].boutiqueId ? '' : 'unset'}">
            <option value="">— Choisir la boutique —</option>
            ${(BOUTIQUES || []).map(b => `<option value="${b.id}" ${b.id === accounts[id].boutiqueId ? 'selected' : ''}>${esc(b.nom)}</option>`).join('')}
          </select>
          <button class="link-btn" data-remove="${esc(id)}" title="Retirer ce compte de la liste">✕</button>
        </div>`).join('')
    : '<div class="muted">Ouvre un onglet Vinted où tu es connecté : ton compte apparaîtra ici pour choisir sa boutique.</div>';
}

const TYPE = { sale: ['sale', 'Vente'], cash: ['cash', 'Encaissement'] };

const clientChip = name => (name
  ? `<button class="client" data-copy="${esc(name)}" title="Copier « ${esc(name)} »">${esc(name)}</button>`
  : '<span class="client none">—</span>');

function articleLabel(ev, { article: a, score }) {
  const bits = [a.nom];
  if (a.taille) bits.push(a.taille);
  if (a.sku) bits.push(a.sku);
  bits.push(a.prix_revente != null ? `vendu ${eur(a.prix_revente)} le ${fr(a.date_revente)}` : a.date_achat ? `acheté le ${fr(a.date_achat)}` : 'en stock');
  const todo = missing(ev, a);
  if (a.prix_revente != null || ev.type === 'cash') bits.push(todo.length ? `→ ajoute ${fieldsText(todo)}` : '→ déjà complet');
  return (score >= 0.95 ? '★ ' : '') + bits.join(' · ');
}

function renderPending() {
  const list = STATE.pending;
  $('pending').innerHTML = list.length
    ? list.map(pendingHTML).join('')
    : `<div class="empty"><b>Tout est à jour ✓</b>Les ventes à confirmer apparaîtront ici.</div>`;
}

function pendingHTML({ ev, boutiqueId, candidates, create }) {
  const [cls, label] = TYPE[ev.type];
  const hasStock = candidates.some(c => c.article.prix_revente == null && c.score >= 0.95);
  const createOpt = create
    ? `<option value="new:${create.id}">➕ Créer un nouvel exemplaire de « ${esc(create.nom)} »${create.identifiant ? ` (ID ${esc(create.identifiant)})` : ''}</option>`
    : '';
  // Sans stock correspondant, la création est proposée en premier
  const options = (hasStock ? '' : createOpt)
    + candidates.map(c => `<option value="${c.article.id}">${esc(articleLabel(ev, c))}</option>`).join('')
    + (hasStock ? createOpt : '');
  const empty = !boutiqueId
    ? 'Associe ce compte Vinted à une boutique (onglet Réglages).'
    : ev.type === 'sale' ? 'Aucun article en stock correspondant dans cette boutique.' : 'Aucun article vendu correspondant dans cette boutique.';
  return `
    <div class="card" data-key="${esc(ev.key)}">
      <div class="card-head">
        <span class="tag ${cls}">${label}</span>
        <span class="card-title">${esc(ev.title || 'Sans titre')}</span>
        <span class="card-price">${eur(ev.amount)}</span>
      </div>
      <div class="card-meta">
        <span>${fr(ev.date)}</span><span>·</span><span>${esc(accountName(ev.accountId || 'unknown'))}</span>
        ${ev.buyer ? `<span>·</span>${clientChip(ev.buyer)}` : ''}
      </div>
      ${ev.note ? `<div class="card-note">${esc(ev.note)}</div>` : ''}
      ${options ? `<select class="ev-select">${options}</select>` : `<div class="empty">${empty}</div>`}
      <div class="card-actions">
        <button class="btn ghost" data-act="ignore">Ignorer</button>
        ${options ? '<button class="btn primary" data-act="apply">Valider</button>' : ''}
      </div>
    </div>`;
}

function renderHistory() {
  const rows = STATE.recent.filter(({ ev, article }) => {
    if (FILTER === 'linked' && ev.status !== 'linked') return false;
    if ((FILTER === 'sale' || FILTER === 'cash') && (ev.type !== FILTER || ev.status === 'linked')) return false;
    if (!SEARCH) return true;
    const hay = norm([article && article.nom, ev.title, article && article.client, ev.buyer].join(' '));
    return hay.includes(norm(SEARCH));
  });
  $('recent').innerHTML = rows.length
    ? rows.map(historyHTML).join('')
    : `<div class="empty">${STATE.recent.length ? 'Aucun résultat.' : '<b>Aucune mise à jour pour l\'instant</b>Ouvre Mes commandes sur Vinted.'}</div>`;
}

function historyHTML({ ev, boutiqueId, article }) {
  const [cls, label] = TYPE[ev.type];
  const linked = ev.status === 'linked';
  // Prix et client tels qu'enregistrés dans Laney (ce qui fait foi)
  const price = article && article.prix_revente != null ? article.prix_revente : ev.amount;
  const client = (article && article.client) || ev.buyer;
  const name = (article && article.nom) || ev.articleName || ev.title;
  const title = ev.articleId
    ? `<a class="c-title" href="#" data-open="${esc(ev.articleId)}" data-boutique="${esc(boutiqueId || '')}" title="Ouvrir « ${esc(name)} » dans Laney">${esc(name)}</a>`
    : `<span class="c-title">${esc(name)}</span>`;
  return `
    <div class="hrow">
      <span class="c-date">${fr(ev.date)}</span>
      <span class="c-type"><span class="tag ${linked ? 'linked' : cls}">${linked ? 'Déjà saisi' : label}</span></span>
      ${title}
      <span class="c-client">${clientChip(client)}</span>
      <span class="c-price">${eur(price)}</span>
      <span class="c-filled">${linked ? 'rien modifié' : (ev.filled && ev.filled.length ? '+ ' + esc(fieldsText(ev.filled)) : '')}</span>
      <span class="c-actions">
        ${ev.note ? `<span class="warn" title="${esc(ev.note)}">⚠</span>` : ''}
        ${linked ? '' : `<button class="undo-btn" data-undo="${esc(ev.key)}" title="Remettre à vide ce que l'extension a écrit">Annuler</button>`}
      </span>
    </div>`;
}

// ─── ACTIONS ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
document.querySelectorAll('[data-goto]').forEach(s => s.addEventListener('click', () => showTab(s.dataset.goto)));

$('btn-tab').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=tab') });
  window.close();
});

$('btn-login').addEventListener('click', async () => {
  $('login-error').textContent = '';
  try {
    await login($('email').value.trim(), $('pwd').value);
    $('pwd').value = '';
    await render();
  } catch (e) {
    $('login-error').textContent = 'Email ou mot de passe incorrect';
  }
});
$('pwd').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-login').click(); });

$('btn-logout').addEventListener('click', async () => {
  await logout();
  BOUTIQUES = null;
  render();
});

$('accounts').addEventListener('change', async e => {
  const sel = e.target.closest('select[data-account]');
  if (!sel) return;
  const boutique = (BOUTIQUES || []).find(b => String(b.id) === sel.value);
  await setAccountBoutique(sel.dataset.account, boutique ? boutique.id : null);
  await processPending().catch(err => toast(err.message, true));
  toast(boutique ? `Associé à ${boutique.nom}` : 'Association retirée');
  render();
});
$('accounts').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  if (!confirm('Retirer ce compte de la liste ? Il réapparaîtra si tu te reconnectes avec lui sur Vinted.')) return;
  await removeAccount(btn.dataset.remove);
  render();
});
$('start-date').addEventListener('change', async e => {
  if (!e.target.value) return;
  await saveSettings({ startDate: e.target.value });
  await reclassifyOld();
  render();
});
$('auto').addEventListener('change', async e => {
  await saveSettings({ auto: e.target.checked });
  if (e.target.checked) await processPending().catch(err => toast(err.message, true));
  render();
});

$('pending').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.card');
  btn.disabled = true;
  try {
    if (btn.dataset.act === 'ignore') {
      await setEventStatus(card.dataset.key, 'ignored');
      toast('Ignoré');
    } else {
      const sel = card.querySelector('.ev-select');
      const filled = await applyEvent(card.dataset.key, sel.value.startsWith('new:') ? sel.value : Number(sel.value) || sel.value);
      toast(filled.length ? `Ajouté : ${fieldsText(filled)}` : 'Déjà complet, rien modifié');
    }
    render();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
});

$('h-search').addEventListener('input', e => { SEARCH = e.target.value.trim(); renderHistory(); });
$('h-filter').addEventListener('click', e => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  FILTER = b.dataset.f;
  document.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
  renderHistory();
});

$('recent').addEventListener('click', async e => {
  const undo = e.target.closest('button[data-undo]');
  if (undo) {
    if (!confirm('Annuler cette mise à jour ? Les champs remplis par l\'extension seront remis à vide dans Laney (sauf si tu les as modifiés depuis).')) return;
    try {
      const restored = await undoEvent(undo.dataset.undo);
      toast(restored.includes('created') ? 'Annulé : exemplaire créé supprimé' : restored.length ? `Annulé : ${fieldsText(restored)} remis à vide` : 'Rien annulé : les valeurs ont été modifiées depuis', !restored.length);
    } catch (err) { toast(err.message, true); }
    return render();
  }
  // Ouvrir l'article dans Laney (réutilise l'onglet Laney s'il est déjà ouvert)
  const link = e.target.closest('[data-open]');
  if (!link) return;
  e.preventDefault();
  const url = `${LANEY_URL}/?article=${link.dataset.open}${link.dataset.boutique ? `&boutique=${link.dataset.boutique}` : ''}`;
  const [tab] = await chrome.tabs.query({ url: `${LANEY_URL}/*` });
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

// Copier le nom du client en un clic
document.addEventListener('click', async e => {
  const chip = e.target.closest('[data-copy]');
  if (!chip) return;
  e.stopPropagation();
  await navigator.clipboard.writeText(chip.dataset.copy);
  toast(`Copié : ${chip.dataset.copy}`);
});

$('btn-sync').addEventListener('click', async () => {
  $('btn-sync').classList.add('spin');
  try { await processPending(); toast('Synchro relancée'); } catch (e) { toast(e.message, true); }
  await render();
  $('btn-sync').classList.remove('spin');
});
$('btn-diag').addEventListener('click', async () => {
  await navigator.clipboard.writeText(await diagnostic());
  toast('Diagnostic copié dans le presse-papiers');
});
$('btn-reset').addEventListener('click', async () => {
  if (!confirm('Vider l\'historique de l\'extension ? (Laney n\'est pas modifié)')) return;
  await resetEvents();
  render();
});

// Mise à jour automatique quand une vente arrive (utile en vue onglet)
let refreshTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(changes.events || changes.settings || changes.session)) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    // Ne pas perturber un choix en cours dans « À valider »
    if (document.activeElement && document.activeElement.matches('.ev-select, input')) return;
    render();
  }, 800);
});

showTab(pref.get('laney-tab') || 'pending');
cleanup().finally(render);
currentEmail().then(m => { if (m) $('account-email').textContent = `Connecté à Laney : ${m}`; });
