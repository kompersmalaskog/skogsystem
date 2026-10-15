'use client'

// Kolumn per vecka: två staplar (skördat vänster, skotat höger, 4 px mellan) och
// ett 2 px planstreck i text-primary över båda. Skala: största veckoplanen = 100 %.
// Grön ≥ plan, orange under. Kommande: tomma spår + streck. Pågående: 50 % opacitet.
// Tryck på kolumn = välj vecka. Tryck på stapel = per maskin för den rollen.
import { AVSTAND, FARG, IKON, RADIE, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens'
import type { VeckaRad } from '../_lib/queries'
import { Ikon } from './Ikon'

type Roll = 'skordare' | 'skotare'
const HOJD = 150
const STAPEL_BREDD = 16
const MELLAN = 4

export function veckaFarg(varde: number, plan: number | null): string {
  if (plan == null || plan <= 0) return FARG.text2
  return varde >= plan ? FARG.gron : FARG.orange
}

export default function VeckoDiagram({ veckor, vald, onValjVecka, onValjStapel }: {
  veckor: VeckaRad[]
  vald: number | null
  onValjVecka: (isovecka: number) => void
  onValjStapel: (isovecka: number, roll: Roll) => void
}) {
  const maxPlan = Math.max(...veckor.map(v => v.plan ?? 0), 0)
  const maxVarde = Math.max(...veckor.flatMap(v => [v.skordat, v.skotat]), 0)
  const skala = maxPlan > 0 ? maxPlan : Math.max(maxVarde, 1)
  const h = (v: number) => Math.min(HOJD, Math.max(0, (v / skala) * HOJD))

  return (
    <div>
      <div style={{ display: 'flex', gap: AVSTAND.l, ...TYP.meta, color: FARG.text2, padding: `0 ${AVSTAND.xs}px ${AVSTAND.m}px` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}><Ikon namn="forest" storlek={IKON.text} /> Skördat</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs }}><Ikon namn="local_shipping" storlek={IKON.text} /> Skotat</span>
      </div>
      <div style={{ display: 'flex', gap: AVSTAND.xs, alignItems: 'flex-end' }}>
        {veckor.map(v => {
          const arVald = v.isovecka === vald
          const kommande = v.status === 'kommande'
          const opacity = v.status === 'pagar' ? 0.5 : 1
          const bredd = STAPEL_BREDD * 2 + MELLAN
          return (
            <button
              key={`${v.iso_ar}-${v.isovecka}`}
              type="button"
              onClick={() => onValjVecka(v.isovecka)}
              aria-pressed={arVald}
              aria-label={`Vecka ${v.isovecka}`}
              style={{
                flex: 1, minWidth: TRAFFYTA.min, minHeight: TRAFFYTA.min, background: arVald ? FARG.upphojt : 'transparent',
                border: 'none', borderRadius: RADIE.rad, padding: `${AVSTAND.s}px ${AVSTAND.xs}px`, cursor: 'pointer', fontFamily: 'inherit', color: FARG.text,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs,
              }}
            >
              <div style={{ position: 'relative', width: bredd, height: HOJD }}>
                {/* Spår (bakgrund) */}
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: STAPEL_BREDD, height: HOJD, background: FARG.fyllning, borderRadius: RADIE.stapel }} />
                <div style={{ position: 'absolute', right: 0, bottom: 0, width: STAPEL_BREDD, height: HOJD, background: FARG.fyllning, borderRadius: RADIE.stapel }} />
                {/* Staplar */}
                {!kommande && (
                  <>
                    <div
                      role="button"
                      aria-label={`Skördat vecka ${v.isovecka}`}
                      onClick={e => { e.stopPropagation(); onValjStapel(v.isovecka, 'skordare') }}
                      style={{ position: 'absolute', left: 0, bottom: 0, width: STAPEL_BREDD, height: h(v.skordat), background: veckaFarg(v.skordat, v.plan), borderRadius: RADIE.stapel, opacity, cursor: 'pointer' }}
                    />
                    <div
                      role="button"
                      aria-label={`Skotat vecka ${v.isovecka}`}
                      onClick={e => { e.stopPropagation(); onValjStapel(v.isovecka, 'skotare') }}
                      style={{ position: 'absolute', right: 0, bottom: 0, width: STAPEL_BREDD, height: h(v.skotat), background: veckaFarg(v.skotat, v.plan), borderRadius: RADIE.stapel, opacity, cursor: 'pointer' }}
                    />
                  </>
                )}
                {/* Planstreck över båda staplarna */}
                {v.plan != null && v.plan > 0 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: h(v.plan) - 1, height: 2, background: FARG.text }} aria-label="plan" />
                )}
              </div>
              <div style={{ ...TYP.meta, fontWeight: arVald ? VIKT.fet : VIKT.halvfet, color: arVald ? FARG.text : FARG.text2 }}>v{v.isovecka}</div>
              <div style={{ ...TYP.meta, color: FARG.text3 }}>{v.arbetsdagar} {v.arbetsdagar === 1 ? 'dag' : 'dagar'}</div>
              {v.orsak && (
                <div style={{ ...TYP.meta, color: FARG.text2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.orsak}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
