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
  ['brytaren tar emot allt', 'app/api/maskin/konto/route.ts', 'typeof body.aktiv !== "boolean"', 'false'],
]
let fel = 0
for (const [namn, fil, fran, till] of MUTANTER) {
  const orig = readFileSync(fil, 'utf8')
  if (!orig.includes(fran)) { console.log(`FEL: mutanten "${namn}" ändrar inget (${fran})`); fel++; continue }
  writeFileSync(fil, orig.replace(fran, till))
  let dod = false
  try { execSync('npx vitest run app/api/maskin', { stdio: 'pipe' }) } catch { dod = true }
  writeFileSync(fil, orig)
  console.log(`${dod ? 'dödad' : 'ÖVERLEVDE'}: ${namn}`)
  if (!dod) fel++
}
process.exit(fel ? 1 : 0)
