/** Première visite : le parcours guidé de l'accueil disparaît dès qu'il est suivi ou écarté. */
const KEY = 'fp.onboarded';

export function isFirstVisit(storage: Pick<Storage, 'getItem'> | null = safe()): boolean {
  try {
    return storage ? storage.getItem(KEY) !== '1' : false;
  } catch {
    return false;
  }
}

export function markOnboarded(storage: Pick<Storage, 'setItem'> | null = safe()): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    /* stockage indisponible : le parcours réapparaîtra, sans gravité */
  }
}

function safe(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
