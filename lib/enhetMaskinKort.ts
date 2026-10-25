// "Den här enheten är maskin" — iPad/surfplatta i hytten (t.ex. 810E, inget serial-GPS). Samma val som maskindatorns, men utan Web Serial:
// admin väljer maskin EN gång, valet sparas på enheten (enhet_maskin_id) och därefter startar enheten alltid i den maskinens körvy.
// Rena funktioner (testbara); kortet själv är components/planering/EnhetMaskinKort.tsx.
import { valbaraMaskiner, type MaskinRegisterRad } from './maskinFraga'

export type PlatsStatus = 'okand' | 'soker' | 'ok' | 'nekad'

export type MaskinVal = { maskinId: string; namn: string; slag: 'Skördare' | 'Skotare' }

/** Aktiva maskiner med känd roll — samma urval som "Vilken maskin är det här?". */
export function maskinVal(register: MaskinRegisterRad[], idagISO: string): MaskinVal[] {
  return valbaraMaskiner(register, idagISO).map((m) => ({ maskinId: m.maskinId, namn: m.namn, slag: m.roll === 'skordare' ? 'Skördare' : 'Skotare' }))
}

/** Kortets svar: vad enheten ÄR just nu. */
export function enhetSvar(valdNamn: string | null): string {
  return valdNamn ? `Den här enheten är maskin: ${valdNamn}` : 'Den här enheten är ingen maskin'
}

export type Forberedelse = { id: 'app' | 'plats' | 'skarm'; titel: string; under: string; ok: boolean | null }

/** Tre saker som måste vara rätt på iPaden för att körvyn ska fungera. `ok: null` = kan inte läsas härifrån (visas som "Kolla själv"). */
export function forberedelser(a: { installerad: boolean; plats: PlatsStatus }): Forberedelse[] {
  return [
    {
      id: 'app',
      titel: a.installerad ? 'Appen är installerad' : 'Installera appen på hemskärmen',
      under: a.installerad ? 'Körs som egen app, utan webbläsarens fält.' : 'Safari: Dela → Lägg till på hemskärmen. Öppna sedan appen därifrån.',
      ok: a.installerad,
    },
    {
      id: 'plats',
      titel: a.plats === 'ok' ? 'Plats fungerar' : a.plats === 'nekad' ? 'Plats är nekad' : a.plats === 'soker' ? 'Söker plats …' : 'Plats är inte tillåten än',
      under: a.plats === 'ok' ? 'Positionen kommer.' : a.plats === 'nekad'
        ? 'iPad: Inställningar → Integritet och säkerhet → Platstjänster → Kompersmåla → Vid användning (eller Alltid).'
        : 'Tillåt plats när iPaden frågar — välj Vid användning eller Alltid.',
      ok: a.plats === 'ok' ? true : a.plats === 'nekad' ? false : null,
    },
    {
      id: 'skarm',
      titel: 'Autolås: Aldrig',
      under: 'iPad: Inställningar → Skärm och ljusstyrka → Autolås → Aldrig. Appen håller skärmen vaken i körvyn, men det här är reserven.',
      ok: null,
    },
  ]
}
