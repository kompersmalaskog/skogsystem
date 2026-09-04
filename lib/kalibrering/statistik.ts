/**
 * Kravprofilens tre diametertal ur en lista avvikelser (maskin − operatör):
 *   träffprocent   — andel INOM ±tolerans          (Vida: "Träffar den rätt?")
 *   systematisk    — medelavvikelse, med tecken     (Vida: "Går den rakt?")
 *   standardavv    — populationens std (÷N)         (Vida: "Flaxar den?")
 * plus grov_avvikelse — andel ÖVER grovTolerans (Biometria).
 *
 * EN implementation. Fanns tidigare kopierad i bedomning + tradslag; ett
 * avrundningsval som glider isär mellan kopior ger två olika "sanningar" i
 * appen. Rutterna räknar, klienten (bedomProfil) färgar.
 *
 * Avvikelserna ska redan vara OMÄTT-filtrerade — se lib/kalibrering/diameterpunkter.
 */

export type VariabelStat = {
  n: number;
  traffPct: number | null;
  systematisk: number | null;
  standardavv: number | null;
  grovPct: number | null;
  tolerans: number | null;
  grovTolerans: number | null;
};

/** Populationens std (÷N — vi har hela populationen, inte ett urval). */
export function popStd(vals: number[], mean: number): number {
  if (vals.length < 2) return 0;
  const v = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
  return Math.sqrt(v);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function statistik(avvik: number[], tolerans: number | null, grovTolerans: number | null): VariabelStat {
  const n = avvik.length;
  if (n === 0) {
    return { n: 0, traffPct: null, systematisk: null, standardavv: null, grovPct: null, tolerans, grovTolerans };
  }
  const systematisk = avvik.reduce((a, b) => a + b, 0) / n;
  const standardavv = popStd(avvik, systematisk);
  const traffPct = tolerans == null ? null : (100 * avvik.filter((v) => Math.abs(v) <= tolerans).length) / n;
  const grovPct = grovTolerans == null ? null : (100 * avvik.filter((v) => Math.abs(v) > grovTolerans).length) / n;
  return {
    n,
    traffPct: traffPct == null ? null : r2(traffPct),
    systematisk: r2(systematisk),
    standardavv: r2(standardavv),
    grovPct: grovPct == null ? null : r2(grovPct),
    tolerans,
    grovTolerans,
  };
}
