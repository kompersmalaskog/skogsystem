// REDIGERA LINJER PÅ KARTAN (Martin 2026-10-25, skiss 47–48): fingret/musen dras över kartan och gör det valda läget — Sudda, Förläng eller Koppla ihop. Den rena geometrin och markeringsändringarna
// ligger i lib/linjeRedigering; det här är bara pekaren: vilken linje/ände ligger under fingret, förhandsvisningen medan man drar, och vad som händer när man släpper.
//
// En sak i taget (ritläget): medan ett läge är på stänger sidan av all annan tryckning (lib/ritlageSparr) och det här tar över PEKAREN. Ett drag som börjar på en linje (eller en ände) flyttar INTE
// kartan — kartans panorering stängs av under draget och sätts på igen när det är klart; ett drag som börjar på tom mark panorerar kartan som vanligt. Mus och finger går samma väg
// (pekarhändelser). Fingrets bredd räknas om till meter vid varje tryck (`RADIE_PX_*`), så träffytan är lika stor på skärmen vid varje zoom.

import {
  avstandM, delstracka, hittaFaste, narmasteAnde, narmasteLinje, suddaIntervall,
  type Intervall, type LngLat,
} from './linjeRedigering';

export type RedLage = 'sudda' | 'forlang' | 'koppla';

/** En linje att peka på. `delar` = det som SYNS av den (en egen linje är hel; en Vida-linje kan vara delad av det som dolts). `coords` = hela originalet (sträckor räknas längs den). */
export interface RedLinje {
  id: string;
  egen: boolean;
  coords: LngLat[];
  delar: LngLat[][];
  /** Går den att sudda? (Vidas kraftledning gör det aldrig.) */
  skyddad?: boolean;
}

export type Faste =
  | { typ: 'ande'; id: string; ande: 'start' | 'slut'; punkt: LngLat }
  | { typ: 'punkt'; id: string; punkt: LngLat };

export interface RedIn {
  /** Vilket läge som är på (null = av). */
  lage: RedLage | null;
  /** Alla linjer just nu (egna redigerbara + Vidas). Läses vid varje tryck. */
  linjer: () => RedLinje[];
  onSudda: (id: string, intervall: Intervall[]) => void;
  onForlang: (id: string, ande: 'start' | 'slut', till: LngLat) => void;
  onKoppla: (id: string, ande: 'start' | 'slut', faste: Faste) => void;
  /** Ett kort tryck som inte tog tag i något (för att ta tillbaka en dold sträcka). */
  onTryck: (p: LngLat, radieM: number) => void;
}

export const RADIE_PX_FINGER = 22;
export const RADIE_PX_MUS = 14;
/** Ett tryck som rör sig mindre än så här (px) och går fortare än så här (ms) är ett tryck, inte ett drag. */
export const TRYCK_MAX_PX = 6;
export const TRYCK_MAX_MS = 500;

// ── Källor och lager ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Det som står stilla medan läget är på: ändhandtag (Förläng/Koppla) och spökena (dolda delar av Vidas linjer). */
export const LINJERED_KALLA = 'linjered-source';
/** Förhandsvisningen medan man drar (sidan skriver aldrig dit — det gör lyssnaren). */
export const LINJERED_FORHAND_KALLA = 'linjered-forhand-source';
export const LINJERED_LAGER = {
  spokeKant: 'line-linjered-spoke-kant',
  spoke: 'line-linjered-spoke',
  suddaKant: 'line-linjered-sudda-kant',
  sudda: 'line-linjered-sudda',
  forlangKant: 'line-linjered-forlang-kant',
  forlang: 'line-linjered-forlang',
  ande: 'line-linjered-ande',
  ring: 'line-linjered-ring',
} as const;
export const LINJERED_GRON = '#30d158';

/** Lagren (prefixet `line-` följer med in i körvyns whitelist; inga symbollager). */
export function linjeRedigeringLager(): any[] {
  const stat = LINJERED_KALLA, fh = LINJERED_FORHAND_KALLA;
  return [
    // Dolda delar av Vidas linjer: prickiga och svaga — det som finns men inte ritas.
    { id: LINJERED_LAGER.spokeKant, type: 'line', source: stat, filter: ['==', ['get', 'slag'], 'spoke'], layout: { 'line-cap': 'butt' }, paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-width': 5, 'line-dasharray': [1, 2] } },
    { id: LINJERED_LAGER.spoke, type: 'line', source: stat, filter: ['==', ['get', 'slag'], 'spoke'], layout: { 'line-cap': 'butt' }, paint: { 'line-color': 'rgba(255,255,255,0.75)', 'line-width': 3, 'line-dasharray': [1, 2] } },
    // Sudda: delen som försvinner när man släpper — prickig, vit med mörk kant.
    { id: LINJERED_LAGER.suddaKant, type: 'line', source: fh, filter: ['==', ['get', 'slag'], 'sudda'], layout: { 'line-cap': 'butt' }, paint: { 'line-color': 'rgba(0,0,0,0.7)', 'line-width': 9, 'line-dasharray': [0.6, 1.4] } },
    { id: LINJERED_LAGER.sudda, type: 'line', source: fh, filter: ['==', ['get', 'slag'], 'sudda'], layout: { 'line-cap': 'butt' }, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-dasharray': [0.6, 1.4] } },
    // Förläng/Koppla: en tunn linje från änden till pekaren.
    { id: LINJERED_LAGER.forlangKant, type: 'line', source: fh, filter: ['==', ['get', 'slag'], 'forlang'], layout: { 'line-cap': 'round' }, paint: { 'line-color': 'rgba(0,0,0,0.7)', 'line-width': 5 } },
    { id: LINJERED_LAGER.forlang, type: 'line', source: fh, filter: ['==', ['get', 'slag'], 'forlang'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2 } },
    // Ändhandtag (det man tar tag i) och den gröna ringen där en ände fäster.
    { id: LINJERED_LAGER.ande, type: 'circle', source: stat, filter: ['==', ['get', 'slag'], 'ande'], paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-color': 'rgba(0,0,0,0.8)', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport' } },
    { id: LINJERED_LAGER.ring, type: 'circle', source: fh, filter: ['==', ['get', 'slag'], 'ring'], paint: { 'circle-radius': 16, 'circle-color': 'rgba(48,209,88,0.18)', 'circle-stroke-color': LINJERED_GRON, 'circle-stroke-width': 4, 'circle-pitch-alignment': 'viewport' } },
  ];
}

type Fc = { type: 'FeatureCollection'; features: any[] };
const fc = (features: any[]): Fc => ({ type: 'FeatureCollection', features });
const linjeFeature = (slag: string, coords: LngLat[], extra: Record<string, unknown> = {}) => ({ type: 'Feature', properties: { slag, ...extra }, geometry: { type: 'LineString', coordinates: coords } });
const punktFeature = (slag: string, p: LngLat, extra: Record<string, unknown> = {}) => ({ type: 'Feature', properties: { slag, ...extra }, geometry: { type: 'Point', coordinates: p } });

/** Ändhandtagen (Förläng/Koppla): en prick i varje ände på de egna linjerna. En sluten ring har inga ändar. */
export function andeHandtag(linjer: readonly RedLinje[], lage: RedLage | null): Fc {
  if (lage !== 'forlang' && lage !== 'koppla') return fc([]);
  const f: any[] = [];
  for (const l of linjer) {
    if (!l.egen || l.coords.length < 2) continue;
    if (avstandM(l.coords[0], l.coords[l.coords.length - 1]) < 0.5) continue;
    f.push(punktFeature('ande', l.coords[0], { id: l.id, ande: 'start' }), punktFeature('ande', l.coords[l.coords.length - 1], { id: l.id, ande: 'slut' }));
  }
  return fc(f);
}

/** Förhandsvisningen av ett Sudda-drag: de sträckor som tas bort. */
export function suddaForhand(l: RedLinje, intervall: readonly Intervall[]): Fc {
  return fc(intervall.map(([a, b]) => linjeFeature('sudda', delstracka(l.coords, a, b))).filter((f) => f.geometry.coordinates.length >= 2));
}

/** Förhandsvisningen av ett Förläng/Koppla-drag: linjen från änden till pekaren (eller till fästet, med en grön ring). */
export function andeForhand(fran: LngLat, till: LngLat, faste: Faste | null): Fc {
  const slut = faste ? faste.punkt : till;
  const f: any[] = [linjeFeature('forlang', [fran, slut])];
  if (faste) f.push(punktFeature('ring', faste.punkt));
  return fc(f);
}

// ── Pekaren ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Meter per pixel runt en skärmpunkt (kartan kan vara lutad och vriden — mäts där man trycker). */
export function meterPerPx(map: any, x: number, y: number): number {
  const a = map.unproject([x, y]);
  const b = map.unproject([x + 10, y]);
  return avstandM([a.lng, a.lat], [b.lng, b.lat]) / 10;
}

/** Närmaste SYNLIGA del av en linje inom radien. */
export function narmasteSynliga(linjer: readonly RedLinje[], p: LngLat, radieM: number, bara?: (l: RedLinje) => boolean): RedLinje | null {
  const lista: Array<{ id: string; coords: LngLat[] }> = [];
  for (const l of linjer) if (!bara || bara(l)) l.delar.forEach((d, i) => { if (d.length >= 2) lista.push({ id: `${l.id}\u0000${i}`, coords: d }); });
  const t = narmasteLinje(lista, p, radieM);
  if (!t) return null;
  const id = t.id.split('\u0000')[0];
  return linjer.find((l) => l.id === id) ?? null;
}

interface Drag {
  pointerId: number;
  slag: 'sudda' | 'ande';
  linje: RedLinje;
  ande?: 'start' | 'slut';
  fran?: LngLat;
  prover: LngLat[];
  radieM: number;
  senaste: LngLat;
}

/**
 * Kopplar pekaren till kartan medan ett läge är på. `hamta` ger alltid senaste läget (sidan byter funktioner varje rendering).
 * Returnerar en avkopplare som också släpper kartans panorering och tar bort förhandsvisningen.
 */
export function kopplaLinjeRedigering(map: any, hamta: () => RedIn): () => void {
  const container: HTMLElement = map.getContainer();
  const foreTouchAction = container.style.touchAction;
  let drag: Drag | null = null;
  let tryck: { x: number; y: number; t: number; id: number } | null = null;
  let panFanns = false;

  const sattForhand = (d: Fc) => { try { (map.getSource(LINJERED_FORHAND_KALLA) as any)?.setData(d); } catch { /* källan inte klar */ } };
  const stangPan = () => { try { panFanns = !!map.dragPan?.isEnabled?.(); if (panFanns) map.dragPan.disable(); } catch { /* */ } };
  const oppnaPan = () => { try { if (panFanns) map.dragPan.enable(); } catch { /* */ } panFanns = false; };

  const punkt = (e: PointerEvent) => { const r = container.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const llAv = (x: number, y: number): LngLat => { const p = map.unproject([x, y]); return [p.lng, p.lat]; };

  const avsluta = () => {
    if (drag) { try { container.releasePointerCapture?.(drag.pointerId); } catch { /* */ } }
    drag = null;
    sattForhand(fc([]));
    oppnaPan();
  };

  const forhandUr = (d: Drag, p: LngLat) => {
    if (d.slag === 'sudda') {
      sattForhand(suddaForhand(d.linje, suddaIntervall(d.linje.coords, d.prover, d.radieM)));
      return;
    }
    const lage = hamta().lage;
    const faste = lage === 'koppla' ? fasteFor(d, p) : null;
    sattForhand(andeForhand(d.fran as LngLat, p, faste));
  };

  const fasteFor = (d: Drag, p: LngLat): Faste | null => {
    // Fäster på en annan linjes ÄNDE (så två linjer kan bli en) eller på närmaste punkt av en annan linje. Vidas linjer: bara det som syns. En linje fäster aldrig på sig själv.
    const alla = hamta().linjer();
    const kandidater: Array<{ id: string; coords: LngLat[]; egen: boolean }> = [];
    for (const l of alla) {
      if (l.id === d.linje.id) continue;
      if (l.egen) kandidater.push({ id: l.id, coords: l.coords, egen: true });
      else l.delar.forEach((del, i) => { if (del.length >= 2) kandidater.push({ id: `${l.id}\u0000${i}`, coords: del, egen: false }); });
    }
    const f = hittaFaste(kandidater, d.linje.id, p, d.radieM);
    return f ? (f.typ === 'ande' ? { typ: 'ande', id: f.id, ande: f.ande, punkt: f.punkt } : { typ: 'punkt', id: f.id.split('\u0000')[0], punkt: f.punkt }) : null;
  };

  const ned = (e: PointerEvent) => {
    const lage = hamta().lage;
    if (!lage) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (drag) { avsluta(); return; }          // en andra pekare under ett drag (nyp): ge upp draget
    if (!e.isPrimary) return;
    const { x, y } = punkt(e);
    const p = llAv(x, y);
    const radieM = meterPerPx(map, x, y) * (e.pointerType === 'mouse' ? RADIE_PX_MUS : RADIE_PX_FINGER);
    const linjer = hamta().linjer();

    let d: Drag | null = null;
    if (lage === 'sudda') {
      const l = narmasteSynliga(linjer, p, radieM, (x2) => !x2.skyddad);
      if (l) d = { pointerId: e.pointerId, slag: 'sudda', linje: l, prover: [p], radieM, senaste: p };
    } else {
      const eg = linjer.filter((l) => l.egen);
      const a = narmasteAnde(eg.map((l) => ({ id: l.id, coords: l.coords })), p, radieM);
      const l = a ? eg.find((x2) => x2.id === a.id) : null;
      if (a && l) d = { pointerId: e.pointerId, slag: 'ande', linje: l, ande: a.ande, fran: a.punkt, prover: [p], radieM, senaste: p };
    }
    if (!d) { tryck = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId }; return; }   // tom mark: kartan panorerar som vanligt (och ett kort tryck kan ta tillbaka något dolt)

    tryck = null;
    drag = d;
    e.stopPropagation();
    e.preventDefault();
    stangPan();
    try { container.setPointerCapture?.(e.pointerId); } catch { /* */ }
    forhandUr(d, p);
  };

  const flytt = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { x, y } = punkt(e);
    const med = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
    const r = container.getBoundingClientRect();
    for (const ce of med && med.length ? med : [e]) drag.prover.push(llAv(ce.clientX - r.left, ce.clientY - r.top));
    drag.senaste = llAv(x, y);
    forhandUr(drag, drag.senaste);
  };

  const upp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) {
      const d = drag;
      const { x, y } = punkt(e);
      const slutP = llAv(x, y);
      d.prover.push(slutP);
      avsluta();
      const h = hamta();
      if (d.slag === 'sudda') {
        const iv = suddaIntervall(d.linje.coords, d.prover, d.radieM);
        if (iv.length) h.onSudda(d.linje.id, iv);
      } else if (d.ande) {
        if (h.lage === 'forlang') { if (avstandM(d.fran as LngLat, slutP) >= 1) h.onForlang(d.linje.id, d.ande, slutP); }
        else {
          const f = fasteFor(d, slutP);
          if (f) h.onKoppla(d.linje.id, d.ande, f);
        }
      }
      return;
    }
    if (tryck && e.pointerId === tryck.id) {
      const t = tryck;
      tryck = null;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) <= TRYCK_MAX_PX && Date.now() - t.t <= TRYCK_MAX_MS) {
        const { x, y } = punkt(e);
        hamta().onTryck(llAv(x, y), meterPerPx(map, x, y) * (e.pointerType === 'mouse' ? RADIE_PX_MUS : RADIE_PX_FINGER));
      }
    }
  };

  const avbruten = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) avsluta();
    if (tryck && e.pointerId === tryck.id) tryck = null;
  };

  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', ned, true);   // fångstfasen: före kartans egna hanterare
  container.addEventListener('pointermove', flytt);
  container.addEventListener('pointerup', upp);
  container.addEventListener('pointercancel', avbruten);
  return () => {
    container.removeEventListener('pointerdown', ned, true);
    container.removeEventListener('pointermove', flytt);
    container.removeEventListener('pointerup', upp);
    container.removeEventListener('pointercancel', avbruten);
    container.style.touchAction = foreTouchAction;
    avsluta();
  };
}


