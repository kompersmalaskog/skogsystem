'use client'

// Veckoorsak: ett textfält (max ORSAK_MAX_TECKEN), Spara/Avbryt. Tom text tar bort orsaken.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import { sparaOrsak, type Typ } from '../_lib/queries'
import { ORSAK_MAX_TECKEN as MAX } from '../_lib/trosklar'

type Props = {
  open: boolean
  onClose: () => void
  ar: number
  manad: number
  typ: Typ
  isovecka: number
  orsak: string | null
  onSparad: () => void
}

export default function OrsakSheet({ open, onClose, ar, manad, typ, isovecka, orsak, onSparad }: Props) {
  const [text, setText] = useState(orsak ?? '')
  const [sparar, setSparar] = useState(false)
  const [fel, setFel] = useState<string | null>(null)

  useEffect(() => { if (open) { setText(orsak ?? ''); setFel(null) } }, [open, orsak])

  const andrad = text.trim() !== (orsak ?? '').trim()

  const spara = async () => {
    setSparar(true); setFel(null)
    const r = await sparaOrsak(ar, manad, typ, isovecka, text)
    setSparar(false)
    if (r.error) { setFel(r.error); return }
    onSparad()
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Orsak vecka ${isovecka}`}>
      <label htmlFor="orsak" style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>
        Varför veckan avvek från plan
      </label>
      <input
        id="orsak"
        type="text"
        value={text}
        maxLength={MAX}
        onChange={e => setText(e.target.value)}
        placeholder="t.ex. Skotaren stod på service"
        autoComplete="off"
        style={{ width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
        <span>{fel ? <span style={{ color: FARG.orange }}>Kunde inte spara – bara admin kan ändra orsak</span> : ''}</span>
        <span style={TNUM}>{text.length}/{MAX}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
        <button type="button" onClick={spara} disabled={!andrad || sparar} style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : null) }}>{sparar ? 'Sparar…' : 'Spara'}</button>
        <button type="button" onClick={onClose} disabled={sparar} style={{ ...KNAPP.lank, justifyContent: 'center' }}>Avbryt</button>
      </div>
    </Sheet>
  )
}


