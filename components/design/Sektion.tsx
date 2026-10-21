// Sektion: en etikett (TYP.micro) OVANFÖR ett KORT — aldrig en rubrik inuti kortet. Raderna ligger i kortet utan
// egen topp-/bottenpadding (raderna bär den själva). Skillen: "Rubrikplats".
import type { ReactNode } from 'react'
import { AVSTAND, FARG, IKON, KORT, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens'
import Ikon from './Ikon'

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
  /** Rubrikraden är tryckbar (öppnar t.ex. ett ark): etiketten till vänster, `hoger` (ett tal, `TYP.meta`) och en chevron till höger. 44 px hög. */
  onRubrikTryck?: () => void
  hoger?: ReactNode
  /** Klass på kortets behållare (en vy kan t.ex. ta bort linjen under sista raden). */
  className?: string
  children: ReactNode
}

export default function Sektion({ rubrik, not, kort = true, foljdAvLankar, inset, onRubrikTryck, hoger, className, children }: Props) {
  return (
    <section aria-label={rubrik} style={{ marginBottom: foljdAvLankar ? AVSTAND.rad : AVSTAND.xl }}>
      {onRubrikTryck ? (
        <h3 style={{ margin: inset ? `0 0 ${AVSTAND.xs}px ${AVSTAND.xs}px` : 0 }}>
          <button type="button" onClick={onRubrikTryck}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%', minHeight: TRAFFYTA.min, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ ...TYP.micro, color: FARG.text2 }}>{rubrik}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text }}>
              {hoger}
              <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
            </span>
          </button>
        </h3>
      ) : (
        <h3 style={{ ...TYP.micro, color: FARG.text2, margin: inset ? `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` : `0 0 ${AVSTAND.xs}px` }}>{rubrik}</h3>
      )}
      <div className={className} style={kort ? { ...KORT, paddingTop: 0, paddingBottom: 0 } : undefined}>{children}</div>
      {not && <p style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>{not}</p>}
    </section>
  )
}
