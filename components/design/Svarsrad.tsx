// Svarsrad: vyns rubrik på svart bakgrund — inget kort. Vyn svarar på sin fråga i en mening (TYP.rubrik).
// Ok = dämpad (text2); avvikelse = text + varningsikon i orange. Raden under förklarar (TYP.text, text2);
// `varning` är en orange rad med det som kräver handling.
import { AVSTAND, FARG, IKON, TYP } from '@/lib/design/tokens'
import Ikon from './Ikon'

type Props = {
  rubrik: string
  rad?: string | null
  avvikelse?: boolean
  varning?: string | null
}

export default function Svarsrad({ rubrik, rad, avvikelse, varning }: Props) {
  const indrag = avvikelse ? IKON.rad + AVSTAND.inuti : 0 // ikonen + glappet, så andra raden linjerar med rubriken
  return (
    <section style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti }}>
        {avvikelse && <Ikon namn="warning" farg={FARG.orange} />}
        <h2 style={{ margin: 0, ...TYP.rubrik, color: avvikelse ? FARG.text : FARG.text2 }}>{rubrik}</h2>
      </div>
      {rad && <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs, paddingLeft: indrag }}>{rad}</div>}
      {varning && <div style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.xs, paddingLeft: indrag }}>{varning}</div>}
    </section>
  )
}
