// KÖRSPÅREN SOM SVAR (Martin 2026-11-04): spåren finns för att visa HUR SKÖRDAREN KÖRDE och ATT SKOTAREN HAR VARIT DÄR.
// Skotaren får därför ingen egen linje i en egen färg längre (turkos krockade med vatten, diken och blött — blått betyder vatten).
//   • Skördarens stråk ritas alltid lila och tydligt — det är vägnätet, också för GROT-skotaren och markberedaren.
//   • Där skotaren på jobbet har kört får stråket en VIT MITTLINJE (lib/sparStil MITTLINJE_*), som mittlinjen på en väg.
//   • Grått användes först och försvann mot flygfotot (Martin 2026-11-04) — klart blir alltså INTE grått här.
// Ett stråk räknas som kört när skotaren varit inom KLART_RADIE_M. Prövat på Mölleryds riktiga spår (2026-11-04): 6–12 m gav 90–99 % körda stråk —
// talet hänger inte på exakt gräns. Bara ritningen: sparad data och allt som räknas rörs inte. Ren och testbar.

export type Koord = [number, number];   // [lng, lat]
export type LinjeFeature = { type: 'Feature'; geometry: { type: 'LineString'; coordinates: Koord[] }; properties: Record<string, unknown> };

/** Skotaren räknas ha kört ett stråk när den varit så här nära (meter). */
export const KLART_RADIE_M = 8;
/** Skördarens stråk delas i bitar om högst så här många meter (bitarna avgör var grått börjar och slutar). */
export const STRAK_STEG_M = 4;
/** Skotarens spår provas var så här många meter. */
export const SKOTAR_STEG_M = 2;
// Linjerna in hit är redan delade vid tidsglapp (hyttsparRitadeLinjer) och RDP-gallrade — en rak sträcka kan vara långt mellan två punkter,
// så varje sträcka fylls i hela vägen. Ett glapp är redan två linjer.

const M_PER_GRAD = 111_320;

type Proj = { xy: (p: Koord) => [number, number] };
function projektion(alla: Koord[]): Proj {
  let s = 0, n = 0;
  for (const p of alla) if (Number.isFinite(p?.[1])) { s += p[1]; n++; }
  const lat0 = n ? s / n : 0;
  const kx = M_PER_GRAD * Math.cos((lat0 * Math.PI) / 180);
  return { xy: ([lng, lat]) => [lng * kx, lat * M_PER_GRAD] };
}

const giltig = (p: unknown): p is Koord => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Punkter längs linjerna med högst `steg` meters mellanrum. */
function fortata(linjer: Koord[][], proj: Proj, steg: number): [number, number][] {
  const ut: [number, number][] = [];
  for (const l of linjer) {
    const pts = (l ?? []).filter(giltig).map(proj.xy);
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) { ut.push(pts[0]); continue; }
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const d = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.ceil(d / steg));
      for (let k = 1; k <= n; k++) ut.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
  }
  return ut;
}

type Index = { cell: number; m: Map<string, [number, number][]> };
function index(pts: [number, number][], cell: number): Index {
  const m = new Map<string, [number, number][]>();
  for (const p of pts) {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    const a = m.get(k);
    if (a) a.push(p); else m.set(k, [p]);
  }
  return { cell, m };
}
function nara(ix: Index, p: [number, number], r: number): boolean {
  const cx = Math.floor(p[0] / ix.cell), cy = Math.floor(p[1] / ix.cell), n = Math.ceil(r / ix.cell);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const a = ix.m.get(`${cx + i},${cy + j}`);
    if (a) for (const q of a) if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= r) return true;
  }
  return false;
}

/**
 * Skördarens stråk delade i bitar med `klar: true` där skotaren varit inom `radie` meter och `klar: false` annars.
 * Övriga egenskaper (t.ex. `alder`) följer med. Utan skotarspår kommer stråken tillbaka oförändrade med `klar: false`.
 */
export function delaKlart(skordare: LinjeFeature[], skotarLinjer: Koord[][], radie = KLART_RADIE_M): LinjeFeature[] {
  const linjer = (skordare ?? []).filter((f) => f?.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates));
  const alla = [...linjer.flatMap((f) => f.geometry.coordinates), ...(skotarLinjer ?? []).flat()];
  if (alla.length === 0) return [];
  const proj = projektion(alla);
  const skot = fortata(skotarLinjer ?? [], proj, SKOTAR_STEG_M);
  if (skot.length === 0) return linjer.map((f) => ({ ...f, properties: { ...f.properties, klar: false } }));
  const ix = index(skot, Math.max(radie, 1));
  const ut: LinjeFeature[] = [];
  for (const f of linjer) {
    const ll = f.geometry.coordinates.filter(giltig);
    if (ll.length < 2) continue;
    // Förtäta i lng/lat parallellt med xy så att bitarna ritas exakt längs originalets form.
    const llT: Koord[] = [ll[0]], xyT: [number, number][] = [proj.xy(ll[0])];
    for (let i = 1; i < ll.length; i++) {
      const a = proj.xy(ll[i - 1]), b = proj.xy(ll[i]);
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STRAK_STEG_M));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        llT.push([ll[i - 1][0] + (ll[i][0] - ll[i - 1][0]) * t, ll[i - 1][1] + (ll[i][1] - ll[i - 1][1]) * t]);
        xyT.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    let bit: Koord[] = [llT[0]], klar: boolean | null = null;
    for (let i = 1; i < llT.length; i++) {
      const mitt: [number, number] = [(xyT[i][0] + xyT[i - 1][0]) / 2, (xyT[i][1] + xyT[i - 1][1]) / 2];
      const k = nara(ix, mitt, radie);
      if (klar !== null && k !== klar) {
        ut.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: bit }, properties: { ...f.properties, klar } });
        bit = [llT[i - 1]];
      }
      klar = k;
      bit.push(llT[i]);
    }
    if (bit.length >= 2) ut.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: bit }, properties: { ...f.properties, klar: !!klar } });
  }
  return ut;
}

/** Linjerna ur en samling features (för att räkna mot dem). */
export const linjerUr = (fs: LinjeFeature[] | null | undefined): Koord[][] =>
  (fs ?? []).filter((f) => f?.geometry?.type === 'LineString').map((f) => f.geometry.coordinates);
