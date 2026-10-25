// Mutationskontroll för fällträd och kör upp och backa (2026-10-25). Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
// Tungt (Chromium-testet ingår): kör EN åt gången — inte tillsammans med tsc, build eller en dev-server.
//
// Kör:  node scripts/mutationskontroll-falltrad.mjs
import { kor } from "./mutationsmotor.mjs";

const TRAD = "lib/fallTrad.ts";
const UPP = "lib/korUpp.ts";
const GEST = "lib/fallTradGester.ts";
const SIDA = "app/planering/page.tsx";
const INSTR = "lib/instruktioner/instruktioner.ts";

const TESTER = [
  "lib/fallTrad.test.ts",
  "lib/korUpp.test.ts",
  "lib/fallTradKorUpp.vakter.test.ts",
  "lib/fallTradKorUpp.hytt.test.ts",
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
  ["trädet är dubbelt så långt som det ska", "TRAD_LANGD_M / (TRAD_TOPP_PX", "(TRAD_LANGD_M * 2) / (TRAD_TOPP_PX", TRAD],
  ["stubben sitter inte på trädets plats (offset borta)", "'icon-anchor': 'bottom', 'icon-offset': [0, TRAD_BILD_MATT.pad],", "'icon-anchor': 'bottom',", TRAD],
  ["handtaget träffas på 60 px", "export const TRAD_HANDTAG_TRAFF_PX = 30;", "export const TRAD_HANDTAG_TRAFF_PX = 60;", TRAD],
  // ── förslaget ur de gamla pilarna ──
  ["körriktningspilar föreslås också bli träd", "m.arrowType === 'fellingdirection';", "(m.arrowType === 'fellingdirection' || m.arrowType === 'drivedirection');", TRAD],
  ["trädet får inte pilens riktning", "angle: p.vinkel, fran: p.id", "angle: 0, fran: p.id", TRAD],
  // ── kör upp och backa ──
  ["ordet visas även när skälet är Inget", "(skal && skal !== 'inget' && arSkal(skal) ? skalNamn(skal) : null)", "(skal && arSkal(skal) ? skalNamn(skal) : null)", UPP],
  ["en pil på 1 m räknas som pil", "export const KORUPP_MIN_M = 8;", "export const KORUPP_MIN_M = 1;", UPP],
  ["starten snäpper till vägar 100 px bort", "export const KORUPP_SNAPP_PX = 32;", "export const KORUPP_SNAPP_PX = 100;", UPP],
  ["skördaren ser pilar 500 m bort", "export const KORUPP_SYNLIG_M = 80;", "export const KORUPP_SYNLIG_M = 500;", UPP],
  ["skotaren ser alla kör upp-pilar (ingen 80 m)", "if (!pos) return [];\n  return pilar.filter((p) => avstandTillLinjeM(pos, [p.start, p.slut]) <= radieM)", "if (!pos || lage === 'skotare') return pilar.filter(() => true);\n  return pilar.filter((p) => avstandTillLinjeM(pos, [p.start, p.slut]) <= radieM)", UPP],
  ["båda spetsarna pekar åt samma håll", "riktning: (riktning + 180) % 360", "riktning", UPP],
  ["texten på kortet nämner inte skälet", "return ord ? `${ord} – kör upp mot gränsen och backa tillbaka` :", "return ord ? 'Kör upp mot gränsen och backa tillbaka' :", UPP],
  // ── gesterna ──
  ["ett tryck nära en väg räknas som pil (längden mäts från vägen)", "korUppLangdM({ start: r.fingret, slut: r.slut })", "korUppLangdM({ start: r.start, slut: r.slut })", GEST],
  ["kartan panorerar medan pilen dras", "fingret: llFran(p), vagId: snapp ? snapp.id : null, slut: llFran(p) };\n      map.dragPan.disable();", "fingret: llFran(p), vagId: snapp ? snapp.id : null, slut: llFran(p) };", GEST],
  ["träden går att vrida även i körvyn", "if (!nu.redigerbara) return;", "", GEST],
  ["kartan panorerar medan trädet vrids", "vrid = { id: t.id, stubbe: t.stubbe, senaste: t.vinkel }; map.dragPan.disable(); return;", "vrid = { id: t.id, stubbe: t.stubbe, senaste: t.vinkel }; return;", GEST],
  ["släppet sparar aldrig vinkeln", "map.dragPan.enable(); hamta().onVrid(v.id, v.senaste, true);", "map.dragPan.enable();", GEST],
  // ── sidan ──
  ["de gamla pilarnas lager får trädet", "m.isArrow && !arFallTrad(m) && !arKorUpp(m)) : [];", "m.isArrow) : [];", SIDA],
  ["skotaren får samma läge som skördaren", "const lage = !korvyActive ? 'planering' : skotarKorvy ? 'skotare' : 'skordare';", "const lage = !korvyActive ? 'planering' : 'skordare';", SIDA],
  ["körvyn kan vrida träd", "redigerbara: !korvyActive && !!valtObjekt?.id,", "redigerbara: !!valtObjekt?.id,", SIDA],
  ["Godkänn glömmer att ta bort de gamla pilarna", "bortMarkorer.forEach((m) => deleteMarkerFromDb(m.id));\n              setIsArrowMode(false); setArrowType(null);\n            } },", "setIsArrowMode(false); setArrowType(null);\n            } },", SIDA],
  ["ett tryck i kör upp-läget lägger en pil", "if (isArrowMode && arrowType === KORUPP_TYP) return;   // kör upp och backa DRAS från vägen (useFallOchKorUpp) — ett tryck gör ingenting\n", "", SIDA],
  // ── instruktionskortet ──
  ["kör upp-pilen ger ingen instruktion", "if (arKorUpp(m)) {\n      const k = korUppUr(m);\n      if (!k) continue;", "if (false as boolean) {\n      const k = korUppUr(m)!;\n      if (!k) continue;", INSTR],
];

kor({
  filer: [TRAD, UPP, GEST, SIDA, INSTR],
  tester: TESTER,
  standardFil: TRAD,
  mutationer: M,
});
