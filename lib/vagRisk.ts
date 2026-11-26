// Vägvarningen efter riskbedömning (Martin 2026-11-25, lugnare 2026-11-26): VÄGEN markeras — inte traktgränsen — och färgen säger hur långt riskbedömningen kommit.
//
//   Ej riskbedömd      → orange band över vägen + orange ⚠
//   Bedömd, låg risk   → INGENTING på kartan. Raden "Väg 538 · låg risk ✓" i objektinfon (ⓘ) nås bedömningen från.
//   Bedömd, hög risk   → rött band + röd ⚠        ("Förhöjd" i panelen räknas hit: all risk över låg är hög här — hellre ett rött band för mycket än ett för lite)
//
// ⚠ ligger PÅ vägen (bandet), UTANFÖR traktgränsen, i den punkt som ligger närmast gränsen — där vägen når avverkningen — aldrig innanför den, och aldrig ovanpå en annan symbol:
// är platsen upptagen flyttas ⚠ längs vägen till närmaste fria punkt. Har vägen ingen del utanför gränsen gäller närmaste fria punkt på vägen. Den röda pulserande markeringen på gränsen finns inte längre.
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
  /** ⚠ på kartan: bara när något återstår att göra eller något är farligt. Låg risk är tyst på kartan. */
  symbol: boolean;
  /** Statusen i ordet på raden i objektinfon (färg bär aldrig ensam). */
  rad: string;
  farg: string;
  tecken: '⚠' | '✓';
  /** Hela symbolens synliga storlek i px. */
  storlek: number;
  /** Ordet som bär betydelsen (färg bär aldrig ensam): aria-label/title. */
  text: string;
}

export const VAG_UTSEENDE: Record<VagRisk, VagUtseende> = {
  obedomd: { band: true, symbol: true, rad: 'ej riskbedömd', farg: FARG.orange, tecken: '⚠', storlek: 36, text: 'Väg nära avverkning – ej riskbedömd' },
  lag: { band: false, symbol: false, rad: 'låg risk ✓', farg: FARG.gron, tecken: '✓', storlek: 24, text: 'Väg nära avverkning – låg risk' },
  hog: { band: true, symbol: true, rad: 'hög risk', farg: FARG.rod, tecken: '⚠', storlek: 36, text: 'Väg nära avverkning – hög risk' },
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

// ── Geometri: var ⚠ ligger ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface P { x: number; y: number }

/** Närmaste punkt på segmentet a–b till p, och avståndet dit. */
function paSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}
function punktIRing(p: P, ring: P[]): boolean {
  let inne = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i].y > p.y) !== (ring[j].y > p.y) && p.x < ((ring[j].x - ring[i].x) * (p.y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) inne = !inne;
  }
  return inne;
}

/** Minsta avstånd (m) mellan två symbolers mittpunkter för att de inte ska ligga ovanpå varandra (ca 40 px vid zoom 16,5 — där trakten öppnas). */
export const VAG_FRI_M = 40;
/** ⚠ ligger helst minst så här långt utanför traktgränsen (m) — en symbolradie (ca 17 m vid zoom 16,5) plus lite luft — så att den inte ritas över gränsen. */
export const VAG_UTANFOR_M = 20;
/** Tätheten (m) längs vägen som platserna prövas med. */
const PROV_M = 4;

export interface VagPlats {
  pos: LatLon;
  /** Platsen ligger utanför traktgränsen (false = vägen har ingen del utanför, eller gränsen är okänd). */
  utanfor: boolean;
  /** Ingen annan symbol inom VAG_FRI_M. false = ingen fri plats fanns på vägen; då är det den plats som ligger längst från de andra. */
  fri: boolean;
}

/**
 * Var ⚠ ska ligga: PÅ vägen (bandet), UTANFÖR traktgränsen, i den punkt som ligger närmast gränsen — där vägen når avverkningen — och inte ovanpå en annan symbol.
 * Platserna längs vägen prövas i ordning efter avstånd till gränsen; är den bästa upptagen flyttas ⚠ längs vägen till närmaste fria punkt. Aldrig innanför gränsen så länge vägen har
 * en del utanför den. Har vägen ingen del utanför (eller är gränsen okänd) gäller närmaste fria punkt på vägen — från `referens` (vägkontrollens närmaste punkt) när gränsen saknas.
 * `ringar` = ALLA traktens ytor (lng/lat), `hinder` = andra symbolers lägen. Meter i ett lokalt plan. Null när vägen saknar punkter.
 */
export function placeraVagSymbol(linjer: LatLon[][], ringar: LatLon[][], hinder: LatLon[], referens: LatLon | null = null): VagPlats | null {
  const vag = linjer.filter((l) => l.length >= 1);
  if (vag.length === 0) return null;
  const lat0 = vag[0][0].lat, lon0 = vag[0][0].lon;
  const kx = 111000 * Math.cos((lat0 * Math.PI) / 180), ky = 111000;
  const till = (q: LatLon): P => ({ x: (q.lon - lon0) * kx, y: (q.lat - lat0) * ky });
  const fran = (p: P): LatLon => ({ lat: lat0 + p.y / ky, lon: lon0 + p.x / kx });
  const poly = ringar.filter((r) => r.length >= 3).map((r) => r.map(till));
  const ref = referens ? till(referens) : null;
  const hind = hinder.map(till);

  // Platser längs hela vägen, tätt: hörnen och en punkt var PROV_M:e meter på varje sträcka.
  const plats: P[] = [];
  for (const l of vag) {
    const v = l.map(till);
    plats.push(v[0]);
    for (let i = 0; i + 1 < v.length; i++) {
      const n = Math.max(1, Math.ceil(Math.hypot(v[i + 1].x - v[i].x, v[i + 1].y - v[i].y) / PROV_M));
      for (let k = 1; k <= n; k++) plats.push({ x: v[i].x + ((v[i + 1].x - v[i].x) * k) / n, y: v[i].y + ((v[i + 1].y - v[i].y) * k) / n });
    }
  }
  const kand = plats.map((p) => {
    const inne = poly.some((r) => punktIRing(p, r));
    let d = Infinity;
    for (const r of poly) for (let i = 0; i < r.length; i++) d = Math.min(d, paSegment(p, r[i], r[(i + 1) % r.length]));
    if (!poly.length && ref) d = Math.hypot(p.x - ref.x, p.y - ref.y);
    let luft = Infinity;
    for (const h of hind) luft = Math.min(luft, Math.hypot(p.x - h.x, p.y - h.y));
    return { p, inne, d, luft };
  });
  // Utanför gränsen först; finns ingen del utanför gäller hela vägen. Helst en bit ut från gränsen (marginalen gäller bara när gränsen är känd).
  const ute = kand.filter((c) => !c.inne);
  const pool = ute.length ? (poly.length && ute.some((c) => c.d >= VAG_UTANFOR_M) ? ute.filter((c) => c.d >= VAG_UTANFOR_M) : ute) : kand;
  const iOrdning = pool.slice().sort((a, b) => a.d - b.d);
  const fri = iOrdning.find((c) => c.luft >= VAG_FRI_M);
  // Ingen fri plats: den som ligger längst från de andra symbolerna (lika → närmast gränsen).
  const val = fri ?? iOrdning.reduce((a, b) => (b.luft > a.luft ? b : a));
  return { pos: fran(val.p), utanfor: ute.length > 0 && !val.inne, fri: !!fri };
}

// ── Vyn: band och symboler, ETT per väg ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface VagBandFeature {
  type: 'Feature';
  properties: { nyckel: string; markerId: string; risk: VagRisk };
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}
/** ⚠ på kartan — bara ej bedömd eller hög risk (låg risk har ingen symbol). */
export interface VagSymbol { nyckel: string; agare: string; pos: LatLon; risk: 'obedomd' | 'hog' }
/** En rad per väg i objektinfon: "Väg 538 · låg risk ✓". Tryck öppnar riskbedömningen för vägens ägare. */
export interface VagRad { nyckel: string; agare: string; rubrik: string; risk: VagRisk; status: string; farg: string }
export interface VagVy { band: VagBandFeature[]; symboler: VagSymbol[]; rader: VagRad[] }

/** "Väg 538" (vägnummer), annars vägens namn, annars bara "Väg". */
export function vagRubrik(v: Pick<Vagvarning, 'ref' | 'namn'>): string {
  const ref = (v.ref || '').trim();
  if (ref) return `Väg ${ref}`;
  const namn = (v.namn || '').trim();
  return namn && namn.toLowerCase() !== 'namnlös väg' ? namn : 'Väg';
}
const SVARARE: Record<VagRisk, number> = { hog: 0, obedomd: 1, lag: 2 };

/**
 * Ur de sammanslagna vägvarningarna (lib/tmaVagar: en väg en gång per objekt) och ägarens riskbedömning byggs det som ritas: ett band per vägsträcka och EN ⚠ per väg — båda bara
 * när vägen inte är bedömd som låg risk — samt en rad per väg (alla tre lägen) till objektinfon. `ringar` = alla traktens ytor, `hinder` = andra symbolers lägen (⚠ undviker dem);
 * en ⚠ som redan placerats räknas som hinder för nästa väg.
 */
export function byggVagVy(vagar: Vagvarning[], risk: Record<string, TmaRiskSvar>, ringar: LatLon[][], hinder: LatLon[] = []): VagVy {
  const band: VagBandFeature[] = [];
  const symboler: VagSymbol[] = [];
  const rader: VagRad[] = [];
  const upptaget = hinder.slice();
  for (const v of vagar) {
    const lage = vagRisk(risk[v.agare]);
    const u = VAG_UTSEENDE[lage];
    rader.push({ nyckel: v.nyckel, agare: v.agare, rubrik: vagRubrik(v), risk: lage, status: u.rad, farg: u.farg });
    if (u.band) {
      v.linjer.forEach((linje) => {
        if (linje.length < 2) return;
        band.push({ type: 'Feature', properties: { nyckel: v.nyckel, markerId: v.agare, risk: lage }, geometry: { type: 'LineString', coordinates: linje.map((p) => [p.lon, p.lat] as [number, number]) } });
      });
    }
    if (!u.symbol) continue;
    const pos = placeraVagSymbol(v.linjer, ringar, upptaget, v.narmaste ?? null)?.pos ?? v.narmaste ?? v.punkter[0] ?? null;
    if (pos && lage !== 'lag') { symboler.push({ nyckel: v.nyckel, agare: v.agare, pos, risk: lage }); upptaget.push(pos); }
  }
  rader.sort((a, b) => SVARARE[a.risk] - SVARARE[b.risk] || a.rubrik.localeCompare(b.rubrik, 'sv') || a.nyckel.localeCompare(b.nyckel));
  return { band, symboler, rader };
}

// ── Symbolen: en tryckyta på minst 44 px runt en ⚠ ─────────────────────────────────────────────────────────────────────

/**
 * DOM-elementet för en ⚠ (MapLibre-markör, förankrad mitt på). Tryckytan är minst 44 px; symbolen är barnet och tar inga tryck själv.
 * Färgen bär aldrig ensam: tecknet (⚠) och aria-label/title säger samma sak. `onTryck` får vägens ägare (den traktdel vars riskbedömning panelen öppnar).
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
  ikon.style.cssText = `width:${u.storlek}px;height:${u.storlek}px;border-radius:8px;background:${u.farg};border:2px solid rgba(0,0,0,0.4);box-shadow:0 1px 4px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;box-sizing:border-box;font-size:20px;line-height:1;font-weight:700;color:${sym.risk === 'hog' ? FARG.text : FARG.bg};pointer-events:none;`;
  el.appendChild(ikon);
  el.addEventListener('click', (e) => { e.stopPropagation(); onTryck(sym.agare); });
  return el;
}
