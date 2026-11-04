// KOMMENTAR-TECKEN (Martin 2026-11-04: "slippa trycka på alla symboler — visa att här finns en kommentar bakom").
// En liten vit pratbubbla i symbolens övre högra hörn när någon har skrivit något på den (kartkommentar eller markeringens gamla
// kommentar), en liten kamera i övre vänstra hörnet när den har ett foto. Linjer får tecknet mitt på linjen, ytor ovanför ytans namn.
// TEXTEN skrivs ALDRIG på kartan (regeln: bara ytnamn och avläggsnummer som fast text) — tecknet säger bara "tryck här, det finns mer".
// Tecknet följer styrkan (lib/narStyrka): samma opacitet som symbolen det sitter på.

import { avstandPunktM as avstandM, type LatLon } from './larm/geo';
import { delar, inrePunkt } from './ytaEtikett';
import { linjeGeometriNyckel } from './vidaNycklar';
import { ytaNyckel } from './traktGeometri';

export type TeckenSlag = 'text' | 'foto' | 'bada';
export const TECKEN_SLAG: readonly TeckenSlag[] = ['text', 'foto', 'bada'];

export function kommentarTecken(harText: boolean, harFoto: boolean): TeckenSlag | null {
  if (harText && harFoto) return 'bada';
  if (harText) return 'text';
  if (harFoto) return 'foto';
  return null;
}

/** Bilden i symbolens hörn (samma mått som symbolbilden, så den skalas och ligger exakt som symbolen). */
export const teckenHornBild = (slag: TeckenSlag) => `kommentar-${slag}`;
/** Bilden som står för sig själv (linjens mitt, ytans namn). */
export const teckenFriBild = (slag: TeckenSlag) => `kommentar-fri-${slag}`;

export const TECKEN_KALLA = 'kommentar-fri-source';
export const TECKEN_HORN_LAGER = 'markers-kommentar';
export const TECKEN_FRI_LAGER = 'markers-kommentar-fri';

// ── Var tecknen står för linjer och ytor ─────────────────────────────────────────────────────────────────────────────
type Pos = [number, number];

/** Punkten halvvägs längs linjen (mätt i meter, inte punkternas mitt). */
export function linjeMitt(coords: readonly Pos[]): Pos | null {
  if (coords.length === 0) return null;
  if (coords.length === 1) return coords[0];
  const ll = (p: Pos): LatLon => ({ lat: p[1], lon: p[0] });
  const steg: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) { const d = avstandM(ll(coords[i - 1]), ll(coords[i])); steg.push(d); total += d; }
  if (!(total > 0)) return coords[0];
  let kvar = total / 2;
  for (let i = 0; i < steg.length; i++) {
    if (kvar <= steg[i]) {
      const t = steg[i] > 0 ? kvar / steg[i] : 0;
      const a = coords[i], b = coords[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    kvar -= steg[i];
  }
  return coords[coords.length - 1];
}

export interface TeckenKalla {
  /** Kartkommentarernas nycklar (`marker:<id>`, Vidas `hansyn:…`/`linje:…`). */
  nycklar: ReadonlySet<string>;
  /** Egna linjer och ytor, redan i lng/lat. */
  egna: ReadonlyArray<{ id: string | number; slag: 'linje' | 'yta'; coords: Pos[]; harText: boolean; harFoto: boolean }>;
  /** Vidas geometri (objekt_geometri). */
  vida?: { features?: any[] } | null;
  /** Maskinens position (styrkan); null = full styrka. */
  styrka?: (p: Pos) => number;
}

/** Punkterna för linjer och ytor som har en kommentar eller ett foto. */
export function teckenPunkter(k: TeckenKalla) {
  const features: Array<{ type: 'Feature'; properties: Record<string, unknown>; geometry: { type: 'Point'; coordinates: Pos } }> = [];
  const lagg = (p: Pos | null, slag: TeckenSlag | null, ovanNamn: boolean, id: string) => {
    if (!p || !slag) return;
    features.push({ type: 'Feature', properties: { id, kommentar: slag, ovanNamn, nar: k.styrka ? k.styrka(p) : 1 }, geometry: { type: 'Point', coordinates: p } });
  };
  for (const e of k.egna) {
    const slag = kommentarTecken(e.harText || k.nycklar.has(`marker:${e.id}`), e.harFoto);
    if (e.slag === 'linje') lagg(linjeMitt(e.coords), slag, false, `marker:${e.id}`);
    else {
      const ring = e.coords;
      lagg(ring.length >= 3 ? inrePunkt([ring as any]) as unknown as Pos : null, slag, true, `marker:${e.id}`);
    }
  }
  const sett = new Set<string>();
  for (const f of k.vida?.features ?? []) {
    const g = f?.geometry;
    if (!g) continue;
    if (g.type === 'LineString' || g.type === 'MultiLineString') {
      const nyckel = linjeGeometriNyckel(g);
      if (!nyckel || !k.nycklar.has(nyckel) || sett.has(nyckel)) continue;
      sett.add(nyckel);
      const coords: Pos[] = g.type === 'LineString' ? g.coordinates : g.coordinates[0];
      lagg(linjeMitt(coords ?? []), 'text', false, nyckel);
    } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      const nyckel = ytaNyckel(f.properties);
      if (!nyckel || !k.nycklar.has(nyckel) || sett.has(nyckel)) continue;
      sett.add(nyckel);
      const d = delar(g);
      if (d.length) lagg(inrePunkt(d[0]) as unknown as Pos, 'text', true, nyckel);
    }
  }
  return { type: 'FeatureCollection' as const, features };
}

// ── Lagren ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Tecknet i symbolens hörn ligger på symbolernas egen källa (markers-source) och följer symbolens storlek och styrka. */
export function teckenHornLager(iconSize: any): any {
  return {
    id: TECKEN_HORN_LAGER, type: 'symbol', source: 'markers-source',
    filter: ['all', ['has', 'kommentar'], ['!=', ['get', 'kommentar'], null], ['!=', ['get', 'prick'], true]],
    layout: {
      'icon-image': ['concat', 'kommentar-', ['get', 'kommentar']], 'icon-size': iconSize,
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center',
      'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport',
    },
    paint: { 'icon-opacity': ['number', ['get', 'opacity'], 1] },
  };
}

export function teckenFriLager(): any {
  return {
    id: TECKEN_FRI_LAGER, type: 'symbol', source: TECKEN_KALLA,
    layout: {
      'icon-image': ['concat', 'kommentar-fri-', ['get', 'kommentar']], 'icon-size': 1,
      // Över ytans namn (namnet står i punkten), annars rakt på linjen.
      'icon-offset': ['case', ['==', ['get', 'ovanNamn'], true], ['literal', [0, -22]], ['literal', [0, 0]]],
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-anchor': 'center',
      'icon-pitch-alignment': 'viewport', 'icon-rotation-alignment': 'viewport',
    },
    paint: { 'icon-opacity': ['number', ['get', 'nar'], 1] },
  };
}

// ── Bilderna (webbläsaren) ────────────────────────────────────────────────────────────────────────────────────────────
const KANT = 'rgba(0,0,0,0.85)';

function bubbla(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const w = r * 2, h = r * 1.55, x = cx - r, y = cy - h / 2 - r * 0.15;
  const rr = h * 0.42;
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + w * 0.42, y + h); ctx.lineTo(x + w * 0.22, y + h + r * 0.5); ctx.lineTo(x + w * 0.26, y + h);
  ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = r * 0.32; ctx.strokeStyle = KANT; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  // tre små prickar = "text"
  ctx.fillStyle = KANT;
  for (const dx of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.arc(cx + dx * r, y + h / 2, r * 0.13, 0, Math.PI * 2); ctx.fill(); }
}

function kamera(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const w = r * 2, h = r * 1.4, x = cx - r, y = cy - h / 2 + r * 0.1;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.38, y - r * 0.32); ctx.lineTo(x + w * 0.62, y - r * 0.32); ctx.lineTo(x + w * 0.7, y);
  ctx.lineTo(x + w - r * 0.25, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r * 0.25);
  ctx.lineTo(x + w, y + h - r * 0.25); ctx.quadraticCurveTo(x + w, y + h, x + w - r * 0.25, y + h);
  ctx.lineTo(x + r * 0.25, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r * 0.25);
  ctx.lineTo(x, y + r * 0.25); ctx.quadraticCurveTo(x, y, x + r * 0.25, y);
  ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = r * 0.32; ctx.strokeStyle = KANT; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, y + h / 2, r * 0.38, 0, Math.PI * 2); ctx.lineWidth = r * 0.2; ctx.strokeStyle = KANT; ctx.stroke();
}

const PR = 2;
/** I hörnet: samma logiska storlek som symbolbilden (64 px), bubblan uppe till höger, kameran uppe till vänster. */
export function ritaHornBild(slag: TeckenSlag, storlek = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = storlek * PR; c.height = storlek * PR;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(PR, PR);
  const r = storlek * 0.17;
  if (slag !== 'foto') bubbla(ctx, storlek - r - 1, r + 2, r);
  if (slag !== 'text') kamera(ctx, r + 1, r + 2, r);
  return c;
}

/** Fristående (linje, yta): bubblan och/eller kameran bredvid varandra, 13 px radie på skärmen. */
export function ritaFriBild(slag: TeckenSlag): HTMLCanvasElement {
  const r = 10, w = slag === 'bada' ? r * 4.8 : r * 2.6, h = r * 2.6;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * PR); c.height = Math.ceil(h * PR);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(PR, PR);
  if (slag === 'bada') { bubbla(ctx, r * 1.3, h / 2, r); kamera(ctx, w - r * 1.3, h / 2, r); }
  else if (slag === 'text') bubbla(ctx, w / 2, h / 2, r);
  else kamera(ctx, w / 2, h / 2, r);
  return c;
}

/** Lägger till de sex bilderna på kartan (en gång). */
export function laggTillTeckenBilder(map: any) {
  for (const slag of TECKEN_SLAG) {
    try {
      if (!map.hasImage(teckenHornBild(slag))) { const c = ritaHornBild(slag); const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height); if (d) map.addImage(teckenHornBild(slag), { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) }, { pixelRatio: PR }); }
      if (!map.hasImage(teckenFriBild(slag))) { const c = ritaFriBild(slag); const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height); if (d) map.addImage(teckenFriBild(slag), { width: c.width, height: c.height, data: new Uint8Array(d.data.buffer) }, { pixelRatio: PR }); }
    } catch { /* stilen laddas om */ }
  }
}
