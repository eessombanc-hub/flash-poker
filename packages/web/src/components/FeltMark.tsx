/** Signature gravée au centre du tapis : à peine perceptible, elle ne gêne ni les cartes ni la lecture. */
export function FeltMark() {
  return (
    <span className="felt-mark" aria-hidden="true">
      <span className="felt-mark-rule" />
      <span className="felt-mark-name">Flash Poker</span>
      <span className="felt-mark-rule" />
    </span>
  );
}
