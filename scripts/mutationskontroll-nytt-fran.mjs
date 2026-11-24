// Mutationskontroll för "Nytt från …" (Martin 2026-11-24): varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-nytt-fran.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const MODELL = "lib/nyttFranPlaneraren.ts";
const HOOK = "lib/hooks/useNyttFranPlaneraren.ts";
const SYNK = "lib/hooks/useMarkeringarSynk.ts";
const KOMM = "lib/hooks/useKartkommentarer.ts";
const SIDA = "app/planering/page.tsx";
const RAD = "components/planering/NyttFranRad.tsx";

const TESTER = [
  "lib/nyttFranPlaneraren.test.ts",
  "lib/hooks/useNyttFranPlaneraren.test.tsx",
  "lib/hooks/useMarkeringarSynk.forfattare.test.tsx",
  "lib/nyttFranPlaneraren.vakter.test.ts",
  "components/planering/NyttFranRad.render.test.tsx",
];

const M = [
  // ── modellen ──
  ["min egen markering räknas som nytt", "if (minId && m.andradAv && String(m.andradAv) === String(minId)) continue;   // mitt eget", "", MODELL],
  ["en ändrad markering (nyare tid) räknas inte", "const andrad = !fanns || ts > (bas.get(id) ?? 0);", "const andrad = !fanns;", MODELL],
  ["en ny markering räknas inte", "const andrad = !fanns || ts > (bas.get(id) ?? 0);", "const andrad = fanns && ts > (bas.get(id) ?? 0);", MODELL],
  ["min egen kommentar räknas som nytt", "if (minId && r.skapad_av && String(r.skapad_av) === String(minId)) return false;", "", MODELL],
  ["en ändrad kommentar räknas inte", "return !bas.has(r.id) || bas.get(r.id) !== kommentarTid(r);", "return !bas.has(r.id);", MODELL],
  ["ostämplad rad får inget avsändarnamn", "av: forenamn(m.andradAvNamn) ?? NYTT_OKAND_AVSANDARE,", "av: forenamn(m.andradAvNamn) ?? '',", MODELL],
  ["maskinnamn kortas till första ordet", "if (/\\d/.test(hel)) return hel.replace(/\\s+/g, ' ');", "", MODELL],
  ["maskinkonto utan förare får inget namn", "if (i.konto?.roll === 'maskin') return maskin || 'Maskinen';", "if (i.konto?.roll === 'maskin') return maskin;", MODELL],
  ["upplåst förare går inte före maskinen", "if (forare) return forare;", "", MODELL],
  ["Viktigt ger inte gul ton", "ton: viktigt ? 'viktigt' : 'neutral', plats", "ton: 'neutral', plats", MODELL],
  ["fara ger inte röd ton", "ton: arFaraMarkering(m) ? 'fara' : 'neutral', plats", "ton: 'neutral', plats", MODELL],
  ["fara går inte före Viktigt", "(ps.some((p) => p.ton === 'fara') ? 'fara' : ps.some((p) => p.ton === 'viktigt') ? 'viktigt' : 'neutral')", "(ps.some((p) => p.ton === 'viktigt') ? 'viktigt' : ps.some((p) => p.ton === 'fara') ? 'fara' : 'neutral')", MODELL],
  ["avståndet saknas i raden", "return `Nytt från ${p.av}: ${p.rubrik}${p.detalj ? ` – ${p.detalj}` : ''}${avst ? `, ${avst}` : ''}`;", "return `Nytt från ${p.av}: ${p.rubrik}${p.detalj ? ` – ${p.detalj}` : ''}`;", MODELL],
  ["flera ändringar blir inte en rad", "if (ps.length === 1) {", "if (ps.length >= 1) {", MODELL],
  ["samma sak ändrad igen ersätter inte sin post", "!nya.some((n) => n.nyckel === p.nyckel)", "true", MODELL],
  ["poster äldre än 2 min stannar kvar", "nu - p.nar <= NYTT_GRUPP_MS && !nya", "!nya", MODELL],
  ["avstånd avrundas inte till 10 m", "return `${Math.max(10, Math.round(m / 10) * 10)} m`;", "return `${Math.round(m)} m`;", MODELL],

  // ── hooken ──
  ["raden visas utan baslinje (allt är nytt vid start)", "if (!s.bas) { s.bas = markeringsBaslinje(markers); return; }", "if (!s.bas) { s.bas = new Map(); }", HOOK],
  ["den sparade bilden räknas som baslinje", "if (!farsk) return;\n    const s = markBas.current;", "const s = markBas.current;", HOOK],
  ["raden visas när körvyn är av", "if (!nya.length || !inRef.current.aktiv) return;", "if (!nya.length) return;", HOOK],
  ["raden försvinner aldrig av sig själv", "timer.current = setTimeout(() => { timer.current = null; setSynlig(false); }, NYTT_RAD_MS);", "", HOOK],
  ["tryck på raden visar ingenting", "try { inRef.current.onVisa(forsta); } catch { /* kartan är borta */ }", "", HOOK],
  ["tryck visar alla på en gång (inte i tur och ordning)", "if (kvar.length <= 1) {", "if (true) {", HOOK],
  ["objektbyte nollställer inte baslinjen", "markBas.current = { objekt: i.objektId, bas: null };", "", HOOK],
  ["kommentarernas baslinje tas från förra objektets rader", "if (s.vantaFalse) return;", "", HOOK],
  ["kommentarer ger ingen rad", "lagg(nya.map((r) => kommentarPost(r, inRef.current.nyckelPlats(r.yta_nyckel), t)));", "", HOOK],

  // ── stämpeln och realtime ──
  ["markeringen skrivs utan författare", "(f ? stampla(marker, f) : marker) as any", "marker as any", SYNK],
  ["stämpeln hamnar i minnets markering (ser ändrad ut för alltid)", "const json = JSON.stringify(marker);", "const json = JSON.stringify(stampla(marker, inRef.current.forfattare?.() ?? { id: null, namn: '' }));", SYNK],
  ["kommentarerna prenumererar inte på realtime", "if (!live || !idNyckel) return;", "return;", KOMM],
  ["reserven (omläsning varje minut) saknas", "const iv = reservMs > 0 ? setInterval", "const iv = false ? setInterval", KOMM],
  ["realtime lyssnar bara på INSERT", "for (const event of ['INSERT', 'UPDATE'] as const)", "for (const event of ['INSERT'] as const)", KOMM],

  // ── sidan och raden ──
  ["raden visas även i planeringsvyn", "aktiv: korvyActive,\n    minId: currentMedarbetare?.id ?? null,\n    kommentarer: kk.rader,", "aktiv: true,\n    minId: currentMedarbetare?.id ?? null,\n    kommentarer: kk.rader,", SIDA],
  ["markeringarna matas inte efter en hämtning", "nyttHamtadRef.current(laddade, farsk);", "", SIDA],
  ["kommentarerna går inte på realtime i körvyn", "live: korvyActive || maskinlage,", "live: false,", SIDA],
  ["pulsen varar inte 5 s", "ytaPulsTimerRef.current = setTimeout(() => setYtaPuls(null), NYTT_PULS_MS);", "ytaPulsTimerRef.current = setTimeout(() => setYtaPuls(null), 500);", SIDA],
  ["kameran hoppar tillbaka till maskinen efter flygningen", "setKorvyFollowPaused(true);   // annars hoppar kameran", "// annars hoppar kameran", SIDA],
  ["larmkortet läggs över raden", "const nyttRadH = korvyActive && nyttFran.rad ? NYTT_RAD_HOJD_PX + AVSTAND.s : 0;", "const nyttRadH = 0;", SIDA],
  ["raden är gul för fara", "fara: { bg: FARG.rod, fg: FARG.text, kant: FARG.rod },", "fara: { bg: FARG.gul, fg: FARG.bg, kant: FARG.gul },", RAD],
];

kor({ filer: [MODELL, HOOK, SYNK, KOMM, SIDA, RAD], tester: TESTER, standardFil: MODELL, mutationer: M });
