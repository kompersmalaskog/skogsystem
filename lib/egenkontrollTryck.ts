// Tryck pa egenkontrollens karta: vilken punkt ar det man menade?
//
// RENT - kartan skickar in vad som ligger under fingret, den har filen valjer.
//
// REGELN: symbol > linje > zon. Trycker man pa en symbol som ligger pa en
// basvag menar man symbolen; trycker man pa en basvag som ligger inne i en zon
// menar man vagen. Inom samma sort vinner det som ligger narmast fingret.
//
// Planeringen har en egen regel (lib/klickPrioritet.ts) med andra kategorier
// (larm, yta-nr ...). Den ar inte aterbrukbar har: egenkontrollen har tre sorter
// och ingen av planeringens ovriga. Samma princip, egen tabell.
//
// KONTEXTLAGRET (grans, diken, pilar) ar ALDRIG en kandidat. Det ar orientering,
// inte innehall i dokumentet, och ska inte ga att trycka pa.

export type TraffKind = 'symbol' | 'provyta' | 'linje' | 'zon';
export type Kandidat = { id: string; kind: TraffKind; dPx: number };

/** Halva traffytan. 22 px = 44 pt-kvadrat kring fingret: handske i skog. */
export const TRAFF_RADIE_PX = 22;

/** Lagre = vinner. Provytan ar en symbol pa kartan och rankas som en. */
const RANG: Record<TraffKind, number> = { symbol: 0, provyta: 0, linje: 1, zon: 2 };

export function traffRang(kind: TraffKind): number {
  return RANG[kind];
}

/**
 * Valj EN kandidat. Dubbletter (samma feature i flera tiles) slas ihop med
 * kortaste avstandet. Allt utanfor traffytan faller bort - utom en zon man
 * trycker INNE i, som har avstand 0.
 */
export function valjTraff(kandidater: Kandidat[]): Kandidat | null {
  const per = new Map<string, Kandidat>();
  for (const k of kandidater) {
    if (!(k.dPx <= TRAFF_RADIE_PX)) continue;
    const nyckel = `${k.kind}:${k.id}`;
    const finns = per.get(nyckel);
    if (!finns || k.dPx < finns.dPx) per.set(nyckel, k);
  }
  const lista = Array.from(per.values());
  if (lista.length === 0) return null;
  lista.sort((a, b) => RANG[a.kind] - RANG[b.kind] || a.dPx - b.dPx || (a.id < b.id ? -1 : 1));
  return lista[0];
}

/**
 * Sorten pa en renderad feature. Kontrollpunkterna bar `kind`; basvagsnumret
 * (egen feature i ek-nummer) har bara `nr` och hor till sin vag; provytan har
 * `nummer`. Allt annat ar ingen kandidat.
 */
export function traffKindFranEgenskaper(props: Record<string, unknown> | null | undefined): TraffKind | null {
  if (!props) return null;
  const kind = props.kind;
  if (kind === 'symbol' || kind === 'linje' || kind === 'zon') return kind;
  if (typeof props.nr === 'number') return 'linje';
  if (typeof props.nummer === 'number') return 'provyta';
  return null;
}

/** Id:t man svarar pa: kontrollpunktens id, eller provytans nummer som text. */
export function traffIdFranEgenskaper(props: Record<string, unknown> | null | undefined): string | null {
  if (!props) return null;
  if (typeof props.id === 'string') return props.id;
  if (typeof props.nummer === 'number') return String(props.nummer);
  return null;
}

// ---------------------------------------------------------------------------
// Geometri i skarmpixlar
// ---------------------------------------------------------------------------

export type Px = { x: number; y: number };
type Koord = [number, number];
/** map.project, utbytbar sa att testet kan ge en egen. */
export type Projekt = (c: Koord) => Px;

function distPunktSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distTillLinje(rad: Koord[], tap: Px, projekt: Projekt): number {
  const pts = rad.map(projekt);
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(tap.x - pts[0].x, tap.y - pts[0].y);
  let min = Infinity;
  for (let i = 1; i < pts.length; i++) min = Math.min(min, distPunktSegment(tap, pts[i - 1], pts[i]));
  return min;
}

function liggerInne(ring: Koord[], tap: Px, projekt: Projekt): boolean {
  const pts = ring.map(projekt);
  let inne = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > tap.y) !== (b.y > tap.y) && tap.x < ((b.x - a.x) * (tap.y - a.y)) / (b.y - a.y) + a.x) inne = !inne;
  }
  return inne;
}

/**
 * Avstand i skarmpixlar fran trycket till en features geometri. 0 for en zon
 * man trycker inne i. Okand geometritpyp -> Infinity (aldrig en traff).
 */
export function avstandTillGeometriPx(
  geom: { type: string; coordinates: any } | null | undefined,
  tap: Px,
  projekt: Projekt,
): number {
  if (!geom) return Infinity;
  switch (geom.type) {
    case 'Point': {
      const p = projekt(geom.coordinates as Koord);
      return Math.hypot(tap.x - p.x, tap.y - p.y);
    }
    case 'LineString':
      return distTillLinje(geom.coordinates as Koord[], tap, projekt);
    case 'MultiLineString':
      return Math.min(...(geom.coordinates as Koord[][]).map((l) => distTillLinje(l, tap, projekt)));
    case 'Polygon': {
      const ringar = geom.coordinates as Koord[][];
      // Inne = inne i ytterringen OCH inte i nagot hal. Egenkontrollens zoner har
      // inga hal, men en funktion som sager "inne" i ett hal ar fel oavsett.
      const [ytter, ...hal] = ringar;
      if (ytter && liggerInne(ytter, tap, projekt) && !hal.some((h) => liggerInne(h, tap, projekt))) return 0;
      return Math.min(...ringar.map((r) => distTillLinje(r, tap, projekt)));
    }
    case 'MultiPolygon':
      return Math.min(
        ...(geom.coordinates as Koord[][][]).map((poly) => avstandTillGeometriPx({ type: 'Polygon', coordinates: poly }, tap, projekt)),
      );
    default:
      return Infinity;
  }
}
