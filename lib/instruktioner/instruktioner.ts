// INSTRUKTIONER TILL FÖRAREN — ren logik (maskinläget). När maskinen kör in i ett område (yta, avlägg, linje) som har kommentarer visas ett kort med dem,
// och förarens "✓ Sett" sparas PER KOMMENTAR och förare. En sedd kommentar visas inte igen vid inkörning, oavsett var den lästes (kortet, genomgången,
// kartkortet, ⓘ); en ny eller ändrad kommentar räknas som osedd.
//
// BARA PLATSER MAN KÖR IN I: ytor, områden, traktdelar och avlägg. Punktsymboler (Evighetsträd, Högstubbe, Varning …), linjer (stenmur, kraftledning, basväg) och RAÄ-punkter
// ger inget kort — deras kommentar syns i larmkortet och vid tryck (annars blir det ett kort per evighetsträd).
//
// VIDAS TEXT (ATGARD) ÄR EN INSTRUKTION BARA PÅ YTOR OCH BARA OM DEN SÄGER NÅGOT (Martin 2026-10-21, ur objekt_geometri): på hänsynsytor (Tilläggsytor, TYP 24/5/8/71) står riktiga
// instruktioner ("kantzon lämnas på ca 10-15 m …", "Torr stenig mark som lämnas orörd", "avverkning av frötallar …") men också typnamn ("hänsynsyta" på Sumpskog O) — det senare är
// ingen instruktion. På AVLÄGG är ATGARD alltid namn/plats ("skbv betet", "byvägen", "Vändplan") — aldrig en instruktion, den visas som namn i avläggets vanliga kort.
// Egna kommentarer på avlägg är däremot instruktioner och ger kort som vanligt ("Du är vid avlägget").
//
// Källor (en kommentar = en rad här):
//   • Vidas text: ATGARD på hänsynsytor, om den är en instruktion (`arInstruktionsText`). Avlägg, traktdelar, nyckelbiotoper och RAÄ ger ingen Vida-instruktion.
//   • Våra kommentarer: kartkommentar (en rad per kommentar, författare + tid), på Vidas objekt och egna markeringar.
//   • Markeringens äldre kommentarfält (före författare sparades) → "Äldre kommentar".
//
// Allt som kräver nät eller databas ligger i ./sett och lib/hooks/useInstruktioner. Här finns bara reglerna, så de går att prova utan någon av dem.

import { arInnePolygon, avstandPunktM, avstandTillLinjeM, type LatLon } from '../larm/geo';
import { arKorUpp, korUppText, korUppUr } from '../korUpp';
import { VIDA, ytaDef } from '../larm/grupper';
import { innehallHash } from '../larm/larm';
import { vidaSlag } from '../larm/objekt';
import { byggTraktKort } from '../traktGeometri';
import { vidaNycklar } from '../vidaNycklar';
import { aldreKommentar, forfattarText, kommentarerForNyckel, markerNyckel, type KommentarVy } from '../kartkommentar';
import { forstaPunkt, rensaVidaNamn, type BrickaGrupp } from '../ytaNamn';

/** Punkter och linjer räknas som "inne" inom så här många meter (ut först vid +UT_MARGINAL_M, så GPS-brus vid kanten inte ger flimmer). */
export const INNE_M = 30;
export const UT_MARGINAL_M = 10;

export type InstruktionKalla = 'vida' | 'egen' | 'aldre' | 'planering';

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
  /** Källan i rutans överkant när ingen författare finns (planeringens egna: "Planerare"). */
  etikett?: string;
  /** Vidas traktdirektiv (löptext utan radbrytningar): delas i numrerade punkter vid meningsslut. Aldrig sant för en egen kommentar eller en ytas ATGARD. */
  meningar?: boolean;
}

/** Var maskinen är i förhållande till området. `inne` gäller ytor; `avstandM` punkter och linjer (null = okänt). */
export type Narvaro = { slag: 'yta'; inne: boolean } | { slag: 'avstand'; avstandM: number | null };

export interface InstruktionOmrade {
  /** Områdets nyckel: Vidas (hansyn:<LOPNR>, punkt:<nr> …) eller `marker:<id>` / `omrade:<id>` för egna. */
  nyckel: string;
  namn: string;
  narvaro: Narvaro;
  /** Ett avlägg (Vidas avlägg eller eget): kortet säger "Du är vid avlägget" i stället för "Du kör in i området nu". */
  avlagg: boolean;
  /** Hela trakten, inte en plats: Vidas traktdirektiv. Instruktion nr 1 i listan och i genomgången — men utan inkörning, det ger aldrig ett kort. */
  objektniva?: boolean;
  /** Kartans namn på ytan som bricka ("Hänsyn 1", "Övrigt 4") + typen ("Kant mot vatten", utan Vidas " O") + brickans färggrupp — samma på kartan, i listan, på kortet och i påminnelsen (lib/ytaNamn). */
  bricka?: string;
  typ?: string;
  brickaGrupp?: BrickaGrupp;
  instruktioner: Instruktion[];
}

/** ref → hash för det föraren kvitterat som sett. */
export type SettKarta = ReadonlyMap<string, string>;

export const hashText = (text: string): string => innehallHash({ comment: text.trim() });

export const arOsedd = (i: Pick<Instruktion, 'ref' | 'hash'>, sett: SettKarta): boolean => sett.get(i.ref) !== i.hash;

// ---------------------------------------------------------------------------------------------------------------------------------
// Texten på kortet
// ---------------------------------------------------------------------------------------------------------------------------------

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

function ordning(i: Instruktion): number { return i.kalla === 'vida' ? 0 : i.kalla === 'aldre' ? 1 : i.kalla === 'planering' ? 2 : 3; }

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

const utanAccent = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** Texten i jämförbar form: gemener, utan accenter, bara bokstäver och siffror ("Sumpskog O" och "sumpskog o." blir samma). */
const jamfor = (t: string): string => utanAccent(t.toLowerCase()).replace(/[^a-z0-9]+/g, '');

/** Ord Vida skriver som "åtgärd" men som bara är ytans typ — ingen instruktion. */
const TYPNAMN = new Set(['hansynsyta', 'hansyn', 'hansynsomrade', 'tillaggsyta', 'yta', 'omrade', 'ovrigt']);

/**
 * Säger Vidas ATGARD något? Falskt för tom text, för bara ett typnamn ("hänsynsyta", "Övrigt") och för text som bara upprepar ytans eget namn (FLBESKR, t.ex. "Sumpskog O").
 * `namn` = ytans egna namn att jämföra mot.
 */
export function arInstruktionsText(text: string | null | undefined, namn: readonly (string | null | undefined)[] = []): boolean {
  const t = jamfor(String(text ?? ''));
  if (!t) return false;
  if (TYPNAMN.has(t)) return false;
  return !namn.some((n) => !!n && jamfor(n) === t);
}

/** Områdesnyckeln för Vidas traktdirektiv (hela trakten). */
export const DIREKTIV_NYCKEL = 'direktiv';

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
  /** Vidas traktdirektiv för hela objektet (`objekt.anteckningar`): blir instruktion nr 1. */
  direktiv?: string | null;
  /** Maskinens position. Null = ingen (genomgången behöver bara listan, inte närvaron). */
  pos: LatLon | null;
  nu?: Date;
}

/** Alla områden som har minst en instruktion, med var maskinen är i förhållande till dem. */
export function samlaOmraden(i: SamlaIn): InstruktionOmrade[] {
  const ut: InstruktionOmrade[] = [];
  // Vidas traktdirektiv för hela trakten är instruktion nr 1 (före ytorna). Hashen av texten gör att en ändrad text är osedd igen; ingen närvaro, så det ger aldrig ett kort vid inkörning.
  const direktiv = String(i.direktiv ?? '').trim();
  if (direktiv) {
    ut.push({
      nyckel: DIREKTIV_NYCKEL, namn: 'Traktdirektiv', narvaro: { slag: 'yta', inne: false }, avlagg: false, objektniva: true,
      instruktioner: [{ ref: `vida:${DIREKTIV_NYCKEL}`, text: direktiv, hash: hashText(direktiv), kalla: 'vida', forfattare: null, vantar: false, meningar: true }],
    });
  }
  const features = i.vida?.features ?? [];
  const nycklar = vidaNycklar(features);

  features.forEach((f, n) => {
    const nyckel = nycklar[n];
    if (!nyckel || !f?.geometry) return;
    const props = f.properties ?? {};
    const kort = byggTraktKort(props);
    if (!arPlats(f.geometry?.type, kort.kategori === 'punkt')) return;
    // Vidas egen text (ATGARD) är en instruktion bara på ytor (hänsynsytor) och bara om den säger något; på avlägg är den ett namn och ger aldrig kort (se överst).
    const arAvlagg = kort.kategori === 'punkt';
    const vidaText = !arAvlagg && arInstruktionsText(kort.vidaKommentar, [props.FLBESKR, rensaVidaNamn(props.FLBESKR), kort.rubrik, kort.brickaTyp]) ? String(kort.vidaKommentar).trim() : '';
    const lista: Instruktion[] = [];
    if (vidaText) lista.push({ ref: `vida:${nyckel}`, text: vidaText, hash: hashText(vidaText), kalla: 'vida', forfattare: null, vantar: false });
    lista.push(...egnaInstruktioner(i.kommentarer, i.objektId, nyckel, null, i.nu));
    if (!lista.length) return;
    const slag = vidaSlag(props, f.geometry?.type);
    const namn = (kort.kategori === 'hansyn' || kort.kategori === 'ovrigt' || kort.kategori === 'punkt') ? kort.rubrik : slag ? VIDA[slag].namn : (kort.rubrik || 'Område');
    // Brickan = kartans etikett (hänsyn/Övrigt) — ett avlägg heter "Avlägg <nr>", neutral bricka.
    const bricka = arAvlagg ? (kort.nr ? `Avlägg ${kort.nr}` : 'Avlägg') : kort.bricka;
    const brickaGrupp: BrickaGrupp | undefined = arAvlagg ? 'ovrigt' : kort.brickaGrupp;
    ut.push({ nyckel, namn, narvaro: vidaNarvaro(f.geometry, i.pos), avlagg: arAvlagg, instruktioner: sorteraInstruktioner(lista), ...(bricka ? { bricka, typ: arAvlagg ? '' : kort.brickaTyp, brickaGrupp } : {}) });
  });

  for (const m of i.markers) {
    // KÖR UPP OCH BACKA (vit dubbelpil): planerarens pil är en instruktion i sig — skälet och "kör upp mot gränsen och backa tillbaka". Maskinen kör "in" när den är nära pilen.
    if (arKorUpp(m)) {
      const k = korUppUr(m);
      if (!k) continue;
      const text = korUppText(k.skal);
      ut.push({
        nyckel: `korupp:${m.id}`, namn: 'Kör upp och backa', avlagg: false,
        narvaro: { slag: 'avstand', avstandM: i.pos ? avstandTillLinjeM(i.pos, [k.start, k.slut]) : null },
        instruktioner: [{ ref: `korupp:${m.id}`, text, hash: hashText(text), kalla: 'planering', etikett: 'Planerare', forfattare: null, vantar: false }],
      });
      continue;
    }
    const nyckel = m.lineType === 'boundary' ? `omrade:${m.id}` : markerNyckel(m.id);
    const lista = egnaInstruktioner(i.kommentarer, i.objektId, nyckel, m.comment, i.nu);
    if (!lista.length) continue;
    let narvaro: Narvaro;
    let namn: string;
    let avlagg = false;
    let brickaGrupp: BrickaGrupp = 'ovrigt';
    if (m.isMarker && m.type === EGET_AVLAGG_TYP && typeof m.x === 'number' && typeof m.y === 'number') {
      namn = i.typNamn(m.type);
      avlagg = true;
      narvaro = { slag: 'avstand', avstandM: i.pos ? avstandPunktM(i.pos, i.svgToLatLon(m.x, m.y)) : null };
    } else if ((m.isZone || m.lineType === 'boundary') && m.path?.length > 2) {
      namn = m.isZone ? (ytaDef(m.zoneType)?.namn ?? 'Område') : 'Område';
      if (m.isZone && ytaDef(m.zoneType)) brickaGrupp = ytaDef(m.zoneType)!.grupp;
      narvaro = { slag: 'yta', inne: i.pos ? arInnePolygon(i.pos, [m.path.map((p: any) => i.svgToLatLon(p.x, p.y))]) : false };
    } else continue;   // punktsymboler och linjer är inga platser man kör in i
    ut.push({ nyckel, namn, narvaro, avlagg, instruktioner: lista, bricka: avlagg ? 'Avlägg' : namn, typ: '', brickaGrupp });
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
  /**
   * PÅMINNELSEN I YTAN: områden maskinen är inne i där allt redan är sett → när påminnelsen startade (ms). Första inkörningen: hela pillen i `PAMINNELSE_FULL_MS`, sedan bara brickan
   * så länge man är kvar. Efter ett Sett inne i ytan startar den direkt som bricka (man har precis läst det). Kör man ut försvinner posten; kör man in igen börjar pillen om.
   */
  paminn: Readonly<Record<string, number>>;
}

/** Hela pillen (bricka + kort text) visas så här länge efter en inkörning, sedan krymper den till bara brickan. */
export const PAMINNELSE_FULL_MS = 10000;

export const TOMT_INSTRUKTION: InstruktionState = { inne: {}, vantande: [], paminn: {} };

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
export function stegaInstruktion(state: InstruktionState, omraden: readonly InstruktionOmrade[], sett: SettKarta, nu: number = Date.now()): InstruktionState {
  const inne: Record<string, true> = {};
  const paminn: Record<string, number> = {};
  const vantande = state.vantande.filter((n) => omraden.some((o) => o.nyckel === n && osedda(o, sett).length > 0));
  for (const o of omraden) {
    if (o.objektniva) continue;   // hela trakten: ingen inkörning, inget kort
    const var_ = !!state.inne[o.nyckel];
    const ar = arInne(o, var_);
    if (ar) inne[o.nyckel] = true;
    const nya = osedda(o, sett).length;
    if (ar && !var_ && nya > 0 && !vantande.includes(o.nyckel)) vantande.push(o.nyckel);
    // Påminnelsen: bara medan man är inne och allt är sett. Ny inkörning = hela pillen; sett inne i ytan = direkt bara brickan; kör man ut försvinner den.
    if (ar && nya === 0) {
      const start = state.paminn[o.nyckel];
      paminn[o.nyckel] = start != null && var_ ? start : (var_ ? nu - PAMINNELSE_FULL_MS : nu);
    }
  }
  return { inne, vantande, paminn };
}

export interface InstruktionKortData {
  nyckel: string;
  namn: string;
  /** Området är ett avlägg ("Du är vid avlägget"). */
  avlagg: boolean;
  /** Bara det som inte setts. */
  instruktioner: Instruktion[];
  /** Fler områden väntar efter det här (visas när detta är sett). */
  fler: number;
  /** Kartans namn på ytan (bricka + typ + färg): rubriken på kortet är samma som i listan, påminnelsen och kartkortet. */
  bricka?: string;
  typ?: string;
  brickaGrupp?: BrickaGrupp;
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
    if (nya.length) return { nyckel, namn: o.namn, avlagg: o.avlagg, instruktioner: nya, fler: state.vantande.filter((n) => n !== nyckel).length, bricka: o.bricka, typ: o.typ, brickaGrupp: o.brickaGrupp };
  }
  return null;
}

/** Påminnelsen i ytan: pillen (bricka + första punkten + ›) de första sekunderna, sedan bara brickan. */
export interface Paminnelse {
  nyckel: string;
  namn: string;
  avlagg: boolean;
  bricka: string;
  typ: string;
  brickaGrupp: BrickaGrupp;
  /** Första punkten av instruktionen — en rad i pillen. */
  text: string | null;
  /** Hela instruktionen (alla kommentarer, sedda): visas utan Sett när föraren trycker på pillen eller brickan. */
  instruktioner: Instruktion[];
  fas: 'full' | 'bricka';
  /** Millisekunder kvar av hela pillen (0 när den blivit bricka). Sidan väcker sig själv då. */
  kvarMs: number;
}

/**
 * Påminnelsen som ska visas nu, eller null. Den gäller området maskinen är inne i där allt redan är sett (`state.paminn`) — och väntar bakom ALLT annat: ett larmkort eller lossningskortet
 * (`blockerad`) och instruktionskortet med Sett (`kortVisas`). Kommer platsen tillbaka visas den igen (har de 10 sekunderna gått är det bara brickan). Hela trakten (direktivet) har ingen.
 */
export function paminnelseAttVisa(state: InstruktionState, omraden: readonly InstruktionOmrade[], sett: SettKarta, nu: number, blockerad: boolean, kortVisas: boolean): Paminnelse | null {
  if (blockerad || kortVisas) return null;
  for (const o of omraden) {
    if (o.objektniva || !state.inne[o.nyckel]) continue;
    const start = state.paminn[o.nyckel];
    if (start == null || osedda(o, sett).length > 0 || !o.instruktioner.length) continue;
    const kvarMs = Math.max(0, PAMINNELSE_FULL_MS - (nu - start));
    return {
      nyckel: o.nyckel, namn: o.namn, avlagg: o.avlagg, bricka: o.bricka ?? o.namn, typ: o.typ ?? '', brickaGrupp: o.brickaGrupp ?? 'ovrigt',
      text: forstaPunkt(o.instruktioner[0].text), instruktioner: o.instruktioner, fas: kvarMs > 0 ? 'full' : 'bricka', kvarMs,
    };
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
  omraden: { nyckel: string; namn: string; instruktioner: (Instruktion & { sedd: boolean })[]; nya: number; bricka?: string; typ?: string; brickaGrupp?: BrickaGrupp }[];
}

/** Raden "Instruktioner på trakten (N)": alla områden med instruktioner, de med osedda överst, annars i den ordning de samlats. */
export function instruktionerPaTrakten(omraden: readonly InstruktionOmrade[], sett: SettKarta): InstruktionerPaTrakten {
  const lista = omraden.map((o) => {
    const instruktioner = o.instruktioner.map((x) => ({ ...x, sedd: !arOsedd(x, sett) }));
    return { nyckel: o.nyckel, namn: o.namn, instruktioner, nya: instruktioner.filter((x) => !x.sedd).length, bricka: o.bricka, typ: o.typ, brickaGrupp: o.brickaGrupp };
  });
  // Traktdirektivet är instruktion nr 1 och ligger alltid först; därefter de områden som har osedda, sedan resten i den ordning de samlats.
  const sorterad = lista.map((o, n) => ({ o, n })).sort((a, b) => Number(b.o.nyckel === DIREKTIV_NYCKEL) - Number(a.o.nyckel === DIREKTIV_NYCKEL) || Number(b.o.nya > 0) - Number(a.o.nya > 0) || a.n - b.n).map((x) => x.o);
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
