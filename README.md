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

## Blackjack (module indépendant du poker)

Rubrique « Casino » de l'accueil, séparée des huit variantes. Un joueur contre le croupier, avec ou sans compte. Jetons, niveau, défis et manche en cours sont enregistrés côté serveur. Un invité est identifié par un code aléatoire propre à son navigateur (en-tête `x-bj-guest`) : sa progression reste sur cet appareil, il n'apparaît pas au classement et ne partage pas l'expérience du poker. Se connecter donne un profil qui suit le joueur partout (la progression d'invité n'est pas transférée).

**Séparation des couches**

| Couche | Emplacement | Rôle |
|---|---|---|
| Règles | `engine/src/blackjack/rules.ts` | `TableRules`, tables prédéfinies (Découverte, Classique, Jeu unique, Atlantic, Haut niveau) et table libre |
| Moteur | `engine/src/blackjack/{hand,round,shoe,sha256}.ts` | totaux, manche (Hit, Stand, Double, Split, Surrender), sabot vérifiable, rejeu |
| Aide | `engine/src/blackjack/{strategy,odds}.ts` | stratégie de base et probabilités exactes (niveaux pédagogiques) |
| Progression | `engine/src/blackjack/progress.ts` | niveaux, XP, défis quotidiens, objectifs |
| Données | `server/src/blackjack/service.ts`, tables `bj_*` de `accounts/db.ts` | profil, manche active, historique, défis, objectifs, classement |
| API | `server/src/blackjack/routes.ts` | `/me/blackjack*`, `/blackjack/leaderboard` |
| Interface | `web/src/screens/Blackjack.tsx`, `web/src/components/blackjack/` | salon, table, panneaux |
| Droits | `web/src/lib/entitlements.ts` | point d'extension de la monétisation |

**Équité vérifiable.** Avant la première décision, le serveur publie `SHA-256("flashpoker-blackjack-v1:commit:" + graine)`. Le sabot est une fonction pure de la graine et du nombre de jeux (flux SHA-256 en mode compteur, tirage sans biais, mélange de Fisher-Yates). À la fin de la manche, la graine est révélée : le navigateur recalcule l'engagement et le joueur peut reconstruire le sabot. Un sabot neuf est tiré à chaque manche ; aucune table n'est truquée, seules les règles diffèrent.

**Cartes cachées.** Le sabot et la carte cachée du croupier ne quittent jamais le serveur (`roundView`). Le client n'envoie que l'action choisie.

**Reprise.** La manche active est stockée sous la forme graine + mise + suite d'actions ; elle est reconstruite par rejeu, sans état fragile. Une manche abandonnée plus de 12 h est conclue en « Rester ».

**Jetons.** Solde propre au Blackjack (1 000 au départ), recharge à 500 sous 5 jetons après 30 minutes, jamais en cours de manche. Jetons virtuels sans valeur monétaire.

**Progression commune.** L'XP est partagée avec le poker (40 par partie terminée, 60 de plus pour le vainqueur) ; chaque niveau rapporte `100 × niveau` jetons de Blackjack. Trois défis quotidiens par joueur (jour de Paris), dix objectifs.

**Règles gérées.** Totaux souples, Blackjack naturel, égalité, croupier sur 17 (tire ou non sur 17 soft), Blackjack 3:2 ou 6:5, doublement (tout total, 9-11, 10-11), doublement après séparation, 2 à 4 mains, séparation des As (une carte chacun, re-séparation en option), abandon tardif, vérification du Blackjack du croupier sur As ou 10. L'assurance n'est volontairement pas proposée.

**Tables à plusieurs (1 à 6 places).** Onglet « À plusieurs » : l'hôte choisit la table (ou la table libre) et désigne chaque place, humaine ou CPU. Les humains rejoignent avec un code `BJ-XXXX` (compte ou invité) ; les places humaines restées libres sont retirées au lancement. Tous les joueurs affrontent le même croupier, avec un sabot commun tiré d'une graine publiée par empreinte avant la distribution. Chaque place joue à son tour, le croupier joue une fois. Les règles d'une place sont celles de la manche solo (`applyToHands` est partagé), l'orchestration est dans `engine/src/blackjack/table.ts`.

- Chaque humain mise avec ses propres jetons et gagne XP, défis et objectifs comme en solo. Les CPU suivent la stratégie de base avec un solde propre à la table.
- Rythme : mises 40 s (la mise précédente est reprise à défaut), tour humain 30 s (« Rester » automatique), un CPU joue toutes les 1,1 s, manche suivante automatique après 25 s. Tout avance à la demande à chaque requête : pas de minuteur serveur, la reprise après redémarrage est gratuite (état en base, manche reconstruite par rejeu).
- Un joueur qui quitte en cours de manche reste sur « Rester » jusqu'à la fin ; la table se ferme quand le dernier humain part ou après 6 h d'inactivité.
- Mise à jour par sondage chaque seconde (`GET /blackjack/tables/:code?v=version` renvoie `{unchanged}` quand rien ne change), sans WebSocket supplémentaire.
- Limite : les probabilités du niveau « indices » ne tiennent pas compte des cartes des autres places.

**Monétisation (préparée, non active).** Le module n'implique aucun argent réel. `entitlements.ts` distingue le jeu complet, toujours gratuit, des options futures (cosmétiques, statistiques avancées, compétitions à récompenses virtuelles, retrait de publicité). Aujourd'hui tout est accordé ; brancher un abonnement revient à remplacer `plan()`.

**Limite connue.** Sur l'hébergement gratuit de Render, le disque est éphémère : les comptes, jetons et statistiques disparaissent à chaque redéploiement. Un disque persistant (ou une base externe) est nécessaire pour de vrais testeurs.

## Le Tableau (module indépendant, étape 1)

Variante à deux joueurs : cinq colonnes de cinq cartes, posées une à une et définitivement ; les colonnes se comparent deux à deux, trois colonnes gagnées font gagner la partie (2–2 avec une égalité : nul). Aucune mise, aucun bluff.

**Règles retenues.** 52 cartes, aucun doublon : chaque joueur reçoit 5 cartes de départ (une par colonne) et un paquet de 21 cartes. Il n'y a que 20 places libres : on pioche 20 fois, on ne défausse jamais et la 21e carte du paquet n'est pas jouée. Délai de 30 s par tour ; passé ce délai (plus 1,5 s de tolérance réseau), la carte est posée dans la première colonne libre, de gauche à droite.

**Architecture.**
- `packages/engine/src/tableau/` : `evaluator.ts` (les dix combinaisons dont la quinte flush royale, roue A-2-3-4-5, kickers, égalités parfaites ; jamais de somme de valeurs), `game.ts` (distribution, tours, placements, résultat), `ai.ts` (trois niveaux).
- `packages/server/src/tableau/` : `TableauService` (parties Entraînement et Amical, persistance SQLite `tb_game` / `tb_seat`) et routes `/tableau/…`.
- `packages/web/src/screens/Tableau.tsx` et `components/tableau/Board.tsx` : menu, plateau, résultats. Le navigateur n'embarque aucune règle : il affiche ce que le serveur décide.

**Équité et cartes cachées.** Le serveur tire une graine de 256 bits et publie son empreinte SHA-256 avant la première carte. Le mélange (Fisher-Yates sur un flux SHA-256 en mode compteur, sans biais de modulo) est une fonction pure de la graine. À la fin de la partie, la graine et l'ordre des 52 cartes sont révélés ; l'écran de résultats permet de contrôler l'empreinte dans le navigateur. Une vue ne contient jamais le paquet de l'adversaire, ni sa carte piochée, ni vos cartes à venir (testé).

**Reprise et déconnexion.** L'état est la graine plus le journal des coups, rejoués à l'identique après un redémarrage. Aucun minuteur serveur : chaque requête fait d'abord avancer l'horloge (coups de l'IA arrivés à échéance, délais dépassés). Après 3 délais manqués consécutifs, une partie amicale est perdue par forfait ; une partie d'entraînement est mise en pause et reprend au retour du joueur.

**Quinte flush (les deux variantes).** Le premier joueur qui complète une quinte flush (royale comprise) dans une colonne gagne la partie immédiatement : le jeu s'arrête, sans comparer les colonnes restantes. Le résultat expose alors `straightFlush` (siège, colonne, main) et seules les colonnes complètes des deux côtés sont détaillées.

**Variante « Tableau 5 cartes ».** Comme en variante classique, une carte de départ ouvre chaque colonne ; chaque joueur reçoit en plus 5 cartes en main, prélevées sur son paquet (qui compte alors 16 cartes ; le mélange des 52 cartes et la preuve d'équité sont inchangés). À chaque tour, le joueur pioche puis pose soit la carte piochée, soit une carte de sa main (la piochée la remplace). Au bout de 15 pioches il reste une carte au paquet, qui ne se pioche jamais : plus personne ne pioche et chacun termine ses colonnes avec les 5 cartes de sa main (20 placements par joueur, 40 coups). Passé le délai de 30 s, la carte piochée est posée dans la première colonne libre (ou, sans pioche, la première carte de la main). La main de l'adversaire n'est jamais transmise. L'IA choisit la carte et la colonne : l'Expert départage ses huit meilleurs coups par simulation.

**Intelligence artificielle.** Elle ne reçoit que la vue de son siège (équité).
- Débutant : se place près d'une carte de même valeur sinon remplit à gauche, et se trompe une fois sur trois.
- Intermédiaire : estime la force future de chaque colonne d'après les cartes non encore vues et place la carte où le gain est le plus grand ; la carte inutile va dans la colonne sacrifiée.
- Expert : simule des centaines de fins de partie (cartes non vues tirées au hasard, adversaire raisonnable) et choisit la colonne qui maximise la probabilité d'atteindre trois colonnes. Temps borné (350 ms par défaut).
Des parties appariées (sièges échangés) vérifient la hiérarchie des niveaux.

**Tests.** Énumération des 2 598 960 mains (répartition officielle des catégories retrouvée), départages, distribution, parties complètes, délais, reprise, synchronisation, absence de fuite, bout en bout avec un vrai serveur.

**Prévu aux étapes suivantes.** Étape 2 : dix ligues, mode Classé, statistiques et défis. Étape 3 : tournois. Les droits (`lib/entitlements.ts`) restent le point d'extension de la monétisation : cosmétique et confort uniquement, jamais d'avantage de jeu.

### Étape 2 : mode Classé, dix ligues, statistiques et défis

- **Classé** : partie contre l'ordinateur (trois niveaux de force fixes), réservée aux comptes connectés. Pas de conseil ; quitter la partie ou laisser trois tours expirer est une défaite enregistrée (une partie classée abandonnée est aussi conclue par le serveur, sans que le joueur revienne).
- **Score** : Elo calculé par le serveur (départ à 800, adversaire coté 850, 1150 ou 1450 selon le niveau, facteur 32 pendant les 10 premières parties puis 24, plancher à 0). Chaque variante (classique, 5 cartes) a son propre score et son propre classement.
- **Dix ligues** : Débutant (0), Apprenti (900), Amateur (1000), Régulier (1100), Confirmé (1200), Expert (1300), Maître (1400), Grand maître (1500), Champion (1650), Légende (1800).
- **Statistiques** (comptes connectés, tous modes) : parties, victoires, défaites, nuls, séries, colonnes gagnées, victoires sur quinte flush, meilleur score.
- **Défis du jour** : trois défis tirés d'une liste de dix, identiques pour tous, renouvelés à minuit (heure de Paris). Chacun rapporte 40 points d'expérience du profil commun. Aucun avantage de jeu n'est lié au score, aux ligues ou aux défis.
- **Duel classé (contre un humain)** : bouton « Chercher un adversaire » (comptes connectés, par variante). Le serveur apparie deux joueurs en attente dans une file (`tb_queue`) : écart de classement de 100 points, élargi de 50 toutes les 10 s, sans limite après 60 s, attente maximale de 3 minutes. Le premier arrivé fixe la table ; le second déclenche l'appariement ; le navigateur du premier découvre la partie par sondage toutes les 2 s. Le score est le même que contre l'ordinateur (une seule échelle par variante) : à la fin, chaque joueur est noté sur les classements d'avant la partie (Elo à la manière des échecs, facteur 32 pendant les dix premières parties classées, 24 ensuite, somme nulle à facteurs égaux). Les classements des deux joueurs s'affichent à la table. Quitter ou laisser trois tours expirer est une défaite ; une partie de duel abandonnée est conclue par le serveur. Le classement affiche un « ? » tant qu'il est provisoire.
- **Limite connue du duel** : aucune règle n'empêche encore deux comptes complices de se rencontrer en boucle pour gonfler un classement (à traiter avant une ouverture publique : plafond de rencontres par paire et par jour). Les parties se jouent en temps réel (30 s par tour), pas encore en différé.
- **Journal des erreurs du navigateur** : `POST /client-errors` reçoit les erreurs non rattrapées (message, pile et page, bornés, 10 par minute et par adresse, aucune donnée de compte) et les écrit dans le journal du serveur (`[navigateur]`), pour diagnostiquer un affichage cassé sur un appareil que l'on n'a pas.
- Code : `engine/src/tableau/league.ts` (fonctions pures), `server/src/tableau/stats.ts` (tables `tb_profile` et `tb_daily`, incluses dans l'export et la suppression de compte), routes `GET /me/tableau/profile` et `GET /tableau/leaderboard`, `web/src/components/tableau/Progress.tsx`.

## Langues

Sélecteur en haut de page (français, English, Español, Deutsch, Italiano) ; le choix est mémorisé dans le navigateur, à défaut la langue du navigateur est utilisée. Les textes sont des dictionnaires plats dans `packages/web/src/i18n/` (le français est la langue source ; un test vérifie que les cinq dictionnaires ont les mêmes clés et les mêmes paramètres). Pour Le Tableau, le serveur ne renvoie que des faits (cartes, catégories, codes d'erreur) : noms de combinaisons, conseils et messages sont composés dans le navigateur, dans la langue choisie (`lib/tbText.ts`). L’ensemble de l’interface suit la langue choisie, y compris les modules hors composants (`tr`, `trp`) et les messages d’erreur du serveur, rattachés à leur traduction par `lib/srvMessages.ts`. Les métadonnées statiques de `index.html` (aperçu de partage) restent en français.

Traduit à ce jour : accueil, menu « Jouer en solo », Le Tableau et Tableau 5 cartes. Restent en français pour l'instant : tables de poker, Blackjack, comptes, mémo des règles (descriptions des variantes), paramètres.

## Sons et animations

Les sons sont synthétisés (Web Audio, aucun fichier) : distribution (souffle de papier puis appui feutré), pose d'une carte (tapotement doux et petite note claire), chaque son étant légèrement varié pour ne jamais se répéter à l'identique ; fanfare de victoire en fin de partie. Les cartes se posent en ressort et glissent quand la main change. Le vainqueur est mis en scène (trophée, rayons de lumière, étincelles, lueur sur le titre, halo sur les colonnes et mains gagnantes). Tout respecte le réglage « Sons » et `prefers-reduced-motion`.

## Sécurité

Un audit de sécurité a été mené sur le serveur et l'interface ; ses correctifs techniques sont en place.

- **Adresse IP réelle** : derrière le répartiteur de Render, toutes les requêtes semblaient venir de la même adresse, donc les limites de débit étaient communes à tous les joueurs. `TRUST_PROXY` (nombre de relais de confiance, 1 par défaut sur Render, 0 ailleurs) corrige cela pour l'API comme pour le temps réel. Pour vérifier sur Render : poser `DEBUG_IP=1`, ouvrir `/_ip` (l'adresse affichée doit être la vôtre, pas celle d'un relais), puis retirer la variable. Si Render ajoute un relais supplémentaire (ce que `/_ip` montrerait), passer `TRUST_PROXY` à 2.
- **En-têtes** : Content-Security-Policy stricte (scripts du site uniquement, aucun cadre, aucun objet), HSTS, `nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy, COOP.
- **Limitation de débit** : tables purgées automatiquement et plafonnées en nombre de clés ; ajout d'une limite par compte visé (10 échecs en 15 minutes) en plus de la limite par adresse ; plafond de 60 connexions temps réel par adresse (`maxSocketsPerIp`) et de 1000 tables simultanées (`maxRooms`).
- **Mots de passe** : scrypt relevé à N = 65536 (OWASP). Les anciennes empreintes restent valides et sont remplacées à la prochaine connexion. Le nombre de calculs simultanés est limité à 2 (mémoire). Les mots de passe triviaux (listes de choix courants, caractères répétés) sont refusés.
- **Données personnelles** : « Mes données » dans l'espace joueur permet de télécharger une copie complète du compte (`GET /me/export`) et de le supprimer définitivement après confirmation par mot de passe (`DELETE /me`).
- **E-mails** : plafond global de 120 envois par heure (`MAIL_MAX_PER_HOUR`), adresses masquées dans les journaux.

Reste à traiter hors code : disque persistant ou VPS (le disque gratuit de Render est effacé à chaque redémarrage) et, si l'application s'ouvre au public, confirmation de l'adresse e-mail à l'inscription et mentions légales / politique de confidentialité.

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
  limités à 10 ko ; limitation de débit par IP (création/arrivée) et par connexion ; pseudo restreint. Avatar : préréglage, visage composé (simple code de neuf caractères, dessiné par chaque navigateur) ou photo de profil réservée aux comptes. La photo est recadrée et réduite dans le navigateur (JPEG de 128 pixels), puis le serveur contrôle signature, poids (48 Ko) et dimensions avant de la servir par une adresse non devinable ; elle est supprimée avec le compte.

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
| Blackjack | moteur : 46 tests (SHA-256 contre `node:crypto`, composition et uniformité du sabot, totaux, Blackjack, séparation, doublement, abandon, rejeu, 2 000 manches simulées) ; serveur : 19 tests (manches, reprise, équité, jetons, niveaux, défis, objectifs, classement, accès réservé) ; web : 20 tests dont des parcours complets sur vrai serveur ; tables à plusieurs : 10 tests moteur (dont 2 000 tables simulées) et 12 tests serveur |
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

**Points et jetons.** Une manche gagnée vaut 1 point dans toutes les variantes, sauf le capot du 6-3 : gagner seul les 3 lignes vaut 2 points (une ligne partagée ne compte pas). Chaque compte dispose d'un portefeuille persistant : 5 000 jetons à l'inscription, débité/crédité du net de chaque partie ; sous 1 000 jetons, une recharge à 2 000 est accordée après 2 h sans partie (appliquée à la lecture, `GET /me/wallet`). Une table dont la mise dépasse le solde est refusée à la création et à l'arrivée ; les invités et l'entraînement ne sont pas concernés.
