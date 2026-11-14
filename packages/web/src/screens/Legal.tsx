import type { ReactNode } from 'react';
import { Button, Eyebrow, Panel, Title } from '../components/ui';
import { useI18n } from '../i18n';
import { LEGAL, LEGAL_HASH, LEGAL_PAGES, type LegalPage } from '../legal/config';

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-7 font-display text-lg text-gold-300">{children}</h3>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-ivory-100/90">{children}</p>;
}
function Li({ children }: { children: ReactNode }) {
  return <li className="ml-5 list-disc text-sm leading-relaxed text-ivory-100/90">{children}</li>;
}
const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className="text-gold-300 underline-offset-4 hover:underline">
    {children}
  </a>
);
function Contact() {
  return LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`} className="text-gold-300 underline-offset-4 hover:underline">{LEGAL.contactEmail}</a> : <span>la messagerie de l’éditeur</span>;
}

function Mentions() {
  return (
    <>
      <H>Éditeur et directeur de la publication</H>
      <P>
        Le site {LEGAL.siteName} ({LEGAL.siteUrl.replace('https://', '')}) est édité à titre non professionnel par {LEGAL.publisher}, personne physique, qui en assure aussi la direction de la publication.
        {LEGAL.contactEmail ? <> Contact : <Contact />.</> : null}
      </P>
      <H>Hébergement</H>
      <ul className="mt-2 space-y-2">
        {LEGAL.hosts.map((h) => (
          <Li key={h.name}>
            {h.role} : <A href={h.url}>{h.name}</A>, {h.address}.
          </Li>
        ))}
      </ul>
      <P>
        Nom de domaine : <A href={LEGAL.registrar.url}>{LEGAL.registrar.name}</A>, {LEGAL.registrar.address}. Envoi des courriels de service (réinitialisation du mot de passe, invitations) : <A href={LEGAL.mailer.url}>{LEGAL.mailer.name}</A>.
      </P>
      <H>Nature du service</H>
      <P>
        {LEGAL.siteName} est un jeu gratuit, sans publicité et sans vente. Les jetons sont purement virtuels : ils n’ont aucune valeur monétaire, ne peuvent être ni achetés ni échangés contre de l’argent ou un lot, et aucun gain d’argent n’est possible. Le service ne constitue pas un jeu d’argent et de hasard au sens de la loi.
      </P>
      <H>Disponibilité</H>
      <P>
        Le service est proposé tel quel, sans garantie de disponibilité continue. Il peut être interrompu pour maintenance, évolution ou en cas de défaillance de l’un des hébergeurs ci-dessus. Les jetons, niveaux et récompenses sont des éléments de jeu, sans engagement de conservation en cas d’arrêt du service.
      </P>
      <H>Propriété intellectuelle</H>
      <P>
        Le nom, l’identité visuelle, les textes, les illustrations, le code et le design du site sont protégés. Toute reproduction ou réutilisation sans autorisation écrite de l’éditeur est interdite, hors citation courte à titre d’information. Les pseudonymes et avatars créés par les joueurs restent leur propriété ; ils autorisent seulement leur affichage dans le jeu.
      </P>
      <H>Contenus des joueurs et signalement</H>
      <P>
        Les pseudonymes, avatars et messages doivent respecter la loi et les autres joueurs. L’éditeur peut retirer un contenu manifestement illicite ou abusif et suspendre un compte. Pour signaler un contenu, écrivez à <Contact />.
      </P>
      <H>Droit applicable</H>
      <P>Le site est soumis au droit français. À défaut de règlement amiable, les tribunaux français sont compétents, sous réserve des règles protégeant les consommateurs.</P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <P>
        Cette politique explique quelles données {LEGAL.siteName} recueille, pourquoi, combien de temps elles sont conservées et comment exercer vos droits, conformément au règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.
      </P>
      <H>Responsable du traitement</H>
      <P>{LEGAL.publisher}, éditeur du site (voir les mentions légales). {LEGAL.contactEmail ? <>Contact : <Contact />.</> : null}</P>
      <H>Données recueillies et finalités</H>
      <ul className="mt-2 space-y-2">
        <Li>
          <strong>Compte (facultatif).</strong> Pseudonyme, adresse électronique, avatar, empreinte de votre mot de passe (jamais le mot de passe lui-même) et empreinte du code de récupération. Elles servent à vous connecter, à récupérer votre accès et à vous identifier à la table. Base légale : exécution du service que vous demandez.
        </Li>
        <Li>
          <strong>Progression et historique de jeu.</strong> Parties, mains, résultats, niveaux, points d’expérience, hauts faits, classements, récompenses équipées, jetons virtuels. Ils alimentent les classements, les saisons et l’affichage de vos récompenses aux tables. Base légale : exécution du service.
        </Li>
        <Li>
          <strong>Club (facultatif).</strong> Le nom du club que vous indiquez dans votre profil s’affiche publiquement à côté de votre pseudonyme dans les classements, et sert à classer les clubs entre eux. Laissez le champ vide pour ne rien afficher, ou effacez-le à tout moment. Ne saisissez pas de nom qui permettrait d’identifier un tiers sans son accord.
        </Li>
        <Li>
          <strong>Courriels de service.</strong> Lien de réinitialisation du mot de passe et, si vous l’avez activé dans votre profil, notifications de jeu. Les notifications reposent sur votre consentement, que vous pouvez retirer à tout moment dans votre profil.
        </Li>
        <Li>
          <strong>Invitations.</strong> Si vous invitez un proche, son adresse électronique est utilisée pour lui envoyer l’invitation et en limiter la fréquence. Ne saisissez que l’adresse de personnes qui acceptent d’être invitées.
        </Li>
        <Li>
          <strong>Messages « Un bug ? ».</strong> Le texte que vous envoyez, votre adresse électronique si vous choisissez de l’indiquer, l’écran affiché et le type d’appareil. Si vous êtes connecté, le message est rattaché à votre pseudonyme. Ces informations servent à corriger le défaut ou à vous répondre. Elles sont conservées le temps du traitement, puis supprimées, et disparaissent avec votre compte. Évitez d’y mentionner des informations sensibles. Base légale : intérêt légitime d’amélioration du service.
        </Li>
        <Li>
          <strong>Discussions.</strong> Les messages du salon d’accueil et des tables ne sont pas archivés dans la base des comptes. Ils sont tenus en mémoire pour la durée de la partie ou du salon, et un message contraire aux règles peut être masqué par la modération automatique.
        </Li>
        <Li>
          <strong>Données techniques.</strong> Votre adresse IP est utilisée par le serveur pour limiter les abus (nombre de requêtes) et peut apparaître dans les journaux techniques de l’hébergeur. Les erreurs du navigateur sont signalées au serveur sans donnée personnelle (message d’erreur et page concernée). Base légale : intérêt légitime de sécurité et de bon fonctionnement du service.
        </Li>
      </ul>
      <P>Vous pouvez jouer sans compte : la progression reste alors dans le navigateur de votre appareil, sans être transmise au serveur sous forme de compte.</P>
      <H>Ce que nous ne faisons pas</H>
      <P>Aucune publicité, aucun suivi d’audience, aucun profilage, aucune revente ni cession de vos données.</P>
      <H>Durées de conservation</H>
      <ul className="mt-2 space-y-2">
        <Li>Compte et progression : jusqu’à la suppression du compte, que vous pouvez faire vous-même dans votre espace (rubrique profil). Elle efface le compte et les données qui lui sont rattachées.</Li>
        <Li>Sessions de connexion : 30 jours, ou jusqu’à votre déconnexion.</Li>
        <Li>Liens de réinitialisation du mot de passe : durée courte, puis supprimés.</Li>
        <Li>Sauvegardes : la base des comptes est sauvegardée régulièrement, sous forme chiffrée, dans un dépôt privé. Une donnée supprimée peut subsister dans les sauvegardes antérieures, qui restent chiffrées et inaccessibles à des tiers, jusqu’à leur purge périodique par l’éditeur.</Li>
      </ul>
      <H>Destinataires et transferts hors de l’Union européenne</H>
      <P>
        Seul l’éditeur accède aux données. Elles sont traitées pour son compte par les prestataires techniques cités dans les mentions légales : {LEGAL.hosts.map((h) => h.name).join(' et ')} (hébergement), {LEGAL.mailer.name} (envoi des courriels), {LEGAL.backup.name} (stockage des sauvegardes chiffrées) et {LEGAL.registrar.name} (nom de domaine). Plusieurs de ces prestataires sont établis aux États-Unis : les transferts sont encadrés par les garanties prévues par le RGPD (décision d’adéquation ou clauses contractuelles types).
      </P>
      <H>Vos droits</H>
      <P>
        Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité, ainsi que du droit de retirer votre consentement et de définir des directives sur le sort de vos données après votre décès. Vous pouvez modifier votre pseudonyme, votre avatar, votre club, votre adresse et votre mot de passe, télécharger une copie de vos données ou supprimer votre compte, depuis votre espace. Pour tout autre droit, écrivez à <Contact /> ; une réponse vous est donnée dans un délai d’un mois. Une pièce justifiant de votre identité peut être demandée en cas de doute.
      </P>
      <P>
        Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez saisir la CNIL : <A href="https://www.cnil.fr/fr/plaintes">cnil.fr/fr/plaintes</A>, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.
      </P>
      <H>Sécurité</H>
      <P>Les échanges sont chiffrés (HTTPS). Les mots de passe sont protégés par une empreinte lente (scrypt) et ne sont jamais conservés en clair. Les sauvegardes sont chiffrées. Aucun système n’étant infaillible, l’éditeur vous avertira, ainsi que la CNIL si la loi l’exige, en cas de violation de données présentant un risque.</P>
    </>
  );
}

function Cookies() {
  return (
    <>
      <P>
        {LEGAL.siteName} ne dépose aucun cookie de mesure d’audience, de publicité ou de suivi, et n’intègre aucun service tiers de ce type. Aucun bandeau de consentement n’est donc nécessaire.
      </P>
      <H>Stockage local de votre navigateur</H>
      <P>Le site utilise le stockage local de votre navigateur (« localStorage »), uniquement pour son bon fonctionnement. Ces données restent sur votre appareil. Elles ne sont pas des traceurs au sens de la réglementation, car elles sont strictement nécessaires au service que vous demandez.</P>
      <ul className="mt-2 space-y-2">
        <Li>Votre session de connexion, pour vous éviter de saisir vos identifiants à chaque visite.</Li>
        <Li>Vos préférences : langue, couleur du tapis, dos de carte, sons, accessibilité, vitesse des animations, options du Blackjack.</Li>
        <Li>Le pseudonyme que vous avez utilisé pour discuter ou rejoindre une table, et le code des tables en cours pour vous y ramener après un rechargement.</Li>
        <Li>Pour un joueur sans compte, sa progression au Blackjack sur cet appareil.</Li>
        <Li>L’indication que le tour guidé d’accueil a déjà été montré.</Li>
      </ul>
      <H>Les effacer</H>
      <P>Vous pouvez vous déconnecter depuis votre espace, ou effacer les données du site depuis les réglages de votre navigateur. Vous perdrez alors vos préférences et, pour un joueur sans compte, sa progression locale.</P>
      <H>Hébergeurs</H>
      <P>Les hébergeurs peuvent enregistrer des journaux techniques (adresse IP, date, page demandée) pour assurer la sécurité et le fonctionnement de leurs serveurs. Voir la politique de confidentialité.</P>
    </>
  );
}

const TITLE: Record<LegalPage, string> = { mentions: 'Mentions légales', privacy: 'Politique de confidentialité', cookies: 'Cookies et stockage local' };

export function LegalScreen({ page, onPage, onBack }: { page: LegalPage; onPage: (p: LegalPage) => void; onBack: () => void }) {
  const { t, lang } = useI18n();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-1 py-4">
      <Button variant="secondary" onClick={onBack}>{t('legal.retour')}</Button>
      <Panel className="p-5 sm:p-8">
        <Eyebrow>{LEGAL.siteName}</Eyebrow>
        <Title className="mt-1">{TITLE[page]}</Title>
        <nav aria-label={t('legal.nav')} className="mt-4 mb-2 flex flex-wrap gap-2">
          {LEGAL_PAGES.map((p) => (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => { onPage(p); window.history.replaceState(null, '', LEGAL_HASH[p]); }}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 ${p === page ? 'border-gold-400 bg-gold-500/15 text-gold-200' : 'border-ivory-100/15 text-ivory-200 hover:border-gold-500/50'}`}
            >
              {TITLE[p]}
            </button>
          ))}
        </nav>
        {lang !== 'fr' && <p className="mt-4 rounded-lg border border-ivory-100/15 bg-black/20 px-3 py-2 text-xs text-ivory-200">{t('legal.fr_only')}</p>}
        <div lang="fr">
          {page === 'mentions' && <Mentions />}
          {page === 'privacy' && <Privacy />}
          {page === 'cookies' && <Cookies />}
          <p className="mt-8 text-xs text-ivory-300/70">Dernière mise à jour : {LEGAL.updatedAt}.</p>
        </div>
      </Panel>
    </div>
  );
}
