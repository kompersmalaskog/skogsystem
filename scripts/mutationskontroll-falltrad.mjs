// Mutationskontroll för fällträd och kör upp och backa (2026-10-25). Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
// Tungt (Chromium-testet ingår): kör EN åt gången — inte tillsammans med tsc, build eller en dev-server.
//
// Kör:  node scripts/mutationskontroll-falltrad.mjs
import { kor } from "./mutationsmotor.mjs";

const TRAD = "lib/fallTrad.ts";
const UPP = "lib/korUpp.ts";
const TVA = "lib/tvaTryck.ts";
const SPARR = "lib/ritlageSparr.ts";
const SIDA = "app/planering/page.tsx";
const INSTR = "lib/instruktioner/instruktioner.ts";

const TESTER = [
  "lib/fallTrad.test.ts",
  "lib/korUpp.test.ts",
  "lib/fallTradKorUpp.vakter.test.ts",
  "lib/fallTradKorUpp.hytt.test.ts",
  "lib/ritlageSparr.test.ts",
  "lib/ritlageSparr.vakter.test.ts",
];

const M = [
  // ── trädet: vad som syns var ──
  ["skotaren ser träd", "if (lage === 'skotare' || !pos) return [];\n  return trad.filter", "if (!pos) return [];\n  return trad.filter", TRAD],
  ["skördaren ser alla träd (ingen cirkel)", "return trad.filter((t) => avstandTillLinjeM(pos, tradLinje(t)) <= radieM);", "return [...trad];", TRAD],
  ["cirkeln är 60 m i stället för 30", "radieM = TRAD_SYNLIG_M", "radieM = 60", TRAD],
  ["bara stubben räknas, inte kronan", "fram(t.stubbe, t.vinkel, TRAD_LANGD_M)]", "fram(t.stubbe, t.vinkel, 0)]", TRAD],
  // ── trädet: vinklar och storlek ──
  ["fram: norr och öst byter plats", "lat: p.lat + (meter * Math.cos(r)) / 111320", "lat: p.lat + (meter * Math.sin(r)) / 111320", TRAD],
  ["vinkeln räknas från öst, inte norr", "Math.atan2(dx, dy)", "Math.atan2(dy, dx)", TRAD],
  ["trädet är dubbelt så stort på skärmen", "export const TRAD_SKARM_LANGD_PX = 76;", "export const TRAD_SKARM_LANGD_PX = 150;", TRAD],
  ["trädets storlek följer zoomen igen", "'icon-size': TRAD_STORLEK,", "'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.05, 20, 3],", TRAD],
  ["trädet ritas platt mot marken (krymper med lutningen)", "'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'viewport',\n      'icon-anchor': 'bottom'", "'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',\n      'icon-anchor': 'bottom'", TRAD],
  ["kronan blir randig igen", "ctx.lineJoin = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f3d1f'; ctx.stroke();\n  // Stubbe", "ctx.lineJoin = 'round'; ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f3d1f'; ctx.stroke(); ctx.strokeStyle = '#43b068'; ctx.lineWidth = 3; for (let y = topp + 10; y < stamTopp; y += 6) { ctx.beginPath(); ctx.moveTo(sx - 20, y); ctx.lineTo(sx + 20, y); ctx.stroke(); }\n  // Stubbe", TRAD],
  ["varje träd har den vita ringen", "vald: opt.valdId != null && opt.valdId === t.id", "vald: true", TRAD],
  ["alla träd får ringen när något är valt", "vald: opt.valdId != null && opt.valdId === t.id", "vald: opt.valdId != null", TRAD],
  ["stubben sitter inte på trädets plats (offset borta)", "'icon-anchor': 'bottom', 'icon-offset': [0, TRAD_BILD_MATT.pad],", "'icon-anchor': 'bottom',", TRAD],
  // ── förslaget ur de gamla pilarna ──
  ["körriktningspilar föreslås också bli träd", "m.arrowType === 'fellingdirection';", "(m.arrowType === 'fellingdirection' || m.arrowType === 'drivedirection');", TRAD],
  ["trädet får inte pilens riktning", "angle: p.vinkel, fran: p.id", "angle: 0, fran: p.id", TRAD],
  // ── kör upp och backa ──
  ["ordet visas även när skälet är Inget", "(skal && skal !== 'inget' && arSkal(skal) ? skalNamn(skal) : null)", "(skal && arSkal(skal) ? skalNamn(skal) : null)", UPP],
  ["en pil på 1 m räknas som pil", "export const KORUPP_MIN_M = 8;", "export const KORUPP_MIN_M = 1;", UPP],
  ["starten snäpper till vägar 100 px bort", "export const KORUPP_SNAPP_PX = 32;", "export const KORUPP_SNAPP_PX = 100;", UPP],
  ["skördaren ser pilar 500 m bort", "export const KORUPP_SYNLIG_M = 80;", "export const KORUPP_SYNLIG_M = 500;", UPP],
  ["skotaren ser alla kör upp-pilar (ingen 80 m)", "if (!pos) return [];\n  return pilar.filter((p) => avstandTillLinjeM(pos, [p.start, p.slut]) <= radieM)", "if (!pos || lage === 'skotare') return pilar.filter(() => true);\n  return pilar.filter((p) => avstandTillLinjeM(pos, [p.start, p.slut]) <= radieM)", UPP],
  ["kör upp-linjen följer zoomen igen", "'line-width': KORUPP_LINJE_PX }", "'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 19, 12] }", UPP],
  ["båda spetsarna pekar åt samma håll", "riktning: (riktning + 180) % 360", "riktning", UPP],
  ["texten på kortet nämner inte skälet", "return ord ? `${ord} – kör upp mot gränsen och backa tillbaka` :", "return ord ? 'Kör upp mot gränsen och backa tillbaka' :", UPP],
  // ── två tryck (lib/tvaTryck) ──
  ["andra trycket nära starten räknas som slut (träd)", "export const TRAD_MIN_M = 2;", "export const TRAD_MIN_M = 0;", TVA],
  ["starten snäpper aldrig till en väg", "if (snapp) { pos = snapp.punkt; vagId = snapp.id; }", "", TVA],
  ["ingen förhandsvisning mellan trycken", "if (start && e?.lngLat) hamta().onForhandsvisning({ slag, start: start.start, slut: llFran(e) });", "", TVA],
  ["fingret ger ingen förhandsvisning", "  map.on('touchstart', visa);\n", "", TVA],
  ["två snabba fingertryck zoomar i stället (dubbeltrycks-zoomen kvar)", "  map.doubleClickZoom?.disable();\n", "", TVA],
  ["trädets riktning räknas från slutet mot stubben", "vinkel: vinkelFranPunkt(s.start, slut)", "vinkel: vinkelFranPunkt(slut, s.start)", TVA],
  ["pilen glömmer vilken väg den börjar på", "slut, vagId: s.vagId", "slut, vagId: null", TVA],
  ["starten ligger kvar efter andra trycket", "    const s = start;\n    start = null;", "    const s = start;", TVA],
  ["tvåtrycks-lyssnaren är inte märkt (spärren tystar den)", "const onKlick = tillatIRitlage((e: any) => {", "const onKlick = ((e: any) => {", TVA],
  // ── ritläges-spärren ──
  ["spärren är alltid av", "if (arAktivt()) return undefined;", "", SPARR],
  ["märkta lyssnare slås in och tystas också", "if (typeof fn !== 'function' || arTillatenIRitlage(fn)) return fn;", "if (typeof fn !== 'function') return fn;", SPARR],
  ["lagerlyssnare slås inte in", "return typeof a === 'function' ? [slaIn(a), b] : [a, slaIn(b)];", "return typeof a === 'function' ? [slaIn(a), b] : [a, b];", SPARR],
  ["dubbelklick spärras inte", "new Set(['click', 'dblclick'])", "new Set(['click'])", SPARR],
  ["off hittar inte den inslagna lyssnaren", "  map.off = function (this: unknown, typ: any, a?: any, b?: any) {\n    const [x, y] = ompaketera(typ, a, b);", "  map.off = function (this: unknown, typ: any, a?: any, b?: any) {\n    const [x, y] = [a, b];", SPARR],
  ["spärren läggs aldrig på kartan", "installeraRitlageSparr(map, () => ritlageSparrRef.current);", "", SIDA],
  ["pilläget räknas inte som ritläge", "ritlageSparrRef.current = isDrawMode || isZoneMode || isArrowMode ||", "ritlageSparrRef.current = isDrawMode || isZoneMode ||", SIDA],
  ["plusdockan räknas som ritläge (kan inte stängas med ett tryck)", "    || larmPlacering || risaMarkMode || !!selectedSymbol || !!figur;\n  const kartLageIgang", "    || larmPlacering || risaMarkMode || !!selectedSymbol || !!figur || plusRadOppen;\n  const kartLageIgang", SIDA],
  ["mätningens klick är inte märkt (tystas i mätläget)", "const onClick = tillatIRitlage((e: any) => {\n      const ll = e?.lngLat;\n      if (!ll) return;\n      const geo", "const onClick = ((e: any) => {\n      const ll = e?.lngLat;\n      if (!ll) return;\n      const geo", SIDA],
  ["symbol-/larmplaceringens klick är inte märkt", "const onClick = tillatIRitlage((e: any) => {\n      if (larmPlacering) {", "const onClick = ((e: any) => {\n      if (larmPlacering) {", SIDA],
  // ── sidan ──
  ["de gamla pilarnas lager får trädet", "m.isArrow && !arFallTrad(m) && !arKorUpp(m)) : [];", "m.isArrow) : [];", SIDA],
  ["skotaren får samma läge som skördaren", "const lage = !korvyActive ? 'planering' : skotarKorvy ? 'skotare' : 'skordare';", "const lage = !korvyActive ? 'planering' : 'skordare';", SIDA],
  ["ringen sitter kvar på trädet i körvyn", "valdId: lage === 'planering' && markerMenuOpen != null ? String(markerMenuOpen) : null", "valdId: markerMenuOpen != null ? String(markerMenuOpen) : null", SIDA],
  ["trädets kort saknar rattet", "{marker.isArrow && !arKorUpp(marker) && (", "{marker.isArrow && !arFallTrad(marker) && !arKorUpp(marker) && (", SIDA],
  ["Godkänn glömmer att ta bort de gamla pilarna", "bortMarkorer.forEach((m) => deleteMarkerFromDb(m.id));\n              setIsArrowMode(false); setArrowType(null);\n            } },", "setIsArrowMode(false); setArrowType(null);\n            } },", SIDA],
  // ── instruktionskortet ──
  ["kör upp-pilen ger ingen instruktion", "if (arKorUpp(m)) {\n      const k = korUppUr(m);\n      if (!k) continue;", "if (false as boolean) {\n      const k = korUppUr(m)!;\n      if (!k) continue;", INSTR],
];

kor({
  filer: [TRAD, UPP, TVA, SPARR, SIDA, INSTR],
  tester: TESTER,
  standardFil: TRAD,
  mutationer: M,
});
