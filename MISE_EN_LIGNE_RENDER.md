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
