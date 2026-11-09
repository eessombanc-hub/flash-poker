import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VictoryTitle, WinnerSpotlight } from '../src/components/Winner';
import { Sound } from '../src/lib/sound';

afterEach(() => vi.unstubAllGlobals());

describe('mise en scène du vainqueur', () => {
  it('affiche toujours le contenu et le titre, avec ou sans animation', () => {
    render(
      <WinnerSpotlight>
        <span>Trophée</span>
      </WinnerSpotlight>,
    );
    render(<VictoryTitle testId="titre">Victoire d’Ana</VictoryTitle>);
    expect(screen.getByText('Trophée')).toBeInTheDocument();
    expect(screen.getByTestId('titre')).toHaveTextContent('Victoire d’Ana');
  });
  it('sans effet quand il est désactivé : seul le contenu est rendu', () => {
    const { container } = render(
      <WinnerSpotlight active={false}>
        <span>Contenu</span>
      </WinnerSpotlight>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(0);
    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });
  it('les rayons et les étincelles sont décoratifs (masqués aux lecteurs d’écran)', () => {
    const { container } = render(
      <WinnerSpotlight>
        <span>x</span>
      </WinnerSpotlight>,
    );
    for (const el of container.querySelectorAll('[aria-hidden="true"]')) expect(el).toBeTruthy();
  });
});

describe('sons : carte distribuée, carte posée, victoire', () => {
  it('existent et ne plantent pas sans moteur audio (navigateur ou test sans Web Audio)', () => {
    for (const name of ['deal', 'place', 'victory', 'select', 'flip', 'win'] as const) expect(() => Sound[name]()).not.toThrow();
  });
  it('jouent avec un moteur audio simulé, sans erreur', () => {
    const node = () => ({ connect: vi.fn(function (this: unknown) { return this; }), gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, frequency: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, detune: { value: 0 }, Q: { value: 0 }, delayTime: { value: 0 }, threshold: { value: 0 }, ratio: { value: 0 }, start: vi.fn(), stop: vi.fn(), type: '', buffer: null });
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      sampleRate = 8000;
      destination = node();
      resume = vi.fn();
      createGain = node;
      createOscillator = node;
      createBiquadFilter = node;
      createDelay = node;
      createDynamicsCompressor = node;
      createBufferSource = node;
      createBuffer = () => ({ getChannelData: () => new Float32Array(8000) });
    }
    vi.stubGlobal('AudioContext', FakeCtx);
    Object.defineProperty(window, 'AudioContext', { value: FakeCtx, configurable: true });
    for (const name of ['deal', 'place', 'victory'] as const) expect(() => Sound[name]()).not.toThrow();
  });
});
