// Vägvarningen efter riskbedömning (Martin 2026-11-25): VÄGEN markeras — inte traktgränsen — och färgen säger hur långt riskbedömningen kommit.
//
//   Ej riskbedömd      → orange band över vägen + orange ⚠
//   Bedömd, låg risk   → inget band, liten grön ✓
//   Bedömd, hög risk   → rött band + röd ⚠        ("Förhöjd" i panelen räknas hit: all risk över låg är hög här — hellre ett rött band för mycket än ett för lite)
//
// ⚠/✓ ligger PÅ vägen, i den punkt på vägen som ligger närmast traktgränsen — aldrig på gränsen. Den röda pulserande markeringen på gränsen finns inte längre.
// En väg = ett band och en symbol per objekt (lib/tmaVagar: ägaren är den traktdel som ligger närmast vägen); ägarens riskbedömning (tma_assessments.risk_answers) avgör färgen,
// och det är samma bedömning som panelen öppnar när man trycker på symbolen.
//
// Ren logik, testad i lib/vagRisk.test.ts. Kartan och symbolerna ritas i app/planering/page.tsx.
import { FARG } from './design/tokens';
import { meterBredd } from './sparStil';
import { tmaRisknivå, type TmaRiskSvar } from './tmaSpar';
import type { LatLon, Vagvarning } from './tmaVagar';

export type VagRisk = 'obedomd' | 'lag' | 'hog';

/** Riskbedömningens läge ur de sju frågorna. Inte alla besvarade (eller inget sparat) = ej riskbedömd. */
export function vagRisk(risk: TmaRiskSvar | undefined): VagRisk {
  const nivå = risk ? tmaRisknivå(risk) : null;
  if (nivå === null) return 'obedomd';
  return nivå === 'low' ? 'lag' : 'hog';
}

export interface VagUtseende {
  /** Bandet över vägen ritas bara när något återstår att göra eller något är farligt. */
  band: boolean;
  farg: string;
  tecken: '⚠' | '✓';
  /** Hela symbolens synliga storlek i px (✓ är liten, ⚠ är stor). */
  storlek: number;
  /** Ordet som bär betydelsen (färg bär aldrig ensam): aria-label/title. */
  text: string;
}

export const VAG_UTSEENDE: Record<VagRisk, VagUtseende> = {
  obedomd: { band: true, farg: FARG.orange, tecken: '⚠', storlek: 36, text: 'Väg nära avverkning – ej riskbedömd' },
  lag: { band: false, farg: FARG.gron, tecken: '✓', storlek: 24, text: 'Väg nära avverkning – låg risk' },
  hog: { band: true, farg: FARG.rod, tecken: '⚠', storlek: 36, text: 'Väg nära avverkning – hög risk' },
};

/** Bandets bredd i meter (brett — inte en tunn linje, så det aldrig förväxlas med traktgränsen) och hur genomskinligt det är. */
export const VAG_BAND_M = 20;
export const VAG_BAND_OPACITET = 0.5;
/** Minsta tryckyta runt symbolen (px). */
export const VAG_TRYCKYTA_PX = 44;

/** Bandets lager och källa på kartan (prefixet tma-roads- följer med in i körvyns lager-whitelist). */
export const VAG_BAND_KALLA = 'tma-roads-source';
export const VAG_BAND_LAGER = 'tma-roads-band';
/** Bandets målning: brett (i meter, golv 10 px utzoomat), halvgenomskinligt, färgen ur featurens `risk`. Samma i planeringsvyn och maskinvyn. */
export function vagBandPaint(): Record<string, any> {
  return {
    'line-color': ['match', ['get', 'risk'], 'hog', FARG.rod, FARG.orange],
    'line-width': meterBredd(VAG_BAND_M, 10),
    'line-opacity': VAG_BAND_OPACITET,
  };
}

// ── Geometri: den punkt PÅ vägen som ligger närmast traktgränsen ─────────────────────────────────────────────────────────────────────────────────

interface P { x: number; y: number }

/** Närmaste punkt på segmentet a–b till p, och avståndet dit. */
function paSegment(p: P, a: P, b: P): { pt: P; d: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  const pt = { x: a.x + t * dx, y: a.y + t * dy };
  return { pt, d: Math.hypot(pt.x - p.x, pt.y - p.y) };
}

/**
 * Punkten på vägen (någon av linjerna) som ligger närmast traktgränsen (en polyline eller ring). Både gränsens hörn mot vägens kanter och vägens hörn mot gränsens kanter
 * prövas — en lång gränskant som löper längs vägen utan hörn i närheten ska ändå ge rätt plats. Ger alltid en punkt PÅ vägen, aldrig på gränsen.
 * Meter i ett lokalt plan (samma 111 km/grad som övriga närhetsberäkningar i planeringsvyn). Null när vägen eller gränsen saknar punkter.
 */
export function narmastaPunktPaVag(linjer: LatLon[][], grans: LatLon[]): LatLon | null {
  const vag = linjer.filter((l) => l.length >= 1);
  if (vag.length === 0 || grans.length === 0) return null;
  const lat0 = vag[0][0].lat, lon0 = vag[0][0].lon;
  const kx = 111000 * Math.cos((lat0 * Math.PI) / 180), ky = 111000;
  const till = (q: LatLon): P => ({ x: (q.lon - lon0) * kx, y: (q.lat - lat0) * ky });
  const fran = (p: P): LatLon => ({ lat: lat0 + p.y / ky, lon: lon0 + p.x / kx });
  const g = grans.map(till);
  const v = vag.map((l) => l.map(till));
  let basta: { pt: P; d: number } | null = null;
  const prova = (pt: P, d: number) => { if (!basta || d < basta.d) basta = { pt, d }; };
  for (const linje of v) {
    // gränsens hörn → vägens kanter (en enpunktsväg räknas som en punkt)
    for (const gp of g) {
      if (linje.length === 1) prova(linje[0], Math.hypot(linje[0].x - gp.x, linje[0].y - gp.y));
      for (let i = 0; i + 1 < linje.length; i++) { const r = paSegment(gp, linje[i], linje[i + 1]); prova(r.pt, r.d); }
    }
    // vägens hörn → gränsens kanter (och hörn, om gränsen bara är en punkt)
    for (const vp of linje) {
      if (g.length === 1) prova(vp, Math.hypot(vp.x - g[0].x, vp.y - g[0].y));
      for (let i = 0; i + 1 < g.length; i++) { const r = paSegment(vp, g[i], g[i + 1]); prova(vp, r.d); }
    }
  }
  const res = basta as { pt: P; d: number } | null;
  return res ? fran(res.pt) : null;
}

// ── Vyn: band och symboler, ETT per väg ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface VagBandFeature {
  type: 'Feature';
  properties: { nyckel: string; markerId: string; risk: VagRisk };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}
export interface VagSymbol { nyckel: string; agare: string; pos: LatLon; risk: VagRisk }
export interface VagVy { band: VagBandFeature[]; symboler: VagSymbol[] }

/**
 * Ur de sammanslagna vägvarningarna (lib/tmaVagar: en väg en gång per objekt) och ägarens riskbedömning byggs det som ritas: ett band per vägsträcka (inget vid låg risk)
 * och EN symbol per väg. `grans(id)` ger ägarens traktgräns i lng/lat (null = okänd → symbolen hamnar på vägens närmaste träffpunkt ur vägkontrollen).
 */
export function byggVagVy(vagar: Vagvarning[], risk: Record<string, TmaRiskSvar>, grans: (agareId: string) => LatLon[] | null): VagVy {
  const band: VagBandFeature[] = [];
  const symboler: VagSymbol[] = [];
  for (const v of vagar) {
    const lage = vagRisk(risk[v.agare]);
    if (VAG_UTSEENDE[lage].band) {
      v.linjer.forEach((linje) => {
        if (linje.length < 2) return;
        band.push({ type: 'Feature', properties: { nyckel: v.nyckel, markerId: v.agare, risk: lage }, geometry: { type: 'LineString', coordinates: linje.map((p) => [p.lon, p.lat] as [number, number]) } });
      });
    }
    const g = grans(v.agare);
    const pos = (g && g.length > 0 ? narmastaPunktPaVag(v.linjer, g) : null) ?? v.narmaste ?? v.punkter[0] ?? null;
    if (pos) symboler.push({ nyckel: v.nyckel, agare: v.agare, pos, risk: lage });
  }
  return { band, symboler };
}

// ── Symbolen: en tryckyta på minst 44 px runt en ⚠ (stor) eller ✓ (liten) ─────────────────────────────────────────────────────────────────────

/**
 * DOM-elementet för en ⚠/✓ (MapLibre-markör, förankrad mitt på). Tryckytan är minst 44 px även när själva symbolen (✓) är liten; symbolen är barnet och tar inga tryck själv.
 * Färgen bär aldrig ensam: tecknet (⚠ eller ✓) och aria-label/title säger samma sak. `onTryck` får vägens ägare (den traktdel vars riskbedömning panelen öppnar).
 */
export function byggVagSymbolElement(sym: Pick<VagSymbol, 'risk' | 'agare'>, onTryck: (agare: string) => void): HTMLButtonElement {
  const u = VAG_UTSEENDE[sym.risk];
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('data-testid', 'vag-symbol');
  el.setAttribute('data-risk', sym.risk);
  el.setAttribute('data-agare', sym.agare);
  el.setAttribute('aria-label', u.text);
  el.title = u.text;
  el.style.cssText = `width:${VAG_TRYCKYTA_PX}px;height:${VAG_TRYCKYTA_PX}px;padding:0;border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;`;
  const ikon = document.createElement('span');
  ikon.textContent = u.tecken;
  ikon.style.cssText = `width:${u.storlek}px;height:${u.storlek}px;border-radius:${u.tecken === '✓' ? '50%' : '8px'};background:${u.farg};border:2px solid rgba(0,0,0,0.4);box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;box-sizing:border-box;font-size:${u.tecken === '✓' ? 15 : 20}px;line-height:1;font-weight:700;color:${sym.risk === 'hog' ? FARG.text : FARG.bg};pointer-events:none;`;
  el.appendChild(ikon);
  el.addEventListener('click', (e) => { e.stopPropagation(); onTryck(sym.agare); });
  return el;
}
