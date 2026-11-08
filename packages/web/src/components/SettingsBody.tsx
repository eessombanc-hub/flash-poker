import { useSettings } from '../lib/settings';
import { AMBIANCE_OPTIONS, CARD_BACK_OPTIONS, FELT_OPTIONS } from '../lib/theme';
import { PlayingCard } from './Card';

/** Contenu des Paramètres : sons, lecture des couleurs, couleur du tapis, dos des cartes. Partagé entre
 * l'écran d'accueil (« Paramètres ») et la fenêtre en jeu (« Options »), pour une seule source de vérité. */
export function SettingsBody() {
  const { fourColor, setFourColor, sound, setSound, feltColor, setFeltColor, cardBack, setCardBack, ambiance, setAmbiance } = useSettings();
  return (
    <div className="space-y-7">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-yellow-600" checked={fourColor} onChange={(e) => setFourColor(e.target.checked)} />
        <span>
          <span className="block font-medium text-ivory-50">Cartes en quatre couleurs</span>
          <span className="text-sm text-ivory-200/80">Trèfle vert, carreau bleu : lecture plus rapide des couleurs.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-yellow-600" checked={sound} onChange={(e) => setSound(e.target.checked)} />
        <span>
          <span className="block font-medium text-ivory-50">Sons et vibrations</span>
          <span className="text-sm text-ivory-200/80">Sélection, retournement, votre tour, et vibration mobile en fin de minuteur.</span>
        </span>
      </label>

      <div>
        <p className="mb-2 font-medium text-ivory-50">Ambiance</p>
        <div role="radiogroup" aria-label="Ambiance" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {AMBIANCE_OPTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={ambiance === a.id}
              onClick={() => setAmbiance(a.id)}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${ambiance === a.id ? 'border-gold-500 bg-gold-500/10' : 'border-ivory-100/15 hover:border-ivory-100/35'}`}
            >
              <span className="flex shrink-0 -space-x-2" aria-hidden="true">
                {a.swatch.map((c) => (
                  <span key={c} className="h-6 w-6 rounded-full ring-1 ring-ivory-100/25" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${ambiance === a.id ? 'text-gold-300' : 'text-ivory-50'}`}>{a.label}</span>
                <span className="block text-xs text-ivory-200/75">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-medium text-ivory-50">Couleur du tapis</p>
        <div role="radiogroup" aria-label="Couleur du tapis" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FELT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={feltColor === f.id}
              onClick={() => setFeltColor(f.id)}
              className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${feltColor === f.id ? 'border-gold-500 bg-gold-500/10' : 'border-ivory-100/15 hover:border-ivory-100/35'}`}
            >
              <span className="h-6 w-6 shrink-0 rounded-full ring-1 ring-ivory-100/20" style={{ background: `radial-gradient(circle at 35% 30%, ${f.a}, ${f.c})` }} aria-hidden="true" />
              <span className={feltColor === f.id ? 'text-gold-300' : 'text-ivory-200'}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-medium text-ivory-50">Dos des cartes</p>
        <div role="radiogroup" aria-label="Dos des cartes" className="flex flex-wrap gap-2.5">
          {CARD_BACK_OPTIONS.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={cardBack === b.id}
              aria-label={b.label}
              onClick={() => setCardBack(b.id)}
              className={`flex min-h-[44px] flex-col items-center gap-1.5 rounded-xl border px-3 py-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${cardBack === b.id ? 'border-gold-500 bg-gold-500/10' : 'border-ivory-100/15 hover:border-ivory-100/35'}`}
            >
              <span aria-hidden="true">
                <PlayingCard code={null} back={b.id} size="sm" />
              </span>
              <span className={`text-xs ${cardBack === b.id ? 'text-gold-300' : 'text-ivory-200'}`}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
