/** Mémo des règles : reprend le document de règles v1.1 validé. Aucune règle n'est ajoutée ici. */
export const COMMON_RULES: { title: string; text: string }[] = [
  { title: 'La table', text: 'De 2 à 6 joueurs, une mise identique pour tous. La cagnotte se joue en jetons, sans valeur monétaire.' },
  { title: 'Positions', text: 'Tirées au sort au démarrage, de UTG à UTG+5, et stables pendant toute la partie.' },
  { title: 'Choix de la variante', text: 'Le choix tourne dans l\u2019ordre des positions. Sans choix en 60 secondes, une variante disponible est tirée au hasard.' },
  { title: 'Points', text: 'Le vainqueur d\u2019une manche marque 1 point (2 points au 6-3 s\u2019il gagne seul les 3 lignes). L\u2019objectif va de 1 à 5 points.' },
  { title: 'Égalité', text: 'Un Hold\u2019em de départage entre les seuls ex aequo : 2 cartes privées ouvertes, 5 cartes communes. Au 6-3, à 2 ou 3 joueurs, une égalité en tête donne 0 point.' },
  { title: 'Minuteurs', text: '60 secondes pour chaque phase (change, défausse, ligne du 6-3, retournement du 6-1, réponse à une assurance). Un joueur déconnecté suit les mêmes délais.' },
  { title: 'Mains', text: 'L\u2019As est toujours la carte la plus forte. La roue A-2-3-4-5 est une quinte valide ; les couleurs ne départagent jamais.' },
  { title: 'Assurance', text: 'Entre deux manches, deux joueurs à 1 point de la victoire peuvent s\u2019assurer : « le perdant ne paye pas » ou « 50 / 50 ». Une seule assurance par partie. Elle ne change jamais le vainqueur, seulement la répartition de la cagnotte.' },
  { title: 'Arrivée en cours de partie', text: 'Un joueur peut rejoindre entre deux manches, à la dernière position, avec 0 point et la même mise, dans la limite du nombre de places.' },
];
