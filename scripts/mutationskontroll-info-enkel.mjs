// Mutationskontroll för "ⓘ enkel + påminnelse i ytan" (Martin 2026-10-22): samma namn på kartan och i listan, enkla kortet i tre delar, flyg + puls, påminnelsen (pill 10 s → bricka)
// — varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-info-enkel.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const NAMN = "lib/ytaNamn.ts";
const RADER = "lib/ytaRader.ts";
const FLYG = "lib/ytaFlyg.ts";
const INST = "lib/instruktioner/instruktioner.ts";
const HOOK = "lib/hooks/useInstruktioner.ts";
const OBJKORT = "lib/objektKort.ts";
const GEO = "lib/traktGeometri.ts";
const ENKEL = "components/planering/ObjektKortEnkel.tsx";
const YTARAD = "components/planering/YtaRad.tsx";
const PAM = "components/planering/YtaPaminnelse.tsx";
const KORT = "components/planering/InstruktionKort.tsx";
const INFO = "components/planering/ObjektInfo.tsx";
const SIDA = "app/planering/page.tsx";
const PULS = "lib/larm/pulsKarta.ts";

const TESTER = [
  "lib/ytaNamn.test.ts",
  "lib/ytaRader.test.ts",
  "lib/ytaFlyg.test.ts",
  "lib/instruktioner/paminnelse.test.ts",
  "lib/instruktioner/instruktioner.test.ts",
  "lib/hooks/useInstruktioner.test.tsx",
  "lib/infoEnkel.vakter.test.ts",
  "lib/larm/pulsKarta.test.ts",
  "components/planering/ObjektKortEnkel.render.test.tsx",
  "components/planering/ObjektInfo.test.tsx",
];

const M = [
  // ── samma namn på kartan och i listan ──
  ["Vidas suffix \" F\" visas (bara O tas bort)", "replace(/\\s+[OF]$/, '')", "replace(/\\s+[O]$/, '')", NAMN],
  ["suffixet tas inte bort alls", "replace(/\\s+[OF]$/, '')", "replace(/\\s+Ö$/, '')", NAMN],
  ["brickan saknar numret (inte kartans etikett)", "const bricka = nr ? `${ord} ${nr}` : ord;", "const bricka = ord;", NAMN],
  ["Övrigt heter Hänsyn i brickan", "const ord = gemener(ovrigt ? VIDA_ETIKETT.ovrigt : VIDA_ETIKETT.hansynsyta);", "const ord = gemener(VIDA_ETIKETT.hansynsyta);", NAMN],
  ["Övrigt upprepar sin typ (\"Övrigt 4 Övrigt\")", "typRaw.toLocaleLowerCase('sv-SE') === ord.toLocaleLowerCase('sv-SE') ? '' : typRaw;", "false ? '' : typRaw;", NAMN],
  ["Övrigt får gruppen natur (grön bricka)", "grupp: ovrigt ? 'ovrigt' : 'natur', nr }", "grupp: 'natur', nr }", NAMN],
  ["första punkten är hela texten", "return kommentarPunkter(text)[0] ?? null;", "return String(text ?? '').trim() || null;", NAMN],
  ["kartkortets rubrik byggs inte av namnet", "rubrik = namn?.rubrik || (kategori === 'ovrigt' ? 'Övrigt' : 'Hänsynsyta');", "rubrik = txt(props.FLBESKR) || 'Hänsynsyta';", GEO],

  // ── raderna i listan ──
  ["raderna sorteras inte i Vidas nummerordning", "vida.sort((a, b) => (Number.isFinite(a.n) ? a.n : 1e9) - (Number.isFinite(b.n) ? b.n : 1e9));", "", RADER],
  ["direktivet får en egen yta-rad", "o.nyckel !== DIREKTIV_NYCKEL && !sedda.has(o.nyckel)", "!sedda.has(o.nyckel)", RADER],
  ["osedd-pricken är omvänd", "osedd: (o?.nya ?? 0) > 0, n: parseInt(namn.nr, 10) }", "osedd: (o?.nya ?? 0) === 0, n: parseInt(namn.nr, 10) }", RADER],
  ["en yta utan instruktion saknar rad", "if (!namn || !nyckel || sedda.has(nyckel)) continue;", "if (!namn || !nyckel || sedda.has(nyckel) || !perNyckel.get(nyckel)) continue;", RADER],
  ["texten är inte första punkten", "text: o?.instruktioner[0] ? forstaPunkt(o.instruktioner[0].text) : null,", "text: o?.instruktioner[0] ? o.instruktioner[0].text : null,", RADER],

  // ── raden och brickan ──
  ["texten på raden bryts i stället för att avkortas", "{rad.text && <span data-testid=\"yta-rad-text\" style={{ ...TYP.text, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>", "{rad.text && <span data-testid=\"yta-rad-text\" style={{ ...TYP.text, color: FARG.text2 }}>", YTARAD],
  ["blå pricken visas för alla", "{rad.osedd && <BlaPrick />}", "{<BlaPrick />}", YTARAD],
  ["raden gör inget vid tryck", "onClick={() => onTryck(rad.nyckel)}", "onClick={() => {}}", YTARAD],
  ["brickans färg är inte gruppens", "background: brickaFarg(grupp), color: FARG.bg", "background: FARG.fyllning, color: FARG.bg", YTARAD],

  // ── enkla kortet ──
  ["GROT-raden visas alltid (även utan GROT)", "if (grot !== true) return null;", "if (grot === null) return null;", OBJKORT],
  ["skotaren får skördarens GROT-text", "if (maskinSlag === 'skotare') return 'GROT tas ut – kör inte på rishögarna';", "if (maskinSlag === 'skotare') return 'GROT tas ut – lägg riset i högar';", OBJKORT],
  ["stapeln ritas utan mätning (0 %)", "if (o.klartHa == null || !Number.isFinite(o.klartHa)) return { text: del(`${svTal(o.arealHa, 1)} ha`), andel: null };", "if (o.klartHa == null || !Number.isFinite(o.klartHa)) return { text: del(`${svTal(o.arealHa, 1)} ha`), andel: 0 };", OBJKORT],
  ["stapeln kläms inte till 100 %", "andel: Math.max(0, Math.min(1, o.klartHa / o.arealHa))", "andel: o.klartHa / o.arealHa", OBJKORT],
  ["rubriken är små versaler", "margin: `${AVSTAND.s}px ${AVSTAND.xs}px ${AVSTAND.m}px` }}>Det här gäller här</h2>", "margin: `${AVSTAND.s}px ${AVSTAND.xs}px ${AVSTAND.m}px`, textTransform: 'uppercase' }}>Det här gäller här</h2>", ENKEL],
  ["direktivets etikett är den gamla", "vidaEtikett=\"Hela trakten · Vida\"", "vidaEtikett=\"Vida · traktdirektiv\"", ENKEL],
  ["112-raden saknar larmkoordinaten", "under={<span data-testid=\"kort-larm-koordinat\" style={TNUM}>Larmkoordinat {p.larm.koordinat}</span>}", "under={undefined}", ENKEL],
  ["raderna heter inte Kartans färger", "etikett=\"Kartans färger\"", "etikett=\"Vad betyder kartan\"", ENKEL],
  ["ytorna ligger före direktivet och GROT (fel ordning)", "{/* EN RAD PER YTA", "{false && /* EN RAD PER YTA", ENKEL],
  ["ObjektInfo ger inte enkla kortet", "&& enkel ? (\n          <ObjektKortEnkel", "&& false ? (\n          <ObjektKortEnkel", INFO],
  ["arket fälls inte ner vid tryck på en yta (telefon)", "onYta={(nyckel) => { sattDetent('halv'); enkel.onYta(nyckel, lage); }}", "onYta={(nyckel) => { enkel.onYta(nyckel, lage); }}", INFO],

  // ── flyg + puls ──
  ["panelen räknas inte bort från kameran (bred skärm)", "return { top: o.toppLuft, bottom: o.luft, left: o.luft, right: o.luft + o.panelBreddPx };", "return { top: o.toppLuft, bottom: o.luft, left: o.luft, right: o.luft };", FLYG],
  ["arket räknas inte bort från kameran (telefon)", "bottom: Math.round(o.fonsterH * ARK_HOJD_ANDEL) + o.luft,", "bottom: o.luft,", FLYG],
  ["egna zoner hittas inte", "const nyckel = m?.lineType === 'boundary' ? `omrade:${m.id}` : markerNyckel(m?.id);", "const nyckel = markerNyckel(m?.id);", FLYG],
  ["pulsen kräver position även för en yta", "const g = puls ? (pos ? pulsGeometri(puls.geometri, pos) : rak ? puls.geometri : null) : null;", "const g = puls && pos ? pulsGeometri(puls.geometri, pos) : null;", PULS],
  ["ytan pulserar inte (larmets puls går inte före / ytaPuls ignoreras)", "const pulsNu = korvyActive ? (larm.puls ?? ytaPuls) : null;", "const pulsNu = korvyActive ? larm.puls : null;", SIDA],
  ["raden flyger inte (ingen fitBounds)", "map.fitBounds(geo.bounds, {\n                  padding: ytaKameraPadding(", "void ({\n                  padding: ytaKameraPadding(", SIDA],
  ["ytan pulserar för evigt", "setTimeout(() => setYtaPuls(null), YTA_PULS_MS)", "setTimeout(() => {}, YTA_PULS_MS)", SIDA],
  ["skotaren får en stapel (skördarspåret)", "klartHa: maskinSlag === 'skordare' && avverkat?.harSpar ? avverkat.ha : null", "klartHa: avverkat?.harSpar ? avverkat.ha : null", SIDA],

  // ── påminnelsen ──
  ["hela pillen varar bara 1 s", "export const PAMINNELSE_FULL_MS = 10000;", "export const PAMINNELSE_FULL_MS = 1000;", INST],
  ["tiden startar om vid varje GPS-punkt", "paminn[o.nyckel] = start != null && var_ ? start : (var_ ? nu - PAMINNELSE_FULL_MS : nu);", "paminn[o.nyckel] = nu;", INST],
  ["Sett inne i ytan ger en ny 10-sekunders pill", "paminn[o.nyckel] = start != null && var_ ? start : (var_ ? nu - PAMINNELSE_FULL_MS : nu);", "paminn[o.nyckel] = start != null && var_ ? start : nu;", INST],
  ["påminnelse även för en osedd yta", "if (ar && nya === 0) {", "if (ar) {", INST],
  ["påminnelsen väntar inte på larm/lossning", "if (blockerad || kortVisas) return null;", "if (kortVisas) return null;", INST],
  ["påminnelsen visas ovanpå instruktionskortet", "if (blockerad || kortVisas) return null;", "if (blockerad) return null;", INST],
  ["hela trakten (direktivet) får påminnelse", "if (o.objektniva || !state.inne[o.nyckel]) continue;\n    const start", "if (!state.inne[o.nyckel]) continue;\n    const start", INST],
  ["pillen krymper aldrig (fas alltid full)", "fas: kvarMs > 0 ? 'full' : 'bricka', kvarMs,", "fas: 'full', kvarMs,", INST],
  ["timern som krymper pillen saknas", "const t = setTimeout(() => setTick((n) => n + 1), paKvarRef.current + 20);", "const t = setTimeout(() => {}, paKvarRef.current + 20);", HOOK],
  ["hooken ignorerar blockeradPaminnelse", "inp.blockeradPaminnelse ?? inp.blockerad, kort != null)", "inp.blockerad, kort != null)", HOOK],
  ["pillen krymper inte mjukt (ingen övergång)", "transition: ovg,\n          boxShadow", "boxShadow", PAM],
  ["texten göms inte i brickfasen", "maxWidth: full ? 'min(420px, calc(100vw - 150px))' : 0, opacity: full ? 1 : 0,", "maxWidth: 'min(420px, calc(100vw - 150px))', opacity: 1,", PAM],
  ["tryck på pillen gör inget", "onClick={onTryck}", "onClick={() => {}}", PAM],
  ["den hela instruktionen har Sett (ska vara utan)", "{utanSett\n            ? <button", "{false\n            ? <button", KORT],
  ["sidan ger inte larm/lossning företräde åt påminnelsen", "blockeradPaminnelse: !!larm.kort || lossningVisas,", "blockeradPaminnelse: false,", SIDA],
];

kor({
  filer: [NAMN, RADER, FLYG, INST, HOOK, OBJKORT, GEO, ENKEL, YTARAD, PAM, KORT, INFO, SIDA, PULS],
  tester: TESTER,
  standardFil: NAMN,
  mutationer: M,
});
