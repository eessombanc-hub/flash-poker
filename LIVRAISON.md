# Flash Poker — dossier de livraison, phase 9 : comptes joueurs

## Ce qui a été ajouté

- **Comptes** : inscription par pseudo, adresse e-mail et mot de passe ; connexion par pseudo ou par e-mail. Le pseudo d’un inscrit lui est réservé : un invité ne peut pas jouer sous ce nom. Les invités peuvent toujours jouer sans compte.
- **Mot de passe oublié** : lien par e-mail, valable une heure, à usage unique. Une fois utilisé, toutes les sessions ouvertes sont fermées. La réponse ne révèle jamais si une adresse correspond à un compte.
- **Mon espace**, en six onglets :
  - **Profil** : avatar, pseudo, adresse e-mail, mot de passe, alertes par e-mail.
  - **Historique** : parties terminées. Chaque partie s’ouvre sur le résultat de chacune de ses manches.
  - **Statistiques par variante** : manches jouées et gagnées, taux de réussite, points.
  - **Manches favorites** : à marquer d’une étoile depuis l’historique.
  - **Bankroll** : bilan gains − mises, partie après partie, assurances comprises, avec sa courbe.
  - **Joueurs favoris** : recherche par pseudo et statut en ligne.
- **Favori connecté** : quand vous êtes sur Flash Poker, une notification s’affiche dans l’application. Sinon, un e-mail part, au plus un par jour et par favori, si les alertes sont activées.
- **Inviter des amis** (onglet de Mon espace) :
  - un lien personnel, à copier ou à partager (SMS, WhatsApp…), qui ouvre directement l’inscription avec le nom de l’invitant ;
  - ou un e-mail envoyé par Flash Poker, au nom du joueur, sans texte libre ; au plus 10 par jour, et pas deux fois la même adresse en 7 jours.
  - Le suivi indique pour chaque invitation « En attente » ou « Inscrit », ainsi que les amis inscrits. À l’inscription, l’invité et l’invitant deviennent joueurs favoris l’un de l’autre.
- **Parties** : un joueur connecté crée une salle ou la rejoint sous le pseudo et l’avatar de son compte. Les parties terminées s’ajoutent à son historique ; les parties annulées n’y figurent pas.

## Sécurité

- Les mots de passe sont conservés uniquement sous forme d’empreinte scrypt avec un sel propre à chaque compte, jamais en clair.
- Pour les sessions et les liens de réinitialisation, seule l’empreinte SHA-256 est conservée. Une session dure 30 jours.
- Les tentatives d’inscription, de connexion et de récupération sont limitées par adresse IP.
- Les identifiants d’envoi d’e-mails se règlent uniquement par variables d’environnement, jamais dans le code (voir `MISE_EN_LIGNE_RENDER.md`).
- Seules les parties terminées sont archivées : aucune carte d’une partie en cours n’est enregistrée.

## Tests

- Serveur :
  - 14 nouveaux tests : comptes, sessions, mot de passe oublié, archivage, statistiques, bankroll, favoris, e-mail une fois par jour, routes HTTP, limite de tentatives, socket de présence.
  - Total : 112 tests.
- Interface :
  - 3 nouveaux tests, sur un vrai serveur : inscription puis partie sous le pseudo du compte, favori annoncé, espace joueur complet après une vraie partie.
  - Total : 182 tests.
- Bout en bout (`e2e/comptes.spec.ts`) : inscription sur ordinateur et sur iPhone, les six onglets, l’ajout d’un favori, la notification en direct et le refus du pseudo réservé. Chaque écran passe l’audit d’accessibilité sans défaut grave.

## Ce qui dépend de vous

1. **Choisir un service d’envoi d’e-mails** et saisir ses cinq réglages dans Render (marche à suivre dans `MISE_EN_LIGNE_RENDER.md`). D’ici là, tout fonctionne, sauf l’envoi d’e-mails.
2. **VPS OVH** : sur Render gratuit, comptes et historiques sont effacés à chaque mise à jour du jeu. Le VPS résoudra ce point.

---

# Phase 8 (rappel) : tests de bout en bout, charge, accessibilité

Date : 6 novembre 2026. Objet : tests de bout en bout, charge, accessibilité, préparation de l'espace de test.
**Aucune règle de jeu n'a été modifiée.** Les seules modifications du code touchent la disposition de la table
sur ordinateur et l'accessibilité des cartes.

## Résultat en bref

| Contrôle | Résultat |
|---|---|
| Tests existants (moteur, serveur, interface) | **512 / 512** réussis, aucune erreur de types |
| Parties de bout en bout, vrais navigateurs | **15 / 15** réussies |
| Charge : 250 tables × 6 joueurs (1 500 connexions) | 250 parties terminées, **0 erreur**, réponse p99 **16 ms** |
| Accessibilité (WCAG 2.1 A et AA, axe-core) | **0 défaut** après correction (2 défauts graves corrigés) |
| Déploiement façon Render (copie neuve) | installation, compilation, démarrage et partie : **conformes** |

## 1. Parties de bout en bout (`npm run test:e2e`)

Vrai serveur en mode production (interface servie par le serveur, comme sur Render), joueurs dans des
navigateurs séparés, ordinateur et téléphones simulés (iPhone 13, Pixel 7).

- Partie complète à deux, ordinateur et téléphone, de la création à l'écran de victoire.
- Table de trois : **rechargement de page en pleine manche**, avec la même main retrouvée.
- Manche sans action : clôture automatique à l'échéance du minuteur (15 s en test, 60 s en vrai).
- Code de partie inconnu : message clair, sans plantage.
- Retrait d'un joueur par l'hôte en salle d'attente.
- **Les 8 variantes** : écran de jeu affiché sans erreur chez les deux joueurs, et vérification
  géométrique qu'aucun siège ne recouvre une carte du tapis.
- **Six joueurs sur ordinateur** : sièges lisibles, tapis dégagé.

## 2. Défaut trouvé et corrigé : sièges sur les cartes (ordinateur)

Sur ordinateur, les sièges étaient placés autour de l'ovale. À deux joueurs, le siège de l'adversaire masquait
la **rangée du haut de la grille du Morpion** et la **ligne 1 du 6-3** (celle que l'on joue en premier), et le
vôtre masquait la rangée du bas. Au Morpion, où il faut voir les neuf cartes, c'était bloquant.

Correction : sur ordinateur, les sièges sont alignés **en une rangée au-dessus du tapis** (vous d'abord, puis
les autres dans l'ordre des positions), dans leur forme compacte, comme sur téléphone. Les cartes retournées des
adversaires (6-1, Le 10) restent affichées sur leur siège. Le tapis ne contient plus que les cartes communes.
Téléphone : inchangé.

> **À valider par vous** (choix d'ergonomie) : cette disposition en rangée. Le nombre de cartes cachées
> d'un adversaire n'apparaît plus en dos de cartes sur ordinateur, comme c'était déjà le cas sur téléphone.

## 3. Charge (`npm -w @poker/server run charge`)

Le vrai serveur (Fastify, Socket.IO, sauvegarde SQLite sur disque) et des robots connectés en temps réel,
qui jouent le poker fermé en gardant leur main (le moteur arbitre normalement).

| Scénario | Parties | Manches | Commandes | Réponse p50 / p95 / p99 / max | Mémoire | Erreurs |
|---|---|---|---|---|---|---|
| 50 tables × 4 | 50 / 50 | 297 | 1 482 | 3,9 / 8,8 / 11,5 / 13,4 ms | 152 Mo | 0 |
| 250 tables × 6 | 250 / 250 | 3 929 | 27 498 | 7,3 / 12,3 / 15,7 / 73,8 ms | 197 Mo | 0 |

Ces mesures ont été faites sur une machine de développement, robots compris. Le plan gratuit de Render est
nettement moins puissant (fraction de processeur, 512 Mo). L'ordre de grandeur reste largement suffisant pour
quelques tables simultanées ; pour un public ouvert, il faudra refaire la mesure sur le serveur définitif.

## 4. Accessibilité (`e2e/accessibilite.spec.ts`)

Audit automatique axe-core (WCAG 2.1 niveaux A et AA) de l'accueil, des formulaires, de la salle d'attente, de
la table (choix de la variante, Morpion), du mémo des règles, sur ordinateur et téléphone.

Défauts graves trouvés, puis corrigés :
1. **Zone d'action non atteignable au clavier** quand elle défile sans bouton : elle est désormais focalisable
   et nommée « Actions de jeu ».
2. **Nom des cartes cliquables** différent du texte dessiné (« Roi de carreau » contre « K »), ce qui gêne la
   commande vocale. Le nom est désormais porté par un texte réservé aux lecteurs d'écran, le dessin est
   décoratif, et les figures indiquent leur lettre : « Roi de carreau (K) ».

Après correction : **0 défaut**, tous niveaux confondus. Un audit automatique ne remplace pas un essai avec un
vrai lecteur d'écran (NVDA sous Windows, VoiceOver sur iPhone) : c'est le point ouvert ci-dessous.

## 5. Fichiers ajoutés ou modifiés

- `e2e/` : parties de bout en bout, variantes, accessibilité ; `playwright.config.ts`.
- `packages/server/charge/charge.ts` : test de charge.
- `packages/web/src/screens/Table.tsx` : disposition des sièges sur ordinateur, zone d'action accessible.
- `packages/web/src/components/Card.tsx` : nom des cartes pour les lecteurs d'écran.
- Tests unitaires ajustés en conséquence (`lib.test.ts`, `panels.test.tsx`, `screens.test.tsx`).
- `package.json` : script `test:e2e`, dépendances de test `@playwright/test` et `@axe-core/playwright`
  (outils de test uniquement, rien de plus n'est envoyé aux joueurs).
- `README.md`, `MISE_EN_LIGNE_RENDER.md`, `LIVRAISON.md`.

## 6. Ce qui reste, et qui dépend de vous

1. **Mettre en ligne** : suivre [MISE_EN_LIGNE_RENDER.md](MISE_EN_LIGNE_RENDER.md) (15 minutes), après envoi de
   cette version sur GitHub.
2. **Partie d'essai sur téléphone**, en 4G, avec un ou deux amis.
3. **Valider les choix d'ergonomie** listés dans le README, dont la nouvelle disposition des sièges.
4. Plus tard : essai avec un lecteur d'écran réel, Safari et Firefox réels, puis le VPS OVH pour la production.
