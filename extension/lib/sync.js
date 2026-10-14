// ─── SYNCHRONISATION ────────────────────────────────────────────────────────
// Stockage local (chrome.storage.local) :
//   settings : { accounts: { [idVinted]: { login, boutiqueId } }, startDate, auto }
//   events   : { [type:vid]: { ...événement, accountId, status, articleId, note } }
//     status : pending (à valider) | done (appliqué par l'extension)
//              linked (déjà saisi à la main) | ignored | old (avant la date de départ)
//   raws / seenUrls : dernières données captées, pour le diagnostic

import { rest, isLoggedIn } from './supabase.js';
import { parseCapture } from './vinted.js';
import { rank, sureMatch, score, SURE, daysBetween, norm } from './match.js';

const store = {
  get: async (k, def) => ((await chrome.storage.local.get(k))[k] ?? def),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

const todayISO = () => new Date().toLocaleDateString('sv-SE');

export async function getSettings() {
  return { accounts: {}, startDate: todayISO(), auto: true, ...(await store.get('settings', {})) };
}

// Nettoyage après mise à jour de l'extension :
// - comptes fantômes (sans boutique, sans pseudo, sans événement)
// - ventes en attente lues avant la règle « payée uniquement » (relues ensuite)
export function cleanup() {
  return serial(async () => {
    const settings = await getSettings();
    const events = await store.get('events', {});
    const usedAccounts = new Set(Object.values(events).map(e => e.accountId));
    let changed = false;
    Object.entries(settings.accounts).forEach(([id, a]) => {
      if (!a.boutiqueId && !a.login && !usedAccounts.has(id)) { delete settings.accounts[id]; changed = true; }
    });
    // Une seule fois : retirer les fausses ventes lues avant la règle « payée uniquement »
    if (!settings.unpaidCleanup) {
      Object.values(events).forEach(e => {
        if (e.type === 'sale' && !e.paid && (e.status === 'pending' || e.status === 'old')) delete events[e.key];
      });
      settings.unpaidCleanup = 1;
      changed = true;
    }
    if (changed) await store.set('settings', settings);
    await store.set('events', events);
    await refreshBadge();
  });
}

export async function removeAccount(id) {
  const settings = await getSettings();
  delete settings.accounts[id];
  await store.set('settings', settings);
}

// Défait ce que l'extension a écrit pour cet événement. Chaque champ n'est
// remis à vide que s'il a toujours la valeur écrite par l'extension.
export function undoEvent(key) {
  return serial(async () => {
    const events = await store.get('events', {});
    const ev = events[key];
    if (!ev || ev.status !== 'done' || !ev.articleId) throw new Error('Rien à annuler');
    const written = {
      prix_revente: ev.amount, date_revente: ev.date, client: ev.buyer, date_encaissement: ev.date,
    };
    const fields = (ev.filled || []).filter(f => f in written);
    const restored = [];
    // Prix et date de vente vont ensemble ; le client vendu par l'extension aussi
    const groups = fields.includes('prix_revente')
      ? [fields.filter(f => ['prix_revente', 'date_revente', 'client'].includes(f)), fields.filter(f => f === 'date_encaissement')]
      : fields.map(f => [f]);
    for (const group of groups.filter(g => g.length)) {
      const filters = group.map(f => `${f}=eq.${encodeURIComponent(written[f])}`).join('&');
      const body = Object.fromEntries(group.map(f => [f, null]));
      const rows = await rest(`articles?id=eq.${ev.articleId}&${filters}`, { method: 'PATCH', body });
      if (rows && rows.length) restored.push(...group);
    }
    // L'encaissement déduit de cette vente n'a plus lieu d'être
    if (ev.type === 'sale') {
      const cash = events[`cash:tx-${ev.vid}`];
      if (cash && cash.status === 'pending') cash.status = 'ignored';
    }
    Object.assign(ev, { status: 'ignored', undone: restored, filled: [] });
    await store.set('events', events);
    await refreshBadge();
    return restored;
  });
}
export async function saveSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await store.set('settings', s);
  return s;
}

// Exécute les traitements les uns après les autres (popup et arrière-plan)
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn, fn));

// Chaque compte Vinted est associé à une boutique Laney.
// 'unknown' = compte non identifié sur la page.
const accountKey = account => (account && account.id ? String(account.id) : 'unknown');
const boutiqueOf = (settings, accountId) => (settings.accounts[accountId] || {}).boutiqueId || null;

export async function setAccountBoutique(accountId, boutiqueId) {
  const settings = await getSettings();
  settings.accounts[accountId] = { ...(settings.accounts[accountId] || {}), boutiqueId };
  await store.set('settings', settings);
}

async function registerAccount(account) {
  const id = accountKey(account);
  const settings = await getSettings();
  const known = settings.accounts[id];
  const login = account && account.login;
  if (known && (!login || known.login === login)) return id;
  settings.accounts[id] = { boutiqueId: null, ...known, ...(login ? { login } : {}) };
  await store.set('settings', settings);
  return id;
}

// ─── CAPTURE ────────────────────────────────────────────────────────────────
export async function handleCapture({ url, page, data, seenOnly, account, hello, probe }) {
  if (probe) {
    const probes = await store.get('probes', []);
    probes.unshift(probe);
    return store.set('probes', probes.slice(0, 6));
  }
  if (hello) {
    if (account && account.id) await serial(() => registerAccount(account));
    return;
  }
  await rememberUrl(url);
  if (seenOnly) return;

  // Fiche transaction côté vendeur : on retient le pseudo du compte, même sans vente
  const t = data && data.transaction;
  if (t && t.user_side === 'seller' && t.seller_id && t.seller && t.seller.login) {
    await serial(() => registerAccount({ id: String(t.seller_id), login: t.seller.login }));
  }

  const raws = await store.get('raws', []);
  raws.unshift({ at: new Date().toISOString(), url, page, account, data });
  await store.set('raws', raws.slice(0, 10));

  const found = parseCapture(url, page, data);
  if (!found.length) return;
  for (const e of found) {
    e.accountId = await serial(() => registerAccount(e.account && e.account.id ? e.account : account));
    delete e.account;
  }
  await serial(async () => {
    const events = await store.get('events', {});
    const { startDate } = await getSettings();
    found.forEach(e => {
      const key = `${e.type}:${e.vid}`;
      if (events[key]) {
        const ex = events[key];
        if (e.buyer && !ex.buyer) ex.buyer = e.buyer;
        if (e.source === 'list' && ex.status !== 'done' && e.amount !== ex.amount) ex.amount = e.amount;
        // L'encaissement déduit de cette vente reprend le même montant
        const cash = events[`cash:tx-${e.vid}`];
        if (e.source === 'list' && cash && cash.status !== 'done') cash.amount = e.amount;
        return;
      }
      if (e.type === 'cash' && e.txId && events[`sale:${e.txId}`] && events[`sale:${e.txId}`].source === 'list') {
        e.amount = events[`sale:${e.txId}`].amount;
      }
      events[key] = { ...e, key, status: e.date < startDate ? 'old' : 'pending', seenAt: new Date().toISOString() };
    });
    await store.set('events', events);
  });
  await processPending();
}

async function rememberUrl(url) {
  if (!url) return;
  const path = url.split('?')[0];
  const seen = await store.get('seenUrls', []);
  if (seen.includes(path)) return;
  seen.unshift(path);
  await store.set('seenUrls', seen.slice(0, 50));
}

// ─── ARTICLES ───────────────────────────────────────────────────────────────
export async function fetchBoutiques() {
  return rest('boutiques?select=id,nom&order=created_at.asc');
}

async function fetchArticles(boutiqueId) {
  return rest(`articles?select=id,nom,prix_achat,prix_revente,date_achat,date_revente,date_encaissement,sku,identifiant,taille,client&boutique_id=eq.${boutiqueId}&order=id.asc`);
}

// Articles déjà associés à un événement du même type
function usedIds(events, type) {
  return new Set(Object.values(events)
    .filter(e => e.type === type && e.articleId && (e.status === 'done' || e.status === 'linked'))
    .map(e => e.articleId));
}

const cleanTitle = t => String(t || '').replace(/^(vente|paiement|sale|payment|commande)\s*[:\-–]?\s*/i, '');
const samePrice = (a, b) => a != null && b != null && Math.abs(a - b) < 0.01;

// Une vente déjà saisie à la main peut avoir un prix ou une date un peu différents
const MANUAL_WINDOW = 30;

// Articles proposés pour un événement, du plus probable au moins probable.
// Pour une vente : les articles en stock, et les articles déjà vendus récemment
// (choisir l'un d'eux complète seulement ce qui manque, sans rien écraser).
export function candidatesFor(ev, articles) {
  const pool = ev.type === 'sale'
    ? articles.filter(a => a.prix_revente == null
        || (a.date_revente && daysBetween(a.date_revente, ev.date) <= MANUAL_WINDOW))
    : articles.filter(a => a.prix_revente != null);
  return rank(cleanTitle(ev.title), pool)
    // À ressemblance égale, les articles encore à compléter passent devant
    .sort((x, y) => y.score - x.score || missing(ev, y.article).length - missing(ev, x.article).length);
}

// Cet article déjà vendu dans Laney correspond-il à CETTE vente Vinted ?
// Le client doit concorder s'il est connu des deux côtés, et le prix doit être
// identique OU la date de vente à 7 jours près (une offre peut changer le prix).
function isSameSale(ev, a) {
  if (a.client && ev.buyer && norm(a.client) !== norm(ev.buyer)) return false;
  if (a.client && ev.buyer) return daysBetween(a.date_revente, ev.date) <= MANUAL_WINDOW;
  return samePrice(a.prix_revente, ev.amount) ? daysBetween(a.date_revente, ev.date) <= MANUAL_WINDOW
    : daysBetween(a.date_revente, ev.date) <= 7;
}

// Champs que l'extension peut remplir sur cet article : uniquement ceux qui sont vides
export function missing(ev, a) {
  const out = [];
  if (ev.type === 'sale') {
    if (a.prix_revente == null) out.push('prix_revente', 'date_revente');
    if (ev.buyer && !a.client) out.push('client');
  } else if (!a.date_encaissement) {
    out.push('date_encaissement');
  }
  return out;
}

// Décide quoi faire d'un événement : { article } à compléter, ou null (à valider)
function resolve(ev, articles, events) {
  const linkedSale = ev.type === 'cash' && ev.txId ? events[`sale:${ev.txId}`] : null;
  const title = cleanTitle(ev.title) || cleanTitle(linkedSale && linkedSale.title);
  const used = usedIds(events, ev.type);
  const free = articles.filter(a => !used.has(a.id));

  if (ev.type === 'sale') {
    // 1. Vente déjà saisie à la main : même article, vendu à quelques jours près
    //    (le prix peut différer). On la reconnaît et on ne fait que compléter.
    const manual = free
      .filter(a => a.prix_revente != null && a.date_revente && score(title, a) >= SURE
        && isSameSale(ev, a))
      .sort((a, b) => (samePrice(b.prix_revente, ev.amount) - samePrice(a.prix_revente, ev.amount))
        || daysBetween(a.date_revente, ev.date) - daysBetween(b.date_revente, ev.date));
    if (manual.length) return { article: manual[0] };
    // 2. Sinon, un exemplaire en stock dont on est sûr
    const sure = sureMatch(rank(title, free.filter(a => a.prix_revente == null)));
    return sure ? { article: sure } : null;
  }

  // Articles rattachés à une AUTRE vente Vinted : jamais candidats pour cet encaissement
  const otherSales = new Set(Object.values(events)
    .filter(e => e.type === 'sale' && e.articleId && e.vid !== ev.txId).map(e => e.articleId));
  const cashPool = free.filter(a => !otherSales.has(a.id));

  // Encaissement : via la vente Vinted associée si on la connaît
  const sale = ev.txId && events[`sale:${ev.txId}`];
  if (sale && sale.articleId) {
    const a = articles.find(x => x.id === sale.articleId);
    if (a) return { article: a };
  }
  // Vente connue mais pas rattachée (ex. antérieure à la date de départ) :
  // on cherche l'article vendu correspondant à cette vente
  if (sale && !sale.articleId) {
    const sold = cashPool.filter(a => a.prix_revente != null && score(cleanTitle(sale.title), a) >= SURE);
    // 1. Même acheteur que dans Laney : sans ambiguïté
    const byBuyer = sale.buyer ? sold.filter(a => norm(a.client) === norm(sale.buyer)) : [];
    if (byBuyer.length === 1) return { article: byBuyer[0] };
    // 2. Même montant et vendu à quelques jours de la vente Vinted
    const byPrice = sold
      .filter(a => (samePrice(a.prix_revente, sale.amount) || samePrice(a.prix_revente, ev.amount))
        && (!a.date_revente || daysBetween(a.date_revente, sale.date) <= MANUAL_WINDOW)
        && (!a.client || !sale.buyer || norm(a.client) === norm(sale.buyer)))
      .sort((a, b) => daysBetween(a.date_revente || sale.date, sale.date) - daysBetween(b.date_revente || sale.date, sale.date));
    if (byPrice.length) return { article: byPrice[0] };
    return null;
  }
  // Encaissement déjà saisi à la main ?
  const manual = cashPool.find(a => a.date_encaissement && score(title, a) >= SURE
    && samePrice(a.prix_revente, ev.amount) && daysBetween(a.date_encaissement, ev.date) <= 7);
  if (manual) return { article: manual };
  const ranked = rank(title, cashPool.filter(a => a.prix_revente != null && !a.date_encaissement))
    .filter(r => samePrice(r.article.prix_revente, ev.amount));
  const sure = sureMatch(ranked);
  return sure ? { article: sure } : null;
}

// Complète l'article dans Laney sans jamais écraser une valeur déjà saisie :
// chaque champ n'est écrit que s'il est encore vide côté base (filtres PostgREST).
// Renvoie la liste des champs remplis (vide = rien à faire, déjà saisi).
async function write(ev, article) {
  const filled = [];
  const todo = missing(ev, article);
  if (ev.type === 'sale') {
    if (todo.includes('prix_revente')) {
      const patch = { prix_revente: ev.amount, date_revente: ev.date };
      if (todo.includes('client')) patch.client = ev.buyer;
      const rows = await rest(`articles?id=eq.${article.id}&prix_revente=is.null`, { method: 'PATCH', body: patch });
      if (!rows || !rows.length) throw new Error('Article vendu entre-temps : rien n\'a été modifié');
      Object.assign(article, patch);
      filled.push(...Object.keys(patch));
    } else if (todo.includes('client')) {
      const rows = await setClientIfEmpty(article.id, ev.buyer);
      if (rows && rows.length) { article.client = ev.buyer; filled.push('client'); }
    }
  } else if (todo.includes('date_encaissement')) {
    if (article.prix_revente == null) throw new Error('Article pas encore vendu dans Laney');
    const rows = await rest(`articles?id=eq.${article.id}&date_encaissement=is.null`, { method: 'PATCH', body: { date_encaissement: ev.date } });
    if (rows && rows.length) { article.date_encaissement = ev.date; filled.push('date_encaissement'); }
  }
  return filled;
}

// Écrit le client seulement s'il est vide (null ou chaîne vide), sans écraser une saisie
async function setClientIfEmpty(id, client) {
  const rows = await rest(`articles?id=eq.${id}&client=is.null`, { method: 'PATCH', body: { client } });
  if (rows && rows.length) return rows;
  return rest(`articles?id=eq.${id}&client=eq.`, { method: 'PATCH', body: { client } });
}

function markResolved(ev, article, filled) {
  Object.assign(ev, {
    status: filled.length ? 'done' : 'linked',
    articleId: article.id, articleName: article.nom, filled,
    // Nouvel article : la vérification du client est à refaire
    clientChecked: ev.articleId === article.id ? ev.clientChecked : false,
    doneAt: new Date().toISOString(), note: null,
  });
}

// ─── TRAITEMENT ─────────────────────────────────────────────────────────────
export function processPending() {
  return serial(async () => {
    const settings = await getSettings();
    if (!(await isLoggedIn())) return refreshBadge();
    const events = await store.get('events', {});
    const pending = Object.values(events)
      .filter(e => e.status === 'pending' && boutiqueOf(settings, e.accountId))
      // Ventes avant encaissements, dans l'ordre chronologique
      .sort((a, b) => (a.type === b.type ? a.date.localeCompare(b.date) : a.type === 'sale' ? -1 : 1));
    // Une fois (0.1.12) : revérifier le client des ventes déjà traitées
    if (!settings.clientRecheck) {
      Object.values(events).forEach(e => { if (e.type === 'sale' && e.status === 'done') e.clientChecked = false; });
      await saveSettings({ clientRecheck: 1 });
    }
    // Ventes déjà traitées dont l'acheteur n'était pas connu à l'époque
    const backfill = Object.values(events).filter(e => e.type === 'sale' && e.buyer && e.articleId
      && (e.status === 'done' || e.status === 'linked') && !(e.filled || []).includes('client')
      && !e.clientChecked && boutiqueOf(settings, e.accountId));
    const hasLinked = Object.values(events).some(e => e.type === 'sale' && e.status === 'linked');
    if (!pending.length && !backfill.length && !hasLinked) return refreshBadge();

    const byBoutique = {};

    // Revérifie les ventes « déjà saisies » (rien n'a été écrit pour elles) :
    // si l'article lié ne correspond plus à la vente, elle repasse en attente
    const linkedSales = Object.values(events).filter(e => e.type === 'sale' && e.status === 'linked'
      && e.articleId && boutiqueOf(settings, e.accountId));
    for (const ev of linkedSales) {
      const bId = boutiqueOf(settings, ev.accountId);
      const articles = byBoutique[bId] || (byBoutique[bId] = await fetchArticles(bId));
      const a = articles.find(x => x.id === ev.articleId);
      if (a && a.prix_revente != null && isSameSale(ev, a)) continue;
      Object.assign(ev, { status: ev.date < settings.startDate ? 'old' : 'pending', articleId: null, articleName: null, note: 'Rapprochement revu : à confirmer', recheck: true, clientChecked: false, paid: true });
      if (ev.status === 'pending') pending.push(ev);
    }
    pending.sort((a, b) => (a.type === b.type ? a.date.localeCompare(b.date) : a.type === 'sale' ? -1 : 1));
    for (const ev of backfill) {
      const bId = boutiqueOf(settings, ev.accountId);
      const articles = byBoutique[bId] || (byBoutique[bId] = await fetchArticles(bId));
      const a = articles.find(x => x.id === ev.articleId);
      if (!a) continue;
      if (!settings.auto && !a.client) continue;
      ev.clientChecked = true;
      if (a.client) continue;
      try {
        const rows = await setClientIfEmpty(a.id, ev.buyer);
        if (rows && rows.length) {
          a.client = ev.buyer;
          ev.filled = [...(ev.filled || []), 'client'];
          ev.status = 'done';
        }
      } catch (e) { ev.clientChecked = false; ev.note = e.message; }
    }

    for (const ev of pending) {
      const bId = boutiqueOf(settings, ev.accountId);
      const articles = byBoutique[bId] || (byBoutique[bId] = await fetchArticles(bId));
      const r = resolve(ev, articles, events);
      if (!r) continue;
      // Mode manuel, ou vente revérifiée : on n'écrit rien sans confirmation
      // (sauf si tout est déjà saisi : simple rapprochement)
      if ((!settings.auto || ev.recheck) && missing(ev, r.article).length) continue;
      try {
        markResolved(ev, r.article, await write(ev, r.article));
      } catch (e) {
        ev.note = e.message;
      }
    }
    await store.set('events', events);
    await refreshBadge();
  });
}

// Validation manuelle depuis la popup
export function applyEvent(key, articleId) {
  return serial(async () => {
    const settings = await getSettings();
    const events = await store.get('events', {});
    const ev = events[key];
    if (!ev) throw new Error('Événement introuvable');
    const boutiqueId = boutiqueOf(settings, ev.accountId);
    if (!boutiqueId) throw new Error('Associe d\'abord ce compte Vinted à une boutique');
    const articles = await fetchArticles(boutiqueId);
    const article = articles.find(a => a.id === articleId);
    if (!article) throw new Error('Article introuvable');
    const filled = await write(ev, article);
    markResolved(ev, article, filled);
    await store.set('events', events);
    await refreshBadge();
    return filled;
  });
}

export function setEventStatus(key, status) {
  return serial(async () => {
    const events = await store.get('events', {});
    if (events[key]) events[key].status = status;
    await store.set('events', events);
    await refreshBadge();
  });
}

// ─── ÉTAT POUR LA POPUP ─────────────────────────────────────────────────────
export async function getState() {
  const settings = await getSettings();
  const events = Object.values(await store.get('events', {}));
  const logged = await isLoggedIn();
  const byBoutique = {};
  const articlesOf = async bId => {
    if (!bId || !logged) return [];
    if (!byBoutique[bId]) byBoutique[bId] = await fetchArticles(bId).catch(() => []);
    return byBoutique[bId];
  };
  const pending = [];
  for (const ev of events.filter(e => e.status === 'pending').sort((a, b) => b.date.localeCompare(a.date))) {
    const boutiqueId = boutiqueOf(settings, ev.accountId);
    pending.push({ ev, boutiqueId, candidates: candidatesFor(ev, await articlesOf(boutiqueId)).slice(0, 30) });
  }
  // Les mises à jour écrites par l'extension (annulables) passent avant les « déjà saisi »
  const byDate = (a, b) => (b.doneAt || b.seenAt).localeCompare(a.doneAt || a.seenAt);
  const recentEvents = [
    ...events.filter(e => e.status === 'done').sort(byDate).slice(0, 30),
    ...events.filter(e => e.status === 'linked').sort(byDate).slice(0, 10),
  ];
  // Chaque ligne affiche l'article tel qu'il est dans Laney (prix, client)
  const recent = [];
  for (const ev of recentEvents) {
    const boutiqueId = boutiqueOf(settings, ev.accountId);
    const article = (await articlesOf(boutiqueId)).find(a => a.id === ev.articleId) || null;
    recent.push({ ev, boutiqueId, article });
  }
  return { settings, pending, recent, counts: countBy(events) };
}

function countBy(events) {
  const c = {};
  events.forEach(e => { c[e.status] = (c[e.status] || 0) + 1; });
  return c;
}

export async function refreshBadge() {
  const events = Object.values(await store.get('events', {}));
  const n = events.filter(e => e.status === 'pending').length;
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#e8a33d' });
}

// Réapplique la date de départ (ex. après l'avoir modifiée)
export function reclassifyOld() {
  return serial(async () => {
    const { startDate } = await getSettings();
    const events = await store.get('events', {});
    Object.values(events).forEach(e => {
      if (e.status === 'pending' && e.date < startDate) e.status = 'old';
      else if (e.status === 'old' && e.date >= startDate) e.status = 'pending';
    });
    await store.set('events', events);
  });
}

export async function diagnostic() {
  const [seenUrls, raws, events, settings, probes] = await Promise.all([
    store.get('seenUrls', []), store.get('raws', []), store.get('events', {}), getSettings(), store.get('probes', []),
  ]);
  return JSON.stringify({ version: chrome.runtime.getManifest().version, settings, probes, seenUrls, events, raws }, null, 2);
}

export async function resetEvents() {
  await chrome.storage.local.remove(['events', 'raws', 'seenUrls', 'probes']);
  await refreshBadge();
}
