# Tester la restauration d'une sauvegarde

Objectif : vérifier, sur votre poste et sans toucher au site en ligne, que la sauvegarde chiffrée des comptes est lisible.
À faire une fois maintenant, puis après chaque changement de la phrase de passe ou de l'hébergement.

1. Dans le dépôt GitHub privé de sauvegarde, ouvrez `comptes.db.enc`, puis « Download raw file » (ou le bouton de téléchargement).
2. Dans PowerShell, depuis `C:\Users\User\Desktop\flash-poker` :

       npm run restaurer -w packages/server -- C:\Users\User\Downloads\comptes.db.enc

3. Saisissez la phrase de passe de sauvegarde quand elle est demandée (la saisie est masquée).

Le contrôle affiche la taille, l'intégrité SQLite, le nombre de lignes par table, la date du compte et de la partie les plus récents. Il ne lit ni n'affiche aucun mot de passe, e-mail ou pseudonyme. Rien n'est écrit sur le disque, hors un fichier temporaire effacé aussitôt.

Lecture du résultat :
- « RÉSULTAT : la sauvegarde est lisible et cohérente » : la phrase de passe est bonne et la base s'ouvre avec le code actuel.
- Comparez `users` au nombre de comptes que vous attendez, et la date du compte le plus récent à celle de votre dernière inscription.
- « phrase de passe incorrecte » : la phrase saisie n'est pas celle de Render (variable BACKUP_PASSPHRASE). Retrouvez-la avant tout incident : sans elle, la sauvegarde est perdue.
