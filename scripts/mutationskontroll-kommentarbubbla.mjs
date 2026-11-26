// Mutationskontroll för pratbubblorna och raderingsfrågan (Martin 2026-11-26): varje bubbla öppnar sin egen markering, Viktigt = orange bubbla, fråga före radering av något med kommentar.
// Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-kommentarbubbla.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const TECKEN = "lib/kommentarTecken.ts";
const KLICK = "lib/klickPrioritet.ts";
const MODELL = "lib/kartkommentar.ts";
const FRAGA = "components/planering/RaderaKommentarFraga.tsx";
const SIDA = "app/planering/page.tsx";

const TESTER = [
  "lib/kommentarTecken.test.ts",
  "lib/kartkommentar.radera.test.ts",
  "components/planering/RaderaKommentarFraga.render.test.tsx",
];

const M = [
  // ── träffytan ──
  ["träffytan på bubblan är för liten", "export const TECKEN_TRAFF_PX = 24;", "export const TECKEN_TRAFF_PX = 8;", TECKEN],
  ["träffytan över ytans namn ligger inte där bubblan är", "'circle-translate': [0, ovan ? -TECKEN_OVAN_LYFT_PX : 0]", "'circle-translate': [0, 0]", TECKEN],
  ["symbolens träffyta växer inte med kommentaren", "export const TRAFF_RADIE_MED_KOMMENTAR_PX = 44;", "export const TRAFF_RADIE_MED_KOMMENTAR_PX = 22;", TECKEN],
  ["bubblan är ingen egen klickkategori", "  { kategori: 'kommentar', lager: ['markers-kommentar-traff', 'markers-kommentar-traff-ovan'] },\n", "", KLICK],
  ["bubblan ligger under symbolen i prioriteten", "  { kategori: 'larm',   lager: ['larm-pin-hit'] },\n  { kategori: 'kommentar', lager: ['markers-kommentar-traff', 'markers-kommentar-traff-ovan'] },\n", "  { kategori: 'larm',   lager: ['larm-pin-hit'] },\n", KLICK],
  ["sidan avstår inte när bubblan inte vann", "if (vinnandeKategoriForKarta(map, e.point) !== 'kommentar') return;", "", SIDA],
  ["sidan lägger inte till träffytorna", "for (const l of teckenTraffLager()) if (!map.getLayer(l.id)) map.addLayer(l);", "", SIDA],
  ["bubblan öppnar inte ett eget område", "if (m) oppnaGranskort(m);\n      return;\n    }\n    oppnaVidaMalRef", "return;\n    }\n    oppnaVidaMalRef", SIDA],
  ["bubblan på en Vida-yta öppnar ingenting", "oppnaVidaMalRef.current?.(nyckel, traktGeo?.features ?? []);", "", SIDA],
  ["bubblan på en traktdel öppnar ingenting", "if (nyckel.startsWith('traktdel:')) { oppnaTraktdelKort(nyckel.slice('traktdel:'.length)); return true; }", "", SIDA],

  // ── bubblorna sitter på rätt nyckel ──
  ["traktdelens bubbla använder Vidas TRDEL-id i stället för delytans nyckel", "const nyckel = `traktdel:${d.partKey}`;", "const nyckel = `traktdel:${d.partKey.split(':')[0]}`;", TECKEN],
  ["eget område får inte sin bubbla (nyckeln omrade:)", "const nyckel = e.nyckel ?? `marker:${e.id}`;", "const nyckel = `marker:${e.id}`;", TECKEN],
  ["sidan skickar inte områdets nyckel", "nyckel: m.isLine && m.lineType === 'boundary' ? `omrade:${m.id}` : undefined,", "nyckel: undefined,", SIDA],
  ["sidan skickar inte delytorna", "traktdelar: traktdelDelar.filter(", "traktdelar_: traktdelDelar.filter(", SIDA],

  // ── frågan före radering ──
  ["markeringar med kommentar raderas utan fråga", "if (rader.length === 0) { utfor(); return; }", "{ utfor(); return; }", SIDA],
  ["markörkortets Ta bort går förbi frågan", "const deleteMarker = (id: string | number) => medKommentarFraga((markers as any[]).find((m: any) => m.id === id) ?? { id }, () => raderaMarkering(id));", "const deleteMarker = (id: string | number) => raderaMarkering(id);", SIDA],
  ["egna områden frågar på fel nyckel", "marker.lineType === 'boundary' ? `omrade:${id}` : markerNyckel(id)", "markerNyckel(id)", SIDA],
  ["en kommentar med bara Viktigt räknas inte", ".filter((r) => r.text.trim() !== '' || !!r.viktigt)", ".filter((r) => r.text.trim() !== '')", MODELL],
  ["den äldre kommentaren räknas inte", "kortKommentarer({ rader: i.rader, nyckel: i.nyckel, objektId: i.objektId, aldreText: i.aldreText,", "kortKommentarer({ rader: i.rader, nyckel: i.nyckel, objektId: i.objektId, aldreText: null,", MODELL],
  ["Avbryt är inte förvalt", "<button type=\"button\" autoFocus data-testid=\"radera-kommentar-avbryt\"", "<button type=\"button\" data-testid=\"radera-kommentar-avbryt\"", FRAGA],
  ["Avbryt är inte primär", "onClick={onAvbryt} style={KNAPP.primar}>Avbryt", "onClick={onAvbryt} style={KNAPP.sekundar}>Avbryt", FRAGA],
  ["Radera är inte röd", "onClick={onRadera} style={KNAPP.destruktiv}", "onClick={onRadera} style={KNAPP.lank}", FRAGA],
  ["frågan visar inte kommentarens text", "<KommentarVisning key={r.id} text={r.text} viktigt={r.viktigt} forfattare={r.forfattare} />", "<span key={r.id} />", FRAGA],
  ["Radera ändå raderar inte", "onClick={onRadera} style={KNAPP.destruktiv}", "onClick={onAvbryt} style={KNAPP.destruktiv}", FRAGA],
];

kor({
  filer: [TECKEN, KLICK, MODELL, FRAGA, SIDA],
  tester: TESTER,
  standardFil: TECKEN,
  mutationer: M,
});
