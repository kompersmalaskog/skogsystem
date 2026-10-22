// Objektöversiktens vymodell — ALL text och alla tal som sidan och PDF:en visar. Sidan och PDF:en ritar bara, så de
// kan aldrig säga olika saker (samma mönster som markägarrapporten).
//
// Texten förklarar sig själv (Martin 2026-10-22: "skriv det då jag fattar inget av det"): inte "48,8/56" utan
// "Prognos 56 tim – blev 7 tim kortare".

import { TID_DELAR, dagSumma, type DagDelar, type Produktion, type Roll, type Sammanstallning, type ObjektRad, type TidDel } from './berakna';
import { heltal, procentSomSummerar, type Stapeldel } from '@/lib/markagarrapport/vy';
import { DELFARG, FARG } from '@/lib/design/tokens';
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil';
import { tradslagFarg, tradslagStil } from '@/lib/tradslag';
import { typLabel, type ObjektTyp } from '@/lib/objekt/typ';

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

/** "157 tim 36 min", "12 tim", "46 min". */
export function tidText(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${heltal(h)} tim` : `${heltal(h)} tim ${r} min`;
}

/** "48,8 tim" (en decimal); under en timme i minuter. */
export function timmar(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 6) / 10;
  return `${h.toLocaleString('sv-SE', { minimumFractionDigits: h % 1 ? 1 : 0, maximumFractionDigits: 1 })} tim`;
}

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

export interface ObjektVy {
  id: string;
  namn: string;
  filnamn: string;
  meta: string;
  fraga: string;
  svar: string;
  underSvar: string | null;
  tid: { rader: VyRad[]; staplar: Stapel[]; stapelRubrik: string; not: string | null };
  flyttar: VyRad[] | null;
  blev: VyRad[] | null;
  /** Vilka träd det blev: andel av skördad volym per trädslag. */
  trad: { stapel: Stapeldel[]; rader: VyRad[] } | null;
  kvar: VyRad[] | null;
  uppdraget: VyRad[] | null;
}

const ROLL_NAMN: Record<Roll, string> = { skordare: 'Skördaren', skotare: 'Skotaren' };

function rollKlar(s: Sammanstallning, roll: Roll): boolean {
  if (s.grupp === 'avslutad') return true;
  const id = roll === 'skordare' ? 'skordning' : 'skotning';
  return s.uppgifter.some(u => u.id === id && u.lage === 'klar');
}

/** "Prognos 56 tim – blev 7 tim kortare" / "… 7 tim kvar enligt prognosen" / "… redan 35 tim över". */
export function prognosText(faktiskMin: number, prognosTim: number | undefined, klar: boolean): { text: string; varning: boolean } {
  if (prognosTim == null) return { text: 'Ingen prognos', varning: false };
  const faktiskTim = faktiskMin / 60;
  const diff = faktiskTim - prognosTim;
  const tim = Math.round(Math.abs(diff));
  const p = `Prognos ${decimal(prognosTim, prognosTim % 1 ? 1 : 0)} tim`;
  const varning = faktiskTim > prognosTim * (1 + OVER_PROGNOS_ANDEL);
  if (klar) {
    if (tim === 0) return { text: `${p} – blev som prognosen`, varning: false };
    return { text: `${p} – blev ${tim} tim ${diff < 0 ? 'kortare' : 'längre'}`, varning };
  }
  if (diff >= 0 && tim === 0) return { text: `${p} – nådd nu`, varning: false };
  if (diff < 0) return { text: `${p} – ${tim} tim kvar enligt prognosen`, varning: false };
  return { text: `${p} – redan ${tim} tim över`, varning };
}

function maskinRad(s: Sammanstallning, roll: Roll): string | null {
  const m = s.maskiner.filter(x => x.roll === roll);
  if (m.length === 0) return null;
  if (m.length === 1) {
    const x = m[0];
    return x.manuell ? `${x.namn} · inskrivet för hand` : `${x.namn} · ${x.dagar} ${x.dagar === 1 ? 'dag' : 'dagar'}`;
  }
  return m.map(x => `${x.namn} ${timmar(x.min)}`).join(' · ');
}

function extraRad(nyckel: string, titel: string, poster: Sammanstallning['planering'], tomText: string): VyRad {
  const min = poster.reduce((t, p) => t + p.min, 0);
  if (min <= 0) return { nyckel, titel, under: tomText, hoger: '–', dampad: true };
  const personer = [...new Set(poster.map(p => p.person).filter((x): x is string => !!x))];
  const dagar = new Set(poster.map(p => p.datum)).size;
  const under = [personer.join(', ') || null, `${dagar} ${dagar === 1 ? 'dag' : 'dagar'}`].filter(Boolean).join(' · ');
  return { nyckel, titel, under, hoger: timmar(min) };
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
export function tradVy(prod: Produktion): ObjektVy['trad'] {
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
    r.push({ nyckel: 'volym', titel: 'Volym', under: (o.areal ?? 0) > 0 ? `på ${decimal(o.areal!, 1)} ha` : null, hoger: (o.volym ?? 0) > 0 ? `${heltal(o.volym!)} m³` : '–' });
  }
  const forut = [o.barighet ? BARIGHET[o.barighet] ?? o.barighet : null, o.terrang ? TERRANG[o.terrang] ?? o.terrang : null, o.skotningsavstand ? SKOTNINGSAVSTAND[o.skotningsavstand] ?? o.skotningsavstand : null].filter(Boolean) as string[];
  if (forut.length) {
    const t = forut.join(' · ');
    r.push({ nyckel: 'forutsattningar', titel: 'Förutsättningar', under: t.charAt(0).toUpperCase() + t.slice(1), hoger: '' });
  }
  const namn = [o.skordare_maskin_id ? maskinNamn(o.skordare_maskin_id) : null, o.skotare_maskin_id ? maskinNamn(o.skotare_maskin_id) : null].filter(Boolean) as string[];
  const band = o.skordare_band && o.skotare_band ? 'Band på skördare och skotare'
    : o.skordare_band ? 'Band på skördaren' : o.skotare_band ? 'Band på skotaren' : null;
  const utrustning = [band, o.skotare_extra_vagn ? 'extra vagn' : null, o.skotare_lastreder_breddat ? 'breddade lastreder' : null, o.transport_trailer_in ? 'trailer in' : null].filter(Boolean) as string[];
  if (namn.length || utrustning.length) {
    const u = utrustning.join(' · ');
    r.push({ nyckel: 'maskiner', titel: 'Maskinerna', under: namn.length ? namn.join(' och ') : (u.charAt(0).toUpperCase() + u.slice(1)), under2: namn.length && u ? u.charAt(0).toUpperCase() + u.slice(1) : null, hoger: '' });
  }
  if (o.skordare_manuell_fallning) r.push({ nyckel: 'manuell', titel: 'Manuell fällning', under: o.skordare_manuell_fallning_text?.trim() || null, hoger: 'Ja' });
  if (o.grot) r.push({ nyckel: 'grot', titel: 'GROT', under: 'Riset tas ut', hoger: 'Ja' });
  const cert = arCertifierad(o.cert);
  if (cert) r.push({ nyckel: 'cert', titel: 'Certifiering', hoger: cert });
  if (o.anteckningar?.trim()) r.push({ nyckel: 'vida', titel: 'Vidas direktiv', under: o.anteckningar.trim(), hoger: '' });
  const tanka = forsta<string>(o.forardirektiv?.trim(), o.info_anteckningar?.trim());
  if (tanka) r.push({ nyckel: 'tanka', titel: 'Att tänka på', under: tanka, hoger: '' });
  if (o.markagare_ska_ha_ved) r.push({ nyckel: 'ved', titel: 'Ved till markägaren', under: o.markagare_ved_text?.trim() || null, hoger: 'Ja' });
  return r;
}

const UPPGIFT_NAMN = { skordning: 'Skördning', skotning: 'Skotning', grot: 'GROT' } as const;

export function byggObjektVy(s: Sammanstallning, prod: Produktion, maskinNamn: (id: string) => string): ObjektVy {
  const o = s.objekt;
  const namn = o.namn?.trim() || o.vo_nummer || 'Objekt';
  const typ = typLabel((o.typ ?? null) as ObjektTyp);
  const lage = s.grupp === 'avslutad' ? (s.klart ? `klart ${kortDatum(s.klart)}` : 'klart')
    : s.grupp === 'planerad' ? 'planerat' : s.skotningKvar ? 'skotning kvar' : 'pågår';
  const meta = [typ === 'Typ okänd' ? null : typ, o.bolag?.trim() || null, lage].filter(Boolean).join(' · ');
  const fraga = s.grupp === 'avslutad' ? 'Hur lång tid tog objektet?' : s.grupp === 'planerad' ? 'Hur lång tid har det tagit?' : 'Hur lång tid har det tagit hittills?';
  const svar = s.totalMin > 0 ? tidText(s.totalMin) : 'Ingen tid än';
  const underSvar = prod.volym >= 0.5
    ? `${heltal(prod.volym)} m³ skördat${s.totalMin >= 60 ? ` – ${decimal(prod.volym / (s.totalMin / 60))} m³ per timme` : ''}`
    : null;

  // ── Vart gick tiden? ─────────────────────────────────────────────────────
  const tidRader: VyRad[] = [];
  for (const roll of ['skordare', 'skotare'] as const) {
    const min = s.rollMin[roll];
    if (roll === 'skordare' && o.typ === 'grot' && min === 0) continue;
    if (min <= 0) {
      tidRader.push({ nyckel: roll, titel: ROLL_NAMN[roll], under: s.prognos[roll] != null ? `Prognos ${decimal(s.prognos[roll]!, s.prognos[roll]! % 1 ? 1 : 0)} tim – ingen tid än` : 'Ingen tid än', hoger: '–', dampad: true, farg: TID_FARG[roll] });
      continue;
    }
    const p = prognosText(min, s.prognos[roll], rollKlar(s, roll));
    tidRader.push({ nyckel: roll, titel: ROLL_NAMN[roll], under: p.text, varning: p.varning, under2: maskinRad(s, roll), hoger: timmar(min), farg: TID_FARG[roll] });
  }
  const antal = s.flyttar.length;
  const utanTid = s.flyttar.filter(f => f.min == null).length;
  if (s.flyttMin > 0 || antal > 0) {
    const delar = [antal ? `${antal} ${antal === 1 ? 'flytt' : 'flyttar'} hit` : null, s.flytthjalpMin > 0 ? `${timmar(s.flytthjalpMin)} flytthjälp` : null, utanTid ? `${utanTid} saknar tid` : null].filter(Boolean);
    tidRader.push({ nyckel: 'flytt', titel: 'Flytt', under: delar.join(' · '), hoger: s.flyttMin > 0 ? timmar(s.flyttMin) : '–', farg: TID_FARG.flytt });
  } else {
    tidRader.push({ nyckel: 'flytt', titel: 'Flytt', under: 'Ingen flytt registrerad', hoger: '–', dampad: true, farg: TID_FARG.flytt });
  }
  tidRader.push({ ...extraRad('planering', 'Planering', s.planering, 'Ingen tid inskriven'), farg: TID_FARG.planering });
  tidRader.push({ ...extraRad('manuellt', 'Manuellt arbete', s.manuellt, 'Ingen tid inskriven'), farg: TID_FARG.manuellt });
  if (s.annat.length) tidRader.push({ ...extraRad('annat', 'Annat arbete', s.annat, ''), farg: TID_FARG.annat });
  const st = staplar(s.perDag);
  const manuell = s.maskiner.some(m => m.manuell);

  // ── Hur kom maskinerna hit? ──────────────────────────────────────────────
  const flyttRader: VyRad[] = s.flyttar.map(f => ({
    nyckel: f.id,
    titel: f.maskin,
    under: [f.fran ? `Från ${f.fran}` : 'Varifrån saknas', kortDatum(f.datum), f.km != null ? `${heltal(f.km)} km` : null].filter(Boolean).join(' · '),
    hoger: f.min != null ? timmar(f.min) : '–',
    hogerUnder: f.min == null ? 'tid saknas' : null,
    farg: f.roll ? TID_FARG[f.roll] : FARG.text3,
  }));
  const flyttade = new Set(s.flyttar.map(f => f.maskin));
  for (const m of s.maskiner) {
    if (flyttade.has(m.namn)) continue;
    flyttRader.push({ nyckel: `utan-${m.maskin_id}`, titel: m.namn, under: 'Ingen flytt registrerad', hoger: '–', dampad: true, farg: TID_FARG[m.roll] });
  }

  // ── Vad blev det? ────────────────────────────────────────────────────────
  const blev: VyRad[] = [];
  if (prod.volym >= 0.5) {
    blev.push({ nyckel: 'volym', titel: 'Skördat', under: (o.volym ?? 0) > 0 ? `Prognos ${heltal(o.volym!)} m³` : null, hoger: `${heltal(prod.volym)} m³` });
    if (prod.stammar > 0) {
      blev.push({ nyckel: 'stammar', titel: 'Stammar', hoger: heltal(prod.stammar) });
      blev.push({ nyckel: 'medelstam', titel: 'Medelstam', under: 'm³ per träd', hoger: `${decimal(prod.volym / prod.stammar, 2)} m³` });
    }
    if (s.bransle > 0) blev.push({ nyckel: 'bransle', titel: 'Bränsle', under: 'skördare och skotare', hoger: `${decimal(s.bransle / prod.volym)} l/m³`, hogerUnder: `${heltal(s.bransle)} liter` });
  }

  // ── Vad är kvar? (bara pågående) ─────────────────────────────────────────
  const kvar = s.grupp === 'pagar' && s.uppgifter.length
    ? s.uppgifter.map(u => ({
        nyckel: u.id,
        titel: UPPGIFT_NAMN[u.id],
        under: u.lage === 'klar' ? (u.datum ? `Klar ${kortDatum(u.datum)}` : 'Klar') : u.lage === 'pagar' ? 'Pågår' : 'Inte börjat',
        hoger: u.lage === 'klar' ? 'Klar' : 'Kvar',
        dampad: u.lage === 'klar',
      }))
    : null;

  const uppdraget = uppdragRader(o, maskinNamn);
  return {
    id: o.id,
    namn,
    filnamn: `Objektöversikt ${namn}.pdf`.replace(/[\\/:*?"<>|]/g, '-'),
    meta,
    fraga,
    svar,
    underSvar,
    tid: { rader: tidRader, staplar: st.staplar, stapelRubrik: st.rubrik, not: manuell ? 'Tid som skrivits in för hand syns inte i staplarna.' : null },
    flyttar: flyttRader.length ? flyttRader : null,
    blev: blev.length ? blev : null,
    trad: prod.volym >= 0.5 ? tradVy(prod) : null,
    kvar,
    uppdraget: uppdraget.length ? uppdraget : null,
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
    hoger: s.totalMin > 0 ? `${heltal(s.totalMin / 60)} tim` : '–',
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
