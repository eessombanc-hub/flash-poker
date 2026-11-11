import { useState } from 'react';
import { useI18n } from '../i18n';
import {
  AVATAR_PARTS,
  BACKGROUND_COLORS,
  DEFAULT_SPEC,
  HAIR_COLORS,
  OUTFIT_COLORS,
  PART_COUNTS,
  SKIN_TONES,
  encodeAvatar,
  parseAvatar,
  randomSpec,
  type AvatarPart,
  type AvatarSpec,
} from '../lib/avatarSpec';
import { AvatarFace } from './AvatarFace';

const SWATCHES: Partial<Record<AvatarPart, readonly string[]>> = {
  skin: SKIN_TONES,
  hairColor: HAIR_COLORS,
  outfit: OUTFIT_COLORS,
  background: BACKGROUND_COLORS,
};

const CATEGORY = {
  skin: 'av.cat.skin',
  hair: 'av.cat.hair',
  hairColor: 'av.cat.hairColor',
  eyes: 'av.cat.eyes',
  mouth: 'av.cat.mouth',
  accessory: 'av.cat.accessory',
  outfit: 'av.cat.outfit',
  background: 'av.cat.background',
} as const;

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400';

/** Atelier d'avatar : on compose un visage et chaque choix met à jour la valeur immédiatement. */
export function AvatarEditor({ value, onChange, onClose }: { value: string; onChange: (code: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const spec = parseAvatar(value) ?? DEFAULT_SPEC;
  const [part, setPart] = useState<AvatarPart>('hair');
  const label = (p: AvatarPart) => t(CATEGORY[p]);
  const set = (p: AvatarPart, n: number) => onChange(encodeAvatar({ ...spec, [p]: n }));
  const swatches = SWATCHES[part];

  return (
    <div role="group" aria-label={t('av.studio')} className="space-y-4 rounded-2xl border border-ivory-100/10 bg-ink-900/60 p-4">
      <p className="text-sm text-ivory-200/80">{t('av.hint')}</p>
      <div className="flex items-center gap-4">
        <span role="img" aria-label={t('av.preview')} className="inline-block shrink-0 overflow-hidden rounded-full ring-2 ring-gold-500/60">
          <AvatarFace spec={spec} size={96} />
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange(encodeAvatar(randomSpec()))} className={`min-h-[44px] rounded-xl border border-gold-500/60 px-3 text-sm font-semibold text-gold-300 hover:bg-gold-500/10 ${focus}`}>
            {t('av.random')}
          </button>
          <button type="button" onClick={onClose} className={`min-h-[44px] rounded-xl bg-gold-500/90 px-4 text-sm font-semibold text-ink-950 hover:bg-gold-400 ${focus}`}>
            {t('av.done')}
          </button>
        </div>
      </div>

      <div role="radiogroup" aria-label={t('av.parts')} className="flex flex-wrap gap-1.5">
        {AVATAR_PARTS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={part === p}
            onClick={() => setPart(p)}
            className={`min-h-[40px] rounded-full border px-3 text-xs font-semibold transition ${focus} ${part === p ? 'border-gold-500 bg-gold-500/15 text-gold-300' : 'border-ivory-100/15 text-ivory-200 hover:border-ivory-100/35'}`}
          >
            {label(p)}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label={label(part)} className="flex flex-wrap gap-2">
        {Array.from({ length: PART_COUNTS[part] }, (_, n) => {
          const selected = spec[part] === n;
          const preview: AvatarSpec = { ...spec, [part]: n };
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t('av.option', { cat: label(part), n: n + 1 })}
              onClick={() => set(part, n)}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center overflow-hidden rounded-full p-0.5 transition ${focus} ${selected ? 'ring-2 ring-gold-400' : 'opacity-75 hover:opacity-100'}`}
            >
              {swatches ? <span className="block h-10 w-10 rounded-full border border-ivory-100/20" style={{ background: swatches[n] }} /> : <span className="block overflow-hidden rounded-full"><AvatarFace spec={preview} size={40} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
