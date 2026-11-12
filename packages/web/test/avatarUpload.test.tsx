import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { Avatar } from '../src/components/ui';
import { AvatarUpload } from '../src/components/AvatarUpload';
import { ApiError } from '../src/lib/api';
import { CENTERED, avatarImageUrl, cropSquare, isImageAvatar, moveCrop, setAvatarBase } from '../src/lib/avatarImage';

describe('Cadrage de la photo', () => {
  it('découpe un carré centré dans une image large, puis zoomé', () => {
    expect(cropSquare(400, 200, CENTERED)).toEqual({ side: 200, sx: 100, sy: 0 });
    expect(cropSquare(400, 200, { zoom: 2, x: 0.5, y: 0.5 })).toEqual({ side: 100, sx: 150, sy: 50 });
    expect(cropSquare(400, 200, { zoom: 99, x: 5, y: -3 }).side).toBeCloseTo(200 / 3); // bornes respectées
  });

  it('l’image suit le doigt et ne sort jamais du cadre', () => {
    const moved = moveCrop(400, 200, CENTERED, 20, 0, 200); // 1 px d'aperçu = 1 px de l'image
    expect(cropSquare(400, 200, moved).sx).toBe(80);
    const far = moveCrop(400, 200, CENTERED, -5000, 5000, 200);
    expect(far.x).toBe(1);
    expect(far.y).toBe(0.5); // hauteur sans marge : rien à déplacer
  });

  it('reconnaît un identifiant de photo et construit son adresse', () => {
    expect(isImageAvatar('i0123456789abcdef')).toBe(true);
    for (const bad of ['or', 'm01234567', 'i0123456789abcde', 'I0123456789abcdef', 'i0123456789abcdeg', null, undefined]) expect(isImageAvatar(bad)).toBe(false);
    setAvatarBase('https://api.exemple.fr/');
    expect(avatarImageUrl('i0123456789abcdef')).toBe('https://api.exemple.fr/avatars/i0123456789abcdef.jpg');
    setAvatarBase('');
    expect(avatarImageUrl('i0123456789abcdef')).toBe('/avatars/i0123456789abcdef.jpg');
  });
});

describe('Avatar : photo', () => {
  it('affiche la photo du serveur, puis retombe sur un préréglage si elle ne charge pas', () => {
    const { container } = render(<I18nProvider initial="fr"><Avatar nickname="Emeric" avatar="i0123456789abcdef" size={40} /></I18nProvider>);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/avatars/i0123456789abcdef.jpg');
    expect(img.getAttribute('alt')).toBe('');
    img.dispatchEvent(new Event('error'));
    return waitFor(() => {
      expect(container.querySelector('img')).toBeNull();
      expect(container.textContent).toBe('EM');
    });
  });
});

describe('Import de la photo de profil', () => {
  const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '', imageSmoothingQuality: '' };
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 300, close: vi.fn() })));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (cb: BlobCallback) {
      cb(new Blob(['jpeg'], { type: 'image/jpeg' }));
    }) as never;
  });
  afterEach(() => vi.unstubAllGlobals());

  const setup = (over: { current?: string; upload?: Mock<(jpeg: Blob) => Promise<void>> } = {}) => {
    const props = { current: 'or', upload: vi.fn<(jpeg: Blob) => Promise<void>>().mockResolvedValue(undefined), onRemove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined), ...over };
    render(<I18nProvider initial="fr"><AvatarUpload {...props} /></I18nProvider>);
    return props;
  };
  const file = (name = 'moi.png', type = 'image/png', size = 1000) => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('choisir un fichier, recadrer, envoyer un JPEG', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.upload(screen.getByLabelText('Choisir un fichier image'), file());
    expect(await screen.findByRole('group', { name: 'Recadrer votre photo' })).toBeInTheDocument();
    expect(screen.getByLabelText('Aperçu de la photo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Utiliser cette photo' }));
    await waitFor(() => expect(props.upload).toHaveBeenCalledTimes(1));
    const sent = props.upload.mock.calls[0]![0] as Blob;
    expect(sent.type).toBe('image/jpeg');
    expect(await screen.findByText(/Photo enregistrée/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Recadrer votre photo' })).toBeNull();
  });

  it('à l’inscription (mode différé) : la photo est gardée, prévisualisée, puis retirable', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    const props = { current: 'or', upload: vi.fn<(jpeg: Blob) => Promise<void>>().mockResolvedValue(undefined), onRemove: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) };
    render(<I18nProvider initial="fr"><AvatarUpload deferred {...props} /></I18nProvider>);
    await user.upload(screen.getByLabelText('Choisir un fichier image'), file());
    await user.click(await screen.findByRole('button', { name: 'Utiliser cette photo' }));
    expect(await screen.findByText(/sera enregistrée avec votre compte/)).toBeInTheDocument();
    expect(props.upload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('img', { name: 'Aperçu de la photo' }).getAttribute('src')).toBe('blob:photo');
    await user.click(screen.getByRole('button', { name: 'Retirer ma photo' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Aperçu de la photo' })).toBeNull());
    expect(props.onRemove).toHaveBeenCalledTimes(1);
  });

  it('les flèches du clavier déplacent le cadrage et l’annulation n’envoie rien', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.upload(screen.getByLabelText('Choisir un fichier image'), file());
    const preview = await screen.findByLabelText('Aperçu de la photo');
    ctx.drawImage.mockClear();
    preview.focus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(props.upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Recadrer votre photo' })).toBeNull();
  });

  it('refuse un fichier trop lourd ou illisible, sans envoyer', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const props = setup();
    await user.upload(screen.getByLabelText('Choisir un fichier image'), file('enorme.png', 'image/png', 11 * 1024 * 1024));
    expect(await screen.findByRole('alert')).toHaveTextContent('trop volumineux');
    (createImageBitmap as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('format'));
    await user.upload(screen.getByLabelText('Choisir un fichier image'), file('cassee.heic', 'image/heic'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('pas une image lisible'));
    expect(props.upload).not.toHaveBeenCalled();
  });

  it('affiche l’erreur du serveur et garde le recadrage ouvert', async () => {
    const user = userEvent.setup();
    setup({ upload: vi.fn<(jpeg: Blob) => Promise<void>>().mockRejectedValue(new ApiError('BAD_REQUEST', 'Image refusée.', 'AVATAR_IMAGE')) });
    await user.upload(screen.getByLabelText('Choisir un fichier image'), file());
    await user.click(await screen.findByRole('button', { name: 'Utiliser cette photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Image refusée. Réessayez avec une autre photo.');
    expect(screen.getByRole('group', { name: 'Recadrer votre photo' })).toBeInTheDocument();
  });

  it('avec une photo, propose de la changer ou de la retirer', async () => {
    const user = userEvent.setup();
    const props = setup({ current: 'i0123456789abcdef' });
    expect(screen.getByRole('button', { name: 'Changer de photo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer ma photo' }));
    await waitFor(() => expect(props.onRemove).toHaveBeenCalled());
    expect(await screen.findByText('Photo retirée.')).toBeInTheDocument();
  });
});
