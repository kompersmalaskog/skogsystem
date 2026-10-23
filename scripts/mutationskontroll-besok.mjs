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
const MIGR2 = "supabase/migrations/20261023190000_besok_uppstramning.sql";
const PAMKO = "lib/besok/paminnelse-ko.ts";
const NAMN = "lib/besok/namn.ts";
const FARGF = "lib/besok/farg.ts";
const HSERV = "lib/besok/hyttserver.ts";

const TESTER = [
  "lib/besok/logik.test.ts",
  "lib/besok/hyttserver.test.ts",
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
  ["en enda dag räknas som takt", "if (med.length < 2) return null;", "if (med.length < 1) return null;", FRAM],
  ["arbetsdagar räknar helgen", "return v !== 0 && v !== 6; };", "return true; };", FRAM],

  // ── påminnelsen ──
  ["påminnelse trots att SMS:et redan öppnats", "if (harSms.has(o.id)) continue;", "", PAM],
  ["påminnelse två dagar före i stället för dagen före", "if (dagarMellan(idag, o.planerad_start) === 1)", "if (dagarMellan(idag, o.planerad_start) === 2)", PAM],
  ["en gammal notis skickas ändå", "if (Number.isFinite(koad) && nu - koad > PAMINNELSE_MAX_ALDER_MS)", "if (false)", PAM],
  ["ett avslutat objekt påminns", "if (o.status === 'avslutat' || o.status === 'klar') continue;", "", PAM],

  // ── hytten ──
  ["kortet försvinner när NÅGON maskin kvitterat", "aktiva.filter((b) => !harKvitterat(kvitt.filter((k) => k.besok_id === b.id), maskinId))", "aktiva.filter((b) => !kvitt.some((k) => k.besok_id === b.id))", HYTT],
  ["en maskin utan id räknas som att ha kvitterat", "!!maskinId && kvittenser.some", "kvittenser.some", STAT],
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
  ["SMS-knappen är aktiv på en avslutad trakt", "const lankKlar = !!d.lank && d.lank.aktiv && !avslutat;", "const lankKlar = !!d.lank && d.lank.aktiv;", PLANKORT],
  ["loggen visar äldsta anmälan först", ".sort((a, b) => Date.parse(b.skapad_at) - Date.parse(a.skapad_at))\n    .map((b) =>", ".sort((a, b) => Date.parse(a.skapad_at) - Date.parse(b.skapad_at))\n    .map((b) =>", PLAN],
  ["kvittenser sorteras inte efter tid", "const k = kvitt.filter((x) => x.besok_id === b.id).sort((x, y) => Date.parse(x.kvitterad_at) - Date.parse(y.kvitterad_at));", "const k = kvitt.filter((x) => x.besok_id === b.id);", PLAN],

  // ── migrationen (strängvakterna; SQL-beteendet provas av besok_lokal/kor.sh) ──
  ["volymfunktionen ges till inloggade", "grant execute on function public.besok_volymer(uuid, text[]) to service_role;", "grant execute on function public.besok_volymer(uuid, text[]) to authenticated;", MIGR],
  ["anon får behålla åtkomsten", "public.objekt_besok_kvittens, public.objekt_besok_sms from anon;", "public.objekt_besok_kvittens, public.objekt_besok_sms from service_role;", MIGR],

  // ── uppstramning 2026-10-23: prognosen ──
  ["prognosen kräver ingen stabil takt", "if (med.some((d) => Math.abs(d.m3 - snitt) > snitt * PROGNOS.TAKT_STABIL)) return null;", "if (false) return null;", FRAM],
  ["två dagar räcker för en takt", "if (med.length < TAKT_DAGAR) return null;", "if (med.length < 2) return null;", FRAM],
  ["maskinen har stått still men dagen sägs ändå", "if (dagarMellan(med[0].datum, idag) > PROGNOS.SENASTE_DAG_MAX) return null;", "if (false) return null;", FRAM],
  ["ingen gräns för hur långt fram dagen sägs", "if (dagar > PROGNOS.HORISONT_MAX) return { procent, klartCa: null };", "if (false) return { procent, klartCa: null };", FRAM],
  ["skotning utan takt hoppas över i prognosen", "const t = hallandeTakt(i.skotatPerDag, i.idag);\n    if (t == null) return { procent, klartCa: null };\n    dagar = Math.max(dagar, Math.ceil(kvarSt / t));", "const t = hallandeTakt(i.skotatPerDag, i.idag);\n    if (t != null) dagar = Math.max(dagar, Math.ceil(kvarSt / t));", FRAM],
  ["förklaringen av 'klart ca' skickas inte", "forklaring: tung.framsteg.klartCa ? KLART_CA_FORKLARING : null", "forklaring: null", SERV],

  // ── besökssidan: namn, färg, nummer ──
  ["traktens namn är Vidas internnamn", "besokNamn(o.namn, o.vo_nummer, o.fastighetsbeteckning)", "o.namn", SERV],
  ["ledande koder i namnet klipps inte", "while (i < tokens.length && arKod(tokens[i])) i++;", "", NAMN],
  ["fastighetsbeteckningen används inte som reserv", "return f || 'Trakten';", "return 'Trakten';", NAMN],
  ["skördarens prick är lila igen", "skordare: FARG.gul", "skordare: '#bf5af2'", FARGF],
  ["företagets nummer används inte", "(a.avsandareTelefon ?? '').trim() || (a.foretagTelefon === undefined ? FORETAG_TELEFON : (a.foretagTelefon ?? '')).trim()", "(a.avsandareTelefon ?? '').trim()", SMS],
  ["en iPad i skrivbordsläge ses som dator", "|| (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)", "", SMS],

  // ── SMS-loggen: öppnat är inte skickat ──
  ["påminnelsen tystnar av ett öppnat SMS", ".eq('handelse', 'skickad')", "", PAMKO],
  ["notisen skickas fast SMS:et är skickat", "if (rad.sms_skickat) return { typ: 'hoppa_over'", "if (false) return { typ: 'hoppa_over'", PAM],
  ["öppnat SMS räknas som skickat", "default: return { typ: 'obekraftad', text: `Öppnat", "default: return { typ: 'skickad', text: `Öppnat", PLAN],
  ["öppnandet loggas inte", "void d.loggaSms({ ...loggInfo(), handelse: 'oppnad' });", "void 0;", PLANKORT],
  ["öppnandet loggas som skickat", "handelse: 'oppnad' });", "handelse: 'skickad' });", PLANKORT],
  ["kopieringen loggas som skickat", "handelse: 'kopierad' }); setMeddelande", "handelse: 'skickad' }); setMeddelande", PLANKORT],
  ["dator öppnar sms:-länken", "if (mobil) {", "if (true) {", PLANKORT],
  ["frågan 'Skickade du SMS:et?' visas aldrig", "{lage.typ === 'obekraftad' && !avslutat && (", "{false && (", PLANKORT],
  ["'Ja, skickat' loggar nej", "handelse: skickat ? 'skickad' : 'ej_skickad'", "handelse: 'ej_skickad'", PLANKORT],
  ["inget nummer i SMS:et varnar inte", "{saknarNummer && lankKlar && (", "{false && (", PLANKORT],

  // ── hytten: via servern ──
  ["klienten skickar sin egen roll", "body: JSON.stringify({ besok_id: besokId, maskin_id: maskin, ...(testRef.current", "body: JSON.stringify({ besok_id: besokId, maskin_id: maskin, roll: 'skordare', ...(testRef.current", HOOK],
  ["testläget ber inte om testläge", "${testRef.current ? '&test=1' : ''}", "", HOOK],
  ["stäng av stänger inte ringen", "setRingAv((p) => { const n = p.includes(besokId) ? p : [...p, besokId]; sparaRingAv(n); return n; });", "setRingAv((p) => p);", HOOK],
  ["stäng av kvitterar inte", "const ok = await kvittera(besokId);\n    if (!ok) return false;", "const ok = true;\n    if (!ok) return false;", HOOK],
  ["ringen följer inte avstängningen", "aktiva.filter((x) => !ringAv.includes(x.id))", "aktiva", HOOK],
  ["kopplingsfel (403) rensar inte besöken", "if (r.status === 403) { setBesok([]); setKvitt([]); setFel(null); return; }", "if (r.status === 403) { return; }", HOOK],
  ["Ring-knappen ringer ingenstans", "href={`tel:${besok.telefon.replace(/[^\\d+]/g, '')}`} aria-label", "href=\"#\" aria-label", KORT],
  ["'Stäng av' är bara Uppfattat", "onClick={onStangAv}", "onClick={onUppfattat}", KORT],
  ["knapparna i hytten krymper till 40 px", "export const BESOK_KORT_MIN_KNAPP_PX = 56;", "export const BESOK_KORT_MIN_KNAPP_PX = 40;", KORT],
  ["bannern 'Visar som maskin' är orange igen", "background: FARG.upphojt, color: FARG.text, boxSizing", "background: '#f59e0b', color: '#1a1200', boxSizing", SIDA],

  // ── servern avgör (hyttserver) ──
  ["roll tas ur klientens kropp", "roll: p.roll, forare_id", "roll: b.roll as any, forare_id", HSERV],
  ["förare tas ur klientens kropp", "forare_id: s.medarbetareId, testlage: p.testlage", "forare_id: b.forare_id as any, testlage: p.testlage", HSERV],
  ["testläge gäller för alla", "const test = arAdmin(s) && begartTest;", "const test = begartTest;", HSERV],
  ["kopplingen kontrolleras inte", "if (!test) {\n    const k = await maskinKopplad", "if (false) {\n    const k = await maskinKopplad", HSERV],
  ["ej kopplad maskin släpps igenom", "if (!k) return { ok: false, svar: FEL(403, 'Maskinen är inte kopplad till objektet') };", "if (false) return { ok: false, svar: FEL(403, 'Maskinen är inte kopplad till objektet') };", HSERV],
  ["varje maskin i kön räknas som kopplad", "if (Array.isArray(k.data) && k.data.length > 0) return true;", "if (true) return true;", HSERV],
  ["hyttspår från alla tider räknas", "const SPAR_DAGAR = 30;", "const SPAR_DAGAR = 36500;", HSERV],
  ["alla maskiners kvittenser läcker", ".eq('maskin_id', q.maskin).in('besok_id'", ".in('besok_id'", HSERV],
  ["andra trakters besök läses", ".eq('objekt_id', q.objekt).gte('besokstid', fran)", ".gte('besokstid', fran)", HSERV],
  ["en kvittens på ett annat objekts besök godtas", "const p = await prova(sb, s, besok.objekt_id, b.maskin_id", "const p = await prova(sb, s, (await sb.from('objekt').select('id').limit(1).maybeSingle()).data?.id ?? besok.objekt_id, b.maskin_id", HSERV],

  // ── migration 2 (strängvakterna; SQL-beteendet provas av besok_lokal/kor2.sh) ──
  ["besök läses av alla inloggade", "alter policy besok_sel on public.objekt_besok using (public.ar_admin());", "alter policy besok_sel on public.objekt_besok using (true);", MIGR2],
  ["SMS-loggen läses av alla inloggade", "alter policy besok_sms_sel on public.objekt_besok_sms using (public.ar_admin());", "alter policy besok_sms_sel on public.objekt_besok_sms using (true);", MIGR2],
  ["kvittens går att skriva från appen", "with check (false);", "with check (true);", MIGR2],
  ["vem som helst loggar SMS", "with check (public.ar_admin() and oppnad_av", "with check (oppnad_av", MIGR2],
  ["skrivrättigheterna återkallas inte", "revoke all on public.objekt_besok, public.objekt_besok_kvittens, public.objekt_besok_sms from authenticated;", "", MIGR2],
];

kor({
  filer: [KONST, OFF, SMS, TID, SAK, FRAM, PAM, HYTT, STAT, SERV, PLAN, KLIENT, KORT, PLANKORT, HOOK, SIDA, MW, RAMVERK, MIGR, MIGR2, PAMKO, NAMN, FARGF, HSERV],
  tester: TESTER,
  standardFil: SMS,
  mutationer: M,
});
