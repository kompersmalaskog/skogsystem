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
import { iSkogen, dagOrd, kortDatum, period, stegFor, KLARA_VISAS_DAGAR, type StegIndata } from './iSkogen';
import { tempText, type VaderSumma, type VaderSvar } from './vader';

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
};

function stegIndata(o: UppfoljningObjekt, skordareKlar: boolean): StegIndata {
  return {
    skordarDagar: [],
    skordareStart: o.skordareStart,
    sistaAvverkning: o.sistaAvverkning,
    skordareKlar,
    lassDagar: [],
    skotareStart: o.skotareStart,
    skotareLastDate: o.skotareLastDate,
    skotningKlar: o.skotningAvslutad,
    egenSkotning: o.egenSkotning === true,
  };
}

function kortFor(o: UppfoljningObjekt, dagar: number | null, skordareKlar: boolean, idag: string): SkogKort {
  const i = stegIndata(o, skordareKlar);
  return {
    nyckel: o.vo_nummer || o.skordareObjektId || o.skotareObjektId || o.namn,
    urlId: o.vo_nummer || o.skordareObjektId || o.skotareObjektId || '',
    vo: o.vo_nummer || null,
    namn: o.namn,
    dagar,
    steg: stegFor(i, idag).map(s => `${s.rubrik} ${s.under}`),
    period: period(i, idag),
  };
}

/** Korten: i skogen (längst legat först), sedan framme vid avlägget (senast först). */
export function skogKort(objekt: UppfoljningObjekt[], nu: number, idag: string): { iSkogen: SkogKort[]; framme: SkogKort[] } {
  const { skogen, skordas } = skogenAvObjekt(objekt, nu);
  return {
    iSkogen: skogen.rader.map(r =>
      kortFor(r.o, r.lage.lage === 'vantar' || r.lage.lage === 'skotas' ? r.lage.dagar : null, !skordas.has(r.o), idag)),
    framme: skogen.klara.map(k => {
      const kort = kortFor(k.o, k.dagar, true, idag);
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

export type VeckaRad = { nyckel: string; titel: string; hoger: string; under: string };

/** En rad per vecka i traktens ark: "Vecka 44" · "22 mm" · "4 dagar med regn · −2 till 6 °C".
 *  null när svaret saknar veckor (fel, hämtas, eller ett äldre svar utan veckorna). */
export function veckaRader(svar: VaderSvar | null | undefined): VeckaRad[] | null {
  if (!svar || !svar.ok || !svar.veckor || svar.veckor.length === 0) return null;
  return svar.veckor.map(v => ({
    nyckel: v.summa.fran,
    titel: `Vecka ${v.vecka}`,
    hoger: v.summa.regnMm == null ? 'regn saknas' : `${v.summa.regnMm} mm`,
    under: [`${kortDatum(v.summa.fran)}${v.summa.till !== v.summa.fran ? ` – ${kortDatum(v.summa.till)}` : ''}`, ...detaljer(v.summa)].join(' · '),
  }));
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
    text: [...k.steg, vaderRad(vader.get(k.nyckel))].join('\n'),
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
