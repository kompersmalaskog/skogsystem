'use client'

// En rad i delaarket ("Dela som PDF" / "Dela som bild"): titel, förklaring, delaikon. Delas av veckoläget och månadsfacit.
import { AVSTAND, FARG, INAKTIV, RAD, TYP } from '@/lib/design/tokens'
import Ikon from '@/components/design/Ikon'

export default function DelaRad({ text, under, onClick, upptagen, inaktiv }: { text: string; under: string; onClick: () => void; upptagen: boolean; inaktiv: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inaktiv}
      aria-busy={upptagen}
      className="hk-rad"
      style={{ border: 'none', ...RAD, justifyContent: 'space-between', width: '100%', boxSizing: 'border-box', background: 'none', color: FARG.text, fontFamily: 'inherit', textAlign: 'left', cursor: inaktiv ? 'default' : 'pointer', ...(inaktiv && !upptagen ? INAKTIV : null) }}
    >
      <span>
        <span style={{ display: 'block', ...TYP.listtitel }}>{upptagen ? `${text}…` : text}</span>
        <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</span>
      </span>
      <Ikon namn="share" />
    </button>
  )
}
