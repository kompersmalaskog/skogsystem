/**
 * DIAGNOS-MOTORN OCH TIDSSERIERNA — flyttat ur app/kalibrering/page.tsx (2026-10), oförändrat.
 * Rådata (per diameterklass) → ETT av tre fel + åtgärdstext, "Flaxar den?"-slutsatsen och aggregeringen per period.
 */
import type { DiagKlass, DiagnosResp } from './typer';

// === Diagnos-motorn: rådata (per diameterklass) → ETT av tre fel + åtgärdstext ===
// Skild från bedomProfil (som ger profil-verdikt per variabel). diagnos() svarar
// på "vad ska föraren göra", inte "hur bra mäter maskinen".
//
// PRINCIP: diagnos ställs BARA på klasser som underpresterar (träff% under
// profilens golv). En klass över golvet är bra oavsett vad tecknen gör — appen
// ska vara tyst när den inte har något att säga.
//   Kurva:   underpresterande klass, systematik KONSEKVENT (samma tecken) → kontakta tekniker
//   Tryck:   underpresterande klass, systematik VÄXLAR TECKEN → höj matartrycket
//   Slitage: tryck-signatur MEN planområden sjönk inte efter en förar-markör → verkstad
export type DiagFel = 'kurva' | 'tryck' | 'slitage';
export type DiagnosVerdikt = {
  status: 'bra' | 'tendens' | 'diagnos';
  fel: DiagFel | null;
  klass: DiagKlass | null;
  bandZon: number | null; // 0 = rot/grov … 4 = topp/klen. null = inget band.
  mening1: string; mening2: string; mening3?: string; // mening3 = dämpad avvägning
};

export const GRIND_MIN = 30;      // < 30 mätpunkter i en klass → ingen bedömning alls
export const GRIND_ATGARD = 100;  // ≥ 100 → åtgärd; 30–100 → tendens utan åtgärd
export const BAND_ORDNING = ['300+', '250-299', '200-249', '150-199', '<150']; // rot → topp

// Tidssteg för Trend "Läget" — grova klasser (25-55 mått/månad) blir brus per
// månad men signal per kvartal (300+ Q1 = 386 mått). Default kvartal så grova
// kan visas solida. Aggregeringen är VIKTAD på n (= sann period-träffprocent).
export type LagetSteg = 'manad' | 'kvartal' | 'ar';
export const periodKey = (manad: string, steg: LagetSteg): string => {
  const y = manad.slice(0, 4);
  const m = Number(manad.slice(5, 7));
  if (steg === 'ar') return y;
  if (steg === 'kvartal') return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  return manad;
};
export const fmtPeriod = (key: string, steg: LagetSteg): string => {
  if (steg === 'ar') return key;
  if (steg === 'kvartal') { const [y, q] = key.split('-'); return `${q} ’${y.slice(2)}`; }
  return `${key.slice(5, 7)}/${key.slice(2, 4)}`;
};
export const aggregeraSteg = (
  monthly: { manad: string; v: number; n: number }[],
  steg: LagetSteg,
): Map<string, { v: number; n: number }> => {
  const b = new Map<string, { vs: number; n: number }>();
  for (const m of monthly) {
    const k = periodKey(m.manad, steg);
    const cur = b.get(k) ?? { vs: 0, n: 0 };
    cur.vs += m.v * m.n; cur.n += m.n; b.set(k, cur);
  }
  return new Map(Array.from(b, ([k, c]) => [k, { v: c.n > 0 ? c.vs / c.n : 0, n: c.n }]));
};

// Spridning (std) per period — aggregeras EXAKT ur råa summor. std är INTE
// viktbart som träffprocent; att medelvärda månads-std vore fel.
//   std = √(Σsumsq/Σn − (Σsum/Σn)²)
export const aggregeraSprid = (
  monthly: { manad: string; n: number; sum: number; sumsq: number }[],
  steg: LagetSteg,
): Map<string, { v: number; n: number }> => {
  const b = new Map<string, { n: number; sum: number; sumsq: number }>();
  for (const m of monthly) {
    const k = periodKey(m.manad, steg);
    const cur = b.get(k) ?? { n: 0, sum: 0, sumsq: 0 };
    cur.n += m.n; cur.sum += m.sum; cur.sumsq += m.sumsq; b.set(k, cur);
  }
  return new Map(Array.from(b, ([k, c]) => {
    const mean = c.n > 0 ? c.sum / c.n : 0;
    const varians = c.n > 0 ? Math.max(0, c.sumsq / c.n - mean * mean) : 0;
    return [k, { v: Math.sqrt(varians), n: c.n }];
  }));
};

export type Serie = { klass: string; punkter: Map<string, { v: number; n: number }> };
/** En serie per grovlek (klass) för Läget: träffprocent respektive planområden, aggregerade per valt tidssteg. */
export const traffSerier = (kl: DiagKlass[], steg: LagetSteg): Serie[] =>
  kl.map(k => ({ klass: k.klass, punkter: aggregeraSteg(k.traffMonthly.map(m => ({ manad: m.manad, v: m.traffPct, n: m.n })), steg) }));
export const platSerier = (kl: DiagKlass[], steg: LagetSteg): Serie[] =>
  kl.map(k => ({ klass: k.klass, punkter: aggregeraSteg(k.plateauMonthly.map(m => ({ manad: m.manad, v: m.share, n: m.n })), steg) }));
export const spridSerier = (kl: DiagKlass[], steg: LagetSteg): Serie[] =>
  kl.map(k => ({ klass: k.klass, punkter: aggregeraSprid(k.spridMonthly, steg) }));
/** Perioderna (sorterade) där minst en serie har underlag ≥ GRIND_MIN — diagrammets x-axel. */
export const perioderAv = (series: { punkter: Map<string, { v: number; n: number }> }[]): string[] =>
  Array.from(new Set(series.flatMap(s => Array.from(s.punkter).filter(([, p]) => p.n >= GRIND_MIN).map(([kk]) => kk)))).sort();
/** Spridningsdiagrammets y-axel: minst 8, annars 1,6 × golvet uppåt till jämnt tal. */
export const spridYMax = (stdGolv: number | null): number => Math.max(8, Math.ceil(((stdGolv ?? 5) * 1.6) / 2) * 2);

/** Stabilitetsrutnätets månader (sorterade) och cellens klass: n < 20 tunn, |syst| ≥ 4 hot, ≥ 2 hi, annars ok. */
export const stabilitetManader = (klasser: DiagKlass[]): string[] =>
  Array.from(new Set(klasser.flatMap(k => k.systMonthly.map(m => m.manad)))).sort();
export const stabilitetCell = (c: { systematik: number; n: number }): 'tunn' | 'hot' | 'hi' | 'ok' => {
  const mag = Math.abs(c.systematik);
  return c.n < 20 ? 'tunn' : mag >= 4 ? 'hot' : mag >= 2 ? 'hi' : 'ok';
};

export const klassGrovlek = (klass: string): string =>
  klass === '300+' ? 'grova bitar' : klass === '<150' ? 'klena bitar' : `${klass} mm-bitar`;

export const diagnos = (resp: DiagnosResp | null): DiagnosVerdikt => {
  const bra: DiagnosVerdikt = { status: 'bra', fel: null, klass: null, bandZon: null, mening1: 'Maskinen mäter bra.', mening2: 'Inget att åtgärda.' };
  if (!resp || resp.golvDia == null || resp.klasser.length === 0) return bra;
  const golv = resp.golvDia;
  // Underpresterande klasser med tillräckligt underlag (grind: <30 = tyst).
  const under = resp.klasser.filter(k => k.traffPct != null && k.traffPct < golv && k.n >= GRIND_MIN);
  if (under.length === 0) return bra;
  const värsta = under.reduce((a, b) => ((b.traffPct as number) < (a.traffPct as number) ? b : a));
  const zon = BAND_ORDNING.indexOf(värsta.klass);
  const bandZon = zon >= 0 ? zon : null;
  // 30–100 mätpunkter → tendens, ingen åtgärd (en felskruvning gör maskinen sämre).
  if (värsta.n < GRIND_ATGARD) {
    return { status: 'tendens', fel: null, klass: värsta, bandZon,
      mening1: `Ser ut att brista på ${klassGrovlek(värsta.klass)}.`,
      mening2: 'Ta fler kontrollstammar på grova träd innan du justerar.' };
  }
  // Teckenanalys — bara månader med n ≥ 20 (glesa månader är brus).
  const mån = värsta.systMonthly.filter(m => m.n >= 20);
  const tecken = new Set(mån.filter(m => Math.abs(m.systematik) >= 0.05).map(m => Math.sign(m.systematik)));
  const konsekvent = tecken.size <= 1;
  let fel: DiagFel = konsekvent ? 'kurva' : 'tryck';
  // Slitage-eskalering: tryck + en förar-markör + planområden sjönk INTE efter den.
  if (fel === 'tryck') {
    const atg = resp.markorer.filter(m => m.kalla === 'atgard').sort((a, b) => a.datum.localeCompare(b.datum)).pop();
    if (atg) {
      const mn = atg.datum.slice(0, 7);
      const snitt = (arr: { share: number }[]) => (arr.length ? arr.reduce((s, x) => s + x.share, 0) / arr.length : null);
      const fore = snitt(resp.plateauMonthly.filter(p => p.manad < mn));
      const efter = snitt(resp.plateauMonthly.filter(p => p.manad >= mn));
      if (fore != null && efter != null && efter >= fore - 5) fel = 'slitage';
    }
  }
  const g = klassGrovlek(värsta.klass);
  // Tryck är en AVVÄGNING, inte en gratis fix — mening3 dämpar. Appen ger
  // underlaget, föraren fattar beslutet.
  const copy: Record<DiagFel, { m1: string; m2: string; m3?: string }> = {
    tryck: {
      m1: `Maskinen mäter ostadigt på ${g}.`,
      m2: 'Greppet räcker inte — höj trycket på knivar eller matarhjul.',
      m3: 'Men känn efter: går det för trögt kostar det bränsle och produktion.',
    },
    kurva: { m1: `Maskinen mäter fel storlek på ${g}.`, m2: 'Diameterkurvan behöver ses över — kontakta tekniker.' },
    slitage: { m1: 'Greppet brister trots höjt tryck.', m2: 'Byt matarvalsar/slitdelar — verkstad.' },
  };
  return { status: 'diagnos', fel, klass: värsta, bandZon, mening1: copy[fel].m1, mening2: copy[fel].m2, mening3: copy[fel].m3 };
};

// === "Flaxar den?" — slutsatsen RÄKNAS UT, gissas inte (håller efter fälttest) ===
//   std ökar med grovleken            → höj trycket
//   ungefär lika överallt / ökar över tid → kontrollera givare/bussningar
//   rak linje (lågt syst) men taggig  → tillägg: det är inte kalibrering
export const FLAX_GRADIENT = 1.0; // mm skillnad klenaste→grövsta klass = "värst på grova"
export const FLAX_TREND = 0.5;    // mm ökning första→sista halvan = "ökar över tid"
export type FlaxSlutsats = { status: 'tyst' | 'jamn' | 'flaxar'; rubrik: string; atgard: string | null; tillagg: string | null };

// Systematik i fönstret per klass — n-viktat medel av systMonthly (systematik ÄR viktbart).
export const systWin = (k: DiagKlass): number | null => {
  const tot = k.systMonthly.reduce((a, m) => a + m.n, 0);
  if (!tot) return null;
  return k.systMonthly.reduce((a, m) => a + m.systematik * m.n, 0) / tot;
};
// Stiger spridningen över tid? Jämför std första halvan mot sista halvan av månaderna.
export const spridStiger = (k: DiagKlass): boolean => {
  const mm = k.spridMonthly.filter(m => m.n >= GRIND_MIN);
  if (mm.length < 2) return false;
  const halv = Math.floor(mm.length / 2);
  const std = (arr: typeof mm) => {
    const n = arr.reduce((a, m) => a + m.n, 0);
    if (!n) return null;
    const mean = arr.reduce((a, m) => a + m.sum, 0) / n;
    return Math.sqrt(Math.max(0, arr.reduce((a, m) => a + m.sumsq, 0) / n - mean * mean));
  };
  const f = std(mm.slice(0, halv)), s = std(mm.slice(halv));
  return f != null && s != null && s - f >= FLAX_TREND;
};

export const flaxSlutsats = (klasser: DiagKlass[], stdGolv: number | null, systMal: number | null): FlaxSlutsats => {
  const med = klasser.filter(k => k.n >= GRIND_MIN && k.standardavv != null);
  if (med.length === 0 || stdGolv == null) {
    return { status: 'tyst', rubrik: 'För tunt underlag för en bedömning.', atgard: null, tillagg: null };
  }
  const over = med.filter(k => (k.standardavv as number) > stdGolv);
  if (over.length === 0) {
    return { status: 'jamn', rubrik: 'Maskinen mäter jämnt.', atgard: 'Inget att åtgärda.', tillagg: null };
  }
  const ordn = ['<150', '150-199', '200-249', '250-299', '300+'];
  const sorted = med.slice().sort((a, b) => ordn.indexOf(a.klass) - ordn.indexOf(b.klass));
  const varsta = over.reduce((a, b) => ((b.standardavv as number) > (a.standardavv as number) ? b : a));

  // Rak men taggig → kalibrering är inte svaret (oberoende av grovlek).
  let tillagg: string | null = null;
  const sw = systWin(varsta);
  if (sw != null && systMal != null && Math.abs(sw) < systMal) {
    tillagg = 'Linjen är rak men taggig — det är inte kalibrering. Kalibrering rätar inte en taggig linje.';
  }

  // Finns GROVA klasser med underlag? En gallringsmaskin saknar dem helt. Utan
  // grova går grovt-mot-klent-jämförelsen inte att göra — då får vi INTE gissa
  // "lika överallt → givare" på två klena klasser. Säg bara vad som finns.
  const harGrova = med.some(k => k.min >= 250);
  if (!harGrova) {
    const n = over.map(k => klassGrovlek(k.klass));
    const namn = n.length <= 1 ? n[0] : `${n.slice(0, -1).join(', ')} och ${n[n.length - 1]}`;
    return {
      status: 'flaxar',
      rubrik: `Spridningen ligger över kravet på ${namn}.`,
      atgard: 'Underlaget saknar grova stammar — utan dem går tryck inte att skilja från givarfel.',
      tillagg,
    };
  }

  const klenast = sorted[0].standardavv as number;
  const grovast = sorted[sorted.length - 1].standardavv as number;
  let rubrik: string, atgard: string;
  if (grovast - klenast >= FLAX_GRADIENT) {
    rubrik = `Flaxar värst på ${klassGrovlek(sorted[sorted.length - 1].klass)} — spridningen växer med grovleken.`;
    atgard = 'Greppet räcker inte — höj trycket på knivar eller matarhjul. Men känn efter: går det för trögt kostar det bränsle och produktion.';
  } else {
    const stiger = spridStiger(varsta);
    rubrik = stiger ? 'Flaxar ungefär lika överallt, och spridningen ökar över tid.' : 'Flaxar ungefär lika överallt.';
    atgard = 'Kontrollera givare och bussningar.';
  }
  return { status: 'flaxar', rubrik, atgard, tillagg };
};
