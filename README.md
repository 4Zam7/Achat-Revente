# 📦 Achat-Revente

> Application web progressive (PWA) de suivi d'achat-revente de vêtements et articles — synchronisée en temps réel sur tous vos appareils.

![Preview](https://img.shields.io/badge/version-1.0-blue) ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e) ![Vercel](https://img.shields.io/badge/Deployed-Vercel-black) ![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Fonctionnalités

- 📊 **Tableau de bord** avec statistiques en temps réel (bénéfice, ROI, recettes)
- 📈 **Graphiques** — flux mensuel, bénéfice cumulé, catégories vendues, top plus-values
- 📋 **Gestion des articles** — ajout, vente, annulation de vente, suppression
- 📦 **Suivi du stock** — capital immobilisé, taux de rotation
- 🔄 **Synchronisation temps réel** — toutes vos modifications apparaissent instantanément sur tous vos appareils
- 🔒 **Authentification sécurisée** — email + mot de passe via Supabase Auth, base de données verrouillée par RLS
- 📱 **PWA installable** — fonctionne comme une vraie app sur iPhone, Android, Mac et PC
- 🌙 **Design sombre** — interface soignée optimisée mobile et desktop

---

## 🛠️ Stack technique

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Frontend** | HTML / CSS / JavaScript vanilla | Interface utilisateur |
| **Base de données** | [Supabase](https://supabase.com) (PostgreSQL) | Stockage et synchronisation des données |
| **Auth** | Supabase Auth | Authentification sécurisée |
| **Hébergement** | [Vercel](https://vercel.com) | Déploiement automatique |
| **Graphiques** | [Chart.js](https://chartjs.org) | Visualisation des données |
| **Polices** | DM Sans + DM Mono (Google Fonts) | Typographie |

---

## 🚀 Déployer votre propre instance

### Prérequis

- Un compte [GitHub](https://github.com) (gratuit)
- Un compte [Supabase](https://supabase.com) (gratuit)
- Un compte [Vercel](https://vercel.com) (gratuit)

---

### Étape 1 — Créer le projet Supabase

1. Allez sur [supabase.com](https://supabase.com) → **Start your project**
2. Connectez-vous avec GitHub ou Google
3. Créez un nouveau projet :
   - **Nom** : `achat-revente`
   - **Région** : `West EU (Ireland)` (ou la plus proche de vous)
   - **Mot de passe** : générez-en un fort (vous n'en aurez pas besoin)
4. Attendez que le projet soit prêt (~1 minute)

---

### Étape 2 — Créer la table articles

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
  created_at timestamptz DEFAULT now()
);

-- Activation de la sécurité RLS
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Politiques : accès uniquement aux utilisateurs authentifiés
CREATE POLICY "Auth lecture"     ON articles FOR SELECT    TO authenticated USING (true);
CREATE POLICY "Auth insertion"   ON articles FOR INSERT    TO authenticated WITH CHECK (true);
CREATE POLICY "Auth modification" ON articles FOR UPDATE   TO authenticated USING (true);
CREATE POLICY "Auth suppression" ON articles FOR DELETE    TO authenticated USING (true);
```

---

### Étape 3 — Exposer la table dans l'API

1. Dans Supabase → **Integrations** → **Data API** → onglet **Settings**
2. Dans **"Exposed tables"** → sélectionnez `articles`
3. Cliquez **Save**

---

### Étape 4 — Créer votre compte utilisateur

1. Dans Supabase → **Authentication** → **URL Configuration**
   - **Site URL** : `https://VOTRE-APP.vercel.app` *(à compléter après le déploiement)*
   - **Redirect URLs** : `https://VOTRE-APP.vercel.app`
   - Cliquez **Save**

2. Dans **Authentication** → **Users** → **"Invite user"**
   - Entrez votre email → **Send invite**

3. Définissez votre mot de passe via le **SQL Editor** :
```sql
UPDATE auth.users 
SET encrypted_password = crypt('VOTRE_MOT_DE_PASSE', gen_salt('bf'))
WHERE email = 'votre@email.com';
```
> Le mot de passe est hashé en **bcrypt** — il ne sera jamais stocké en clair.

---

### Étape 5 — Récupérer les clés Supabase

Dans Supabase → **Settings** → **API Keys** :

- **Project URL** : `https://xxxxxxxxxxxx.supabase.co`
- **Anon / Public key** : `eyJhbGci...` *(clé longue commençant par eyJ)*

---

### Étape 6 — Configurer le code

Ouvrez le fichier `app.js` et modifiez les deux premières lignes :

```javascript
const SUPABASE_URL = 'https://VOTRE-URL.supabase.co';
const SUPABASE_KEY = 'VOTRE_CLE_ANON';
```

---

### Étape 7 — Déployer sur GitHub

1. Allez sur [github.com](https://github.com) → **New repository**
2. Nom : `achat-revente` → **Public** → **Create**
3. Uploadez tous les fichiers du projet :
   - `index.html`
   - `style.css`
   - `app.js`
   - `manifest.json`
   - `vercel.json`
   - `favicon.svg`

---

### Étape 8 — Déployer sur Vercel

1. Allez sur [vercel.com](https://vercel.com) → connectez-vous avec GitHub
2. **Add New Project** → sélectionnez votre repo `achat-revente`
3. Cliquez **Deploy** (aucune configuration nécessaire)
4. Vercel vous donne une URL : `achat-revente-XXXX.vercel.app` 🎉

> Revenez ensuite dans Supabase → **Authentication** → **URL Configuration** et renseignez cette URL dans **Site URL** et **Redirect URLs**.

---

### Étape 9 — Installer sur téléphone (optionnel)

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
├── favicon.svg       # Logo AR (onglet navigateur)
└── README.md         # Ce fichier
```

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

Si vous avez déjà des articles à importer, créez un fichier SQL avec ce format :

```sql
INSERT INTO articles (nom, prix_achat, date_achat, prix_revente, date_revente) VALUES
('Veste Adidas', 5, '2025-06-01', 18, '2025-09-10'),
('Jean Levi''s 501', 3, '2025-06-15', NULL, NULL),
('Hoodie Supreme', 8, '2025-07-01', 25, '2025-08-20');
```

Collez-le dans le **SQL Editor** de Supabase et cliquez **Run**.

---

## 🤝 Contribution

Ce projet est open-source. N'hésitez pas à fork, améliorer et partager !

---

*Construit avec ❤️ et Claude AI*
