# 📦 Achat-Revente

> **Laney** — Application web progressive (PWA) de suivi d'achat-revente — vêtements, électronique, jeux vidéo, jouets, décoration et plus encore. Synchronisée en temps réel sur tous vos appareils.

![Preview](https://img.shields.io/badge/version-2.0-blue) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e) ![Vercel](https://img.shields.io/badge/Deployed-Vercel-black) ![License](https://img.shields.io/badge/license-MIT-green)

---

## 📸 Aperçu

![Aperçu de l'application](assets/screenshot.png)

<p align="center">
  <a href="assets/screenshot-mois.png"><img src="assets/screenshot-mois.png" width="30%" alt="Par mois"/></a>&nbsp;&nbsp;
  <a href="assets/screenshot-articles.png"><img src="assets/screenshot-articles.png" width="30%" alt="Articles"/></a>&nbsp;&nbsp;
  <a href="assets/screenshot-login.png"><img src="assets/screenshot-login.png" width="30%" alt="Login"/></a>
</p>

---

## ✨ Fonctionnalités

- 📊 **Tableau de bord** avec statistiques en temps réel (bénéfice, ROI, recettes)
- 📈 **Graphiques avec valeurs affichées** — flux mensuel, bénéfice cumulé, catégories vendues, top plus-values
- 🎯 **Objectif mensuel** — jauge de progression des recettes, synchronisée sur tous les appareils via Supabase. En mode All, l'objectif est la somme des objectifs de chaque boutique
- 📋 **Gestion des articles** — ajout, modification, vente, annulation de vente, suppression
- 🏷️ **Catégories** — 12 types d'articles au choix (vêtements, électronique, jeux vidéo, consoles, jouets, décoration, outils…)
- ✏️ **Modification complète** — cliquez sur le nom d'un article pour modifier son nom, catégorie, prix, dates, SKU, N° commande, grossiste et ID
- 🔖 **SKU & N° commande** — champs optionnels sur chaque article, affichés en orange sous le nom avec bouton copie en un clic
- 🆔 **ID unique par article** — identifiant optionnel et unique par article, affiché en badge bleu sous le nom. Générateur intégré (⚡ Générer) qui produit un code de 6 caractères garanti non utilisé. La saisie manuelle est aussi possible ; l'application bloque toute collision
- 🏭 **Grossiste** — champ optionnel pour noter la source d'achat (Aliexpress, Temu, Brocante…), visible en colonne dans Articles et dans Stock par SKU
- 🔢 **Ajout en quantité** — sélecteur `−/+` dans le formulaire d'ajout pour créer N exemplaires identiques en un clic (chaque exemplaire est une ligne indépendante, vendable séparément). Design pill avec chiffre contrasté
- 📦 **Suivi du stock** — capital immobilisé, taux de rotation, prix par article affiché, défilement complet
- 📊 **Stock par SKU** — regroupement automatique des articles en stock par SKU, avec grossiste, quantité, valeur unitaire et valeur totale. SKU en badge orange avec bouton copie. Défilement horizontal sur mobile, colonnes jamais tronquées
- 🔄 **Synchronisation temps réel** — toutes vos modifications apparaissent instantanément sur tous vos appareils
- 🔒 **Authentification sécurisée** — email + mot de passe via Supabase Auth, base de données verrouillée par RLS
- 📱 **PWA installable** — fonctionne comme une vraie app sur iPhone, Android, Mac et PC
- 🌙 **Design sombre** — interface soignée optimisée mobile et desktop
- ⚡ **Mise à jour instantanée** — l'interface se rafraîchit automatiquement après chaque action sans rechargement
- 🔍 **Recherche étendue** — barre de recherche dans le header (desktop) et sous la nav (mobile) ; cherche dans le **nom**, le **SKU**, le **N° commande**, le **grossiste** et l'**ID**
- 🏪 **Multi-boutiques** — plusieurs activités séparées (Brocante, Vinted, Leboncoin…), chacune avec ses propres articles, stats et bilans. Basculez d'une boutique à l'autre en un clic. Ordre personnalisable par glisser-déposer, synchronisé sur tous les appareils. Le bouton Ajouter est masqué en mode All
- 🔽 **Filtres Articles** — filtrer par statut (stock/vendu), par catégorie, par **grossiste** (liste dynamique) et trier par plus-value, prix, date ou nom
- 📅 **Bilan mensuel et annuel** — articles achetés et vendus listés séparément, stats complètes, top plus-values, camembert catégories
- 📤 **Export Excel** — bouton de téléchargement dans le header, génère un fichier avec 4 onglets : Articles (avec SKU, N° commande, grossiste, boutique), Résumé, Bilan mensuel, Stock par SKU
- 🗓️ **Calendrier personnalisé** — sélecteur de date sur mesure (navigation mois par mois, aujourd'hui mis en valeur, sélection en un clic)
- 🧾 **Onglet URSSAF** — aide à la déclaration auto-entrepreneur : CA calculé automatiquement par mois (mois en cours + 2 mois précédents), cotisations estimées (12,3 % + 0,1 % CFP), marquage "Déclaré" sauvegardé dans Supabase. Toggle par boutique pour inclure ou exclure ses ventes
- 🎯 **Radar marques** — suivez vos marques niches, notez leur intérêt d'achat de 1 à 7 étoiles, visualisez vos trouvailles et bénéfices moyens par marque. Alerte automatique à l'ajout d'un article si la marque est dans le Radar

---

## 🛠️ Stack technique

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Frontend** | HTML / CSS / JavaScript vanilla | Interface utilisateur |
| **Base de données** | [Supabase](https://supabase.com) (PostgreSQL) | Stockage et synchronisation des données |
| **Auth** | Supabase Auth | Authentification sécurisée |
| **Hébergement** | [Vercel](https://vercel.com) | Déploiement automatique |
| **Graphiques** | [Chart.js](https://chartjs.org) + chartjs-plugin-datalabels | Visualisation des données avec valeurs |
| **Polices** | DM Sans + DM Mono (Google Fonts) | Typographie |

---

## 🚀 Déployer votre propre instance

### Prérequis

- Un compte [GitHub](https://github.com) (gratuit)
- Un compte [Supabase](https://supabase.com) (gratuit)
- Un compte [Vercel](https://vercel.com) (gratuit)

---

### Étape 1 — Télécharger les fichiers du projet

1. Sur cette page GitHub, cliquez sur **Code** (bouton vert en haut à droite)
2. Cliquez **Download ZIP**
3. Extrayez le ZIP sur votre ordinateur
4. Vous obtenez un dossier avec tous les fichiers du projet

---

### Étape 2 — Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → **Start your project**
2. Connectez-vous avec GitHub ou Google
3. Créez un nouveau projet :
   - **Nom** : `achat-revente`
   - **Région** : `West EU (Ireland)` (ou la plus proche de vous)
   - **Mot de passe** : générez-en un fort (vous n'en aurez pas besoin)
4. Attendez que le projet soit prêt (~1 minute)

---

### Étape 3 — Créer la table articles

Dans Supabase → **SQL Editor** → collez ce code et cliquez **Run** :

```sql
-- Création de la table
CREATE TABLE articles (
  id bigserial PRIMARY KEY,
  nom text NOT NULL,
  prix_achat numeric NOT NULL,
  date_achat date NOT NULL,
  prix_revente numeric,
  date_revente date,
  categorie text,
  boutique_id bigint,
  sku text,
  num_commande text,
  grossiste text,
  identifiant text UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Activation de la sécurité RLS
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Politiques : accès uniquement aux utilisateurs authentifiés
CREATE POLICY "Auth lecture"      ON articles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insertion"    ON articles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth modification" ON articles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth suppression"  ON articles FOR DELETE TO authenticated USING (true);

-- Droits API
GRANT SELECT, INSERT, UPDATE, DELETE ON articles TO authenticated;
GRANT SELECT ON articles TO anon;
GRANT ALL ON articles TO service_role;
GRANT USAGE, SELECT ON SEQUENCE articles_id_seq TO authenticated;
```

---

### Étape 4 — Exposer la table dans l'API

1. Dans Supabase → **Integrations** → **Data API** → onglet **Settings**
2. Dans **"Exposed tables"** → sélectionnez `articles`
3. Cliquez **Save**

---

### Étape 5 — Récupérer les clés Supabase

Dans Supabase → **Settings** → **API Keys** :

- **Project URL** : `https://xxxxxxxxxxxx.supabase.co`
- **Anon / Public key** : `eyJhbGci...` *(clé longue commençant par eyJ)*

Notez ces deux valeurs, vous en aurez besoin à l'étape suivante.

---

### Étape 6 — Configurer le code

Ouvrez le fichier `app.js` (dans le dossier téléchargé à l'étape 1) et modifiez les deux premières lignes :

```javascript
const SUPABASE_URL = 'https://VOTRE-URL.supabase.co';   // ← votre Project URL
const SUPABASE_KEY = 'VOTRE_CLE_ANON';                  // ← votre Anon key
```

Sauvegardez le fichier.

---

### Étape 7 — Déployer sur GitHub

1. Allez sur [github.com](https://github.com) → **New repository**
2. Nom : `achat-revente` → **Public** → **Create**
3. Uploadez tous les fichiers du projet via **"Add file → Upload files"** :
   - `index.html`
   - `style.css`
   - `app.js` *(celui que vous venez de modifier)*
   - `manifest.json`
   - `vercel.json`
   - le dossier `assets/` *(remplacez les icônes par les vôtres)*
4. Cliquez **Commit changes**

---

### Étape 8 — Déployer sur Vercel

1. Allez sur [vercel.com](https://vercel.com) → connectez-vous avec GitHub
2. **Add New Project** → sélectionnez votre repo `achat-revente`
3. Cliquez **Deploy** (aucune configuration nécessaire)
4. Vercel vous donne une URL : `achat-revente-XXXX.vercel.app` 🎉 — **notez-la**

---

### Étape 9 — Configurer l'URL dans Supabase Auth

> ⚠️ Cette étape est importante — sans elle, les emails d'invitation pointent vers `localhost:3000` et ne fonctionnent pas.

1. Dans Supabase → **Authentication** → **URL Configuration**
   - **Site URL** : `https://VOTRE-APP.vercel.app` *(l'URL obtenue à l'étape 8)*
   - **Redirect URLs** : `https://VOTRE-APP.vercel.app`
   - Cliquez **Save**

---

### Étape 10 — Créer votre compte utilisateur

1. Dans Supabase → **Authentication** → **Users** → cliquez **"Add user"**
2. Renseignez votre **email** et un **mot de passe**
3. Cliquez **"Create user"**

> Le mot de passe est hashé en **bcrypt** par Supabase — il ne sera jamais stocké en clair.

---

### Étape 11 — Installer sur téléphone (optionnel)

**Sur iPhone/iPad (Safari uniquement) :**
1. Ouvrez votre URL dans Safari
2. Appuyez sur l'icône **Partager** (carré avec flèche)
3. **"Sur l'écran d'accueil"** → **Ajouter**

**Sur Android (Chrome) :**
1. Ouvrez votre URL dans Chrome
2. Menu ⋮ → **"Ajouter à l'écran d'accueil"**

---

## 📁 Structure du projet

```
achat-revente/
├── index.html        # Structure HTML + modales
├── style.css         # Styles (thème sombre, responsive)
├── app.js            # Logique applicative + connexion Supabase
├── manifest.json     # Configuration PWA
├── vercel.json       # Configuration déploiement Vercel
├── README.md         # Ce fichier
└── assets/           # Icônes et captures d'écran (à remplacer par les vôtres)
    ├── favicon.png          # Icône onglet navigateur
    ├── favicon-64.png       # Icône header app
    ├── apple-touch-icon.png # Icône iPhone/iPad
    ├── icon-192.png         # Icône Android
    ├── icon-512.png         # Icône haute résolution
    ├── screenshot.png       # Capture d'écran README
    ├── screenshot-mois.png
    ├── screenshot-articles.png
    └── screenshot-login.png
```

> **Icônes** : remplacez les fichiers dans `assets/` par vos propres images pour personnaliser l'app. Les captures d'écran ne sont utilisées que dans ce README.

---

## 🔒 Sécurité

- **Authentification** : Supabase Auth (email + mot de passe, tokens JWT)
- **Base de données** : Row Level Security (RLS) — aucune donnée accessible sans authentification
- **Mot de passe** : hashé en bcrypt dans Supabase, jamais stocké en clair
- **Code source** : aucune donnée sensible — seule la clé `anon` publique est présente (elle est conçue pour être exposée)

---

## 🏗️ Architecture

```
┌─────────────┐     déploiement auto     ┌─────────────┐
│   GitHub    │ ─────────────────────▶   │   Vercel    │
│  (code)     │                          │ (hébergeur) │
└─────────────┘                          └──────┬──────┘
                                                │ interface
                                                ▼
                                         ┌─────────────┐
                                         │    Vous     │
                                         │ (navigateur)│
                                         └──────┬──────┘
                                                │ données
                                                ▼
                                         ┌─────────────┐
                                         │  Supabase   │
                                         │ (PostgreSQL)│
                                         └─────────────┘
```

- **GitHub** = coffre-fort du code (historique, versioning)
- **Vercel** = publie l'app sur Internet, redéploie automatiquement à chaque modification GitHub
- **Supabase** = base de données cloud, synchronisation temps réel entre tous vos appareils

---

## 📊 Importer des données existantes

Si vous avez déjà des articles à importer, créez un fichier SQL avec ce format et collez-le dans le **SQL Editor** de Supabase :

```sql
INSERT INTO articles (nom, prix_achat, date_achat, prix_revente, date_revente, categorie) VALUES
('Veste Adidas', 5, '2025-06-01', 18, '2025-09-10', 'Vêtements'),
('Jean Levi''s 501', 3, '2025-06-15', NULL, NULL, 'Vêtements'),
('PS5', 200, '2025-07-01', 350, '2025-08-20', 'Consoles'),
('Perceuse Bosch', 15, '2025-08-01', NULL, NULL, 'Outils');
```

> Les catégories disponibles sont : `Vêtements`, `Chaussures`, `Jeux vidéo`, `Consoles`, `Électronique`, `Jouets`, `Décoration`, `Ustensiles`, `Outils`, `Livres`, `Sport`, `Accessoires`, `Autres`

---

## 🔧 Migrations (instances existantes)

Si vous avez déjà installé une version antérieure de l'app, appliquez ces migrations dans Supabase → **SQL Editor** selon la version dont vous partez.

### Ajouter les colonnes boutique, SKU, N° commande, Grossiste

```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS boutique_id bigint;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS num_commande text;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS grossiste text;
```

### Ajouter la colonne ID unique (v2.0)

```sql
ALTER TABLE articles ADD COLUMN IF NOT EXISTS identifiant TEXT UNIQUE;
```

### Créer la table boutiques (multi-boutiques)

```sql
CREATE TABLE boutiques (
  id bigserial PRIMARY KEY,
  nom text NOT NULL,
  couleur text DEFAULT '#185FA5',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE boutiques ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth lecture"      ON boutiques FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insertion"    ON boutiques FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth modification" ON boutiques FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth suppression"  ON boutiques FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON boutiques TO authenticated;
GRANT SELECT ON boutiques TO anon;
GRANT ALL ON boutiques TO service_role;
GRANT USAGE, SELECT ON SEQUENCE boutiques_id_seq TO authenticated;

-- Assigner les articles existants à la boutique par défaut
INSERT INTO boutiques (nom, couleur) VALUES ('Brocante', '#185FA5');
UPDATE articles SET boutique_id = 1 WHERE boutique_id IS NULL;
```

> N'oubliez pas d'exposer la table `boutiques` dans **Integrations → Data API → Settings → Exposed tables**.

### Créer la table settings (objectif mensuel)

```sql
CREATE TABLE settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth lecture"      ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insertion"    ON settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth modification" ON settings FOR UPDATE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO authenticated;
GRANT SELECT ON settings TO anon;
GRANT ALL ON settings TO service_role;
```

> N'oubliez pas d'exposer la table `settings` dans **Integrations → Data API → Settings → Exposed tables**.

### Créer la table marques_niches (Radar)

```sql
CREATE TABLE marques_niches (
  id bigserial PRIMARY KEY,
  nom text NOT NULL,
  categorie text,
  rarete integer DEFAULT 4 CHECK (rarete >= 1 AND rarete <= 7),
  prix_min numeric NOT NULL,
  prix_max numeric NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE marques_niches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth lecture"      ON marques_niches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insertion"    ON marques_niches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth modification" ON marques_niches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth suppression"  ON marques_niches FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON marques_niches TO authenticated;
GRANT SELECT ON marques_niches TO anon;
GRANT ALL ON marques_niches TO service_role;
GRANT USAGE, SELECT ON SEQUENCE marques_niches_id_seq TO authenticated;
```

> N'oubliez pas d'exposer la table `marques_niches` dans **Integrations → Data API → Settings → Exposed tables**.

### Accorder les droits API (obligatoire depuis mai 2026)

Depuis le 30 mai 2026, Supabase exige des `GRANT` explicites pour exposer les tables via l'API. Dans **SQL Editor** → **Run** :

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON articles TO authenticated;
GRANT SELECT ON articles TO anon;
GRANT ALL ON articles TO service_role;
GRANT USAGE, SELECT ON SEQUENCE articles_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO authenticated;
GRANT SELECT ON settings TO anon;
GRANT ALL ON settings TO service_role;
```

> Sans ces `GRANT`, les tables ne seront plus accessibles via l'API après le **30 octobre 2026**.

---

## ❓ Problèmes fréquents

| Problème | Solution |
|----------|----------|
| L'app affiche "Hors ligne" | Vérifiez vos clés Supabase dans `app.js` et que la table `articles` est bien exposée dans Data API → Settings |
| Le lien d'invitation pointe vers `localhost:3000` | Configurez l'URL Vercel dans Supabase → Authentication → URL Configuration **avant** d'envoyer l'invitation |
| Les données ne s'affichent pas | Vérifiez que les politiques RLS ont bien été créées via le SQL Editor |
| Erreur 401 / accès refusé | Reconnectez-vous — la session a peut-être expiré |
| L'app reste bloquée sur l'écran AR | Vérifiez la console du navigateur (F12) — souvent une erreur de syntaxe dans `app.js` ou des clés Supabase incorrectes |
| Les graphiques ne s'affichent pas | Vérifiez que le script `chartjs-plugin-datalabels` est bien chargé dans `index.html` avant `app.js` |
| L'objectif mensuel se remet à zéro | Vérifiez que la table `settings` est bien créée et exposée dans Supabase Data API |
| Le bilan ne s'affiche pas | Vérifiez que des articles ont bien des dates de vente renseignées pour le mois/année sélectionné |
| La recherche mobile ne s'affiche pas | Vérifiez que `style.css` est bien à jour — le `display:none` de base a été supprimé en v1.5 |
| Les boutiques ne s'affichent pas | Vérifiez que la table `boutiques` est bien créée, exposée dans Data API, et que les articles existants ont bien un `boutique_id` assigné |
| L'export Excel ne se télécharge pas | Vérifiez que le script SheetJS est bien chargé dans `index.html` |
| SKU / N° commande / Grossiste ne se sauvegardent pas | Exécutez la migration correspondante dans le SQL Editor (voir section Migrations) |
| L'ID ne se sauvegarde pas | Exécutez `ALTER TABLE articles ADD COLUMN IF NOT EXISTS identifiant TEXT UNIQUE;` dans le SQL Editor |
| Message "Cet ID est déjà utilisé" | Chaque article doit avoir un identifiant différent — utilisez le bouton ⚡ Générer pour en créer un automatiquement |
| Message "L'ID ne peut être assigné qu'à un seul article" | Lors d'un ajout en quantité (qty > 1), l'ID est désactivé — ajoutez d'abord les articles, puis assignez un ID à chacun via Modifier |
| L'onglet URSSAF affiche 0€ partout | Vérifiez que des articles ont une `date_revente` renseignée pour les mois affichés, et que la boutique n'est pas désactivée (toggle URSSAF) |
| Le filtre Grossiste est vide | Normal si aucun article n'a de grossiste renseigné — la liste se peuple automatiquement dès qu'un grossiste est saisi sur un article |
| Erreur API après oct. 2026 | Exécutez les `GRANT` explicites dans le SQL Editor (voir section Migrations) |

---

## 📝 Changelog

### v2.0 — 22 Juillet 2026

- 🆔 **ID unique par article** — nouveau champ optionnel `identifiant` sur chaque article. Chaque ID est unique : l'application bloque toute collision à la saisie et à la sauvegarde
- ⚡ **Générateur d'ID** — bouton intégré dans les formulaires d'ajout et de modification, génère un code de 6 caractères alphanumériques garanti non utilisé
- 🔍 **Recherche par ID** — la barre de recherche cherche maintenant aussi dans l'ID
- 🏷️ **Badge ID** — affiché en bleu sous le nom de l'article dans la liste Articles
- 🎨 **Sélecteur de quantité redesigné** — forme pill avec chiffre en bloc sombre contrasté, boutons `−/+` plus larges et plus lisibles
- 📊 **Stock par SKU** — défilement horizontal sur mobile, colonnes SKU et articles jamais tronquées (`width:max-content`), noms d'articles dédupliqués quand plusieurs exemplaires du même article partagent un SKU

### v1.9 — 20 Juillet 2026

- 🏭 **Champ Grossiste** — nouveau champ optionnel sur chaque article (Aliexpress, Temu, Brocante…), disponible à l'ajout et en modification
- 📋 **Colonne Grossiste dans Articles** — visible directement dans le tableau entre Catégorie et Achat
- 🔢 **Ajout en quantité** — sélecteur `−/+` dans le formulaire d'ajout pour créer N exemplaires identiques en une seule action ; chaque exemplaire est une ligne indépendante avec son propre bouton Vendu
- 🔍 **Recherche étendue** — la barre de recherche cherche maintenant dans le nom, le SKU, le N° commande **et** le grossiste
- 🔽 **Filtre Grossiste** — nouveau menu déroulant dans la barre de filtres Articles, peuplé dynamiquement depuis vos articles, mis à jour en temps réel après chaque ajout/modification
- 📊 **Stock par SKU enrichi** — nouvelles colonnes Grossiste et Valeur à l'unité (fourchette si prix différents) ; SKU en badge orange avec bouton copie
- 📤 **Export Excel mis à jour** — colonne Grossiste dans la feuille Articles + 4ᵉ feuille Stock par SKU avec grossiste et valeurs unitaires
- 🐛 Fix : saccade visuelle entre les colonnes +Value et Statut/Actions corrigée (wrapper div dans `td-actions`)
- 🐛 Fix : bouton Ajouter masqué en mode All (impossible d'ajouter un article sans boutique sélectionnée)
- 🐛 Fix : `addArticle()` utilise désormais `.insert().select()` pour récupérer exactement les lignes insérées, sans risque de conflit avec des articles homonymes

### v1.8 — 16 Juillet 2026

- 🧾 **Onglet URSSAF** — aide à la déclaration auto-entrepreneur : CA mensuel par boutique, cotisations estimées (12,3 % cotisations sociales + 0,1 % CFP), mois en cours + 2 mois précédents, marquage "Déclaré" avec date, nettoyage automatique des mois expirés
- 🔀 **Toggle URSSAF par boutique** — activez/désactivez la déclaration URSSAF pour une boutique spécifique via un switch ; les 3 cartes mensuelles se grisent quand désactivé
- 🔖 **Champ SKU** — identifiant article optionnel (ex : `VEST-ADI-001`), sauvegardé en base, affiché en orange sous le nom avec bouton copie
- 📋 **Champ N° commande** — référence commande optionnelle (ex : `CMD-2024-001`), même traitement que le SKU
- 📊 **Stock par SKU** — nouvelle section dans l'onglet Stock : articles regroupés par SKU avec quantité en stock et valeur totale
- 📅 **Calendrier personnalisé** — remplacement du sélecteur de date natif par un calendrier sur mesure : navigation mois par mois, aujourd'hui cerclé en bleu, date sélectionnée en fond bleu, bouton effacer pour les dates optionnelles
- 🔍 **Recherche redessinée** — dropdown plus large, nom complet sans troncature, prix d'achat → vente et plus-value lisibles d'un coup d'œil
- 📅 **Bilan : articles vendus** — listes "Articles achetés" et "Articles vendus" côte à côte, aussi bien en bilan mensuel qu'annuel
- 📱 **Mobile : boutiques au-dessus des onglets** — les pills de boutique et la barre de recherche s'affichent maintenant au-dessus des onglets Vue d'ensemble / Par mois / etc.
- 🔃 **Ordre des boutiques synchronisé** — le glisser-déposer sur PC se reflète sur mobile via Supabase (clé `boutique_order` dans la table `settings`)
- 🐛 Fix : bouton Vendu aligné avec Annuler sur toutes les lignes du tableau Articles

### v1.7 — 27 Mai 2026
- 🎯 **Radar marques** — nouvel onglet pour suivre les marques niches à surveiller en brocante
- ⭐ Système de notation **1 à 7 étoiles** "Intérêt d'achat" (de Bof à Pépite !)
- 🔗 Détection automatique des articles achetés appartenant à une marque du Radar
- 🔔 Alerte à l'ajout d'un article si la marque est dans le Radar (avec fourchette Vinted)
- 🐛 Fix : correspondance des marques insensible aux variantes d'apostrophe (`'` vs `'`)
- 🐛 Fix : formulaire Radar — champs pleine largeur pour éviter le débordement du select

### v1.6 — 25 Mai 2026
- 🏪 Système **multi-boutiques** — séparez vos activités (Brocante, Vinted, Leboncoin…)
- Toggle dans le header pour basculer entre boutiques en un clic
- Bouton `+` pour créer une nouvelle boutique à tout moment
- Chaque boutique a ses propres articles, statistiques et bilans
- Disponible aussi sur mobile (sous la barre de recherche)
- Boutique active mémorisée entre les sessions

### v1.5 — 16 Mai 2026
- 🔍 Recherche globale dans le header (desktop) et sous la nav (mobile)
- 🔽 Filtres dans Articles : statut, catégorie, tri (plus-value, prix, date, nom)
- 📅 Bilan amélioré : sélecteur Année → Mois, tous les mois visibles (achats ou ventes)
- 📤 Export Excel avec 3 onglets : Articles complets, Résumé global, Bilan mensuel

### v1.4 — 14 Mai 2026
- 📅 Onglet **Bilan** avec sous-onglets Mois / Année
  - Bilan mensuel : 6 métriques, camembert catégories, top 5 plus-values, liste articles achetés
  - Bilan annuel : 6 métriques, camembert catégories, graphique mensuel, top 10 plus-values, meilleur mois
  - Navigation par menu déroulant
- 🔐 `GRANT` explicites ajoutés pour conformité Supabase (deadline oct. 2026)

### v1.3 — 12 Mai 2026
- ⚡ Mise à jour instantanée de l'interface après chaque action (sans rechargement réseau)
- 🎯 Objectif mensuel sauvegardé dans Supabase (synchronisé sur tous les appareils)
- 🏷️ Catégorie correctement enregistrée lors de l'ajout d'un article
- 📝 Renommage de l'app en **Laney**

### v1.2 — 10 Mai 2026
- 🎯 Jauge d'objectif mensuel (recettes) modifiable depuis l'app
- 📊 Valeurs affichées directement sur tous les graphiques (sans survol)
- 📦 Stock : affichage de tous les articles avec prix à droite, défilement complet
- ✏️ Modification d'un article en cliquant sur son nom dans le tableau
- 🏷️ 12 catégories de produits sélectionnables à l'ajout et à la modification
- 🔒 Authentification Supabase Auth (email + mot de passe) avec RLS
- 🔑 Bouton de déconnexion dans le header
- 🔄 Bouton d'actualisation manuelle dans le header

### v1.1 — 28 Avril 2026
- Catégories d'articles (12 types)
- Modification complète d'un article (nom, prix, dates, catégorie)
- Scroll horizontal sur le tableau Articles en mobile

### v1.0 — 25 Avril 2026
- Lancement initial
- Tableau de bord, graphiques, gestion stock
- PWA installable, synchronisation temps réel Supabase

---

## 🤝 Contribution

Ce projet est open-source. N'hésitez pas à fork, améliorer et partager !

---

*Construit avec ❤️ et Claude AI*
