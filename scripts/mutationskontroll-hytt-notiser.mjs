// Mutationskontroll för "Notiser i hytten" (Martin 2026-10-24): Windows-notis för fara, besök och område när appen inte är framme, testnotisen och brytaren i Inställningar,
// knapparna i service workern, och serverdelen (pushen till planeringen efter 10 min + raden per maskin på besökssidan).
// Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-hytt-notiser.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const NOT = "lib/hytt/notiser.ts";
const FON = "lib/hytt/notisFonster.ts";
const INS = "lib/hytt/notisInstallning.ts";
const RAP = "lib/hytt/notisRapport.ts";
const HOOK = "lib/hooks/useHyttNotiser.ts";
const BHOOK = "lib/hooks/useBesokHytt.ts";
const SW = "public/sw.js";
const EJ = "lib/besok/ejsett.ts";
const EJKO = "lib/besok/ejsett-ko.ts";
const MASK = "lib/besok/maskinerPaBesok.ts";
const STAT = "lib/besok/status.ts";
const SERV = "lib/besok/server.ts";
const KONST = "lib/besok/konstanter.ts";
const SIDA = "app/planering/page.tsx";
const FLUSH = "app/api/notis/flush/route.ts";
const KORT = "components/planering/HyttNotiserKort.tsx";

const TESTER = [
  "lib/hytt/notiser.test.ts",
  "lib/hytt/notisRapport.test.ts",
  "lib/hytt/swHytt.test.ts",
  "lib/hytt/hytt.vakter.test.ts",
  "lib/hooks/useHyttNotiser.test.tsx",
  "lib/hooks/useBesokHytt.test.tsx",
  "components/planering/HyttNotiserKort.render.test.tsx",
  "lib/besok/ejsett.test.ts",
  "lib/besok/server.test.ts",
  "components/besok/Besok.render.test.tsx",
];

const M = [
  // ── vad som ger notis ──
  ["fönstret räknas som framme bara för att det syns", "return i.visibilityState === 'visible' && i.harFokus === true ? 'framme' : 'borta';", "return i.visibilityState === 'visible' ? 'framme' : 'borta';", FON],
  ["appen räknas alltid som borta", "const borta = i.lage === 'borta';", "const borta = true;", NOT],
  ["alla larmgrupper ger notis, inte bara Röd", "return [kort, ...fler].flatMap((l) => (l && l.grupp === 'fara'", "return [kort, ...fler].flatMap((l) => (l", NOT],
  ["yttexten 'Du är inne i ytan' upprepas i notisen", "text: l.kalla === 'yta' ? null : l.text }]", "text: l.text }]", NOT],
  ["skördaren får skotarens ledningsregel", "if (roll === 'skordare') return 'Fäll inte mot ledningen';", "if (roll === 'skotare') return 'Fäll inte mot ledningen';", NOT],
  ["faran försvinner ur notisen efter ett tag", "kvarTillTryck: true, renotify: false, knappar: [{ action: 'visa', title: 'Visa på kartan' }],", "kvarTillTryck: false, renotify: false, knappar: [{ action: 'visa', title: 'Visa på kartan' }],", NOT],
  ["samma fara ger en notis varje gång", "if (state.fara[f.id]) continue;", "if (false) continue;", NOT],
  ["en ny inkörning ger ingen ny notis", "for (const id of Object.keys(state.fara)) if (!naraId.has(id)) delete state.fara[id];", "", NOT],
  ["besöksnotisen saknar Uppfattat", "knappar: [{ action: 'uppfattat', title: 'Uppfattat' }, { action: 'visa', title: 'Öppna kartan' }],\n    data: { hytt: true, typ: 'besok'", "knappar: [{ action: 'visa', title: 'Öppna kartan' }],\n    data: { hytt: true, typ: 'besok'", NOT],
  ["besöksnotisen säger inte att man ska stänga av", "`${a.trakt ? `${a.trakt} · ` : ''}Stäng av när du ser hen`", "`${a.trakt ? `${a.trakt} · ` : ''}Besök`", NOT],
  ["påminnelsen kommer aldrig för en notis som ligger uppe", "} else if (s.forst != null && !s.paminnd && i.nu - s.forst >= BESOK_NOTIS_PAMINNELSE_MIN * 60000) {", "} else if (false) {", NOT],
  ["påminnelsen upprepas varje varv", "      visa.push(besokNotis(b, { trakt: i.trakt, maskinId: i.maskinId, test: i.test, url: i.url, nu: new Date(i.nu), paminnelse: true }));\n      s.paminnd = true;", "      visa.push(besokNotis(b, { trakt: i.trakt, maskinId: i.maskinId, test: i.test, url: i.url, nu: new Date(i.nu), paminnelse: true }));", NOT],
  ["påminnelsen kommer efter 1 minut", "export const BESOK_NOTIS_PAMINNELSE_MIN = 5;", "export const BESOK_NOTIS_PAMINNELSE_MIN = 1;", KONST],
  ["notisen ligger kvar fast appen är framme igen", "if (s.visad) { stang.push(`besok-${b.id}`); s.visad = false; }", "if (s.visad) { s.visad = false; }", NOT],
  ["samma yta ger en notis varje gång", "if (borta && !state.omrade[nyckel])", "if (borta)", NOT],
  ["ändrad instruktionstext ger ingen ny notis", "`${o.nyckel}|${o.instruktioner.map((x) => x.hash).join(',')}`;", "`${o.nyckel}`;", NOT],
  ["områdesnotisen får en knapp", "kvarTillTryck: true, renotify: false, knappar: [], data: { hytt: true, typ: 'omrade', url },", "kvarTillTryck: true, renotify: false, knappar: [{ action: 'visa', title: 'Visa' }], data: { hytt: true, typ: 'omrade', url },", NOT],
  ["fara skapas först i stället för sist", "{ omrade: 0, besok: 1, fara: 2, test: 3 }", "{ omrade: 2, besok: 1, fara: 0, test: 3 }", NOT],

  // ── hooken ──
  ["hooken är aktiv fast brytaren är av", "if (!a.aktiv) return;\n    const i = inRef.current;", "const i = inRef.current;", HOOK],
  ["klockan tickar var 10:e minut (påminnelsen dröjer)", "export const NOTIS_TICK_MS = 15000;", "export const NOTIS_TICK_MS = 600000;", HOOK],
  ["notiserna stängs inte när föraren är tillbaka i appen", "if (uppeRef.current) { uppeRef.current = false; await stangHyttNotiser(); }", "", HOOK],
  ["notiserna ligger kvar när brytaren slås av", "if (uppeRef.current) { uppeRef.current = false; void stangHyttNotiser(); }", "", HOOK],
  ["byte till annat program (blur) märks inte", "window.addEventListener('blur', las);", "", HOOK],
  ["fönstret läses inte vid synlighetsbyte", "document.addEventListener('visibilitychange', las);\n    window.addEventListener('focus', las);", "window.addEventListener('focus', las);", HOOK],
  ["brytaren följer inte ändringar", "window.addEventListener('hytt-notiser-andrad', las);\n    window.addEventListener('storage', las);", "window.addEventListener('storage', las);", HOOK],

  // ── besök i bakgrunden ──
  ["besöken läses inte med dolt fönster", "if (bakgrundRef.current || document.visibilityState === 'visible') las();", "if (document.visibilityState === 'visible') las();", BHOOK],
  ["ljud i appen även i bakgrunden", "if (nya.length && ljudRef.current && document.visibilityState === 'visible')", "if (nya.length && ljudRef.current)", BHOOK],
  ["Uppfattat från notisen märks inte i kortet", "if (!d || d.typ !== 'hytt-uppfattat' || typeof d.besokId !== 'string') return;", "return;", BHOOK],

  // ── service workern ──
  ["testnotisens Uppfattat kvitterar på riktigt", "if (data.typ === 'test') {", "if (false) {", SW],
  ["testläget följer inte med till servern", "...(data.test ? { testlage: true } : {})", "", SW],
  ["servern säger nej men workern tror ändå att det gick", "if (r.ok && j && j.ok) {", "if (true) {", SW],
  ["Uppfattat öppnar aldrig appen vid fel", "  await oppnaApp(mal);\n}\n\nself.addEventListener", "}\n\nself.addEventListener", SW],

  // ── Inställningar ──
  ["brytaren är PÅ från början", "return localStorage.getItem(PA_NYCKEL) === 'pa';", "return localStorage.getItem(PA_NYCKEL) !== 'av';", INS],
  ["brytaren går att slå på utan ett lyckat test", "r.skickad != null && r.uppfattat != null", "r.skickad != null || r.uppfattat != null", RAP],
  ["Chromes bakgrundsinställning ser ut som Ok", "id: 'chrome-bakgrund', rubrik: 'Chrome kör i bakgrunden', status: 'kolla',", "id: 'chrome-bakgrund', rubrik: 'Chrome kör i bakgrunden', status: 'ok',", RAP],
  ["en fixbar sak räknas inte i rubriken", "return rader.filter((r) => r.status === 'fixa').length;", "return 0;", RAP],
  ["brytaren kan slås på utan test i kortet", "disabled={!kanPa && !pa}", "disabled={false}", KORT],

  // ── kopplingen i planeringsvyn ──
  ["notiser körs utanför maskinläget", "aktiv: instruktionerAktiv && hyttNotiserPa,", "aktiv: hyttNotiserPa,", SIDA],
  ["besöken läses alltid i bakgrunden", "bakgrund: hyttNotiserPa,", "bakgrund: true,", SIDA],
  ["inga faror matas in", "fara: farorUrLarm(larm.kort, larm.fler),", "fara: [],", SIDA],
  ["kortet i Inställningar visas på alla enheter", "{webSerialStott && <HyttNotiserKort />}", "<HyttNotiserKort />", SIDA],

  // ── servern: maskinen har inte sett besöket ──
  ["pushen efter 1 minut i stället för 10", "export const BESOK_EJ_SETT_ADMIN_MIN = 10;", "export const BESOK_EJ_SETT_ADMIN_MIN = 1;", KONST],
  ["klockan börjar vid anmälan även för i morgon", "return Math.max(skapad, tid - BESOK_KLOCKA_FORE_MIN * 60000);", "return skapad;", EJ],
  ["maskinen som kvitterat varnas ändå", "if (sett.has(`${b.id}|${m.maskinId}`)) continue;", "", EJ],
  ["besök som är över ger push", "    if (!arBesokAktivt(b.besokstid, nu)) continue;\n    const start = klockStart(b);", "    const start = klockStart(b);", EJ],
  ["pushen skickas fast maskinen hunnit kvittera", "if (rad.sett) return { typ: 'hoppa_over'", "if (false) return { typ: 'hoppa_over'", EJ],
  ["avslutat objekt ger push", "if (rad.objekt.status === 'avslutat' || rad.objekt.status === 'klar') return { typ: 'hoppa_over'", "if (false) return { typ: 'hoppa_over'", EJ],
  ["gammal köad push skickas", "if (Number.isFinite(koad) && nu - koad > EJ_SETT_MAX_ALDER_MS)", "if (false)", EJ],
  ["läsfel skickas som om inget hänt", "if (fel) return { typ: 'uppskjut' };", "", EJ],
  ["avslutade objekt köas", "filter((x) => x.status !== 'avslutat' && x.status !== 'klar')", "filter(() => true)", EJKO],
  ["en inaktiv planerare får pushen", "filter((x) => x.aktiv !== false)", "filter(() => true)", EJKO],
  ["gammalt hyttspår räknas som 'på trakten'", "if (Number.isFinite(t) && t >= gräns) lagg(r.objekt_id, r.maskin_id);", "if (Number.isFinite(t)) lagg(r.objekt_id, r.maskin_id);", MASK],
  ["tilldelade maskiner räknas inte", "for (const r of (o.data ?? []) as { id: string; skordare_maskin_id: string | null; skotare_maskin_id: string | null }[]) { lagg(r.id, r.skordare_maskin_id); lagg(r.id, r.skotare_maskin_id); }", "", MASK],
  ["maskin utan känd roll räknas", "if (roll) reg.set(", "reg.set(", MASK],
  ["flush köar aldrig pushen", "const es = await koaBesokEjSett(supabase);", "const es = { ok: true } as any;", FLUSH],
  ["flush bygger inte texten färskt", "arBesokEjSett(n.typ) ? await byggEjSettNotis(n, hamtaEjSett)", "arBesokEjSett(n.typ) ? await byggEjSettNotis(n, async () => ({ rad: null }))", FLUSH],

  // ── besökssidan: en rad per maskin ──
  ["raden säger inte åt besökaren att ringa", "export const EJ_SETT_TEXT = 'Föraren har inte sett dig än – gå inte in, ring oss';", "export const EJ_SETT_TEXT = 'Föraren har inte sett dig än';", STAT],
  ["en sedd maskin ser ut som en som inte sett", "m.tid ? { text: `✓ ${m.etikett} har sett att du kommer`, sett: true }", "m.tid ? { text: `${m.etikett}`, sett: false }", STAT],
  ["maskinen som kvitterat utan att höra till listan försvinner", "if (!med.has(x.maskin_id)) maskiner.push(", "if (false) maskiner.push(", SERV],
];

kor({
  filer: [NOT, FON, INS, RAP, HOOK, BHOOK, SW, EJ, EJKO, MASK, STAT, SERV, KONST, SIDA, FLUSH, KORT],
  tester: TESTER,
  standardFil: NOT,
  mutationer: M,
});
