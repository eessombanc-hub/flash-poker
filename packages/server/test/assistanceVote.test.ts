import { describe, expect, it } from 'vitest';
import { expectErr, makeManager } from './helpers';

const CFG = { name: 'Table', maxPlayers: 4, targetPoints: 3, stakeCents: 2000, nickname: 'Host' };

/** Salle d'attente : l'hôte + `guests` invités (aucun vote, aucun départ). */
function lobby(cfg: Record<string, unknown> = {}, guests = 1) {
  const env = makeManager();
  const host = env.m.createRoom({ ...CFG, ...cfg });
  const ids = [host.playerId];
  for (let i = 1; i <= guests; i++) ids.push(env.m.joinRoom(host.code, { nickname: `J${i}` }).playerId);
  for (const id of ids) env.m.connect(host.code, id);
  return { ...env, code: host.code, hostId: host.playerId, ids };
}
const view = (l: ReturnType<typeof lobby>, id: string) => l.m.view(l.code, id);
const approved = (l: ReturnType<typeof lobby>, id: string) => Object.fromEntries(view(l, l.hostId).players.map((p) => [p.id, p.assistanceApproved]));

describe('assistance : sans proposition (défaut)', () => {
  it('rien à approuver : tous « approuvés » d’office, partie sans assistance, vote refusé', () => {
    const l = lobby();
    expect(view(l, l.hostId).config.assistance).toBe(false);
    expect(Object.values(approved(l, l.hostId)).every(Boolean)).toBe(true);
    expectErr(() => l.m.approveAssistance(l.code, l.ids[1]!, true), 'WRONG_STATE');
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(false);
  });
});

describe('assistance : proposée par l’hôte, approuvée à l’unanimité', () => {
  it('l’hôte est approuvé d’office ; l’invité doit voter ; unanimité → partie avec assistance, visible de tous', () => {
    const l = lobby({ assistance: true });
    const before = approved(l, l.hostId);
    expect(before[l.hostId]).toBe(true);
    expect(before[l.ids[1]!]).toBeNull(); // pas encore répondu (compte comme un refus au départ)
    expect(view(l, l.ids[1]!).config.assistance).toBe(true); // la proposition est visible de l'invité
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    expect(approved(l, l.hostId)[l.ids[1]!]).toBe(true);
    l.m.startGame(l.code, l.hostId);
    for (const id of l.ids) expect(view(l, id).game!.assistance).toBe(true);
  });

  it('à 3 joueurs : tous doivent approuver', () => {
    const l = lobby({ assistance: true }, 2);
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.m.approveAssistance(l.code, l.ids[2]!, true);
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(true);
  });
});

describe('assistance : désaccord ou silence → partie sans assistance', () => {
  it('un refus explicite suffit', () => {
    const l = lobby({ assistance: true }, 2);
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.m.approveAssistance(l.code, l.ids[2]!, false);
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(false);
  });

  it('un joueur qui n’a pas voté compte comme un refus (silence = refus)', () => {
    const l = lobby({ assistance: true }, 2);
    l.m.approveAssistance(l.code, l.ids[1]!, true); // le 3e joueur ne répond pas
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(false);
  });

  it('un arrivant tardif (après les votes) doit aussi approuver', () => {
    const l = lobby({ assistance: true });
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    const late = l.m.joinRoom(l.code, { nickname: 'Retard' }).playerId;
    expect(approved(l, l.hostId)[late]).toBeNull();
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(false); // il n'a rien approuvé
  });

  it('trois états distincts : pas encore répondu (null), refus (false), accord (true) — le silence ≠ un refus explicite à l’affichage, mais compte comme tel au départ', () => {
    const l = lobby({ assistance: true }, 2);
    expect(approved(l, l.hostId)[l.ids[1]!]).toBeNull();
    l.m.approveAssistance(l.code, l.ids[1]!, false);
    expect(approved(l, l.hostId)[l.ids[1]!]).toBe(false); // refus explicite : distinct de « pas encore répondu »
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    expect(approved(l, l.hostId)[l.ids[1]!]).toBe(true);
    l.m.approveAssistance(l.code, l.ids[2]!, true);
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(true);
    // et à l’inverse : un null au départ = pas d’assistance
    const m = lobby({ assistance: true }, 1);
    expect(approved(m, m.hostId)[m.ids[1]!]).toBeNull();
    m.m.startGame(m.code, m.hostId);
    expect(view(m, m.hostId).game!.assistance).toBe(false);
  });

  it('un joueur peut changer d’avis avant le départ', () => {
    const l = lobby({ assistance: true });
    l.m.approveAssistance(l.code, l.ids[1]!, false);
    expect(approved(l, l.hostId)[l.ids[1]!]).toBe(false);
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(true);
  });

  it('l’hôte peut lui-même retirer son accord (donc pas d’assistance)', () => {
    const l = lobby({ assistance: true });
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.m.approveAssistance(l.code, l.hostId, false);
    l.m.startGame(l.code, l.hostId);
    expect(view(l, l.hostId).game!.assistance).toBe(false);
  });
});

describe('assistance : réglage fixé pour toute la partie', () => {
  it('plus aucun vote possible une fois la partie démarrée, et la valeur ne change pas', () => {
    const l = lobby({ assistance: true });
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.m.startGame(l.code, l.hostId);
    expectErr(() => l.m.approveAssistance(l.code, l.ids[1]!, false), 'WRONG_STATE');
    expect(view(l, l.hostId).game!.assistance).toBe(true);
  });

  it('annoncé dans l’événement de départ (public)', () => {
    const l = lobby({ assistance: true });
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.out.length = 0;
    l.m.startGame(l.code, l.hostId);
    const started = l.out.flatMap((o) => (o.message.type === 'update' ? o.message.events : [])).find((e) => e.type === 'GAME_STARTED');
    expect(started?.data.assistance).toBe(true);
  });

  it('survit à un redémarrage du serveur (votes et réglage conservés)', () => {
    const l = lobby({ assistance: true }, 2);
    l.m.approveAssistance(l.code, l.ids[1]!, true);
    const snap = l.m.snapshotRoom(l.code);
    const l2 = makeManager();
    l2.m.restoreRoom(JSON.parse(JSON.stringify(snap)));
    const restored = l2.m.view(l.code, l.hostId);
    expect(restored.config.assistance).toBe(true);
    expect(Object.fromEntries(restored.players.map((p) => [p.id, p.assistanceApproved]))).toEqual({ [l.ids[0]!]: true, [l.ids[1]!]: true, [l.ids[2]!]: null });
    // partie démarrée puis restaurée : le réglage effectif est conservé
    l.m.approveAssistance(l.code, l.ids[2]!, true);
    l.m.startGame(l.code, l.hostId);
    const l3 = makeManager();
    l3.m.restoreRoom(JSON.parse(JSON.stringify(l.m.snapshotRoom(l.code))));
    expect(l3.m.view(l.code, l.hostId).game!.assistance).toBe(true);
  });
});

describe('assistance : effet en cours de manche, via le serveur', () => {
  const startWith = (assistance: boolean) => {
    const l = lobby({ assistance }, 1);
    if (assistance) l.m.approveAssistance(l.code, l.ids[1]!, true);
    l.m.startGame(l.code, l.hostId);
    const chooser = view(l, l.hostId).game!.chooser;
    l.m.command(l.code, chooser, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    return { l, chooser };
  };

  it('avec assistance : chaque joueur reçoit le nom de sa combinaison, jamais celle d’un autre', () => {
    const { l } = startWith(true);
    for (const id of l.ids) {
      const info = view(l, id).game!.round!.info as { assistCategory: number | null };
      expect(typeof info.assistCategory).toBe('number');
    }
  });

  it('sans assistance : aucun indicateur', () => {
    const { l } = startWith(false);
    for (const id of l.ids) expect((view(l, id).game!.round!.info as { assistCategory: number | null }).assistCategory).toBeNull();
  });

  it('un désaccord au vote se traduit bien par l’absence d’indicateur en manche', () => {
    const l = lobby({ assistance: true }, 1);
    l.m.approveAssistance(l.code, l.ids[1]!, false);
    l.m.startGame(l.code, l.hostId);
    const chooser = view(l, l.hostId).game!.chooser;
    l.m.command(l.code, chooser, { type: 'CHOOSE_VARIANT', variant: 'CLOSED_1' });
    for (const id of l.ids) expect((view(l, id).game!.round!.info as { assistCategory: number | null }).assistCategory).toBeNull();
  });
});

describe('assistance : validation de la commande', () => {
  it('la valeur proposée à la création doit être un booléen', () => {
    const { m } = makeManager();
    expectErr(() => m.createRoom({ ...CFG, assistance: 'oui' }), 'BAD_REQUEST');
    expect(() => m.createRoom({ ...CFG, assistance: true })).not.toThrow();
  });
});
