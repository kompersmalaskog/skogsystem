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
  ['brytaren tar emot allt', 'app/api/maskin/konto/route.ts', 'typeof body.aktiv !== "boolean"', 'false'],
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
