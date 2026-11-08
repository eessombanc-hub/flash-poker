import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayingCard } from '../components/Card';
import { CoinRain } from '../components/Scene3D';
import { ColumnStack, ResultsTable, VerdictRow } from '../components/tableau/Board';
import { Avatar, Badge, Button, CountdownRing, Eyebrow, Modal, Panel, Segmented, inputClass } from '../components/ui';
import { ApiError } from '../lib/api';
import type { AccountClient } from '../lib/account';
import { useAccount, useAccountClient } from '../lib/context';
import { useSettings } from '../lib/settings';
import { useSound } from '../lib/sound';
import { announce, clockSkew, COMBOS, inviteUrl, LEVELS, levelLabel, outcomeWord, ROMAN, secondsLeft } from '../lib/tableau';
import type { AiLevel, TbGameDto, TbHistoryEntry } from '../lib/types';

const NICK_KEY = 'poker.tb.nick.v1';
const CONFIRM_KEY = 'poker.tb.confirm.v1';

const readStore = (k: string): string => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const writeStore = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : simple confort */
  }
};
const errText = (e: unknown): string => (e instanceof ApiError ? e.message : 'Une erreur est survenue. Réessayez.');

/** Point d'entrée : menu des modes, puis la partie. Ouvert à tous (invité ou connecté). */
export function Tableau({ onBack, onLogin, initialCode }: { onBack: () => void; onLogin: () => void; initialCode?: string }) {
  const client = useAccountClient();
  const me = useAccount((s) => s.account);
  const ready = useAccount((s) => s.ready);
  const [game, setGame] = useState<TbGameDto | null>(null);
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <button type="button" onClick={game ? () => setGame(null) : onBack} className="rounded-lg px-2 py-1 text-sm text-ivory-200 hover:bg-ivory-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
          {game ? '← Menu du Tableau' : '← Accueil'}
        </button>
        <p className="font-display text-xl tracking-wide text-ivory-50">Le Tableau</p>
        <span className="w-16" aria-hidden="true" />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-12">
        {!client || !ready ? (
          <p className="py-10 text-center text-sm text-ivory-300/70">{client ? 'Chargement…' : 'Le Tableau nécessite le serveur de l’application.'}</p>
        ) : game ? (
          <GameScreen key={game.code} client={client} initial={game} onExit={() => setGame(null)} />
        ) : (
          <>
            {!me && (
              <p className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-500/30 bg-gold-500/10 px-4 py-2.5 text-xs text-ivory-100">
                <span>Vous jouez en invité : l’historique reste sur cet appareil. Avec un compte, il vous suit partout.</span>
                <button type="button" onClick={onLogin} className="font-semibold text-gold-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
                  Se connecter
                </button>
              </p>
            )}
            <Menu client={client} guest={!me} initialCode={initialCode} onGame={setGame} />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Menu

function Menu({ client, guest, initialCode, onGame }: { client: AccountClient; guest: boolean; initialCode?: string; onGame: (g: TbGameDto) => void }) {
  const [level, setLevel] = useState<AiLevel>('intermediate');
  const [nick, setNick] = useState(() => readStore(NICK_KEY));
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState<{ code: string; mode: string } | null>(null);
  const [history, setHistory] = useState<TbHistoryEntry[]>([]);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let off = false;
    client.tbActive().then((a) => !off && setActive(a)).catch(() => undefined);
    client.tbHistory().then((h) => !off && setHistory(h)).catch(() => undefined);
    return () => {
      off = true;
    };
  }, [client]);

  const run = async (f: () => Promise<TbGameDto>) => {
    setBusy(true);
    setError('');
    try {
      if (guest && nick.trim()) writeStore(NICK_KEY, nick.trim());
      onGame(await f());
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const nickname = guest && nick.trim() ? nick.trim() : undefined;
  const wins = history.filter((h) => h.outcome === 'win').length;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-gold-500/40 bg-gradient-to-br from-felt-800 via-felt-900 to-ink-900 p-5">
        <Eyebrow>Variante</Eyebrow>
        <h1 className="mt-1 font-display text-3xl text-ivory-50 sm:text-4xl">Le Tableau</h1>
        <p className="mt-2 max-w-xl text-sm text-ivory-200/90">
          Deux joueurs, cinq colonnes de cinq cartes. À chaque tour, vous piochez une carte et la posez définitivement dans l’une de vos colonnes. Chaque colonne est ensuite comparée à celle de l’adversaire : trois colonnes gagnées suffisent pour l’emporter. Pas de mise, pas de bluff : tout se joue dans le placement.
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => setHelp(true)}>
          Règles et combinaisons
        </Button>
      </section>

      {active && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 border-gold-400/60 p-4">
          <p className="text-sm text-ivory-100">
            Une partie {active.mode === 'training' ? 'd’entraînement' : 'amicale'} est en cours <span className="font-semibold text-gold-300">({active.code})</span>.
          </p>
          <Button disabled={busy} onClick={() => void run(() => client.tbGet(active.code))}>
            Reprendre la partie
          </Button>
        </Panel>
      )}

      {guest && (
        <div className="max-w-xs">
          <label htmlFor="tb-nick" className="mb-1 block text-sm font-medium text-ivory-100">
            Votre nom
          </label>
          <input id="tb-nick" className={inputClass} value={nick} maxLength={20} placeholder="Invité" onChange={(e) => setNick(e.target.value)} />
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-ruby-500/50 bg-ruby-950/60 px-4 py-2.5 text-sm text-ruby-100">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel className="p-5">
          <h2 className="font-display text-xl text-ivory-50">Entraînement</h2>
          <p className="mt-1 text-sm text-ivory-200/85">Une partie contre l’ordinateur, sans enjeu, avec conseils de placement.</p>
          <div className="mt-3">
            <Segmented value={level} options={LEVELS.map((l) => l.id)} format={(id) => levelLabel(id)} onChange={setLevel} label="Niveau de l’adversaire" />
          </div>
          <p className="mt-2 min-h-[2.5rem] text-xs text-ivory-300/80">{LEVELS.find((l) => l.id === level)?.text}</p>
          <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(() => client.tbCreate({ mode: 'training', level, nickname }))}>
            Lancer l’entraînement
          </Button>
        </Panel>

        <Panel className="p-5">
          <h2 className="font-display text-xl text-ivory-50">Partie amicale</h2>
          <p className="mt-1 text-sm text-ivory-200/85">Un code ou un lien à envoyer à un ami. Aucune incidence sur un classement.</p>
          <Button className="mt-3 w-full" variant="secondary" disabled={busy} onClick={() => void run(() => client.tbCreate({ mode: 'friendly', nickname }))}>
            Créer une partie privée
          </Button>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void run(() => client.tbJoin(code.trim().toUpperCase(), nickname));
            }}
          >
            <label htmlFor="tb-code" className="sr-only">
              Code de la partie
            </label>
            <input id="tb-code" className={inputClass} value={code} placeholder="TB-XXXX" maxLength={8} autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <Button type="submit" disabled={busy || !code.trim()}>
              Rejoindre
            </Button>
          </form>
        </Panel>

        <Panel className="border-dashed p-5 opacity-80">
          <h2 className="font-display text-xl text-ivory-50">
            Classé <Badge tone="amber">à venir</Badge>
          </h2>
          <p className="mt-1 text-sm text-ivory-200/85">Affrontements contre de vrais joueurs, points de classement et onze ligues. Disponible à la prochaine étape.</p>
        </Panel>
        <Panel className="border-dashed p-5 opacity-80">
          <h2 className="font-display text-xl text-ivory-50">
            Tournois <Badge tone="amber">à venir</Badge>
          </h2>
          <p className="mt-1 text-sm text-ivory-200/85">Tableaux à élimination ou à points, classement final et récompenses virtuelles.</p>
        </Panel>
      </div>

      {history.length > 0 && (
        <Panel className="p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl text-ivory-50">Mes dernières parties</h2>
            <p className="text-xs text-ivory-300/80">
              {wins} victoire{wins > 1 ? 's' : ''} sur {history.length}
            </p>
          </div>
          <ul className="mt-2 divide-y divide-ivory-100/10">
            {history.slice(0, 8).map((h) => (
              <li key={h.code} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 truncate text-ivory-100">
                  {h.mode === 'training' ? 'Entraînement' : 'Amical'} · {h.opponent}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-ivory-300">
                    {h.score[0]}–{h.score[1]}
                  </span>
                  <Badge tone={h.outcome === 'win' ? 'green' : h.outcome === 'loss' ? 'red' : 'amber'}>{outcomeWord(h.outcome)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {help && <HelpModal onClose={() => setHelp(false)} />}
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Règles du Tableau" onClose={onClose} wide>
      <h2 className="font-display text-2xl text-ivory-50">Règles du Tableau</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ivory-100">
        <li>Chaque joueur reçoit 5 cartes (une par colonne) et un paquet personnel de 21 cartes ; aucune carte n’existe en double.</li>
        <li>À votre tour, la carte du dessus de votre paquet apparaît : vous avez 30 secondes pour la poser dans une colonne qui n’est pas pleine.</li>
        <li>Le placement est définitif. Passé le délai, la carte est posée automatiquement dans la première colonne libre.</li>
        <li>Il y a 20 places libres pour 21 cartes : on ne défausse jamais, et la dernière carte du paquet n’est pas jouée.</li>
        <li>À la fin, les colonnes se comparent deux à deux (I contre I, II contre II…). Trois colonnes gagnées font gagner la partie ; 2–2 avec une égalité est un match nul.</li>
        <li>Les couleurs de cartes ne départagent jamais deux mains égales.</li>
      </ul>
      <h3 className="mt-4 font-display text-lg text-ivory-50">Les dix combinaisons, de la plus faible à la plus forte</h3>
      <ol className="mt-2 space-y-2">
        {COMBOS.map((c, i) => (
          <li key={c.name} className="flex items-center gap-3 rounded-xl bg-ink-900/60 p-2">
            <span className="w-5 shrink-0 text-center text-xs text-ivory-300/70">{i + 1}</span>
            <span className="flex shrink-0 gap-0.5" aria-hidden="true">
              {c.example.split(' ').map((k) => (
                <PlayingCard key={k} code={k} size="xs" />
              ))}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-gold-300">{c.name}</span>
              <span className="block text-xs text-ivory-200/85">{c.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button className="mt-4 w-full" onClick={onClose}>
        Fermer
      </Button>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Partie

function GameScreen({ client, initial, onExit }: { client: AccountClient; initial: TbGameDto; onExit: () => void }) {
  const { fourColor, cardBack, sound } = useSettings();
  const snd = useSound(sound);
  const [dto, setDto] = useState(initial);
  const skew = useRef(clockSkew(initial));
  const latest = useRef(initial);
  const [left, setLeft] = useState(() => secondsLeft(initial, skew.current));
  const [pending, setPending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advice, setAdvice] = useState<{ col: number; text: string } | null>(null);
  const [confirm, setConfirm] = useState(() => (readStore(CONFIRM_KEY) ? readStore(CONFIRM_KEY) === '1' : typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches));
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const apply = useCallback((d: TbGameDto) => {
    if (d.code !== latest.current.code || d.version < latest.current.version) return;
    latest.current = d;
    skew.current = clockSkew(d);
    setDto(d);
  }, []);

  const view = dto.view;
  const you = dto.you;
  const opp = (1 - you) as 0 | 1;
  const myTurn = dto.status === 'playing' && view?.turn === you && !dto.paused;

  // Sondage : serré quand on attend l'adversaire, plus lent pendant notre tour.
  useEffect(() => {
    if (dto.status === 'finished') return;
    let off = false;
    const poll = () =>
      client
        .tbGet(dto.code)
        .then((d) => !off && apply(d))
        .catch((e) => !off && setError(errText(e)));
    const id = setInterval(poll, myTurn ? 2500 : 1000);
    return () => {
      off = true;
      clearInterval(id);
    };
  }, [client, dto.code, dto.status, myTurn, apply]);

  // Compte à rebours local, recalé sur l'horloge du serveur.
  useEffect(() => {
    setLeft(secondsLeft(dto, skew.current));
    if (dto.deadline === null) return;
    const id = setInterval(() => setLeft(secondsLeft(latest.current, skew.current)), 250);
    return () => clearInterval(id);
  }, [dto]);

  // Sons et réinitialisations à chaque évolution de la partie.
  const seenPly = useRef(view?.ply ?? 0);
  const wasMyTurn = useRef(myTurn);
  const wasStatus = useRef(dto.status);
  useEffect(() => {
    if (view && view.ply !== seenPly.current) {
      if (dto.lastMove && dto.lastMove.seat !== you) snd.play('select');
      seenPly.current = view.ply;
      setPending(null);
      setAdvice(null);
    }
    if (myTurn && !wasMyTurn.current) {
      snd.play('yourTurn');
      snd.buzz(40);
    }
    wasMyTurn.current = myTurn;
    if (dto.status === 'finished' && wasStatus.current !== 'finished') snd.play(dto.winner === you ? 'win' : 'error');
    wasStatus.current = dto.status;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dto]);

  const place = async (col: number) => {
    if (!myTurn || busy) return;
    if (confirm && pending !== col) {
      setPending(col);
      snd.play('select');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const d = await client.tbPlace(dto.code, col);
      snd.play('confirm');
      apply(d);
      setPending(null);
      setAdvice(null);
    } catch (e) {
      setError(errText(e));
      snd.play('error');
      client.tbGet(dto.code).then(apply).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const toggleConfirm = (v: boolean) => {
    setConfirm(v);
    setPending(null);
    writeStore(CONFIRM_KEY, v ? '1' : '0');
  };

  const leave = async () => {
    try {
      await client.tbLeave(dto.code);
    } catch {
      /* déjà terminée ou supprimée */
    }
    onExit();
  };

  // ----- Salle d'attente (partie amicale) -----
  if (dto.status === 'waiting' || !view) {
    const url = inviteUrl(dto.code);
    return (
      <Panel className="mx-auto max-w-md p-6 text-center">
        <Eyebrow>Partie amicale</Eyebrow>
        <h1 className="mt-1 font-display text-2xl text-ivory-50">En attente de votre ami</h1>
        <p className="mt-3 text-sm text-ivory-200/90">Envoyez-lui ce code, ou le lien d’invitation :</p>
        <p className="my-3 font-display text-4xl tracking-[0.2em] text-gold-300" data-testid="tb-code">
          {dto.code}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => undefined);
            }}
          >
            {copied ? 'Lien copié' : 'Copier le lien'}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button variant="secondary" onClick={() => void navigator.share({ title: 'Le Tableau', text: `Rejoins ma partie du Tableau : ${dto.code}`, url }).catch(() => undefined)}>
              Partager
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-ivory-300/80">La partie démarre dès l’arrivée de votre ami. Elle est conservée une heure.</p>
        <Button variant="ghost" className="mt-3" onClick={() => void leave()}>
          Annuler la partie
        </Button>
        {error && <p role="alert" className="mt-2 text-sm text-ruby-300">{error}</p>}
      </Panel>
    );
  }

  const finished = dto.status === 'finished';
  const look = { fourColor, back: cardBack };
  const opponent = dto.players[opp];
  const mine = dto.players[you];
  const score = view.provisional.score;
  const myScore = you === 0 ? score[0] : score[1];
  const theirScore = you === 0 ? score[1] : score[0];
  const lastMove = dto.lastMove;
  const outcome = dto.winner === null ? 'draw' : dto.winner === you ? 'win' : 'loss';

  return (
    <div className="space-y-3">
      <p className="sr-only" role="status" aria-live="polite">
        {announce(dto)}
      </p>

      {/* Adversaire */}
      <PlayerBar name={opponent?.nickname ?? 'Adversaire'} avatar={opponent?.avatar ?? null} badge={opponent?.kind === 'cpu' ? `Niveau ${levelLabel(opponent.level)}` : 'Ami · partie amicale'} remaining={view.remaining[opp]} score={theirScore} active={view.turn === opp} />

      <Board dto={dto} seat={opp} side="theirs" look={look} owner={opponent?.nickname ?? 'Adversaire'} selectable={false} pending={null} onPick={() => undefined} />

      {/* Bande centrale */}
      <div className="rounded-2xl border border-gold-500/25 bg-felt-900/70 p-3">
        <VerdictRow verdicts={dto.verdicts} you={you} final={finished} />
        {!finished ? (
          <div className="mt-3 flex items-center justify-center gap-4">
            {dto.deadline !== null && myTurn ? <CountdownRing secondsLeft={left} total={dto.turnMs / 1000} label="Temps pour placer votre carte" /> : <span className="w-14" aria-hidden="true" />}
            <div className="flex min-h-[7.2rem] min-w-[5.5rem] items-center justify-center" data-testid="tb-drawn">
              {myTurn && view.yourCard ? (
                <PlayingCard code={view.yourCard} size="lg" fourColor={fourColor} highlight selected={pending !== null} hint="Carte à placer" />
              ) : (
                <PlayingCard code={null} size="lg" back={cardBack} dimmed />
              )}
            </div>
            <div className="w-28 text-sm leading-snug text-ivory-100" aria-live="polite">
              {dto.paused ? (
                <span className="text-amber-200">Partie en pause. Jouez pour reprendre.</span>
              ) : myTurn ? (
                <span className="font-semibold text-gold-200">{confirm ? 'Touchez une colonne, puis confirmez.' : 'Touchez une colonne pour poser la carte.'}</span>
              ) : (
                <span className="text-ivory-300">{opponent?.kind === 'cpu' ? `${opponent.nickname.split(' ')[0]} réfléchit…` : 'Votre adversaire joue…'}</span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center text-sm text-ivory-200">Partie terminée</p>
        )}
        {myTurn && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {pending !== null && (
              <Button disabled={busy} onClick={() => void place(pending)}>
                Poser en colonne {ROMAN[pending]}
              </Button>
            )}
            {dto.mode === 'training' && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void client
                    .tbAdvice(dto.code)
                    .then(setAdvice)
                    .catch((e) => setError(errText(e)))
                }
              >
                Conseil
              </Button>
            )}
          </div>
        )}
        {advice && (
          <p className="mt-2 rounded-xl bg-gold-500/15 px-3 py-2 text-center text-sm text-gold-100" role="note">
            {advice.text}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-center text-sm text-ruby-300">
            {error}
          </p>
        )}
        {lastMove?.auto && !finished && <p className="mt-2 text-center text-xs text-amber-200">Délai dépassé : la dernière carte de {lastMove.seat === you ? 'votre côté' : 'l’adversaire'} a été posée automatiquement.</p>}
      </div>

      {/* Vous */}
      <Board dto={dto} seat={you} side="mine" look={look} owner="Vous" selectable={myTurn && !busy} pending={pending} onPick={(c) => void place(c)} />
      <PlayerBar name={mine?.nickname ?? 'Vous'} avatar={mine?.avatar ?? null} badge="Vous" remaining={view.remaining[you]} score={myScore} active={myTurn} />

      {finished ? (
        <Finished dto={dto} outcome={outcome} onExit={onExit} onAgain={dto.mode === 'training' ? () => client.tbCreate({ mode: 'training', level: (dto.players[opp]?.level ?? 'intermediate') as AiLevel }).then((d) => { latest.current = d; skew.current = clockSkew(d); seenPly.current = 0; setDto(d); setError(''); }).catch((e) => setError(errText(e))) : undefined} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-ivory-200">
            <input type="checkbox" checked={confirm} onChange={(e) => toggleConfirm(e.target.checked)} className="h-4 w-4 accent-[#c9a25a]" />
            Confirmer chaque placement
          </label>
          <Button variant="ghost" onClick={() => setLeaving(true)}>
            Quitter la partie
          </Button>
        </div>
      )}

      {leaving && (
        <Modal title="Quitter la partie" onClose={() => setLeaving(false)}>
          <h2 className="font-display text-xl text-ivory-50">Quitter la partie ?</h2>
          <p className="mt-2 text-sm text-ivory-200">{dto.mode === 'friendly' ? 'La partie amicale sera perdue par forfait.' : 'La partie d’entraînement sera abandonnée, sans conséquence.'}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLeaving(false)}>
              Continuer
            </Button>
            <Button className="flex-1" onClick={() => void leave()}>
              Quitter
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PlayerBar({ name, avatar, badge, remaining, score, active }: { name: string; avatar: string | null; badge: string; remaining: number; score: number; active: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${active ? 'border-gold-400/70 bg-gold-500/10' : 'border-ivory-100/10 bg-ink-800/70'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Avatar nickname={name} avatar={avatar} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ivory-50">{name}</p>
          <Badge tone={active ? 'gold' : 'neutral'}>{badge}</Badge>
        </div>
      </div>
      <dl className="flex shrink-0 gap-4 text-center">
        <div>
          <dt className="text-[10px] text-ivory-300/80">Cartes à jouer</dt>
          <dd className="font-display text-lg tabular-nums text-ivory-50" data-testid="tb-remaining">
            {remaining}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-ivory-300/80">Colonnes</dt>
          <dd className="font-display text-lg tabular-nums text-gold-300">{score}</dd>
        </div>
      </dl>
    </div>
  );
}

function Board({ dto, seat, side, look, owner, selectable, pending, onPick }: { dto: TbGameDto; seat: 0 | 1; side: 'mine' | 'theirs'; look: { fourColor: boolean; back: 'losange' | 'rayures' | 'etoile' }; owner: string; selectable: boolean; pending: number | null; onPick: (c: number) => void }) {
  const view = dto.view!;
  const cols = view.columns[seat]!;
  const labels = dto.labels?.[seat] ?? [];
  const finished = dto.status === 'finished';
  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-2" data-testid={`tb-board-${side}`}>
      {cols.map((cards, i) => (
        <ColumnStack
          key={i}
          index={i}
          side={side}
          cards={cards}
          label={labels[i] ?? ''}
          fresh={dto.lastMove?.seat === seat && dto.lastMove.col === i}
          selectable={selectable && view.legal.includes(i)}
          pending={pending === i}
          onPick={() => onPick(i)}
          forming={finished ? dto.made?.[seat]?.[i]?.forming : undefined}
          look={look}
          owner={owner}
        />
      ))}
    </div>
  );
}

function Finished({ dto, outcome, onExit, onAgain }: { dto: TbGameDto; outcome: 'win' | 'loss' | 'draw'; onExit: () => void; onAgain?: () => void }) {
  const you = dto.you;
  const r = dto.result;
  const [check, setCheck] = useState<'idle' | 'ok' | 'ko' | 'na'>('idle');
  const verify = async () => {
    try {
      const data = new TextEncoder().encode(`flashpoker-tableau-v1:commit:${dto.reveal!.seed}`);
      const buf = await crypto.subtle.digest('SHA-256', data);
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      setCheck(hex === dto.commitment ? 'ok' : 'ko');
    } catch {
      setCheck('na');
    }
  };
  const mine = r ? r.score[you] : dto.forfeit === you ? 0 : 3;
  const theirs = r ? r.score[(1 - you) as 0 | 1] : dto.forfeit === you ? 3 : 0;
  return (
    <section className="relative space-y-3 rounded-3xl border border-gold-500/40 bg-ink-800/90 p-4" aria-label="Résultat de la partie">
      {outcome === 'win' && <CoinRain />}
      <div className="text-center">
        <Eyebrow>Fin de partie</Eyebrow>
        <h2 className="mt-1 font-display text-3xl text-ivory-50" data-testid="tb-outcome">
          {outcome === 'win' ? 'Victoire' : outcome === 'loss' ? 'Défaite' : 'Match nul'}
        </h2>
        <p className="mt-1 text-lg tabular-nums text-gold-300">
          {mine} – {theirs}
          {r && r.ties > 0 ? <span className="ml-2 text-sm text-ivory-300">({r.ties} égalité{r.ties > 1 ? 's' : ''})</span> : null}
        </p>
        {dto.forfeit !== null && <p className="mt-1 text-sm text-ivory-200">{dto.forfeit === you ? 'Vous avez abandonné la partie.' : 'Votre adversaire a quitté la partie.'}</p>}
      </div>
      <ResultsTable dto={dto} />
      <details className="rounded-xl bg-ink-900/60 p-3 text-xs text-ivory-200">
        <summary className="cursor-pointer font-semibold text-ivory-100">Vérifier l’équité du mélange</summary>
        <p className="mt-2">Avant la première carte, le serveur a publié l’empreinte de sa graine aléatoire. La graine est maintenant révélée : vous pouvez contrôler qu’elle correspond, et recalculer l’ordre des 52 cartes.</p>
        <p className="mt-2 break-all">Empreinte publiée : <code>{dto.commitment}</code></p>
        <p className="mt-1 break-all">Graine : <code>{dto.reveal?.seed}</code></p>
        <p className="mt-1 break-all">Ordre : <code>{dto.reveal?.order.join(' ')}</code></p>
        <Button variant="secondary" className="mt-2" onClick={() => void verify()}>
          Contrôler l’empreinte
        </Button>
        {check === 'ok' && <p className="mt-1 text-jade-300" role="status">Conforme : la graine correspond à l’empreinte publiée avant la partie.</p>}
        {check === 'ko' && <p className="mt-1 text-ruby-300" role="alert">Non conforme.</p>}
        {check === 'na' && <p className="mt-1 text-amber-200" role="status">Contrôle indisponible sur ce navigateur.</p>}
      </details>
      <div className="flex flex-col gap-2 sm:flex-row">
        {onAgain && (
          <Button className="flex-1" onClick={() => void onAgain()}>
            Rejouer
          </Button>
        )}
        <Button variant="secondary" className="flex-1" onClick={onExit}>
          Retour au menu
        </Button>
      </div>
    </section>
  );
}
