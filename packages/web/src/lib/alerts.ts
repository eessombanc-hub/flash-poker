import { useEffect, useRef } from 'react';
import { useSecondsLeft } from './context';
import { Sound, vibrate } from './sound';
import { useTable } from './table';

const ORIGINAL_TITLE = typeof document === 'undefined' ? '' : document.title;
const TURN_TITLE = 'À vous de jouer. Flash Poker';

/** Suis-je attendu maintenant ? Une clé stable qui change à chaque NOUVEAU tour (pour ne sonner qu'une fois). */
function myTurnKey(t: ReturnType<typeof useTable>): string | null {
  if (!t.canAct || !t.round) {
    if (t.canAct && t.game.phase === 'VARIANT_SELECTION' && t.game.chooser === t.me) return `chooser:${t.timerKey}`;
    return null;
  }
  if (t.game.insurance.pending?.partner === t.me) return `insurance:${t.timerKey}`;
  if (t.round.awaiting.includes(t.me)) return `round:${t.timerKey}`;
  return null;
}

/**
 * Signaux de jeu, centralisés : un son + une courte vibration au début de votre tour, une vibration aux 5
 * dernières secondes, et un titre d'onglet clignotant si la page n'est pas au premier plan pendant votre tour.
 * Aucun effet si `enabled` est faux (réglage « Sons » désactivé).
 */
export function useGameAlerts(enabled: boolean): void {
  const t = useTable();
  const key = myTurnKey(t);
  const secondsLeft = useSecondsLeft(t.deadlineAt);
  const lastKey = useRef<string | null>(null);
  const warned5s = useRef<string | null>(null);
  const blinkTimer = useRef<number | null>(null);

  // Début d'un nouveau tour : son + vibration courte.
  useEffect(() => {
    if (key && key !== lastKey.current) {
      lastKey.current = key;
      if (enabled) {
        Sound.yourTurn();
        vibrate(60);
      }
    }
    if (!key) lastKey.current = null;
  }, [key, enabled]);

  // 5 dernières secondes de votre tour : une vibration, une seule fois par phase.
  useEffect(() => {
    if (!enabled || !key || secondsLeft === null) return;
    if (secondsLeft <= 5 && warned5s.current !== key) {
      warned5s.current = key;
      vibrate([40, 40, 40]);
    }
    if (secondsLeft > 5) warned5s.current = null;
  }, [key, secondsLeft, enabled]);

  // Titre d'onglet clignotant tant que l'onglet est en arrière-plan et que c'est votre tour.
  useEffect(() => {
    function stopBlink() {
      if (blinkTimer.current !== null) {
        window.clearInterval(blinkTimer.current);
        blinkTimer.current = null;
      }
      document.title = ORIGINAL_TITLE;
    }
    function sync() {
      if (key && document.hidden) {
        if (blinkTimer.current === null) {
          let on = false;
          blinkTimer.current = window.setInterval(() => {
            on = !on;
            document.title = on ? TURN_TITLE : ORIGINAL_TITLE;
          }, 1200);
        }
      } else {
        stopBlink();
      }
    }
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      stopBlink();
    };
  }, [key]);
}
