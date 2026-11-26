#!/usr/bin/env node
// Mutationskontroll: har "Spara som PDF" tänder?
// Varje mutant är en regression någon kunde göra av misstag. Testerna ska DÖ.
//   node scripts/mutationskontroll-spara-pdf.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const KOMPONENT = 'app/helikopter/_components/PdfForhandsvisning.tsx'
const LIB = 'app/helikopter/_lib/veckolageDela.ts'
const TESTER = ['app/helikopter/_lib/delaFil.test.ts', 'app/helikopter/_components/PdfForhandsvisning.render.test.tsx']

const MUTANTER = [
  { namn: 'Spara visas överallt (iOS-PWA får en knapp som inte gör något)', fil: KOMPONENT, fran: '{kanSpara && (', till: '{true && (' },
  { namn: 'Spara går via delningen i stället för att spara', fil: KOMPONENT, fran: 'laddaNerFil(fil(), `${filnamn}.pdf`)', till: 'void delaFil(fil(), `${filnamn}.pdf`, titel)' },
  { namn: 'Spara glömmer ändelsen .pdf', fil: KOMPONENT, fran: 'laddaNerFil(fil(), `${filnamn}.pdf`)', till: 'laddaNerFil(fil(), filnamn)' },
  { namn: 'Spara är tryckbar innan PDF:en finns', fil: KOMPONENT, fran: '              onClick={spara}\n              disabled={!kanDela}', till: '              onClick={spara}\n              disabled={false}' },
  // Spara skyddas i TVÅ lager: knappen är avstängd OCH spara() vägrar utan bytes.
  // Var för sig överlever de med flit (ett klick når aldrig en avstängd knapp) —
  // tas BÅDA bort kraschar fil() på null, och det ska testerna se.
  {
    namn: 'Spara utan BÅDA skydden (avstängd knapp + spärr i spara)',
    fil: KOMPONENT,
    byten: [
      ['              onClick={spara}\n              disabled={!kanDela}', '              onClick={spara}\n              disabled={false}'],
      ['if (!bytesRef.current || delar) return', 'if (delar) return'],
    ],
  },
  { namn: 'kanSparaFil svarar alltid ja', fil: LIB, fran: 'return !(ios && installerad)', till: 'return true' },
  { namn: 'kanSparaFil missar iPad i skrivbordsläge', fil: LIB, fran: "|| (n.platform === 'MacIntel' && (n.maxTouchPoints ?? 0) > 1)", till: '|| false' },
  { namn: 'kanSparaFil missar display-mode: standalone', fil: LIB, fran: "const installerad = n.standalone === true || !!w?.matchMedia?.('(display-mode: standalone)').matches", till: 'const installerad = n.standalone === true' },
  { namn: 'laddaNerFil lämnar <a> kvar i sidan', fil: LIB, fran: '  a.click()\n  a.remove()', till: '  a.click()' },
  { namn: 'laddaNerFil städar aldrig blob-URL:en', fil: LIB, fran: '  setTimeout(() => URL.revokeObjectURL(url), 10_000)\n}', till: '}' },
  { namn: 'delningen saknar sin nedladdningsreserv', fil: LIB, fran: "  laddaNerFil(blob, filnamn)\n  return 'nedladdad'", till: "  return 'nedladdad'" },
]

const kor = () => {
  try {
    execFileSync('./node_modules/.bin/vitest', ['run', ...TESTER], { stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=6144' } })
    return 'ÖVERLEVDE'
  } catch { return 'död' }
}

const original = new Map([KOMPONENT, LIB].map(f => [f, readFileSync(f, 'utf8')]))
if (kor() !== 'ÖVERLEVDE') { console.error('Testerna är röda redan utan mutant — fixa det först.'); process.exit(1) }

let dodade = 0
for (const m of MUTANTER) {
  const kalla = original.get(m.fil)
  const byten = m.byten ?? [[m.fran, m.till]]
  let muterad = kalla
  let blind = false
  for (const [fran, till] of byten) {
    const antal = muterad.split(fran).length - 1
    if (antal !== 1) { console.error(`✗ ${m.namn}: mönstret finns ${antal} gånger i ${m.fil} — mutanten är blind.`); blind = true; break }
    muterad = muterad.replace(fran, till)
  }
  if (blind) { process.exitCode = 1; continue }
  writeFileSync(m.fil, muterad)
  const utfall = kor()
  writeFileSync(m.fil, kalla)
  if (utfall === 'död') { dodade++; console.log(`✓ död: ${m.namn}`) } else { console.log(`✗ ÖVERLEVDE: ${m.namn}`); process.exitCode = 1 }
}
for (const [f, t] of original) writeFileSync(f, t)
console.log(`\n${dodade} av ${MUTANTER.length} mutanter dödade`)
