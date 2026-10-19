// Mutationskontroll för månadens ordinarie (lön, testnivå full): varje del av regeln "övertid först när månadens ordinarie timmar är fyllda" —
// vardagarna, röda dagar (alltid avdrag), all frånvaro, arbete vinner, deldagens timmar, anställningsdatum, utjämningsmånaden som behåller
// dagens formel, aktiv-varningen, sammankopplingen i underlaget — ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
// Regeln: lib/lonesystem/manadsordinarie.ts (docs/lonesystem/manadsordinarie.md).
//
// Kör:  node scripts/mutationskontroll-ordinarie.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
//       Dela upp med MUT_FRAN=0 MUT_TILL=20 om tidsgränsen är kort. Avbryts den mitt i kan en mutant ligga kvar i källan:
//       kontrollera att varje mönster finns exakt en gång (motorn gör det) innan du committar.
import { kor } from "./mutationsmotor.mjs";

const ORD = "lib/lonesystem/manadsordinarie.ts";
const BER = "lib/lonesystem/loneberakning.ts";
const UND = "lib/lonesystem/loneunderlag.ts";

const TESTER = [
  "lib/lonesystem/manadsordinarie.test.ts",
  "lib/lonesystem/loneberakning.manadsordinarie.test.ts",
  "lib/lonesystem/loneunderlag.manadsordinarie.test.ts",
  "lib/lonesystem/loneberakning.helglon.test.ts",
  "lib/lonesystem/loneberakning.hemskickad.test.ts",
  "lib/lonesystem/loneberakning.koder.test.ts",
  "lib/lonesystem/septemberbytediff.test.ts",
];

const M = [
  // ── manadsordinarie.ts: grunden ──
  ["en ordinarie dag är 7 tim", "export const ORDINARIE_DAG_H = 8;", "export const ORDINARIE_DAG_H = 7;", ORD],
  ["helger räknas som vardagar", "if (w !== 0 && w !== 6) ut.push(isoUtc(d));", "ut.push(isoUtc(d));", ORD],
  ["sista dagen i månaden tas inte med", "d.getUTCMonth() === m - 1;", "d.getUTCMonth() === m - 1 && d.getUTCDate() < 31;", ORD],

  // ── röda dagar ──
  ["röda dagar avdras inte", "const roda = [...new Set(i.rodaDagar)].filter(d => iManaden.has(d)).sort();", "const roda: string[] = [];", ORD],
  ["röda dagar på helg avdras (utanför vardagarna)", "[...new Set(i.rodaDagar)].filter(d => iManaden.has(d))", "[...new Set(i.rodaDagar)]", ORD],
  ["röda dagar räknas två gånger (set saknas)", "[...new Set(i.rodaDagar)]", "[...i.rodaDagar]", ORD],

  // ── anställningsdatum ──
  ["dagar före anställning avdras inte", "? vardagar.filter(d => d < i.anstallningsdatum! && !redan.has(d))", "? [] as string[]", ORD],
  ["anställningsdagen själv avdras (<=)", "d < i.anstallningsdatum! && !redan.has(d)", "d <= i.anstallningsdatum! && !redan.has(d)", ORD],
  ["röd dag före anställning avdras två gånger", "d < i.anstallningsdatum! && !redan.has(d)", "d < i.anstallningsdatum!", ORD],

  // ── frånvaro ──
  ["hemskickad räknas som frånvaro", 'if (String(l.typ || "").toLowerCase() === "hemskickad") continue;', "", ORD],
  ["en deldag räknas som hel frånvarodag", "if (l.fran_tid || l.till_tid) continue;", "", ORD],
  ["arbete vinner inte över en heldagsrad", "redan.has(iso) || i.arbetadeDatum.has(iso)) continue;", "redan.has(iso)) continue;", ORD],
  ["frånvaro på en redan avdragen dag (röd/före anställning) avdras igen", "!iManaden.has(iso) || redan.has(iso) ||", "!iManaden.has(iso) ||", ORD],
  ["frånvaro på helg avdras", "if (!iManaden.has(iso) || redan.has(iso)", "if (redan.has(iso)", ORD],
  ["bara första dagen i en period avdras", "d.setUTCDate(d.getUTCDate() + 1)) {\n      const iso", "d.setUTCDate(d.getUTCDate() + 99)) {\n      const iso", ORD],
  ["slutdagen i en period avdras inte", "isoUtc(d) <= l.slutdatum;", "isoUtc(d) < l.slutdatum;", ORD],

  // ── deldagar ──
  ["deldagens timmar dras inte av", "* ORDINARIE_DAG_H - deldagH));", "* ORDINARIE_DAG_H));", ORD],
  ["deldag på redan avdragen dag dras av igen", "if (!iManaden.has(dd.datum) || redan.has(dd.datum) || deldagSedda.has(dd.datum)) continue;", "if (!iManaden.has(dd.datum) || deldagSedda.has(dd.datum)) continue;", ORD],
  ["samma deldag räknas två gånger", "|| deldagSedda.has(dd.datum)) continue;", ") continue;", ORD],
  ["negativ deldag ökar ordinarie", "deldagH += Math.max(0, dd.timmar || 0);", "deldagH += dd.timmar || 0;", ORD],

  // ── aldrig negativt, avrundning ──
  ["ordinarie kan bli negativt", "const timmar = Math.max(0, avrunda2((vardagar.length - avdragna) * ORDINARIE_DAG_H - deldagH));", "const timmar = avrunda2((vardagar.length - avdragna) * ORDINARIE_DAG_H - deldagH);", ORD],
  ["halva deltimmar avrundas bort", "const avrunda2 = (x: number) => Math.round(x * 100) / 100;", "const avrunda2 = (x: number) => Math.round(x);", ORD],

  // ── utjämningsperiod ──
  ["perioden som slutar första dagen i månaden räknas inte", "p.slutdatum >= forsta", "p.slutdatum > forsta", ORD],
  ["perioden som börjar sista dagen i månaden räknas inte", "p.startdatum <= sista", "p.startdatum < sista", ORD],
  ["perioden måste ligga helt inom månaden", "p.startdatum <= sista && p.slutdatum >= forsta", "p.startdatum >= forsta && p.slutdatum <= sista", ORD],
  ["utjämningsmånaden räknar inte arbetade dagar × 8", "timmar: arbetadeDagar * ORDINARIE_DAG_H,", "timmar: 0,", ORD],

  // ── texten ──
  ["texten glömmer röda dagar", "if (o.roda.length) delar.push(", "if (false) delar.push(", ORD],
  ["texten glömmer deldagen", "if (o.deldag_h > 0) delar.push(", "if (false) delar.push(", ORD],
  ["texten glömmer dagar före anställning", "if (o.anstallning.length) delar.push(", "if (false) delar.push(", ORD],

  // ── loneberakning.ts: formlerna ──
  ["övertid i en månad räknas på gamla sättet (kortpass/hem avdras)", "utjamningsManad ? totalH - ordinarie - kortpassH - hemOvrigH : totalH - ordinarie)", "totalH - ordinarie - kortpassH - hemOvrigH)", BER],
  ["timlön i en månad räknas på gamla sättet (kortpass/hem läggs till)", "utjamningsManad ? ordinarie + kortpassH + hemOvrigH : ordinarie)", "ordinarie + kortpassH + hemOvrigH)", BER],
  ["utjämningsmånaden får nya regeln (aldrig utjämning)", "const utjamningsManad = overlapparUtjamning(arbperiod, lon.utjamning ?? []);", "const utjamningsManad = false;", BER],
  ["alla månader följer utjämningsregeln", "const utjamningsManad = overlapparUtjamning(arbperiod, lon.utjamning ?? []);", "const utjamningsManad = true;", BER],
  ["ordinarie är arbetade dagar × 8", "const ordinarie = ordinarieRes.timmar; // timmar", "const ordinarie = gammalOrdinarie;", BER],
  ["röda dagar ur de som ger helglön (inte avtalets lista)", "rodaDagar: Object.keys(helglonDagarArsLista(helglonNamn, Number(arbperiod.slice(0, 4)))).filter(d => d.startsWith(arbperiod)),", "rodaDagar: helglonGerDagar.map(h => h.datum),", BER],
  ["röda dagar ur företagsledarens (tomma) helglönslista", "rodaDagar: Object.keys(helglonDagarArsLista(helglonNamn, Number(arbperiod.slice(0, 4)))).filter(d => d.startsWith(arbperiod)),", "rodaDagar: helglonDagarLista.map(h => h.datum),", BER],
  ["deldagarna skickas inte till ordinarie", "deldagar: deldagar.map(d => ({ datum: d.datum, timmar: d.timmar })),", "deldagar: [],", BER],
  ["frånvaron skickas inte till ordinarie", "      ledigheter,\n      arbetadeDatum,\n      deldagar:", "      ledigheter: [],\n      arbetadeDatum,\n      deldagar:", BER],
  ["arbetade dagar skickas inte (arbete vinner aldrig)", "      ledigheter,\n      arbetadeDatum,\n      deldagar:", "      ledigheter,\n      arbetadeDatum: new Set<string>(),\n      deldagar:", BER],
  ["anställningsdatum skickas inte till ordinarie", "      anstallningsdatum: anstDatum,\n    });\n  const ordinarie", "      anstallningsdatum: null,\n    });\n  const ordinarie", BER],
  ["ordinarie redovisas inte i svaret", "    ordinarie: ordinarieRes,\n", "    ordinarie: utjamningOrdinarie(arbperiod, 0),\n", BER],

  // ── texter och varningar ──
  ["timlönens text är alltid den gamla", "utjamningsManad || timlonH === gammalTimlonH\n", "true\n", BER],
  ["timlönens text är alltid den nya", "utjamningsManad || timlonH === gammalTimlonH\n", "false\n", BER],
  ["extra-tid-varningen har samma text i alla månader", "(utjamningsManad\n        ? `räknas som arbetstid", "(false\n        ? `räknas som arbetstid", BER],
  ["kortpass-varningen har gamla texten i alla månader", "varningar.push(utjamningsManad\n      ? `Kortpass", "varningar.push(true\n      ? `Kortpass", BER],
  ["inaktiv förare varnas inte", 'lon.aktiv === false && !foretagsledare && !utjamningsManad', 'false && !foretagsledare && !utjamningsManad', BER],
  ["okänd aktiv-status varnas som inaktiv", 'lon.aktiv === false && !foretagsledare', 'lon.aktiv !== true && !foretagsledare', BER],
  ["företagsledare varnas som inaktiv", 'lon.aktiv === false && !foretagsledare && !utjamningsManad', 'lon.aktiv === false && !utjamningsManad', BER],
  ["utjämningsmånad varnas som inaktiv", 'lon.aktiv === false && !foretagsledare && !utjamningsManad', 'lon.aktiv === false && !foretagsledare', BER],

  // ── loneunderlag.ts: kopplingen ──
  ["alla förares utjämningsperioder gäller alla", "utjamning: utjamningAlla.filter(u => !u.medarbetare_id || u.medarbetare_id === med.id)", "utjamning: utjamningAlla", UND],
  ["bara perioder utan förare gäller", "utjamning: utjamningAlla.filter(u => !u.medarbetare_id || u.medarbetare_id === med.id)", "utjamning: utjamningAlla.filter(u => !u.medarbetare_id)", UND],
  ["bara förarens egna perioder gäller", "utjamning: utjamningAlla.filter(u => !u.medarbetare_id || u.medarbetare_id === med.id)", "utjamning: utjamningAlla.filter(u => u.medarbetare_id === med.id)", UND],
  ["aktiv skickas inte till lönemotorn", "aktiv: med.aktiv ?? undefined,", "aktiv: undefined,", UND],
  ["aktiv läses inte ur medarbetare", 'select("id, namn, maskin_id, foretagsledare, anstallningsdatum, aktiv")', 'select("id, namn, maskin_id, foretagsledare, anstallningsdatum")', UND],
  ["läsfel på utjämningsperioder stoppar inte", "if (utjRes?.error && !/42P01|PGRST205/", "if (false && utjRes?.error && !/42P01|PGRST205/", UND],
  ["saknad tabell stoppar underlaget", "!/42P01|PGRST205/.test(", "!/NOMATCH/.test(", UND],
];

const fran = Number(process.env.MUT_FRAN ?? 0);
const till = Number(process.env.MUT_TILL ?? M.length);
kor({ filer: [ORD, BER, UND], tester: TESTER, standardFil: ORD, mutationer: M.slice(fran, till) });
