import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VYER, GRUPPER, STANDARD_FAVORITER, MAX_FAVORITER, vyerFor, favoriterFor, grupperFor, ovrigtFor, sokVyer } from './vyer'

const ROT = join(__dirname, '..')
const sokvag = (href: string) => href.split('?')[0]

describe('vyregistret', () => {
  it('varje vy pekar på en sida som finns', () => {
    const saknas = VYER.filter(v => !existsSync(join(ROT, 'app', sokvag(v.href), 'page.tsx'))).map(v => v.href)
    expect(saknas).toEqual([])
  })

  it('id, adress och namn är unika', () => {
    for (const falt of ['id', 'href', 'namn'] as const) {
      const alla = VYER.map(v => v[falt])
      expect(new Set(alla).size).toBe(alla.length)
    }
  })

  it('varje vy hör till en känd grupp', () => {
    const kanda = new Set(GRUPPER.map(g => g.id))
    expect(VYER.filter(v => !kanda.has(v.grupp))).toEqual([])
  })

  it('INGET har tagits bort: varje ruta på gamla startsidan finns i registret, med samma spärr', () => {
    const gammal = readFileSync(join(ROT, 'app', 'HomeClient.tsx'), 'utf8')
    const hrefs = Array.from(gammal.matchAll(/href: '([^']+)'/g)).map(m => m[1])
    expect(hrefs.length).toBeGreaterThan(25)
    const iRegistret = new Set(VYER.map(v => v.href))
    expect(hrefs.filter(h => !iRegistret.has(h))).toEqual([])
    // Gamla sidans tre admin-poster är spärrade här också — och inget annat.
    expect(VYER.filter(v => v.bara === 'admin').map(v => v.href).sort())
      .toEqual(['/admin', '/admin/markagarrapport', '/ekonomi'])
  })

  it('förare ser aldrig en admin-vy — varken i grupperna, kontomenyn, favoriterna eller sökningen', () => {
    const adminHrefs = new Set(VYER.filter(v => v.bara === 'admin').map(v => v.href))
    const forare = [
      ...grupperFor('forare').flatMap(g => g.vyer),
      ...ovrigtFor('forare'),
      ...favoriterFor('forare', VYER.map(v => v.id)),
      ...sokVyer('forare', 'ekonomi'), ...sokVyer('forare', 'admin'), ...sokVyer('forare', 'markägar'),
    ]
    expect(forare.filter(v => adminHrefs.has(v.href))).toEqual([])
    expect(vyerFor('admin')).toHaveLength(VYER.length)
  })

  it('grupperna + kontomenyn innehåller varje synlig vy exakt en gång', () => {
    for (const roll of ['admin', 'forare'] as const) {
      const visade = [...grupperFor(roll).flatMap(g => g.vyer), ...ovrigtFor(roll)].map(v => v.id)
      expect(visade.sort()).toEqual(vyerFor(roll).map(v => v.id).sort())
    }
  })

  it('standardfavoriterna finns, är synliga för rollen och högst åtta', () => {
    for (const roll of ['admin', 'forare'] as const) {
      const ids = STANDARD_FAVORITER[roll]
      expect(ids.length).toBeLessThanOrEqual(MAX_FAVORITER)
      expect(favoriterFor(roll).map(v => v.id)).toEqual(ids)
    }
  })

  it('favoriter: okänt id och admin-vy för förare hoppas över, dubbletter tas bort, max åtta', () => {
    expect(favoriterFor('forare', ['ekonomi', 'finns-inte', 'ledighet', 'ledighet']).map(v => v.id)).toEqual(['ledighet'])
    expect(favoriterFor('admin', VYER.map(v => v.id))).toHaveLength(MAX_FAVORITER)
  })

  it('sökning: namn före sökord, början av namnet först, tom fråga ger inget', () => {
    expect(sokVyer('admin', '')).toEqual([])
    expect(sokVyer('admin', 'semester').map(v => v.id)).toEqual(['ledighet'])
    expect(sokVyer('admin', 'Maskin').map(v => v.id).slice(0, 3)).toEqual(['maskinvy', 'maskinvy-2', 'lastbilen'])
    expect(sokVyer('admin', 'flytt').map(v => v.id)).toEqual(['lastbilen'])
    expect(sokVyer('admin', 'ÖVERSIKT').map(v => v.id)).toEqual(['oversikt'])
  })
})
