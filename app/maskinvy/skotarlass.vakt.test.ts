// Vakt: skotarens lass i maskinvyn kommer ur BÅDA källorna (Opti + appen). De gamla RPC:erna ser bara Opti — en vy som läser dem
// visar "Senast 2 nov · Ingen körning idag" för en maskin som rapporterar i appen (Elefant 26 och 810E, 2026-11-26).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const ROT = process.cwd()
const kod = (mapp: string) => readdirSync(join(ROT, mapp))
  .filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)).map(f => ({ fil: `${mapp}/${f}`, text: readFileSync(join(ROT, mapp, f), 'utf8') }))

describe('maskinvyn läser lass ur maskindata_lass_alla', () => {
  const filer = [...kod('app/maskinvy'), ...kod('lib/maskinvy')]

  it("ingen vy anropar de gamla 'maskindata_lass' / 'maskindata_lass_senaste' (strängen ensam mellan citattecken)", () => {
    const traffar = filer.filter(f => /['"`]maskindata_lass(_senaste)?['"`]/.test(f.text)).map(f => f.fil)
    expect(traffar).toEqual([])
  })

  it('de delade läsarna pekar på de nya RPC:erna', () => {
    const shared = readFileSync(join(ROT, 'app/maskinvy/OversiktShared.tsx'), 'utf8')
    expect(shared).toMatch(/fakt_lass:\s+RPC_LASS/)
    const volym = readFileSync(join(ROT, 'lib/maskinvy/skotarvolym.ts'), 'utf8')
    expect(volym).toContain('rpcPaginerat<SkotarLassRad>(RPC_LASS')
    expect(readFileSync(join(ROT, 'app/maskinvy/useSidolista.ts'), 'utf8')).toContain('RPC_LASS_SENASTE')
    expect(readFileSync(join(ROT, 'app/maskinvy/Livestatus.tsx'), 'utf8')).toContain('RPC_LASS_SENASTE')
    expect(readFileSync(join(ROT, 'app/maskinvy/SkotareIdagNy.tsx'), 'utf8')).toContain('RPC_LASS_SENASTE')
  })

  it('skotarvyerna delar INTE körsträckan på alla lass: snittSkotningsavstandM får bara anropas via snittAvstandM (lass med mått)', () => {
    const traffar = filer.filter(f => f.fil !== 'lib/maskinvy/skotarlass.ts' && /snittSkotningsavstandM\(/.test(f.text)).map(f => f.fil)
    expect(traffar).toEqual([])
  })
})

describe('migrationen med RPC:erna bär regeln', () => {
  const mig = readdirSync(join(ROT, 'supabase/migrations')).find(f => /maskindata_lass_alla/.test(f))
  const sql = mig ? readFileSync(join(ROT, 'supabase/migrations', mig), 'utf8') : ''

  it('finns, med båda funktionerna', () => {
    expect(mig).toBeTruthy()
    expect(sql).toContain('function public.maskindata_lass_alla(')
    expect(sql).toContain('function public.maskindata_lass_senaste_alla(')
  })

  it('regel A: per maskin + objekt + dag den källa med mest volym, lika → Opti, källorna summeras aldrig', () => {
    expect(sql).toContain("when a.m3 > o.m3  then 'app'")
    expect(sql).toContain("else 'opti' end")
    expect(sql).toContain('full join app_sum a on a.maskin_id = o.maskin_id and a.okey = o.okey and a.datum = o.datum')
    // en vinnare per nyckel: varje källas rader hämtas bara där den vann
    expect(sql).toContain("v.kalla = 'opti'")
    expect(sql).toContain("v.kalla = 'app'")
    expect(sql).not.toMatch(/union all[\s\S]*sum\(o\.m3\s*\+\s*a\.m3\)/i)
  })

  it('bara klara app-lass räknas (vyn skotar_lass_sortiment_skalat), strukna/auto/obekräftade aldrig', () => {
    expect(sql).toContain('from skotar_lass_sortiment_skalat')
  })

  it('"senaste" returnerar INGA rader utan lass — NULL som datumgräns betyder obegränsat och får aldrig leda till alla rader', () => {
    expect(sql).toContain('where d.dag is not null')
  })

  it('stängd för anon, öppen för inloggade', () => {
    expect(sql).toMatch(/revoke execute on function public\.maskindata_lass_alla\(text\[\], date, date\) from public, anon/)
    expect(sql).toMatch(/grant\s+execute on function public\.maskindata_lass_alla\(text\[\], date, date\) to authenticated/)
  })
})
