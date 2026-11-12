import { describe, expect, it } from 'vitest';
import { isOffensiveName, maskOffensive } from '../src/moderation';
import { expectErr, makeManager, setup } from './helpers';

describe('modération du chat', () => {
  it('masque les injures sans toucher au reste, quelles que soient la casse, les accents ou les chiffres', () => {
    expect(maskOffensive('Quel connard, bien joué quand même')).toBe('Quel c****** , bien joué quand même'.replace(' ,', ','));
    expect(maskOffensive('SALOPE')).toBe('S*****');
    expect(maskOffensive('espèce d’enculé')).toBe('espèce d’e*****');
    expect(maskOffensive('c0nnard')).toBe('c******');
    expect(maskOffensive('connnnard')).toBe('c********');
    expect(maskOffensive('ferme ta pute')).toBe('ferme ta p***');
  });
  it('laisse passer le langage courant et les mots qui en contiennent un par hasard', () => {
    for (const ok of ['Putain, quelle main !', 'Merde, perdu', 'Il porte une salopette', 'Un computer portable', 'Scunthorpe', 'Negroni ce soir ?', 'Bien joué, Alice']) expect(maskOffensive(ok)).toBe(ok);
  });
  it('le message diffusé aux joueurs est déjà masqué', () => {
    const env = setup(2);
    const [a, b] = env.order as [string, string];
    env.m.social(env.code, a, { kind: 'chat', text: 'tu es un connard' });
    const got = env.out.filter((o) => o.playerId === b && o.message.type === 'social').map((o) => (o.message as unknown as { text: string }).text);
    expect(got).toEqual(['tu es un c******']);
  });
});

describe('pseudos', () => {
  it('refuse les pseudos injurieux, seuls ou dans un pseudo, et accepte les pseudos ordinaires', () => {
    for (const bad of ['connard42', 'Sale_Pute', 'xXsalopeXx', 'Hitler', 'n1gger']) expect(isOffensiveName(bad)).toBe(true);
    for (const ok of ['Emeric', 'Alice', 'Compute', 'Salopette', 'Karim_92', 'Le Négociateur', 'Scunthorpe']) expect(isOffensiveName(ok)).toBe(false);
  });
  it('la création d’une table et l’arrivée en salle refusent un pseudo injurieux', () => {
    const { m } = makeManager();
    expectErr(() => m.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 3, stakeChips: 0, nickname: 'connard42' }), 'BAD_REQUEST');
    const r = m.createRoom({ name: 'T', maxPlayers: 4, targetPoints: 3, stakeChips: 0, nickname: 'Emeric' });
    expectErr(() => m.joinRoom(r.code, { nickname: 'Sale_Pute' }), 'BAD_REQUEST');
  });
});
