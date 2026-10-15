// Brandrisk-OB som poster i förarens Min månad och i PDF:en (lib/ob, Skogsavtalet § 8 mom 1).
//
// Raderna går till lönen som vanliga lönerader när deras löneart har en kod (då står de redan i specens `rader`, med decimalen bredvid).
// Saknas koden visas timmarna ändå — som en post med "inte inställd" — så föraren ser att tiden finns och inte glömts. Enda OB appen räknar:
// beordrad brandriskmorgon (enkelskift på alla maskiner; kväll, lördag och söndag byggs inte).

export type BrandriskPost = {
  loneart: "brandrisk_ob" | "brandrisk_nattillagg";
  label: string;
  /** Timmar med fulla decimaler (minuter/60) — avrundas först vid visning. */
  timmar: number;
  /** Raden skickas till Fortnox (löneartens kod är kopplad) och står då redan bland specens rader. */
  skickas: boolean;
};

/**
 * Posterna som INTE redan står bland specens rader: OB alltid (som förr, också 0), nattillägget bara när det finns. Äldre svar utan
 * `brandrisk` faller tillbaka på `ob.timmar` (bara OB).
 */
export function brandriskUtanRad(spec: any): BrandriskPost[] {
  const lonerader = (spec?.lonerader || []) as { loneart: string; status: string }[];
  const skickas = (k: string) => lonerader.some(l => l.loneart === k && l.status === "skickas");
  const ob = spec?.brandrisk ? (Number(spec.brandrisk.ob_min) || 0) / 60 : Number(spec?.ob?.timmar) || 0;
  const natt = spec?.brandrisk ? (Number(spec.brandrisk.natt_min) || 0) / 60 : 0;
  const ut: BrandriskPost[] = [];
  if (!skickas("brandrisk_ob")) ut.push({ loneart: "brandrisk_ob", label: "Brandrisk – OB", timmar: ob, skickas: false });
  if (natt > 0 && !skickas("brandrisk_nattillagg")) ut.push({ loneart: "brandrisk_nattillagg", label: "Brandrisk – nattillägg", timmar: natt, skickas: false });
  return ut;
}
