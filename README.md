# GraphQL Inspector

Extension DevTools (Manifest V3) qui ajoute un onglet **GraphQL** aux outils de développement du navigateur. Elle liste les requêtes GraphQL émises par la page et permet d'inspecter, pour chacune, la query, les variables, les en-têtes et la réponse.

## Installation en mode développeur

L'extension n'est pas publiée sur le Chrome Web Store. Elle se charge comme extension non empaquetée, à partir de l'archive `.zip` d'une release ou d'un build local.

Elle fonctionne sur Chrome 111+ et les navigateurs basés sur Chromium (Edge, Brave…). Firefox n'a pas été testé.

### 1. Récupérer l'extension

#### Option A : depuis l'archive de la release

C'est le chemin le plus court : ni Node.js ni build.

1. Ouvrir la [dernière release](https://github.com/Nohan75/graphql-inspector/releases/latest).
2. Dans **Assets**, télécharger `gql-network-<version>-chrome.zip`.
3. Extraire l'archive dans un dossier que vous conserverez.

Le navigateur ne charge pas le `.zip` lui-même mais le dossier extrait, et il le relit à chaque démarrage : si ce dossier est déplacé ou supprimé, l'extension cesse de fonctionner.

#### Option B : depuis les sources

Il faut Node.js 20.19+ ou 22.12+, avec npm.

```bash
git clone https://github.com/Nohan75/graphql-inspector.git
cd graphql-inspector
npm install
npm run build
```

Le build est généré dans `.output/chrome-mv3/`.

### 2. Charger l'extension dans le navigateur

1. Ouvrir `chrome://extensions` (`edge://extensions` sur Edge).
2. Activer le **Mode développeur** (interrupteur en haut à droite sur Chrome, dans le menu de gauche sur Edge).
3. Cliquer sur **Charger l'extension non empaquetée** (*Load unpacked*).
4. Sélectionner le dossier qui contient `manifest.json` : le dossier extrait de l'archive (option A) ou `.output/chrome-mv3` (option B).

Sur macOS, le sélecteur de fichiers masque les dossiers commençant par un point, comme `.output` : `Cmd + Maj + .` les affiche.

### 3. Ouvrir le panneau

1. Ouvrir la page à inspecter, puis les DevTools (`F12`).
2. Cliquer sur l'onglet **GraphQL**. S'il n'est pas visible, il se trouve derrière le chevron `»` de la barre d'onglets des DevTools.
3. Recharger la page ou déclencher une action qui émet des requêtes GraphQL.

Deux points à connaître :

- La capture ne démarre qu'une fois l'onglet **GraphQL** ouvert. Les requêtes parties avant n'apparaissent pas.
- Juste après l'installation, les pages déjà ouvertes doivent être rechargées et les DevTools fermés puis rouverts.

### Mettre à jour l'extension

Une extension non empaquetée ne se met pas à jour toute seule.

1. Option A : télécharger l'archive de la nouvelle release et remplacer le contenu du dossier extrait. Option B : récupérer les sources à jour et relancer `npm run build`.
2. Dans `chrome://extensions`, cliquer sur l'icône de rechargement de l'extension.
3. Fermer puis rouvrir les DevTools et recharger la page.

## Développement

`npm run dev` lance WXT en mode développement : il ouvre une instance de Chrome dédiée avec l'extension déjà chargée et reconstruit à chaque modification. Ce build de développement est écrit dans `.output/chrome-mv3-dev/`.

Pour tester un build de production après une modification, suivre les étapes de [Mettre à jour l'extension](#mettre-à-jour-lextension).

### Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Build de développement avec rechargement automatique |
| `npm run build` | Build de production dans `.output/chrome-mv3/` |
| `npm run zip` | Build de production puis archive `.zip` dans `.output/`, celle qui est jointe aux releases |

### Page de test

`test.html`, à la racine du dépôt, contient des boutons qui envoient des queries et mutations vers des API GraphQL publiques (Rick and Morty, Countries), ce qui permet d'essayer l'extension sans projet GraphQL sous la main.

Le plus simple est de la servir en HTTP local, par exemple avec `npx serve .`. Pour l'ouvrir directement en `file://`, il faut d'abord activer **Autoriser l'accès aux URL de fichiers** dans les détails de l'extension.

Le bouton **Run Batch** n'ajoute rien dans le panneau : les requêtes groupées ne sont pas capturées (voir [Limites connues](#limites-connues)).

## Fonctionnalités

### Capture des requêtes

Sont capturées les requêtes `POST` dont le corps JSON contient un champ `query`, qu'elles passent par `fetch` ou par `XMLHttpRequest`. Chaque requête apparaît dans la liste dès son envoi, avec un indicateur d'attente, puis se complète à l'arrivée de la réponse.

### Liste des requêtes

- Badge de type : `Q` (query), `M` (mutation), `S` (subscription).
- Nom de l'opération (`Anonymous` si elle n'en a pas) et URL de l'endpoint.
- Statut HTTP, en vert pour les 2xx et en rouge à partir de 400. `●●●` signale une réponse en attente, `—` une réponse qui n'a pas été capturée au bout de 30 secondes.
- **Filter requests…** filtre sur le nom d'opération ou l'URL.
- **Clear** vide la liste.
- **Preserve log** conserve la liste lors d'une navigation ou d'un rechargement. Sans cette option, elle est vidée à chaque navigation.
- La liste défile automatiquement vers la dernière requête et conserve les 500 plus récentes.
- La largeur de la colonne se règle en faisant glisser le séparateur.

### Détail d'une requête

Un clic sur une requête ouvre quatre onglets :

| Onglet | Contenu |
| --- | --- |
| **Headers** | En-têtes de requête et de réponse |
| **Request** | Query reformatée, avec coloration syntaxique, numéros de ligne et blocs repliables. Variables affichées en arbre JSON repliable. |
| **Response** | Réponse en arbre JSON repliable, avec recherche |
| **Raw** | Corps de la réponse tel que reçu |

La query, les variables, la réponse et le corps brut ont chacun un bouton **Copy**.

La recherche de l'onglet **Response** surligne les occurrences et affiche leur nombre. `Entrée` passe à la suivante, `Maj + Entrée` à la précédente, `Échap` efface la recherche.

### Ouverture dans un sandbox

Une requête capturée peut être rouverte, query et variables préremplies, dans un sandbox GraphQL (Apollo Sandbox par défaut). Trois points d'entrée :

- le bouton `↗` de chaque ligne de la liste ;
- le bouton **Open in Sandbox ↗** de l'onglet **Request** ;
- le bouton `↗` qui apparaît au survol de chaque champ de la query. Il ouvre une sous-requête réduite à ce champ, ses sous-champs et ses parents, en ne gardant que les déclarations de variables réellement utilisées. C'est utile pour isoler le champ fautif d'une grosse query.

### Mode comparaison

Le bouton `⊕` d'une ligne ajoute la requête à la comparaison. La première sélectionnée devient **A** (rouge), la seconde **B** (vert), et le panneau de détail laisse place à un diff ligne à ligne.

- Trois onglets : **Query**, **Variables**, **Response**, chacun avec un compteur de lignes différentes.
- Les lignes `−` n'existent que dans A, les lignes `+` que dans B.
- Sélectionner une troisième requête remplace la plus ancienne des deux.
- Un nouveau clic sur `A` ou `B` retire la requête ; **✕ Close** quitte la comparaison.

### Réglages

Le bouton `⚙` ouvre les réglages du sandbox, enregistrés dans `chrome.storage.local` :

- **Sandbox URL** : adresse du sandbox, en `http://` ou `https://`. Valeur par défaut : `https://studio.apollographql.com/sandbox/explorer`.
- **URL Format** : façon dont la query est passée dans l'URL.

| Format | Paramètres générés | Cas d'usage |
| --- | --- | --- |
| Auto-detect | Apollo si l'URL contient `apollographql` ou `apollo.dev`, sinon GraphiQL | Par défaut |
| Apollo Studio | `?document=…&endpoint=…&variables=…` | Apollo Sandbox hébergé, l'endpoint transmis est celui de la requête capturée |
| Apollo Playground | `?document=…&variables=…` | Sandbox servi par votre propre endpoint GraphQL |
| GraphiQL | `?query=…&variables=…` | Instance GraphiQL |

### Confidentialité

- L'interception est inactive par défaut. Elle ne s'active que dans l'onglet dont le panneau **GraphQL** est ouvert et se désactive à sa fermeture ; rien n'est capturé sur les autres sites.
- Les valeurs des en-têtes sensibles (`Authorization`, `Cookie`, `X-API-Key`, jetons CSRF…) sont masquées lors de la capture dans la page, seul leur nom est conservé. Quand l'API réseau des DevTools fournit les en-têtes réels, ce sont eux qui s'affichent ; ils ne sortent pas des DevTools.
- Les requêtes capturées restent en mémoire dans le panneau et ne sont envoyées nulle part. Seule exception, à votre initiative : **Open in Sandbox** transmet la query et les variables au sandbox configuré, via l'URL.

## Limites connues

- Ne sont pas capturées : les requêtes `GET`, les requêtes groupées (corps JSON sous forme de tableau), les persisted queries envoyées sans champ `query` et les subscriptions sur WebSocket.
- Les corps de réponse sont tronqués à 2 Mo et les queries de plus de 500 Ko sont ignorées.
- Au-delà de 300 lignes, le diff du mode comparaison n'aligne plus les lignes : il affiche tout A puis tout B.

## Structure du projet

L'extension repose sur [WXT](https://wxt.dev), React 19, TypeScript et Tailwind CSS 4.

```
page (monde MAIN)          src/entrypoints/interceptor.content.ts   enveloppe fetch et XHR
   │ window.postMessage
content script (isolé)     src/entrypoints/content.ts               relais page ↔ extension
   │ chrome.runtime
service worker             src/entrypoints/background.ts            webRequest + relais par onglet
   │ port « devtools-panel »
panneau DevTools           src/entrypoints/panel/                   interface React
```

| Dossier | Rôle |
| --- | --- |
| `src/entrypoints/` | Points d'entrée de l'extension : service worker, content scripts, page DevTools, panneau |
| `src/components/` | Composants React du panneau |
| `src/hooks/` | `useRequests` (collecte et corrélation requête/réponse), `useSettings` |
| `src/utils/` | Analyse GraphQL, coloration syntaxique, diff, construction des URL de sandbox |

### Permissions demandées

| Permission | Usage |
| --- | --- |
| `webRequest` | Détecter les requêtes GraphQL dès leur envoi |
| `tabs` | Activer la capture dans l'onglet inspecté et ouvrir le sandbox dans un nouvel onglet |
| `storage` | Enregistrer les réglages du sandbox |
| `<all_urls>` | Fonctionner sur n'importe quel site inspecté |
