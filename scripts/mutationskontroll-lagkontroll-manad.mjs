// Mutationskontroll för lagkontrollens månadsövertid (testnivå full, Martin 2026-10-19): varje del av "lagkontrollen räknar övertid per
// kalendermånad, samma regel som lönen" — utjämningsmånaden som behåller genomsnittet, den pågående månadens ställning (t.o.m. igår, idag räknas varken
// arbetat eller ordinarie, aldrig röd), anställning/röda dagar/frånvaro/deldag in i ordinarie, årets tal som summan av månaderna, Min tid,
// admin-vyn, Mitt avtal-raden, routernas koppling — ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
// Reglerna: lib/lonesystem/arsovertid.ts (modell `manad`), lib/lonesystem/manadsordinarie.ts, lib/arbetstidsgranser.ts.
//
// Kör:  node scripts/mutationskontroll-lagkontroll-manad.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       Avbryts den mitt i kan en mutant ligga kvar i källan: kontrollera med git diff innan du committar.
import { kor } from "./mutationsmotor.mjs";

const ARS = "lib/lonesystem/arsovertid.ts";
const ORD = "lib/lonesystem/manadsordinarie.ts";
const GR = "lib/arbetstidsgranser.ts";
const VY = "lib/admin/arsovertidVy.ts";
const AVT = "lib/avtalVy.ts";
const MIN = "lib/lonesystem/minTidArsovertid.ts";
const R1 = "app/api/lon/arsovertid/route.ts";
const R2 = "app/api/lon/arbetstid/route.ts";

const TESTER = [
  "lib/lonesystem/arsovertid.manad.test.ts",
  "lib/lonesystem/arsovertid.hemskickad.test.ts",
  "lib/lonesystem/arsovertid.franvaro.test.ts",
  "lib/lonesystem/manadsordinarie.test.ts",
  "lib/lonesystem/minTidArsovertid.test.ts",
  "lib/arbetstidsgranser.test.ts",
  "lib/admin/arsovertidVy.test.ts",
  "lib/avtalVy.test.ts",
  "app/api/lon/arsovertid/route.test.ts",
  "app/api/lon/arbetstid/route.test.ts",
];

const M = [
  // ── arsovertid.ts: vilken månad följer vilken regel ──
  ["utjämningsmånader räknas med månadsregeln", "if (overlapparUtjamning(ym, perioder)) {", "if (false) {", ARS],
  ["alla månader räknas som utjämning", "if (overlapparUtjamning(ym, perioder)) {", "if (true) {", ARS],
  ["månaden efter en period som slutade räknas som utjämning (perioderna ignoreras)", "overlapparUtjamning(ym, perioder)", "overlapparUtjamning(ym, [])", ARS],
  ["pågående månad: hela månadens ordinarie (inte t.o.m. igår)", "const ordinarieTom = pagaende ? plusDagarIso(tomDatum, -1) : undefined;", "const ordinarieTom = undefined;", ARS],
  ["pågående: idag räknas i ordinarie", "const ordinarieTom = pagaende ? plusDagarIso(tomDatum, -1) : undefined;", "const ordinarieTom = pagaende ? tomDatum : undefined;", ARS],
  ["pågående: gårdagen räknas inte i ordinarie (−2)", "plusDagarIso(tomDatum, -1) : undefined;", "plusDagarIso(tomDatum, -2) : undefined;", ARS],
  ["pågående: dagens arbetade tid räknas med", "(manader.get(ym)?.min || 0) - (pagaende ? (minPerDatum.get(tomDatum) || 0) : 0);", "(manader.get(ym)?.min || 0);", ARS],
  ["pågående: bara dagens maskintid dras bort", "(pagaende ? (minPerDatum.get(tomDatum) || 0) : 0)", "(pagaende ? (maskinPerDatum.get(tomDatum) || 0) : 0)", ARS],
  ["avslutad månad: sista dagens tid dras bort", "(pagaende ? (minPerDatum.get(tomDatum) || 0) : 0)", "(minPerDatum.get(tomDatum) || 0)", ARS],
  ["avslutad månad får också en ställning", "stallning: pagaende ? stallning : null", "stallning", ARS],
  ["ingen månad är pågående", "const pagaende = ym === sistaManad;", "const pagaende = false;", ARS],
  ["övertid kan bli negativ", "overtid: r2(Math.max(0, stallning))", "overtid: stallning", ARS],
  ["arbetad tid avrundas till en decimal (lönen har två)", "const arbetadH = r2(arbetadMin / 60);", "const arbetadH = r1(arbetadMin / 60);", ARS],
  ["ställningen räknas mot fel tal (arbetad − 0)", "const stallning = r2(arbetadH - ord.timmar);", "const stallning = r2(arbetadH);", ARS],

  // ── arsovertid.ts: det som dras av i ordinarie ──
  ["röda dagar ur en tom lista", "const rodaAvtal = Object.keys(helglonDagar(kontext.helglonNamn ?? null, ar));", "const rodaAvtal: string[] = [];", ARS],
  ["avtalets lista över röda dagar ignoreras", "helglonDagar(kontext.helglonNamn ?? null, ar)", "helglonDagar(null, ar)", ARS],
  ["anställningsdatum ignoreras", "anstallningsdatum: kontext.anstallningsdatum ?? null, tomDatum: ordinarieTom,", "anstallningsdatum: null, tomDatum: ordinarieTom,", ARS],
  ["frånvaron ignoreras", "const gallandeFr = franvaro.filter(r => (FRANVARO_STATUS_GALLER as readonly string[]).includes(r.status));", "const gallandeFr: FranvaroRad[] = [];", ARS],
  ["väntande och nekad frånvaro räknas", "const gallandeFr = franvaro.filter(r => (FRANVARO_STATUS_GALLER as readonly string[]).includes(r.status));", "const gallandeFr = franvaro;", ARS],
  ["arbete vinner inte över en heldagsrad", "if (min > 0) arbetadeDatum.add(datum);", "if (false) arbetadeDatum.add(datum);", ARS],
  ["extra tid räknas som maskinpass (arbete vinner)", "maskinPerDatum.forEach((min, datum) => { if (min > 0) arbetadeDatum.add(datum); });", "minPerDatum.forEach((min, datum) => { if (min > 0) arbetadeDatum.add(datum); });", ARS],
  ["deldagar ignoreras", '.filter(r => arDeldag(r) && r.typ !== "inarbetad" && r.typ !== "hemskickad" && !!r.startdatum)', ".filter(r => false)", ARS],
  ["deldagen räknas som hel dag (arbetad tid ignoreras)", "deldagTimmar(schemaH, maskinPerDatum.get(r.startdatum) || 0)", "deldagTimmar(schemaH, 0)", ARS],
  ["schematimmarna ur avtalet ignoreras", "const schemaH = schemaTimmarPerDag(kontext.ordinarieVeckaH);", "const schemaH = schemaTimmarPerDag(null);", ARS],

  // ── arsovertid.ts: fördelningen på månader och årets tal ──
  ["månadsregelns månader behåller även genomsnittets fördelning", "for (const [ym, v] of Object.entries(gen)) if (!manadsregel.has(ym)) ut[ym] = v;", "for (const [ym, v] of Object.entries(gen)) ut[ym] = v;", ARS],
  ["utjämningsmånader tappar genomsnittets fördelning", "for (const [ym, v] of Object.entries(gen)) if (!manadsregel.has(ym)) ut[ym] = v;", "for (const [ym, v] of Object.entries(gen)) if (false) ut[ym] = v;", ARS],
  ["pågående månad räknas som fastställd (kan bli röd)", "ut[ym] = m.pagaende ? { fast: 0, uppskattad: h, stallning: true } : { fast: h, uppskattad: 0 };", "ut[ym] = { fast: h, uppskattad: 0 };", ARS],
  ["avslutad månad räknas som uppskattad (aldrig röd)", "ut[ym] = m.pagaende ? { fast: 0, uppskattad: h, stallning: true } : { fast: h, uppskattad: 0 };", "ut[ym] = { fast: 0, uppskattad: h, stallning: true };", ARS],
  ["noll/negativ övertid ger ändå en post", "if (!(h > 0)) return;", "if (false) return;", ARS],
  ["årets tal räknar bara fastställda månader", "Object.values(perManad).reduce((s, m) => s + m.fast + m.uppskattad, 0)", "Object.values(perManad).reduce((s, m) => s + m.fast, 0)", ARS],
  ["årets tal är genomsnittsmodellens", "manad: r1(ovManad) }", "manad: r1(ovGenomsnitt) }", ARS],
  ["månadsfördelningen får inte månadsmodellen (äldre tal)", "veckor: veckorUt, manader: manadsLista });", "veckor: veckorUt });", ARS],

  // ── manadsordinarie.ts: ordinarie hittills ──
  ["tomDatum ignoreras (hela månaden)", ".filter(d => !i.tomDatum || d <= i.tomDatum);", ".filter(d => true);", ORD],
  ["tomDatum är exklusivt", "d <= i.tomDatum);", "d < i.tomDatum);", ORD],

  // ── arbetstidsgranser.ts ──
  ["årets övertid ur genomsnittet", "const ov = i.arsovertid.modeller.manad;", "const ov = i.arsovertid.modeller.genomsnitt;", GR],
  ["ställning markeras inte som sådan", "stallning: x.stallning === true,", "stallning: false,", GR],
  ["ställningens mening saknas", "if (s.stallning) mening =", "if (false) mening =", GR],
  ["ställningens mening: aldrig 'över gränsen'", 's.total > G ? " — över gränsen"', 'false ? " — över gränsen"', GR],
  ["månadsstatus läser inte månadsmodellen", "manadsstatus(overtidPerManad(i.arsovertid), i.tomDatum)", "manadsstatus(overtidPerManad({ ...i.arsovertid, manader: [] }), i.tomDatum)", GR],

  // ── Admin-vyn ──
  ["adminraden läser genomsnittet", "Number(m.modeller?.manad || 0)", "Number(m.modeller?.genomsnitt || 0)", VY],
  ["månadsraden: pågående månad utan 't.o.m. igår'", "if (x.stallning) return `${namn} ${tot} t.o.m. igår`", "if (false) return `${namn} ${tot} t.o.m. igår`", VY],
  ["månadsraden: utjämning utan etikett", "if (x.uppskattad > 0) return `${namn} ${tot} (utjämning)`", "if (false) return `${namn} ${tot} (utjämning)`", VY],
  ["månadsraden: månader utan övertid visas", ".filter(x => x.fast + x.uppskattad > 0)", ".filter(x => true)", VY],

  // ── Mitt avtal ──
  ["raden om hur övertid räknas saknas", '      ["Övertid räknas", OVERTID_REGEL],\n', "", AVT],
  ["raden säger fel", 'export const OVERTID_REGEL = "per kalendermånad – först när månadens timmar är fyllda";', 'export const OVERTID_REGEL = "per vecka";', AVT],

  // ── Min tid ──
  ["Min tid läser genomsnittet", "return { timmar: a.modeller.manad };", "return { timmar: a.modeller.genomsnitt };", MIN],
  ["Min tid glömmer anställning, avtal och schema", "anstallningsdatum: i.anstallningsdatum ?? null, helglonNamn: i.helglonNamn ?? null, ordinarieVeckaH: i.ordinarieVeckaH ?? null,", "", MIN],
  ["Min tid glömmer frånvaron", "i.utjamning, i.franvaro, {", "i.utjamning, [], {", MIN],
  ["Min tid glömmer utjämningsperioderna", "lokalIso(i.idag), i.utjamning,", "lokalIso(i.idag), [],", MIN],

  // ── routerna ──
  ["årsövertid-routen läser inte anställning och avtal", "anstallningsdatum: m.anstallningsdatum ?? null, helglonNamn: avtalRes.data?.helglon_dagar ?? null,", "anstallningsdatum: null, helglonNamn: null,", R1],
  ["årsövertid-routen skickar ingen månadsfördelning", "per_manad: overtidPerManad(a) };", "per_manad: {} };", R1],
  ["lagkontroll-routen läser inte anställningsdatum", "anstallningsdatum: m.anstallningsdatum ?? null, helglonNamn: avtal?.helglon_dagar ?? null,", "anstallningsdatum: null, helglonNamn: avtal?.helglon_dagar ?? null,", R2],
];

kor({ filer: [ARS, ORD, GR, VY, AVT, MIN, R1, R2], tester: TESTER, standardFil: ARS, mutationer: M });
