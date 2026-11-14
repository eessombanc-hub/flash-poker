/**
 * Foire aux questions de Flash Poker. Texte en français (comme les pages légales) ; chaque réponse est une suite de
 * paragraphes. Les chiffres reprennent ceux du jeu (barème d'expérience, grades, recharges) : à mettre à jour avec lui.
 */
export interface FaqItem {
  q: string;
  a: readonly string[];
}
export interface FaqSection {
  id: string;
  title: string;
  items: readonly FaqItem[];
}

export const FAQ_HASH = '#faq';

export const FAQ: readonly FaqSection[] = [
  {
    id: 'demarrer',
    title: 'Bien démarrer',
    items: [
      {
        q: 'Qu’est-ce que Flash Poker ?',
        a: ['Une application de jeux de cartes en temps réel, qui se joue dans le navigateur, sur ordinateur comme sur téléphone. Elle réunit huit variantes de poker entre amis (de 2 à 6 joueurs), un Blackjack avec ses tables et un jeu de cartes en cinq colonnes, le Tableau.'],
      },
      {
        q: 'Joue-t-on de l’argent réel ?',
        a: ['Non. Les jetons sont virtuels, sans valeur monétaire, et ne peuvent ni s’acheter, ni se vendre, ni se convertir. Ils servent uniquement à miser dans le jeu.'],
      },
      {
        q: 'Faut-il un compte pour jouer ?',
        a: [
          'Non, vous pouvez jouer sans compte. Votre progression reste alors dans le navigateur de votre appareil.',
          'Un compte, gratuit, permet de conserver votre progression d’un appareil à l’autre, de gagner de l’expérience, de figurer dans les classements, de débloquer des récompenses et de retrouver l’historique de vos parties.',
        ],
      },
      {
        q: 'Comment lancer une partie avec des amis ?',
        a: ['Depuis l’accueil, ouvrez une table : choisissez la variante, le nombre de joueurs et l’objectif de points. Un code de partie est alors généré. Partagez-le (ou le lien) à vos amis, qui le saisissent dans « Rejoindre » pour vous retrouver à la table.'],
      },
      {
        q: 'Comment rejoindre une partie ?',
        a: ['Saisissez le code reçu dans « Rejoindre », ou ouvrez le lien partagé. Vous pouvez aussi choisir une table dans la liste des parties ouvertes, que son créateur a rendue publique.'],
      },
      {
        q: 'Qu’est-ce qu’une partie ouverte ?',
        a: ['Une table dont le créateur a choisi d’afficher la présence dans la liste publique. N’importe quel joueur peut alors la rejoindre tant qu’il reste des places, sans connaître le code.'],
      },
      {
        q: 'Puis-je jouer seul ?',
        a: ['Oui. « Jouer en solo » vous oppose à l’ordinateur, pour découvrir les variantes sans pression. Le Blackjack et le Tableau se jouent également contre l’ordinateur.'],
      },
      {
        q: 'Peut-on suivre une partie sans y jouer ?',
        a: ['Oui, en spectateur. Avec le code d’une partie, choisissez « Regarder » : vous suivez la table sans voir les cartes privées des joueurs.'],
      },
      {
        q: 'Peut-on jouer à plusieurs tables à la fois ?',
        a: ['Oui, jusqu’à quatre tables simultanées. Vous passez de l’une à l’autre sans quitter les autres. Pensez simplement aux minuteurs, qui continuent de courir sur chacune d’elles.', 'Sur un écran assez large, le bouton « Mosaïque » du bandeau « Mes tables » affiche vos tables côte à côte (poker, blackjack et Tableau mélangés) pour jouer sur toutes en même temps. « Agrandir » ouvre l’une d’elles en plein écran. Sous 900 pixels de large, la mosaïque n’est pas proposée.'],
      },
    ],
  },
  {
    id: 'regles',
    title: 'Règles du poker',
    items: [
      {
        q: 'Quelles sont les variantes proposées ?',
        a: [
          '6-3 : Omaha en trois lignes. Six cartes privées, flop et turn ouverts, puis trois rivers dévoilées ligne après ligne ; à chaque ligne, vous désignez deux cartes.',
          '6-1 : Omaha à révélations. Cinq cartes cachées et une visible, plateau de cinq cartes ouvert ; le joueur à la main visible la plus faible retourne une carte, jusqu’à l’abattage.',
          'Poker fermé : cinq cartes privées, avec un ou deux changes simultanés et secrets de 0 à 3 cartes, puis abattage.',
          'Aviation : Hold’em à quatre cartes. Après le flop puis après le turn, vous jetez une carte pour n’en garder que deux.',
          'Avia 6 : Hold’em à six cartes. Après le flop puis après le turn, vous jetez deux cartes pour n’en garder que deux.',
          'Morpion : quatre cartes privées et neuf cartes communes en grille 3×3. Vous désignez deux de vos cartes et un alignement (ligne, colonne ou diagonale).',
          'Le 10 : dix cartes privées, sans carte commune. Comme au 6-1, le joueur à la main visible la plus faible retourne une carte, jusqu’à l’abattage.',
        ],
      },
      {
        q: 'Combien de joueurs par table ?',
        a: ['De 2 à 6 joueurs. Le poker fermé à deux changes et Le 10 se jouent de 2 à 5 joueurs.'],
      },
      {
        q: 'Comment une partie est-elle gagnée ?',
        a: ['Chaque manche rapporte 1 point à son vainqueur, quelle que soit la variante, sauf au 6-3 où gagner seul les trois lignes vaut 2 points. La partie s’arrête quand un joueur atteint l’objectif choisi à la création de la table, de 1 à 5 points.'],
      },
      {
        q: 'Qui choisit la variante de chaque manche ?',
        a: ['Le choix tourne dans l’ordre des positions, tirées au sort au démarrage et stables pendant toute la partie. Sans choix au bout de 60 secondes, une variante disponible est tirée au hasard.'],
      },
      {
        q: 'De combien de temps dispose-t-on pour jouer ?',
        a: ['60 secondes pour chaque phase : change, défausse, désignation d’une ligne au 6-3, retournement au 6-1, réponse à une assurance. Un joueur déconnecté suit les mêmes délais. À l’échéance, la partie continue selon les règles de la variante (par exemple, une main non défaussée à temps est couchée à l’Aviation).'],
      },
      {
        q: 'Comment les mains sont-elles classées ?',
        a: ['Comme au poker classique, de la carte haute à la quinte flush royale. L’As est toujours la carte la plus forte, la roue A-2-3-4-5 est une quinte valide, et les couleurs ne départagent jamais deux mains égales.'],
      },
      {
        q: 'Que se passe-t-il en cas d’égalité ?',
        a: ['Un Hold’em de départage est joué entre les seuls ex aequo, avec deux cartes privées ouvertes et cinq cartes communes. Au 6-3, à deux ou trois joueurs, une égalité en tête ne donne aucun point.'],
      },
      {
        q: 'Que sont les tétines et les paris extérieurs du 6-3 ?',
        a: [
          'Le joueur qui choisit le 6-3 peut ajouter une ou deux tétines : des cartes communes supplémentaires, posées sur la ligne en cours, qui passent à la ligne suivante une fois celle-ci résolue. Votre main se compose de vos deux cartes désignées et d’exactement trois cartes communes, au choix parmi les cinq de la ligne et les tétines.',
          'Il peut aussi activer les paris extérieurs. Avant la distribution, chaque joueur mise un montant sur une ligne. Lorsqu’au moins deux joueurs misent le même montant sur la même ligne, le meilleur d’entre eux, sans compter les tétines, remporte la cagnotte à la fin de la ligne. En cas d’égalité, elle est partagée ; sans partenaire, la mise est rendue.',
        ],
      },
      {
        q: 'Comment fonctionne l’assurance ?',
        a: ['Entre deux manches, deux joueurs à un point de la victoire peuvent s’assurer, soit selon « le perdant ne paye pas », soit selon « 50 / 50 ». Une seule assurance est possible par partie. Elle ne change jamais le vainqueur, seulement la répartition de la cagnotte.'],
      },
      {
        q: 'Peut-on rejoindre une partie en cours ?',
        a: ['Oui, entre deux manches, à la dernière position, avec zéro point et la même mise, dans la limite des places disponibles.'],
      },
      {
        q: 'Qu’est-ce que l’assistance ?',
        a: ['Une option qui affiche le nom de votre combinaison (paire, brelan…) pendant que vous choisissez vos cartes, sans jamais suggérer de coup. Elle n’est active que si tous les joueurs l’approuvent dans la salle d’attente ; sinon la partie se joue sans assistance.'],
      },
      {
        q: 'Où voit-on la combinaison gagnante ?',
        a: ['À la fin de chaque manche, la fenêtre de résultat nomme la combinaison du vainqueur et montre ses cartes lorsqu’elles ont été abattues. Le récapitulatif des manches, en fin de partie et dans « Mon espace », la rappelle pour chaque manche.'],
      },
      {
        q: 'Où retrouver les règles pendant la partie ?',
        a: ['Le « Mémo des règles », en bas de l’accueil, résume les huit variantes et les règles communes. Les règles propres à chaque phase de jeu sont aussi rappelées à l’écran au moment de jouer.'],
      },
    ],
  },
  {
    id: 'jetons',
    title: 'Jetons et mises',
    items: [
      {
        q: 'Combien de jetons ai-je au départ ?',
        a: ['À l’inscription, votre portefeuille contient 5 000 jetons. Au début de chaque partie de poker, chaque joueur dispose de 1 000 jetons de table et mise la même somme, prélevée sur son portefeuille.'],
      },
      {
        q: 'Que se passe-t-il si je n’ai presque plus de jetons ?',
        a: ['Sous 1 000 jetons, une recharge à 2 000 jetons vous est accordée après deux heures sans partie.'],
      },
      {
        q: 'Les jetons du Blackjack sont-ils les mêmes ?',
        a: ['Non, le Blackjack a sa propre réserve : 1 000 jetons au départ, et une recharge à 500 jetons lorsqu’il ne vous en reste presque plus, après une attente de 30 minutes.'],
      },
    ],
  },
  {
    id: 'blackjack',
    title: 'Blackjack',
    items: [
      {
        q: 'Quel est le principe ?',
        a: ['Se rapprocher de 21 sans le dépasser, face au croupier. Les règles de la table (nombre de jeux, gain du Blackjack, doublement, abandon) sont indiquées sur chaque table.'],
      },
      {
        q: 'Comment choisir sa table ?',
        a: ['Chaque table a ses limites de mise et peut exiger un niveau minimum, qui progresse avec votre expérience au Blackjack. Vous pouvez aussi ouvrir une table partagée avec un code pour jouer avec des amis.'],
      },
      {
        q: 'Y a-t-il de l’aide pour progresser ?',
        a: ['Oui, trois modes pédagogiques : « Libre » (aucune aide), « Indices » (probabilités exactes de dépasser 21 et de gagner en restant) et « Coach » (le coup recommandé par la stratégie de base, avec son explication).'],
      },
      {
        q: 'Quels sont les délais ?',
        a: ['Environ 40 secondes pour miser et 30 secondes pour jouer chaque décision.'],
      },
    ],
  },
  {
    id: 'tableau',
    title: 'Le Tableau',
    items: [
      {
        q: 'Comment se joue le Tableau ?',
        a: [
          'Chaque joueur reçoit cinq cartes (une par colonne) et un paquet personnel de 21 cartes. À votre tour, la carte du dessus apparaît et vous avez 30 secondes pour la poser dans une colonne qui n’est pas pleine. Le placement est définitif, et passé le délai la carte est posée automatiquement.',
          'À la fin, les colonnes se comparent deux à deux. Trois colonnes gagnées donnent la partie ; 2–2 avec une égalité est un match nul.',
        ],
      },
      {
        q: 'Qu’est-ce que le Tableau 5 cartes ?',
        a: ['Une variante où chacun reçoit en plus cinq cartes en main. À chaque tour, vous piochez, puis vous posez soit la carte piochée, soit une carte de votre main, que la piochée remplace alors.'],
      },
      {
        q: 'La quinte flush met-elle fin à la partie ?',
        a: ['Oui. La première quinte flush complétée par l’un des joueurs, quinte flush royale comprise, lui donne la victoire immédiate.'],
      },
      {
        q: 'Que signifie la partie classée ?',
        a: ['Vous affrontez l’ordinateur et progressez de ligue en ligue (dix ligues). Chaque partie classée modifie votre score, y compris un abandon. Quitter la partie ou laisser trois tours expirer compte comme une défaite, et aucun conseil n’est donné en classé.'],
      },
    ],
  },
  {
    id: 'progression',
    title: 'Progression, saisons et classements',
    items: [
      {
        q: 'Comment gagne-t-on de l’expérience ?',
        a: [
          'Chaque partie de poker rapporte 20 points d’expérience (XP), plus 30 en cas de victoire. Le Tableau en rapporte 15, plus 25 pour une victoire ; au Blackjack, chaque main vaut 1 XP, plus 1 pour une main gagnée. Les défis du jour et les hauts faits ajoutent leurs propres points. L’expérience est commune à tous les jeux.',
        ],
      },
      {
        q: 'Quels sont les grades ?',
        a: ['Bronze (dès le départ), Argent (300 XP), Or (900 XP), Platine (2 000 XP), Diamant (4 000 XP), Maître (9 000 XP) et Légende (12 000 XP). Votre espace indique l’expérience qui vous manque pour atteindre le suivant.'],
      },
      {
        q: 'Que sont les défis du jour ?',
        a: ['Des objectifs renouvelés chaque jour à minuit (par exemple, jouer une ou plusieurs parties ou en gagner une). Chaque défi réussi rapporte des points d’expérience.'],
      },
      {
        q: 'Que sont les hauts faits ?',
        a: ['Des accomplissements à débloquer (première victoire, séries de victoires, jours consécutifs de jeu, variantes essayées…). Ils se répartissent en quatre niveaux (bronze, argent, or, platine) et rapportent d’autant plus d’expérience que leur niveau est élevé.'],
      },
      {
        q: 'Comment fonctionnent les saisons ?',
        a: ['Une saison dure un trimestre civil (heure de Paris). À chaque nouvelle saison, les points, les hauts faits de la saison et les classements repartent de zéro. Vos récompenses, elles, restent acquises. « Mes saisons » conserve votre grade final et votre expérience pour chaque saison jouée.'],
      },
      {
        q: 'Que débloquent les récompenses ?',
        a: ['Des titres, des cadres et des emblèmes, obtenus grâce à votre expérience cumulée, à vos grades et à vos hauts faits, toutes saisons confondues. Équipez-en un de chaque type depuis votre espace : ils s’affichent dans les classements et à la table de jeu.'],
      },
      {
        q: 'Comment fonctionnent les classements ?',
        a: ['Le classement de la saison range les joueurs actifs selon leur expérience. Des classements par jeu et par période sont également disponibles dans votre espace.'],
      },
      {
        q: 'Qu’est-ce qu’un club et comment en rejoindre un ?',
        a: [
          'Dans votre profil, vous pouvez indiquer le nom d’un club (facultatif). Les joueurs qui saisissent le même nom forment un club, classé sur l’expérience cumulée de ses membres durant la saison en cours. Un club apparaît dès qu’au moins deux joueurs actifs l’ont indiqué.',
          'Le nom du club s’affiche sous le pseudo de chaque joueur dans le classement. Les clubs se classent sur l’expérience de la saison, mais aussi, dans l’onglet Clubs, jeu par jeu et par période (semaine, mois, saison, total), sur les victoires cumulées de leurs membres, ou sur leur gain net au blackjack. Le classement des clubs additionne l’expérience, ce qui favorise les grands clubs ; la moyenne par membre est affichée pour nuancer. Le nom du club est public dans les classements : ne saisissez rien qui désigne une personne sans son accord.',
        ],
      },
    ],
  },
  {
    id: 'compte',
    title: 'Compte et sécurité',
    items: [
      {
        q: 'Comment créer un compte ?',
        a: ['Depuis l’accueil, choisissez « Créer un compte » et indiquez un pseudonyme, une adresse électronique et un mot de passe. À l’inscription, un code de secours vous est remis : conservez-le précieusement.'],
      },
      {
        q: 'J’ai oublié mon mot de passe. Que faire ?',
        a: ['Si l’envoi de courriels est activé, la page de connexion propose un lien de réinitialisation envoyé à votre adresse. Dans tous les cas, votre code de secours, remis à l’inscription, permet de choisir un nouveau mot de passe. Il est à usage unique : un nouveau code vous est alors remis.'],
      },
      {
        q: 'Comment changer ma photo ou mon avatar ?',
        a: ['Dans « Mon espace », rubrique profil. Vous pouvez choisir un avatar ou importer une photo, recadrée et réduite directement dans votre navigateur ; le fichier d’origine ne quitte jamais votre appareil.'],
      },
      {
        q: 'Comment inviter un proche ?',
        a: ['Depuis votre espace, vous pouvez envoyer une invitation par courriel. Ne saisissez que l’adresse de personnes qui acceptent d’être invitées.'],
      },
      {
        q: 'À quoi servent les joueurs favoris ?',
        a: ['Ajoutez un joueur à vos favoris pour être prévenu lorsqu’il se connecte. Les notifications par courriel sont facultatives et se désactivent dans votre profil.'],
      },
      {
        q: 'Comment télécharger ou supprimer mes données ?',
        a: ['Dans votre espace, rubrique profil, vous pouvez télécharger une copie de toutes vos données puis supprimer définitivement votre compte, après confirmation par votre mot de passe. La suppression efface le compte et les données qui lui sont rattachées.'],
      },
    ],
  },
  {
    id: 'discussion',
    title: 'Discussion et vie en ligne',
    items: [
      {
        q: 'Où peut-on discuter ?',
        a: ['Dans le salon de l’accueil, ouvert à tous, et dans le salon de chaque table. Pendant la partie, quelques gestes amusants peuvent aussi être envoyés aux autres joueurs.'],
      },
      {
        q: 'Les messages sont-ils conservés ?',
        a: ['Non. Ils sont tenus en mémoire pour la durée de la partie ou du salon, sans archivage dans la base des comptes. Un message contraire aux règles peut être masqué automatiquement.'],
      },
      {
        q: 'Que se passe-t-il en cas de comportement déplacé ?',
        a: ['Une équipe de modérateurs veille sur les discussions. Un message contraire aux règles peut être retiré, et son auteur réduit au silence pour une durée limitée, voire son compte suspendu en cas de manquement grave. Un lien est refusé dans le salon d’accueil, et un pseudo offensant est refusé à l’inscription. Pour signaler un comportement, utilisez « Un bug ? » en précisant le pseudo et le moment.'],
      },
      {
        q: 'Que se passe-t-il si je me déconnecte en pleine partie ?',
        a: ['Votre place est conservée et vous pouvez reprendre la partie en revenant. Les minuteurs continuent de courir : à l’échéance, la partie avance selon les règles de la variante. Sur le Tableau, trois tours consécutifs expirés valent abandon.'],
      },
    ],
  },
  {
    id: 'aide',
    title: 'Aide et vie privée',
    items: [
      {
        q: 'Le jeu est lent à s’ouvrir. Est-ce normal ?',
        a: ['Après une longue période sans visite, le serveur peut mettre quelques dizaines de secondes à se réveiller. Patientez, puis actualisez la page si rien ne s’affiche.'],
      },
      {
        q: 'J’ai rencontré un bug ou j’ai une idée. Comment la signaler ?',
        a: ['Utilisez le lien « Un bug ? » en bas de l’accueil. Choisissez la nature de votre message (bug, idée ou commentaire), décrivez ce qui s’est passé et indiquez, si vous le souhaitez, une adresse pour recevoir une réponse. L’écran affiché et le type d’appareil sont joints au message pour faciliter le diagnostic.'],
      },
      {
        q: 'Utilisez-vous des cookies ou de la publicité ?',
        a: ['Aucune publicité, aucun suivi d’audience, aucun profilage ni revente de données. Le détail figure dans les pages « Mentions légales », « Confidentialité » et « Cookies », en bas de l’accueil.'],
      },
      {
        q: 'Mes données sont-elles sauvegardées ?',
        a: ['Oui. La base des comptes est sauvegardée régulièrement sous forme chiffrée, afin de pouvoir être restaurée en cas d’incident. Cela concerne les comptes inscrits ; une progression restée dans le navigateur d’un invité n’est pas sauvegardée côté serveur.'],
      },
    ],
  },
];

/** Minuscules sans accents, pour une recherche tolérante. */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Sections et questions qui contiennent tous les mots recherchés (question ou réponse). */
export function searchFaq(query: string, sections: readonly FaqSection[] = FAQ): FaqSection[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => { const hay = fold(`${i.q} ${i.a.join(' ')}`); return words.every((w) => hay.includes(w)); }) }))
    .filter((s) => s.items.length > 0);
}
