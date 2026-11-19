'use client'

// Menyn: tre sidor. Under 1000 px tre flikar i botten (telefon, iPad stående) — från 1000 px en meny till vänster under toppfältet
// (dator, iPad liggande), som Arbetsrapporten. Samma knappar, samma ordning; innehållet flyttas åt höger med body:has(.hk-nav).
// Selektorerna har inga citattecken (React escapar dem i <style>). !important på body: rotlayouten sätter padding inline.
import Ikon from '@/components/design/Ikon'
import { AVSTAND, FARG, RADIE, TRAFFYTA, TYP, VIKT, LAYOUT, medSafeBotten } from '@/lib/design/tokens'
import { SIDOR, type Sida } from '../_lib/meny'

export const MENY_SIDOMENY_FRAN_PX = 1000
const SIDOMENY_BREDD_PX = 220
/** Bottenradens höjd: knapp + luft ovanför + hemindikatorns zon. Ett layoutmått — innehållet får lika mycket luft under sig. */
export const MENY_BOTTENRAD = `calc(${AVSTAND.m + TRAFFYTA.primar}px + ${medSafeBotten(AVSTAND.xl)})`

export const MENY_CSS = `
.hk-nav { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 50; box-sizing: border-box; display: flex; justify-content: space-around; align-items: center;
  padding: ${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.xl)}; background: rgba(31,31,31,0.7); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.hk-nav-knapp { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; max-width: 120px; height: ${TRAFFYTA.primar}px;
  background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; border-radius: ${RADIE.knapp}px; }
.hk-sidan { padding-bottom: calc(${MENY_BOTTENRAD} + ${AVSTAND.l}px); }
@media (min-width: ${MENY_SIDOMENY_FRAN_PX}px) {
  body:has(.hk-nav) { padding-left: ${SIDOMENY_BREDD_PX}px !important; }
  .hk-nav { top: ${LAYOUT.topbar}; bottom: 0; width: ${SIDOMENY_BREDD_PX}px; flex-direction: column; justify-content: flex-start; align-items: stretch; gap: ${AVSTAND.xs}px;
    padding: ${AVSTAND.l}px ${AVSTAND.m}px; border-radius: 0; background: ${FARG.bg}; -webkit-backdrop-filter: none; backdrop-filter: none; border-right: 1px solid ${FARG.linje}; }
  .hk-nav-knapp { flex: none; max-width: none; width: 100%; height: ${TRAFFYTA.min}px; flex-direction: row; justify-content: flex-start; gap: ${AVSTAND.m}px; padding: 0 ${AVSTAND.m}px; border-radius: ${RADIE.rad}px; }
  .hk-nav-knapp[aria-current=page] { background: ${FARG.upphojt}; }
  .hk-nav-text { font-size: ${TYP.listtitel.fontSize}px !important; }
  .hk-sidan { padding-bottom: ${AVSTAND.xxl * 2}px; }
}
`

export default function HelikopterMeny({ aktiv, onVal }: { aktiv: Sida; onVal: (s: Sida) => void }) {
  return (
    <nav className="hk-nav" aria-label="Helikopter">
      {SIDOR.map(s => {
        const vald = s.id === aktiv
        return (
          <button key={s.id} type="button" className="hk-nav-knapp" data-meny={s.id} aria-current={vald ? 'page' : undefined} onClick={() => onVal(s.id)}
            style={{ color: vald ? FARG.bla : FARG.text2 }}>
            <Ikon namn={s.ikon} farg="inherit" fylld={vald} />
            <span className="hk-nav-text" style={{ ...TYP.micro, textTransform: 'none', letterSpacing: 'normal', fontWeight: vald ? VIKT.halvfet : VIKT.normal }}>{s.namn}</span>
          </button>
        )
      })}
    </nav>
  )
}
