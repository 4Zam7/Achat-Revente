import { login, logout, isLoggedIn, currentEmail } from './lib/supabase.js';
import {
  getState, saveSettings, setAccountBoutique, fetchBoutiques, processPending, applyEvent,
  setEventStatus, reclassifyOld, diagnostic, resetEvents, missing, cleanup, removeAccount, undoEvent,
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
          <button class="link danger" data-remove="${esc(id)}" title="Retirer ce compte de la liste">✕</button>
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
  const meta = [fr(ev.date), accountName(ev.accountId || 'unknown')].filter(Boolean).join(' · ');
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
      <div class="ev-meta">${esc(meta)}${ev.buyer ? ` · acheteur ${clientChip(ev.buyer)}` : ''}</div>
      ${ev.note ? `<div class="ev-note">${esc(ev.note)}</div>` : ''}
      ${options ? `<select class="ev-select">${options}</select>` : `<div class="empty">${empty}</div>`}
      <div class="ev-actions">
        <button class="small" data-act="ignore">Ignorer</button>
        ${options ? '<button class="small ok" data-act="apply">Valider</button>' : ''}
      </div>
    </div>`;
}

const clientChip = name => (name
  ? `<button class="client" data-copy="${esc(name)}" title="Copier le nom du client">${esc(name)}</button>`
  : '<span class="client none">—</span>');

function recentHTML({ ev, boutiqueId, article }) {
  const [cls, label] = TYPE[ev.type];
  const linked = ev.status === 'linked';
  const what = linked ? 'Déjà saisi dans Laney, rien modifié' : `Ajouté : ${fieldsText(ev.filled || [])}`;
  // Le prix et le client affichés sont ceux de Laney (ce qui fait foi)
  const price = article && article.prix_revente != null ? article.prix_revente : ev.amount;
  const client = (article && article.client) || ev.buyer;
  const name = (article && article.nom) || ev.articleName || ev.title;
  const titleEl = ev.articleId
    ? `<a class="ev-title open" href="#" data-open="${esc(ev.articleId)}" data-boutique="${esc(boutiqueId || '')}" title="Ouvrir dans Laney">${esc(name)}</a>`
    : `<span class="ev-title">${esc(name)}</span>`;
  return `
    <div class="row" title="${esc(what)}">
      <div class="row-main">
        <span class="tag ${linked ? 'linked' : cls}">${linked ? 'Déjà saisi' : label}</span>
        ${titleEl}
        <span class="ev-price">${eur(price)}</span>
      </div>
      <div class="row-sub">
        ${clientChip(client)}
        <span class="muted">${linked ? 'rien modifié' : esc(fieldsText(ev.filled || []))}</span>
        ${ev.note ? `<span class="ev-note" title="${esc(ev.note)}">⚠</span>` : ''}
        ${linked ? '' : `<button class="link danger" data-undo="${esc(ev.key)}" title="Remettre à vide ce que l'extension a écrit">Annuler</button>`}
      </div>
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

cleanup().finally(render);
currentEmail().then(m => { if (m) $('btn-logout').title = m; });

$('accounts').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-remove]');
  if (!btn) return;
  if (!confirm('Retirer ce compte de la liste ? Il réapparaîtra si tu te reconnectes avec lui sur Vinted.')) return;
  await removeAccount(btn.dataset.remove);
  render();
});

$('recent').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-undo]');
  if (!btn) return;
  if (!confirm('Annuler cette mise à jour ? Les champs remplis par l\'extension seront remis à vide dans Laney (sauf si tu les as modifiés depuis).')) return;
  try {
    const restored = await undoEvent(btn.dataset.undo);
    toast(restored.length ? `Annulé : ${fieldsText(restored)} remis à vide` : 'Rien annulé : les valeurs ont été modifiées depuis', !restored.length);
  } catch (err) { toast(err.message, true); }
  render();
});

// Copier le nom du client en un clic
document.addEventListener('click', async e => {
  const chip = e.target.closest('[data-copy]');
  if (!chip) return;
  e.stopPropagation();
  await navigator.clipboard.writeText(chip.dataset.copy);
  toast(`Copié : ${chip.dataset.copy}`);
});

// Ouvrir l'article dans Laney (réutilise l'onglet Laney s'il est déjà ouvert)
const LANEY_URL = 'https://achat-revente-sigma.vercel.app';
$('recent').addEventListener('click', async e => {
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
