# Flash Poker — moteur, serveur et interface (Phases 1 à 6 + assurance + assistance)

**Flash Poker** : application de poker multivariantes en temps réel, de 2 à 6 joueurs. Règles de référence :
**document de règles v1.1** et les décisions validées depuis. Aucune règle n'est inventée : les hypothèses
restantes sont listées plus bas.

## Lancer

> **Première fois ? Suivez [DEMARRAGE.md](DEMARRAGE.md)** (guide pas à pas, sans connaissances techniques).

```bash
npm install
npm test                        # moteur + serveur + interface (≈ 490 tests)
npm run typecheck
npm run dev                     # serveur (:3000) + interface (:5173) d'une seule commande
npm run dev:calme               # idem, minuteurs de 3 min (PHASE_SECONDS=180) : essai en solo uniquement
npm run dev:server              # serveur seul (PORT, HOST, CORS_ORIGIN, PHASE_SECONDS)
npm run dev:web                 # interface seule (relaie /rooms et /socket.io vers :3000)
npm run build:web               # bundle de production (packages/web/dist, ~150 Ko compressés)
npm run test:e2e                # parties de bout en bout dans de vrais navigateurs + audit d'accessibilité
                                #   (la première fois : npx playwright install chromium)
npm -w @poker/server run charge # test de charge (TABLES=250 JOUEURS=6 pour 1 500 connexions)
```

Mise en ligne de l'espace de test : **[MISE_EN_LIGNE_RENDER.md](MISE_EN_LIGNE_RENDER.md)**.
Bilan de la phase 8 (tests de bout en bout, charge, accessibilité) : **[LIVRAISON.md](LIVRAISON.md)**.

## Structure

```text
packages/engine/            TypeScript pur : aucune dépendance réseau ni base de données
├── core/       Card, Rng (CSPRNG / graine), Shuffle, CardEngine (paquet, mains, plateau, défausse, vues, snapshot)
├── evaluation/ HandEvaluator, Holdem, Omaha (2+3 exact, paire désignée), évaluation partielle du 6-1, ranking
├── variants/   8 manches : Fermé 1/2, Aviation, Avia 6, 6-3, 6-1, Morpion, Le 10 + Hold'em de départage
└── game/       GameManager (rotation, scores, objectif, assurance, arrivées, exclusions, minuteurs), insurance, positions
packages/server/            Node + Fastify + Socket.IO + Zod
├── roomManager.ts  rooms, lobby, jetons, partie, minuteurs de 60 s, connexions, persistance (SANS réseau)
├── http.ts         routes HTTP + pont WebSocket (RealtimeManager), limitation de débit
├── protocol.ts     schémas Zod (entrées) et types des messages (sorties)
├── store.ts        interface RoomStore + SqliteRoomStore (node:sqlite, défaut) + InMemoryRoomStore (STORE=memory)
└── scheduler.ts    horloge/minuteurs injectés (réels en production, manuels en test)
```

packages/web/               React 19 + Vite + Tailwind + Framer Motion + Zustand (aucun code serveur ni moteur embarqué : types partagés en « import type »)
├── lib/        GameClient (HTTP + WebSocket, reconnexion, décalage d'horloge serveur), reduceUpdate (pur), session, événements → annonces
├── components/ cartes SVG (2 ou 4 couleurs), sièges, plateau, design system
├── panels/     Fermé 1/2, Aviation/Avia 6, 6-3 (zéro aide), 6-1, Morpion (zéro aide), Le 10, choix de variante, assurance
└── screens/    accueil, création/arrivée, salle d'attente, table (ovale desktop, colonne mobile), résultats, départage, fin de partie

## Protocole

**HTTP** — `POST /rooms` (création, 201 : `{code, playerId, token}`), `POST /rooms/:code/join` (arrivée), `GET /health`.
Le **jeton** identifie le joueur ; seule son empreinte SHA-256 est conservée.

**WebSocket** — connexion avec `auth: {code, token}` (sinon `fatal` + déconnexion).

| Client → serveur (avec accusé `{ok}` / `{ok:false,error}`) | Effet |
|---|---|
| `command` `{type: CHOOSE_VARIANT \| SELECT \| VALIDATE \| REVEAL \| PROPOSE_INSURANCE \| RESPOND_INSURANCE, …}` | intention de jeu ; l'identité vient du jeton, jamais du message |
| `lobby:start`, `lobby:cancel`, `lobby:leave`, `host:exclude {playerId}`, `state:resync` | lobby / hôte |

| Serveur → client | Contenu |
|---|---|
| `update` | `{version, view, events}` : SA vue filtrée + SES événements ; tous reçoivent la même version au même moment |
| `kicked`, `fatal` | retrait par l'hôte ; authentification refusée |

Les commandes d'échéance (`TIMEOUT`…), d'arrivée et d'exclusion **n'existent pas côté client** : rejetées par le schéma.

## Décisions techniques

- **Serveur autoritaire** ; le moteur est déterministe (aléa injecté). Toute commande refusée laisse l'état intact.
- **Secret** : les vues (`projectForPlayer`) ne contiennent jamais de carte cachée d'autrui, ni paquet, ni défausse ;
  vérifié dans le moteur, dans le RoomManager et sur de vrais sockets.
- **Minuteurs de 60 s** décidés par le serveur (`RoomManager`), jamais par le client. Une phase à minuteur est identifiée
  par une clé : une simple sélection ne relance pas les 60 s, une nouvelle phase (change, défausse, ligne, retournement 6-1,
  proposition d'assurance, choix de variante) les relance. Avertissement neutre à 10 s aux seuls joueurs à sélection
  incomplète. L'échéance est absolue (ms) : exacte après reconnexion ou redémarrage.
- **Déconnexion** : rien ne change (siège, cartes, score, assurance conservés) ; les minuteurs continuent avec leurs défauts.
- **Exclusion par l'hôte** : en lobby ou file d'attente, le joueur est retiré ; en partie, il garde son siège en absent
  permanent (défauts appliqués instantanément), sa mise et ses points restent.
- **Arrivée en cours de partie** : file d'attente pendant une manche ; assis entre deux manches à la dernière position,
  0 point, même mise ajoutée à la cagnotte ; la rotation continue dans l'ordre des positions.
- **Assurance** : proposable seulement à partir de 4 joueurs à table ; entre deux manches, un seul proposant à la fois, réponse du partenaire en 60 s (silence = refus). Un duo qui refuse (ou n'a pas répondu) ne peut plus se reproposer une assurance entre eux pour le reste de la partie ; chacun reste libre avec un autre partenaire éligible.
  une seule assurance par partie ; règlement de la cagnotte en centimes entiers à la fin.
- **Persistance** : `RoomStore` (interface), avec **SQLite par défaut** (`SqliteRoomStore`, module `node:sqlite`
  intégré à Node.js depuis la version 22.13 — aucune dépendance externe, aucune compilation native) — les parties
  survivent désormais à un redémarrage du serveur, vérifié par un test qui simule un vrai arrêt puis relance un second
  `RoomManager` sur le même fichier, et confirmé avec un vrai processus tué (`kill -9`) puis relancé. Emplacement
  réglable via `DB_PATH` (par défaut `./data/flashpoker.db`) ; `STORE=memory` revient à l'ancien comportement mémoire
  (essai jetable uniquement). Erreur d'écriture ou ligne illisible = jamais bloquante pour la partie en cours
  (best-effort). Une seule instance de serveur pour l'instant ; passer à un adaptateur PostgreSQL (même interface) le
  jour où plusieurs instances doivent partager le même état (répartition de charge).
- **Déploiement à service unique** (`WEB_DIST`) : le serveur peut aussi servir le build de l'interface
  (`packages/web/dist`) sur sa propre origine — une seule instance Node pour tout, sans CORS à configurer. Utilisé par
  `render.yaml` (espace de test gratuit sur Render.com ; voir ses commentaires pour les limites du plan gratuit :
  veille après 15 min, disque éphémère). La cible de production reste le VPS OVH, avec un disque persistant.
- **Hygiène** : `sweep()` supprime les rooms périmées (lobby 2 h, terminées 1 h) et abandonne une partie sans aucun joueur
  connecté depuis 30 min (sécurité opérationnelle, configurable — pas une règle du jeu).
- **Sécurité** : jetons aléatoires (192 bits) hachés ; validation Zod de toute entrée ; corps HTTP et messages WebSocket
  limités à 10 ko ; limitation de débit par IP (création/arrivée) et par connexion ; pseudo restreint, avatar = préréglage.

## Règles confirmées (résumé des décisions)

Objectif de 1 à 5 points · mise de 0 à 10 000 € par joueur · 2 à 6 joueurs (le maximum fixé à la création limite aussi les
arrivées) · Fermé 2 changes et Le 10 jusqu'à 5 joueurs · minuteur de 60 s partout (changes, défausses, lignes du 6-3,
retournement du 6-1 et du 10, désignation au morpion, choix de variante, réponse à une assurance) · choix de variante
expiré : variante disponible tirée au hasard · 6-1 et Le 10 : retournement automatique à l'échéance ; le propriétaire ne
voit pas non plus ses propres cartes cachées — il les découvre au même rythme que ses adversaires, au moment de la
révélation · égalité au
showdown : Hold'em de départage entre les seuls ex aequo · quinte flush désignée au 6-3 : victoire immédiate ·
classement final : le vainqueur et son partenaire assuré · assurance : deux joueurs à 1 point de la fin, à partir de
4 joueurs à table ; vainqueur non assuré = il récupère tout ; un duo refusé (ou expiré) ne peut plus se reproposer
entre eux, mais reste libre avec un autre partenaire.

**Morpion (Hold'em)** : 4 cartes privées, 9 cartes communes en grille 3×3 toutes visibles dès le départ. Chaque joueur
désigne 2 de ses cartes et un alignement (une des 3 lignes, 3 colonnes ou 2 diagonales) ; sa main est ces 2 cartes + les
3 cartes de l'alignement choisi. Aucune aide, comme au 6-3. 2 à 6 joueurs.

**Le 10 (Hold'em)** : jusqu'à 5 joueurs. 10 cartes privées chacun, aucune carte commune. Distribution une à une comme au
6-1 : 9 cachées, la 10e visible ; retournement de la main visible la plus faible jusqu'au showdown. La comparaison, y
compris pendant les révélations, porte sur les seules cartes déjà visibles de chacun (quinte et couleur impossibles à
moins de 5 cartes). Showdown : meilleure main de 5 cartes parmi les 10, sans contrainte (règle du Hold'em).

**Niveau de la partie : avec ou sans assistance** (choisi à la création, fixé pour toute la partie, toutes variantes). Par
défaut : sans assistance, aucune indication. Si l'hôte propose « avec assistance », **chaque joueur** doit l'approuver
en salle d'attente (l'hôte est approuvé d'office, mais peut se rétracter ; un arrivant tardif doit aussi voter). Le vote
a trois états — accord, refus, pas encore répondu — et le **silence compte comme un refus** au départ : sans l'accord de
tous, la partie démarre sans assistance. L'assistance n'affiche que le **nom de la combinaison** (paire, brelan…), jamais
de suggestion ni de comparaison : Poker fermé = main actuelle avant changement ; Aviation / Avia 6 = cartes gardées +
plateau déjà révélé (jamais une carte encore cachée) ; 6-3 et Morpion = cartes désignées (+ alignement) une fois la
sélection complète ; 6-1 et Le 10 = sans objet (aucune sélection de cartes). Jamais visible d'un adversaire.

**6-1 et Le 10 — cartes cachées, y compris pour soi** : le joueur ne voit pas non plus ses propres cartes tant qu'elles
ne sont pas retournées ; il les découvre exactement au même moment que ses adversaires. Seule la vue transmise au
client est concernée (l'évaluation interne du moteur reste inchangée).

**6-3 : 3 plateaux indépendants de 5 cartes** (flop + turn + river chacun, 15 cartes communes au total, aucune carte
partagée entre lignes). La ligne 1 est entièrement visible dès le départ (13 cartes visibles en tout : ligne 1 complète
+ flop/turn des lignes 2 et 3) ; seules les rivers des lignes 2 et 3 restent cachées (2 cartes), révélées l'une après
l'autre dès que la ligne précédente est close. Le vainqueur de la manche est celui qui totalise le plus de points sur
les 3 lignes ; en cas d'égalité en tête à 3 joueurs ou moins, 0 point pour tous ; à 4 joueurs ou plus, Hold'em de
départage entre les seuls ex aequo. *(Corrigé le 22/09/2026 : la version précédente partageait à tort le flop et le
turn entre les 3 lignes — voir « Reste à faire ».)*

**Mode entraînement contre le CPU** (bouton « S'entraîner contre le CPU » sur l'accueil). L'hôte choisit de 1 à 5
adversaires CPU, l'objectif et l'assistance ; la table est privée (complète dès la création) et démarre aussitôt, sans
mise. Les CPU sont pilotés par le serveur (`RoomManager`, délai de réflexion de 0,9 à 2,4 s) et décident avec
`cpuPlan` (`packages/engine/src/cpu/cpu.ts`), qui ne lit que la vue d'un joueur : jamais les cartes cachées des autres.
6-3 et Morpion : meilleure combinaison calculée exactement. Poker fermé, Aviation, Avia 6 : estimation par tirages
aléatoires. 6-1 et Le 10 : ils retournent leur carte quand c'est leur tour. Variante choisie au hasard parmi les
variantes jouables ; assurance toujours refusée et jamais proposée. Choix de règles à valider : aucune règle du jeu
n'est modifiée, le CPU n'utilise que les commandes ouvertes à un joueur humain.

**Ambiances et effets 3D.** Les Paramètres proposent six ambiances de fond (cognac par défaut, émeraude, cuir, carbone, bordeaux, violet nuit), appliquées par des variables CSS (`--ink-*` dans `styles.css`, choix retenu dans `localStorage` et reporté sur la barre du navigateur). L'accueil présente un éventail de cartes en volume qui suit le pointeur (un clic retourne une carte) ; à la fin d'une manche, les cartes gagnantes se retournent une à une ; à la fin de la partie, le trophée pivote et des pièces d'or tombent en tournant. Tout est en CSS (perspective et rotations, via Framer Motion), sans bibliothèque 3D, et reste immobile si `prefers-reduced-motion` est actif (`components/Scene3D.tsx`).

## Plan de tests

| Domaine | Couverture |
|---|---|
| Cartes / évaluateurs | 52 cartes, mélange uniforme, énumération des 2 598 960 mains (effectifs exacts, 7 462 classes), 2+3 exact, meilleure main partielle (Le 10, 1 à 4 cartes) |
| Variantes | scénarios déterministes (paquets truqués), oracle « vue publique » pour le 6-1 et Le 10, manches aléatoires simulées sur les 8 variantes (+ 1 000 pour la quinte flush hors 6-3) ; 6-3 : 28 tests dédiés (3 plateaux indépendants, 15 cartes, 13 visibles/2 cachées au départ) ; Morpion et Le 10 : 24 tests dédiés (8 alignements, plafond de joueurs, meilleure main partielle/complète) |
| Game Manager | rotation, objectif, assurance, arrivées, exclusions, minuteurs, snapshot/restore, 100 parties aléatoires (60 complètes + 40 avec arrivées et exclusions) |
| RoomManager (horloge simulée) | lobby, validation, jetons, identité, secret des messages, minuteurs, reconnexion, arrivées, exclusions, persistance, hygiène |
| Réseau (vrais sockets) | HTTP, authentification, partie de bout en bout, secret sur le réseau, reconnexion, multi-onglets, exclusion, débit |
| Robustesse | ≈ 60 mutations volontaires des règles : toutes détectées, sauf 3 mutants équivalents (doubles gardes / mutation inerte) |

## Interface (Phase 6)

- **Zéro aide au 6-3** : aucun libellé de combinaison ni mise en évidence pendant la désignation ; un test compare le texte affiché pour la meilleure et la pire paire (identique).
- **Secret** : les cartes cachées d'un adversaire ne sont rendues que sous forme de dos ; test d'intégration sur de vrais sockets (aucun code de carte adverse dans la vue).
- **Reprise** : le jeton de session est conservé dans le navigateur ; après rechargement, siège, main, brouillon de sélection et minuteur sont restaurés.
- **Minuteurs** : l'échéance vient du serveur ; le client corrige le décalage d'horloge (aucun compteur local autonome).
- **Choix d'ergonomie (à valider)** : sur ordinateur, sièges en une rangée au-dessus du tapis (ils recouvraient la grille du Morpion et la ligne 1 du 6-3 quand ils étaient placés autour de l'ovale) ; récapitulatif de manche fermé seul après 14 s, sauf si le joueur touche ou fait défiler la fenêtre (alors il reste ouvert) ; main triée par rang (sauf au 6-1, ordre de distribution) ; pas de bouton « quitter » en cours de partie ; défilement automatique vers le panneau d'action quand il dépasse de l'écran.
- **Assistance** : case « Niveau de la partie » à la création ; en salle d'attente, bloc de vote (mes deux boutons, statut « oui / non / en attente » de chaque joueur, mention « Accord de tous ») ; indicateur « Votre combinaison : … » dans les 4 panneaux concernés.
- **Sensations de jeu** : sons courts synthétisés (sélection, validation, retournement, votre tour, victoire, erreur), vibration mobile au début de votre tour et aux 5 dernières secondes, titre d'onglet clignotant (« ▶ À vous ! ») quand l'onglet est en arrière-plan et que c'est votre tour — réglage « Sons et vibrations » dans Options, activé par défaut. Adversaires en réflexion : badge « réfléchit… » qui pulse. Confettis (désactivés si `prefers-reduced-motion`) à la fin de partie. Morpion : les 8 alignements s'affichent en mini-grilles visuelles (reconnaissance immédiate) plutôt qu'en texte. Distribution en cascade : chaque carte d'une main ou d'un plateau arrive avec un léger décalage (60 ms, plafonné à 12 cartes) plutôt que d'apparaître d'un bloc — désactivé si `prefers-reduced-motion` (fonction `dealDelay`, testée unitairement).
- **6-3 : 3 plateaux indépendants** affichés en 3 rangées (Ligne 1/2/3), chacune ses 5 propres cartes ; les rivers non révélées des lignes 2 et 3 restent des emplacements vides tant que la ligne précédente n'est pas close. Vérifié par 4 tests dédiés au composant, une partie réelle en navigateur (comptage exact : 13 → 14 → 15 cartes visibles au fil des lignes), et 8 mutations volontaires sur le moteur, toutes détectées.
- **Contrôles réalisés** : 144 tests (unitaires, panneaux, écrans, client, intégration serveur réel) ; mutations volontaires sur chaque nouveauté, toutes détectées ; parcours complets dans un vrai navigateur, à 2, 3 et 6 joueurs (dont la grille mobile à 6 joueurs), rechargement de page en pleine manche, fin de partie.
- **Non couvert par un navigateur** : parcours complet de l'assurance et Hold'em de départage animé (couverts par des tests de composants) ; l'animation de distribution des cartes (déjà identifiée, pas encore traitée).

## Hypothèses à confirmer

- Le minuteur du chooser repart à 60 s dès qu'il redevient attendu (après une proposition d'assurance).
- `TIMEOUT` avec une proposition d'assurance en attente : la proposition expire d'abord (pas de variante tirée).
- Un arrivant assis juste après le dernier chooser choisit immédiatement la manche suivante.
- Lobby : chacun peut le quitter ; l'hôte ne le quitte pas (il annule) ; l'hôte peut retirer un joueur.
- Assurance et arrivées visibles de tous ; centime impair d'un 50/50 au vainqueur.

## Reste à faire

1. **Interface** : validation de votre part des choix d'ergonomie ci-dessus ; test sur appareils tactiles réels.
2. **Espace de test** : `render.yaml` prêt et vérifié sur une copie neuve (mêmes commandes que Render) — reste à
   créer le compte et connecter le dépôt : [MISE_EN_LIGNE_RENDER.md](MISE_EN_LIGNE_RENDER.md).
3. **Déploiement en production** : VPS OVH prévu, offre exacte (VPS / Public Cloud / mutualisé) à confirmer ensemble ;
   processus Node persistant (WebSocket), reverse proxy TLS, disque persistant pour la base SQLite, `CORS_ORIGIN` si
   le front est hébergé ailleurs que le serveur.
4. **Phase 8** : faite (voir [LIVRAISON.md](LIVRAISON.md)) — parties de bout en bout, charge, accessibilité automatisée.
   Reste : essai avec un vrai lecteur d'écran (NVDA, VoiceOver) et sur Safari / Firefox réels.
6. **Comptes joueurs** : faits (voir [LIVRAISON.md](LIVRAISON.md), code dans `packages/server/src/accounts/`, base
   `comptes.db` à côté de `DB_PATH`). Reste : choisir le service d'envoi d'e-mails (variables `SMTP_*`).
5. **Plusieurs instances de serveur** : la persistance SQLite actuelle suppose un seul processus ; passer à PostgreSQL
   (même interface `RoomStore`) le jour où la charge exige de répartir les parties sur plusieurs serveurs.
