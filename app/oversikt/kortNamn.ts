// KORTA NAMN på kartan och i maskin-arket (Martin 2026-11-06: "så ett barn förstår direkt"). "Lidhem rp 2025 Britteberg" → "Lidhem Britteberg",
// "Bondeskog AU 2026" → "Bondeskog", "Arvidstorp RP J-Hus -25" → "Arvidstorp". Bort tas bara det som är bokföring, inte plats:
// RP/AU, årtal, "-25", "J-Hus". Hela namnet står när man öppnar trakten.
// Får två trakter samma korta namn i samma lista står HELA namnet för båda — ett kort namn får aldrig peka på två trakter.

const BORT = [/^(rp|au)$/i, /^(19|20)\d{2}$/, /^-\d{2}$/, /^j-hus$/i];

export function kortNamn(namn: string): string {
  const ord = namn.trim().split(/\s+/).filter((o) => !BORT.some((r) => r.test(o)));
  const kort = ord.join(' ').trim();
  return kort || namn.trim();
}

/** Korta namn för en lista: krockar två, står hela namnet för båda. */
export function kortaNamn(namn: readonly string[]): string[] {
  const korta = namn.map(kortNamn);
  const antal = new Map<string, number>();
  for (const k of korta) antal.set(k.toLowerCase(), (antal.get(k.toLowerCase()) ?? 0) + 1);
  return korta.map((k, i) => ((antal.get(k.toLowerCase()) ?? 0) > 1 ? namn[i].trim() : k));
}
