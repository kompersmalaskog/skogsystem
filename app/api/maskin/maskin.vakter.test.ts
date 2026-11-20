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
  it('finns (sex stycken) och varje metod börjar med en vakt — utom /las, som bevisar sig med personens egen token', () => {
    expect(rutter.map(r => relative(join(ROT, 'app/api/maskin'), r)).sort()).toEqual(['kod/nollstall/route.ts', 'kod/route.ts', 'konto/route.ts', 'las-upp/route.ts', 'las/route.ts', 'vem/route.ts'])
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
