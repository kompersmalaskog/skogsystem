// ─────────────────────────────────────────────────────────────
// Delad OB-logik — obekväm tid vid BRANDRISK-beordrad tidig start. OB betalas BARA
// när den tidiga starten var beordrad pga brandrisk; alla andra tidiga starter är
// förarens eget val på egen maskin → ingen OB, oavsett klockslag. Samma klockslag
// ger alltså OB eller inte beroende på svaret (arbetsdag.brandrisk_beordrad) — det
// går inte att läsa ur tiden.
//
// Bara VARDAGSMORGON: OB-timmar = start_tid → 06:30. Ingen helg, ingen kväll efter
// 17:00, inga kronor (Fortnox äger satsen ob_kvall_kr). OB-timmarna LAGRAS aldrig —
// härleds här ur (start_tid, brandrisk_beordrad) så förarkort, admin och framtida
// export räknar lika. Ren funktion, ingen I/O.
// ─────────────────────────────────────────────────────────────

const FRAGE_TROSKEL_MIN = 5 * 60 + 30;  // 05:30 — frågan visas bara för start FÖRE denna
const OB_MORGON_SLUT_MIN = 6 * 60 + 30; // 06:30 — obekväm tid slutar här på morgonen

const tMin = (t: string | null | undefined): number => {
  const m = String(t || '').match(/(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : -1;
};

/** Måndag–fredag. Lokal middag → immun mot tidszons-kanten. */
export function arVardag(datum: string): boolean {
  const d = new Date(`${datum}T12:00:00`).getDay(); // 0=sön .. 6=lör
  return d >= 1 && d <= 5;
}

export type ObDag = { datum: string; start_tid: string | null; brandrisk_beordrad: boolean | null };

/** OB-minuter: bara vardag + brandrisk_beordrad=true → 06:30 − start_tid (aldrig < 0). */
export function obMinuter(dag: ObDag): number {
  if (dag.brandrisk_beordrad !== true) return 0;
  if (!arVardag(dag.datum)) return 0;
  const s = tMin(dag.start_tid);
  if (s < 0) return 0;
  return Math.max(0, OB_MORGON_SLUT_MIN - s);
}

/** En tidig vardagsmorgon (start < 05:30) — relevant för OB oavsett svar. Fångar
 *  aldrig 00:00/tom tid (placeholder). */
export function arTidigVardag(dag: ObDag): boolean {
  if (!arVardag(dag.datum)) return false;
  const s = tMin(dag.start_tid);
  return s > 0 && s < FRAGE_TROSKEL_MIN;
}

/** Ska brandriskfrågan visas? Tidig vardagsmorgon + obesvarad. */
export function skaFragaBrandrisk(dag: ObDag): boolean {
  return dag.brandrisk_beordrad == null && arTidigVardag(dag);
}

export function fmtOb(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} tim ${m} min`;
  if (h) return `${h} tim`;
  return `${m} min`;
}

// ── Admin ──

export type ObMonster = { medarbetare_id: string; dagar: number; summaMin: number };

/** Per förare: antal beordrade OB-dagar + summa OB-minuter. Störst summa först. */
export function obMonster(rader: (ObDag & { medarbetare_id: string })[]): ObMonster[] {
  const m = new Map<string, ObMonster>();
  for (const r of rader || []) {
    const min = obMinuter(r);
    if (min <= 0) continue;
    const e = m.get(r.medarbetare_id) || { medarbetare_id: r.medarbetare_id, dagar: 0, summaMin: 0 };
    e.dagar += 1; e.summaMin += min;
    m.set(r.medarbetare_id, e);
  }
  return Array.from(m.values()).sort((a, b) => b.summaMin - a.summaMin);
}

/** Obesvarade tidiga vardagsmorgnar (null) — admin kan be förarna svara (ingen nag). */
export function obObesvarade(rader: (ObDag & { medarbetare_id: string })[]): (ObDag & { medarbetare_id: string })[] {
  return (rader || []).filter(r => r.brandrisk_beordrad == null && arTidigVardag(r))
    .sort((a, b) => b.datum.localeCompare(a.datum) || (a.start_tid || '').localeCompare(b.start_tid || ''));
}

export type OenighetSvar = { medarbetare_id: string; start_tid: string | null; brandrisk_beordrad: boolean };
export type Oenighet = { datum: string; svar: OenighetSvar[] };

/** Morgnar där förare som alla startade tidigt svarat OLIKA — minst en JA OCH en NEJ
 *  samma dag. Inte ett fel, bara en rad där de skiljer sig (någon kan ha missförstått). */
export function oenighetsMorgnar(rader: (ObDag & { medarbetare_id: string })[]): Oenighet[] {
  const perDatum = new Map<string, (ObDag & { medarbetare_id: string })[]>();
  for (const r of rader || []) {
    if (!arTidigVardag(r)) continue;
    if (!perDatum.has(r.datum)) perDatum.set(r.datum, []);
    perDatum.get(r.datum)!.push(r);
  }
  const ut: Oenighet[] = [];
  for (const [datum, rs] of Array.from(perDatum.entries())) {
    const svarade = rs.filter(r => r.brandrisk_beordrad != null);
    const ja = svarade.filter(r => r.brandrisk_beordrad === true).length;
    const nej = svarade.filter(r => r.brandrisk_beordrad === false).length;
    if (ja > 0 && nej > 0) {
      ut.push({ datum, svar: svarade.map(r => ({ medarbetare_id: r.medarbetare_id, start_tid: r.start_tid, brandrisk_beordrad: r.brandrisk_beordrad as boolean })) });
    }
  }
  return ut.sort((a, b) => b.datum.localeCompare(a.datum));
}
