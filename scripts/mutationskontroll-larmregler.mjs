// Mutationskontroll för "Larmregler: fara utan Sett + Övrigt är inte hänsyn" (Martin 2026-10-22): varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-larmregler.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const LARM = "lib/larm/larm.ts";
const YTATYP = "lib/vidaYtaTyp.ts";
const YTASTIL = "lib/ytaStil.ts";
const GEO = "lib/traktGeometri.ts";
const OBJ = "lib/larm/objekt.ts";
const SIDA = "app/planering/page.tsx";
const GAV = "lib/objekt/filenGav.ts";
const TECKEN = "lib/teckenforklaring.ts";

const TESTER = [
  "lib/larm/larm.test.ts",
  "lib/larm/larmregler.vakter.test.ts",
  "lib/hooks/useKorvyLarm.test.tsx",
  "lib/instruktioner/ordning.test.ts",
  "lib/instruktioner/instruktioner.vakter.test.ts",
  "lib/instruktioner/instruktioner.test.ts",
  "lib/vidaYtaTyp.test.ts",
];

const M = [
  // ── ingen Sett på fara ──
  ["Röd får Sett-rad igen", "return !arFara(o) && larmar({ ...o, undantagen: false }, false) && !o.undantagen;", "return larmar({ ...o, undantagen: false }, false) && !o.undantagen;", LARM],
  ["fara räknas inte som fara (Ej framkomlig m.fl.)", "export const arFara = (o: Pick<LarmObjekt, 'grupp'>): boolean => o.grupp === 'fara';", "export const arFara = (o: Pick<LarmObjekt, 'grupp'>): boolean => o.grupp === 'fara' && !('forbjuden' in o);", LARM],
  ["en gammal kvittens tystar/sänker en Röd igen", "const kvitterad = !fara && arKvitterad(o, inp.kvitt, inp.forareId);", "const kvitterad = arKvitterad(o, inp.kvitt, inp.forareId);", LARM],
  ["ett sett i minnet sänker en Röd igen", "sett: !fara && !!inp.state.sett[o.id] });", "sett: !!inp.state.sett[o.id] });", LARM],
  ["sett på en Röd bärs vidare i passagen", "if (inp.state.sett[o.id] && !fara) nyaSett[o.id] = true;", "if (inp.state.sett[o.id]) nyaSett[o.id] = true;", LARM],
  ["en kvitterad Röd sjunker under en grön", "const harSjunkit = (a: Rangbar) => !!a.sett;", "const harSjunkit = (a: Rangbar) => !!a.sett || (!!a.kvitterad && a.o.grupp === 'fara' && !a.o.forbjuden);", LARM],
  ["Sett-raden hoppar inte över Röd i \"+\"-raden", "const sett = rang.find((x) => harSettRad(x.o) && !x.kvitterad && !nyaSett[x.o.id]);", "const sett = rang.find((x) => !x.kvitterad && !nyaSett[x.o.id]);", LARM],
  ["en Röd i \"+\"-raden håller inte platsen åt instruktionen", "arFara: larm.kort?.grupp === 'fara' || larm.fler.some((x) => x.grupp === 'fara') })", "arFara: larm.kort?.grupp === 'fara' })", SIDA],

  // ── Övrigt (TYP 71) är inte hänsyn ──
  ["71 är ingen fri kod", "export const OVRIGA_YTKODER: readonly string[] = ['71'];", "export const OVRIGA_YTKODER: readonly string[] = [];", YTATYP],
  ["koden jämförs inte som text (tal 71 missas)", "OVRIGA_YTKODER.includes(String(props.TYP ?? '').trim())", "OVRIGA_YTKODER.includes(props.TYP as string)", YTATYP],
  ["vilket lager som helst räknas (punkter med TYP 71)", "if (String(props._lager ?? '') !== 'L_TILLAGGSYTOR') return false;", "", YTATYP],
  ["hänsynsytor utan _typ-krav", "!!props && String(props._typ ?? '') === 'hänsynsyta' && !arOvrigYta(props)", "!!props && !arOvrigYta(props)", YTATYP],
  ["Övrigt larmar som hänsyn", "if (yta && arHansynsyta(props)) return 'hansynsyta';", "if (typ === 'hänsynsyta' && yta) return 'hansynsyta';", OBJ],
  ["Övrigt klassas som hänsyn", "if (m && m.kategori === 'hansyn' && arOvrigYta(props)) return { kategori: 'ovrigt', kalla: m.kalla };", "", GEO],
  ["Övrigt byter nyckel (sparade kommentarer och Sett tappas)", "case 'ovrigt':       { const v = txt(p.LOPNR);                       return v ? `hansyn:${v}` : null; }", "case 'ovrigt':       { const v = txt(p.LOPNR);                       return v ? `ovrigt:${v}` : null; }", GEO],
  ["Övrigt-kortet saknar Vidas ATGARD", "rubrik = txt(props.FLBESKR) || 'Övrigt';\n    vidaKommentar = txt(props.ATGARD);", "rubrik = txt(props.FLBESKR) || 'Övrigt';", GEO],
  ["hänsynslagren tar Övrigt (filter utan undantag)", "export const HANSYNSYTA_FILTER = ['all', ['==', ['get', '_typ'], 'hänsynsyta'], ['!', ['in', YTKOD, ['literal', OVRIGA_YTKODER]]]] as unknown as unknown[];", "export const HANSYNSYTA_FILTER = ['==', ['get', '_typ'], 'hänsynsyta'] as unknown as unknown[];", YTASTIL],
  ["Övrigt-lagret ritar allt", "export const OVRIGT_YTA_FILTER = ['all', ['==', ['get', '_typ'], 'hänsynsyta'], ['in', YTKOD, ['literal', OVRIGA_YTKODER]]] as unknown as unknown[];", "export const OVRIGT_YTA_FILTER = ['==', ['get', '_typ'], 'hänsynsyta'] as unknown as unknown[];", YTASTIL],
  ["Övrigt heter HÄNSYN på kartan", "  ovrigt: 'ÖVRIGT',", "  ovrigt: 'HÄNSYN',", YTASTIL],
  ["Övrigt har ingen streckad kant", "'line-dasharray': [...OVRIGT_YTA_STIL.streck]", "'line-dasharray': [1, 0]", SIDA],
  ["Övrigt får grön fyllning", "paint: { 'fill-color': OVRIGT_YTA_STIL.farg, 'fill-opacity': OVRIGT_YTA_STIL.traffFyllning }", "paint: { 'fill-color': FARG_NATUR, 'fill-opacity': 0.18 }", SIDA],
  ["hänsynsräkningen i På trakten tar Övrigt", "if (arHansynsyta(p) && aK) { hansynA", "if (p._typ === 'hänsynsyta' && aK) { hansynA", SIDA],
  ["Klar med trakten? räknar Övrigt som hänsynsyta", "hansynsytor: (traktGeo?.features || []).filter((f: any) => klassaTraktFeature(f?.properties || {}).kategori === 'hansyn').length,", "hansynsytor: (traktGeo?.features || []).filter((f: any) => f?.properties?._typ === 'hänsynsyta').length,", SIDA],
  ["Övrigt hamnar i Om traktens hänsynsrad", "typ: arOvrigt ? 'ovrigt' : 'hansyn', typLabel: arOvrigt ? 'Övrigt' : 'Hänsynsyta'", "typ: 'hansyn', typLabel: 'Hänsynsyta'", SIDA],
  ["Övrigt-ytornas nummer flyttar traktdelarnas nummer", "return k === 'hansyn' || k === 'ovrigt';", "return k === 'hansyn';", SIDA],
  ["Övrigt går inte att trycka på", "'trakt-raa-line', 'trakt-hansyn-fill', 'trakt-ovrigt-fill',", "'trakt-raa-line', 'trakt-hansyn-fill',", SIDA],
  ["lagerknappen \"Hänsynsytor\" visas för en trakt med bara Övrigt", "typer.add(arOvrigYta(f?.properties) ? 'ovrigtyta' : t);", "typer.add(t);", SIDA],
  ["\"Vad filen gav\" räknar Övrigt som hänsyn", "if (arHansynsyta(p)) {", "if (typ === 'hänsynsyta') {", GAV],
  ["teckenförklaringen visar Hänsyn för Övrigt", "if (arHansynsyta(p)) ut.add('hansynsyta');", "if (typ === 'hänsynsyta') ut.add('hansynsyta');", TECKEN],
];

kor({
  filer: [LARM, YTATYP, YTASTIL, GEO, OBJ, SIDA, GAV, TECKEN],
  tester: TESTER,
  standardFil: LARM,
  mutationer: M,
});
