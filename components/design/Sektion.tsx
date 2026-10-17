// Sektion: en etikett (TYP.micro) OVANFÖR ett KORT — aldrig en rubrik inuti kortet. Raderna ligger i kortet utan
// egen topp-/bottenpadding (raderna bär den själva). Skillen: "Rubrikplats".
import type { ReactNode } from 'react'
import { AVSTAND, FARG, KORT, TYP } from '@/lib/design/tokens'

type Props = {
  rubrik: string
  /** En förklaring som gäller hela gruppen: står EN gång under kortet, inte på varje rad. */
  not?: ReactNode
  /** `false` = raderna ligger direkt på ytan (i ett ark/en panel som redan är ett kort). */
  kort?: boolean
  /** En länkgrupp (RadGrupp) ligger direkt under: AVSTAND.rad i stället för AVSTAND.xl. */
  foljdAvLankar?: boolean
  /** iOS-inset: etiketten indragen AVSTAND.xs och AVSTAND.s över kortet. Utan: ingen indragning, AVSTAND.xs över. */
  inset?: boolean
  /** Klass på kortets behållare (en vy kan t.ex. ta bort linjen under sista raden). */
  className?: string
  children: ReactNode
}

export default function Sektion({ rubrik, not, kort = true, foljdAvLankar, inset, className, children }: Props) {
  return (
    <section aria-label={rubrik} style={{ marginBottom: foljdAvLankar ? AVSTAND.rad : AVSTAND.xl }}>
      <h3 style={{ ...TYP.micro, color: FARG.text2, margin: inset ? `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` : `0 0 ${AVSTAND.xs}px` }}>{rubrik}</h3>
      <div className={className} style={kort ? { ...KORT, paddingTop: 0, paddingBottom: 0 } : undefined}>{children}</div>
      {not && <p style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>{not}</p>}
    </section>
  )
}
