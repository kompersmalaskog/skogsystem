// AREAL UR GEOMETRIN för Vidas ytor som saknar den (Martin 2026-11-23, Brokamåla). Hänsynsytorna och traktdelarna bär SHAPE.STAr (m²), men fornlämningsytor (L_RAA_POLY_101) och
// nyckelbiotoper (SV_SKS_NYCKELBIOTOP_101) gör det inte. `valjMinstaYta` räknar en yta utan areal som "punkt eller linje" och låter den vinna över ALLT — så en fornlämningsyta på 1 ha
// slog en hänsynsyta på 0,999 ha. Egenskapen `_arealM2` sätts när geometrin läses in; `traktArealHa` (lib/traktGeometri) läser den sist, efter Vidas egna fält.

type Pos = number[];

const ringM2 = (ring: Pos[], lat0: number): number => {
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 111320;
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  return Math.abs(s) / 2;
};

/** Ytan (m²) för en Polygon eller MultiPolygon: ytterring minus hål. null för allt annat eller en tom geometri. */
export function geometriM2(g: { type?: string; coordinates?: any } | null | undefined): number | null {
  if (!g?.coordinates) return null;
  const polygoner: Pos[][][] | null = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polygoner) return null;
  let tot = 0;
  for (const p of polygoner) {
    if (!Array.isArray(p) || !p[0]?.length) continue;
    const lat0 = p[0].reduce((a, q) => a + q[1], 0) / p[0].length;
    tot += ringM2(p[0], lat0) - p.slice(1).reduce((a, h) => a + ringM2(h, lat0), 0);
  }
  return tot > 0 ? tot : null;
}

/** Sätter `_arealM2` på varje yta som saknar areal i Vidas egna fält. Rör inget annat; en feature med areal lämnas som den är. */
export function medAreal<T extends { features?: any[] }>(fc: T): T {
  if (!fc || !Array.isArray(fc.features)) return fc;
  const features = fc.features.map((f) => {
    const p = f?.properties;
    if (!p || p._arealM2 != null) return f;
    const harEgen = [p['AREA_HA'], p['SHAPE.STAr'], p['SHAPE_STAr'], p['Shape_Area']].some((v) => Number.isFinite(parseFloat(String(v ?? '').replace(',', '.'))) && parseFloat(String(v).replace(',', '.')) > 0);
    if (harEgen) return f;
    const a = geometriM2(f.geometry);
    return a == null ? f : { ...f, properties: { ...p, _arealM2: a } };
  });
  return { ...fc, features };
}
