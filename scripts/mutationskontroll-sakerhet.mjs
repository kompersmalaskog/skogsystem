// Mutationskontroll för "Säkerhet – kritiska hål" (2026-10-23): varje spärr tas bort, EN i taget, och ett test ska bli rött.
// SQL-migrationerna prövas av scripts/mutationskontroll-sakerhet-sql.mjs (mot lokal Postgres). Motorn: scripts/mutationsmotor.mjs.
//
// Kör:  node scripts/mutationskontroll-sakerhet.mjs   (EN tung körning åt gången)
import { kor } from "./mutationsmotor.mjs";

const R = {
  appState: "app/api/app-state/route.ts",
  avtalPamin: "app/api/avtal/notify-pamin/route.ts",
  fordonPamin: "app/api/fordon/notify-pamin/route.ts",
  syncV: "app/api/fortnox/sync-vouchers/route.ts",
  syncI: "app/api/fortnox/sync-invoices/route.ts",
  kTradslag: "app/api/kalibrering/tradslag/route.ts",
  kDiagnos: "app/api/kalibrering/diagnos/route.ts",
  kKalender: "app/api/kalibrering/kalender/route.ts",
  kObjekt: "app/api/kalibrering/objekt/route.ts",
  kKontroll: "app/api/kalibrering/kontroll/route.ts",
  kBedomning: "app/api/kalibrering/bedomning/route.ts",
  kKontroller: "app/api/kalibrering/kontroller/route.ts",
  personal: "app/api/personal/route.ts",
  personalId: "app/api/personal/[id]/route.ts",
  certPost: "app/api/personal/[id]/certifikat/route.ts",
  certId: "app/api/personal/[id]/certifikat/[certId]/route.ts",
  agare: "lib/auth/arbetsdag.ts",
  adObjekt: "app/api/arbetsdag/[id]/objekt/route.ts",
  adOid: "app/api/arbetsdag/[id]/objekt/[oid]/route.ts",
  html: "lib/html.ts",
  ovk: "app/oversikt/OversiktKarta.tsx",
  kartaVy: "app/planering/KartaVy.tsx",
  kartaPage: "app/karta/page.tsx",
  arbrap: "components/arbetsrapport/Arbetsrapport.tsx",
  ljud: "lib/ljud.ts",
  spelare: "components/LjudSpelare.tsx",
  fb: "app/forbattringsforslag/page.tsx",
};

const TESTER = [
  "app/api/_sakerhet",
  "lib/html.test.ts", "lib/html.vakter.test.ts", "app/oversikt/OversiktKarta.xss.render.test.tsx",
  "lib/ljud.test.ts", "components/LjudSpelare.render.test.tsx", "lib/sakerhet",
];

const VAKT = "const vakt = await kravRoll(ADMIN_ROLLER);\n  if (!vakt.ok) return vakt.res;\n";
const VAKT_INL = "const vakt = await kravInloggad();\n  if (!vakt.ok) return vakt.res;\n";
const kal = (namn, fil) => [`kalibrering/${namn}: ingen inloggning krävs`, VAKT_INL, "", fil];

const M = [
  // ── 1. debug-nyckeln ──
  ["app-state: ingen adminkontroll", VAKT, "", R.appState],
  ["avtal/notify-pamin: vem som helst utan secret kommer in", "    const vakt = await kravRoll(ADMIN_ROLLER);\n    if (!vakt.ok) return vakt.res;\n", "", R.avtalPamin],
  ["fordon/notify-pamin: vem som helst utan secret kommer in", "    const vakt = await kravRoll(ADMIN_ROLLER);\n    if (!vakt.ok) return vakt.res;\n", "", R.fordonPamin],
  ["sync-vouchers: alla är admin", "return (await kravRoll(ADMIN_ROLLER)).ok;", "return true;", R.syncV],
  ["sync-invoices: alla är admin", "return (await kravRoll(ADMIN_ROLLER)).ok;", "return true;", R.syncI],
  ["sync-vouchers: service-klienten skapas före kontrollen", "  const start = Date.now();\n\n  if (!(await kontrolleraAdmin(req))) {", "  const start = Date.now();\n  serverSupabase();\n\n  if (!(await kontrolleraAdmin(req))) {", R.syncV],
  kal("tradslag", R.kTradslag), kal("diagnos", R.kDiagnos), kal("kalender", R.kKalender),
  kal("objekt", R.kObjekt), kal("kontroll", R.kKontroll), kal("bedomning", R.kBedomning), kal("kontroller", R.kKontroller),
  ["debug-nyckeln i en kommentar (strängen får inte komma tillbaka)", "// Diagnostik över en förares dag", "// " + "skogsystem" + "-debug: Diagnostik över en förares dag", R.appState],
  ["en route jämför ?key= mot en bokstavlig sträng", VAKT_INL, 'if (url.searchParams.get("key") !== "hemlig") return new NextResponse("nej", { status: 401 });\n  ' + VAKT_INL, R.kObjekt],

  // ── 4. /api/personal ──
  ["personal: förare får alla (filtret på egen rad borta)", 'medFraga = medFraga.eq("id", sess.medarbetareId!);', "", R.personal],
  ["personal: förare får alla certifikat", 'certFraga = certFraga.eq("medarbetare_id", sess.medarbetareId!);', "", R.personal],
  ["personal: alla är admin", 'const arAdmin = sess.roll === "admin";', "const arAdmin = true;", R.personal],
  ["personal: utloggad släpps in", "if (!sess.user) return svar401();", "", R.personal],
  ["personal: medarbetare utan rad får allt", "if (!arAdmin && !sess.medarbetareId) return svar404Medarbetare();", "", R.personal],
  ["personal/[id] PATCH: förare får ändra", 'if (med?.roll !== "admin") return { ok: false, error: "Kräver admin" };', "", R.personalId],
  ["personal/[id]/certifikat POST: förare får skriva", 'if (med?.roll !== "admin") return { ok: false, error: "Kräver admin" };', "", R.certPost],
  ["personal/[id]/certifikat/[certId]: förare får ändra och radera", 'if (med?.roll !== "admin") return { ok: false, error: "Kräver admin" };', "", R.certId],

  // ── 5. arbetsdag ──
  ["arbetsdag: annans dag släpps in (ägarkontrollen borta)", 'if (data.medarbetare_id !== sess.medarbetareId) return { ok: false, res: svar403("Det här är inte din arbetsdag") };', "", R.agare],
  ["arbetsdag: alla är admin", 'if (sess.roll === "admin") return { ok: true, arAdmin: true };', "return { ok: true, arAdmin: true };", R.agare],
  ["arbetsdag: utloggad släpps in", "if (!sess.user) return { ok: false, res: svar401() };", "", R.agare],
  ["arbetsdag: en dag som inte finns ger inte 404", 'if (!data) return { ok: false, res: Response.json({ ok: false, error: "Arbetsdagen finns inte" }, { status: 404 }) };', "", R.agare],
  ["arbetsdag GET: ingen kontroll", "  const vakt = await kravArbetsdagAgare(id);\n  if (!vakt.ok) return vakt.res;\n  const { data, error } = await supa()", "  const { data, error } = await supa()", R.adObjekt],
  ["arbetsdag POST: ingen kontroll", "  const vakt = await kravArbetsdagAgare(id);\n  if (!vakt.ok) return vakt.res;\n  const body = await req.json();\n\n  const supabase = supa();", "  const body = await req.json();\n\n  const supabase = supa();", R.adObjekt],
  ["arbetsdag PATCH: ingen kontroll", "  const vakt = await kravArbetsdagAgare(id);\n  if (!vakt.ok) return vakt.res;\n  const body = await req.json();\n  const payload", "  const body = await req.json();\n  const payload", R.adOid],
  ["arbetsdag DELETE: ingen kontroll", "  const vakt = await kravArbetsdagAgare(id);\n  if (!vakt.ok) return vakt.res;\n  // Raden måste", "  // Raden måste", R.adOid],
  ["arbetsdag PATCH: raden behöver inte höra till dagen (IDOR)", '.update(payload).eq("id", oid).eq("arbetsdag_id", id)', '.update(payload).eq("id", oid)', R.adOid],
  ["arbetsdag DELETE: raden behöver inte höra till dagen (IDOR)", '.delete().eq("id", oid).eq("arbetsdag_id", id)', '.delete().eq("id", oid)', R.adOid],

  // ── 6. XSS ──
  ["escapeHtml: '<' escapas inte", "'<': '&lt;', ", "", R.html],
  ["escapeHtml: citattecken escapas inte", "'\"': '&quot;', ", "", R.html],
  ["Översikten: GROT-etikettens badge", "${escapeHtml(info.label)}</span>", "${info.label}</span>", R.ovk],
  ["Översikten: GROT-markörens objektnamn", "${escapeHtml(obj.namn)}</div>", "${obj.namn}</div>", R.ovk],
  ["Översikten: maskinmarkörens färskhet", "const farskhet = farskhetRaa ? escapeHtml(farskhetRaa) : null;", "const farskhet = farskhetRaa;", R.ovk],
  ["Översikten: maskinmarkörens namn", "${escapeHtml(namn)}</div>${frisk}", "${namn}</div>${frisk}", R.ovk],
  ["Översikten: maskinnamn/chips ovanför objekt", "${escapeHtml(s)}</span>", "${s}</span>", R.ovk],
  ["Översikten: objektmarkörens namn", "${escapeHtml(label)}${escapeHtml(volLabel)}", "${label}${volLabel}", R.ovk],
  ["Planering KartaVy: popupens objektnamn", "<b>${escapeHtml(objekt.namn)}</b>", "<b>${objekt.namn}</b>", R.kartaVy],
  ["Karta: markörens objektnamn", "\">${escapeHtml(obj.namn)}</div>", "\">${obj.namn}</div>", R.kartaPage],
  ["Arbetsrapport-utskriften: namn", "const medarbetare = { namn: escapeHtml(medarbetareForeUtskrift?.namn) };", "const medarbetare = { namn: medarbetareForeUtskrift?.namn };", R.arbrap],
  ["Arbetsrapport-utskriften: anledning", "<td>${escapeHtml(r.anledning)||'—'}</td>", "<td>${r.anledning||'—'}</td>", R.arbrap],
  ["Arbetsrapport-utskriften: beskrivning", "<td>${escapeHtml(b.beskrivning)||'—'}</td>", "<td>${b.beskrivning||'—'}</td>", R.arbrap],

  // ── 2. ljud (appens del) ──
  ["LjudSpelare spelar källan direkt i stället för signerad länk", "src={url ?? undefined}", "src={src ?? undefined}", R.spelare],
  ["gamla publika URL:er känns inte igen (befintliga ljud slutar spelas)", "(?:public|sign|authenticated)", "(?:sign|authenticated)", R.ljud],
  ["uppspelningslänken gäller ett dygn (inte kortlivad)", "export const LJUD_LANK_SEKUNDER = 600;", "export const LJUD_LANK_SEKUNDER = 86400;", R.ljud],
  ["en spelare utan signering i förbättringsförslagen", "<LjudSpelare src={item.audio_url} />", "<audio controls src={item.audio_url} />", R.fb],
];

// MUT_URVAL="Arbetsrapport" kör bara mutanterna vars namn innehåller texten (för att köra om dem som överlevt).
const urval = process.env.MUT_URVAL ? M.filter(m => m[0].includes(process.env.MUT_URVAL)) : M;
kor({
  filer: [...new Set(M.map(m => m[3]))],
  tester: TESTER,
  standardFil: R.appState,
  mutationer: urval,
});
