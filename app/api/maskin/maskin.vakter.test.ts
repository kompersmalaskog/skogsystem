/**
 * Källvakter för "Maskinen som maskin": (1) varje rutt under /api/maskin börjar med en vakt, (2) service-nyckeln och kodhashen finns bara på servern,
 * (3) spärrlistan i migrationen är EXAKT samma som listan databasprovet och dess stub använder (så ingen tabell kan försvinna ur den ena utan att den
 * andra larmar), (4) varje tabell med personal-, tids- eller ekonomidata som finns i migrationerna står antingen i listan eller i den medvetna
 * undantagslistan nedan, (5) klienten nämner aldrig service-nyckeln.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROT = join(__dirname, '..', '..', '..')
const lasFil = (p: string) => readFileSync(join(ROT, p), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) filer(p, ut); else ut.push(p)
  }
  return ut
}

describe('rutterna under /api/maskin', () => {
  const rutter = filer(join(ROT, 'app/api/maskin')).filter(f => f.endsWith('route.ts'))
  it('finns (åtta stycken) och varje metod börjar med en vakt — utom /las, som bevisar sig med personens egen token', () => {
    expect(rutter.map(r => relative(join(ROT, 'app/api/maskin'), r)).sort()).toEqual(['auto/route.ts', 'kod-notis/route.ts', 'kod/nollstall/route.ts', 'kod/route.ts', 'konto/route.ts', 'las-upp/route.ts', 'las/route.ts', 'vem/route.ts'])
    for (const r of rutter) {
      const src = utanKommentarer(readFileSync(r, 'utf8'))
      const metoder = src.split(/export async function /).slice(1)
      expect(metoder.length).toBeGreaterThan(0)
      for (const m of metoder) {
        if (r.endsWith('las/route.ts') && !r.endsWith('las-upp/route.ts')) { expect(m).toMatch(/authorization/); continue }
        const forstaSatsen = m.slice(m.indexOf('{') + 1).trimStart()
        expect(forstaSatsen, `${relative(ROT, r)}: ${m.slice(0, 30)}`).toMatch(/^const (vakt|v) = await (kravMaskinkonto|kravPerson|kravRoll)\(/)
      }
    }
  })
  it('service-klienten skapas först EFTER vakten i varje rutt', () => {
    for (const r of rutter.filter(f => !f.endsWith('las/route.ts') || f.endsWith('las-upp/route.ts'))) {
      for (const m of utanKommentarer(readFileSync(r, 'utf8')).split(/export async function /).slice(1)) {
        if (m.includes('adminSupabase()')) expect(m.indexOf('adminSupabase()')).toBeGreaterThan(m.search(/await (kravMaskinkonto|kravPerson|kravRoll)\(/))
      }
    }
  })
})

describe('hemligheter', () => {
  it('ingen klientfil nämner service-nyckeln, kodens hash eller serverbiblioteken', () => {
    for (const f of [...filer(join(ROT, 'components')), ...filer(join(ROT, 'lib')), ...filer(join(ROT, 'app'))].filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
      const src = utanKommentarer(readFileSync(f, 'utf8'))
      const klient = /^\s*['"]use client['"]/m.test(src.slice(0, 200)) || relative(ROT, f).startsWith('components/')
      if (!klient) continue
      expect(src, relative(ROT, f)).not.toMatch(/SERVICE_ROLE|adminSupabase|lib\/auth\/admin|maskinkonto\/(kod|server)['"]|forare_maskinkod|kod_hash/)
    }
  })
  it('klienten skickar koden bara till servern (aldrig till supabase direkt) och sparar den aldrig', () => {
    const klient = utanKommentarer(lasFil('lib/maskinkonto/klient.ts') + lasFil('components/maskinkonto/VemArDuArk.tsx') + lasFil('components/maskinkonto/KodArk.tsx') + lasFil('components/maskinkonto/KodPlatta.tsx'))
    // Inga koder i webbläsarens minne: ingenting skrivs (setItem) och ingenting annat än Supabase-sessionens egna sb-nycklar rensas.
    expect(klient).not.toMatch(/setItem/)
    expect([...klient.matchAll(/(?:localStorage|sessionStorage)[^\n]*/g)].map(m => m[0]).every(rad => /sb-/.test(rad) && /removeItem|Object\.keys/.test(rad))).toBe(true)
    expect(klient).not.toMatch(/\.from\(['"](forare_maskinkod|maskin_kod_las)/)
  })
})

describe('spärrlistan', () => {
  const migration = lasFil('supabase/migrations/20261120150002_maskinkonto_2_sparr.sql')
  const iMigrationen = [...migration.slice(migration.indexOf('tabeller text[] := array['), migration.indexOf('];\nbegin')).matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]).sort()
  const stub = lasFil('supabase/tests/maskinkonto_lokal/stub2.sql')
  const iStub = [...stub.slice(stub.indexOf('insert into sparrade values'), stub.indexOf('do $$ declare t text; begin\n  for t in select tabell from sparrade')).matchAll(/\('([a-z_0-9]+)'\)/g)].map(m => m[1]).sort()
  it('migrationen och databasprovet spärrar exakt samma tabeller (68 st)', () => {
    expect(iMigrationen.length).toBeGreaterThan(60)
    expect(iStub).toEqual(iMigrationen)
  })
  it('varje tabell vars namn tyder på timmar, lön, ledighet, personal eller ekonomi och som skapats i migrationerna är spärrad eller medvetet undantagen', () => {
    const migDir = join(ROT, 'supabase/migrations')
    const skapade = new Set<string>()
    for (const f of readdirSync(migDir)) for (const m of readFileSync(join(migDir, f), 'utf8').matchAll(/create table (?:if not exists )?(?:public\.)?"?([a-z_0-9]+)"?/gi)) skapade.add(m[1].toLowerCase())
    const misstankta = [...skapade].filter(t => /(lon|loner|timmar|arbetsdag|extra_tid|franvaro|ledighet|vilobrott|atk|medarbetare|personal|faktura|fortnox|acord|pris|ekonomi|avtal|saldo|utbildning|certifikat)/.test(t))
    // Medvetet öppna för maskinkontot (förklaring per rad). En NY tabell som hamnar här utan att stå i listan eller här ska avgöras av en människa.
    const undantag: Record<string, string> = {
      medarbetare: 'egen rad får läsas (appen måste veta vem den är); skrivning spärras av egna policyer',
      medarbetare_namn: 'vy: bara förnamn på aktiva — maskinraden är aktiv = false',
      inventarie_artikel: 'lagerlista, inga kronor', maskin_service: 'servicelogg per maskin', maskin_timmatare: 'maskinens timmätare (maskinen, inte personal)',
      push_subscriptions: 'egna prenumerationer', am_introduktion: 'egna rader (RLS)', am_arshjul_gjort: 'arbetsmiljö, bara admin', am_uppgift_godkannande: 'egna rader (RLS)',
      klar_trakt_paminnelse: 'egna rader (RLS)', startsida_favoriter: 'egna rader (RLS)', objekt_ekonomi: 'spärrad', hist_stopp: 'spärrad',
      kalibrering_kontroll_regler: 'regler för kalibrering', objekt_prisscenario: 'spärrad', lastbil_lass: 'admin-RLS', lastbil_lass_state: 'admin-RLS',
      maskin_flytt_rattning: 'admin-RLS', skotar_lass_granskning: 'admin-RLS', tma_assessments: 'planering', bestallningar: 'beställd volym per bolag (helikopter), inga kronor',
      utbildning_status: 'vy med security_invoker — följer underliggande spärr', maskin_position: 'maskinens position', objekt_priser: 'spärrad',
    }
    const spar = new Set(iMigrationen)
    const oklara = misstankta.filter(t => !spar.has(t) && !(t in undantag) && !/^(backup_|_backup|hist_|maskin_kod|forare_maskinkod|maskin_upplasning|maskin_konto)/.test(t))
    expect(oklara, 'en tabell som ser ut som personal/tid/ekonomi saknar beslut — lägg den i spärrlistan (migration 2 + stub2.sql) eller i undantagslistan med ett skäl').toEqual([])
  })
})


describe('"Välj koden från maskinen" — maskinen låser aldrig upp av sig själv', () => {
  const kodNotis = utanKommentarer(lasFil('app/api/maskin/kod-notis/route.ts'))
  it('rutten för notisen ger aldrig en token eller en session: ingen generateLink, ingen verifyOtp, ingen hash-kontroll, ingen pepper', () => {
    expect(kodNotis).not.toMatch(/generateLink|token_hash|verifyOtp|setSession|stammerKod|skapaHash|MASKIN_KOD_PEPPAR|kod_hash/)
    expect(kodNotis).not.toMatch(/auth\.admin/)
  })
  it('bara två rutter skapar en token: upplåsningen (kräver koden före generateLink) och det automatiska maskinbytet (bara åt MASKINENS konto, bara för en inloggad person)', () => {
    for (const f of filer(join(ROT, 'app/api')).filter(f => f.endsWith('.ts') && !/\.test\./.test(f))) {
      const src = utanKommentarer(readFileSync(f, 'utf8'))
      if (/generateLink/.test(src)) expect(['app/api/maskin/las-upp/route.ts', 'app/api/maskin/auto/route.ts']).toContain(relative(ROT, f).replace(/\\/g, '/'))
    }
    const lasUpp = utanKommentarer(lasFil('app/api/maskin/las-upp/route.ts'))
    expect(lasUpp.indexOf('stammerKod(')).toBeGreaterThan(-1)
    expect(lasUpp.indexOf('generateLink')).toBeGreaterThan(lasUpp.indexOf('stammerKod('))
  })
  it('arket frågar bara (hamtaHarKod) — det låser aldrig upp, och bara kodplattan anropar lasUppMedKod', () => {
    const ark = utanKommentarer(lasFil('components/maskinkonto/VemArDuArk.tsx'))
    expect(ark.match(/lasUppMedKod\(/g)?.length).toBe(1)
    expect(ark).toMatch(/const r = await lasUppMedKod\(person, kod\)/)
    const klient = utanKommentarer(lasFil('lib/maskinkonto/klient.ts'))
    const hamta = klient.slice(klient.indexOf('export async function hamtaHarKod'), klient.indexOf('export type LasUppSvar'))
    expect(hamta).not.toMatch(/POST|verifyOtp|sattUpplast|sattMaskinSession/)
  })
  it('tvåminutersgränsen och loggningen bor i databasen: migrationen låser per person, loggar båda utfallen och är bara öppen för servern', () => {
    const m = lasFil('supabase/migrations/20261120170001_maskinkonto_5_kod_notis.sql')
    expect(m).toMatch(/pg_advisory_xact_lock/)
    expect(m).toMatch(/interval '2 minutes'/)
    for (const u of ['kod_notis', 'kod_notis_vantar', 'kod_notis_ingen_push']) expect(m).toContain(`'${u}'`)
    expect(m).toMatch(/revoke all on function public\.maskin_kod_notis_begar\(uuid, text\) from public, anon, authenticated/)
    expect(m).toMatch(/grant execute on function public\.maskin_kod_notis_begar\(uuid, text\) to service_role/)
  })
  it('notisens innehåll: ingen kod och inget personligt — bara maskinens namn — och den köas bakom skickas_at = infinity', () => {
    const n = utanKommentarer(lasFil('lib/maskinkonto/notis.ts'))
    const del = n.slice(n.indexOf('export async function byggKodValNotis'), n.indexOf('/** Köar notisen till personens'))
    expect(del).not.toMatch(/kod_hash|\.namn\b|epost|telefon/)
    expect(n).toMatch(/skickas_at: 'infinity', dedup_nyckel: `kodval:/)
    expect(lasFil('app/api/notis/flush/route.ts')).toMatch(/MASKIN_KOD_SPAR, MASKIN_KOD_VAL, KALIB_MATDON/)
  })
})

describe('maskinens konto skapas av sig självt — och bara på de villkoren', () => {
  it('rutten: bara en person (kravPerson), maskinen måste finnas, brytaren kontrolleras FÖRE kontot skapas och FÖRE engångstoken — och svaret bär aldrig adressen eller lösenordet', () => {
    const r = utanKommentarer(lasFil('app/api/maskin/auto/route.ts'))
    expect(r.indexOf('kravPerson()')).toBeGreaterThan(-1)
    expect(r).not.toMatch(/kravMaskinkonto|kravRoll/)
    const brytare = r.indexOf('maskin_konto')
    expect(brytare).toBeGreaterThan(r.indexOf('dim_maskin'))
    expect(r.indexOf('sakraMaskinkonto(')).toBeGreaterThan(brytare)
    expect(r.indexOf('generateLink')).toBeGreaterThan(r.indexOf('sakraMaskinkonto('))
    expect(r).toMatch(/if \(!brytare\?\.aktiv\)/)
    const svar = r.slice(r.lastIndexOf('NextResponse.json'))
    expect(svar).not.toMatch(/epost|losenord|password|user_id|userId/)
  })
  it('auth-användare skapas bara av autoKonto (och inbjudan av personal) — en människa kan inte skapa ett maskinkonto med en egen adress eller ett eget lösenord', () => {
    for (const f of [...filer(join(ROT, 'app')), ...filer(join(ROT, 'lib')), ...filer(join(ROT, 'components'))].filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
      const src = utanKommentarer(readFileSync(f, 'utf8'))
      if (/auth\.admin\.createUser/.test(src)) expect(['lib/maskinkonto/autoKonto.ts']).toContain(relative(ROT, f).replace(/\\/g, '/'))
    }
    expect(lasFil('app/api/maskin/konto/route.ts')).not.toMatch(/export async function POST/)
    expect(utanKommentarer(lasFil('components/admin/MaskinkontoSektion.tsx'))).not.toMatch(/losenord|epost|Lägg upp/i)
  })
  it('webbläsaren: blirMaskinAutomatiskt anropas bara av maskin-providern, efter skaBlimaMaskin, och aldrig på ett testläge', () => {
    const anropare: string[] = []
    for (const f of [...filer(join(ROT, 'app')), ...filer(join(ROT, 'lib')), ...filer(join(ROT, 'components'))].filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))) {
      if (/blirMaskinAutomatiskt\(/.test(utanKommentarer(readFileSync(f, 'utf8')))) anropare.push(relative(ROT, f).replace(/\\/g, '/'))
    }
    expect(anropare.sort()).toEqual(['components/maskinkonto/MaskinKontoProvider.tsx', 'lib/maskinkonto/klient.ts'])
    const prov = utanKommentarer(lasFil('components/maskinkonto/MaskinKontoProvider.tsx'))
    expect(prov.indexOf('skaBlimaMaskin({')).toBeGreaterThan(-1)
    expect(prov.indexOf('blirMaskinAutomatiskt(')).toBeGreaterThan(prov.indexOf('skaBlimaMaskin({'))
    expect(prov).toMatch(/if \(lage !== 'vanlig' \|\| loading \|\| !medarbetare\) return/)
    const start = utanKommentarer(lasFil('lib/maskinkonto/autoStart.ts'))
    for (const villkor of ["a.roll !== 'forare' && a.roll !== 'admin'", 'arUndantagenSokvag(a.pathname)', '!a.harWebSerial', '!a.serialFlagga', 'a.beviljadePortar > 0', '!a.enhetMaskinId', 'a.pausTill > a.nu']) expect(start).toContain(villkor)
    expect(start).toMatch(/path === '\/maskin' \|\| path\.startsWith\('\/maskin\/'\)/)    // testläget
  })
  it('nödfallet: "Logga ut maskinen" pausar bytet innan utloggningen, så att en person kan logga in som sig själv', () => {
    const k = utanKommentarer(lasFil('lib/maskinkonto/klient.ts'))
    const ut = k.slice(k.indexOf('export async function loggaUtMaskinen'))
    expect(ut.indexOf('sattAutoPaus(')).toBeGreaterThan(-1)
    expect(ut.indexOf('sattAutoPaus(')).toBeLessThan(ut.indexOf('aterMaskin()'))
  })
  it('personens session lämnas aldrig kvar efter bytet: den spärras på servern och minnet av en upplåsning rensas', () => {
    const k = utanKommentarer(lasFil('lib/maskinkonto/klient.ts'))
    const f = k.slice(k.indexOf('export async function blirMaskinAutomatiskt'), k.indexOf('export async function loggaUtMaskinen'))
    expect(f).toMatch(/\/api\/maskin\/las/)
    expect(f).toMatch(/sattUpplast\(null\)/); expect(f).toMatch(/sattMaskinSession\(null\)/)
    expect(f.indexOf('verifyOtp')).toBeLessThan(f.indexOf('/api/maskin/las'))     // maskinkontot är inloggat INNAN personens session spärras
  })
})
