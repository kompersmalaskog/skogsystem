// Svarsrad: vyns rubrik på svart bakgrund — inget kort. Vyn svarar på sin fråga i en mening (TYP.rubrik).
// Ok = dämpad (text2); avvikelse = text + varningsikon i orange. Raden under förklarar (TYP.text, text2);
// `varning` är en orange rad med det som kräver handling.
import type { ReactNode } from 'react'
import { AVSTAND, FARG, IKON, TYP } from '@/lib/design/tokens'
import Ikon from './Ikon'

type Props = {
  rubrik: string
  /** Text, eller flera rader som element (då bryter komponenten inget själv). */
  rad?: ReactNode
  avvikelse?: boolean
  varning?: string | null
  /** En hel mening i `rad` (inte fakta åtskilda av " · "): bryts där den vill i stället för vid varje punkt. */
  fri?: boolean
}

export default function Svarsrad({ rubrik, rad, avvikelse, varning, fri }: Props) {
  const indrag = avvikelse ? IKON.rad + AVSTAND.inuti : 0 // ikonen + glappet, så andra raden linjerar med rubriken
  return (
    <section style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti }}>
        {avvikelse && <Ikon namn="warning" farg={FARG.orange} />}
        <h2 style={{ margin: 0, ...TYP.rubrik, color: avvikelse ? FARG.text : FARG.text2 }}>{rubrik}</h2>
      </div>
      {/* Radbrytning bara mellan delarna (" · ") — aldrig mitt i "behöver 29/dag, kör 0". */}
      {rad && (
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs, paddingLeft: indrag }}>
          {fri || typeof rad !== 'string' ? rad : rad.split(' · ').map((del, i) => (
            <span key={i}>{i > 0 && ' · '}<span style={{ whiteSpace: 'nowrap' }}>{del}</span></span>
          ))}
        </div>
      )}
      {varning && <div style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.xs, paddingLeft: indrag }}>{varning}</div>}
    </section>
  )
}
