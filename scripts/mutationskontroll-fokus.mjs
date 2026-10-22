// Mutationskontroll för "Fokus på trakten" (Martin 2026-10-22): Vidas, RAÄ:s och Skogsstyrelsens ytor/linjer/punkter längre än 50 m från traktgränsen ritas svagt och utan etikett.
// Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-fokus.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const NARA = "lib/traktNara.ts";
const FOKUS = "lib/fokusTrakt.ts";
const SIDA = "app/planering/page.tsx";

const TESTER = [
  "lib/traktNara.test.ts",
  "lib/fokusTrakt.test.ts",
  "lib/fokusTrakt.vakter.test.ts",
];

const M = [
  // ── måttet: avståndet till trakten (lib/traktNara) ──
  ["50 m är 100 m", "export const NARA_TRAKT_M = 50;", "export const NARA_TRAKT_M = 100;", NARA],
  ["en vertex inne i trakten räknas inte som inne", "for (const p of alla) if (m.polygoner.some((poly) => punktIPoly(p, poly))) return 0;", "", NARA],
  ["en yta som omsluter trakten räknas som utanför", "for (const poly of m.polygoner) for (const hj of poly[0] ?? []) if (ytor.some((y) => punktIPoly(hj, y))) return 0;", "", NARA],
  ["kanter som korsar varandra räknas som avstånd", "if (segmentSkar(a, b, c, d)) return 0;", "", NARA],
  ["ett hål i trakten räknas som trakt", "!poly.slice(1).some((h) => punktIRing(p, h))", "true", NARA],
  ["avståndet längre än taket returneras som tal (inte Infinity)", "return min <= tak ? min : Infinity;", "return min;", NARA],
  ["rutan runt geometrin mäts utan marginal", "if (!boxarNara(box, m.box, tak)) return Infinity;", "if (!boxarNara(box, m.box, 0)) return Infinity;", NARA],
  ["longituden räknas utan cos(latitud)", "const kx = M_PER_GRAD_LAT * Math.cos(lat0 * Math.PI / 180);", "const kx = M_PER_GRAD_LAT;", NARA],
  ["alla lager räknas som trakt", "if (f?.properties?._lager !== 'L_TRAKTDEL') continue;", "if (false) continue;", NARA],
  ["flera traktdelar (MultiPolygon) räknas inte", "if (g?.type === 'MultiPolygon') return g.coordinates;", "if (g?.type === 'MultiPolygon') return [];", NARA],
  ["kantparen sållas bort utan marginal", "if (!boxarNara(sb, k.box, Math.min(tak, min))) continue;", "if (!boxarNara(sb, k.box, 0)) continue;", NARA],

  // ── regeln: vem som blir svag (lib/fokusTrakt) ──
  ["utanför är en halv i stället för en tredjedel", "export const FOKUS_UTE_ANDEL = 1 / 3;", "export const FOKUS_UTE_ANDEL = 1 / 2;", FOKUS],
  ["traktgränsen själv får fokus", "if (!props || props._lager === 'L_TRAKTDEL') return false;", "if (!props) return false;", FOKUS],
  // Undantagen (Martin 2026-10-22): fara och vägar blir ALDRIG svaga
  ["KRAFTLEDNING >50 m blir svag (faran undantas inte)", "if (arFara(props, geometry) || arVag(props, geometry)) return false;", "if (arVag(props, geometry)) return false;", FOKUS],
  ["BASVÄG >50 m blir svag (vägen undantas inte)", "if (arFara(props, geometry) || arVag(props, geometry)) return false;", "if (arFara(props, geometry)) return false;", FOKUS],
  ["fara känns inte igen (larmens Fara-grupp ignoreras)", "return slag != null && VIDA[slag].grupp === 'fara';", "return false;", FOKUS],
  ["alla Vida-linjer räknas som fara (vägar blir aldrig vägar)", "props?._typ === 'linje' && !arFara(props, geometry)", "false", FOKUS],
  ["en yta med ordet kraftledning räknas som fara", "return slag != null && VIDA[slag].grupp === 'fara';", "return /kraftled/i.test(String(props?.FLBESKR ?? ''));", FOKUS],
  ["fastighet och skogsbruksplan (ritas inte) får fokus", "return klassaTraktFeature(props).kategori !== 'ignorera';", "return true;", FOKUS],
  ["utan traktgräns blir allt svagt", "if (!modell) return fc;", "if (!modell) return { ...fc, features: (fc.features ?? []).map((f: any) => ({ ...f, properties: { ...f.properties, [FOKUS_EGENSKAP]: 'ute' } })) };", FOKUS],
  ["bara det som rör trakten (0 m) är inne — inte 50 m", "avstandTillTrakt(f.geometry, modell, FOKUS_NARA_M) <= FOKUS_NARA_M ? 'inne' : 'ute'", "avstandTillTrakt(f.geometry, modell, FOKUS_NARA_M) === 0 ? 'inne' : 'ute'", FOKUS],
  ["snedstreckningen finns kvar utanför trakten", "['case', FOKUS_UTE_UTTRYCK, 0, 1]", "['case', FOKUS_UTE_UTTRYCK, 1, 1]", FOKUS],
  ["etiketterna sätts bara UTANFÖR trakten", "['!=', ['get', FOKUS_EGENSKAP], 'ute']", "['!=', ['get', FOKUS_EGENSKAP], 'inne']", FOKUS],
  ["styrkan är full även utanför trakten", "['case', FOKUS_UTE_UTTRYCK, +(full * FOKUS_UTE_ANDEL).toFixed(4), full]", "['case', FOKUS_UTE_UTTRYCK, full, full]", FOKUS],
  ["uttrycket pekar ut det som ligger INNE", "export const FOKUS_UTE_UTTRYCK = ['==', ['get', FOKUS_EGENSKAP], 'ute'] as const;", "export const FOKUS_UTE_UTTRYCK = ['==', ['get', FOKUS_EGENSKAP], 'inne'] as const;", FOKUS],

  // ── sidan: varje lager läser fokus, geometrin märks en gång ──
  ["hänsynsetiketterna filtreras inte", "filter: fokusEtikettFilter(HANSYNSYTA_FILTER as any) as any,", "filter: HANSYNSYTA_FILTER as any,", SIDA],
  ["nyckelbiotopens snedstreck släcks inte utanför", "filter: ['==', ['get', '_lager'], 'SV_SKS_NYCKELBIOTOP_101'], paint: { 'fill-pattern': snedstreckId('natur'), 'fill-opacity': FOKUS_HATCH_OPACITET as any }", "filter: ['==', ['get', '_lager'], 'SV_SKS_NYCKELBIOTOP_101'], paint: { 'fill-pattern': snedstreckId('natur') }", SIDA],
  ["kraftledningens lager får fokusstyrka (blir svag)", "['in', 'kraftled', FLB]], false)) map.addLayer(l);", "['in', 'kraftled', FLB]], false)) map.addLayer({ ...l, paint: { ...l.paint, 'line-opacity': fokusOpacitet(1) } });", SIDA],
  ["hänsynsfyllningen sätts om utan fokus vid körvy/planering", "fokusOpacitet(korvyActive ? KORVY_HANSYN_FYLLNING : PLAN_HANSYN_FYLLNING) as any", "(korvyActive ? KORVY_HANSYN_FYLLNING : PLAN_HANSYN_FYLLNING) as any", SIDA],
  ["geometrin märks aldrig (medFokus körs inte)", "      fc = medFokus(fc);\n", "", SIDA],
  ["basvägen får fokusstyrka (blir svag)", "// Fokus på trakten: fornlämningspunkten (raden ovan lämnas orörd)", "map.setPaintProperty('trakt-basvag-line', 'line-opacity', fokusOpacitet(1) as any);\n    // Fokus på trakten: fornlämningspunkten (raden ovan lämnas orörd)", SIDA],
  ["fornlämningspunktens fyllning blir inte svag", "map.setPaintProperty('trakt-raa-point', 'circle-opacity', fokusOpacitet(1) as any);", "", SIDA],
  ["fornlämningspunktens kant blir inte svag", "map.setPaintProperty('trakt-raa-point', 'circle-stroke-opacity', fokusOpacitet(1) as any);", "", SIDA],
  ["träffytan för linjer görs svag (ett tryck på en svag linje träffar inte)", "id: 'trakt-linje-hit', type: 'line', source: 'trakt-geo-source', filter: ['==', ['get', '_typ'], 'linje'], paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': LINJE_TRAFF_PX }", "id: 'trakt-linje-hit', type: 'line', source: 'trakt-geo-source', filter: ['==', ['get', '_typ'], 'linje'], paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': LINJE_TRAFF_PX, 'line-opacity': fokusOpacitet(1) as any }", SIDA],
];

kor({
  filer: [NARA, FOKUS, SIDA],
  tester: TESTER,
  standardFil: NARA,
  mutationer: M,
});
