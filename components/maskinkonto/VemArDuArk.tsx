'use client'

// "Vem är du?" — förarna som stora namnknappar, maskinens förare först. Tryck på ett namn → fyra prickar och sifferknappar. Rätt kod låser upp
// maskinen för just den personen (hela appen som hen, med hens egna behörigheter) tills hen går tillbaka till kartan, trycker Lås eller
// 10 minuter går utan tryck. Fem fel i rad: en minuts väntan för det namnet.
//
// Har personen ingen kod ("Välj koden från maskinen"): tryck på namnet skickar en notis till hens telefon ("Välj din kod för <maskin>"), arket säger
// det och "Skicka igen" är grå med nedräkning i två minuter. Saknar hen push i telefonen står reservtexten (Profil → Kod för maskinen) i stället.
// Medan arket väntar frågar det var tredje sekund om koden är vald; när den är det visas sifferplattan för just den personen. Arket låser ALDRIG upp
// något av sig självt — upplåsningen sker bara när personen skriver sin kod. Stängs arket slutar frågandet.
import { useCallback, useEffect, useState } from 'react'
import Ark from '@/components/design/Ark'
import KodPlatta from '@/components/maskinkonto/KodPlatta'
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens'
import { begarKodNotis, hamtaHarKod, hamtaPersoner, lasUppMedKod, type KodNotisSvar, type Person } from '@/lib/maskinkonto/klient'
import { KOD_NOTIS_MIN_MS } from '@/lib/maskinkonto/notis'
import { serverNu } from '@/lib/serverKlocka'

type Steg = { typ: 'lista' } | { typ: 'kod'; person: Person }
/** Hur ofta arket frågar om personen har valt sin kod (medan det väntar på det). */
export const KOD_FRAGA_MS = 3000

type Notis = 'begar' | { typ: 'skickad' | 'vantar' } | 'ingen_push' | 'fel' | null

export default function VemArDuArk({ efterUpplasning, onStang }: { efterUpplasning: string; onStang: () => void }) {
  const [personer, setPersoner] = useState<Person[] | null | 'fel'>(null)
  const [steg, setSteg] = useState<Steg>({ typ: 'lista' })
  const [skaka, setSkaka] = useState(0)
  const [arbetar, setArbetar] = useState(false)
  const [vantarTill, setVantarTill] = useState<number | null>(null)
  const [nu, setNu] = useState(() => Date.now())
  const [meddelande, setMeddelande] = useState<string | null>(null)
  const [notis, setNotis] = useState<Notis>(null)
  const [notisTill, setNotisTill] = useState<number | null>(null)

  const ladda = useCallback(() => { setPersoner(null); void hamtaPersoner().then(p => setPersoner(p ?? 'fel')) }, [])
  useEffect(() => { ladda() }, [ladda])

  // Nedräkningen under väntan (en minut).
  useEffect(() => {
    if (vantarTill === null) return
    const t = setInterval(() => { const n = Date.now(); setNu(n); if (n >= vantarTill) setVantarTill(null) }, 500)
    return () => clearInterval(t)
  }, [vantarTill])
  const sekKvar = vantarTill ? Math.max(0, Math.ceil((vantarTill - nu) / 1000)) : 0
  useEffect(() => {
    if (notisTill === null) return
    const t = setInterval(() => { const n = Date.now(); setNu(n); if (n >= notisTill) setNotisTill(null) }, 500)
    return () => clearInterval(t)
  }, [notisTill])
  const notisSek = notisTill ? Math.max(0, Math.ceil((notisTill - nu) / 1000)) : 0

  // Begär notisen om att välja kod. Går alltid via servern, som avgör tvåminutersgränsen; "kvar" räknas på serverns klocka (maskinens kan gå fel).
  const begar = useCallback(async (p: Person) => {
    setNotis('begar'); setNotisTill(null)
    const r: KodNotisSvar = await begarKodNotis(p)
    if (r.typ === 'harKod') { setPersoner(prev => Array.isArray(prev) ? prev.map(x => x.id === p.id ? { ...x, harKod: true } : x) : prev); setNotis(null); return }
    if (r.typ === 'ingen_push') { setNotis('ingen_push'); return }
    if (r.typ === 'fel') { setNotis('fel'); return }
    setNotis({ typ: r.typ })
    const till = r.vantarTill ? Date.parse(r.vantarTill) : NaN
    const kvarMs = Number.isNaN(till) ? KOD_NOTIS_MIN_MS : Math.min(KOD_NOTIS_MIN_MS, Math.max(0, till - serverNu()))
    setNu(Date.now()); setNotisTill(Date.now() + kvarMs)
  }, [])

  // Medan en person utan kod är vald: fråga om koden har valts. Bara en läsning — ingenting låses upp härifrån.
  const valdId = steg.typ === 'kod' ? steg.person.id : null
  const valdHarKod = steg.typ === 'kod' && Array.isArray(personer) ? (personer.find(p => p.id === steg.person.id)?.harKod ?? steg.person.harKod) : null
  useEffect(() => {
    if (valdId === null || valdHarKod !== false) return
    let avbruten = false
    const t = setInterval(() => {
      void hamtaHarKod(valdId).then(finns => {
        if (avbruten || finns !== true) return
        setPersoner(prev => Array.isArray(prev) ? prev.map(x => x.id === valdId ? { ...x, harKod: true } : x) : prev)
      })
    }, KOD_FRAGA_MS)
    return () => { avbruten = true; clearInterval(t) }
  }, [valdId, valdHarKod])

  const valjPerson = (p: Person) => {
    setMeddelande(null); setVantarTill(null); setNotis(null); setNotisTill(null); setSteg({ typ: 'kod', person: p })
    if (!p.harKod) void begar(p)
  }

  const kontrollera = async (person: Person, kod: string) => {
    setArbetar(true); setMeddelande(null)
    const r = await lasUppMedKod(person, kod)
    if (r.ok) { window.location.assign(efterUpplasning); return }
    setArbetar(false)
    setSkaka(n => n + 1)
    if (r.fel === 'ingen_kod') { setPersoner(prev => Array.isArray(prev) ? prev.map(x => x.id === person.id ? { ...x, harKod: false } : x) : prev); return }
    if ((r.fel === 'vantar' || r.fel === 'fel_kod') && r.vantarTill) {
      const t = new Date(r.vantarTill).getTime()
      if (!Number.isNaN(t) && t > Date.now()) { setNu(Date.now()); setVantarTill(t); setMeddelande('Fel kod fem gånger. Vänta en minut.'); return }
    }
    setMeddelande(r.fel === 'fel_kod' ? 'Fel kod. Försök igen.' : r.fel === 'natverk' ? 'Ingen täckning just nu. Försök igen.' : 'Det gick inte att låsa upp. Försök igen.')
  }

  const person = steg.typ === 'kod' ? (Array.isArray(personer) ? personer.find(p => p.id === steg.person.id) ?? steg.person : steg.person) : null
  const grupper = Array.isArray(personer) ? [
    { namn: '', lista: personer.filter(p => p.roll === 'forare') },
    { namn: 'Arbetsledning', lista: personer.filter(p => p.roll === 'admin') },
  ].filter(g => g.lista.length > 0) : []

  return (
    <Ark rubrik={steg.typ === 'kod' ? person!.namn : 'Vem är du?'} onStang={onStang}>
      <style>{designCss}</style>
      {steg.typ === 'kod' && person && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.l, paddingBottom: AVSTAND.l }}>
          {!person.harKod ? (
            <div data-ingen-kod style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.m, margin: `${AVSTAND.l}px 0`, maxWidth: 420 }}>
              {notis === 'ingen_push' ? (
                <p data-kod-notis="ingen-push" style={{ ...TYP.listtitel, textAlign: 'center', margin: 0 }}>Öppna appen i telefonen → Profil → Kod för maskinen</p>
              ) : (
                <>
                  <p data-kod-notis={notis === 'fel' ? 'fel' : notis === 'begar' || notis === null ? 'skickar' : 'skickad'} style={{ ...TYP.listtitel, textAlign: 'center', margin: 0 }}>
                    {notis === 'fel' ? 'Kunde inte skicka notisen. Kontrollera täckningen.'
                      : notis === 'begar' || notis === null ? 'Skickar en notis till din telefon …'
                      : 'Välj din kod i telefonen – vi har skickat en notis till dig'}
                  </p>
                  <button type="button" data-skicka-igen disabled={notis === 'begar' || notisSek > 0} onClick={() => void begar(person)}
                    style={{ ...KNAPP.sekundar, ...((notis === 'begar' || notisSek > 0) ? INAKTIV : null), minHeight: TRAFFYTA.min, touchAction: 'manipulation' }}>
                    {notisSek > 0 ? `Skicka igen (${notisSek} s)` : 'Skicka igen'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <KodPlatta onFyra={k => void kontrollera(person, k)} skakaNyckel={skaka} stangd={arbetar || sekKvar > 0}
              etikett={arbetar ? 'Kontrollerar …' : sekKvar > 0 ? `Vänta ${sekKvar} s` : 'Skriv din kod'} />
          )}
          {meddelande && <p role="alert" style={{ ...TYP.meta, color: sekKvar > 0 ? FARG.orange : FARG.text2, margin: 0, textAlign: 'center' }}>{meddelande}</p>}
          <button type="button" onClick={() => { setSteg({ typ: 'lista' }); setMeddelande(null); setVantarTill(null); setNotis(null); setNotisTill(null) }} style={{ ...KNAPP.lank, ...TYP.text, minHeight: TRAFFYTA.min }}>Det är inte jag</button>
        </div>
      )}
      {steg.typ === 'lista' && (
        <>
          {personer === null && <p style={{ ...TYP.meta, color: FARG.text2 }}>Hämtar namnen …</p>}
          {personer === 'fel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
              <p style={{ ...TYP.text, margin: 0 }}>Kunde inte hämta namnen. Kontrollera täckningen.</p>
              <button type="button" onClick={ladda} style={KNAPP.sekundar}>Försök igen</button>
            </div>
          )}
          {grupper.map(g => (
            <div key={g.namn || 'forare'} style={{ marginBottom: AVSTAND.l }}>
              {g.namn && <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{g.namn}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {g.lista.map(p => (
                  <button key={p.id} type="button" data-person={p.id} onClick={() => valjPerson(p)}
                    style={{ display: 'flex', alignItems: 'center', minHeight: 64, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, border: 'none', background: FARG.upphojt, color: FARG.text, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', ...TYP.rubrik, touchAction: 'manipulation' }}>
                    {p.namn}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {Array.isArray(personer) && personer.length === 0 && <p style={{ ...TYP.meta, color: FARG.text2 }}>Inga förare att välja bland.</p>}
        </>
      )}
    </Ark>
  )
}
