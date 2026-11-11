import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { currentI18n, useI18n } from '../i18n';
import {
  CENTERED,
  MAX_FILE_BYTES,
  MAX_ZOOM,
  MIN_ZOOM,
  PREVIEW_SIZE,
  drawCrop,
  isImageAvatar,
  loadImage,
  moveCrop,
  renderAvatarJpeg,
  type Crop,
  type LoadedImage,
} from '../lib/avatarImage';
import { errorText } from '../lib/tbText';

const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400';
const btn = `min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition disabled:opacity-50 ${focus}`;
const STEP = 12; // pixels d'aperçu par appui sur une flèche

/**
 * Photo de profil : choix d'un fichier, recadrage carré (glisser, flèches du clavier, zoom), envoi.
 * Le fichier d'origine reste sur l'appareil : seul le JPEG de 128 pixels est envoyé.
 */
export function AvatarUpload({ current, upload, onRemove }: { current: string; upload: (jpeg: Blob) => Promise<void>; onRemove: () => Promise<void> }) {
  const { t } = useI18n();
  const hasPhoto = isImageAvatar(current);
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<Crop>(CENTERED);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => () => img?.release(), [img]);
  useEffect(() => {
    const ctx = img ? canvas.current?.getContext?.('2d') : null;
    if (img && ctx) drawCrop(ctx, img, crop, PREVIEW_SIZE);
  }, [img, crop]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setNote(null);
    if (file.size > MAX_FILE_BYTES) return setNote({ tone: 'error', text: t('avu.err.size') });
    try {
      const loaded = await loadImage(file);
      setCrop(CENTERED);
      setImg(loaded);
    } catch {
      setNote({ tone: 'error', text: t('avu.err.type') });
    }
  }

  function move(dx: number, dy: number) {
    if (img) setCrop((c) => moveCrop(img.width, img.height, c, dx, dy));
  }
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    move(e.clientX - drag.current.x, e.clientY - drag.current.y);
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const d = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }[e.key];
    if (!d) return;
    e.preventDefault();
    move(d[0]!, d[1]!);
  };

  function close() {
    setImg(null);
    if (input.current) input.current.value = '';
  }

  async function save() {
    if (!img) return;
    setBusy(true);
    setNote(null);
    try {
      await upload(await renderAvatarJpeg(img, crop));
      close();
      setNote({ tone: 'ok', text: t('avu.saved') });
    } catch (e) {
      setNote({ tone: 'error', text: errorText(currentI18n(), e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setNote(null);
    try {
      await onRemove();
      setNote({ tone: 'ok', text: t('avu.removed') });
    } catch (e) {
      setNote({ tone: 'error', text: errorText(currentI18n(), e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ivory-300/70">{t('avu.hint')}</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" tabIndex={-1} aria-label={t('avu.file')} onChange={(e) => void pick(e.target.files?.[0])} />

      {!img && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${btn} border-gold-500/60 text-gold-300 hover:bg-gold-500/10`}>
            {hasPhoto ? t('avu.replace') : t('avu.import')}
          </button>
          {hasPhoto && (
            <button type="button" disabled={busy} onClick={() => void remove()} className={`${btn} border-ivory-100/20 text-ivory-200 hover:border-ivory-100/40`}>
              {t('avu.remove')}
            </button>
          )}
        </div>
      )}

      {img && (
        <div role="group" aria-label={t('avu.crop')} className="space-y-3 rounded-2xl border border-ivory-100/10 bg-ink-900/60 p-4">
          <p id="avu-drag" className="text-sm text-ivory-200/80">{t('avu.drag')}</p>
          <canvas
            ref={canvas}
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            tabIndex={0}
            aria-label={t('avu.preview')}
            aria-describedby="avu-drag"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, touchAction: 'none' }}
            className={`mx-auto block cursor-grab rounded-full ring-2 ring-gold-500/60 active:cursor-grabbing ${focus}`}
          />
          <label className="flex items-center gap-3 text-sm text-ivory-100">
            {t('avu.zoom')}
            <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} className="h-11 flex-1 accent-gold-400" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className={`${btn} border-transparent bg-gold-500/90 text-ink-950 hover:bg-gold-400`}>
              {busy ? t('avu.saving') : t('avu.use')}
            </button>
            <button type="button" disabled={busy} onClick={close} className={`${btn} border-ivory-100/20 text-ivory-200 hover:border-ivory-100/40`}>
              {t('avu.cancel')}
            </button>
          </div>
        </div>
      )}

      {note && (
        <p role={note.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${note.tone === 'ok' ? 'border border-jade-500/40 bg-jade-950/50 text-jade-100' : 'border border-ruby-500/50 bg-ruby-950/60 text-ruby-100'}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
