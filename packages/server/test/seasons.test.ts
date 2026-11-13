import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { LogMailer } from '../src/accounts/mailer';
import { logRank, periodBounds, seasonAt, seasonsBetween } from '../src/accounts/rankings';
import { evaluateRewards, REWARDS } from '../src/accounts/rewards';
import { AccountService } from '../src/accounts/service';

const D = 86_400_000;
const paris = (y: number, m: number, d: number) => Date.UTC(y, m, d) - 3_600_000; // minuit à Paris en hiver
// Vendredi 13 novembre 2026, midi à Paris.
const NOW = Date.UTC(2026, 10, 13, 11, 0, 0);

describe('saisons de trois mois (heure de Paris)', () => {
  it('quatre trimestres civils', () => {
    expect(seasonAt(NOW)).toMatchObject({ id: '2026-T4', year: 2026, quarter: 4, start: Date.UTC(2026, 9, 1) - 7_200_000 }); // 1er octobre : heure d’été (UTC+2)
    expect(seasonAt(NOW).end).toBe(paris(2027, 0, 1));
    expect(seasonAt(Date.UTC(2026, 0, 15)).id).toBe('2026-T1');
    expect(seasonAt(Date.UTC(2026, 3, 15)).id).toBe('2026-T2');
    expect(seasonAt(Date.UTC(2026, 6, 15)).id).toBe('2026-T3');
  });
  it('une saison finit exactement là où la suivante commence, y compris au passage d’une année', () => {
    const s = seasonAt(NOW);
    expect(seasonAt(s.end - 1).id).toBe('2026-T4');
    expect(seasonAt(s.end)).toMatchObject({ id: '2027-T1', quarter: 1, year: 2027 });
    expect(s.end).toBe(paris(2027, 0, 1));
  });
  it('le 31 décembre à 23 h 30 appartient encore à la saison qui finit', () => {
    expect(seasonAt(Date.UTC(2026, 11, 31, 22, 30)).id).toBe('2026-T4');
    expect(seasonAt(Date.UTC(2026, 11, 31, 23, 30)).id).toBe('2027-T1');
  });
  it('la liste des saisons va de la première à la courante', () => {
    const list = seasonsBetween(Date.UTC(2026, 0, 10), NOW);
    expect(list.map((s) => s.id)).toEqual(['2026-T1', '2026-T2', '2026-T3', '2026-T4']);
    expect(seasonsBetween(NOW, NOW).map((s) => s.id)).toEqual(['2026-T4']);
  });
  it('période « saison » des classements', () => {
    const s = seasonAt(NOW);
    expect(periodBounds(NOW, 'season')).toEqual({ since: s.start, until: s.end });
  });
});

describe('expérience, hauts faits et classements par saison', () => {
  async function setup(now: () => number) {
    const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(false, () => undefined), { now, log: () => undefined });
    const ids: Record<string, string> = {};
    for (const n of ['Ana', 'Bea']) ids[n] = (await accounts.register({ nickname: n, email: `${n}@x.fr`, password: 'tapis-vert-42' })).account.id;
    const db = accounts['store'].db;
    let k = 0;
    const play = (who: string, at: number, won: number) => {
      const id = `g${k++}`;
      db.prepare('INSERT INTO games (id, ended_at, data) VALUES (?, ?, ?)').run(id, at, '{}');
      db.prepare('INSERT INTO user_games (user_id, game_id, player_id, net_cents, won, ended_at) VALUES (?, ?, ?, 0, ?, ?)').run(ids[who]!, id, 'p', won, at);
      logRank(db, { userId: ids[who]!, game: 'poker', ref: id, endedAt: at, played: 1, won });
    };
    return { accounts, ids, play };
  }

  it('les points de la saison précédente ne comptent plus, mais restent dans le cumul', async () => {
    let now = Date.UTC(2026, 8, 20, 10); // septembre : saison T3
    const { accounts, ids, play } = await setup(() => now);
    for (let i = 0; i < 4; i++) play('Ana', now - i * 1000, 1);
    const t3 = accounts.progression(ids.Ana!);
    expect(t3.season.id).toBe('2026-T3');
    expect(t3.xp).toBeGreaterThan(0);

    now = NOW; // novembre : saison T4, rien joué encore
    const t4 = accounts.progression(ids.Ana!);
    expect(t4.season.id).toBe('2026-T4');
    expect(t4.xp).toBe(0);
    expect(t4.achievements.every((a) => !a.unlocked)).toBe(true);
    expect(t4.career.xp).toBe(t3.xp);
    expect(t4.career.seasons.map((s) => [s.id, s.current])).toEqual([['2026-T4', true], ['2026-T3', false]]);
    expect(accounts.xpRanking(ids.Ana!).rows).toEqual([]); // personne n'a encore joué cette saison
  });

  it('le classement de la saison ne retient que la saison en cours', async () => {
    const { accounts, ids, play } = await setup(() => NOW);
    play('Ana', NOW - 2 * D, 1);
    play('Bea', NOW - 100 * D, 1); // saison précédente
    expect(accounts.xpRanking(ids.Ana!).rows.map((r) => r.nickname)).toEqual(['Ana']);
    expect(accounts.rankings(ids.Ana!, { game: 'poker', period: 'season' }).rows.map((r) => r.nickname)).toEqual(['Ana']);
    expect(accounts.rankings(ids.Ana!, { game: 'poker', period: 'all' }).rows.map((r) => r.nickname).sort()).toEqual(['Ana', 'Bea']);
  });
});

describe('galerie de récompenses', () => {
  const base = { xp: 0, bestLeague: 0, feats: 0, seasons: 1, featIds: new Set<string>() };
  const unlocked = (c: typeof base) => evaluateRewards(c).filter((r) => r.unlocked).map((r) => r.id);

  it('les identifiants sont uniques, et seuls les cadeaux de départ sont ouverts', () => {
    expect(new Set(REWARDS.map((r) => r.id)).size).toBe(REWARDS.length);
    expect(unlocked(base)).toEqual(['title.novice', 'frame.bronze']);
  });
  it('se débloque par l’expérience cumulée, le grade, le nombre de hauts faits, les saisons ou un haut fait précis', () => {
    const u = unlocked({ xp: 2600, bestLeague: 2, feats: 8, seasons: 2, featIds: new Set(['win_row_5']) });
    expect(u).toEqual(expect.arrayContaining(['title.regular', 'emblem.spade', 'emblem.heart', 'title.tactician', 'frame.gold', 'title.strategist', 'title.faithful', 'frame.ember']));
    expect(u).not.toContain('title.shark');
    expect(u).not.toContain('frame.aurora');
    expect(u).not.toContain('emblem.compass');
  });
  it('avancement chiffré d’une récompense verrouillée', () => {
    const r = evaluateRewards({ ...base, xp: 250 }).find((x) => x.id === 'title.regular')!;
    expect([r.value, r.target, r.unlocked]).toEqual([250, 500, false]);
  });
});

describe('équipement des récompenses', () => {
  it('refuse une récompense verrouillée ou d’un autre emplacement, accepte et retire une récompense gagnée', async () => {
    const accounts = new AccountService(new AccountDb(':memory:'), new LogMailer(false, () => undefined), { now: () => NOW, log: () => undefined });
    const id = (await accounts.register({ nickname: 'Ana', email: 'a@x.fr', password: 'tapis-vert-42' })).account.id;
    expect(() => accounts.equip(id, { slot: 'title', id: 'title.legend' })).toThrow();
    expect(() => accounts.equip(id, { slot: 'frame', id: 'title.novice' })).toThrow();
    expect(accounts.equip(id, { slot: 'title', id: 'title.novice' })).toEqual({ title: 'title.novice', frame: null, emblem: null });
    expect(accounts.equip(id, { slot: 'frame', id: 'frame.bronze' }).frame).toBe('frame.bronze');
    expect(accounts.rewards(id).equipped.title).toBe('title.novice');
    expect(accounts.equip(id, { slot: 'title', id: null }).title).toBeNull();
    expect(() => accounts.equip(id, { slot: 'badge', id: null })).toThrow();
  });
});
