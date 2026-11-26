// Sidan "Ligger i skogen" (/uppfoljning/i-skogen) och dess A4: varje trakt med
// bara det Martin bad om — hur länge virket legat, när skördaren och skotaren
// körde, och vädret under hela tiden. Volym och läge står redan i Uppföljning
// och upprepas inte här (Martin 2026-11-21).
//
// EN modell för sidan och PDF:en, så de aldrig kan säga olika. Rena funktioner.
import { arRisjobb } from '@/lib/objekt/typ';
import type { Dokument, DokRad } from '@/lib/arbetsmiljo/dokument';
import type { UppfoljningObjekt } from './transform';
import { kvarM3, sektionAv, type Sektion } from './sektion';
import { iSkogen, dagOrd, dagarMellan, kortDatum, period, stegFor, KLARA_VISAS_DAGAR, type StegIndata } from './iSkogen';
import { summera, tempText, type VaderSumma, type VaderSvar } from './vader';

/** Samma urval som kortet i menyn: allt virke som skördas eller ligger kvar + nyss framme. */
export function skogenAvObjekt(objekt: UppfoljningObjekt[], nu: number) {
  const b: Record<Sektion, UppfoljningObjekt[]> = { skordare: [], oskotat: [], ovrigt: [], avslutade: [] };
  for (const o of objekt) b[sektionAv(o)].push(o);
  const skordas = new Set(b.skordare);
  const paBacken = [...b.skordare, ...b.oskotat].filter(o => !arRisjobb(o) && kvarM3(o) > 0);
  const skogen = iSkogen(paBacken, b.avslutade.filter(o => !arRisjobb(o)), o => skordas.has(o), kvarM3, nu);
  return { skogen, skordas };
}

export type SkogKort = {
  nyckel: string;
  /** Adressen till traktens vanliga vy. */
  urlId: string;
  vo: string | null;
  namn: string;
  /** Dagar sedan skördaren blev klar (för klara: till sista lasset). null = skördas eller okänt. */
  dagar: number | null;
  /** En rad per steg: "Skördaren fällde 2–6 nov · 5 dagar". */
  steg: string[];
  /** Perioden vädret gäller. null = inga datum. */
  period: { fran: string; till: string } | null;
  /** Tidslinjen i traktens ark. */
  tid: Tidslinje;
};

/** Datumen från stubbe till avlägg. null = har inte hänt (eller okänt). */
export type Tidslinje = {
  avverkStart: string | null;
  avverkSlut: string | null;   // null = skördaren kör fortfarande
  skotStart: string | null;
  skotSlut: string | null;     // null = skotaren har inte börjat eller kör fortfarande
  egenSkotning: boolean;
};

/** Första fällningsdagen: skördarens första dag med produktion om den är läst, annars
 *  dim_objekt.start_date — men bara om den inte ligger efter sista fällningsdagen (raden blandar
 *  maskiner: Bondeskog 2026 bar skotarens start, 20 nov, mot sista fällning 6 nov). */
function forstaDag(o: UppfoljningObjekt, forsta: string | undefined): string | null {
  if (forsta) return forsta;
  const s = o.skordareStart?.slice(0, 10) ?? null;
  const sista = o.sistaAvverkning?.slice(0, 10) ?? null;
  return s && sista && s > sista ? null : s;
}

function stegIndata(o: UppfoljningObjekt, skordareKlar: boolean, forsta?: string): StegIndata {
  return {
    skordarDagar: [],
    skordareStart: forstaDag(o, forsta),
    sistaAvverkning: o.sistaAvverkning,
    skordareKlar,
    lassDagar: [],
    skotareStart: o.skotareStart,
    skotareLastDate: o.skotareLastDate,
    skotningKlar: o.skotningAvslutad,
    egenSkotning: o.egenSkotning === true,
  };
}

/** Nyckeln ett kort har — också nyckeln i kartan med första fällningsdagar. */
export function kortNyckel(o: UppfoljningObjekt): string {
  return o.vo_nummer || o.skordareObjektId || o.skotareObjektId || o.namn;
}

function tidslinje(i: StegIndata): Tidslinje {
  const avverkStart = i.skordareStart?.slice(0, 10) ?? null;
  const avverkSlut = i.skordareKlar ? (i.sistaAvverkning?.slice(0, 10) ?? null) : null;
  const skotStart = i.egenSkotning ? null : (i.skotareStart?.slice(0, 10) ?? null);
  const skotSlut = skotStart && i.skotningKlar ? (i.skotareLastDate?.slice(0, 10) ?? null) : null;
  return { avverkStart, avverkSlut, skotStart, skotSlut, egenSkotning: i.egenSkotning };
}

function kortFor(o: UppfoljningObjekt, dagar: number | null, skordareKlar: boolean, idag: string, forsta?: string): SkogKort {
  const i = stegIndata(o, skordareKlar, forsta);
  return {
    nyckel: kortNyckel(o),
    urlId: o.vo_nummer || o.skordareObjektId || o.skotareObjektId || '',
    vo: o.vo_nummer || null,
    namn: o.namn,
    dagar,
    steg: stegFor(i, idag).map(s => `${s.rubrik} ${s.under}`),
    period: period(i, idag),
    tid: tidslinje(i),
  };
}

/** Korten: i skogen (längst legat först), sedan framme vid avlägget (senast först). */
export function skogKort(objekt: UppfoljningObjekt[], nu: number, idag: string, forsta: Map<string, string> = new Map()): { iSkogen: SkogKort[]; framme: SkogKort[] } {
  const { skogen, skordas } = skogenAvObjekt(objekt, nu);
  return {
    iSkogen: skogen.rader.map(r =>
      kortFor(r.o, r.lage.lage === 'vantar' || r.lage.lage === 'skotas' ? r.lage.dagar : null, !skordas.has(r.o), idag, forsta.get(kortNyckel(r.o)))),
    framme: skogen.klara.map(k => {
      const kort = kortFor(k.o, k.dagar, true, idag, forsta.get(kortNyckel(k.o)));
      // Framme: säg när sista lasset kom, så raden inte påstår "kör" när den är klar.
      return { ...kort, steg: kort.steg.length > 0 ? kort.steg : [`Skotat klart ${kortDatum(k.framme)}`] };
    }),
  };
}

/** Vädret på en rad. undefined = hämtas, aldrig "0 mm" för något vi inte vet. */
export function vaderRad(svar: VaderSvar | null | undefined): string {
  if (svar == null) return 'Hämtar vädret …';
  if (!svar.ok) {
    if (svar.orsak === 'las') return 'Vädret kunde inte hämtas';
    if (svar.orsak === 'saknar_plats') return 'Vädret saknas – trakten har ingen position';
    return 'Vädret saknas – inga datum';
  }
  const s = svar.summa;
  return [s.regnMm == null ? 'Regn saknas' : `Regn ${s.regnMm} mm`, ...detaljer(s)].join(' · ');
}

/** Regndagar och temperatur, de delar av en summa som inte är millimetrarna. */
function detaljer(s: VaderSumma): string[] {
  const delar: string[] = [];
  if (s.regnMm != null && s.regnDagar > 0) delar.push(`${s.regnDagar} ${s.regnDagar === 1 ? 'dag' : 'dagar'} med regn`);
  const t = tempText(s.tMin, s.tMax);
  if (t) delar.push(t);
  return delar;
}

export type ArkRad = { nyckel: string; titel: string; hoger: string; under?: string };

const dagText = (n: number) => `${n} ${dagOrd(n)}`;
const plusDag = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Tidslinjen i traktens ark, en rad per händelse: när avverkningen började och slutade, hur länge
 *  virket låg, när skotaren började och slutade. Hela cykeln står överst (helaCykeln). */
export function tidRader(t: Tidslinje, idag: string): ArkRad[] {
  const r: ArkRad[] = [];
  r.push({ nyckel: 'avStart', titel: 'Avverkningen började', hoger: t.avverkStart ? kortDatum(t.avverkStart) : 'okänt' });
  r.push({ nyckel: 'avSlut', titel: 'Avverkningen slutade', hoger: t.avverkSlut ? kortDatum(t.avverkSlut) : 'pågår' });
  if (t.egenSkotning) {
    r.push({ nyckel: 'egen', titel: 'Skotning', hoger: 'egen skotning' });
    return r;
  }
  if (t.avverkSlut) {
    if (t.skotStart && t.skotStart <= t.avverkSlut) {
      r.push({ nyckel: 'lag', titel: 'Låg i skogen', hoger: '0 dagar', under: 'Skotaren började medan skördaren körde' });
    } else if (t.skotStart) {
      r.push({ nyckel: 'lag', titel: 'Låg i skogen', hoger: dagText(dagarMellan(t.avverkSlut, t.skotStart) - 1) });
    } else {
      r.push({ nyckel: 'lag', titel: 'Låg i skogen', hoger: dagText(dagarMellan(t.avverkSlut, idag)), under: 'Hittills – skotaren har inte börjat' });
    }
  }
  r.push({ nyckel: 'stStart', titel: 'Skotaren började', hoger: t.skotStart ? kortDatum(t.skotStart) : 'inte än' });
  if (t.skotStart) r.push({ nyckel: 'stSlut', titel: 'Skotaren slutade', hoger: t.skotSlut ? kortDatum(t.skotSlut) : 'kör fortfarande' });
  return r;
}

/** Hela cykeln — från första trädet lämnade stubben tills trakten var färdigskotad. Står överst i
 *  arket som svaret (Martin 2026-11-22: "tiden för hela cykeln"). Dagarna räknas med båda ändarna.
 *  Inte färdigskotat: dagarna hittills, och det sägs. Egen skotning eller okänd start: ingen cykel. */
export type Cykel = { dagar: number; klar: boolean; rubrik: string; under: string };
export function helaCykeln(t: Tidslinje, idag: string): Cykel | null {
  if (!t.avverkStart || t.egenSkotning) return null;
  if (t.skotSlut) {
    return {
      dagar: dagarMellan(t.avverkStart, t.skotSlut) + 1,
      klar: true,
      rubrik: 'Från stubbe till färdigskotat',
      under: `${kortDatum(t.avverkStart)} – ${kortDatum(t.skotSlut)}`,
    };
  }
  const vad = !t.avverkSlut ? 'skördaren kör fortfarande' : t.skotStart ? 'skotaren kör fortfarande' : 'skotaren har inte börjat';
  return {
    dagar: dagarMellan(t.avverkStart, idag) + 1,
    klar: false,
    rubrik: 'Från stubbe – hittills',
    under: `Sedan ${kortDatum(t.avverkStart)} · ${vad}`,
  };
}

/** Cykeln som EN rad i A4:n: "Från stubbe till färdigskotat 23 dagar · 27 okt – 18 nov". */
export function cykelRad(t: Tidslinje, idag: string): string | null {
  const c = helaCykeln(t, idag);
  return c ? `${c.rubrik} ${c.dagar} ${dagOrd(c.dagar)} · ${c.under}` : null;
}

/** Perioderna vädret delas på: under avverkningen, medan virket låg, under skotningen.
 *  En period som inte har börjat finns inte; en som pågår slutar idag. */
export function vaderPerioder(t: Tidslinje, idag: string): { nyckel: string; titel: string; fran: string; till: string }[] {
  const ut: { nyckel: string; titel: string; fran: string; till: string }[] = [];
  const lagg = (nyckel: string, titel: string, fran: string | null, till: string | null) => {
    if (fran && till && fran <= till) ut.push({ nyckel, titel, fran, till });
  };
  lagg('avverkning', 'Under avverkningen', t.avverkStart, t.avverkSlut ?? idag);
  if (t.avverkSlut && !t.egenSkotning && !(t.skotStart && t.skotStart <= t.avverkSlut)) {
    lagg('lag', 'Medan virket låg', plusDag(t.avverkSlut, 1), t.skotStart ? plusDag(t.skotStart, -1) : idag);
  }
  if (!t.egenSkotning) lagg('skotning', 'Under skotningen', t.skotStart, t.skotSlut ?? idag);
  return ut;
}

/** Vädret per period i arket. null när dagarna inte finns (hämtas, fel, eller ett äldre svar). */
export function vaderPerPeriod(t: Tidslinje, svar: VaderSvar | null | undefined, idag: string): ArkRad[] | null {
  if (!svar || !svar.ok || !svar.dagar) return null;
  const dagar = svar.dagar;
  return vaderPerioder(t, idag).map(p => {
    const s = summera(dagar, p.fran, p.till);
    const datum = p.fran === p.till ? kortDatum(p.fran) : `${kortDatum(p.fran)} – ${kortDatum(p.till)}`;
    return {
      nyckel: p.nyckel,
      titel: p.titel,
      hoger: s.regnMm == null ? 'regn saknas' : `${s.regnMm} mm`,
      under: [datum, ...detaljer(s)].join(' · '),
    };
  });
}

export function svarText(antal: number, langst: number | null): string {
  if (antal === 0) return 'Inget virke ligger i skogen';
  const t = antal === 1 ? '1 trakt i skogen' : `${antal} trakter i skogen`;
  return langst == null ? t : `${t} · längst legat ${langst} ${dagOrd(langst)}`;
}

/** A4:n — samma kort och samma rader som sidan. */
export function skogDokument(kort: { iSkogen: SkogKort[]; framme: SkogKort[] }, vader: Map<string, VaderSvar>, idag: string): Dokument {
  const rad = (k: SkogKort): DokRad => ({
    titel: k.namn,
    status: k.dagar == null ? undefined : `${k.dagar} ${dagOrd(k.dagar)}`,
    text: [cykelRad(k.tid, idag), ...k.steg, vaderRad(vader.get(k.nyckel))].filter(Boolean).join('\n'),
  });
  const langst = kort.iSkogen.reduce<number | null>((m, k) => (k.dagar == null ? m : Math.max(m ?? 0, k.dagar)), null);
  const sektioner = [{ rubrik: 'Ligger i skogen', under: 'Dagar sedan skördaren blev klar. Längst först.', rader: kort.iSkogen.map(rad) }];
  if (kort.framme.length > 0) {
    sektioner.push({ rubrik: 'Framme vid avlägget', under: `Senaste ${KLARA_VISAS_DAGAR} dagarna. Dagar från att skördaren blev klar till sista lasset.`, rader: kort.framme.map(rad) });
  }
  return {
    titel: 'Ligger i skogen',
    filnamn: `ligger-i-skogen-${idag}`,
    fakta: [{ etikett: 'Datum', varde: `${kortDatum(idag)} ${idag.slice(0, 4)}` }],
    svar: svarText(kort.iSkogen.length, langst),
    sektioner,
    not: 'Vädret är beräknat för traktens plats (Open-Meteo), från skördarens första dag till sista lasset eller idag.',
  };
}
