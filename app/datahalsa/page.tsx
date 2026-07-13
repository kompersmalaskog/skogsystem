'use client'

// ─────────────────────────────────────────────────────────────
// Datahälsa — "kan jag lita på datan idag?" på 10 sekunder.
// Ansiktet på larmen (Gap Check, >24h-invarianten, dubblett-
// signaturen, tomgångs-konsistensen) — DATA-hälsa, inte maskin-
// prestanda (det bor i maskinvyn).
//
// Vyn visar VAD den vet, gissar aldrig varför. Maskintystnad
// visas men larmar aldrig (semester ser ut som fel). Målet är
// att vyn oftast är nästan tom och grön.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useDatahalsa, KANDA_IMPORTFEL, type Besked } from './useDatahalsa'

const C = {
  bg: '#000', card: '#141416', divider: 'rgba(255,255,255,0.06)',
  text: '#f2f2f4', muted: '#8e8e93', dim: '#5c5c61',
  gron: '#30d158', gul: '#ffd60a', rod: '#ff453a', bla: '#0a84ff',
}
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif"

function tidSedan(iso: string | null): string {
  if (!iso) return '—'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `för ${min} min sedan`
  const tim = Math.round(min / 60)
  if (tim < 48) return `för ${tim} tim sedan`
  return `för ${Math.round(tim / 24)} dygn sedan`
}

function Prick({ farg }: { farg: string }) {
  return <span style={{
    display: 'inline-block', width: 10, height: 10, borderRadius: 5,
    background: farg, flexShrink: 0,
  }} />
}

function Kort({ rubrik, laddar, fel, children }: {
  rubrik: string; laddar: boolean; fel: string | null; children: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, borderRadius: 14, padding: 16, marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: 0.4, marginBottom: 12 }}>
        {rubrik}
      </div>
      {laddar ? (
        <div style={{ height: 18, width: '55%', borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
      ) : fel ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.rod, fontSize: 14 }}>
          <Prick farg={C.rod} /> Kunde inte läsa: {fel}
        </div>
      ) : children}
    </div>
  )
}

function Rad({ vanster, hoger, dimmad, hogerFarg }: {
  vanster: React.ReactNode; hoger: React.ReactNode; dimmad?: boolean; hogerFarg?: string
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '9px 0', borderTop: `0.5px solid ${C.divider}`,
      fontSize: 14, color: dimmad ? C.dim : C.text,
    }}>
      <span>{vanster}</span>
      <span style={{
        fontVariantNumeric: 'tabular-nums', color: hogerFarg ?? (dimmad ? C.dim : C.text),
        display: 'flex', alignItems: 'center', gap: 6, textAlign: 'right',
      }}>{hoger}</span>
    </div>
  )
}

export function beskedFarg(niva: Besked['niva']): string {
  return niva === 'gron' ? C.gron : niva === 'gul' ? C.gul
    : niva === 'rod' ? C.rod : C.muted
}

export default function DatahalsaPage() {
  const { filer, maskiner, invarianter, gapCheck, besked } = useDatahalsa()
  const [visaFel, setVisaFel] = useState(false)

  const importFarg = filer.data?.timmarSedan == null ? C.muted
    : filer.data.timmarSedan < 24 ? C.gron
    : filer.data.timmarSedan < 72 ? C.gul : C.rod

  const felAntal = filer.data?.felFiler.length ?? 0
  const nyaFel = Math.max(0, felAntal - KANDA_IMPORTFEL)

  return (
    <div style={{
      position: 'fixed', inset: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch',
      background: C.bg, fontFamily: FONT, WebkitFontSmoothing: 'antialiased',
    }}>
      <main style={{
        maxWidth: 560, margin: '0 auto',
        padding: 'calc(72px + env(safe-area-inset-top)) 16px 90px',
      }}>

        {/* ── BESKEDET — hela poängen, 10 sekunder ── */}
        <div style={{
          background: C.card, borderRadius: 14, padding: '18px 16px', marginBottom: 18,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Prick farg={beskedFarg(besked.niva)} />
            <span style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{besked.rubrik}</span>
          </div>
          {besked.punkter.length > 0 && (
            <ul style={{ margin: '4px 0 0 28px', padding: 0, color: C.rod, fontSize: 14, lineHeight: 1.7 }}>
              {besked.punkter.map(p => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>

        {/* ── 1. Kommer filerna in? ── */}
        <Kort rubrik="KOMMER FILERNA IN?" laddar={filer.laddar} fel={filer.fel}>
          <Rad vanster="Senaste import"
               hoger={<><span>{tidSedan(filer.data?.senasteImport ?? null)}</span><Prick farg={importFarg} /></>} />
          <Rad vanster="Senaste 7 dagarna" hoger={`${filer.data?.antal7d ?? 0} filer`} />
          <Rad
            vanster={
              <button onClick={() => setVisaFel(v => !v)} style={{
                background: 'none', border: 'none', padding: 0, fontFamily: FONT,
                fontSize: 14, color: nyaFel > 0 ? C.rod : C.dim, cursor: 'pointer',
              }}>
                {visaFel ? '▾' : '▸'} Kända importfel
              </button>
            }
            hoger={nyaFel > 0
              ? `${felAntal} st — ${nyaFel} NYA`
              : `${felAntal} st · sedan maj`}
            dimmad={nyaFel === 0}
            hogerFarg={nyaFel > 0 ? C.rod : undefined}
          />
          {visaFel && (filer.data?.felFiler ?? []).map(f => (
            <div key={f.filnamn + f.importerad_tid} style={{
              padding: '6px 0 6px 16px', fontSize: 12, color: C.dim,
              borderTop: `0.5px solid ${C.divider}`, wordBreak: 'break-all',
            }}>
              <div style={{ color: C.muted }}>{f.filnamn}</div>
              <div>{f.importerad_tid?.slice(0, 10)} — {f.felmeddelande || 'okänt fel'}</div>
            </div>
          ))}
        </Kort>

        {/* ── 2. Levererar maskinerna? — visas, larmar ALDRIG ── */}
        <Kort rubrik="LEVERERAR MASKINERNA?" laddar={maskiner.laddar} fel={maskiner.fel}>
          {(maskiner.data ?? []).map(m => {
            const dimmad = !!m.aktivTill || (m.extramaskin && !m.senasteData)
            const etikett = m.aktivTill
              ? `avslutad ${m.aktivTill.slice(0, 10)}`
              : m.senasteData
                ? (m.dagarSedan === 0 ? 'i dag' : m.dagarSedan === 1 ? '1 dag sedan' : `${m.dagarSedan} dagar sedan`)
                : m.extramaskin ? 'extramaskin — ingen data ännu' : 'ingen data'
            return (
              <Rad key={m.maskinId}
                vanster={<>{m.modell}{m.extramaskin && !m.aktivTill ? <span style={{ color: C.dim }}> · extramaskin</span> : null}</>}
                hoger={etikett} dimmad={dimmad} />
            )
          })}
          <div style={{ paddingTop: 8, fontSize: 11, color: C.dim }}>
            Tystnad kan vara semester eller planerat uppehåll — visas, larmas inte.
          </div>
        </Kort>

        {/* ── 3. Är datan galen? — ska alltid vara 0 ── */}
        <Kort rubrik="ÄR DATAN GALEN?" laddar={invarianter.laddar} fel={invarianter.fel}>
          <Rad vanster="Dagar med >24h motortid"
               hoger={invarianter.data?.over24h.length === 0 ? '0 ✅' : `${invarianter.data?.over24h.length} ⛔`}
               hogerFarg={invarianter.data?.over24h.length === 0 ? C.gron : C.rod} />
          {(invarianter.data?.over24h ?? []).map(x => (
            <div key={x.maskin + x.datum} style={{ paddingLeft: 16, fontSize: 12, color: C.rod }}>
              {x.maskin} {x.datum}: {x.timmar.toFixed(1)} h
            </div>
          ))}
          <Rad vanster="Dubblett-signaturer"
               hoger={invarianter.data?.dubbletter.length === 0 ? '0 ✅' : `${invarianter.data?.dubbletter.length} ⛔`}
               hogerFarg={invarianter.data?.dubbletter.length === 0 ? C.gron : C.rod} />
          {(invarianter.data?.dubbletter ?? []).map(x => (
            <div key={x.maskin + x.datum + x.objekt} style={{ paddingLeft: 16, fontSize: 12, color: C.rod }}>
              {x.maskin} {x.datum} objekt {x.objekt}: {x.antal} identiska rader
            </div>
          ))}
          <Rad vanster="Tomgångs-inkonsistens"
               hoger={invarianter.data?.tomgangInkonsistenta === 0 ? '0 · LÄKT ✅' : `${invarianter.data?.tomgangInkonsistenta} ⛔`}
               hogerFarg={invarianter.data?.tomgangInkonsistenta === 0 ? C.gron : C.rod} />
        </Kort>

        {/* ── 4. Senaste Gap Check ── */}
        <Kort rubrik="SENASTE GAP CHECK" laddar={gapCheck.laddar} fel={gapCheck.fel}>
          {gapCheck.tabellSaknas ? (
            <div style={{ fontSize: 13, color: C.muted }}>
              Körs söndagar 20:00 på import-datorn. Status här kräver att
              migrationen för <code>meta_datahalsa_status</code> körs — tills dess
              finns resultatet bara i loggen på datorn.
            </div>
          ) : gapCheck.data ? (
            <>
              <Rad vanster="Senast körd" hoger={new Date(gapCheck.data.kordTid).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })} />
              <Rad vanster="Resultat"
                   hoger={gapCheck.data.status === 'OK' ? 'Inga larm ✅' : `${gapCheck.data.larmAntal} LARM ⛔`}
                   hogerFarg={gapCheck.data.status === 'OK' ? C.gron : C.rod} />
              {gapCheck.data.status !== 'OK' && gapCheck.data.sammanfattning && (
                <pre style={{
                  margin: '8px 0 0', padding: 10, background: 'rgba(255,69,58,0.08)',
                  borderRadius: 8, fontSize: 11, color: C.rod, whiteSpace: 'pre-wrap',
                }}>{gapCheck.data.sammanfattning}</pre>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.muted }}>
              Ingen körning registrerad ännu — första skrivs söndag 20:00.
            </div>
          )}
        </Kort>

      </main>
    </div>
  )
}
