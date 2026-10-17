// Brandrisk-OB som post i förarens Min månad och i PDF:en (lib/ob, Skogsavtalet § 8 mom 1).
//
// Raden går till lönen som en vanlig lönerad när lönearten har en kod (då står den redan i specens `rader`, med decimalen bredvid).
// Saknas koden visas timmarna ändå — som en post med "inte inställd" — så föraren ser att tiden finns och inte glömts. EN rad, enda OB appen räknar:
// beordrad brandriskmorgon (enkelskift på alla maskiner; kväll, lördag och söndag byggs inte).

export type BrandriskPost = {
  loneart: "brandrisk_ob";
  label: string;
  /** Timmar med fulla decimaler (minuter/60) — avrundas först vid visning. */
  timmar: number;
  /** Raden skickas till Fortnox (löneartens kod är kopplad) och står då redan bland specens rader. */
  skickas: boolean;
};

/**
 * Posten som INTE redan står bland specens rader: OB alltid (som förr, också 0). Äldre svar utan `brandrisk` faller tillbaka på `ob.timmar`.
 */
export function brandriskUtanRad(spec: any): BrandriskPost[] {
  const lonerader = (spec?.lonerader || []) as { loneart: string; status: string }[];
  const skickas = (k: string) => lonerader.some(l => l.loneart === k && l.status === "skickas");
  const ob = spec?.brandrisk ? (Number(spec.brandrisk.ob_min) || 0) / 60 : Number(spec?.ob?.timmar) || 0;
  const ut: BrandriskPost[] = [];
  if (!skickas("brandrisk_ob")) ut.push({ loneart: "brandrisk_ob", label: "Brandrisk – OB", timmar: ob, skickas: false });
  return ut;
}
