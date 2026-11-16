import { describe, expect, it } from 'vitest'
import { INBADDAD_KALLA, arKartLank, meddelandeForSokvag, oppnasOvanpa, tolkaMeddelande } from './inbaddad'

describe('vilka länkar öppnas ovanpå kartan', () => {
  it('appens egna vyer öppnas ovanpå', () => {
    for (const h of ['/arbetsrapport', '/uppfoljning', '/ledighet?besked=1', '/maskinvy?ny=1', '/admin/objektoversikt']) expect(oppnasOvanpa(h)).toBe(true)
  })
  it('kartan själv, startsidan, inloggningen och andra sajter gör det aldrig', () => {
    for (const h of ['/planering', '/planering?installningar=1', '/maskin?som=A1', '/', '/login', '/api/x', 'https://exempel.se', '//exempel.se', '', null, undefined]) expect(oppnasOvanpa(h)).toBe(false)
  })
  it('kartans adresser känns igen med och utan fråga', () => {
    expect(arKartLank('/planering?objekt=1')).toBe(true)
    expect(arKartLank('/planera')).toBe(false)
  })
})

describe('vad vyn i rutan säger till kartan', () => {
  it('startsidan = hem, kartan = till kartan, allt annat tyst', () => {
    expect(meddelandeForSokvag('/')).toEqual({ typ: 'hem' })
    expect(meddelandeForSokvag('/planering', '?objekt=7')).toEqual({ typ: 'karta', href: '/planering?objekt=7' })
    expect(meddelandeForSokvag('/arbetsrapport')).toBeNull()
  })
  it('bara våra egna meddelanden tolkas', () => {
    expect(tolkaMeddelande({ kalla: INBADDAD_KALLA, typ: 'hem' })).toEqual({ typ: 'hem' })
    expect(tolkaMeddelande({ kalla: INBADDAD_KALLA, typ: 'karta', href: '/planering?objekt=7' })).toEqual({ typ: 'karta', href: '/planering?objekt=7' })
    expect(tolkaMeddelande({ kalla: INBADDAD_KALLA, typ: 'karta', href: 'https://ond.se' })).toBeNull()
    expect(tolkaMeddelande({ kalla: 'annan', typ: 'hem' })).toBeNull()
    expect(tolkaMeddelande({ typ: 'hem' })).toBeNull()
    expect(tolkaMeddelande('hem')).toBeNull()
    expect(tolkaMeddelande(null)).toBeNull()
  })
})
