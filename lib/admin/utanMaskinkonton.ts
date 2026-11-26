/** Maskinkontona (medarbetare.roll = 'maskin', t.ex. "H8E -26") är maskiner, inte personer.
 *  De ska aldrig stå i en lista över personer (ATK, anställningsnummer, utjämning …). */
export function utanMaskinkonton<T extends { roll?: string | null }>(rader: T[] | null | undefined): T[] {
  return (rader || []).filter(r => r.roll !== "maskin");
}
