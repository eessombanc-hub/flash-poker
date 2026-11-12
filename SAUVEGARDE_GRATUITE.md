# Sauvegarde gratuite des comptes (GitHub privé, chiffrée)

Sur le plan gratuit de Render, le disque est effacé à chaque redéploiement et à chaque réveil : sans sauvegarde, les comptes, l'historique, les séries et les trophées disparaissent. Flash Poker dépose donc un instantané chiffré de sa base de comptes dans un dépôt GitHub privé, et le relit au démarrage quand le disque est vide. Aucun coût, aucune carte bancaire.

## Mise en place (10 minutes, une seule fois)

1. **Créer le dépôt de stockage.** Sur GitHub : Nouveau dépôt, nom `flash-poker-data`, visibilité **Privé**. Cochez « Add a README file » : le dépôt doit contenir au moins un commit.
2. **Créer un jeton limité à ce dépôt.** GitHub, Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, Generate new token.
   - Repository access : *Only select repositories*, puis `flash-poker-data` uniquement.
   - Permissions, Repository permissions : **Contents : Read and write**. Rien d'autre.
   - Expiration : choisissez la plus longue proposée et notez la date dans votre agenda (voir plus bas).
   - Copiez le jeton (il commence par `github_pat_`), il ne sera plus affichable.
3. **Choisir une phrase de passe.** Une phrase longue, à conserver dans votre gestionnaire de mots de passe. Elle chiffre les sauvegardes : **sans elle, les sauvegardes sont illisibles**, y compris pour nous.
4. **Renseigner Render.** Service `flash-poker`, onglet Environment, ajoutez :
   - `BACKUP_GITHUB_REPO` = `votre-compte/flash-poker-data`
   - `BACKUP_GITHUB_TOKEN` = le jeton `github_pat_…`
   - `BACKUP_PASSPHRASE` = votre phrase de passe
   Enregistrez : Render redéploie.
5. **Vérifier.** Dans les journaux (onglet Logs) vous devez lire « Sauvegarde chiffrée activée vers … » puis, après la première inscription d'un joueur, « Sauvegarde : instantané envoyé ». Dans le dépôt GitHub, le fichier `comptes.db.enc` apparaît.

## Comment ça fonctionne

- Au démarrage : si le fichier de comptes est absent, il est téléchargé, déchiffré et restauré avant toute requête.
- En fonctionnement : toutes les 60 secondes, un instantané cohérent est pris ; il n'est envoyé que s'il a changé.
- À l'arrêt (redéploiement, mise en veille) : un dernier envoi est tenté.
- Au pire (arrêt brutal), les modifications des dernières 60 secondes peuvent être perdues.
- Sûreté : si GitHub est injoignable au démarrage, ou si la phrase de passe ne correspond pas, **aucun envoi n'a lieu** : une base vide n'écrase jamais une bonne sauvegarde. Le journal l'indique par un message commençant par « ⚠ Sauvegarde ».

## Entretien

- **Jeton expiré** : les envois échouent (message « ⚠ Sauvegarde : envoi échoué » dans les journaux) mais le jeu continue. Créez un nouveau jeton et remplacez `BACKUP_GITHUB_TOKEN`.
- **Changer de phrase de passe** : à éviter. Les sauvegardes existantes ne seraient plus lisibles. Si nécessaire, supprimez d'abord `comptes.db.enc` dans le dépôt (les comptes actuels seront alors sauvegardés à neuf au prochain envoi, tant que le serveur tourne).
- **Historique du dépôt** : chaque envoi crée un commit. Le dépôt grossit lentement ; pour l'alléger, supprimez et recréez le dépôt de temps en temps, puis redémarrez le service.
- **Réveil du serveur** : pour éviter les 30 à 60 secondes de réveil, un ping gratuit (UptimeRobot, intervalle 5 minutes) sur `https://flash-poker-a9o3.onrender.com/health` suffit le plus souvent.

## Variables facultatives

`BACKUP_BRANCH` (branche du dépôt, par défaut celle par défaut), `BACKUP_PATH` (nom du fichier, `comptes.db.enc`), `BACKUP_INTERVAL_SECONDS` (60 par défaut, entre 15 et 3600).
