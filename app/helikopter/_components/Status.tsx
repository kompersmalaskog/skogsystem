// Status i /helikopter visas ALLTID som prick + ord (skillen: färg är aldrig ensam, status fyller aldrig ett tal eller en stapel).
// Orange = kräver dig · grön = landar/nått · dämpad = inget att göra (över, inte startad, ingen beställning).
import { AVSTAND, FARG, TYP } from '@/lib/design/tokens'
import type { Ton } from '../_lib/kort'

export const TON_FARG: Record<Ton, string> = { orange: FARG.orange, gron: FARG.gron, dampad: FARG.text3 }

export function Prick({ ton }: { ton: Ton }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: TON_FARG[ton], flexShrink: 0 }} />
}

/** Prick + ord, i TYP.meta: "● Under". Ordet bär betydelsen, pricken förstärker. */
export function StatusOrd({ ton, ord }: { ton: Ton; ord: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.inuti,...TYP.meta, color: ton === 'dampad' ? FARG.text3 : FARG.text, whiteSpace: 'nowrap' }}>
      <Prick ton={ton} />{ord}
    </span>
  )
}
