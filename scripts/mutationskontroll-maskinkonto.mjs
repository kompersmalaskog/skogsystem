// Mutationskontroll för "Maskinen som maskin" (servern): varje mutant ska få app/api/maskin/maskin.routes.test.ts att FALLA.
// node scripts/mutationskontroll-maskinkonto.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const MUTANTER = [
  ['felräknaren anropas aldrig före kontrollen', 'app/api/maskin/las-upp/route.ts', 'if (!g.tillat) {', 'if (false) {'],
  ['fel kod släpps igenom', 'app/api/maskin/las-upp/route.ts', 'if (!stammerKod(body.kod, rad)) {', 'if (false) {'],
  ['väntan ger ingen blockering', 'app/api/maskin/las-upp/route.ts', 'if (gate.error || !g) return nej(500, "Kunde inte kontrollera koden.");', ''],
  ['person utan kod släpps in', 'app/api/maskin/las-upp/route.ts', 'if (!rad) {', 'if (false) {'],
  ['inaktiv person kan låsa upp', 'app/api/maskin/las-upp/route.ts', '!p || !p.aktiv ||', '!p ||'],
  ['maskinkontot kan låsa upp sig själv', 'app/api/maskin/las-upp/route.ts', '(p.roll !== "forare" && p.roll !== "admin")', 'false'],
  ['vem-listan kräver inte maskinkonto', 'app/api/maskin/vem/route.ts', 'if (!vakt.ok) return vakt.res;', ''],
  ['brytaren av räknas som på', 'lib/maskinkonto/server.ts', 'if (!konto?.aktiv)', 'if (false)'],
  ['en förare kan vara maskinkonto', 'lib/maskinkonto/server.ts', 's.roll !== "maskin" ||', 'false ||'],
  ['maskinkontot får sätta egen kod', 'lib/maskinkonto/server.ts', '(s.roll !== "forare" && s.roll !== "admin")', 'false'],
  ['maskinkontots egen session kan spärras', 'app/api/maskin/las/route.ts', '|| med.roll === "maskin"', ''],
  ['koden sparas i klartext', 'app/api/maskin/kod/route.ts', 'const { kod_hash, salt } = skapaHash(body.kod);', 'const kod_hash = body.kod, salt = "x";'],
  ['nollställning kräver inte admin', 'app/api/maskin/kod/nollstall/route.ts', 'if (!vakt.ok) return vakt.res;', ''],
  ['reserv till service-nyckeln finns kvar', 'lib/maskinkonto/kod.ts', 'process.env.MASKIN_KOD_PEPPAR;\n  if (!p) throw', 'process.env.MASKIN_KOD_PEPPAR || process.env.SUPABASE_SERVICE_ROLE_KEY;\n  if (!p) throw', 'lib/maskinkonto/maskinkonto.test.ts'],
  ['saknad peppar räknas som fel kod', 'app/api/maskin/las-upp/route.ts', 'if (!kodPepparFinns()) return pepparSaknas();', ''],
  ['ingen notis vid tio fel', 'app/api/maskin/las-upp/route.ts', 'if (f?.timme) {', 'if (false) {'],
  ['notisen går också till personen själv', 'lib/maskinkonto/notis.ts', ' && x.id !== a.medarbetareId', ''],
  ['personens session loggas inte ut lokalt när maskinsessionen saknas', 'lib/maskinkonto/klient.ts', 'if (!tillbaka) await loggaUtLokalt()', '', 'lib/maskinkonto/klient.test.ts'],
  ['lokal rensning av sb-nycklar uteblir', 'lib/maskinkonto/klient.ts', "try { Object.keys(localStorage).filter(k => k.startsWith('sb-'))", "try { Object.keys({}).filter(k => k.startsWith('sb-'))", 'lib/maskinkonto/klient.test.ts'],
  ['upplåsningen skrivs efter sessionsbytet', 'lib/maskinkonto/klient.ts', "  sattUpplast({ id: p.id, namn: p.namn, roll: p.roll, aktivitet: Date.now() })\n  const v = await", "  const v = await", 'lib/maskinkonto/klient.test.ts'],
  ['utgången upplåsning låses inte vid start', 'lib/maskinkonto/upplast.ts', 'if (u && utgangen(u, nu)) return true', 'if (false) return true', 'components/maskinkonto/MaskinStartVakt.render.test.tsx'],
  ['kvarlämnad maskinsession låses inte vid start', 'lib/maskinkonto/upplast.ts', 'if (!u && ms) return true', 'if (false) return true', 'components/maskinkonto/MaskinStartVakt.render.test.tsx'],
  ['startvakten släpper igenom barnen', 'components/maskinkonto/MaskinStartVakt.tsx', 'if (!las) return <>{children}</>', 'if (true) return <>{children}</>', 'components/maskinkonto/MaskinStartVakt.render.test.tsx'],
  // "Välj koden från maskinen"
  ['notisen skickas utan att kolla att personen har push', 'app/api/maskin/kod-notis/route.ts', 'if ((subs.data ?? []).length === 0) {', 'if (false) {'],
  ['maskinens egna push-prenumerationer räknas som personens', 'app/api/maskin/kod-notis/route.ts', '.is("maskin_id", null)', ''],
  ['tvåminutersgränsen hoppas över', 'app/api/maskin/kod-notis/route.ts', 'if (!g.tillat) return', 'if (false) return'],
  ['notis skickas även när personen redan har kod', 'app/api/maskin/kod-notis/route.ts', 'if (kod.data) return', 'if (false) return'],
  ['inaktiv person kan få notisen', 'app/api/maskin/kod-notis/route.ts', '!p || !p.aktiv ||', '!p ||'],
  ['notisen kräver inte maskinkonto', 'app/api/maskin/kod-notis/route.ts', 'if (!vakt.ok) return vakt.res;\n  const body', 'const body'],
  ['notisen bär personens namn', 'lib/maskinkonto/notis.ts', "payload: { maskin_namn: a.maskinNamn },", "payload: { maskin_namn: a.maskinNamn, namn: a.medarbetareId },"],
  ['arket begär ingen notis när man trycker på ett namn utan kod', 'components/maskinkonto/VemArDuArk.tsx', 'if (!p.harKod) void begar(p)', '', 'components/maskinkonto/Maskinkonto.render.test.tsx'],
  ['"Skicka igen" är aktiv under nedräkningen', 'components/maskinkonto/VemArDuArk.tsx', "disabled={notis === 'begar' || notisSek > 0}", 'disabled={false}', 'components/maskinkonto/Maskinkonto.render.test.tsx'],
  ['frågandet fortsätter efter att arket stängts', 'components/maskinkonto/VemArDuArk.tsx', 'return () => { avbruten = true; clearInterval(t) }', 'return () => { avbruten = true }', 'components/maskinkonto/Maskinkonto.render.test.tsx'],
  ['sifferplattan kommer aldrig när koden valts', 'components/maskinkonto/VemArDuArk.tsx', 'if (avbruten || finns !== true) return', 'return', 'components/maskinkonto/Maskinkonto.render.test.tsx'],
  ['reservtexten saknas när push saknas', 'components/maskinkonto/VemArDuArk.tsx', "if (r.typ === 'ingen_push') { setNotis('ingen_push'); return }", "if (r.typ === 'ingen_push') { setNotis({ typ: 'skickad' }); return }", 'components/maskinkonto/Maskinkonto.render.test.tsx'],
  ['djuplänken /?kod=1 öppnar inget', 'components/startsida/Startsida.tsx', "if (u.searchParams.get('kod') !== '1') return", 'return', 'components/startsida/Startsida.maskinkonto.render.test.tsx'],
  ['djuplänken öppnar kodarket även på maskinen', 'components/startsida/Startsida.tsx', "if (mkonto.lage !== 'vanlig') return\n    try {\n      const u", "try {\n      const u", 'components/startsida/Startsida.maskinkonto.render.test.tsx'],
  ['notisen skickas även om koden redan valts', 'lib/maskinkonto/notis.ts', 'if (finns) return { typ: \'hoppa_over\'', 'if (false) return { typ: \'hoppa_over\'', 'lib/maskinkonto/maskinkonto.test.ts'],
  ['kodnotisen skickas även till prenumerationer som hör till en maskindator', 'app/api/notis/flush/route.ts', 'if (arKodValNotis(n.typ)) subsFraga = subsFraga.is("maskin_id", null);', '', 'app/api/notis/flush/kodVal.route.test.ts'],
  ['brytaren tar emot allt', 'app/api/maskin/konto/route.ts', 'typeof body.aktiv !== "boolean"', 'false'],
  // Maskinens konto skapas av sig självt (PR #1217, del 2)
  ['auto: brytaren kontrolleras inte', 'app/api/maskin/auto/route.ts', 'if (!brytare?.aktiv) {', 'if (false) {', 'app/api/maskin/auto'],
  ['auto: kräver ingen inloggad person', 'app/api/maskin/auto/route.ts', 'if (!vakt.ok) return vakt.res;', '', 'app/api/maskin/auto'],
  ['auto: okänd maskin accepteras', 'app/api/maskin/auto/route.ts', 'if (!maskin || ', 'if (false && !maskin || ', 'app/api/maskin/auto'],
  ['auto: en lastbil kan få konto', 'app/api/maskin/auto/route.ts', '!["Harvester", "Forwarder"].includes(maskin.maskin_typ ?? "") ||', '', 'app/api/maskin/auto'],
  ['auto: avvecklad maskin accepteras', 'app/api/maskin/auto/route.ts', '(maskin.aktiv_till && maskin.aktiv_till < idag)', 'false', 'app/api/maskin/auto'],
  ['auto: svaret bär lösenordet', 'app/api/maskin/auto/route.ts', 'return NextResponse.json({ ok: true, token_hash: tokenHash, maskin_id: maskinId, skapad: konto.skapad });', 'return NextResponse.json({ ok: true, token_hash: tokenHash, maskin_id: maskinId, skapad: konto.skapad, epost: konto.epost, userId: konto.userId });', 'app/api/maskin/auto'],
  ['auto: ingen loggning av bytet', 'app/api/maskin/auto/route.ts', 'await logga("auto_inloggad");', '', 'app/api/maskin/auto'],
  ['konto: andra starten skapar ett nytt konto', 'lib/maskinkonto/autoKonto.ts', 'if (finns?.user_id) return', 'if (false) return', 'lib/maskinkonto/autoKonto.test.ts'],
  ['konto: kopplingen är inte villkorad (två enheter ger två konton)', 'lib/maskinkonto/autoKonto.ts', '.eq("maskin_id", maskin.maskin_id).is("user_id", null).select("maskin_id")', '.eq("maskin_id", maskin.maskin_id).select("maskin_id")', 'lib/maskinkonto/autoKonto.test.ts'],
  ['konto: ett halvt konto städas inte bort', 'lib/maskinkonto/autoKonto.ts', 'if (ins.error || !medId) { await stada(); return', 'if (ins.error || !medId) { return', 'lib/maskinkonto/autoKonto.test.ts'],
  ['konto: medarbetarraden blir en synlig förare', 'lib/maskinkonto/autoKonto.ts', 'roll: "maskin", aktiv: false', 'roll: "maskin", aktiv: true', 'lib/maskinkonto/autoKonto.test.ts'],
  ['konto: adressen tas ur något annat än maskinen', 'lib/maskinkonto/autoKonto.ts', 'export const MASKIN_EPOST_DOMANER = ["maskin.invalid", "example.com"] as const;', 'export const MASKIN_EPOST_DOMANER = ["gmail.com", "example.com"] as const;', 'lib/maskinkonto/autoKonto.test.ts'],
  ['start: telefon/surfplatta (ingen Web Serial) byter', 'lib/maskinkonto/autoStart.ts', 'if (!a.harWebSerial) return false', '', 'lib/maskinkonto/autoStart.test.ts'],
  ['start: hemdator utan maskinens GPS byter', 'lib/maskinkonto/autoStart.ts', 'if (!a.serialFlagga && !(a.beviljadePortar > 0)) return false', '', 'lib/maskinkonto/autoStart.test.ts'],
  ['start: en dator utan vald maskin byter', 'lib/maskinkonto/autoStart.ts', "if (!a.enhetMaskinId || !a.enhetMaskinId.trim()) return false", '', 'lib/maskinkonto/autoStart.test.ts'],
  ['start: testläget byter', 'lib/maskinkonto/autoStart.ts', 'if (arUndantagenSokvag(a.pathname)) return false', '', 'lib/maskinkonto/autoStart.test.ts'],
  ['start: pausen efter "Logga ut maskinen" gäller inte', 'lib/maskinkonto/autoStart.ts', 'if (a.pausTill > a.nu) return false', '', 'lib/maskinkonto/autoStart.test.ts'],
  ['start: maskinkontot självt byter', "lib/maskinkonto/autoStart.ts", "if (a.roll !== 'forare' && a.roll !== 'admin') return false", '', 'lib/maskinkonto/autoStart.test.ts'],
  ['start: allt under /maskin räknas som testläge (maskinvy blockeras)', 'lib/maskinkonto/autoStart.ts', "path === '/maskin' || path.startsWith('/maskin/')", "path.startsWith('/maskin')", 'lib/maskinkonto/autoStart.test.ts'],
  ['provider: byter utan att fråga reglerna', 'components/maskinkonto/MaskinKontoProvider.tsx', 'if (!ska || !enhetMaskinId || autoRef.current === enhetMaskinId) return', 'if (!enhetMaskinId || autoRef.current === enhetMaskinId) return', 'components/maskinkonto/AutoMaskin.render.test.tsx'],
  ['provider: flera försök per sidladdning', 'components/maskinkonto/MaskinKontoProvider.tsx', '      autoRef.current = enhetMaskinId\n', '', 'components/maskinkonto/AutoMaskin.render.test.tsx'],
  ['provider: byter även en upplåst person', 'components/maskinkonto/MaskinKontoProvider.tsx', "if (lage !== 'vanlig' || loading || !medarbetare) return\n    let avbruten", "if (loading || !medarbetare) return\n    let avbruten", 'components/maskinkonto/AutoMaskin.render.test.tsx'],
  ['provider: ingen omladdning efter ett lyckat byte', 'components/maskinkonto/MaskinKontoProvider.tsx', "=== 'ok') gaTillKartan()", "=== 'ok') undefined", 'components/maskinkonto/AutoMaskin.render.test.tsx'],
  ['provider: laddar om även när bytet misslyckats', 'components/maskinkonto/MaskinKontoProvider.tsx', "if ((await blirMaskinAutomatiskt(enhetMaskinId)) === 'ok') gaTillKartan()", "await blirMaskinAutomatiskt(enhetMaskinId); gaTillKartan()", 'components/maskinkonto/AutoMaskin.render.test.tsx'],
  ['provider: lyssnar inte på att enheten får en maskin', 'components/maskinkonto/MaskinKontoProvider.tsx', 'window.addEventListener(ENHET_MASKIN_ANDRAD, f)', '', 'components/maskinkonto/AutoMaskin.render.test.tsx'],
  ['klient: brytaren av tolkas som fel (eller tvärtom)', 'lib/maskinkonto/klient.ts', "r.status === 403 && j.fel === 'av' ? 'av' : 'fel'", "'fel'", 'lib/maskinkonto/klient.test.ts'],
  ['klient: ett misslyckat verifyOtp ignoreras', 'lib/maskinkonto/klient.ts', "  if (v.error) return 'fel'\n  // Maskinkontot är nu inloggat", "  // Maskinkontot är nu inloggat", 'lib/maskinkonto/klient.test.ts'],
  ['klient: personens gamla session spärras aldrig', 'lib/maskinkonto/klient.ts', "if (gammal) void fetch('/api/maskin/las'", "if (false) void fetch('/api/maskin/las'", 'lib/maskinkonto/klient.test.ts'],
  ['klient: "Logga ut maskinen" pausar inte bytet', 'lib/maskinkonto/klient.ts', 'sattAutoPaus(Date.now() + AUTO_PAUS_MS)', '', 'lib/maskinkonto/klient.test.ts'],
  ['admin: kontot kan läggas upp via POST igen', 'app/api/maskin/konto/route.ts', 'export async function PATCH', 'export async function POST(request: Request) { return nej(200, "x") }\nexport async function PATCH', 'app/api/maskin'],
  // Andras namn når maskinen
  ['namn: kommentarernas författare kompletteras inte', 'lib/hooks/useKartkommentarer.ts', "setServer(await kompletteraNamn(rader, (r) => r.skapad_av, (r) => r.namn, (r, n) => ({ ...r, namn: n }), dbRef.current as any));", 'setServer(rader);', 'lib/hooks/useKartkommentarer.test.tsx'],
  ['namn: larmplatsens svar kompletteras inte', 'lib/hooks/useLarmKontroll.ts', 'const med = await kompletteraNamn(data as any[], (r) => r.medarbetare_id, (r) => r.medarbetare?.namn, (r, n) => ({ ...r, medarbetare: { namn: n } }));', 'const med = data as any[];', 'lib/hooks/useLarmKontroll.namn.test.tsx'],
  ['namn: ett befintligt namn skrivs över', 'lib/medarbetarNamn.ts', 'const n = !namn(r) && i ? m.get(i) : undefined', 'const n = i ? m.get(i) : undefined', 'lib/medarbetarNamn.test.ts'],
  ['namn: fler än 200 id:n i ett anrop', 'lib/medarbetarNamn.ts', 'i += 200', 'i += 2000', 'lib/medarbetarNamn.test.ts'],
  ['namn: ett fel i funktionen blir ett kast', 'lib/medarbetarNamn.ts', '} catch { /* namnen är ett tillägg */ }', '} catch (e) { throw e }', 'lib/medarbetarNamn.test.ts'],
]
let fel = 0
const BARA = process.env.BARA ? process.env.BARA.split('|') : null
for (const [namn, fil, fran, till, test = 'app/api/maskin'] of MUTANTER) {
  if (BARA && !BARA.some(b => namn.includes(b))) continue
  const orig = readFileSync(fil, 'utf8')
  if (!orig.includes(fran)) { console.log(`FEL: mutanten "${namn}" ändrar inget (${fran})`); fel++; continue }
  writeFileSync(fil, orig.replace(fran, till))
  let dod = false
  try { execSync(`npx vitest run ${test}`, { stdio: 'pipe' }) } catch { dod = true }
  writeFileSync(fil, orig)
  console.log(`${dod ? 'dödad' : 'ÖVERLEVDE'}: ${namn}`)
  if (!dod) fel++
}
process.exit(fel ? 1 : 0)
