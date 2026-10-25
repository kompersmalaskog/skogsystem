// REDIGERA LINJER (Martin 2026-10-25, skiss 47–48): sudda, förläng och koppla ihop — för vägar och alla ritade linjer. Allt här är RENT (ingen karta, ingen skärm): geometrin räknas i meter
// i ett lokalt plan, och markeringarna returneras som nya värden som sidan sparar. Pixlar finns inte här — sidan räknar om fingrets storlek till meter (`radieM`) vid trycket.
//
// REGLER (varje rad är ett beslut från Martin):
//   • SUDDA: BARA linjen man började dra på påverkas. Det som suddas är den del av DEN linjen som fingret/musen strukit över; linjer som korsar rörs aldrig (`suddaIntervall` får bara EN linje).
//     Suddar man mitt på blir det två linjer (`suddaMarkor`), suddar man en ände blir den kortare, suddar man allt försvinner linjen.
//   • FÖRLÄNG: dra i en linjes ände så följer den med — släpper man läggs den nya änden till (`forlangMarkor`). Att korta en linje görs med Sudda.
//   • KOPPLA IHOP: dra en ände nära en annan linje → änden fäster på den när man släpper (`kopplaMarkor`). Är det ANDRA linjens ände och linjerna är av samma sort blir de EN linje.
//   • KÖRORDNING, LÄNGD OCH SNITSELFÄRG FÖLJER MED: en delad väg ger delarna platserna n, n+1 … i körordningen (resten flyttas), snitselfärgen finns kvar på alla delar, längden räknas ur
//     banan, och backvägens hinder följer med den ände det satt i. Kommentar, foto och ljud stannar hos första delen (en sak får inte bli dubbel). Delarna får inget `nummer`: sidans
//     numrering ger dem nästa lediga (förarens adress "Basväg 3" är kvar hos första delen).
//   • TRAKTGRÄNSEN (boundary) går INTE att redigera här — den ändras med "Justera gräns". Sidan filtrerar bort den; `arRedigerbar` är den enda definitionen.

export type LngLat = [number, number];
export interface SvgPunkt { x: number; y: number }

const M_PER_GRAD = 111320;

/** Linjetyper som aldrig redigeras här. */
export const EJ_REDIGERBARA_LINJER: readonly string[] = ['boundary'];

/** Kan den här markeringen redigeras som en linje? (Linje med minst två punkter, inte traktgränsen.) */
export function arRedigerbar(m: { isLine?: boolean; lineType?: string; path?: readonly unknown[] } | null | undefined): boolean {
  return !!m && m.isLine === true && !!m.lineType && !EJ_REDIGERBARA_LINJER.includes(m.lineType) && Array.isArray(m.path) && m.path.length >= 2;
}

// ── Geometri ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Xy { x: number; y: number }
const kosLat = (lat: number): number => Math.cos((lat * Math.PI) / 180);

function planUr(ref: LngLat) {
  const kx = M_PER_GRAD * kosLat(ref[1]);
  return {
    till: (c: LngLat): Xy => ({ x: (c[0] - ref[0]) * kx, y: (c[1] - ref[1]) * M_PER_GRAD }),
    fran: (p: Xy): LngLat => [ref[0] + p.x / kx, ref[1] + p.y / M_PER_GRAD],
  };
}

/** Avstånd i meter mellan två punkter. */
export function avstandM(a: LngLat, b: LngLat): number {
  const kx = M_PER_GRAD * kosLat((a[1] + b[1]) / 2);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * M_PER_GRAD);
}

/** Linjens längd i meter. */
export function langdM(coords: readonly LngLat[]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += avstandM(coords[i - 1], coords[i]);
  return s;
}

export interface Narmast { /** sträcka längs linjen, meter från början */ s: number; avstand: number; punkt: LngLat; /** segmentets index */ seg: number }

/** Närmaste punkt på linjen. */
export function narmastaPunkt(coords: readonly LngLat[], p: LngLat): Narmast | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return { s: 0, avstand: avstandM(coords[0], p), punkt: coords[0], seg: 0 };
  const plan = planUr(p);
  let bast: Narmast | null = null;
  let cum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = plan.till(coords[i]);
    const b = plan.till(coords[i + 1]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / l2));
    const qx = a.x + t * dx, qy = a.y + t * dy;
    const d = Math.hypot(qx, qy);
    const seglen = Math.sqrt(l2);
    if (!bast || d < bast.avstand) bast = { s: cum + t * seglen, avstand: d, punkt: plan.fran({ x: qx, y: qy }), seg: i };
    cum += seglen;
  }
  return bast;
}

/** Punkten `s` meter från början (klämd till linjen). */
export function punktVid(coords: readonly LngLat[], s: number): LngLat {
  if (coords.length === 0) return [0, 0];
  if (s <= 0 || coords.length === 1) return coords[0];
  let cum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const l = avstandM(coords[i], coords[i + 1]);
    if (s <= cum + l && l > 0) {
      const t = (s - cum) / l;
      return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
    }
    cum += l;
  }
  return coords[coords.length - 1];
}

/** Delen av linjen mellan `s0` och `s1` (meter från början), med inräknade ändpunkter. */
export function delstracka(coords: readonly LngLat[], s0: number, s1: number): LngLat[] {
  const total = langdM(coords);
  const a = Math.max(0, s0), b = Math.min(total, s1);
  if (b <= a) return [];
  const ut: LngLat[] = [punktVid(coords, a)];
  let cum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    cum += avstandM(coords[i], coords[i + 1]);
    if (cum > a && cum < b) ut.push(coords[i + 1]);
  }
  ut.push(punktVid(coords, b));
  return ut.filter((p, i) => i === 0 || avstandM(p, ut[i - 1]) > 1e-6);
}

export type Intervall = [number, number];

/** Sammanfogar överlappande (eller så när som på `glapp` meter) intervall, sorterade. */
export function slaIhopIntervall(iv: readonly Intervall[], glapp = 0): Intervall[] {
  const s = iv.filter((x) => x[1] > x[0]).map((x) => [x[0], x[1]] as Intervall).sort((a, b) => a[0] - b[0]);
  const ut: Intervall[] = [];
  for (const x of s) {
    const sista = ut[ut.length - 1];
    if (sista && x[0] <= sista[1] + glapp) sista[1] = Math.max(sista[1], x[1]);
    else ut.push([x[0], x[1]]);
  }
  return ut;
}

/**
 * SUDDA: vilka sträckor (meter längs linjen) har fingret/musen strukit över? `prover` = pekarens positioner under draget i ordning; `radieM` = hur nära linjen pekaren ska vara för att
 * räknas (fingrets bredd i meter). Varje prov nära linjen suddar `pensel` meter åt vardera håll; två prov i följd som båda är nära suddar även sträckan mellan dem (en snabb
 * dragning lämnar inga hål) — men bara om sträckan mellan dem är rimlig mot hur långt pekaren rört sig, så ett hårnålsböj där linjen kommer tillbaka inte suddar hela slingan.
 */
export function suddaIntervall(coords: readonly LngLat[], prover: readonly LngLat[], radieM: number, penselM: number = radieM * 0.6): Intervall[] {
  const total = langdM(coords);
  const proj = prover.map((p) => narmastaPunkt(coords, p));
  const nara = proj.map((r) => !!r && r.avstand <= radieM);
  const iv: Intervall[] = [];
  for (let i = 0; i < proj.length; i++) {
    const r = proj[i];
    if (!r || !nara[i]) continue;
    iv.push([r.s - penselM, r.s + penselM]);
    if (i > 0 && nara[i - 1]) {
      const f = proj[i - 1]!;
      if (Math.abs(r.s - f.s) <= avstandM(prover[i - 1], prover[i]) + 2 * radieM) iv.push([Math.min(r.s, f.s), Math.max(r.s, f.s)]);
    }
  }
  return slaIhopIntervall(iv.map(([a, b]) => [Math.max(0, a), Math.min(total, b)] as Intervall));
}

export interface Bit { coords: LngLat[]; /** var på originalet delen börjar och slutar (meter) */ fran: number; till: number }

/** Det som är kvar när intervallen tagits bort. Bitar kortare än `minM` försvinner (ett stubbrest på någon meter är ingen linje). */
export function restBitar(coords: readonly LngLat[], intervall: readonly Intervall[], minM = 1): Bit[] {
  const total = langdM(coords);
  const iv = slaIhopIntervall(intervall);
  const bitar: Bit[] = [];
  let borjar = 0;
  const skjut = (a: number, b: number) => { if (b - a >= minM) bitar.push({ coords: delstracka(coords, a, b), fran: a, till: b }); };
  for (const [a, b] of iv) { skjut(borjar, a); borjar = Math.max(borjar, b); }
  skjut(borjar, total);
  return bitar.filter((x) => x.coords.length >= 2);
}

// ── Markeringar ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface LinjeMarkor {
  id: number | string;
  lineType?: string;
  isLine?: boolean;
  path?: SvgPunkt[];
  ordning?: number;
  riktningBak?: boolean;
  korKlar?: string;
  nummer?: number;
  backvag?: { ande: 'start' | 'slut' };
  risaPath?: SvgPunkt[];
  comment?: string;
  [falt: string]: unknown;
}

/** Hur sidan gör om mellan markeringarnas x/y och kartans [lng, lat], och ger nya id:n. */
export interface Omvandling {
  tillLngLat: (p: SvgPunkt) => LngLat;
  tillSvg: (c: LngLat) => SvgPunkt;
  nyttId: () => number;
}

/** Vad sidan ska göra efter en redigering: det nya läget, vilka markeringar som ska skrivas och vilka som ska tas bort. */
export interface Resultat<M extends LinjeMarkor> { markers: M[]; sparas: M[]; tasBort: Array<number | string> }

/** Fält som hör till EN sak (ett foto, en kommentar, ett ljud): de stannar hos den första delen och blir inte dubbla. */
const PERSONLIGA_FALT = ['comment', 'photoData', 'photoPath', 'photoTs', 'photoAv', 'photoAvNamn', 'photoTaget', 'audioData', 'notes', 'roadCheck'] as const;

const utan = <M extends object>(m: M, falt: readonly string[]): M => { const ut: Record<string, unknown> = { ...(m as Record<string, unknown>) }; for (const f of falt) delete ut[f]; return ut as M; };
const lngLatAv = (m: LinjeMarkor, omv: Omvandling): LngLat[] => (m.path ?? []).map((p) => omv.tillLngLat(p));
const svgAv = (c: readonly LngLat[], omv: Omvandling): SvgPunkt[] => c.map((p) => omv.tillSvg(p));
const ordningAv = (m: LinjeMarkor): number | null => (typeof m.ordning === 'number' && Number.isFinite(m.ordning) && m.ordning >= 1 ? Math.floor(m.ordning) : null);

/** Risa-sträckan hör till en bit om alla dess punkter ligger på biten (inom 2 m). */
function risaPaBit(risa: readonly SvgPunkt[] | undefined, bit: readonly LngLat[], omv: Omvandling): boolean {
  if (!risa || risa.length < 2) return false;
  return risa.every((p) => (narmastaPunkt(bit, omv.tillLngLat(p))?.avstand ?? Infinity) <= 2);
}

/** Flyttar körordningen: alla vägar med plats efter `efter` flyttas `delta` steg (en delad väg tar fler platser, en bortsuddad eller ihopkopplad ger tillbaka). */
function flyttaOrdning<M extends LinjeMarkor>(alla: readonly M[], undantag: ReadonlySet<string>, efter: number, delta: number): M[] {
  if (delta === 0) return [...alla];
  return alla.map((m) => {
    const o = ordningAv(m);
    if (o == null || o <= efter || undantag.has(String(m.id))) return m;
    return { ...m, ordning: o + delta };
  });
}

/**
 * SUDDA en linje. `intervall` = det som ska bort (meter längs linjen, ur `suddaIntervall`). Resultatet:
 *   • inget kvar → linjen tas bort (och körordningen stänger luckan)
 *   • en bit kvar → samma linje, kortare (id, nummer, kommentar och foto kvar)
 *   • flera bitar → första biten behåller linjen (id, nummer, kommentar, foto); övriga får nya id:n och inget nummer
 */
export function suddaMarkor<M extends LinjeMarkor>(alla: readonly M[], id: number | string, intervall: readonly Intervall[], omv: Omvandling): Resultat<M> {
  const m = alla.find((x) => String(x.id) === String(id));
  if (!m || !arRedigerbar(m as any)) return { markers: [...alla], sparas: [], tasBort: [] };
  const coords = lngLatAv(m, omv);
  const total = langdM(coords);
  const bitar = restBitar(coords, intervall);
  const ordning = ordningAv(m);

  if (bitar.length === 0) {
    const markers = flyttaOrdning(alla.filter((x) => String(x.id) !== String(m.id)), new Set(), ordning ?? Infinity, -1);
    const orig0 = new Map(alla.map((x) => [String(x.id), x]));
    return { markers, sparas: markers.filter((x) => orig0.get(String(x.id)) !== x), tasBort: [m.id] };
  }

  // Bitarna i KÖRRIKTNING: körordningen delas ut i den ordning maskinen kör dem.
  const iKorordning = bitar.map((_, i) => i);
  if (m.riktningBak === true) iKorordning.reverse();
  const platsAv = new Map<number, number>();
  iKorordning.forEach((bitIdx, pos) => platsAv.set(bitIdx, pos));

  const ny: M[] = bitar.map((b, i) => {
    const forsta = i === 0;
    let u: M = { ...m, path: svgAv(b.coords, omv) };
    if (!forsta) u = { ...utan(u, [...PERSONLIGA_FALT, 'nummer', 'backvag', 'risaPath']), id: omv.nyttId() } as M;
    if (ordning != null) u = { ...u, ordning: ordning + (platsAv.get(i) as number) };
    // Backvägens hinder följer med den ände det satt i — och bara om just den änden finns kvar.
    if (m.backvag) {
      const andeKvar = m.backvag.ande === 'start' ? (i === 0 && b.fran <= 1e-6) : (i === bitar.length - 1 && b.till >= total - 1e-6);
      if (andeKvar) u = { ...u, backvag: m.backvag }; else u = utan(u, ['backvag']);
    }
    if (forsta || !m.risaPath) {
      if (m.risaPath && !risaPaBit(m.risaPath, b.coords, omv)) u = utan(u, ['risaPath']);
    } else if (risaPaBit(m.risaPath, b.coords, omv)) u = { ...u, risaPath: m.risaPath } as M;
    return u;
  });

  const ersatt = new Map<string, M>(ny.map((x) => [String(x.id), x]));
  let markers = alla.map((x) => ersatt.get(String(x.id)) ?? x);
  markers = [...markers, ...ny.filter((x) => String(x.id) !== String(m.id))];
  if (ordning != null) markers = flyttaOrdning(markers, new Set(ny.map((x) => String(x.id))), ordning, ny.length - 1);
  const orig = new Map(alla.map((x) => [String(x.id), x]));
  const sparas = markers.filter((x) => orig.get(String(x.id)) !== x);
  return { markers, sparas, tasBort: [] };
}

/** FÖRLÄNG: lägger en ny ände (`till`) vid linjens `ande`. Läggs som en ny punkt — den gamla änden finns kvar där den var. */
export function forlangMarkor<M extends LinjeMarkor>(alla: readonly M[], id: number | string, ande: 'start' | 'slut', till: LngLat, omv: Omvandling): Resultat<M> {
  const m = alla.find((x) => String(x.id) === String(id));
  if (!m || !arRedigerbar(m as any)) return { markers: [...alla], sparas: [], tasBort: [] };
  const coords = lngLatAv(m, omv);
  const gamla = ande === 'start' ? coords[0] : coords[coords.length - 1];
  if (avstandM(gamla, till) < 1) return { markers: [...alla], sparas: [], tasBort: [] };   // en ände som knappt flyttats är ingen förlängning
  const nyPunkt = omv.tillSvg(till);
  const path = ande === 'start' ? [nyPunkt, ...(m.path as SvgPunkt[])] : [...(m.path as SvgPunkt[]), nyPunkt];
  const uppd = { ...m, path } as M;
  return { markers: alla.map((x) => (String(x.id) === String(m.id) ? uppd : x)), sparas: [uppd], tasBort: [] };
}

export type Koppling =
  | { typ: 'punkt'; punkt: LngLat }
  | { typ: 'ande'; id: number | string; ande: 'start' | 'slut'; punkt: LngLat };

/** Är den här kopplingen en sammanslagning av två egna linjer av samma sort? */
export function kanSlasIhop(a: LinjeMarkor, mal: LinjeMarkor): boolean {
  if (String(a.id) === String(mal.id) || !arRedigerbar(a as any) || !arRedigerbar(mal as any)) return false;
  if (a.lineType !== mal.lineType) return false;
  if (a.lineType === 'mainRoad' && (a.farg ?? null) !== (mal.farg ?? null)) return false;       // en röd och en blå väg blir inte en
  if (a.risaPath && a.risaPath.length >= 2 && mal.risaPath && mal.risaPath.length >= 2) return false;   // två risa-sträckor går inte ihop (som i den gamla sammanslagningen)
  return true;
}

/**
 * KOPPLA IHOP: `ande` på linje `id` fäster på `mal`.
 *   • mal = en punkt på en annan linje (mitt på) eller en annan sort → bara änden flyttas dit (en ny sista punkt)
 *   • mal = ANDRA egna linjens ände av samma sort → de blir EN linje. Linjen man drog behåller sitt id, sin riktning och sina fält; den andra tas bort.
 * Körordningen: den dragna linjens plats gäller; den andra linjens plats ges tillbaka. Lägsta `nummer` behålls (förarens adress). Snitselfärgen är densamma (kanSlasIhop kräver det).
 */
export function kopplaMarkor<M extends LinjeMarkor>(alla: readonly M[], id: number | string, ande: 'start' | 'slut', mal: Koppling, omv: Omvandling): Resultat<M> {
  const a = alla.find((x) => String(x.id) === String(id));
  if (!a || !arRedigerbar(a as any)) return { markers: [...alla], sparas: [], tasBort: [] };

  if (mal.typ === 'ande') {
    const b = alla.find((x) => String(x.id) === String(mal.id));
    if (b && kanSlasIhop(a, b)) {
      const aPath = a.path as SvgPunkt[];
      const bPath = b.path as SvgPunkt[];
      // A:s bana behåller sin riktning. Ände mot ände: A.slut–B.start → A+B · A.slut–B.slut → A+rev(B) · A.start–B.slut → B+A · A.start–B.start → rev(B)+A
      let path: SvgPunkt[];
      if (ande === 'slut') path = mal.ande === 'start' ? [...aPath, ...bPath] : [...aPath, ...[...bPath].reverse()];
      else path = mal.ande === 'slut' ? [...bPath, ...aPath] : [...[...bPath].reverse(), ...aPath];
      const dubbel = (p: SvgPunkt[]) => p.filter((q, i) => i === 0 || avstandM(omv.tillLngLat(q), omv.tillLngLat(p[i - 1])) > 0.3);   // ingen dubbel skarvpunkt
      path = dubbel(path);

      let u: M = { ...a, path } as M;
      // Backvägens hinder: A:s gäller om dess ände inte är skarven; annars B:s om B:s hinder satt i B:s yttre ände.
      const aSkarv = a.backvag?.ande === ande;
      const bYtterAnde: 'start' | 'slut' = mal.ande === 'start' ? 'slut' : 'start';
      const bHinder = b.backvag && b.backvag.ande === bYtterAnde;
      if (a.backvag && !aSkarv) u = { ...u, backvag: a.backvag };   // A:s hinder sitter i den andra änden: det är kvar
      else if (bHinder) {
        // B:s yttre ände ligger nu i A:s motsatta ände om skarven är i A:s `ande`: mappa till den nya banans ände.
        const nyAnde: 'start' | 'slut' = ande === 'slut' ? 'slut' : 'start';
        u = { ...u, backvag: { ande: nyAnde } };
      } else u = utan(u, ['backvag']);
      // Körordning: A:s gäller. A:s klar-tid gäller bara om även B är klar (annars är den hopsatta vägen inte körd).
      if (a.korKlar && !(ordningAv(b) == null || b.korKlar)) u = utan(u, ['korKlar']);
      // Nummer: det LÄGSTA (som vid den gamla sammanslagningen). Kommentarer slås ihop.
      const nrs = [a.nummer, b.nummer].filter((n): n is number => typeof n === 'number');
      if (nrs.length) u = { ...u, nummer: Math.min(...nrs) };
      const kommentarer = [a.comment, b.comment].filter(Boolean) as string[];
      if (kommentarer.length) u = { ...u, comment: kommentarer.join('\n') };
      if (!(a.risaPath && a.risaPath.length >= 2) && b.risaPath && b.risaPath.length >= 2) u = { ...u, risaPath: b.risaPath };
      for (const f of ['photoPath', 'photoData', 'photoTs', 'photoAv', 'photoAvNamn', 'photoTaget', 'audioData'] as const) if (u[f] == null && b[f] != null) (u as any)[f] = b[f];

      const bOrd = ordningAv(b);
      let markers: M[] = alla.filter((x) => String(x.id) !== String(b.id)).map((x) => (String(x.id) === String(a.id) ? u : x));
      if (bOrd != null) markers = flyttaOrdning(markers, new Set(), bOrd, -1);   // den andra vägens plats ges tillbaka (också A flyttas upp om den låg efter)
      const orig = new Map(alla.map((x) => [String(x.id), x]));
      return { markers, sparas: markers.filter((x) => orig.get(String(x.id)) !== x), tasBort: [b.id] };
    }
  }
  // Annars: änden fäster på punkten (en ny sista/första punkt). Samma sak som Förläng, men på ett bestämt ställe.
  return forlangMarkor(alla, id, ande, mal.punkt, omv);
}

// ── Vilken ände, vilken linje? (för trycket) ──────────────────────────────────────────────────────────────────────────────────────────────────
export interface AndeTraff { id: string; ande: 'start' | 'slut'; avstand: number; punkt: LngLat }

/** Närmaste ände (av alla linjer) inom `radieM` från `p`. Linjer som är en sluten ring har inga ändar. */
export function narmasteAnde(linjer: ReadonlyArray<{ id: string; coords: readonly LngLat[] }>, p: LngLat, radieM: number): AndeTraff | null {
  let bast: AndeTraff | null = null;
  for (const l of linjer) {
    if (l.coords.length < 2) continue;
    if (avstandM(l.coords[0], l.coords[l.coords.length - 1]) < 0.5) continue;   // ring
    for (const [ande, c] of [['start', l.coords[0]], ['slut', l.coords[l.coords.length - 1]]] as const) {
      const d = avstandM(c, p);
      if (d <= radieM && (!bast || d < bast.avstand)) bast = { id: l.id, ande, avstand: d, punkt: c };
    }
  }
  return bast;
}

export interface LinjeTraff { id: string; avstand: number; punkt: LngLat; s: number }

/** Närmaste linje inom `radieM` från `p`. */
export function narmasteLinje(linjer: ReadonlyArray<{ id: string; coords: readonly LngLat[] }>, p: LngLat, radieM: number): LinjeTraff | null {
  let bast: LinjeTraff | null = null;
  for (const l of linjer) {
    const n = narmastaPunkt(l.coords, p);
    if (n && n.avstand <= radieM && (!bast || n.avstand < bast.avstand)) bast = { id: l.id, avstand: n.avstand, punkt: n.punkt, s: n.s };
  }
  return bast;
}

/**
 * Var fäster en dragen ände? Först en annan linjes ÄNDE (så två linjer kan bli en), annars närmaste punkt på en annan linje. `egenId` räknas aldrig (en linje kan inte kopplas till sig själv).
 * `andraLinjer` = alla linjer att fästa på (egna och Vidas synliga delar); bara egna kan slås ihop, men Vidas får en fäst punkt.
 */
export function hittaFaste(
  andraLinjer: ReadonlyArray<{ id: string; coords: readonly LngLat[]; egen: boolean }>,
  egenId: string,
  p: LngLat,
  radieM: number,
): ({ typ: 'ande'; id: string; ande: 'start' | 'slut'; punkt: LngLat } | { typ: 'punkt'; id: string; punkt: LngLat } | null) {
  const kandidater = andraLinjer.filter((l) => l.id !== egenId);
  const andeTraff = narmasteAnde(kandidater.filter((l) => l.egen), p, radieM);
  if (andeTraff) return { typ: 'ande', id: andeTraff.id, ande: andeTraff.ande, punkt: andeTraff.punkt };
  const linjeTraff = narmasteLinje(kandidater, p, radieM);
  return linjeTraff ? { typ: 'punkt', id: linjeTraff.id, punkt: linjeTraff.punkt } : null;
}
