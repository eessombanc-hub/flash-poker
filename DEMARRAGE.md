# Flash Poker — guide de démarrage

Temps estimé : **10 minutes** la première fois (dont 2 minutes d'installation), puis 10 secondes.

## 1. Ce qu'il faut installer (une seule fois)

**Node.js, version 22.13 ou plus récente** (choisir la version « LTS ») : <https://nodejs.org>

Vérification : ouvrir un terminal (voir étape 3) et taper `node -v`. Il doit afficher `v22.13` ou plus (une version 20 ne suffit plus : la sauvegarde des parties utilise un module apparu dans Node 22). Si une version plus ancienne est déjà installée, réinstallez simplement la dernière version LTS depuis le lien ci-dessus — l'installateur remplace l'ancienne version.

## 2. Décompresser l'archive

Décompressez `flash-poker.zip` où vous voulez (Bureau, Documents…). Vous obtenez un dossier `flash-poker`.

## 3. Ouvrir un terminal dans ce dossier

- **Windows** : ouvrez le dossier `flash-poker` dans l'Explorateur, cliquez dans la barre d'adresse, tapez `cmd`, puis Entrée.
- **Mac** : ouvrez l'application *Terminal*, tapez `cd ` (avec un espace), glissez le dossier `flash-poker` dans la fenêtre, puis Entrée.

## 4. Installer (une seule fois)

```
npm install
```

Durée : 1 à 2 minutes. Des avertissements jaunes (« deprecated ») sont normaux. Attendez le retour de l'invite de commande.

## 5. Lancer

Pour un premier essai **seul** (minuteurs de 3 minutes au lieu de 60 secondes, afin d'avoir le temps de jouer avec plusieurs fenêtres) :

```
npm run dev:calme
```

Pour jouer **avec les vrais minuteurs de 60 secondes** :

```
npm run dev
```

Attendez le message **« ✔ Prêt. Ouvrez : http://localhost:5173 »**, puis ouvrez cette adresse dans votre navigateur.
Pour arrêter : **Ctrl + C** dans le terminal.

## 6. Jouer seul avec plusieurs joueurs

Une partie se joue à 2 joueurs minimum. Le jeton de session est conservé dans le navigateur ; **deux onglets normaux du même navigateur partagent donc le même joueur**. Utilisez des **fenêtres de navigation privée** (une par joueur) :

- Chrome / Edge : `Ctrl + Maj + N` (Mac : `Cmd + Maj + N`)
- Firefox : `Ctrl + Maj + P` — Safari : `Cmd + Maj + N`

Parcours conseillé :

1. **Fenêtre 1** : « Créer une partie » (nom, nombre de joueurs, objectif en points, mise, pseudo). Le code `POKER-XXXX` s'affiche.
2. **Fenêtres 2 et 3** (privées) : ouvrez `http://localhost:5173`, « Rejoindre une partie », collez le code, choisissez un pseudo. (Ou utilisez « Copier le lien d'invitation ».)
3. **Fenêtre 1** : « Démarrer la partie ». Les positions sont tirées au sort.
4. Le joueur dont c'est le tour choisit la variante. Jouez la manche dans chaque fenêtre.

À essayer en priorité :

- **6-3** : désignez 2 cartes par ligne — l'écran ne vous donne aucune aide, c'est voulu.
- **6-1** : le joueur désigné retourne une carte ; observez le classement et « À toi de révéler ».
- **Aviation / Avia 6** : défausse exacte ; laissez le minuteur expirer pour voir la main se coucher.
- **Morpion** : désignez 2 cartes et un alignement (ligne, colonne, diagonale) dans la grille — là non plus, aucune aide.
- **Le 10** : comme le 6-1, mais sans plateau commun et sur 10 cartes ; jouable de 2 à 5 joueurs.
- **Fermé 2 changes** et **Le 10** sont grisés à 6 joueurs (jouables de 2 à 5).
- **Rechargez la page** en pleine manche (F5) : vous retrouvez votre siège, votre main et le minuteur.
- Menu **Options** : cartes en quatre couleurs. Menu **Scores** : historique et évolution.
- **Assistance** : à la création, choisissez « Sans assistance » (défaut) ou « Avec assistance ». Dans le second cas, chaque joueur doit l'approuver dans la salle d'attente ; sans l'accord de tous (un silence compte comme un refus), la partie se joue sans assistance. Elle affiche seulement le nom de votre combinaison, jamais de conseil. Pour l'essayer seul : deux fenêtres (une normale, une privée), l'invité clique « J'approuve l'assistance ».
- **Assurance** : proposable seulement à partir de 4 joueurs à table, quand deux d'entre eux sont à 1 point de la victoire. Un refus (ou une absence de réponse en 60 s) bloque définitivement CE duo, mais chacun peut encore la proposer à un autre joueur éligible.

## 7. Jouer à plusieurs appareils (même Wi-Fi)

Au lancement, le terminal affiche une adresse du type `http://192.168.x.x:5173`. Les autres appareils (téléphone, tablette, autre ordinateur) l'ouvrent dans leur navigateur. Si rien ne s'affiche, le pare-feu de l'ordinateur bloque sans doute le port 5173 : autorisez « Node.js » quand Windows / macOS le propose.

## 8. En cas de problème

| Symptôme | Solution |
|---|---|
| `node` ou `npm` « n'est pas reconnu » | Node.js n'est pas installé, ou le terminal a été ouvert avant l'installation : le fermer et en rouvrir un. |
| Windows PowerShell : « l'exécution de scripts est désactivée » | Utiliser `cmd` (étape 3), ou lancer une fois : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| « address already in use » / port 3000 ou 5173 occupé | Une autre application (ou un ancien lancement) utilise ce port. Fermez-la, ou redémarrez l'ordinateur. |
| Page blanche ou « Connexion à la table… » qui dure | Vérifiez que le terminal affiche toujours « Prêt » (il ne doit pas être fermé). Rechargez la page. |
| « Votre session n'est plus valide » | Les parties sont désormais sauvegardées sur disque et survivent à un redémarrage du serveur ; ce message ne devrait plus apparaître dans ce cas. S'il apparaît malgré tout, recréez une partie. |
| Deux fenêtres montrent le même joueur | Vous utilisez des fenêtres normales du même navigateur : passez en navigation privée (étape 6). |

## 9. Vérifier que tout est en ordre (facultatif)

```
npm test
```

Environ 1 minute (hors tests de simulation, plus longs : voir `npm -w @poker/engine run test` pour les lancer isolément si besoin). Doit afficher plusieurs centaines de tests réussis, zéro échec.

## À savoir

- La **cagnotte est virtuelle** : aucun paiement réel.
- Les parties sont **sauvegardées sur disque** (dans un dossier `data/` créé automatiquement au premier lancement, à côté du dossier `packages/`) : elles survivent à un rechargement de page, une reconnexion, **et désormais à un arrêt ou un redémarrage du serveur**. Ne supprimez pas ce dossier `data/` si vous voulez conserver les parties en cours. Pour un essai jetable sans aucune sauvegarde (par exemple pour repartir d'un état vierge à chaque lancement), démarrez avec `STORE=memory npm run dev`.
- `npm run dev:calme` n'est **pas** une option proposée aux joueurs : c'est un mode d'essai. La règle reste 60 secondes.
