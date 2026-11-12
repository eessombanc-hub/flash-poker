# Mettre Flash Poker en ligne sur Render (espace de test)

Temps estimé : **15 minutes**, dont 5 d'attente. Aucune ligne de commande.

Le fichier `render.yaml` du projet décrit déjà tout : un seul service sert l'interface, le temps réel et les
parties. Il a été vérifié sur une copie neuve du projet, avec exactement les commandes que Render exécute
(installation, compilation, démarrage, partie créée et rejointe).

## Avant de commencer

Render installe le projet **depuis GitHub** (dépôt `eessombanc-hub/flash-poker`). Le dépôt doit donc contenir
la dernière version, avec les corrections de la phase 8. Vérifiez sur la page du dépôt que le fichier
`MISE_EN_LIGNE_RENDER.md` y figure. Sinon, la version publiée serait l'ancienne.

## Étapes

1. **Créer le compte.** Sur <https://render.com>, choisissez « Sign up », puis **« GitHub »** : le compte Render
   est relié à votre compte GitHub, ce qui évite une étape plus loin.
2. **Créer le service à partir du fichier.** Dans le tableau de bord : **New +** → **Blueprint**.
3. **Choisir le dépôt.** Autorisez Render à lire le dépôt `flash-poker` (vous pouvez limiter l'accès à ce seul
   dépôt), puis sélectionnez-le.
4. **Valider.** Render affiche le service décrit par `render.yaml` : `flash-poker`, plan **Free**, région
   **Frankfurt**. Confirmez (bouton du type « Apply » ou « Deploy Blueprint »).
5. **Patienter 3 à 5 minutes.** Le journal défile ; le déploiement est terminé quand le statut passe à
   **Live**. L'adresse du jeu s'affiche en haut de la page, sous la forme `https://flash-poker-xxxx.onrender.com`.
6. **Vérifier.** Ouvrez cette adresse suivie de `/health` : la page doit afficher `{"ok":true}`. Ouvrez ensuite
   l'adresse seule : l'accueil de Flash Poker apparaît.

## Premier essai (10 minutes)

- Sur l'ordinateur : **Créer une partie**, 2 ou 3 joueurs.
- Sur votre téléphone, **en 4G et non en Wi-Fi** pour tester un vrai accès à distance : ouvrez l'adresse,
  **Rejoindre une partie**, saisissez le code.
- Jouez deux ou trois manches, dont un **Morpion** et un **6-3**, puis rechargez la page du téléphone en pleine
  manche : vous devez retrouver votre main.
- Notez ce qui vous gêne. Les choix d'ergonomie listés dans le README sont précisément ceux à valider ici.

## Limites du plan gratuit (normales, déjà prévues)

- **Mise en veille après 15 minutes sans visite** : la première ouverture suivante prend 30 à 60 secondes.
- **Disque effacé** à chaque redéploiement, redémarrage ou mise en veille : les parties en cours sont perdues.
  C'est acceptable pour un essai, pas pour de vraies soirées. Pour celles-ci, la cible reste le VPS OVH, avec
  un disque qui conserve les parties.
- **Puissance réduite** : largement suffisante pour quelques tables entre amis, pas pour un public ouvert.

## Activer les e-mails des comptes joueurs

La récupération du mot de passe fonctionne ainsi : le joueur saisit son adresse, reçoit un lien valable une heure et à usage unique, puis choisit un nouveau mot de passe. Toutes ses sessions ouvertes sont alors fermées. Sans service d’envoi, le lien « Mot de passe oublié ? » est remplacé par un message d’indisponibilité, et les favoris ne sont signalés que dans l’application.

**Sur le plan gratuit de Render, l’envoi classique (SMTP) est bloqué** : Render interdit les ports 25, 465 et 587 aux services gratuits. Le jeu envoie donc ses e-mails par l’API HTTPS de **Brevo** (gratuit jusqu’à 300 e-mails par jour), qui n’est pas concernée.

1. Créez un compte sur brevo.com.
2. Dans Brevo, ouvrez **Domaines et expéditeurs**, puis **Domaines**, et ajoutez `flash-poker.fr`. Brevo affiche les enregistrements DNS à créer (code d’authentification, clés DKIM, DMARC).
3. Dans OVH, **Web Cloud**, **Noms de domaine**, `flash-poker.fr`, onglet **Zone DNS**, créez chacun de ces enregistrements avec le type, le nom et la valeur indiqués par Brevo. Ne touchez pas aux entrées de messagerie existantes. Dans Brevo, cliquez sur **Authentifier** : le domaine passe à « vérifié » après quelques minutes.
4. Dans Brevo, **SMTP et API**, onglet **Clés API**, créez une clé (il s’agit bien d’une clé d’API, pas d’une clé SMTP) et copiez-la.
5. Dans Render, service **flash-poker**, onglet **Environment**, ajoutez ces trois variables, puis enregistrez (le service redémarre) :

| Variable | Valeur | Rôle |
|---|---|---|
| `BREVO_API_KEY` | la clé copiée à l’étape 4 | Envoi, à ne communiquer à personne |
| `MAIL_FROM` | `Flash Poker <no-reply@flash-poker.fr>` | Expéditeur, sur le domaine vérifié à l’étape 3 |
| `APP_URL` | `https://flash-poker.fr` | Adresse placée dans les liens des e-mails |

6. Au démarrage, le journal Render affiche « E-mails activés (Brevo) ». Sur le site, le lien « Mot de passe oublié ? » apparaît sur l’écran de connexion. Faites un essai avec votre propre adresse, et regardez les courriers indésirables.

Les services Resend (`RESEND_API_KEY`) et SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) restent pris en charge, mais le SMTP ne fonctionne que sur un hébergement qui ne bloque pas ses ports (plan payant de Render, VPS).

**Rappel important** : sur le plan gratuit, le disque est effacé à chaque mise à jour. Les comptes, l’historique et les favoris disparaissent donc à chaque redéploiement, jusqu’à l’ajout d’un stockage durable. Un joueur qui a perdu son compte ne peut pas le récupérer par e-mail, puisqu’il n’existe plus.

## Garder les comptes malgré le disque éphémère

Voir `SAUVEGARDE_GRATUITE.md` : sauvegarde chiffrée dans un dépôt GitHub privé, gratuite, à configurer une fois.

## Mises à jour

À chaque nouvelle version envoyée sur GitHub (branche `main`), Render redéploie automatiquement
(`autoDeployTrigger: commit`). Rien d'autre à faire.

## En cas de problème

| Symptôme | Cause probable et solution |
|---|---|
| Statut « Build failed » | Ouvrez le journal ; copiez les dernières lignes rouges et transmettez-les (à Jarvis ou à Claude). |
| La page met une minute à s'ouvrir | Réveil après la mise en veille du plan gratuit : normal. |
| « Connexion à la table… » qui dure | Rechargez ; si cela persiste, vérifiez que le statut du service est « Live ». |
| Le nom `flash-poker` est déjà pris | Render ajoute un suffixe à l'adresse : sans conséquence. |
