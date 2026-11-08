/**
 * Droits d'accès du module Blackjack : point d'extension de la future monétisation.
 *
 * Principes (voir README, « Blackjack ») :
 *  - tout le jeu et toute la progression restent gratuits ; aucune mise en argent réel, aucun achat de jetons ;
 *  - une offre payante n'ajoute que du confort ou du cosmétique, jamais d'avantage de jeu ;
 *  - aujourd'hui, tous les droits sont accordés : brancher un abonnement revient à remplacer `plan()`.
 */
export type Plan = 'gratuit' | 'premium';

export type Feature =
  | 'jeu-complet' // tables, règles, défis, objectifs, classement : toujours gratuit
  | 'cosmetiques' // tapis, dos de cartes, jetons supplémentaires
  | 'stats-avancees' // courbes, analyse par table et par main de départ
  | 'competitions' // tournois à récompenses virtuelles
  | 'sans-publicite';

const FREE: ReadonlySet<Feature> = new Set<Feature>(['jeu-complet']);
const ALL: ReadonlySet<Feature> = new Set<Feature>(['jeu-complet', 'cosmetiques', 'stats-avancees', 'competitions', 'sans-publicite']);

/** Plan du joueur. Pas d'offre commerciale en vigueur : chacun dispose de l'ensemble des fonctions. */
export function plan(): Plan {
  return 'premium';
}

export function hasFeature(feature: Feature, p: Plan = plan()): boolean {
  return (p === 'premium' ? ALL : FREE).has(feature);
}
