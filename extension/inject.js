// ─── INJECT (contexte de la page Vinted) ────────────────────────────────────
// Écoute les réponses que la page Vinted reçoit de son API.
// Seule exception : sur Mes commandes, la liste n'expose pas les données des
// ventes ; l'extension ouvre alors elle-même la fiche de chaque vente nouvelle
// (comme si tu ouvrais la conversation), lentement et une seule fois.
(() => {
  if (window.__laneySync) return;
  window.__laneySync = true;

  // Réponses qui nous intéressent : commandes, transactions, porte-monnaie
  const WATCH = /\/api\/v2\/.*(order|transaction|wallet|invoice|balance)/i;
  // Pages où l'on note aussi les autres appels API (aide au diagnostic)
  const PAGES = /my_orders|wallet|balance|order|transaction/i;

  // Compte Vinted connecté sur cette page (pour choisir la bonne boutique Laney)
  let account = null;
  // Source principale : la session de la page (…"initialSessionData":{"userId":123…),
  // seule source fiable. Le pseudo est appris plus tard via les transactions.
  let sessionId = null;
  function detectAccount() {
    if (!sessionId) {
      const txt = [...document.scripts].map(s => s.textContent).join('\n');
      const u = txt.match(/initialSessionData\\?"\s*:\s*\{\\?"userId\\?"\s*:\s*(\d+)/);
      if (u) sessionId = u[1];
    }
    const id = sessionId;
    if (id && (!account || account.id !== id)) account = { id, login: null };
    return account;
  }
  function learnAccount(data) {
    const u = data && (data.current_user || data.user);
    if (u && u.id && u.login) account = { id: String(u.id), login: u.login };
  }

  // Diagnostic : extrait les passages qui ressemblent à des commandes
  // dans les données rendues par le serveur (liste Mes commandes)
  function flightSnippets() {
    const f = (window.__next_f || []).map(x => (typeof x[1] === 'string' ? x[1] : '')).join('');
    const out = [];
    const re = /item_title|transaction_id|conversation_id|\/inbox\/\d+|"price"/g;
    let m;
    while ((m = re.exec(f)) && out.length < 4) {
      out.push(f.slice(Math.max(0, m.index - 300), m.index + 900));
      re.lastIndex = m.index + 900;
    }
    return { flightLength: f.length, snippets: out };
  }

  const post = msg => window.postMessage({ __laney: true, page: location.href, account: detectAccount(), ...msg }, location.origin);

  function onResponse(url, readJson) {
    if (!url || !url.includes('/api/')) return;
    if (/\/users\/current|current_user/i.test(url)) {
      readJson().then(learnAccount).catch(() => {});
    } else if (WATCH.test(url)) {
      readJson().then(data => {
        post({ url, data });
        if (/escrow-orders\?|my_orders\?/.test(url) && /type=sold/.test(url) && data && Array.isArray(data.my_orders)) enrichOrders(data.my_orders);
      }).catch(() => {});
    } else if (PAGES.test(location.pathname)) {
      post({ url, seenOnly: true });
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = res.url || (args[0] && args[0].url) || String(args[0]);
      onResponse(url, () => res.clone().json());
      if (/my_orders/.test(location.pathname + url) && /_rsc=|text\/x-component/.test(url + (res.headers.get('content-type') || ''))) {
        res.clone().text().then(t => {
          const i = t.search(/item_title|transaction_id|\/inbox\/\d+/);
          post({ probe: { at: new Date().toISOString(), rsc: url, length: t.length, snippet: t.slice(Math.max(0, i - 300), i + 1500) } });
        }).catch(() => {});
      }
    } catch (e) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener('load', () => {
      try {
        const u = this.responseURL || String(url);
        onResponse(u, async () => (this.responseType === 'json' ? this.response : JSON.parse(this.responseText)));
      } catch (e) {}
    });
    return origOpen.call(this, method, url, ...rest);
  };

  // Signale le compte connecté dès l'ouverture de Vinted (pour l'associer à une boutique)
  let announced = null;
  const announce = () => {
    const a = detectAccount();
    if (a && a.id + a.login !== announced) { announced = a.id + a.login; post({ hello: true }); }
  };
  document.addEventListener('DOMContentLoaded', announce);
  window.addEventListener('load', () => { announce(); setTimeout(announce, 3000); });

  // Diagnostic : ce que la page expose (noms de cookies, liens de profil, scripts)
  window.addEventListener('load', () => setTimeout(() => {
    const scripts = [...document.scripts].map(s => s.textContent);
    const all = scripts.join('\n');
    const around = re => { const i = all.search(re); return i < 0 ? null : all.slice(Math.max(0, i - 80), i + 220); };
    post({ probe: {
      at: new Date().toISOString(),
      path: location.pathname,
      cookieNames: document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean),
      memberLinks: [...document.querySelectorAll('a[href*="/member/"]')].slice(0, 5).map(a => a.getAttribute('href')),
      nextData: !!document.getElementById('__NEXT_DATA__'),
      nextFlight: !!window.__next_f,
      scripts: scripts.length,
      userSnippet: around(/current_?user|currentUser|"user_id"|userId/i),
      orderSnippet: around(/transaction_id|my_orders|"orders"/i),
      flight: /my_orders/.test(location.pathname) ? flightSnippets() : null,
      account: detectAccount(),
    } });
  }, 4000));

  // ─── MES COMMANDES : lecture de la liste ──────────────────────────────────
  // Chaque ligne mène à la conversation (/inbox/:id). Pour une ligne nouvelle,
  // ou dont le statut a changé, on récupère la conversation → l'id de la
  // transaction → la fiche transaction (captée par le fetch ci-dessus).
  const SEEN_KEY = 'laneySync:orders:v4';
  const loadSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (e) { return {}; } };
  const saveSeen = v => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch (e) {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function orderRows() {
    const rows = new Map();
    document.querySelectorAll('a[href*="/inbox/"]').forEach(a => {
      const m = a.getAttribute('href').match(/\/inbox\/(\d+)(?:[/?#]|$)/);
      const text = (a.innerText || '').trim();
      // Une ligne de commande affiche un prix (ex. « 17,00 € »)
      if (m && /\d+[,.]\d{2}\s*€/.test(text)) rows.set(m[1], text.replace(/\s+/g, ' ').slice(0, 200));
    });
    return rows;
  }

  function findTransactionId(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return null;
    if (node.transaction && node.transaction.id) return node.transaction.id;
    if (node.transaction_id) return node.transaction_id;
    for (const v of Object.values(node)) {
      const id = findTransactionId(v, depth + 1);
      if (id) return id;
    }
    return null;
  }

  let scanning = false;
  let probedRows = false;
  async function scanOrders() {
    if (scanning || !/my_orders/.test(location.pathname)) return;
    if (enriching) return;
    scanning = true;
    try {
      const seen = loadSeen();
      const rows = orderRows();
      let budget = 15;
      for (const [convId, text] of rows) {
        if (seen[convId] && seen[convId].text === text) continue;
        if (budget-- <= 0) break;
        let txId = seen[convId] && seen[convId].txId;
        if (!txId) {
          const r = await window.fetch(`/api/v2/conversations/${convId}`, { credentials: 'include', headers: { Accept: 'application/json' } });
          if (!r.ok) { post({ probe: { at: new Date().toISOString(), error: `conversation ${convId} : HTTP ${r.status}` } }); break; }
          txId = findTransactionId(await r.json());
          await sleep(1200);
        }
        if (txId) {
          const r = await window.fetch(`/api/v2/transactions/${txId}`, { credentials: 'include', headers: { Accept: 'application/json' } });
          if (!r.ok) { post({ probe: { at: new Date().toISOString(), error: `transaction ${txId} : HTTP ${r.status}` } }); break; }
          await sleep(1200);
        }
        seen[convId] = { text, txId: txId || null };
        saveSeen(seen);
      }
      if (!rows.size && !probedRows) {
        probedRows = true;
        // Diagnostic : structure de la liste si aucune ligne n'est reconnue
        const main = document.querySelector('main') || document.body;
        const links = [...main.querySelectorAll('a[href]')].slice(0, 25).map(a => `${a.getAttribute('href')} | ${(a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80)}`);
        const priceEl = [...main.querySelectorAll('*')].find(el => el.children.length === 0 && /\d+[,.]\d{2}\s*€/.test(el.textContent || ''));
        let row = priceEl;
        for (let i = 0; row && i < 6; i++) row = row.parentElement;
        post({ probe: { at: new Date().toISOString(), path: location.pathname, noRows: true, links, rowHtml: row ? row.outerHTML.slice(0, 3000) : null } });
      }
    } catch (e) {
      post({ probe: { at: new Date().toISOString(), error: String(e) } });
    }
    scanning = false;
  }

  // Liste chargée par l'API : on a déjà l'id de transaction. On ouvre la fiche
  // (acheteur, date de finalisation) des commandes récentes dont le statut a changé.
  let enriching = false;
  async function enrichOrders(orders) {
    if (enriching) return;
    enriching = true;
    try {
      const seen = loadSeen();
      const recent = Date.now() - 60 * 86400000;
      let budget = 15;
      for (const o of orders) {
        const id = o.transaction_id;
        const state = String(o.transaction_user_status || o.status || '');
        if (!id || o.transaction_user_status === 'failed' || new Date(o.date) < recent) continue;
        if (seen[`tx:${id}`] === state) continue;
        if (budget-- <= 0) break;
        const r = await origFetch(`/api/v2/transactions/${id}`, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!r.ok) { post({ probe: { at: new Date().toISOString(), error: `transaction ${id} : HTTP ${r.status}` } }); break; }
        post({ url: `https://www.vinted.fr/api/v2/transactions/${id}`, data: await r.json() });
        seen[`tx:${id}`] = state;
        saveSeen(seen);
        await sleep(1200);
      }
    } catch (e) {
      post({ probe: { at: new Date().toISOString(), error: String(e) } });
    }
    enriching = false;
  }

  // ─── VÉRIFICATION DEPUIS N'IMPORTE QUELLE PAGE VINTED ─────────────────────
  // Toutes les 15 min au plus par compte (partagé entre onglets), l'extension
  // récupère la liste des ventes elle-même : plus besoin d'ouvrir Mes commandes.
  const AUTO_EVERY = 15 * 60 * 1000;
  const SOLD_URLS = [
    'https://api.vinted.fr/escrow-orders/api/v2/current-user/escrow-orders?page=1&per_page=20&type=sold',
    '/api/v2/my_orders?type=sold&status=all&per_page=20&page=1',
  ];
  async function autoCheck() {
    if (/my_orders/.test(location.pathname)) return; // la page charge déjà la liste
    const acc = detectAccount();
    if (!acc) return; // non connecté
    const key = `laneySync:lastAuto:${acc.id}`;
    let last = 0;
    try { last = +localStorage.getItem(key) || 0; } catch (e) {}
    if (Date.now() - last < AUTO_EVERY) return;
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
    const errors = [];
    for (const u of SOLD_URLS) {
      try {
        // window.fetch : la réponse est captée et traitée comme celle de la page
        const r = await window.fetch(u, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (r.ok) return;
        errors.push(`${u.split('?')[0]} : HTTP ${r.status}`);
      } catch (e) { errors.push(`${u.split('?')[0]} : ${e}`); }
    }
    post({ probe: { at: new Date().toISOString(), path: location.pathname, autoCheck: errors } });
  }
  window.addEventListener('load', () => {
    setTimeout(autoCheck, 6000);
    setInterval(autoCheck, 5 * 60 * 1000);
  });

  let scanTimer = null;
  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = null; scanOrders(); }, 2000);
  };
  window.addEventListener('load', () => {
    scheduleScan();
    // Changement d'onglet (Toutes / En cours / Finalisées) ou navigation interne
    new MutationObserver(() => { if (/my_orders/.test(location.pathname)) scheduleScan(); })
      .observe(document.body, { childList: true, subtree: true });
  });

  // Données rendues côté serveur (premier chargement de la page)
  document.addEventListener('DOMContentLoaded', () => {
    if (!PAGES.test(location.pathname)) return;
    const el = document.getElementById('__NEXT_DATA__');
    if (!el) return;
    try { post({ url: location.href + '#__NEXT_DATA__', data: JSON.parse(el.textContent) }); } catch (e) {}
  });
})();
