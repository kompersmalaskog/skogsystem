'use client'

// Kolumn per vecka: två staplar (skördat vänster, skotat höger, 4 px mellan) och
// ett 2 px svart planstreck över båda. Skala: största veckoplanen = 100 %.
// Grön ≥ plan, orange under. Kommande: tomma spår + streck. Pågående: 50 % opacitet.
// Tryck på kolumn = välj vecka. Tryck på stapel = per maskin för den rollen.
import { TreePine, Truck } from 'lucide-react'
import { T } from '@/lib/utbildning'
import type { VeckaRad } from '../_lib/queries'

type Roll = 'skordare' | 'skotare'
const HOJD = 150
const STAPEL_BREDD = 16
const MELLAN = 4

export function veckaFarg(varde: number, plan: number | null): string {
  if (plan == null || plan <= 0) return 'rgba(255,255,255,0.7)'
  return varde >= plan ? T.green : T.orange
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
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.t2, padding: '0 4px 12px', fontFamily: T.ff }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><TreePine size={14} aria-hidden="true" /> Skördat</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Truck size={14} aria-hidden="true" /> Skotat</span>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
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
                flex: 1, minWidth: 44, minHeight: 44, background: arVald ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none', borderRadius: 10, padding: '6px 2px 8px', cursor: 'pointer', fontFamily: T.ff, color: T.t1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}
            >
              <div style={{ position: 'relative', width: bredd, height: HOJD }}>
                {/* Spår (bakgrund) */}
                <div style={{ position: 'absolute', left: 0, bottom: 0, width: STAPEL_BREDD, height: HOJD, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', right: 0, bottom: 0, width: STAPEL_BREDD, height: HOJD, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }} />
                {/* Staplar */}
                {!kommande && (
                  <>
                    <div
                      role="button"
                      aria-label={`Skördat vecka ${v.isovecka}`}
                      onClick={e => { e.stopPropagation(); onValjStapel(v.isovecka, 'skordare') }}
                      style={{ position: 'absolute', left: 0, bottom: 0, width: STAPEL_BREDD, height: h(v.skordat), background: veckaFarg(v.skordat, v.plan), borderRadius: 4, opacity, cursor: 'pointer' }}
                    />
                    <div
                      role="button"
                      aria-label={`Skotat vecka ${v.isovecka}`}
                      onClick={e => { e.stopPropagation(); onValjStapel(v.isovecka, 'skotare') }}
                      style={{ position: 'absolute', right: 0, bottom: 0, width: STAPEL_BREDD, height: h(v.skotat), background: veckaFarg(v.skotat, v.plan), borderRadius: 4, opacity, cursor: 'pointer' }}
                    />
                  </>
                )}
                {/* Planstreck över båda staplarna */}
                {v.plan != null && v.plan > 0 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: h(v.plan) - 1, height: 2, background: '#000' }} aria-label="plan" />
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: arVald ? 700 : 500, color: arVald ? T.t1 : T.t2 }}>v{v.isovecka}</div>
              {v.orsak && (
                <div style={{ fontSize: 12, color: T.t2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{v.orsak}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
