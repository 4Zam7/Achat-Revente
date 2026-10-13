# Laney Sync — extension Chrome pour Vinted

Met à jour Laney quand tu consultes tes pages Vinted :

- **Mes commandes › Ventes** (`vinted.fr/my_orders`, onglet Ventes) → prix de vente, date de vente, client
- **Porte-monnaie** (`vinted.fr/wallet/balance`) → date d'encaissement

Tu continues à saisir le prix et la date d'achat dans Laney. La saisie manuelle reste possible : **l'extension ne remplit que les champs vides et n'écrase jamais une valeur déjà saisie.** Une vente déjà saisie à la main (même article, vendu à 30 jours près, même si le prix diffère) est reconnue : l'extension se contente d'ajouter ce qui manque (client, date d'encaissement) et ne vend pas un autre exemplaire.

## Comment ça marche

- L'extension lit les données que la page Vinted reçoit quand tu l'ouvres. Sur **Mes commandes**, la liste ne contient pas le détail des ventes : pour chaque vente nouvelle (ou dont le statut a changé), l'extension ouvre elle-même sa fiche, comme si tu ouvrais la conversation — 2 requêtes par vente, espacées d'environ 1 s, 15 ventes maximum par passage.
- **Plusieurs comptes Vinted** : l'extension reconnaît le compte connecté sur la page. Dans la popup, associe une fois chaque compte à sa boutique Laney (ex. compte perso → Vinted, compte pro → Vinted Pro). Tant qu'un compte n'est pas associé, ses ventes restent en attente.
- Elle retrouve l'article Laney correspondant à partir du titre de l'annonce, ou mieux, du **SKU/ID** s'il figure dans le titre Vinted.
- Correspondance sûre (SKU trouvé ou titre identique) → mise à jour automatique. Si plusieurs exemplaires identiques sont en stock, c'est le plus ancien acheté qui est vendu.
- Sinon → l'événement apparaît dans **À valider** : tu choisis l'article et tu cliques sur Valider.
- Seules les **ventes payées** comptent : une conversation née d'un favori, d'une question ou d'une offre non payée est ignorée.
- Une mise à jour faite par erreur peut être défaite avec **Annuler** dans « Dernières mises à jour » : les champs écrits par l'extension sont remis à vide, sauf si tu les as modifiés depuis.
- Les événements antérieurs à la **date de départ** sont ignorés, pour ne pas retraiter l'historique déjà saisi.

## Installation

1. Ouvre `chrome://extensions`
2. Active le **Mode développeur** (en haut à droite)
3. **Charger l'extension non empaquetée** → choisis ce dossier `extension/`
4. Clique sur l'icône Laney Sync → connecte-toi avec ton compte Laney → ouvre tes ventes Vinted, puis associe le compte détecté à sa boutique (à refaire une fois pour chaque compte Vinted)

Après une modification du code : bouton ↻ sur la carte de l'extension, puis recharge l'onglet Vinted.

## Diagnostic

Le format des données Vinted n'est pas public. Si rien n'est détecté, ouvre tes ventes et ton porte-monnaie Vinted, puis clique sur **Copier le diagnostic** dans la popup : le texte copié contient ce que l'extension a capté. Il contient aussi les noms des acheteurs et les montants : ne le partage qu'en privé.
