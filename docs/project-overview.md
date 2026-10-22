# ATHAR — Vue d'ensemble complète du projet

> Document unique : produit, architecture, infrastructure, API REST, application admin et
> application mobile. Écrit à partir du code de la branche `feat/athar-v1` (21/10/2026).
> Détails fins : `docs/architecture.md`, `docs/api-conventions.md`, `docs/deployment.md`.
>
> **Plan actuel (22/10/2026).** L'équipe hardware de Dubai installe et teste tout **sur place,
> sur un Raspberry Pi** (API + broker en Docker, téléphone sur le même Wi-Fi) :
> `hardware/GUIDE-EQUIPE-DUBAI.md`. Le déploiement sur une VM Google Cloud est **en pause**
> (fichiers conservés, rien n'est supprimé) et viendra plus tard. L'**agent du Pi**
> (`apps/table-agent`), qui relie le broker à la carte DLC32, **n'est pas encore écrit**.

## 1. Le produit

ATHAR est une **table de sable connectée** : un bras motorisé (piloté par un Raspberry Pi)
dessine des motifs dans le sable, avec un éclairage LED. Le client pilote sa table depuis
une application mobile ; l'équipe ATHAR gère clients et tables depuis une interface admin.

Parcours client : l'admin crée un client et provisionne une table **pour ce client** → le
client active son compte avec un code à usage unique → il scanne le QR code de la table
(« claim »), qui n'est valable que pour lui → il
choisit un dessin ou trace le sien, lance, met en pause, reprend ou arrête → il règle la
lumière → il peut inviter des invités via un lien temporaire.

| Notion            | Valeurs                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| Rôles de compte   | `admin`, `customer`                                                      |
| Rôles sur table   | `owner` (propriétaire), `guest` (invité), `admin` (lecture seule)        |
| Plans             | `basic` : catalogue + râteau · `personalized` : + stylo, ambiances LED   |
| Option            | `voiceAssistant` (assistant vocal), indépendante du plan                 |
| Fonctions (flags) | `catalogue`, `rake`, `drawingPen`, `ledAmbiences`, `voiceAssistant`      |
| Formes de table   | `round`, `square`, `rectangle`, `oval` (côtés de 100 à 10 000 mm)        |
| Modes de pilotage | `simulation` (simulateur intégré) ou `hardware` (vraies tables via MQTT) |
| Langues (mobile)  | Arabe (RTL) et anglais                                                   |

Catalogue de dessins v1 : `dunes`, `sadu` (traditionnel documenté), `star`, `khoos`.
Types de jobs : `design` (catalogue), `path` (tracé libre du propriétaire), `rake` (spirale
qui lisse le sable).

---

## 2. Architecture et monorepo

Monorepo **pnpm** (`pnpm@10.12.2`, Node ≥ 20.19, TypeScript ~6.0).

```
athar-Official/
├── apps/
│   ├── api/        NestJS 12 (Express) — API REST + driver de table (simulateur / MQTT)
│   ├── mobile/     Expo 57 / React Native 0.86 / Expo Router — app client
│   └── admin/      index.html unique (HTML + JS natif, sans build) — back-office
├── packages/
│   ├── contracts/  @athar/contracts — schémas Zod partagés (HTTP, MQTT, erreurs)
│   └── config/     @athar/config — configuration ESLint/TS partagée
├── docs/           architecture, API, déploiement, tests, décisions
└── .github/workflows/check.yml   CI
```

```
  Mobile (Expo)  ──HTTPS + Bearer──►  API NestJS  ──MQTT(S)──►  Broker Mosquitto  ──►  Raspberry Pi (table)
  Admin (HTML)   ──HTTPS + Bearer──►     │                                              ▲ commandes / ack
                                         ├─ data/*.json (4 fichiers verrouillés)        │ status / presence
                                         └─ jobs en mémoire (perdus au redémarrage)  ◄──┘
```

Principes structurants :

- **Contrat d'abord** : `@athar/contracts` est la seule source de vérité des formats ;
  l'API valide avec Zod, le mobile parse les réponses avec les mêmes schémas.
- **Le QR code identifie, il n'autorise jamais** : l'id d'une table est public ; l'accès
  exige une session et un rôle (décision D1). Les jetons de claim/partage sont stockés
  hachés, jamais en clair.
- **Le driver décide du mode** : `TABLE_MODE` choisit simulateur ou MQTT ; l'API et les
  applications ne changent pas.
- **Géométrie normalisée** : les dessins restent en coordonnées polaires `polar-theta-rho/v1`
  (θ en radians, ρ de 0 à 1) ; la table les met à l'échelle (`x = W/2·ρ·cosθ`,
  `y = H/2·ρ·sinθ`, origine au centre).

---

## 3. Infrastructure et déploiement

### 3.1 Composants

| Composant            | Rôle                                               | Statut                                      |
| -------------------- | -------------------------------------------------- | ------------------------------------------- |
| Processus API (Node) | API REST, sessions, jobs, driver                   | Aucun déploiement réel effectué à ce jour   |
| Fichiers JSON        | Tables, comptes, sessions, accès (tokens hachés)   | Persistance actuelle, **1 seule instance**  |
| Broker MQTT          | Liaison API ↔ tables (Mosquitto, mode `hardware`)  | À installer, TLS + ACL requis en production |
| Raspberry Pi         | Contrôleur de la table, se connecte vers le broker | Agent `apps/table-agent` **non écrit**      |
| EAS Build (Expo)     | Construction des APK / bundles de l'app mobile     | Profils dans `apps/mobile/eas.json`         |
| Reverse proxy        | HTTPS (ex. Caddy) + `TRUST_PROXY=1`                | À fournir par l'hébergeur ou en VPS         |
| Base de données      | **Aucune** (PostgreSQL prévu, décision 19)         | Planifié                                    |
| Docker / IaC         | `apps/api/Dockerfile` + `deploy/` (local + GCP)    | Mode local testé ; VM GCP en pause          |

### 3.2 Persistance

Quatre fichiers JSON, chacun avec un verrou `<fichier>.lock` (un second process sur le même
fichier refuse de démarrer ; un verrou laissé par un crash est repris automatiquement) :

| Variable                 | Défaut                     | Contenu                                           |
| ------------------------ | -------------------------- | ------------------------------------------------- |
| `TABLES_DATA_FILE`       | `./data/tables.json`       | Tables enregistrées (perdre = codes QR orphelins) |
| `ACCOUNTS_DATA_FILE`     | `./data/accounts.json`     | Comptes (hash de mot de passe)                    |
| `SESSIONS_DATA_FILE`     | `./data/sessions.json`     | Sessions (hash de jetons)                         |
| `TABLE_ACCESS_DATA_FILE` | `./data/table-access.json` | Jetons de claim/partage (hachés) et invités       |

Les **jobs de dessin sont en mémoire** : tout redémarrage oublie les dessins en cours
(l'app affiche « ce dessin n'est plus disponible »). Un déploiement doit donc **arrêter
l'ancienne instance avant de démarrer la nouvelle**.

### 3.3 Variables d'environnement de l'API (validées au démarrage par Zod)

| Variable                          | Défaut                  | Remarque                                                                  |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                        | `development`           | `production` active les contrôles stricts et les logs JSON                |
| `HOST` / `PORT`                   | `0.0.0.0` / `3000`      | `0.0.0.0` pour joindre l'API depuis l'émulateur (`10.0.2.2`)              |
| `LOG_LEVEL`                       | `info`                  | `fatal…silent` (pino)                                                     |
| `SHUTDOWN_TIMEOUT_MS`             | `10000`                 | Délai de grâce SIGINT/SIGTERM                                             |
| `TABLE_MODE`                      | `simulation`            | ou `hardware`                                                             |
| `MQTT_URL`                        | `mqtt://localhost:1883` | `mqtts://`/`wss://` **obligatoire** en prod + mode hardware               |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | —                       | Obligatoires en prod + hardware                                           |
| `SIMULATION_SPEED_FACTOR`         | `1`                     | Accélère les dessins simulés (démo)                                       |
| `SIMULATION_FAULT_EVERY_NTH_JOB`  | `0`                     | Injecte une panne un job sur N (0 = off)                                  |
| `SIMULATION_FAULT_AT_PROGRESS`    | `0.6`                   | Progression (0–1) de la panne injectée                                    |
| `JOB_HISTORY_LIMIT`               | `20`                    | Jobs gardés par table, en mémoire                                         |
| `PUBLIC_LINK_BASE_URL`            | —                       | **Obligatoire en prod** : origine `https` seule (QR = `<origine>/t/<id>`) |
| `TRUST_PROXY`                     | —                       | Nombre de sauts (`1`) ou liste IP/CIDR ; jamais `true`                    |
| `CORS_ORIGINS`                    | —                       | Origines web autorisées ; en dev, tout `localhost` par défaut             |

### 3.4 Démarrage, sondes, arrêt

```bash
pnpm install --frozen-lockfile
pnpm --filter "@athar/api..." build      # contracts puis API
pnpm --filter @athar/api start           # node dist/main.js
```

- `GET /health` : liveness (aucune vérification de dépendance).
- `GET /ready` : `200` si prêt, `503` sinon ; indique aussi `tableMode`.
- Arrêt propre sur `SIGINT`/`SIGTERM` (les requêtes en cours se terminent, puis sortie
  forcée après `SHUTDOWN_TIMEOUT_MS`).
- Corps JSON limité à **100 kb**. Chemin inconnu → erreur 404 au format standard.

### 3.5 Scripts CLI de l'API (`apps/api`)

| Commande                                 | Effet                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| `pnpm --filter @athar/api admin:create`  | Crée le premier compte admin (mot de passe ≥ 14 caractères) |
| `pnpm --filter @athar/api table:create`  | Crée une table (refuse de tourner pendant que l'API tourne) |
| `pnpm --filter @athar/api table:qr <id>` | Génère l'image du QR code d'une table                       |
| `pnpm --filter @athar/api designs:svg`   | Exporte les dessins du catalogue en SVG                     |

### 3.6 Hébergement envisagé

Besoin : un process Node, **une seule instance**, un **volume persistant**, HTTPS, injection
de `PORT` et des secrets. Pistes comparées dans `docs/deployment.md` : Render ou Railway
(le moins d'effort), Fly.io (Dockerfile à écrire), VPS (Caddy + `TRUST_PROXY=1`).

### 3.7 Broker MQTT en production

Tests sur place (plan actuel) : le broker tourne sur le Pi, en MQTT simple sur le port 1883
(`deploy/docker-compose.local.yml`, `deploy/mosquitto/mosquitto.local.conf`), l'ACL est la même
(`hardware/broker/acl`). L'API y tourne avec `NODE_ENV=development`, seul mode qui accepte un
broker sans TLS ; la production, elle, exige TLS (ci-dessous).

TLS (`mqtts://`, port 8883), accès anonyme désactivé, ACL : chaque table ne lit que
`athar/v1/t/<id>/cmd` et n'écrit que ses propres `ack`/`status`/`presence` ; l'API lit tous
les `ack`/`status`/`presence` et écrit tous les `cmd`. Les tables se connectent **vers
l'extérieur** : aucun port à ouvrir chez le client.
**Point ouvert** : les identifiants MQTT renvoyés par `provision` sont générés mais **pas
encore enregistrés sur le broker** (plugin Dynamic Security à brancher).

### 3.8 Application mobile : profils EAS

| Profil        | Sortie         | URL de l'API                                      | HTTP clair |
| ------------- | -------------- | ------------------------------------------------- | ---------- |
| `development` | APK dev-client | `http://10.0.2.2:3000` (émulateur)                | autorisé   |
| `preview`     | APK interne    | `https://api-staging.athar.example` (placeholder) | refusé     |
| `production`  | bundle store   | `https://api.athar.example` (placeholder)         | refusé     |

Un build `preview`/`production` avec placeholder, `http`, ou adresse locale/privée est
**refusé** par `release-check`. Seules les variables `EXPO_PUBLIC_*` entrent dans le bundle
(`EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_TABLE_LINK_HOSTS`, `EXPO_PUBLIC_POLL_INTERVAL_MS`) ;
l'app ne référence aucune route admin.

---

## 4. API REST (`apps/api`)

### 4.1 Conventions

- **Base** : `/api/v1/...` (préfixe `api`, version par URI, défaut `1`). Les sondes
  `/health` et `/ready` sont à la racine, hors version.
- **Auth** : en-tête `Authorization: Bearer <accessToken>` **uniquement** (jamais dans
  l'URL). Pas de cookies.
- **Validation** : chaque body/param/query passe par un `ZodValidationPipe` ; les clés
  inconnues sont retirées. L'authentification passe **avant** la validation.
- **CORS** : activé seulement si `CORS_ORIGINS` est défini (ou `localhost` en dev) ;
  méthodes `GET POST PUT PATCH DELETE`.
- **Erreurs** : format standard avec identifiant de corrélation. Session absente ou
  inconnue : `401 UNAUTHORIZED` ; expirée/révoquée : `401 SESSION_EXPIRED` ; rôle
  insuffisant : `403 FORBIDDEN`. Les deux `401` portent `WWW-Authenticate: Bearer`.
- **Confidentialité** : une table ou un job auquel on n'a pas droit renvoie
  `TABLE_NOT_FOUND` / `JOB_NOT_FOUND`, exactement comme s'il n'existait pas.
- **Idempotence** : le démarrage d'un job exige un `clientRequestId` (UUID) ; un rejeu
  identique renvoie le job d'origine.

Codes d'erreur (`apiErrorCodeSchema`) : `BAD_REQUEST`, `NOT_FOUND`, `VALIDATION_FAILED`,
`INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`, `TABLE_NOT_FOUND`, `DESIGN_NOT_FOUND`,
`JOB_NOT_FOUND`, `TABLE_DISABLED`, `TABLE_OFFLINE`, `TABLE_BUSY`, `INVALID_TRANSITION`,
`IDEMPOTENCY_CONFLICT`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED`,
`FORBIDDEN`, `TOO_MANY_REQUESTS`, `ACTIVATION_INVALID`, `ACCOUNT_EXISTS`,
`PAIRING_REQUIRED`, `FEATURE_NOT_IN_PLAN`, `PAIRING_TOKEN_INVALID`, `PAIRING_WRONG_ACCOUNT`,
`TABLE_ALREADY_CLAIMED`, `DESIGN_READ_ONLY`.

### 4.2 Sondes (publiques, sans version)

| Méthode | Chemin    | Réponse                                          |
| ------- | --------- | ------------------------------------------------ |
| GET     | `/health` | `200` — le serveur répond                        |
| GET     | `/ready`  | `200` prêt / `503` non prêt (inclut `tableMode`) |

### 4.3 Authentification — `/api/v1/auth`

| Méthode | Chemin           | Accès   | Description                                                           | Succès |
| ------- | ---------------- | ------- | --------------------------------------------------------------------- | ------ |
| POST    | `/auth/login`    | public  | `{email, password}` → session (access + refresh token). Limité par IP | 200    |
| POST    | `/auth/activate` | public  | `{email, activationCode, password}` : active un compte client         | 200    |
| POST    | `/auth/refresh`  | public  | `{refreshToken}` → nouvelle session                                   | 200    |
| POST    | `/auth/logout`   | session | Termine la session courante                                           | 204    |
| GET     | `/auth/me`       | session | Compte courant                                                        | 200    |

Mots de passe : 10 à 200 caractères (client), 14 minimum pour un admin. Mots de passe et
jetons ne sont stockés que sous forme de hash. Une limite de tentatives par IP protège le
login (`TOO_MANY_REQUESTS`).

### 4.4 Admin — clients — `/api/v1/admin/customers` (rôle `admin`)

| Méthode | Chemin                                     | Description                                                        | Succès |
| ------- | ------------------------------------------ | ------------------------------------------------------------------ | ------ |
| POST    | `/admin/customers`                         | `{email, displayName}` → compte + **code d'activation (une fois)** | 201    |
| GET     | `/admin/customers`                         | Liste, du plus ancien au plus récent                               | 200    |
| POST    | `/admin/customers/:accountId/reset-access` | Coupe toutes les sessions, nouveau code d'activation               | 200    |
| POST    | `/admin/customers/:accountId/disable`      | Désactive le client                                                | 200    |

Statuts client : `pending-activation` → `active` → `disabled`.

### 4.5 Admin — tables — `/api/v1/admin/tables` (rôle `admin`)

| Méthode | Chemin                               | Description                                                                                                                                                                       | Succès |
| ------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| POST    | `/admin/tables/provision`            | Crée une table **sans propriétaire, réservée à un client** (`customerAccountId`, obligatoire) + identifiants MQTT du Pi + lien/jeton de claim lié à ce client (affichés une fois) | 201    |
| POST    | `/admin/tables/:tableId/claim-token` | Nouveau jeton de claim (l'ancien cesse de fonctionner), pour le client réservé ; corps optionnel `{customerAccountId}` pour changer de client                                     | 201    |
| POST    | `/admin/tables`                      | Crée une table (id généré par le serveur) ; `ownerAccountId` doit être un client actif                                                                                            | 201    |
| GET     | `/admin/tables`                      | Liste des tables                                                                                                                                                                  | 200    |
| GET     | `/admin/tables/:tableId`             | Une table                                                                                                                                                                         | 200    |
| PATCH   | `/admin/tables/:tableId`             | `displayName`, `location`, `enabled`, `ownerAccountId` (`null` = retirer), `plan`, `voiceAssistant`, `geometry` ; au moins un champ                                               | 200    |
| GET     | `/admin/tables/:tableId/qr`          | Lien encodé dans le QR (`<PUBLIC_LINK_BASE_URL>/t/<id>`)                                                                                                                          | 200    |

Corps de création : `displayName` (1–100), `location` (1–200), `enabled` (défaut `true`),
`plan` (défaut `basic`), `voiceAssistant` (défaut `false`), `geometry` (défaut : rond
600 × 600 mm, valeur de remplacement). Règles de géométrie : `round`/`square` ont largeur =
hauteur ; `rectangle`/`oval` exigent largeur ≠ hauteur.

### 4.6 Tables côté client — `/api/v1/tables`

| Méthode | Chemin                      | Accès                             | Description                                                          | Succès |
| ------- | --------------------------- | --------------------------------- | -------------------------------------------------------------------- | ------ |
| POST    | `/tables/pair`              | client                            | `{token}` : réclame une table (owner) ou rejoint via partage (guest) | 200    |
| POST    | `/tables/:tableId/shares`   | client, propriétaire              | `{expiresInHours}` (1–168, défaut 24) → lien d'invitation            | 201    |
| GET     | `/tables/:tableId`          | session, owner/guest/admin        | Table : état, readiness, fonctions, géométrie, rôle                  | 200    |
| POST    | `/tables/:tableId/pairing`  | propriétaire                      | Appaire la session à la table ; glisse de 15 min                     | 200    |
| DELETE  | `/tables/:tableId/pairing`  | propriétaire                      | Met fin à l'appairage de la session                                  | 204    |
| PUT     | `/tables/:tableId/light`    | owner ou guest, appairé, en ligne | Lumière : `off`, `on`, `color` (+ `brightness` 1–100) ou `preset`    | 200    |
| PUT     | `/tables/:tableId/ambience` | owner ou guest, appairé, en ligne | Ambiance LED du catalogue (fonction `ledAmbiences`)                  | 200    |

Ressource `Table` : `id`, `displayName`, `location`, `enabled`, `mode`, `connection`,
`activeJobId`, `plan`, `voiceAssistant`, `geometry`, `features`, `ambienceId`,
`readiness {paired, online, free, canStart}`, `access {role}`.
`canStart = enabled && paired && online && free`.

### 4.7 Jobs de dessin

| Méthode | Chemin                         | Accès          | Description                                                | Succès            |
| ------- | ------------------------------ | -------------- | ---------------------------------------------------------- | ----------------- |
| POST    | `/tables/:tableId/jobs`        | propriétaire   | Démarre un job (voir corps ci-dessous)                     | 201 / 200 (rejeu) |
| GET     | `/tables/:tableId/jobs?limit=` | owner ou admin | Historique, plus récent d'abord (`limit` 1–100, défaut 10) | 200               |
| GET     | `/jobs/:jobId`                 | owner ou admin | Un job                                                     | 200               |
| POST    | `/jobs/:jobId/pause`           | propriétaire   | Met en pause (corps vide)                                  | 200               |
| POST    | `/jobs/:jobId/resume`          | propriétaire   | Reprend                                                    | 200               |
| POST    | `/jobs/:jobId/stop`            | propriétaire   | Arrête                                                     | 200               |

Corps de `POST /tables/:tableId/jobs` (union sur `kind`, `design` par défaut) :

```json
{ "kind": "design", "designId": "dunes", "clientRequestId": "<uuid>" }
{ "kind": "path",   "path": [[theta, rho], "... 2 à 1000 points"], "clientRequestId": "<uuid>" }
{ "kind": "rake",   "clientRequestId": "<uuid>" }
```

Machine à états : `queued → drawing ⇄ paused → completed | failed | cancelled`
(`queued → failed` si le driver refuse ; toute autre transition → `INVALID_TRANSITION`).
Conditions de démarrage vérifiées sous verrou : propriété, table activée, appairée, en
ligne, libre, fonction incluse dans le plan (`FEATURE_NOT_IN_PLAN`).

### 4.8 Catalogue

| Méthode | Chemin               | Accès   | Description                                   |
| ------- | -------------------- | ------- | --------------------------------------------- |
| GET     | `/designs`           | session | Bibliothèque de dessins (identique pour tous) |
| GET     | `/designs/:designId` | session | Un dessin (`DESIGN_NOT_FOUND` sinon)          |
| GET     | `/ambiences`         | session | Ambiances LED (id, nom localisé, couleur)     |

### 4.9 Organisation interne de l'API (34 routes au total)

Modules Nest : `auth` (comptes, sessions, guard, limite de login), `access` (claim, partage,
identifiants MQTT), `tables` (registre, repository JSON, appairage), `jobs` (service,
machine à états, historique), `designs` (catalogue, générateurs `dunes/sadu/star/khoos/rake`,
tracé libre, géométrie, trajectoire), `device` (simulateur, driver MQTT, horloge),
`health`, `lifecycle` (arrêt propre), `logging` (pino + masquage des secrets), `config`
(validation Zod de l'environnement), `common` (filtre d'exceptions, persistance JSON).

---

## 5. Protocole MQTT (API ↔ table)

Indépendant de la version HTTP : son propre champ `v` (version 1). Topics
`athar/v1/t/{tableId}/...` ; l'id est validé, donc impossible d'adresser une autre table
avec `/`, `+` ou `#`.

| Topic      | Sens        | QoS / rétention | Contenu                                                                                            |
| ---------- | ----------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `cmd`      | API → table | QoS 1           | `start`, `pause`, `resume`, `stop`, `light` ; chaque message a un `cmdId` (dédoublonné côté table) |
| `ack`      | table → API | QoS 1           | `{cmdId, ok, errorCode}` — accepté, pas terminé                                                    |
| `status`   | table → API | retenu          | Progression du dessin + lumière courante                                                           |
| `presence` | table → API | retenu          | `online` / `offline` (`offline` = Last Will du broker)                                             |

- Commande `start` : trajectoire `polar-theta-rho/v1` (2 à 50 000 points), `jobId`,
  `geometry` (forme + dimensions pour mettre à l'échelle), durée estimée.
- Pas d'`ack` sous **5 s** → la commande échoue en `OFFLINE`.
- Une commande n'est **jamais mise en file** : table non connue en ligne = refus immédiat.
- Les messages ne contiennent jamais d'identifiants.
- L'API démarre même si le broker est injoignable (toutes les tables apparaissent `offline`).

---

## 6. Application admin (`apps/admin`)

Page unique `index.html` (HTML/CSS/JS natif, aucune dépendance, aucun build). Elle appelle
l'API en `fetch` avec un jeton Bearer. L'adresse de l'API est saisie à la connexion
(défaut `http://localhost:3000`) ; hébergée sur une autre origine que l'API, elle doit
figurer dans `CORS_ORIGINS`.

Ce que la page contient (d'après son code) :

- **Connexion** admin (URL de l'API, email, mot de passe), boutons Refresh et Sign out.
- **Clients** : formulaire de création et tableau (email, nom, statut, date, colonne
  d'actions).
- **Tables** : tableau (id, nom, lieu, **forme et taille X × Y**, plan, propriétaire, état,
  actions), **filtre** par nom, lieu, forme ou propriétaire, bouton **Provisionner une
  table**, boîte de dialogue pour les résultats (identifiants MQTT, lien de claim) et la
  saisie de la géométrie, validée par l'API.
- Les erreurs de l'API s'affichent dans une zone `role="alert"`.

Depuis le 22/10/2026 elle montre aussi l'**état en ligne** de chaque table (lecture de `GET /tables/:id`, toutes les
10 s), des boutons **Copy** (id, lien, identifiants du broker), des états vides, une confirmation avant de désactiver
une table et des messages d'erreur en clair. Parcours pas à pas : [`docs/admin.md`](admin.md).

Endpoints utilisés : `/auth/login`, `/admin/customers*`, `/admin/tables*`, et `GET /tables/:id` pour l'état en ligne.
Limites : pas de build ni de tests automatisés dédiés, pas de rôles fins (tout admin peut
tout faire), pas de journal d'audit.

---

## 7. Application mobile (`apps/mobile`)

Expo SDK 57, React Native 0.86, React 19, **Expo Router** (routes par fichiers), Zod,
`expo-secure-store` (session), `expo-camera` (scan QR), `react-native-svg` (aperçus),
polices IBM Plex Sans Arabic et Instrument Serif. Tests : Vitest (logique) + Jest/Testing
Library (composants).

### 7.1 Écrans et routes

| Route                              | Écran                  | Rôle                                            |
| ---------------------------------- | ---------------------- | ----------------------------------------------- |
| `/sign-in`                         | Connexion / activation | Visible seulement hors session                  |
| `/` (onglet Accueil)               | Accueil                | Salutation, scan, lien collé, dernière table    |
| `/scan` (onglet central)           | Scan QR                | Ne lit que les QR d'appairage (caméra gérée)    |
| `/account` (onglet Compte)         | Compte                 | Profil, thème Auto/Clair/Sombre, langue, sortie |
| `/pair?tableId=&token=`            | Appairage              | Claim (client désigné) ou invitation (invité)   |
| `/t/[tableId]`                     | Table                  | État, forme/taille, lumière, catalogue, partage |
| `/t/[tableId]/designs/[designId]`  | Dessin                 | Aperçu à l'échelle de la table, lancement       |
| `/t/[tableId]/jobs/[jobId]`        | Job                    | Progression en direct, pause / reprise / arrêt  |
| `/t/[tableId]/jobs/[jobId]/result` | Résultat               | Succès, échec ou arrêt, avec message explicite  |
| `/diagnostics`                     | Diagnostics            | Détails de connexion                            |

Toutes les routes, sauf `sign-in` (réservée aux visiteurs non connectés), sont protégées
par `Stack.Protected` : sans session, l'app n'affiche que la connexion.

### 7.2 Fonctionnement

- **Session** : `SessionManager` + stockage sécurisé ; jeton d'accès injecté dans chaque
  appel, rafraîchi via `/auth/refresh`.
- **Client API** : `AtharApiClient` (sur `http-client`) valide chaque réponse avec les
  schémas de `@athar/contracts`, génère un identifiant de requête et traduit les codes
  d'erreur en messages localisés (`error-messages`).
- **Suivi des jobs** : interrogation périodique (`EXPO_PUBLIC_POLL_INTERVAL_MS`), suspendue
  quand l'écran n'est pas actif.
- **Droits** : l'interface n'affiche que ce que le rôle permet (owner / guest / admin) ;
  l'API applique les mêmes règles.
- **Aperçu** : `DesignPreview` dessine le motif sur la **forme réelle** de la table
  (ronde, carrée, rectangulaire, ovale) à l'échelle ; l'anneau de progression suit la forme.
- **Scanner solide** : un QR de table est fait pour **une table et un client**. Le scanner
  (et la saisie manuelle) n'acceptent que le lien d'appairage `athar://pair?tableId=&token=`
  (ou `https://<hôte autorisé>/pair?...`, hôte sans identifiant ni port) ; un identifiant ou
  un lien `/t/<id>` seul est ignoré. Un autre compte reçoit `PAIRING_WRONG_ACCOUNT` (403) avec
  un bouton « Se déconnecter », sans consommer le code. La caméra n'est active que sur l'onglet.
- **Liens de table** : `athar://t/<id>` / `https://<hôte>/t/<id>` (hôtes dans
  `EXPO_PUBLIC_TABLE_LINK_HOSTS`) servent aux liens profonds, jamais au scanner.
- **Design** : navigation par 3 onglets (barre flottante, bouton de scan surélevé), transitions
  par type de page (latéral, montée, fondu), thème sombre par défaut (obsidienne `#0c0b0a`,
  or champagne), polices Instrument Serif (titres latins) et IBM Plex (arabe et texte).
- **i18n** : arabe (RTL) et anglais, formatage des durées et des dimensions, langue
  mémorisée. Animations réduites si l'utilisateur le demande (`use-reduce-motion`).

### 7.3 Endpoints appelés par le mobile

`/auth/login|activate|refresh|logout|me`, `/designs`, `/designs/:id`, `/ambiences`,
`/tables/pair`, `/tables/:id`, `/tables/:id/pairing`, `/tables/:id/light`,
`/tables/:id/shares`, `/tables/:id/jobs`, `/jobs/:id` et `/jobs/:id/pause|resume|stop`.
Aucune route `/admin/*` n'est référencée dans le bundle (vérifié lors d'un export Android).

### 7.4 Commandes

```bash
pnpm dev:mobile                       # expo start
pnpm --filter @athar/mobile android
pnpm --filter @athar/mobile build     # expo export --platform android
```

Émulateur Android : l'API est joignable sur `http://10.0.2.2:3000`.

---

## 8. Contrats partagés (`packages/contracts`)

Schémas Zod + types TypeScript, utilisés par l'API, le mobile et les tests. Modules :

| Module                      | Contenu                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `api`                       | `API_PREFIX = 'api'`                                                |
| `errors`                    | `apiErrorCodeSchema` et forme standard des erreurs                  |
| `health`                    | `healthResponseSchema`, `readyResponseSchema`                       |
| `auth`                      | rôles, login, activation, refresh, session, compte                  |
| `table`                     | `Table`, readiness, accès, appairage, identifiant de table          |
| `geometry`                  | formes, limites 100–10 000 mm, `polarToTableMm`, `tableProportions` |
| `entitlements`              | plans, fonctions, `PLAN_FEATURES`, `featuresFor`                    |
| `drawing-job`               | job, états, transitions, requêtes de démarrage, historique          |
| `design`, `ambience`        | catalogue, ambiances, lumière (`off/on/color/preset`)               |
| `pairing`                   | jetons de claim/partage, membres, expiration de partage (max 168 h) |
| `admin`                     | tables et clients côté admin, provisioning, identifiants MQTT       |
| `device`, `device-protocol` | statut du driver, protocole MQTT v1, trajectoire filaire            |

Règle : changer un format = modifier ce package ; l'API et l'app échouent à la compilation
ou à la validation si elles divergent.

---

## 9. Qualité, tests et CI

- **Commande unique** : `pnpm check` = `format:check` + `lint` + `typecheck` + `test`.
- **API** : Vitest, tests unitaires et e2e (Supertest) : auth, tables, jobs, parcours
  complet, conditions de dessin, designs, géométrie, driver MQTT. Dernier résultat
  observé : 1098 tests réussis, 1 ignoré (55 fichiers).
- **Mobile** : Vitest (logique pure) + Jest/Testing Library (écrans, composants, i18n).
- **CI** : `.github/workflows/check.yml` — sur push vers `master` et sur chaque PR :
  Ubuntu, Node 20, pnpm 10, `pnpm install --frozen-lockfile` puis `pnpm check`.
- **Observabilité** : logs pino (JSON en production, masquage des secrets), identifiant de
  corrélation par requête, sondes `/health` et `/ready`.

---

## 10. Limites connues et points ouverts

Sécurité et exploitation :

1. Identifiants MQTT générés par `provision` mais **non enregistrés sur le broker**
   (Dynamic Security à brancher).
2. **Une seule instance** de l'API (verrous de fichiers + jobs en mémoire) ; PostgreSQL prévu.
3. Les redémarrages **perdent les dessins en cours** ; sauvegarde du volume JSON à organiser.
4. Limitation de débit : le login est limité par IP ; `docs/deployment.md` indique qu'il
   n'y a pas de limitation sur les autres endpoints (décisions 2 et 21).
5. Dockerfile et stack `deploy/` : le mode local est testé (API + broker), mais aucun déploiement cloud réel (VM en pause), domaine non décidé (décision 3) : les URLs
   `*.athar.example` sont des placeholders qui bloquent volontairement les builds de release.
6. Page d'installation de l'app (repli du lien QR) et fichiers `apple-app-site-association` /
   `assetlinks.json` : non faits.
7. Application admin : pas de build, pas de rôles fins, pas de journal d'audit.

Fonctionnel :

8. Le mobile ne propose pas encore le choix du mode stylo ; la géométrie se configure
   côté admin uniquement.
9. Un invité peut régler la **lumière** et l'**ambiance** (`setAmbience` délègue à
   `setLight`, droit `command` ; couvert par `customer-journey.e2e.spec.ts`). Les
   commentaires de `TablesService.setAmbience` et du contrôleur disent encore
   « propriétaire » : ils sont périmés.
10. Builds de store : compte Apple, identifiants de bundle et clé de signature non
    configurés.

Avant le premier déploiement réel : fixer le domaine et `PUBLIC_LINK_BASE_URL` ; choisir
l'hébergeur et créer le volume ; remplacer les placeholders d'`eas.json` ; tester un build
`preview` sur un vrai téléphone contre un staging https ; sauvegarder le volume.
