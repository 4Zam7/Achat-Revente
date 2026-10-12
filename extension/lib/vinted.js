// ─── LECTURE DES DONNÉES VINTED ─────────────────────────────────────────────
// Transforme les réponses captées en événements :
//   { type: 'sale', vid, title, amount, date, buyer }   — article vendu
//   { type: 'cash', vid, txId, title, amount, date }    — argent reçu dans le porte-monnaie
// Le format exact de l'API Vinted n'étant pas documenté, la lecture est
// volontairement tolérante (plusieurs noms de champs possibles).

const CANCELLED = /annul|cancel|rembours|refund|expired|expir/i;
const NOT_INCOME = /retrait|virement|withdraw|payout|rembours|refund|achat|purchase|frais|fee/i;

export function amountOf(x) {
  if (x == null) return null;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') {
    const n = parseFloat(x.replace(',', '.').replace(/[^\d.-]/g, ''));
    return isNaN(n) ? null : n;
  }
  if (typeof x === 'object') return amountOf(x.amount ?? x.value ?? x.total);
  return null;
}

export function dateOf(x) {
  if (x == null || x === '') return null;
  if (typeof x === 'number') {
    const d = new Date(x < 1e12 ? x * 1000 : x);
    return isNaN(d) ? null : localISO(d);
  }
  if (typeof x === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(x)) {
      // Avec heure et fuseau : on convertit en date locale
      if (x.length > 10) { const d = new Date(x); if (!isNaN(d)) return localISO(d); }
      return x.slice(0, 10);
    }
    const d = new Date(x);
    return isNaN(d) ? null : localISO(d);
  }
  return null;
}

function localISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const first = (...vals) => vals.find(v => v != null && v !== '');

// Parcourt le JSON et renvoie les tableaux d'objets avec le nom de leur clé
function arraysOf(node, key = '', out = [], depth = 0) {
  if (depth > 8 || node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    if (node.length && node.every(x => x && typeof x === 'object' && !Array.isArray(x))) out.push({ key, items: node });
    node.forEach(x => arraysOf(x, key, out, depth + 1));
  } else {
    Object.entries(node).forEach(([k, v]) => arraysOf(v, k, out, depth + 1));
  }
  return out;
}

function normalizeOrder(o) {
  const item = Array.isArray(o.items) && o.items.length === 1 ? o.items[0] : (o.item || {});
  const vid = first(o.transaction_id, o.transaction && o.transaction.id, o.id);
  const title = first(o.title, o.item_title, item.title);
  const amount = amountOf(first(o.item_price, o.price, item.price, o.total_item_price, o.total_price));
  const date = dateOf(first(o.date, o.created_at, o.created_at_ts, o.updated_at, o.transaction && o.transaction.created_at));
  const status = String(first(o.status, o.transaction_user_status, o.status_title, '') || '');
  const buyerObj = first(o.opposite_user, o.buyer, o.user) || {};
  const buyer = first(buyerObj.login, buyerObj.username, o.buyer_login, o.opposite_user_login) || null;
  if (vid == null || !title || !(amount > 0) || !date) return null;
  if (CANCELLED.test(status)) return null;
  return { type: 'sale', vid: String(vid), title: String(title), amount, date, buyer, status };
}

function normalizeWalletLine(l) {
  const amount = amountOf(first(l.amount, l.price, l.total, l.value));
  const date = dateOf(first(l.date, l.created_at, l.created_at_ts, l.time));
  const title = String(first(l.title, l.description, l.subtitle, l.name, '') || '');
  const kind = String(first(l.type, l.entity_type, l.line_type, '') || '');
  const txId = first(l.transaction_id, l.entity_id, l.transaction && l.transaction.id);
  const vid = first(l.id, txId != null ? `${txId}-${date}` : null);
  if (vid == null || !(amount > 0) || !date || (!title && txId == null)) return null;
  if (NOT_INCOME.test(title) || /debit|withdraw|payout|purchase|fee/i.test(kind)) return null;
  if (l.is_debit === true || l.direction === 'out' || l.sign === '-') return null;
  return { type: 'cash', vid: String(vid), txId: txId != null ? String(txId) : null, title, amount, date };
}

// Fiche d'une transaction (/api/v2/transactions/:id), reçue à l'ouverture
// d'une conversation. On ne garde que les ventes (user_side = seller).
function parseTransaction(t) {
  if (!t || t.user_side !== 'seller' || t.id == null) return [];
  const status = String(t.status_title || '');
  if (CANCELLED.test(status)) return [];
  const order = t.order || {};
  const title = first(t.item_title, order.title);
  const amount = amountOf(first(t.offer && t.offer.price, t.total_amount_without_tax,
    order.items && order.items.length === 1 ? order.items[0].price : null));
  const date = dateOf(first(t.debit_processed_at, t.offer && t.offer.created_at, t.status_updated_at));
  if (!title || !(amount > 0) || !date) return [];
  const account = t.seller_id ? { id: String(t.seller_id), login: (t.seller && t.seller.login) || null } : null;
  const base = { vid: String(t.id), title: String(title), amount, account };
  const items = first(t.items_count, order.item_count) || 1;
  const buyer = first(t.buyer && t.buyer.login, t.opposite_user && t.opposite_user.login,
    order.buyer && order.buyer.login, t.buyer_login) || null;
  const events = [{ ...base, type: 'sale', date, buyer, status, items }];
  // Transaction finalisée : l'argent est versé dans le porte-monnaie
  if (/finalis|termin|complet/i.test(status)) {
    events.push({ ...base, type: 'cash', vid: `tx-${t.id}`, txId: String(t.id), date: dateOf(t.status_updated_at) || date });
  }
  return events;
}

export function parseCapture(url, page, data) {
  if (data && data.transaction) return parseTransaction(data.transaction);
  const ctx = `${url} ${page}`;
  const events = [];
  const isOrders = /order|transaction/i.test(url) || /my_orders/i.test(page);
  const isSold = /sold|sales|vendu/i.test(ctx);
  const isWallet = /wallet|invoice|balance/i.test(ctx);

  for (const { key, items } of arraysOf(data)) {
    if (isOrders && isSold && /orders|transactions/i.test(key)) {
      items.forEach(o => { const e = normalizeOrder(o); if (e) events.push(e); });
    } else if (isWallet && !/orders/i.test(key)) {
      items.forEach(l => { const e = normalizeWalletLine(l); if (e) events.push(e); });
    }
  }
  return events;
}
