'use client'

// Veckoorsak: ett textfält (max ORSAK_MAX_TECKEN), Spara/Avbryt. Tom text tar bort orsaken.
import { useEffect, useState } from 'react'
import { Sheet } from '@/components/Sheet'
import { T } from '@/lib/utbildning'
import { sparaOrsak, type Typ } from '../_lib/queries'
import { ORSAK_MAX_TECKEN as MAX } from '../_lib/trosklar'
import { knapp } from './Tillstand'

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
      <label htmlFor="orsak" style={{ display: 'block', fontSize: 13, color: T.t2, marginBottom: 8, fontFamily: T.ff }}>
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
        style={{ width: '100%', minHeight: 44, padding: '10px 14px', background: T.groupHi, border: 'none', borderRadius: 10, color: T.t1, fontSize: 16, fontFamily: T.ff, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.t2, marginTop: 6, fontFamily: T.ff }}>
        <span>{fel ? <span style={{ color: T.orange }}>Kunde inte spara – bara admin kan ändra orsak</span> : ''}</span>
        <span>{text.length}/{MAX}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="button" onClick={onClose} disabled={sparar} style={{ ...knapp, flex: 1, background: T.groupHi, color: T.t1 }}>Avbryt</button>
        <button type="button" onClick={spara} disabled={!andrad || sparar} style={{ ...knapp, flex: 1, opacity: !andrad || sparar ? 0.4 : 1 }}>{sparar ? 'Sparar…' : 'Spara'}</button>
      </div>
    </Sheet>
  )
}
