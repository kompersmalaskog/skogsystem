'use client'

// "Kod för maskinen" — man väljer sin egen kod i telefonen (Mer › Kod för maskinen): fyra siffror, två gånger. Koden kontrolleras och sparas på servern
// (aldrig läsbart) och används sedan för att låsa upp maskinen i hytten. Byter man kod ersätter den nya den gamla.
import { useEffect, useState } from 'react'
import Ark from '@/components/design/Ark'
import KodPlatta from '@/components/maskinkonto/KodPlatta'
import { AVSTAND, FARG, KNAPP, TYP, designCss } from '@/lib/design/tokens'

type Steg = 'val' | 'igen' | 'sparar' | 'klar'

export default function KodArk({ onStang }: { onStang: () => void }) {
  const [steg, setSteg] = useState<Steg>('val')
  const [forsta, setForsta] = useState('')
  const [skaka, setSkaka] = useState(0)
  const [fel, setFel] = useState<string | null>(null)
  const [harKod, setHarKod] = useState<boolean | null>(null)

  useEffect(() => {
    let avbruten = false
    fetch('/api/maskin/kod', { cache: 'no-store' }).then(r => r.json()).then(j => { if (!avbruten) setHarKod(!!j?.satt) }).catch(() => { if (!avbruten) setHarKod(null) })
    return () => { avbruten = true }
  }, [])

  const klar = async (kod: string) => {
    if (steg === 'val') { setForsta(kod); setFel(null); setSteg('igen'); setSkaka(n => n + 1); return }
    if (kod !== forsta) { setForsta(''); setSteg('val'); setSkaka(n => n + 1); setFel('Koderna var olika. Börja om.'); return }
    setSteg('sparar'); setFel(null)
    try {
      const r = await fetch('/api/maskin/kod', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kod }) })
      if (!r.ok) throw new Error()
      setSteg('klar'); setHarKod(true)
    } catch {
      setForsta(''); setSteg('val'); setSkaka(n => n + 1); setFel('Kunde inte spara. Kontrollera täckningen och försök igen.')
    }
  }

  return (
    <Ark rubrik="Kod för maskinen" onStang={onStang} stang={steg === 'klar' ? 'Klar' : 'Avbryt'}>
      <style>{designCss}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.l, paddingBottom: AVSTAND.l }}>
        {steg === 'klar' ? (
          <>
            <p data-kod-klar style={{ ...TYP.listtitel, textAlign: 'center', margin: `${AVSTAND.xl}px 0 0` }}>Din kod är sparad</p>
            <p style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', margin: 0 }}>Skriv den på maskinens skärm när du ska logga in.</p>
            <button type="button" onClick={onStang} style={KNAPP.primar}>Klar</button>
          </>
        ) : (
          <>
            {harKod !== null && steg === 'val' && !fel && (
              <p style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', margin: 0 }}>
                {harKod ? 'Du har redan en kod. Välj en ny för att byta.' : 'Välj fyra siffror. Du använder dem för att logga in på maskinen.'}
              </p>
            )}
            {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.orange, textAlign: 'center', margin: 0 }}>{fel}</p>}
            <KodPlatta onFyra={k => void klar(k)} skakaNyckel={skaka} stangd={steg === 'sparar'}
              etikett={steg === 'igen' ? 'Skriv samma kod igen' : steg === 'sparar' ? 'Sparar …' : 'Välj din kod'} />
          </>
        )}
      </div>
    </Ark>
  )
}
