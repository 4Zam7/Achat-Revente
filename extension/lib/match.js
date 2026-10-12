// ─── RAPPROCHEMENT VINTED ↔ ARTICLES LANEY ──────────────────────────────────

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const tokens = s => new Set(norm(s).split(' ').filter(t => t.length > 1));

function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

// Le SKU ou l'ID de l'article apparaît-il dans le titre Vinted ?
function codeHit(title, article) {
  const t = ` ${norm(title)} `;
  return [article.sku, article.identifiant]
    .map(norm)
    .some(c => c.length >= 3 && t.includes(` ${c} `));
}

// Score de 0 à 1 : 1 = SKU/ID trouvé, 0.95 = même titre, sinon ressemblance des mots
export function score(title, article) {
  if (codeHit(title, article)) return 1;
  if (norm(title) && norm(title) === norm(article.nom)) return 0.95;
  return jaccard(title, article.nom) * 0.85;
}

export const SURE = 0.95;

// Classe les articles candidats du plus probable au moins probable
export function rank(title, articles) {
  return articles
    .map(a => ({ article: a, score: score(title, a) }))
    .sort((x, y) => y.score - x.score || byOldest(x.article, y.article));
}

// Exemplaires identiques : on vend en priorité le plus ancien acheté
function byOldest(a, b) {
  const da = a.date_achat || '9999', db = b.date_achat || '9999';
  return da.localeCompare(db) || a.id - b.id;
}

const sameModel = (a, b) => norm(a.nom) === norm(b.nom) && norm(a.sku) === norm(b.sku);

// Choix automatique : uniquement si le meilleur résultat est sûr et que les
// éventuels ex æquo sont des exemplaires du même modèle (interchangeables).
export function sureMatch(ranked) {
  if (!ranked.length || ranked[0].score < SURE) return null;
  const top = ranked.filter(r => r.score === ranked[0].score);
  return top.every(r => sameModel(r.article, top[0].article)) ? top[0].article : null;
}

export function daysBetween(a, b) {
  return Math.abs((new Date(a) - new Date(b)) / 86400000);
}
