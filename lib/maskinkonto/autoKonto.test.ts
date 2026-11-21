/** Maskinkontot skapas av servern själv: en gång per maskin, aldrig dubbelt, och inget halvt konto blir kvar när något går fel. */
import { describe, it, expect } from 'vitest'
import { kontoDb, type Tabeller } from './kontoDb.testStod'
import { sakraMaskinkonto, maskinEpost, MASKIN_EPOST_DOMANER } from './autoKonto'

const H8 = { maskin_id: 'R64428', visningsnamn: 'H8E -26' }
const tabeller = (over: Tabeller = {}): Tabeller => ({ medarbetare: [], maskin_konto: [{ maskin_id: 'R64428', aktiv: true, user_id: null, medarbetare_id: null, epost: null }], ...over })

describe('maskinens konto', () => {
  it('adressen bestäms av maskinen, inte av en människa: reserverad domän, ingen riktig brevlåda', () => {
    expect(maskinEpost('R64428')).toBe('maskin-r64428@maskin.invalid')
    expect(maskinEpost('PONS20SDJAA270231')).toBe('maskin-pons20sdjaa270231@maskin.invalid')
    expect(maskinEpost('A 1/2')).toBe('maskin-a-1-2@maskin.invalid')
    expect(MASKIN_EPOST_DOMANER).toEqual(['maskin.invalid', 'example.com'])
  })

  it('första starten skapar kontot: auth-användare, medarbetarrad roll maskin (aktiv = false) och kopplingen i maskin_konto', async () => {
    const t = tabeller(); const db = kontoDb(t)
    const r = await sakraMaskinkonto(db, H8, 'admin-1')
    expect(r).toMatchObject({ ok: true, skapad: true, epost: 'maskin-r64428@maskin.invalid' })
    expect(db.spar.skapade).toHaveLength(1)
    expect(db.spar.skapade[0].password.length).toBeGreaterThanOrEqual(20)     // slumpat, aldrig något som visas
    expect(t.medarbetare).toHaveLength(1)
    expect(t.medarbetare[0]).toMatchObject({ roll: 'maskin', aktiv: false, maskin_id: 'R64428', namn: 'H8E -26', user_id: 'u-ny-1' })
    expect(t.maskin_konto[0]).toMatchObject({ user_id: 'u-ny-1', medarbetare_id: t.medarbetare[0].id, aktiv: true })
  })

  it('andra starten återanvänder samma konto: inget nytt skapas', async () => {
    const t = tabeller(); const db = kontoDb(t)
    const a = await sakraMaskinkonto(db, H8, null)
    const b = await sakraMaskinkonto(db, H8, null)
    expect(a).toMatchObject({ ok: true, skapad: true }); expect(b).toMatchObject({ ok: true, skapad: false })
    expect(b.ok && a.ok && b.userId).toBe(a.ok && a.userId)
    expect(db.spar.skapade).toHaveLength(1); expect(t.medarbetare).toHaveLength(1)
  })

  it('två enheter som startar samtidigt får ETT konto: den som kommer sist släpper sitt och använder det första', async () => {
    const t = tabeller(); const db = kontoDb(t)
    // Enhet B har läst "inget konto än" och skapar sin auth-användare — och just då kopplar enhet A sitt konto. B:s villkorade koppling träffar inget.
    const skapa = db.auth.admin.createUser
    db.auth.admin.createUser = (async (a: any) => {
      const r = await skapa(a)
      t.maskin_konto[0].user_id = 'u-annan'; t.maskin_konto[0].medarbetare_id = 'med-annan'; t.maskin_konto[0].epost = 'maskin-r64428@maskin.invalid'
      return r
    }) as any
    const b = await sakraMaskinkonto(db, H8, null)
    expect(b).toMatchObject({ ok: true, skapad: false, userId: 'u-annan' })
    expect(db.spar.raderade).toEqual(['u-ny-1'])           // B:s egen auth-användare städas bort
    expect(t.medarbetare).toHaveLength(0)                  // och dess medarbetarrad
    expect(t.maskin_konto[0].user_id).toBe('u-annan')      // A:s koppling rörs inte
  })

  it('går kopplingen sönder tas auth-användaren och medarbetarraden bort igen — inget halvt konto blir kvar', async () => {
    const t = tabeller({ maskin_konto: [] })           // maskin_konto har ingen rad: kopplingen träffar ingenting
    const db = kontoDb(t)
    const r = await sakraMaskinkonto(db, H8, null)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(db.spar.raderade).toEqual(['u-ny-1'])
    expect(t.medarbetare).toHaveLength(0)
  })

  it('går medarbetarraden inte att lägga in tas auth-användaren bort igen — inget halvt konto blir kvar', async () => {
    const t = tabeller(); const db = kontoDb(t, { insertFel: (tabell) => tabell === 'medarbetare' })
    const r = await sakraMaskinkonto(db, H8, null)
    expect(r).toMatchObject({ ok: false, status: 500 })
    expect(db.spar.raderade).toEqual(['u-ny-1'])
    expect(t.maskin_konto[0].user_id).toBeNull()
  })

  it('en adress som redan är tagen (avbrutet försök): den befintliga medarbetarraden används, inget nytt skapas', async () => {
    const t = tabeller({ medarbetare: [{ id: 'med-gammal', roll: 'maskin', epost: 'maskin-r64428@maskin.invalid', user_id: 'u-gammal' }] })
    const db = kontoDb(t, { createFel: () => 'A user with this email address has already been registered' })
    const r = await sakraMaskinkonto(db, H8, null)
    expect(r).toMatchObject({ ok: true, userId: 'u-gammal', skapad: false })
    expect(db.spar.skapade).toHaveLength(0)
    expect(t.maskin_konto[0]).toMatchObject({ user_id: 'u-gammal', medarbetare_id: 'med-gammal' })
  })

  it('godkänner första domänen inte adressen prövas nästa — och skapar aldrig två konton', async () => {
    const t = tabeller(); const db = kontoDb(t, { createFel: (e) => (e.endsWith('@maskin.invalid') ? 'Unable to validate email address: invalid format' : null) })
    const r = await sakraMaskinkonto(db, H8, null)
    expect(r).toMatchObject({ ok: true, skapad: true, epost: 'maskin-r64428@example.com' })
    expect(db.spar.skapade).toHaveLength(1)
  })

  it('går ingen adress att skapa blir svaret ett fel och inget skrivs', async () => {
    const t = tabeller(); const db = kontoDb(t, { createFel: () => 'invalid' })
    const r = await sakraMaskinkonto(db, H8, null)
    expect(r).toMatchObject({ ok: false, status: 500 })
    expect(t.medarbetare).toHaveLength(0); expect(db.skrivningar.filter(s => s.tabell === 'maskin_konto')).toHaveLength(0)
  })
})
