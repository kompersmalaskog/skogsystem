// TRYCK PÅ LINJER. En tunn linje (2–3 px) går inte att träffa med ett finger — särskilt inte i en skakande hytt med handske. Alla linjer får därför ett
// osynligt träfflager som är LINJE_TRAFF_PX brett (22 px åt varje håll) oavsett hur tunn linjen ritas. Ligger flera linjer under fingret väljs den NÄRMASTE
// (avstånd i skärmpixlar till själva linjen, inte till träfflagrets kant), egna och Vidas på samma sätt.

import { linjeKort, vidaLinjeKort, type LinjeKort } from './symboler';

/** Träfflagrets bredd (px): minst 44 — Apples minsta träffyta. Samma värde för egna linjer (`line-hitbox`) och Vidas (`trakt-linje-hit`). */
export const LINJE_TRAFF_PX = 44;
/** Så långt från linjen (px) träffas den: halva träffbredden. */
export const LINJE_TRAFF_RADIE_PX = LINJE_TRAFF_PX / 2;

type Pt = { x: number; y: number };
export type LinjeGeometri = { type: string; coordinates: any };
export type Projicera = (lng: number, lat: number) => Pt;

const avstandTillSegment = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Delsträckor (listor av [lng, lat]) ur en geometri. Linjer: själva linjen; ytor: ringarna (kanten är det som träffas). */
function strackor(g: LinjeGeometri | null | undefined): number[][][] {
  const c = g?.coordinates;
  if (!c) return [];
  switch (g!.type) {
    case 'LineString': return [c];
    case 'MultiLineString': return c;
    case 'Polygon': return c;
    case 'MultiPolygon': return c.flat();
    default: return [];
  }
}

/** Kortaste avståndet (px) från `p` till geometrin. Infinity när geometrin saknas eller är tom. */
export function avstandPx(p: Pt, geometri: LinjeGeometri | null | undefined, projicera: Projicera): number {
  let min = Infinity;
  for (const s of strackor(geometri)) {
    const pts = s.map((q) => projicera(q[0], q[1]));
    if (pts.length === 1) min = Math.min(min, Math.hypot(p.x - pts[0].x, p.y - pts[0].y));
    for (let i = 1; i < pts.length; i++) min = Math.min(min, avstandTillSegment(p, pts[i - 1], pts[i]));
  }
  return min;
}

export interface LinjeKandidat<T = unknown> { geometri: LinjeGeometri | null | undefined; data: T }

/**
 * Den kandidat vars linje ligger närmast fingret, och bara om den ligger inom träffradien (22 px). Lika långt (± 0,5 px) → den första, så resultatet inte
 * hoppar mellan två tryck på samma ställe. Ingen kandidat inom radien → null.
 */
export function narmasteLinje<T>(p: Pt, kandidater: readonly LinjeKandidat<T>[], projicera: Projicera, radiePx: number = LINJE_TRAFF_RADIE_PX): { kandidat: LinjeKandidat<T>; avstandPx: number } | null {
  let bast: { kandidat: LinjeKandidat<T>; avstandPx: number } | null = null;
  for (const k of kandidater) {
    const d = avstandPx(p, k.geometri, projicera);
    if (d > radiePx) continue;
    if (!bast || d < bast.avstandPx - 0.5) bast = { kandidat: k, avstandPx: d };
  }
  return bast;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Vad ett tryck på en linje ÖPPNAR. Sidan (app/planering/page.tsx, linje-trycket) anropar den här och utför åtgärden; reglerna bor här så att varje linjetyp
// kan provas (lib/linjeTryck.test.ts).
// ---------------------------------------------------------------------------------------------------------------------------------

/** Träfflagret för Vidas linjer. Egna linjer ligger i `line-hitbox`. */
export const VIDA_LINJE_TRAFFLAGER = 'trakt-linje-hit';
export const EGNA_LINJER_TRAFFLAGER = 'line-hitbox';

export type LinjeAtgard =
  /** Vidas linje (Kraftledning, basväg): trakt-kortet med namn, grupp och en mening. */
  | { typ: 'vida'; kort: ReturnType<typeof vidaLinjeKort>; props: Record<string, any> }
  /** Egen traktgräns: samma ytkort som Vidas traktdelar. */
  | { typ: 'granskort'; marker: any }
  /** Snitsel-kartläget (stickvägar): tryck = mät mot den vägen. */
  | { typ: 'stickvag-mat'; marker: any }
  /** Övriga egna linjer: markörkortet, med namn, grupp och en mening. */
  | { typ: 'markorkort'; marker: any; kort: LinjeKort };

const STICKVAGAR = ['sideRoadRed', 'sideRoadYellow', 'sideRoadBlue'];

export function linjeAtgard(
  feature: { layer?: { id?: string } | null; properties?: Record<string, any> | null },
  markers: readonly any[],
  lage: { stickvagMode?: boolean; snitselKarta?: boolean } = {},
): LinjeAtgard | null {
  const props = feature.properties ?? {};
  if (feature.layer?.id === VIDA_LINJE_TRAFFLAGER) return { typ: 'vida', kort: vidaLinjeKort(props.FLBESKR), props };
  const marker = markers.find((m) => String(m.id) === String(props.id));
  if (!marker) return null;
  if (lage.stickvagMode && lage.snitselKarta && marker.isLine && STICKVAGAR.includes(marker.lineType || '')) return { typ: 'stickvag-mat', marker };
  if (marker.isLine && marker.lineType === 'boundary') return { typ: 'granskort', marker };
  return { typ: 'markorkort', marker, kort: linjeKort(marker.lineType) };
}
