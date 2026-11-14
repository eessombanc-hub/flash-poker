import { describe, expect, it } from 'vitest';
import { AccountDb } from '../src/accounts/db';
import { checkClubName, clubKey } from '../src/accounts/clubs';
import { LogMailer } from '../src/accounts/mailer';
import { AccountService } from '../src/accounts/service';

async function setup() {
  const store = new AccountDb(':memory:');
  let t = 1_700_000_000_000;
  const accounts = new AccountService(store, new LogMailer(false, () => undefined), { now: () => (t += 1000), log: () => undefined });
  const ids: string[] = [];
  for (const n of ['Ana', 'Ben', 'Cléo', 'Dan']) ids.push((await accounts.register({ nickname: n, email: `${n.toLowerCase().replace('é', 'e')}@x.fr`, password: 'tapis-vert-42' })).account.id);
  return { store, accounts, ids };
}
/** Des mains de Blackjack sur la saison en cours, pour qu'un joueur compte dans les classements. */
function play(store: AccountDb, userId: string, at: number, batches = 1) {
  for (let i = 0; i < batches; i++) store.db.prepare('INSERT INTO rank_log (user_id, game, ref, ended_at, played, won) VALUES (?, ?, ?, ?, 10, 5)').run(userId, 'blackjack', `r${i}`, at + i);
}

describe('clubs : saisie', () => {
  it('même club malgré casse, accents et ponctuation ; noms invalides ou injurieux refusés ; vide = quitter', () => {
    expect(clubKey('Amical Poker-Club')).toBe(clubKey('  amical   poker club '));
    expect(clubKey('Cercle Élysée')).toBe(clubKey('cercle elysee'));
    expect(checkClubName('  ')).toEqual({ ok: true, name: null });
    expect(checkClubName(null)).toEqual({ ok: true, name: null });
    expect(checkClubName(' Amical   Poker Club ')).toEqual({ ok: true, name: 'Amical Poker Club' });
    expect(checkClubName('A').ok).toBe(false);
    expect(checkClubName('<script>').ok).toBe(false);
    expect(checkClubName('x'.repeat(31)).ok).toBe(false);
  });
});

describe('clubs : profil et classement', () => {
  it('le club se choisit, se corrige et se quitte depuis le profil', async () => {
    const { accounts, ids } = await setup();
    expect(accounts.account(ids[0]!)!.club).toBeNull();
    expect(accounts.updateProfile(ids[0]!, { club: 'Amical Poker Club' }).club).toBe('Amical Poker Club');
    expect(() => accounts.updateProfile(ids[0]!, { club: 'x' })).toThrow();
    expect(accounts.account(ids[0]!)!.club).toBe('Amical Poker Club');
    expect(accounts.updateProfile(ids[0]!, { club: '' }).club).toBeNull();
  });

  it('classe les clubs sur l’expérience de leurs membres actifs, avec au moins deux membres déclarés', async () => {
    const { store, accounts, ids } = await setup();
    const [ana, ben, cleo, dan] = ids as [string, string, string, string];
    accounts.updateProfile(ana, { club: 'Amical Poker Club' });
    accounts.updateProfile(ben, { club: 'amical poker-club' });
    accounts.updateProfile(cleo, { club: 'Solo Club' }); // un seul membre : absent du classement
    const now = 1_700_000_000_000;
    play(store, ana, now, 3);
    play(store, ben, now + 10, 1);
    play(store, cleo, now + 20, 5);
    play(store, dan, now + 30, 2); // sans club
    const r = accounts.clubRanking(ana);
    expect(r.clubs).toBe(1);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    expect(row.name).toBe('Amical Poker Club'); // nom du premier inscrit
    expect(row).toMatchObject({ rank: 1, members: 2, active: 2, you: true });
    expect(row.xp).toBeGreaterThan(0);
    expect(row.average).toBe(Math.round(row.xp / 2));
    // un membre qui quitte son club n'y compte plus ; le club tombe sous deux membres déclarés
    accounts.updateProfile(ben, { club: null });
    expect(accounts.clubRanking(ana).clubs).toBe(0);
  });

  it('le club apparaît à côté du joueur dans le classement à l’expérience, et disparaît avec le compte', async () => {
    const { store, accounts, ids } = await setup();
    accounts.updateProfile(ids[0]!, { club: 'Cercle Élysée' });
    play(store, ids[0]!, 1_700_000_000_000, 1);
    expect(accounts.xpRanking(ids[0]!).rows[0]!.club).toBe('Cercle Élysée');
    expect(accounts.exportData(ids[0]!)).toMatchObject({ club_member: [expect.objectContaining({ name: 'Cercle Élysée' })] });
    store.db.prepare('DELETE FROM users WHERE id = ?').run(ids[0]!);
    expect(store.db.prepare('SELECT COUNT(*) AS c FROM club_member').get()).toEqual({ c: 0 });
  });
});
