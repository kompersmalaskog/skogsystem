// Mutationskontroll för "Besök på trakten" (Martin 2026-10-22): SMS till markägaren, besökssidan med säkerhetsreglerna, anmälan och "Uppfattat" i hytten, loggen och påminnelsen.
// Varje regel ska bli RÖD när EN sak ändras tillbaka. Motorn: scripts/mutationsmotor.mjs. Databasens egna regler (RLS, triggers, funktioner) provas av supabase/tests/besok_lokal/kor.sh.
//
// Kör:  node scripts/mutationskontroll-besok.mjs   (EN tung körning åt gången: inte tillsammans med tsc/build/dev-server)
import { kor } from "./mutationsmotor.mjs";

const KONST = "lib/besok/konstanter.ts";
const OFF = "lib/besok/offentlig.ts";
const SMS = "lib/besok/sms.ts";
const TID = "lib/besok/tid.ts";
const SAK = "lib/besok/sakerhet.ts";
const FRAM = "lib/besok/framsteg.ts";
const PAM = "lib/besok/paminnelse.ts";
const HYTT = "lib/besok/hytt.ts";
const STAT = "lib/besok/status.ts";
const SERV = "lib/besok/server.ts";
const PLAN = "lib/besok/planerare.ts";
const KLIENT = "components/besok/BesokKlient.tsx";
const KORT = "components/besok/BesokKortHytt.tsx";
const PLANKORT = "components/besok/BesokPlanerare.tsx";
const HOOK = "lib/hooks/useBesokHytt.ts";
const SIDA = "app/planering/page.tsx";
const MW = "middleware.ts";
const RAMVERK = "components/AppRamverk.tsx";
const MIGR = "supabase/migrations/20261022170000_besok_pa_trakten.sql";

const TESTER = [
  "lib/besok/logik.test.ts",
  "lib/besok/server.test.ts",
  "lib/besok/besok.vakter.test.ts",
  "lib/hooks/useBesokHytt.test.tsx",
  "components/besok/Besok.render.test.tsx",
];

const M = [
  // ── adresserna som är öppna utan inloggning ──
  ["token på 8 tecken räcker", "export const TOKEN_MIN_TECKEN = 32;", "export const TOKEN_MIN_TECKEN = 8;", KONST],
  ["API:t har fler öppna underrutter än anmal och karta", "(?:/(?:anmal|karta))?/?$", "(?:/[a-z]+)?/?$", OFF],
  ["sidan öppnar alla undersidor", "const SIDA = new RegExp(`^/besok/${TOKEN}/?$`);", "const SIDA = new RegExp(`^/besok/${TOKEN}`);", OFF],
  ["middleware släpper inte igenom besökssidan", "if (arOffentligBesokSokvag(request.nextUrl.pathname)) {", "if (false) {", MW],
  ["besökssidan blir indexerbar via middleware", "oppen.headers.set('X-Robots-Tag', 'noindex, nofollow');", "", MW],
  ["appens toppfält och köer renderas på besökssidan", "if (arBesoksSida(pathname)) return <>{children}</>", "if (false) return <>{children}</>", RAMVERK],

  // ── konstanter ──
  ["skördarens ring 50 m (huvudregeln säger 70)", "skordare: 70, skotare: 20, motorsag: 40", "skordare: 50, skotare: 20, motorsag: 40", KONST],
  ["hytten läser var 8:e sekund", "export const HYTT_POLL_MS = 4000;", "export const HYTT_POLL_MS = 8000;", KONST],
  ["besöket är aktivt bara 30 min efter tiden", "export const BESOK_EFTERTID_MIN = 120;", "export const BESOK_EFTERTID_MIN = 30;", KONST],
  ["ingen gräns för anmälningar per timme", "export const BESOK_MAX_PER_TIMME = 20;", "export const BESOK_MAX_PER_TIMME = 100000;", KONST],
  ["hyttens ring är 40 m", "export const HYTT_RING_M = 70;", "export const HYTT_RING_M = 40;", KONST],

  // ── SMS till markägaren ──
  ["planerad start i morgon blir 'i dag'", "if (d === 1) return 'i morgon';", "if (d === 1) return 'i dag';", SMS],
  ["saknat namn ger 'Hej undefined!'", "mark ? `Hej ${mark}!` : 'Hej!',", "`Hej ${mark}!`,", SMS],
  ["bolag och dödsbon får ett förnamn", "if (!s || BOLAGSORD.test(s)) return null;", "if (!s) return null;", SMS],
  ["saknad telefon blir en tom rad", "...(tel ? [tel] : []),", "tel,", SMS],
  ["säkerhetsmeningen i SMS:et tappar 'aldrig'", "Gå aldrig fram till en maskin som arbetar förrän föraren har sett dig och stannat.", "Gå fram till en maskin som arbetar förrän föraren har sett dig och stannat.", SMS],
  ["maskinen har redan startat men texten säger 'i morgon'", "const startad = a.status === 'pagaende' || a.status === 'skotning' ||", "const startad = a.status === 'skotning' ||", SMS],
  ["saknad fastighet ger 'på din fastighet null'", "${fast ? `på din fastighet ${fast}` : 'i din skog'}", "på din fastighet ${fast}", SMS],

  // ── tider ──
  ["ett klockslag som passerat räknas som idag", "if (utc < nu.getTime() - 15 * 60000)", "if (utc < nu.getTime() - 100 * 3600000)", TID],
  ["en anmälan veckor framåt godtas", "t <= nu.getTime() + BESOK_MAX_FRAMAT_H * 3600000", "t <= nu.getTime() + BESOK_MAX_FRAMAT_H * 3600000 * 100", TID],
  ["ett besök är aktivt före sin tid men aldrig efter", "nu.getTime() <= t + BESOK_EFTERTID_MIN * 60000", "nu.getTime() >= t + BESOK_EFTERTID_MIN * 60000", TID],

  // ── säkerhetsreglerna ──
  ["skotarraden visas utan skotare", "if (a.roller.includes('skotare')) rader.push(", "if (true) rader.push(", SAK],
  ["skotarraden öppnar inget ark", "mellan skotaren och virkeshögen', ark: true }", "mellan skotaren och virkeshögen', ark: false }", SAK],
  ["motorsågsraden visas alltid", "if (a.harMotorsag) rader.push(", "if (true) rader.push(", SAK],
  ["huvudregelns andra steg byts ut", "'Vinka – vänta tills föraren stängt av'", "'Vinka'", SAK],
  ["arkets mening ändras", "När skotaren backar med lass ser föraren ingenting bakom sig.", "Håll avstånd.", SAK],

  // ── framsteg ──
  ["procenten räknar bara skördat", "Math.round(((sk + st) / 2) * 100)", "Math.round(sk * 100)", FRAM],
  ["skotningen antas klar samtidigt som skördningen", "dagarSk + SKOTNING_EFTER_DAGAR", "dagarSk", FRAM],
  ["en enda dag räknas som takt", "if (med.length < 2) return null;", "if (med.length < 1) return null;", FRAM],
  ["arbetsdagar räknar helgen", "return v !== 0 && v !== 6; };", "return true; };", FRAM],

  // ── påminnelsen ──
  ["påminnelse trots att SMS:et redan öppnats", "if (harSms.has(o.id)) continue;", "", PAM],
  ["påminnelse två dagar före i stället för dagen före", "if (dagarMellan(idag, o.planerad_start) === 1)", "if (dagarMellan(idag, o.planerad_start) === 2)", PAM],
  ["notisen skickas fast SMS:et öppnats", "if (rad.sms_oppnat) return { typ: 'hoppa_over'", "if (false) return { typ: 'hoppa_over'", PAM],
  ["en gammal notis skickas ändå", "if (Number.isFinite(koad) && nu - koad > PAMINNELSE_MAX_ALDER_MS)", "if (false)", PAM],
  ["ett avslutat objekt påminns", "if (o.status === 'avslutat' || o.status === 'klar') continue;", "", PAM],

  // ── hytten ──
  ["kortet försvinner när NÅGON maskin kvitterat", "aktiva.filter((b) => !harKvitterat(kvitt.filter((k) => k.besok_id === b.id), maskinId))", "aktiva.filter((b) => !kvitt.some((k) => k.besok_id === b.id))", HYTT],
  ["en maskin utan id räknas som att ha kvitterat", "!!maskinId && kvittenser.some", "kvittenser.some", STAT],
  ["Uppfattat sparas utan förare", "forare_id: a.forareId,", "forare_id: null,", HOOK],
  ["testläget märks inte", "testlage: a.testlage }", "testlage: false }", HOOK],
  ["gamla besök läses också", ".gte('besokstid', fran)", "", HOOK],
  ["Uppfattat-knappen är under 56 px", "export const BESOK_KORT_MIN_KNAPP_PX = 56;", "export const BESOK_KORT_MIN_KNAPP_PX = 40;", KORT],
  ["kortet är inte orange", "background: FARG.orange, color: FARG.bg", "background: FARG.rod, color: FARG.bg", KORT],
  ["kortet visas även medan ett larm visas", "const besokKortSynligt = besokHytt.vantar.length > 0 && !larm.kort && !lossningVisas;", "const besokKortSynligt = besokHytt.vantar.length > 0;", SIDA],
  ["hytthooken är aktiv utanför maskinläget", "aktiv: instruktionerAktiv,\n    objektId: valtObjekt?.id ? String(valtObjekt.id) : null,\n    maskinId: besokMaskinId,", "aktiv: true,\n    objektId: valtObjekt?.id ? String(valtObjekt.id) : null,\n    maskinId: besokMaskinId,", SIDA],
  ["ringen är 30 m", "circlePolygon(pos.lat, pos.lon, HYTT_RING_M, 64)", "circlePolygon(pos.lat, pos.lon, 30, 64)", SIDA],
  ["SMS-kortet visas för förare", "besok: kortRoll === 'planerare' && isAdminRiktig && !maskinlage", "besok: kortRoll === 'planerare' && !maskinlage", SIDA],

  // ── besökssidans server ──
  ["avstängd länk fungerar ändå", "if (!(l.data as { aktiv: boolean }).aktiv) return { ok: false, skal: 'avstangd' };", "", SERV],
  ["avslutat objekt fungerar ändå", "if (AVSLUTAD(objekt.status)) return { ok: false, skal: 'avslutat' };", "", SERV],
  ["en maskin som stått still i dagar visas som aktiv", "if (nu.getTime() - t > MASKIN_FERSK_MIN * 60000 || t - nu.getTime() > 5 * 60000) continue;", "", SERV],
  ["ingen spärr mot översvämning", "if ((c.count ?? 0) >= BESOK_MAX_PER_TIMME)", "if ((c.count ?? 0) >= BESOK_MAX_PER_TIMME * 1000)", SERV],
  ["en annan trakts anmälan går att läsa", ".eq('id', besokId).eq('objekt_id', objektId).maybeSingle()", ".eq('id', besokId).maybeSingle()", SERV],
  ["volymen läcker i svaret", "ringM: BESOK_RING_M,\n      uppdaterad", "ringM: BESOK_RING_M, volym: o.volym,\n      uppdaterad", SERV],
  ["styrtecken i namnet rensas inte", ".replace(STYRTECKEN, ' ')", "", SERV],
  ["ett telefonnummer med en siffra godtas", "siffror.length >= 6 &&", "siffror.length >= 1 &&", SERV],
  ["motorsågsraden hittar inte symbolen", "=== 'manualfelling');", "!== 'manualfelling');", SERV],
  ["ringen ritas även när platsen inte går att styrka", "if (beslut.ok) {", "if (true) {", SERV],
  ["maskiner hämtas för fel trakt", ".eq('objekt_id', objektId).gte('datum', igar)", ".gte('datum', igar)", SERV],

  // ── besökssidans vy ──
  ["säkerhetstext skrivs direkt i vyn", "<h2 style={{ margin: 0, ...TYP.rubrik }}>{HUVUDREGEL.rubrik}</h2>", "<h2 style={{ margin: 0, ...TYP.rubrik }}>Gå aldrig fram till en maskin</h2>", KLIENT],
  ["'Här just nu' visas utan rader", "{rader.length > 0 && (\n        <section data-testid=\"besok-har-just-nu\"", "{true && (\n        <section data-testid=\"besok-har-just-nu\"", KLIENT],
  ["Skicka är aktiv utan telefonnummer", "tel.replace(/\\D/g, '').length >= 6 &&", "", KLIENT],

  // ── planerarens kort och logg ──
  ["SMS öppnas även när länken är avstängd", "if (!d.lank || !d.lank.aktiv || avslutat) return;", "if (!d.lank) return;", PLANKORT],
  ["öppnandet loggas inte", "void d.loggaSms({", "void (async () => ({", PLANKORT],
  ["SMS-knappen är aktiv på en avslutad trakt", "const lankKlar = !!d.lank && d.lank.aktiv && !avslutat;", "const lankKlar = !!d.lank && d.lank.aktiv;", PLANKORT],
  ["loggen visar äldsta anmälan först", ".sort((a, b) => Date.parse(b.skapad_at) - Date.parse(a.skapad_at))\n    .map((b) =>", ".sort((a, b) => Date.parse(a.skapad_at) - Date.parse(b.skapad_at))\n    .map((b) =>", PLAN],
  ["kvittenser sorteras inte efter tid", "const k = kvitt.filter((x) => x.besok_id === b.id).sort((x, y) => Date.parse(x.kvitterad_at) - Date.parse(y.kvitterad_at));", "const k = kvitt.filter((x) => x.besok_id === b.id);", PLAN],

  // ── migrationen (strängvakterna; SQL-beteendet provas av besok_lokal/kor.sh) ──
  ["volymfunktionen ges till inloggade", "grant execute on function public.besok_volymer(uuid, text[]) to service_role;", "grant execute on function public.besok_volymer(uuid, text[]) to authenticated;", MIGR],
  ["anon får behålla åtkomsten", "public.objekt_besok_kvittens, public.objekt_besok_sms from anon;", "public.objekt_besok_kvittens, public.objekt_besok_sms from service_role;", MIGR],
];

kor({
  filer: [KONST, OFF, SMS, TID, SAK, FRAM, PAM, HYTT, STAT, SERV, PLAN, KLIENT, KORT, PLANKORT, HOOK, SIDA, MW, RAMVERK, MIGR],
  tester: TESTER,
  standardFil: SMS,
  mutationer: M,
});
