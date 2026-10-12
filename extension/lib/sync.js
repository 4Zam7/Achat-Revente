// ─── SYNCHRONISATION ────────────────────────────────────────────────────────
// Stockage local (chrome.storage.local) :
//   settings : { accounts: { [idVinted]: { login, boutiqueId } }, startDate, auto }
//   events   : { [type:vid]: { ...événement, accountId, status, articleId, note } }
//     status : pending (à valider) | done (appliqué par l'extension)
//              linked (déjà saisi à la main) | ignored | old (avant la date de départ)
//   raws / seenUrls : dernières données captées, pour le diagnostic

import { rest, isLoggedIn } from './supabase.js';
import { parseCapture } from './vinted.js';
import { rank, sureMatch, score, SURE, daysBetween } from './match.js';

const store = {
  get: async (k, def) => ((await chrome.storage.local.get(k))[k] ?? def),
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};

const todayISO = () => new Date().toLocaleDateString('sv-SE');

export async function getSettings() {
  return { accounts: {}, startDate: todayISO(), auto: true, ...(await store.get('settings', {})) };
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
        if (e.buyer && !events[key].buyer) events[key].buyer = e.buyer;
        return;
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
  const title = cleanTitle(ev.title);
  const used = usedIds(events, ev.type);
  const free = articles.filter(a => !used.has(a.id));

  if (ev.type === 'sale') {
    // 1. Vente déjà saisie à la main : même article, vendu à quelques jours près
    //    (le prix peut différer). On la reconnaît et on ne fait que compléter.
    const manual = free
      .filter(a => a.prix_revente != null && a.date_revente && score(title, a) >= SURE
        && daysBetween(a.date_revente, ev.date) <= MANUAL_WINDOW)
      .sort((a, b) => (samePrice(b.prix_revente, ev.amount) - samePrice(a.prix_revente, ev.amount))
        || daysBetween(a.date_revente, ev.date) - daysBetween(b.date_revente, ev.date));
    if (manual.length) return { article: manual[0] };
    // 2. Sinon, un exemplaire en stock dont on est sûr
    const sure = sureMatch(rank(title, free.filter(a => a.prix_revente == null)));
    return sure ? { article: sure } : null;
  }

  // Encaissement : via la vente Vinted associée si on la connaît
  const sale = ev.txId && events[`sale:${ev.txId}`];
  if (sale && sale.articleId) {
    const a = articles.find(x => x.id === sale.articleId);
    if (a) return { article: a };
  }
  // Encaissement déjà saisi à la main ?
  const manual = free.find(a => a.date_encaissement && score(title, a) >= SURE
    && samePrice(a.prix_revente, ev.amount) && daysBetween(a.date_encaissement, ev.date) <= 7);
  if (manual) return { article: manual };
  const ranked = rank(title, free.filter(a => a.prix_revente != null && !a.date_encaissement))
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
      const rows = await rest(`articles?id=eq.${article.id}&or=(client.is.null,client.eq.)`, { method: 'PATCH', body: { client: ev.buyer } });
      if (rows && rows.length) { article.client = ev.buyer; filled.push('client'); }
    }
  } else if (todo.includes('date_encaissement')) {
    if (article.prix_revente == null) throw new Error('Article pas encore vendu dans Laney');
    const rows = await rest(`articles?id=eq.${article.id}&date_encaissement=is.null`, { method: 'PATCH', body: { date_encaissement: ev.date } });
    if (rows && rows.length) { article.date_encaissement = ev.date; filled.push('date_encaissement'); }
  }
  return filled;
}

function markResolved(ev, article, filled) {
  Object.assign(ev, {
    status: filled.length ? 'done' : 'linked',
    articleId: article.id, articleName: article.nom, filled,
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
    // Ventes déjà traitées dont l'acheteur n'était pas connu à l'époque
    const backfill = Object.values(events).filter(e => e.type === 'sale' && e.buyer && e.articleId
      && (e.status === 'done' || e.status === 'linked') && !(e.filled || []).includes('client')
      && !e.clientChecked && boutiqueOf(settings, e.accountId));
    if (!pending.length && !backfill.length) return refreshBadge();

    const byBoutique = {};
    for (const ev of backfill) {
      const bId = boutiqueOf(settings, ev.accountId);
      const articles = byBoutique[bId] || (byBoutique[bId] = await fetchArticles(bId));
      const a = articles.find(x => x.id === ev.articleId);
      if (!a) continue;
      if (!settings.auto && !a.client) continue;
      ev.clientChecked = true;
      if (a.client) continue;
      try {
        const rows = await rest(`articles?id=eq.${a.id}&or=(client.is.null,client.eq.)`, { method: 'PATCH', body: { client: ev.buyer } });
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
      // Mode manuel : on n'écrit rien, sauf si tout est déjà saisi (simple rapprochement)
      if (!settings.auto && missing(ev, r.article).length) continue;
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
  const recent = events
    .filter(e => e.status === 'done' || e.status === 'linked')
    .sort((a, b) => (b.doneAt || b.seenAt).localeCompare(a.doneAt || a.seenAt))
    .slice(0, 15);
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
