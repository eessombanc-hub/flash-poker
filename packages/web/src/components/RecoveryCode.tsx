import { useState } from 'react';
import { useI18n } from '../i18n';
import { Button } from './ui';

/** Code de secours affiché en grand, avec copie et téléchargement : il n'est montré qu'une seule fois. */
export function RecoveryCodeBox({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* presse-papiers indisponible : le code reste sélectionnable à l'écran */
    }
  }
  function save() {
    const url = URL.createObjectURL(new Blob([`Flash Poker — ${t('rec.file_intro')}\n\n${code}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flash-poker-code-de-secours.txt';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-3 rounded-xl border border-gold-500/40 bg-gold-500/10 p-4">
      <p data-testid="recovery-code" className="select-all text-center font-mono text-2xl font-bold tracking-widest text-gold-200">
        {code}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void copy()}>
          {copied ? t('rec.copied') : t('rec.copy')}
        </Button>
        <Button type="button" variant="secondary" onClick={save}>
          {t('rec.download')}
        </Button>
      </div>
    </div>
  );
}
