// Objektöversiktens vymodell — ALL text och alla tal som sidan och PDF:en visar. Sidan och PDF:en ritar bara, så de
// kan aldrig säga olika saker (samma mönster som markägarrapporten).
//
// Texten förklarar sig själv så att ett barn förstår (Martin 2026-10-22 och 2026-10-24): svaret = maskinernas tid (skördare + skotare), prognosen
// i ord ("28 h 4 min mer än prognosen"; tiden som i resten av appen, `fmtTid`) och EN mening om varför. Ordet är prognos, aldrig plan.

import { TID_DELAR, dagSumma, type DagDelar, type Produktion, type Roll, type Sammanstallning, type ObjektRad, type TidDel } from './berakna';
import { heltal, procentSomSummerar, type Stapeldel } from '@/lib/markagarrapport/vy';
import { DELFARG, FARG } from '@/lib/design/tokens';
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil';
import { tradslagFarg, tradslagStil } from '@/lib/tradslag';
import { typLabel, type ObjektTyp } from '@/lib/objekt/typ';
import { fmtTid } from '@/lib/flytt/traillertid';

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const KORT_MANAD = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const VECKODAG = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

/** Mer än så här över prognosen (andel) står i orange. */
export const OVER_PROGNOS_ANDEL = 0.1;
/** Längre än så här (dagar) mellan första och sista dagen → staplarna visar veckor i stället för dagar. */
export const VECKOR_FRAN_DAGAR = 42;

/**
 * Färgen per del av tiden — EN källa för raderna, staplarna och PDF:en. Skördare och skotare har appens rollfärger
 * (lila, grön); flytt samma indigo som maskinvyn (DELFARG[4]); planering och manuellt arbete ur diagrampaletten.
 * Färgen bär aldrig ensam: raden har ordet bredvid pricken.
 */
export const TID_FARG: Record<TidDel, string> = {
  skordare: ROLLFARG_SKORDARE,
  skotare: ROLLFARG_SKOTARE,
  flytt: DELFARG[4],
  planering: DELFARG[0],
  manuellt: DELFARG[5],
  annat: FARG.text3,
};

/** Tid på objektet: "157 h 37 min", "12 h", "46 min" — samma form som i resten av appen (`fmtTid`). */
export function tidText(min: number): string {
  return fmtTid(Math.max(0, min));
}

/** Samma som tidText; kvar som namn för raderna. */
export const timmar = tidText;

export function decimal(n: number, d = 1): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** "21 aug" ur YYYY-MM-DD. */
export function kortDatum(iso: string | null | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[3])} ${KORT_MANAD[Number(m[2]) - 1]}` : null;
}

function veckodagDatum(iso: string): string {
  const [a, mn, d] = iso.split('-').map(Number);
  const dag = new Date(Date.UTC(a, mn - 1, d)).getUTCDay();
  return `${VECKODAG[dag]} ${d} ${KORT_MANAD[mn - 1]}`;
}

function isoVecka(iso: string): { ar: number; v: number } {
  const [a, mn, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a, mn - 1, d));
  const dag = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dag + 3);
  const forstaTorsdag = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const v = 1 + Math.round(((t.getTime() - forstaTorsdag.getTime()) / 86400000 - 3 + ((forstaTorsdag.getUTCDay() + 6) % 7)) / 7);
  return { ar: t.getUTCFullYear(), v };
}

function plusDag(iso: string, n: number): string {
  const [a, mn, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, mn - 1, d + n)).toISOString().slice(0, 10);
}

export interface VyRad {
  nyckel: string;
  titel: string;
  under?: string | null;
  /** En andra rad under (t.ex. maskinerna). */
  under2?: string | null;
  /** Under-raden är en avvikelse (orange). Ordet står alltid i texten — färgen förstärker bara. */
  varning?: boolean;
  hoger: string;
  hogerUnder?: string | null;
  dampad?: boolean;
  /** Prick före namnet (samma färg som delen i staplarna). */
  farg?: string;
  /** Kant runt pricken när fyllningen är ljus (björk). */
  kontur?: string | null;
}

/** En stapel = en dag (eller vecka); delarna staplas i TID_DELAR-ordning, nerifrån. */
export interface Stapel { nyckel: string; etikett: string; lang: string; min: number; delar: { nyckel: TidDel; min: number; farg: string }[] }

/** En rad som kan fällas ut: under den står detaljerna (maskinerna under Skotaren, flyttarna under Flytt). */
export interface VemRad extends VyRad { detaljer: VyRad[] }

/**
 * Sidan och PDF:en i samma ordning, så att ett barn förstår (Martin 2026-10-24):
 *  1. svaret: hur lång tid det tog, mot prognosen, och EN mening om varför,
 *  2. Vem gjorde vad? (en stapel, en rad per del — rader utan tid finns inte),
 *  3. Hur mycket virke? (mot prognosen, trädslagen),
 *  4. resten bakom tre rader: Dag för dag, Vad skulle göras?, Fler siffror.
 */
export interface ObjektVy {
  id: string;
  namn: string;
  filnamn: string;
  meta: string;
  /** "Maskinerna körde" / "Maskinerna har kört". */
  fraga: string;
  /** Maskinernas tid: "156 h 4 min". */
  svar: string;
  /** Prognosen i ord. `avvikelse` är orange när den är mer än 10 % över. */
  plan: { text: string; avvikelse: string | null; varning: boolean } | null;
  /** EN mening om varför — den största avvikelsen först. */
  forklaring: string | null;
  kvar: VyRad[] | null;
  vem: { stapel: Stapeldel[]; rader: VemRad[] } | null;
  virke: { svar: string; under: string | null; stapel: Stapeldel[] | null; rader: VyRad[] } | null;
  dagar: { staplar: Stapel[]; rubrik: string; not: string | null };
  uppdraget: VyRad[] | null;
  fler: VyRad[] | null;
}

const ROLL_NAMN: Record<Roll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' };

function rollKlar(s: Sammanstallning, roll: Roll): boolean {
  if (s.grupp === 'avslutad') return true;
  const id = roll === 'skordare' ? 'skordning' : 'skotning';
  return s.uppgifter.some(u => u.id === id && u.lage === 'klar');
}

/** "Prognos 56 h – blev 7 h 12 min kortare" / "… 7 h kvar enligt prognosen" / "… redan 35 h över". */
export function prognosText(faktiskMin: number, prognosTim: number | undefined, klar: boolean): { text: string; varning: boolean } {
  if (prognosTim == null) return { text: 'Ingen prognos', varning: false };
  const diff = Math.round(faktiskMin - prognosTim * 60);
  const t = tidText(Math.abs(diff));
  const p = `Prognos ${tidText(prognosTim * 60)}`;
  const varning = faktiskMin > prognosTim * 60 * (1 + OVER_PROGNOS_ANDEL);
  const lika = Math.abs(diff) < 60;
  if (klar) {
    if (lika) return { text: `${p} – blev som prognosen`, varning: false };
    return { text: `${p} – blev ${t} ${diff < 0 ? 'kortare' : 'längre'}`, varning };
  }
  if (diff >= 0 && lika) return { text: `${p} – nådd nu`, varning: false };
  if (diff < 0) return { text: `${p} – ${t} kvar enligt prognosen`, varning: false };
  return { text: `${p} – redan ${t} över`, varning };
}

function delarAv(d: DagDelar): Stapel['delar'] {
  return TID_DELAR.filter(k => (d[k] ?? 0) > 0).map(k => ({ nyckel: k, min: d[k]!, farg: TID_FARG[k] }));
}

function laggIhop(a: DagDelar, b: DagDelar): DagDelar {
  const ut: DagDelar = { ...a };
  for (const k of TID_DELAR) if (b[k]) ut[k] = (ut[k] ?? 0) + b[k]!;
  return ut;
}

export function staplar(perDag: Map<string, DagDelar>): { staplar: Stapel[]; rubrik: string } {
  const dagar = [...perDag.keys()].sort();
  if (dagar.length === 0) return { staplar: [], rubrik: 'Timmar per dag' };
  const forsta = dagar[0], sista = dagar[dagar.length - 1];
  const spann = Math.round((Date.parse(sista) - Date.parse(forsta)) / 86400000);
  if (spann > VECKOR_FRAN_DAGAR) {
    const perVecka = new Map<string, { etikett: string; lang: string; d: DagDelar }>();
    const nyckelFor = (d: string) => { const { ar, v } = isoVecka(d); return { k: `${ar}-${String(v).padStart(2, '0')}`, v }; };
    for (let d = forsta; d <= sista; d = plusDag(d, 7)) {
      const { k, v } = nyckelFor(d);
      if (!perVecka.has(k)) perVecka.set(k, { etikett: `v${v}`, lang: `vecka ${v}`, d: {} });
    }
    for (const [d, delar] of perDag) {
      const { k, v } = nyckelFor(d);
      const p = perVecka.get(k) ?? { etikett: `v${v}`, lang: `vecka ${v}`, d: {} };
      p.d = laggIhop(p.d, delar);
      perVecka.set(k, p);
    }
    return {
      staplar: [...perVecka.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([k, p]) => ({ nyckel: k, etikett: p.etikett, lang: p.lang, min: dagSumma(p.d), delar: delarAv(p.d) })),
      rubrik: 'Timmar per vecka',
    };
  }
  const ut: Stapel[] = [];
  for (let d = forsta; d <= sista; d = plusDag(d, 1)) {
    const delar = perDag.get(d) ?? {};
    ut.push({ nyckel: d, etikett: String(Number(d.slice(8, 10))), lang: veckodagDatum(d), min: dagSumma(delar), delar: delarAv(delar) });
  }
  return { staplar: ut, rubrik: 'Timmar per dag' };
}

/** Trädslagen i skördad volym: stapel + en rad per trädslag (m³ och andel; andelarna summerar till 100). */
export function tradVy(prod: Produktion): { stapel: Stapeldel[]; rader: VyRad[] } | null {
  const lista = prod.tradslag.filter(t => t.volym >= 0.5);
  if (lista.length === 0) return null;
  const pct = procentSomSummerar(lista.map(t => t.volym));
  const summa = lista.reduce((t, x) => t + x.volym, 0);
  return {
    stapel: lista.map((t, i) => ({ nyckel: t.namn, andel: t.volym / summa, farg: tradslagFarg(t.namn, i) })),
    rader: lista.map((t, i) => {
      const stil = tradslagStil(t.namn, i);
      return { nyckel: `trad-${t.namn}`, titel: t.namn, hoger: `${heltal(t.volym)} m³`, hogerUnder: pct[i] === 0 ? 'under 1 %' : `${pct[i]} %`, farg: stil.fyll, kontur: stil.kontur };
    }),
  };
}

const BARIGHET: Record<string, string> = { bra: 'Bra bärighet', medel: 'Medel bärighet', dalig: 'Dålig bärighet' };
const TERRANG: Record<string, string> = { flackt: 'flack terräng', kuperat: 'kuperad terräng', brant: 'brant terräng' };
const SKOTNINGSAVSTAND: Record<string, string> = { kort: 'kort skotningsavstånd', medel: 'medellångt skotningsavstånd', langt: 'långt skotningsavstånd' };

function arCertifierad(cert: string | null | undefined): string | null {
  const c = cert?.trim();
  if (!c || !/FSC|PEFC/i.test(c)) return null;
  return [/FSC/i.test(c) ? 'FSC' : null, /PEFC/i.test(c) ? 'PEFC' : null].filter(Boolean).join(', ');
}

function forsta<T>(...v: (T | null | undefined | false | '')[]): T | null {
  for (const x of v) if (x) return x as T;
  return null;
}

export function uppdragRader(o: ObjektRad, maskinNamn: (id: string) => string): VyRad[] {
  const r: VyRad[] = [];
  if ((o.volym ?? 0) > 0 || (o.areal ?? 0) > 0) {
    r.push({ nyckel: 'volym', titel: 'Virke', under: (o.areal ?? 0) > 0 ? `på ${decimal(o.areal!, 1)} ha` : null, hoger: (o.volym ?? 0) > 0 ? `${heltal(o.volym!)} m³` : '–' });
  }
  const forut = [o.barighet ? BARIGHET[o.barighet] ?? o.barighet : null, o.terrang ? TERRANG[o.terrang] ?? o.terrang : null, o.skotningsavstand ? SKOTNINGSAVSTAND[o.skotningsavstand] ?? o.skotningsavstand : null].filter(Boolean) as string[];
  if (forut.length) {
    const t = forut.join(' · ');
    r.push({ nyckel: 'forutsattningar', titel: 'Marken', under: t.charAt(0).toUpperCase() + t.slice(1), hoger: '' });
  }
  const namn = [o.skordare_maskin_id ? maskinNamn(o.skordare_maskin_id) : null, o.skotare_maskin_id ? maskinNamn(o.skotare_maskin_id) : null].filter(Boolean) as string[];
  const band = o.skordare_band && o.skotare_band ? 'Band på skördare och skotare'
    : o.skordare_band ? 'Band på skördaren' : o.skotare_band ? 'Band på skotaren' : null;
  const utrustning = [band, o.skotare_extra_vagn ? 'extra vagn' : null, o.skotare_lastreder_breddat ? 'breddade lastreder' : null, o.transport_trailer_in ? 'trailer in' : null].filter(Boolean) as string[];
  if (namn.length || utrustning.length) {
    const u = utrustning.join(' · ');
    r.push({ nyckel: 'maskiner', titel: 'Maskinerna', under: namn.length ? namn.join(' och ') : (u.charAt(0).toUpperCase() + u.slice(1)), under2: namn.length && u ? u.charAt(0).toUpperCase() + u.slice(1) : null, hoger: '' });
  }
  if (o.skordare_manuell_fallning) r.push({ nyckel: 'manuell', titel: 'Fälla för hand', under: o.skordare_manuell_fallning_text?.trim() || null, hoger: 'Ja' });
  if (o.grot) r.push({ nyckel: 'grot', titel: 'GROT', under: 'Riset ska tas ut', hoger: 'Ja' });
  const cert = arCertifierad(o.cert);
  if (cert) r.push({ nyckel: 'cert', titel: 'Certifiering', hoger: cert });
  if (o.anteckningar?.trim()) r.push({ nyckel: 'vida', titel: 'Från Vida', under: o.anteckningar.trim(), hoger: '' });
  const tanka = forsta<string>(o.forardirektiv?.trim(), o.info_anteckningar?.trim());
  if (tanka) r.push({ nyckel: 'tanka', titel: 'Att tänka på', under: tanka, hoger: '' });
  if (o.markagare_ska_ha_ved) r.push({ nyckel: 'ved', titel: 'Ved till markägaren', under: o.markagare_ved_text?.trim() || null, hoger: 'Ja' });
  return r;
}

const UPPGIFT_NAMN = { skordning: 'Skördning', skotning: 'Skotning', grot: 'GROT' } as const;

/** Maskinernas tid på objektet: skördare + skotare (det som är kört där). Flytt och planering står i sina egna rader. */
export function maskinMin(s: Sammanstallning): number {
  return s.rollMin.skordare + s.rollMin.skotare;
}

/** De roller som räknas i planen: skördaren (inte på en GROT-trakt utan skördartid) och skotaren. */
function roller(s: Sammanstallning): Roll[] {
  return (['skordare', 'skotare'] as const).filter(r => !(r === 'skordare' && s.objekt.typ === 'grot' && s.rollMin.skordare === 0));
}
/**
 * Appens frysta prognos (objekt.app_prognos, se Helikopter) i ord: "appen 48 h – appen låg närmast" /
 * "– planeraren låg närmast" / "– lika nära som planerarens". Bara när appen har en fryst prognos (objekt äldre än
 * 2026-10-24 har ingen — inget påhittat); på en pågående roll eller utan planerarens prognos står bara talet.
 * Närmast = minsta avstånd i timmar till utfallet; under en halvtimmes skillnad är det lika.
 */
export function appPrognosRad(faktiskMin: number, planTim: number | undefined, appTim: number | undefined, klar: boolean): string | null {
  if (appTim == null) return null;
  const a = `appen ${tidText(appTim * 60)}`;
  if (!klar || planTim == null) return a;
  const f = faktiskMin / 60;
  const dApp = Math.abs(f - appTim);
  const dPlan = Math.abs(f - planTim);
  if (Math.abs(dApp - dPlan) < 0.5) return `${a} – lika nära som planerarens`;
  return `${a} – ${dApp < dPlan ? 'appen' : 'planeraren'} låg närmast`;
}

/**
 * Prognosen i ord. Bara när varje roll som räknas har en prognos (annars vore summan för liten). Jämförs med maskinernas
 * tid (skördare + skotare): flytt och planering har ingen prognos.
 */
export function planText(s: Sammanstallning): ObjektVy['plan'] {
  const r = roller(s);
  if (r.length === 0 || r.some(x => s.prognos[x] == null)) return null;
  const planTim = r.reduce((t, x) => t + s.prognos[x]!, 0);
  if (planTim <= 0) return null;
  const maskinM = r.reduce((t, x) => t + s.rollMin[x], 0);
  const diff = Math.round(maskinM - planTim * 60);
  const text = `Prognos för maskinerna: ${tidText(planTim * 60)}.`;
  const varning = maskinM > planTim * 60 * (1 + OVER_PROGNOS_ANDEL);
  if (s.grupp !== 'avslutad') {
    if (diff < 0) return { text, avvikelse: `${tidText(-diff)} kvar enligt prognosen.`, varning: false };
    if (diff === 0) return { text, avvikelse: 'Prognosen är nådd.', varning: false };
    return { text, avvikelse: `Redan ${tidText(diff)} över prognosen.`, varning };
  }
  if (diff === 0) return { text, avvikelse: 'Det blev som prognosen.', varning: false };
  return { text, avvikelse: `${tidText(Math.abs(diff))} ${diff > 0 ? 'mer' : 'mindre'} än prognosen.`, varning };
}

/** EN mening om varför: per roll som avvek minst en timme, den största först. */
export function forklaringText(s: Sammanstallning): string | null {
  const delar: { diff: number; text: string }[] = [];
  for (const r of roller(s)) {
    const p = s.prognos[r];
    if (p == null || s.rollMin[r] <= 0) continue;
    const diff = Math.round(s.rollMin[r] - p * 60);
    if (Math.abs(diff) < 60) continue;
    const klar = rollKlar(s, r);
    const vem = ROLL_NAMN[r];
    if (diff > 0) delar.push({ diff, text: klar ? `${vem} behövde ${tidText(diff)} mer än prognosen.` : `${vem} har redan gått ${tidText(diff)} över prognosen.` });
    else if (klar) delar.push({ diff, text: `${vem} var klar ${tidText(-diff)} tidigare.` });
  }
  if (delar.length === 0) return null;
  return delar.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map(d => d.text).join(' ');
}

function maskinDetaljer(s: Sammanstallning, roll: Roll): VyRad[] {
  return s.maskiner.filter(x => x.roll === roll).map(x => ({
    nyckel: `maskin-${x.maskin_id}`,
    titel: x.namn,
    under: x.manuell ? 'inskrivet för hand' : `${x.dagar} ${x.dagar === 1 ? 'dag' : 'dagar'}`,
    hoger: timmar(x.min),
  }));
}

function flyttDetaljer(s: Sammanstallning): VyRad[] {
  const r: VyRad[] = s.flyttar.map(f => ({
    nyckel: f.id,
    titel: `${f.maskin}${f.fran ? ` från ${f.fran}` : ''}`,
    under: [f.fran ? null : 'varifrån saknas', kortDatum(f.datum), f.km != null ? `${heltal(f.km)} km` : null].filter(Boolean).join(' · '),
    hoger: f.min != null ? timmar(f.min) : '–',
    hogerUnder: f.min == null ? 'tid saknas' : null,
  }));
  if (s.flytthjalpMin > 0) r.push({ nyckel: 'flytthjalp', titel: 'Hjälp att flytta', under: 'inskriven tid', hoger: timmar(s.flytthjalpMin) });
  return r;
}

function extraVem(nyckel: TidDel, titel: string, poster: Sammanstallning['planering']): VemRad | null {
  const min = poster.reduce((t, p) => t + p.min, 0);
  if (min <= 0) return null;
  const personer = [...new Set(poster.map(p => p.person).filter((x): x is string => !!x))];
  const dagar = new Set(poster.map(p => p.datum)).size;
  const under = [personer.join(', ') || null, `${dagar} ${dagar === 1 ? 'dag' : 'dagar'}`].filter(Boolean).join(' · ');
  return { nyckel, titel, under, hoger: timmar(min), farg: TID_FARG[nyckel], detaljer: [] };
}

export function vemVy(s: Sammanstallning): ObjektVy['vem'] {
  const rader: VemRad[] = [];
  for (const roll of roller(s)) {
    const min = s.rollMin[roll];
    if (min <= 0) continue;
    const p = s.prognos[roll];
    const over = p != null && min / 60 > p * (1 + OVER_PROGNOS_ANDEL);
    const app = appPrognosRad(min, p, s.appPrognos[roll], rollKlar(s, roll));
    rader.push({
      nyckel: roll, titel: ROLL_NAMN[roll],
      under: [p != null ? `prognos ${tidText(p * 60)}` : 'ingen prognos', app].filter(Boolean).join(' · '),
      varning: over, hoger: timmar(min), farg: TID_FARG[roll], detaljer: maskinDetaljer(s, roll),
    });
  }
  if (s.flyttMin > 0 || s.flyttar.length > 0) {
    const n = new Set(s.flyttar.map(f => f.maskin)).size;
    rader.push({
      nyckel: 'flytt', titel: 'Flytt hit',
      under: n ? `${n} ${n === 1 ? 'maskin kördes' : 'maskiner kördes'} hit` : 'hjälp att flytta',
      hoger: s.flyttMin > 0 ? timmar(s.flyttMin) : '–', farg: TID_FARG.flytt, detaljer: flyttDetaljer(s),
    });
  }
  for (const r of [extraVem('planering', 'Planering', s.planering), extraVem('manuellt', 'Manuellt arbete', s.manuellt), extraVem('annat', 'Annat arbete', s.annat)]) {
    if (r) rader.push(r);
  }
  if (rader.length === 0) return null;
  const min: Partial<Record<TidDel, number>> = {
    skordare: s.rollMin.skordare, skotare: s.rollMin.skotare, flytt: s.flyttMin,
    planering: s.planering.reduce((t, p) => t + p.min, 0), manuellt: s.manuellt.reduce((t, p) => t + p.min, 0), annat: s.annat.reduce((t, p) => t + p.min, 0),
  };
  const total = TID_DELAR.reduce((t, k) => t + (min[k] ?? 0), 0);
  const stapel: Stapeldel[] = total > 0
    ? TID_DELAR.filter(k => (min[k] ?? 0) > 0).map(k => ({ nyckel: k, andel: min[k]! / total, farg: TID_FARG[k] }))
    : [];
  return { stapel, rader };
}

export function virkeVy(o: ObjektRad, prod: Produktion): ObjektVy['virke'] {
  if (prod.volym < 0.5) return null;
  const trad = tradVy(prod);
  return {
    svar: `${heltal(prod.volym)} m³`,
    under: (o.volym ?? 0) > 0 ? `prognos ${heltal(o.volym!)} m³` : null,
    stapel: trad?.stapel ?? null,
    rader: trad?.rader ?? [],
  };
}

export function flerVy(s: Sammanstallning, prod: Produktion): VyRad[] | null {
  const r: VyRad[] = [];
  if (prod.stammar > 0) r.push({ nyckel: 'trad', titel: 'Träd', hoger: heltal(prod.stammar) });
  if (prod.stammar > 0 && prod.volym >= 0.5) r.push({ nyckel: 'pertrad', titel: 'Virke per träd', under: 'medelstam', hoger: `${decimal(prod.volym / prod.stammar, 2)} m³` });
  if (prod.volym >= 0.5 && s.totalMin >= 60) r.push({ nyckel: 'pertimme', titel: 'Virke per timme', under: 'all tid på objektet', hoger: `${decimal(prod.volym / (s.totalMin / 60))} m³` });
  if (s.bransle > 0) r.push({ nyckel: 'diesel', titel: 'Diesel', under: prod.volym >= 0.5 ? `${decimal(s.bransle / prod.volym)} liter per m³` : null, hoger: `${heltal(s.bransle)} liter` });
  return r.length ? r : null;
}

export function byggObjektVy(s: Sammanstallning, prod: Produktion, maskinNamn: (id: string) => string): ObjektVy {
  const o = s.objekt;
  const namn = o.namn?.trim() || o.vo_nummer || 'Objekt';
  const typ = typLabel((o.typ ?? null) as ObjektTyp);
  const lage = s.grupp === 'avslutad' ? (s.klart ? `klart ${kortDatum(s.klart)}` : 'klart')
    : s.grupp === 'planerad' ? 'planerat' : s.skotningKvar ? 'skotning kvar' : 'pågår';
  const meta = [typ === 'Typ okänd' ? null : typ, o.bolag?.trim() || null, lage].filter(Boolean).join(' · ');
  const kort = maskinMin(s);
  const fraga = kort <= 0 ? 'Maskinerna har inte kört här än' : s.grupp === 'avslutad' ? 'Maskinerna körde' : 'Maskinerna har kört';
  const svar = kort > 0 ? tidText(kort) : 'Ingen tid';

  const kvar = s.grupp === 'pagar' && s.uppgifter.length
    ? s.uppgifter.map(u => ({
        nyckel: u.id,
        titel: UPPGIFT_NAMN[u.id],
        under: u.lage === 'klar' ? (u.datum ? `Klar ${kortDatum(u.datum)}` : 'Klar') : u.lage === 'pagar' ? 'Pågår' : 'Inte börjat',
        hoger: u.lage === 'klar' ? 'Klar' : 'Kvar',
        dampad: u.lage === 'klar',
      }))
    : null;

  const st = staplar(s.perDag);
  const manuell = s.maskiner.some(m => m.manuell);
  const uppdraget = uppdragRader(o, maskinNamn);
  return {
    id: o.id,
    namn,
    filnamn: `Objektöversikt ${namn}.pdf`.replace(/[\\/:*?"<>|]/g, '-'),
    meta,
    fraga,
    svar,
    plan: kort > 0 ? planText(s) : null,
    forklaring: forklaringText(s),
    kvar,
    vem: vemVy(s),
    virke: virkeVy(o, prod),
    dagar: { staplar: st.staplar, rubrik: st.rubrik, not: manuell ? 'Tid som skrivits in för hand syns inte här.' : null },
    uppdraget: uppdraget.length ? uppdraget : null,
    fler: flerVy(s, prod),
  };
}

// ── Listan ─────────────────────────────────────────────────────────────────

export interface ListPost { id: string; namn: string; under: string; hoger: string; grupp: Sammanstallning['grupp']; klart: string | null }
export interface ListGrupp { nyckel: string; rubrik: string; poster: ListPost[] }

export function listPost(s: Sammanstallning): ListPost {
  const o = s.objekt;
  const typ = typLabel((o.typ ?? null) as ObjektTyp);
  const lage = s.skotningKvar ? 'skotning kvar'
    : s.grupp === 'avslutad' ? kortDatum(s.klart)
    : s.totalMin <= 0 ? 'ingen tid än'
    : s.grupp === 'planerad' ? 'planerat' : null;
  return {
    id: o.id,
    namn: o.namn?.trim() || o.vo_nummer || 'Objekt',
    under: [typ === 'Typ okänd' ? null : typ, lage].filter(Boolean).join(' · '),
    hoger: maskinMin(s) > 0 ? tidText(maskinMin(s)) : '–',
    grupp: s.grupp,
    klart: s.klart,
  };
}

export function sokPoster(poster: ListPost[], fraga: string): ListPost[] {
  const ord = fraga.toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
  if (!ord.length) return poster;
  return poster.filter(p => ord.every(o => p.namn.toLocaleLowerCase('sv').includes(o)));
}

/** Pågår, Planerade, sedan de avslutade per månad (nyast först), utan datum sist. */
export function grupperaPoster(poster: ListPost[], idag = new Date()): ListGrupp[] {
  const ut: ListGrupp[] = [];
  const pagar = poster.filter(p => p.grupp === 'pagar').sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const plan = poster.filter(p => p.grupp === 'planerad').sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  if (pagar.length) ut.push({ nyckel: 'pagar', rubrik: 'Pågår', poster: pagar });
  if (plan.length) ut.push({ nyckel: 'planerad', rubrik: 'Planerade', poster: plan });
  const manad = new Map<string, ListPost[]>();
  for (const p of poster.filter(x => x.grupp === 'avslutad')) {
    const k = p.klart?.slice(0, 7) ?? 'utan';
    manad.set(k, [...(manad.get(k) ?? []), p]);
  }
  const iAr = idag.getFullYear();
  for (const k of [...manad.keys()].sort((a, b) => (a === 'utan' ? 1 : b === 'utan' ? -1 : b.localeCompare(a)))) {
    const lista = manad.get(k)!.sort((a, b) => (b.klart ?? '').localeCompare(a.klart ?? '') || a.namn.localeCompare(b.namn, 'sv'));
    if (k === 'utan') { ut.push({ nyckel: k, rubrik: 'Avslutade utan datum', poster: lista }); continue; }
    const [ar, m] = k.split('-').map(Number);
    const namn = MANADER[m - 1].charAt(0).toUpperCase() + MANADER[m - 1].slice(1);
    ut.push({ nyckel: k, rubrik: ar === iAr ? namn : `${namn} ${ar}`, poster: lista });
  }
  return ut;
}
