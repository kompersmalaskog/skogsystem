/** Källvakter: "iPad som maskin" hänger ihop i planeringsvyn — kortet är admin-gatat, platsfrågan sker i valets tryck, skärmen hålls vaken
 *  av EN modul (som begär om direkt), och "GPS saknas" är #956:s regel. */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sida = readFileSync('app/planering/page.tsx', 'utf8')

describe('iPad som maskin — koppling i page.tsx', () => {
  it('kortet visas bara för riktig admin och bara utan Web Serial (maskindatorn har sitt val i GPS-källa)', () => {
    expect(sida).toMatch(/\{!webSerialStott && isAdminRiktig && \(\s*<EnhetMaskinKort/)
  })
  it('platsfrågan ställs i SAMMA tryck som maskinvalet (iOS kräver en gest)', () => {
    expect(sida).toMatch(/onVal=\{\(id\) => \{ valjEnhetMaskin\(id\); if \(id && !platsAktiverad && !currentPosition\) aktiveraPlats\(\); \}\}/)
  })
  it('Starta som maskin laddar om /planering (startsekvensen går som på en Ponsse-dator)', () => {
    expect(sida).toContain("onStarta={() => window.location.assign('/planering')}")
  })
  it('skärmen hålls vaken av lib/skarmVaken medan körvyn eller ett objekt är öppet — ingen egen låsning kvar', () => {
    expect(sida).toMatch(/if \(!valtObjekt && !korvyActive\) return;\s*return hallSkarmenVakenIWebblasare\(\);/)
    expect(sida).not.toContain('screenWakeLockRef')
    expect(sida).not.toContain("wakeLock?.request")
  })
  it('"GPS saknas" efter 60 s: samma regel som #956 (lib/gpsSaknas), nollas i GPS-hanteraren, kollas bara medan körvyn är öppen', () => {
    expect(sida).toContain("import { gpsSaknas } from '@/lib/gpsSaknas'")
    expect(sida).toContain('senasteGiltigFixRef.current = Date.now();')
    expect(sida).toMatch(/gpsSaknas\(Date\.now\(\), senasteGiltigFixRef\.current, korvyOppnadMsRef\.current\)/)
    expect(sida).toMatch(/\{gpsSaknasNu && korvyActive && !startOverlayAktiv && \(/)
    expect(sida).toContain('GPS saknas – spåret loggas inte')
  })
  it('kursen/rotationen följer maskinläget (GPS-kurs), inte bara serial', () => {
    expect(sida).toContain('serialGpsAktiv || !!testlage || maskinlage')
  })
})
