import { login, logout, isLoggedIn, currentEmail } from './lib/supabase.js';
import {
  getState, saveSettings, setAccountBoutique, fetchBoutiques, processPending, applyEvent,
  setEventStatus, reclassifyOld, diagnostic, resetEvents, missing,
} from './lib/sync.js';

const FIELD = { prix_revente: 'prix', date_revente: 'date de vente', client: 'client', date_encaissement: 'encaissement' };
const fieldsText = list => [...new Set(list.filter(f => f !== 'date_revente' || !list.includes('prix_revente')))].map(f => FIELD[f]).join(', ');

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => (n != null ? Number(n).toFixed(2) + '€' : '—');
const fr = d => (d ? d.split('-').reverse().join('/') : '');

function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = ''), 2600);
}

// ─── RENDU ──────────────────────────────────────────────────────────────────
async function render() {
  const logged = await isLoggedIn();
  $('login').hidden = logged;
  $('main').hidden = !logged;
  $('btn-logout').hidden = !logged;
  if (!logged) { $('email').focus(); return; }

  const state = await getState();
  const { settings } = state;
  $('start-date').value = settings.startDate;
  $('auto').checked = settings.auto;
  ACCOUNTS = settings.accounts;
  await loadBoutiques();
  renderAccounts(settings.accounts);

  $('pending-count').textContent = state.pending.length || '';
  $('pending').innerHTML = state.pending.length
    ? state.pending.map(pendingHTML).join('')
    : '<div class="empty">Rien à valider. Consulte tes ventes ou ton porte-monnaie Vinted.</div>';

  $('recent').innerHTML = state.recent.length
    ? state.recent.map(recentHTML).join('')
    : '<div class="empty">Aucune mise à jour pour l\'instant.</div>';
}

let BOUTIQUES = null;
let ACCOUNTS = {};
async function loadBoutiques() {
  if (BOUTIQUES) return;
  try { BOUTIQUES = await fetchBoutiques(); } catch (e) { toast(e.message, true); }
}

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
          <span class="acc-name" title="ID Vinted ${esc(id)}">${esc(accountName(id))}</span>
          <select data-account="${esc(id)}">
            <option value="">— Choisir —</option>
            ${(BOUTIQUES || []).map(b => `<option value="${b.id}" ${b.id === accounts[id].boutiqueId ? 'selected' : ''}>${esc(b.nom)}</option>`).join('')}
          </select>
        </div>`).join('')
    : '<div class="empty">Aucun compte détecté. Ouvre ou recharge un onglet Vinted où tu es connecté, puis rouvre cette fenêtre : ton compte apparaîtra ici pour choisir sa boutique.</div>';
}

const TYPE = { sale: ['sale', 'Vente'], cash: ['cash', 'Encaissement'] };

function articleLabel(ev, { article: a, score }) {
  const bits = [a.nom];
  if (a.taille) bits.push(a.taille);
  if (a.sku) bits.push(a.sku);
  bits.push(a.prix_revente != null ? `vendu ${eur(a.prix_revente)} le ${fr(a.date_revente)}` : a.date_achat ? `acheté le ${fr(a.date_achat)}` : 'en stock');
  const todo = missing(ev, a);
  if (a.prix_revente != null || ev.type === 'cash') bits.push(todo.length ? `→ ajoute ${fieldsText(todo)}` : '→ déjà complet');
  return (score >= 0.95 ? '★ ' : '') + bits.join(' · ');
}

function pendingHTML({ ev, boutiqueId, candidates }) {
  const [cls, label] = TYPE[ev.type];
  const meta = [fr(ev.date), accountName(ev.accountId || 'unknown'), ev.buyer ? `acheteur ${ev.buyer}` : ''].filter(Boolean).join(' · ');
  const options = candidates.length
    ? candidates.map(c => `<option value="${c.article.id}">${esc(articleLabel(ev, c))}</option>`).join('')
    : '';
  const empty = !boutiqueId
    ? 'Associe ce compte Vinted à une boutique ci-dessus'
    : ev.type === 'sale' ? 'Aucun article en stock dans cette boutique' : 'Aucun article vendu dans cette boutique';
  return `
    <div class="ev" data-key="${esc(ev.key)}">
      <div class="ev-head">
        <span class="tag ${cls}">${label}</span>
        <span class="ev-title" title="${esc(ev.title)}">${esc(ev.title || 'Sans titre')}</span>
        <span class="ev-price">${eur(ev.amount)}</span>
      </div>
      <div class="ev-meta">${esc(meta)}</div>
      ${ev.note ? `<div class="ev-note">${esc(ev.note)}</div>` : ''}
      ${options ? `<select class="ev-select">${options}</select>` : `<div class="empty">${empty}</div>`}
      <div class="ev-actions">
        <button class="small" data-act="ignore">Ignorer</button>
        ${options ? '<button class="small ok" data-act="apply">Valider</button>' : ''}
      </div>
    </div>`;
}

function recentHTML(ev) {
  const [cls, label] = TYPE[ev.type];
  const linked = ev.status === 'linked';
  const what = linked ? 'Déjà saisi dans Laney, rien modifié' : `Ajouté : ${fieldsText(ev.filled || [])}`;
  return `
    <div class="row" title="${esc(what)}">
      <span class="tag ${linked ? 'linked' : cls}">${linked ? 'Déjà saisi' : label}</span>
      <span class="ev-title">${esc(ev.articleName || ev.title)}${!linked && ev.filled ? ` <span class="muted">· ${esc(fieldsText(ev.filled))}</span>` : ''}</span>
      <span class="ev-price">${eur(ev.amount)}</span>
    </div>`;
}

// ─── ACTIONS ────────────────────────────────────────────────────────────────
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
  const v = sel.value;
  const boutique = (BOUTIQUES || []).find(b => String(b.id) === v);
  await setAccountBoutique(sel.dataset.account, boutique ? boutique.id : null);
  await processPending().catch(err => toast(err.message, true));
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
  const card = btn.closest('.ev');
  const key = card.dataset.key;
  btn.disabled = true;
  try {
    if (btn.dataset.act === 'ignore') {
      await setEventStatus(key, 'ignored');
      toast('Ignoré');
    } else {
      const sel = card.querySelector('.ev-select');
      const id = Number(sel.value) || sel.value;
      const filled = await applyEvent(key, id);
      toast(filled.length ? `Ajouté : ${fieldsText(filled)}` : 'Déjà complet, rien modifié');
    }
    render();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
});

$('btn-sync').addEventListener('click', async () => {
  try { await processPending(); toast('Synchro relancée'); } catch (e) { toast(e.message, true); }
  render();
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

render();
currentEmail().then(m => { if (m) $('btn-logout').title = m; });
