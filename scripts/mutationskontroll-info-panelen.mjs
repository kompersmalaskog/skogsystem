// Mutationskontroll för "ⓘ-panelen tydlig" (Martin 2026-10-22): Vidas direktiv högst upp och helt, numrerade vid meningsslut (bara Vidas), instruktion nr 1 med Sett,
// EN kommentarkomponent överallt, Mer som rad, larmplatsens kontrollstatus bara i planeringsläget, panelbredd 420 i maskinläget — varje regel ska bli RÖD när EN sak ändras tillbaka.
// Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-info-panelen.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const PUNKT = "lib/kommentarPunkter.ts";
const RUTA = "components/planering/KommentarRuta.tsx";
const KORT = "components/planering/ObjektKort.tsx";
const INFO = "components/planering/ObjektInfo.tsx";
const OM = "components/planering/OmTrakten.tsx";
const INST = "components/planering/InstruktionKort.tsx";
const LOGIK = "lib/instruktioner/instruktioner.ts";
const OKORT = "lib/objektKort.ts";
const PLUS = "lib/plusArk.ts";
const SIDA = "app/planering/page.tsx";

const TESTER = [
  "lib/kommentarPunkter.test.ts",
  "lib/instruktioner/instruktioner.test.ts",
  "lib/instruktioner/instruktioner.vakter.test.ts",
  "lib/objektKort.test.ts",
  "lib/infoPanel.vakter.test.ts",
  "components/planering/ObjektInfo.test.tsx",
  "components/planering/KommentarRuta.render.test.tsx",
  "components/planering/InstruktionKort.render.test.tsx",
];

const M = [
  // ── Vidas direktiv delas vid meningsslut (och bara det) ──
  ["direktivet delas inte i meningar", ".split(/(?<=[.!?])\\s+(?=[A-ZÅÄÖ])/)", ".split(/(?<=\\u0000)\\s+(?=\\u0000)/)", PUNKT],
  ["delar vid punkt + mellanslag utan krav på versal (\"ca 50-70 tallar per ha . Lämna\" och \"t.ex. ekar\")", "(?<=[.!?])\\s+(?=[A-ZÅÄÖ])", "(?<=[.!?])\\s+", PUNKT],
  ["delar mitt i en mening vid vilket mellanslag som helst", "(?<=[.!?])\\s+(?=[A-ZÅÄÖ])", "\\s+(?=[A-ZÅÄÖ])", PUNKT],
  ["radbrytningar i direktivet ignoreras", "return kommentarPunkter(text).flatMap((rad) =>", "return [String(text ?? '').trim()].filter(Boolean).flatMap((rad) =>", PUNKT],
  ["egna kommentarer delas också vid meningsslut", "const punkter = meningar ? vidaMeningar(text) : kommentarPunkter(text);", "const punkter = vidaMeningar(text);", RUTA],
  ["Vidas direktiv delas inte i punkter", "const punkter = meningar ? vidaMeningar(text) : kommentarPunkter(text);", "const punkter = kommentarPunkter(text);", RUTA],
  ["en enda punkt numreras", "export const arNumrerad = (punkter: readonly string[]): boolean => punkter.length >= 2;", "export const arNumrerad = (punkter: readonly string[]): boolean => punkter.length >= 1;", PUNKT],

  // ── EN ruta: samma stil överallt ──
  ["texten är inte 19 px i rutan", "const text19: React.CSSProperties = { ...TYP.kommentar,", "const text19: React.CSSProperties = { ...TYP.meta,", RUTA],
  ["rutan är inte ljusare än kortet", "background: FARG.upphojt, borderRadius: RADIE.kort, padding:", "background: FARG.kort, borderRadius: RADIE.kort, padding:", RUTA],
  ["Vidas etikett är inte blå", "kallaFarg={vida ? FARG.bla : FARG.text2}", "kallaFarg={FARG.text2}", RUTA],
  ["Vidas etikett säger inte traktdirektiv", "kalla={vida ? 'Vida · traktdirektiv'", "kalla={vida ? 'Vida'", RUTA],
  ["instruktionskortet har en egen kopia i stället för rutan", "<KommentarVisning vida={i.kalla === 'vida'}", "<div data-testid=\"kopia\">{i.kalla === 'vida'}", INST],
  ["Om trakten klipper kommentaren", "<KommentarVisning key={k.id} vida={k.vida} forfattare={k.forfattare} vantar={k.vantar} text={k.text} meningar={false} />", "<div key={k.id} style={{ WebkitLineClamp: 2, overflow: 'hidden', maxHeight: 40 }}>{k.text}</div>", OM],

  // ── Till föraren: högst upp, helt, ingen Läs allt ──
  ["Vidas direktiv i ⓘ-kortet delas inte i punkter", "<KommentarVisning vida={vida} etikett={t.avsandare} text={t.text} meningar={vida} />", "<KommentarVisning vida={vida} etikett={t.avsandare} text={t.text} meningar={false} />", KORT],
  ["Till föraren ligger efter knapprad och uppdrag", "{p.tillForaren.length > 0 && (", "{false && p.tillForaren.length > 0 && (", KORT],
  ["direktivet \"Sett\" finns inte i kortet", "{vida && p.direktivSett && !p.direktivSett.sedd && (", "{false && (", KORT],
  ["Sett visas även när direktivet setts", "p.direktivSett && !p.direktivSett.sedd && (", "p.direktivSett && (", KORT],

  // ── direktivet är instruktion nr 1 ──
  ["direktivet ingår inte som instruktion", "if (direktiv) {", "if (false && direktiv) {", LOGIK],
  ["direktivet delas inte i meningar i instruktionslistan", "hash: hashText(direktiv), kalla: 'vida', forfattare: null, vantar: false, meningar: true }", "hash: hashText(direktiv), kalla: 'vida', forfattare: null, vantar: false }", LOGIK],
  ["direktivet ger ett kort vid inkörning (objektnivå)", "if (o.objektniva) continue;", "", LOGIK],
  ["direktivet har ingen hash (ändrad text är sedd)", "hash: hashText(direktiv)", "hash: ''", LOGIK],
  ["direktivet sorteras inte först i listan", "Number(b.o.nyckel === DIREKTIV_NYCKEL) - Number(a.o.nyckel === DIREKTIV_NYCKEL) || ", "", LOGIK],

  // ── Mer som rad, inte knapp ──
  ["Mer är tillbaka som knapp i knappraden", "export type KortKnappId = 'kor-hit' | 'korvy' | 'skotning' | 'utkort';", "export type KortKnappId = 'kor-hit' | 'korvy' | 'skotning' | 'utkort' | 'mer';", OKORT],
  ["Mer-raden saknar förklaring", "under=\"Fler val och inställningar\"", "", KORT],
  ["Mer-raden öppnar inte Mer-vyn", "onMer={() => setVy('mer')}", "onMer={() => {}}", INFO],

  // ── På trakten ser inte avstängd ut ──
  ["På trakten får en grå prefixtext", "etikett={`På trakten · ${p.paTrakten}`}", "etikett={`${p.paTrakten}`}", KORT],

  // ── Larmplatsens kontrollstatus bara i planeringsläget ──
  ["kontrollstatusen visas alltid", "{larm.visaKontroll && <span data-testid=\"kort-larm-status\"", "{true && <span data-testid=\"kort-larm-status\"", KORT],
  ["kontrollstatusen visas för föraren i maskinläget", "visaKontroll: kortRoll === 'planerare' && !maskinlage && !maskinSomParam,", "visaKontroll: kortRoll === 'planerare',", SIDA],

  // ── Panelens bredd ──
  ["maskinlägets panel är 380 px", "export const INFO_PANEL_MASKIN_BREDD_PX = 420;", "export const INFO_PANEL_MASKIN_BREDD_PX = 380;", PLUS],
  ["sidan ger aldrig den bredare panelen", "const infoPanelBredd = (maskinlage || !!maskinSomParam) ? INFO_PANEL_MASKIN_BREDD_PX : PANEL_BREDD_PX;", "const infoPanelBredd = PANEL_BREDD_PX;", SIDA],
];

kor({
  filer: [PUNKT, RUTA, KORT, INFO, OM, INST, LOGIK, OKORT, PLUS, SIDA],
  tester: TESTER,
  standardFil: PUNKT,
  mutationer: M,
});
