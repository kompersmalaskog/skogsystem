/**
 * VAR SITTER FELET? — delen i Läget som pekar ut var maskinen mäter fel: klena, mellangrova eller grova stockar, och rotstocken per trädslag.
 *
 * Vidas kvalitetsrapport (2026-11-16) sa "dian vid 50 och 100 mm är något klenare" och "rotstocken ligger på korthållet" — rätt saker, men Läget visade bara
 * totalen ("Diametern 81 %"). Den här delen säger samma sak i ord ("Klena stockar · 4 mm för grovt") UTAN att föreslå en justering: appen visar var felet sitter,
 * maskinen (Opti) räknar ut justeringen (Martin 2026-10-25).
 *
 * Domen och Vidas krav i Läget bygger ALLTID på 90-dagarsfönstret. Växeln "Senaste 90 dagarna | Sedan kalibreringen" styr BARA den här delen (Martin 2026-11-18).
 *
 * Samma räkneregler som Per grovlek (grovlek.ts): samma diameterpunkter (mätpunkter längs stocken + toppen, OMÄTT-filtrerat), samma stamidentitet (skördetiden),
 * samma dubbletter bort (fysiskaStockar), och EN STAM RÄKNAS EN GÅNG per grupp — rutans värde är medelvärdet av stammarnas egna värden.
 * Servern bygger underlaget med `byggFeletUnderlag`; klienten väljer period och bygger raderna med `varSitterFelet`. Allt här är rent.
 */
import type { DiaPunkt } from './diameterpunkter';
import { fysiskaStockar, GROVLEK_MIN_STAMMAR, langdForStorForDiameter, LANGDFEL_MAX_CM, stamNyckel, type StockRad } from './grovlek';
import { rundaMedTecken } from './rutnat';
import { fmtDagMan } from './datum';
import type { ToneToken } from './bedomning';
import type { KravRow } from './typer';
import { tradslagLabel } from '@/lib/tradslag';

/** Tre grovlekar räcker för att säga var felet sitter (Per grovlek har fem). Gränserna är operatörens (klavens) diameter. */
export const FELET_GRUPPER = ['klen', 'mellan', 'grov'] as const;
export type FeletGrupp = typeof FELET_GRUPPER[number];
export const feletGrupp = (mm: number): FeletGrupp => (mm < 150 ? 'klen' : mm < 250 ? 'mellan' : 'grov');
const GRUPP_NAMN: Record<FeletGrupp, { titel: string; under: string; plural: string }> = {
  klen: { titel: 'Klena stockar', under: 'under 150 mm', plural: 'klena stockar' },
  mellan: { titel: 'Mellangrova stockar', under: '150–249 mm', plural: 'mellangrova stockar' },
  grov: { titel: 'Grova stockar', under: 'över 250 mm', plural: 'grova stockar' },
};

/** Färre stammar än så i en grupp → gruppen visas inte (samma gräns som en ruta i Per grovlek). */
export const FELET_MIN_STAMMAR = GROVLEK_MIN_STAMMAR;
/** En grovlek som träffar Vidas mål får ändå en rad när maskinen i snitt ligger så här många mm fel (halva toleransen ±4). */
export const FELET_SNITT_MM = 2;
/** Högst så här många rader — det viktigaste först. */
export const FELET_MAX_RADER = 3;

/** En stams diameterpunkter i en grovlek: `traff` = inom toleransen, `summa` = Σ (maskin − klave) mm över `n` punkter. */
export type FeletDia = { stam: string; datum: string; grupp: FeletGrupp; n: number; traff: number; summa: number };
/** En stams rotstock: maskinens längd − klavens, cm. */
export type FeletRot = { stam: string; datum: string; tradslag: string; avvikCm: number };
export type FeletResp = {
  ok: true;
  maskin_id: string;
  tolDia: number;
  tolLangd: number;
  dia: FeletDia[];
  rot: FeletRot[];
  /** Senaste kalibreringen (svensk dag, ur fakt_kalibrering_historik, längd eller diameter). null = ingen känd. */
  senasteKalibrering: string | null;
  /** Kontrolldagen för varje stock vars diameter lämnades bort för att längden avvek över LANGDFEL_MAX_CM. Saknas = inga. */
  bortLangdfel?: string[];
  /** Timmer, klentimmer och kubb mot sina längdklasser, en rad per fysisk stock. null = klasserna gick inte att läsa; saknas = äldre server. */
  langd?: FeletLangd[] | null;
};

export type FeletStock = StockRad & { maskin_langd_cm: number | null; operator_langd_cm: number | null; sortiment_namn?: string | null };

/**
 * LÄNGDEN MOT BESTÄLLT (Martin 2026-11-18): klassens undre gräns (372, 433, 494 …) är vad stocken MINST måste vara. Föraren lägger 3–6 cm övermål i
 * skördaren eftersom mätningen inte är exakt. Måttbandet under gränsen = stocken blev för kort och hamnar i en lägre klass, vilket kostar pengar.
 *
 * Kontrollfilen säger bara sortimentets NAMN, och samma namn kan ha flera matriser med lite olika längder (546 eller 548). Därför försiktigt:
 * "för kort" bara när stocken är för kort i ALLA matriser med namnet, övermålet bara när alla matriser ger samma klass. Annars räknas stocken inte.
 * Bara timmer, klentimmer och kubb — massaveden och energin räknas inte här.
 */
export const LANGD_GRUPPER = ['Timmer', 'Klentimmer', 'Kubb'] as const;
/** En stock mot sina längdklasser. `kort` null = matriserna säger olika; `overCm` null = matriserna ger olika klass. */
export type FeletLangd = { datum: string; kort: boolean | null; overCm: number | null };

/** Maskinens tänkta klass (största gränsen ≤ maskinens längd) mot måttbandets. null = stocken går inte att bedöma (ingen matris, ingen klass, omätt). */
export function langdMotKlass(maskinCm: number | null, operatorCm: number | null, matriser: number[][]): { kort: boolean | null; overCm: number | null } | null {
  if (maskinCm == null || operatorCm == null || maskinCm <= 0 || operatorCm <= 0 || matriser.length === 0) return null;
  const klass = (lim: number[], v: number) => { let k: number | null = null; for (const l of lim) if (l <= v && (k == null || l > k)) k = l; return k; };
  const utfall = matriser.map(lim => {
    const km = klass(lim, maskinCm);
    if (km == null) return null;
    const ko = klass(lim, operatorCm);
    return { km, kort: ko == null || ko < km };
  });
  if (utfall.some(u => u == null)) return null;
  const u = utfall as { km: number; kort: boolean }[];
  const allaKort = u.every(x => x.kort);
  const ingenKort = u.every(x => !x.kort);
  const enKlass = u.every(x => x.km === u[0].km);
  return { kort: allaKort ? true : ingenKort ? false : null, overCm: enKlass ? operatorCm - u[0].km : null };
}

/** Underlaget: en rad per stam och grovlek (diameter) och en per stam (rotstocken). Datum = kontrollens. Saknar kontrollen trädslag får rotstocken ingen rad. */
export function byggFeletUnderlag(args: {
  stockar: FeletStock[]; punkter: DiaPunkt[]; filTradslag: Map<string, string>; tolDia: number;
  /** Längdklasserna per sortimentnamn (utan "Timmer: "), en lista per matris. Saknas = ingen längdrad. */
  klasser?: Map<string, number[][]>;
}): { dia: FeletDia[]; rot: FeletRot[]; bortLangdfel: string[]; langd: FeletLangd[] } {
  const { stockar, punkter, filTradslag, tolDia, klasser } = args;
  const behallna = fysiskaStockar(stockar);
  const stock = new Map(behallna.map(s => [s.id, s]));
  const dia = new Map<string, FeletDia>();
  const bortLangdfel = behallna.filter(s => langdForStorForDiameter(s)).map(s => s.kontroll_datum.slice(0, 10));
  for (const p of punkter) {
    const s = stock.get(p.stockId);
    if (!s || langdForStorForDiameter(s)) continue;
    const grupp = feletGrupp(p.operator_mm);
    const stam = stamNyckel(s);
    const k = `${stam}|${grupp}`;
    let r = dia.get(k);
    if (!r) { r = { stam, datum: s.kontroll_datum.slice(0, 10), grupp, n: 0, traff: 0, summa: 0 }; dia.set(k, r); }
    r.n++; r.summa += p.avvik; if (Math.abs(p.avvik) <= tolDia) r.traff++;
  }
  const rot: FeletRot[] = [];
  const sedda = new Set<string>();
  for (const s of behallna) {
    if (s.stock_nummer !== 1) continue;
    if (s.maskin_langd_cm == null || s.operator_langd_cm == null || s.operator_langd_cm === 0) continue; // OMÄTT ≠ avvikelse
    const tr = filTradslag.get(s.filnamn);
    if (!tr) continue;
    const stam = stamNyckel(s);
    if (sedda.has(stam)) continue;
    sedda.add(stam);
    rot.push({ stam, datum: s.kontroll_datum.slice(0, 10), tradslag: tradslagLabel(tr), avvikCm: Number(s.maskin_langd_cm) - Number(s.operator_langd_cm) });
  }
  const langd: FeletLangd[] = [];
  if (klasser) {
    for (const s of behallna) {
      const m = s.sortiment_namn ? klasser.get(s.sortiment_namn.trim()) : undefined;
      if (!m) continue;
      const r = langdMotKlass(s.maskin_langd_cm, s.operator_langd_cm, m);
      if (r) langd.push({ datum: s.kontroll_datum.slice(0, 10), ...r });
    }
  }
  return { dia: Array.from(dia.values()), rot, bortLangdfel, langd };
}

// === Vyn ===
export type FeletPeriod = 'fonster' | 'kalibrering';
export type FeletRad = {
  key: string;
  titel: string;
  under: string;
  /** "4 mm för grovt", "1 cm för lång", "spretar åt båda hållen", "rätt längd i snitt" */
  varde: string;
  /** "55 % rätt" */
  ord: string;
  ton: ToneToken;
};
export type FeletVy = {
  rader: FeletRad[];
  /** En mening i ord om det viktigaste felet: "Maskinen tror att klena stockar är grövre än de är." null = inget att säga. */
  mening: string | null;
  /** Under kortet: "12 stammar sedan kalibreringen 17 nov". */
  not: string;
  /** Inga rader att visa (för få stammar) — texten som står i stället. */
  tom: string | null;
  /** Längden mot beställt (timmer och kubb). null = för få stockar eller äldre server. */
  langdRad: FeletRad | null;
};

const krav = (trosklar: KravRow[], variabel: string) => {
  const r = trosklar.find(t => t.variabel === variabel && t.metrik === 'traffprocent');
  return r ? { mal: Number(r.mal), golv: Number(r.golv) } : null;
};
const tonFor = (pct: number, k: { mal: number; golv: number } | null): ToneToken => {
  if (!k) return 'ok';
  const visad = Math.round(pct);
  return visad < k.golv ? 'hot' : visad < k.mal ? 'hi' : 'ok';
};
const stammarText = (n: number) => (n === 1 ? '1 stam' : `${n} stammar`);

export function varSitterFelet(args: {
  resp: FeletResp;
  period: FeletPeriod;
  /** Domens fönster (BedomningResp.fonster) — samma 90 dagar som Läget. */
  fonster: { fran: string; till: string } | null;
  trosklar: KravRow[];
}): FeletVy {
  const { resp, period, fonster, trosklar } = args;
  const kal = resp.senasteKalibrering;
  const iPerioden = (datum: string): boolean => {
    if (period === 'kalibrering') return kal != null && datum >= kal;
    return fonster != null && datum >= fonster.fran && datum <= fonster.till;
  };
  const dia = resp.dia.filter(r => iPerioden(r.datum));
  const rot = resp.rot.filter(r => iPerioden(r.datum));
  const antal = new Set([...dia.map(r => r.stam), ...rot.map(r => r.stam)]).size;
  const periodText = period === 'kalibrering' && kal ? `sedan kalibreringen ${fmtDagMan(kal)}` : 'senaste 90 dagarna';
  const bort = (resp.bortLangdfel ?? []).filter(iPerioden).length;
  const not = `${stammarText(antal)} ${periodText}`
    + (bort > 0 ? ` · ${bort === 1 ? '1 stock' : `${bort} stockar`} räknas inte, längden var mer än ${LANGDFEL_MAX_CM} cm fel` : '');

  const diaKrav = krav(trosklar, 'diameter');
  const langdKrav = krav(trosklar, 'langd');

  // Diametern per grovlek — en stam en gång.
  type DiaGrupp = { grupp: FeletGrupp; stammar: number; traffPct: number; snittMm: number };
  const grupper: DiaGrupp[] = [];
  for (const grupp of FELET_GRUPPER) {
    const lista = dia.filter(r => r.grupp === grupp && r.n > 0);
    if (lista.length < FELET_MIN_STAMMAR) continue;
    grupper.push({
      grupp, stammar: lista.length,
      traffPct: (100 * lista.reduce((a, r) => a + r.traff / r.n, 0)) / lista.length,
      snittMm: lista.reduce((a, r) => a + r.summa / r.n, 0) / lista.length,
    });
  }
  const flaggade = grupper
    .filter(g => (diaKrav != null && Math.round(g.traffPct) < diaKrav.mal) || Math.abs(rundaMedTecken(g.snittMm)) >= FELET_SNITT_MM)
    .sort((a, b) => a.traffPct - b.traffPct || Math.abs(b.snittMm) - Math.abs(a.snittMm));

  const diaVarde = (mm: number): string => {
    const r = rundaMedTecken(mm);
    // Rätt i snitt men under målet = mätningen sprider åt båda hållen (prod 2026-11-18: Scorpionens grova stockar, +0,4 mm men 74 % rätt).
    return r > 0 ? `${r} mm för grovt` : r < 0 ? `${-r} mm för klent` : 'spretar åt båda hållen';
  };
  const rader: FeletRad[] = flaggade.slice(0, 2).map(g => ({
    key: `dia-${g.grupp}`, titel: GRUPP_NAMN[g.grupp].titel, under: `${GRUPP_NAMN[g.grupp].under} · ${stammarText(g.stammar)}`,
    varde: diaVarde(g.snittMm), ord: `${Math.round(g.traffPct)} % rätt`, ton: tonFor(g.traffPct, diaKrav),
  }));
  if (flaggade.length === 0 && grupper.length > 0) {
    rader.push({ key: 'dia-ok', titel: 'Diametern', under: `${grupper.length === 3 ? 'alla grovlekar' : 'grovlekarna med underlag'}`, varde: 'inget sticker ut', ord: '', ton: 'ok' });
  }

  // Rotstocken per trädslag — alltid med när det finns underlag, så att en ändrad rotkompensering syns.
  const tradslag = Array.from(new Set(rot.map(r => r.tradslag)));
  const rotRader = tradslag.map(tr => {
    const lista = rot.filter(r => r.tradslag === tr);
    const traffPct = (100 * lista.filter(r => Math.abs(r.avvikCm) <= resp.tolLangd).length) / lista.length;
    const snitt = lista.reduce((a, r) => a + r.avvikCm, 0) / lista.length;
    return { tr, stammar: lista.length, traffPct, snitt };
  }).filter(r => r.stammar >= FELET_MIN_STAMMAR).sort((a, b) => b.stammar - a.stammar || a.tr.localeCompare(b.tr));
  for (const r of rotRader) {
    const c = rundaMedTecken(r.snitt);
    rader.push({
      key: `rot-${r.tr}`, titel: `Rotstocken ${r.tr.toLowerCase()}`, under: stammarText(r.stammar),
      varde: c > 0 ? `${c} cm för lång` : c < 0 ? `${-c} cm för kort` : 'rätt längd i snitt',
      ord: `${Math.round(r.traffPct)} % rätt`, ton: tonFor(r.traffPct, langdKrav),
    });
  }

  const varst = flaggade[0];
  const sr = varst ? rundaMedTecken(varst.snittMm) : 0;
  // Rätt i snitt men under målet: felet går åt båda hållen. Det går inte att kalibrera bort — Skogforsk: låg träff utan systematiskt fel
  // tyder på något mekaniskt (mäthjul, givare, knivar, tryck). Ett påstående om datan, aldrig en uppmaning.
  const mening = !varst ? null
    : Math.abs(sr) >= FELET_SNITT_MM ? `Maskinen tror att ${GRUPP_NAMN[varst.grupp].plural} är ${sr > 0 ? 'grövre' : 'klenare'} än de är.`
    : sr === 0 && diaKrav != null && Math.round(varst.traffPct) < diaKrav.mal
      ? `Felet på ${GRUPP_NAMN[varst.grupp].plural} hoppar åt båda hållen. Det brukar bero på något i aggregatet, inte på kalibreringen.`
      : null;

  const synliga = rader.slice(0, FELET_MAX_RADER);
  return {
    langdRad: langdRad(resp.langd, iPerioden),
    rader: synliga,
    mening,
    not,
    tom: synliga.length === 0 ? `För få stammar för att säga var felet sitter – ${stammarText(antal)} ${periodText}.` : null,
  };
}

/** "Längden mot beställt · 245 stockar · Ingen för kort · övermål 4 cm i snitt". Läsfel → en rad som säger det. Under 8 bedömda stockar → ingen rad. */
function langdRad(langd: FeletLangd[] | null | undefined, iPerioden: (d: string) => boolean): FeletRad | null {
  const titel = 'Längden mot beställt';
  if (langd === undefined) return null;
  if (langd === null) return { key: 'langd', titel, under: 'timmer och kubb', varde: 'Kunde inte läsas', ord: '', ton: 'ok' };
  const lista = langd.filter(l => iPerioden(l.datum) && l.kort != null);
  if (lista.length < FELET_MIN_STAMMAR) return null;
  const korta = lista.filter(l => l.kort).length;
  const over = lista.filter(l => !l.kort && l.overCm != null).map(l => l.overCm as number);
  const snitt = over.length > 0 ? Math.round(over.reduce((a, b) => a + b, 0) / over.length) : null;
  return {
    key: 'langd', titel, under: `${lista.length} stockar timmer och kubb`,
    varde: korta === 0 ? 'Ingen för kort' : korta === 1 ? '1 för kort' : `${korta} för korta`,
    ord: snitt != null ? `övermål ${snitt} cm i snitt` : '',
    ton: korta > 0 ? 'hi' : 'ok',
  };
}
