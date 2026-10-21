// INSTRUKTIONER TILL FÖRAREN — ren logik (maskinläget). När maskinen kör in i ett område (yta, avlägg, linje) som har kommentarer visas ett kort med dem,
// och förarens "✓ Sett" sparas PER KOMMENTAR och förare. En sedd kommentar visas inte igen vid inkörning, oavsett var den lästes (kortet, genomgången,
// kartkortet, ⓘ); en ny eller ändrad kommentar räknas som osedd.
//
// BARA PLATSER MAN KÖR IN I: ytor, områden, traktdelar och avlägg. Punktsymboler (Evighetsträd, Högstubbe, Varning …), linjer (stenmur, kraftledning, basväg) och RAÄ-punkter
// ger inget kort — deras kommentar syns i larmkortet och vid tryck (annars blir det ett kort per evighetsträd).
//
// Källor (en kommentar = en rad här):
//   • Vidas text: ATGARD på hänsynsytor och avlägg (objekt_geometri). Traktdelar, nyckelbiotoper och RAÄ har ingen sådan text i datan.
//   • Våra kommentarer: kartkommentar (en rad per kommentar, författare + tid), på Vidas objekt och egna markeringar.
//   • Markeringens äldre kommentarfält (före författare sparades) → "Äldre kommentar".
//
// Allt som kräver nät eller databas ligger i ./sett och lib/hooks/useInstruktioner. Här finns bara reglerna, så de går att prova utan någon av dem.

import { arInnePolygon, avstandPunktM, type LatLon } from '../larm/geo';
import { VIDA, ytaDef } from '../larm/grupper';
import { innehallHash } from '../larm/larm';
import { vidaSlag } from '../larm/objekt';
import { byggTraktKort } from '../traktGeometri';
import { vidaNycklar } from '../vidaNycklar';
import { aldreKommentar, forfattarText, kommentarerForNyckel, markerNyckel, type KommentarVy } from '../kartkommentar';

/** Punkter och linjer räknas som "inne" inom så här många meter (ut först vid +UT_MARGINAL_M, så GPS-brus vid kanten inte ger flimmer). */
export const INNE_M = 30;
export const UT_MARGINAL_M = 10;

export type InstruktionKalla = 'vida' | 'egen' | 'aldre';

export interface Instruktion {
  /** Stabil referens för "sett": `vida:<nyckel>` (Vidas text), kommentarens id (kartkommentar) eller `aldre:<nyckel>`. */
  ref: string;
  text: string;
  /** Hash av texten — ändras texten gäller ett gammalt "sett" inte längre. */
  hash: string;
  kalla: InstruktionKalla;
  /** "Martin · i går 16:20"; null för Vidas text och äldre kommentarer (de har ingen författare). */
  forfattare: string | null;
  vantar: boolean;
}

/** Var maskinen är i förhållande till området. `inne` gäller ytor; `avstandM` punkter och linjer (null = okänt). */
export type Narvaro = { slag: 'yta'; inne: boolean } | { slag: 'avstand'; avstandM: number | null };

export interface InstruktionOmrade {
  /** Områdets nyckel: Vidas (hansyn:<LOPNR>, punkt:<nr> …) eller `marker:<id>` / `omrade:<id>` för egna. */
  nyckel: string;
  namn: string;
  narvaro: Narvaro;
  instruktioner: Instruktion[];
}

/** ref → hash för det föraren kvitterat som sett. */
export type SettKarta = ReadonlyMap<string, string>;

export const hashText = (text: string): string => innehallHash({ comment: text.trim() });

export const arOsedd = (i: Pick<Instruktion, 'ref' | 'hash'>, sett: SettKarta): boolean => sett.get(i.ref) !== i.hash;

// ---------------------------------------------------------------------------------------------------------------------------------
// Texten på kortet
// ---------------------------------------------------------------------------------------------------------------------------------

/**
 * Radbrytningar blir numrerade punkter (1, 2, 3); en enda rad är vanlig text — samma regel som kortet ("Samma regel som kortet"). Tomma rader hoppas över.
 * `punkter` är null för en vanlig text.
 */
export function instruktionRader(text: string): { punkter: string[] | null; text: string } {
  const rader = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  if (rader.length > 1) return { punkter: rader, text: rader.join('\n') };
  return { punkter: null, text: rader[0] ?? '' };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Att samla områden
// ---------------------------------------------------------------------------------------------------------------------------------

type Pos = [number, number];
const tillLL = (c: Pos): LatLon => ({ lat: c[1], lon: c[0] });

function vidaNarvaro(g: any, pos: LatLon | null): Narvaro {
  if (!pos || !g) return g?.type === 'Polygon' || g?.type === 'MultiPolygon' ? { slag: 'yta', inne: false } : { slag: 'avstand', avstandM: null };
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
    const polys: Pos[][][] = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return { slag: 'yta', inne: polys.some((p) => arInnePolygon(pos, p.map((r) => r.map(tillLL)))) };
  }
  if (g.type === 'Point' || g.type === 'MultiPoint') {
    const punkter: Pos[] = g.type === 'Point' ? [g.coordinates] : g.coordinates;
    return { slag: 'avstand', avstandM: Math.min(...punkter.map((c) => avstandPunktM(pos, tillLL(c)))) };
  }
  return { slag: 'avstand', avstandM: null };
}

function ordning(i: Instruktion): number { return i.kalla === 'vida' ? 0 : i.kalla === 'aldre' ? 1 : 2; }

/** Vidas text först, sedan våra kommentarer i den ordning de skrevs (äldre kommentarer före nya). */
export const sorteraInstruktioner = (l: readonly Instruktion[]): Instruktion[] => {
  const ut = l.map((i, n) => ({ i, n }));
  ut.sort((a, b) => ordning(a.i) - ordning(b.i) || a.n - b.n);
  return ut.map((x) => x.i);
};

function egnaInstruktioner(rader: readonly KommentarVy[], objektId: string, nyckel: string, aldreText: string | null | undefined, nu?: Date): Instruktion[] {
  const lista: KommentarVy[] = [...(aldreKommentar(objektId, nyckel, aldreText) ? [aldreKommentar(objektId, nyckel, aldreText)!] : []), ...kommentarerForNyckel(rader, nyckel)];
  return lista
    .filter((r) => r.text.trim())
    .map((r) => ({
      ref: r.aldre ? `aldre:${nyckel}` : r.id,
      text: r.text.trim(),
      hash: hashText(r.text),
      kalla: r.aldre ? ('aldre' as const) : ('egen' as const),
      forfattare: r.aldre ? null : forfattarText(r.namn, r.skapad_at, nu),
      vantar: r.vantar,
    }));
}

/** En plats man kör in i: en yta (polygon) eller ett avlägg (Vidas punkt i avläggslagret). Allt annat — punktsymboler, RAÄ-punkter, linjer — är det inte. */
export const arPlats = (geomTyp: string | undefined, arAvlagg: boolean): boolean =>
  geomTyp === 'Polygon' || geomTyp === 'MultiPolygon' || ((geomTyp === 'Point' || geomTyp === 'MultiPoint') && arAvlagg);

/** Typen på förarens egen avläggssymbol — den enda egna punktsymbolen som är en plats. */
export const EGET_AVLAGG_TYP = 'landing';

export interface SamlaIn {
  objektId: string;
  /** Vidas geometri (FeatureCollection). */
  vida: { features?: any[] } | null;
  markers: readonly any[];
  svgToLatLon: (x: number, y: number) => LatLon;
  typNamn: (typ?: string) => string;
  kommentarer: readonly KommentarVy[];
  /** Maskinens position. Null = ingen (genomgången behöver bara listan, inte närvaron). */
  pos: LatLon | null;
  nu?: Date;
}

/** Alla områden som har minst en instruktion, med var maskinen är i förhållande till dem. */
export function samlaOmraden(i: SamlaIn): InstruktionOmrade[] {
  const ut: InstruktionOmrade[] = [];
  const features = i.vida?.features ?? [];
  const nycklar = vidaNycklar(features);

  features.forEach((f, n) => {
    const nyckel = nycklar[n];
    if (!nyckel || !f?.geometry) return;
    const props = f.properties ?? {};
    const kort = byggTraktKort(props);
    if (!arPlats(f.geometry?.type, kort.kategori === 'punkt')) return;
    // Vidas egen text (ATGARD) finns på hänsynsytor och avlägg; byggTraktKort lägger den som kortets enda rad. Andra kategorier har ingen.
    const vidaText = (kort.kategori === 'hansyn' || kort.kategori === 'punkt') ? (kort.rader[0]?.text ?? '').trim() : '';
    const lista: Instruktion[] = [];
    if (vidaText) lista.push({ ref: `vida:${nyckel}`, text: vidaText, hash: hashText(vidaText), kalla: 'vida', forfattare: null, vantar: false });
    lista.push(...egnaInstruktioner(i.kommentarer, i.objektId, nyckel, null, i.nu));
    if (!lista.length) return;
    const slag = vidaSlag(props, f.geometry?.type);
    const namn = (kort.kategori === 'hansyn' || kort.kategori === 'punkt') ? kort.rubrik : slag ? VIDA[slag].namn : (kort.rubrik || 'Område');
    ut.push({ nyckel, namn, narvaro: vidaNarvaro(f.geometry, i.pos), instruktioner: sorteraInstruktioner(lista) });
  });

  for (const m of i.markers) {
    const nyckel = m.lineType === 'boundary' ? `omrade:${m.id}` : markerNyckel(m.id);
    const lista = egnaInstruktioner(i.kommentarer, i.objektId, nyckel, m.comment, i.nu);
    if (!lista.length) continue;
    let narvaro: Narvaro;
    let namn: string;
    if (m.isMarker && m.type === EGET_AVLAGG_TYP && typeof m.x === 'number' && typeof m.y === 'number') {
      namn = i.typNamn(m.type);
      narvaro = { slag: 'avstand', avstandM: i.pos ? avstandPunktM(i.pos, i.svgToLatLon(m.x, m.y)) : null };
    } else if ((m.isZone || m.lineType === 'boundary') && m.path?.length > 2) {
      namn = m.isZone ? (ytaDef(m.zoneType)?.namn ?? 'Område') : 'Område';
      narvaro = { slag: 'yta', inne: i.pos ? arInnePolygon(i.pos, [m.path.map((p: any) => i.svgToLatLon(p.x, p.y))]) : false };
    } else continue;   // punktsymboler och linjer är inga platser man kör in i
    ut.push({ nyckel, namn, narvaro, instruktioner: lista });
  }
  return ut;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Inkörningen
// ---------------------------------------------------------------------------------------------------------------------------------

export interface InstruktionState {
  /** Områden maskinen är inne i (med hysteres). */
  inne: Readonly<Record<string, true>>;
  /** Områden som körts in i med osedda instruktioner och väntar på "Sett", i den ordning de kördes in i. Ett kort står kvar tills Sett. */
  vantande: readonly string[];
}

export const TOMT_INSTRUKTION: InstruktionState = { inne: {}, vantande: [] };

export function arInne(o: InstruktionOmrade, tidigareInne: boolean): boolean {
  if (o.narvaro.slag === 'yta') return o.narvaro.inne;
  const d = o.narvaro.avstandM;
  if (d == null) return false;
  return d <= (tidigareInne ? INNE_M + UT_MARGINAL_M : INNE_M);
}

export const osedda = (o: InstruktionOmrade, sett: SettKarta): Instruktion[] => o.instruktioner.filter((x) => arOsedd(x, sett));

/**
 * Ett steg. Ny inkörning i ett område med osedda instruktioner lägger området sist i kön (det första utvärderingen räknas också som inkörning: står maskinen
 * redan i området när appen startar ska instruktionen fram). Ett område som inte längre har något osett — lästs på annat håll — lämnar kön.
 */
export function stegaInstruktion(state: InstruktionState, omraden: readonly InstruktionOmrade[], sett: SettKarta): InstruktionState {
  const inne: Record<string, true> = {};
  const vantande = state.vantande.filter((n) => omraden.some((o) => o.nyckel === n && osedda(o, sett).length > 0));
  for (const o of omraden) {
    const var_ = !!state.inne[o.nyckel];
    const ar = arInne(o, var_);
    if (ar) inne[o.nyckel] = true;
    if (ar && !var_ && osedda(o, sett).length > 0 && !vantande.includes(o.nyckel)) vantande.push(o.nyckel);
  }
  return { inne, vantande };
}

export interface InstruktionKortData {
  nyckel: string;
  namn: string;
  /** Bara det som inte setts. */
  instruktioner: Instruktion[];
  /** Fler områden väntar efter det här (visas när detta är sett). */
  fler: number;
}

/**
 * Kortet som ska visas nu: det första väntande området — men inte medan något annat kort har platsen (`blockerad`: ett larmkort eller lossningskortet visas).
 * Instruktionen väntar då, och kommer när platsen blir ledig.
 */
export function kortAttVisa(state: InstruktionState, omraden: readonly InstruktionOmrade[], sett: SettKarta, blockerad: boolean): InstruktionKortData | null {
  if (blockerad) return null;
  for (const nyckel of state.vantande) {
    const o = omraden.find((x) => x.nyckel === nyckel);
    if (!o) continue;
    const nya = osedda(o, sett);
    if (nya.length) return { nyckel, namn: o.namn, instruktioner: nya, fler: state.vantande.filter((n) => n !== nyckel).length };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Genomgången: allt på trakten
// ---------------------------------------------------------------------------------------------------------------------------------

export interface InstruktionerPaTrakten {
  /** Antal instruktioner på trakten (sedda och osedda). */
  antal: number;
  /** Hur många som föraren inte sett. */
  nya: number;
  omraden: { nyckel: string; namn: string; instruktioner: (Instruktion & { sedd: boolean })[]; nya: number }[];
}

/** Raden "Instruktioner på trakten (N)": alla områden med instruktioner, de med osedda överst, annars i den ordning de samlats. */
export function instruktionerPaTrakten(omraden: readonly InstruktionOmrade[], sett: SettKarta): InstruktionerPaTrakten {
  const lista = omraden.map((o) => {
    const instruktioner = o.instruktioner.map((x) => ({ ...x, sedd: !arOsedd(x, sett) }));
    return { nyckel: o.nyckel, namn: o.namn, instruktioner, nya: instruktioner.filter((x) => !x.sedd).length };
  });
  const sorterad = lista.map((o, n) => ({ o, n })).sort((a, b) => Number(b.o.nya > 0) - Number(a.o.nya > 0) || a.n - b.n).map((x) => x.o);
  return { antal: lista.reduce((s, o) => s + o.instruktioner.length, 0), nya: lista.reduce((s, o) => s + o.nya, 0), omraden: sorterad };
}

/** Alla instruktioner i de angivna områdena som är osedda — det "✓ Sett" kvitterar. */
export function attKvittera(omraden: readonly InstruktionOmrade[], nycklar: readonly string[], sett: SettKarta): { nyckel: string; namn: string; i: Instruktion }[] {
  const ut: { nyckel: string; namn: string; i: Instruktion }[] = [];
  for (const o of omraden) {
    if (!nycklar.includes(o.nyckel)) continue;
    for (const x of osedda(o, sett)) ut.push({ nyckel: o.nyckel, namn: o.namn, i: x });
  }
  return ut;
}
