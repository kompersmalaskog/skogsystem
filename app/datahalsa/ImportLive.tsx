'use client'

// Importen just nu — raden 'import_live' i meta_datahalsa_status, överst på Datahälsa.
// EN fråga: fungerar importen? Svaret står i ord ("Importen fungerar" / "Importen felar"), pricken förstärker bara.
// Vid larm: en rad per problem, i klartext, som databasen skrev dem. Under: när kontrollen senast gick (kord_tid).
// All text och alla lägen kommer ur lib/datahalsa/status (importLiveVy) — här ritas bara.
import { FARG, TYP, AVSTAND, RADIE } from '@/lib/design/tokens'
import { importLiveVy, IMPORT_LIVE, type ImportLiveLage, type StatusRad } from '@/lib/datahalsa/status'

const PRICK: Record<ImportLiveLage, string> = {
  ok: FARG.gron, larm: FARG.rod, gammal: FARG.orange, okand: FARG.text3, saknas: FARG.text3,
}
const PRICK_STORLEK = AVSTAND.l

function Ram({ children, lage }: { children: React.ReactNode; lage: string }) {
  return (
    <section
      data-testid="import-live" data-lage={lage} aria-live="polite"
      style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.l, marginBottom: AVSTAND.xl, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}
    >
      <div style={{ ...TYP.micro, color: FARG.text2 }}>Importen just nu</div>
      {children}
    </section>
  )
}

function Rubrik({ farg, children }: { farg: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
      <span aria-hidden style={{ width: PRICK_STORLEK, height: PRICK_STORLEK, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
      <span data-testid="import-live-rubrik" style={{ ...TYP.titel, color: FARG.text }}>{children}</span>
    </div>
  )
}

export default function ImportLive({ sektion, nu }: {
  sektion: { laddar: boolean; fel: string | null; data: StatusRad[] | null; tabellSaknas: boolean }
  /** Klockan som "senast kontrollerad" räknas mot. Utelämnad = nu. */
  nu?: number
}) {
  if (sektion.laddar) {
    return (
      <Ram lage="laddar">
        <div style={{ ...TYP.text, color: FARG.text2 }}>Läser importens läge …</div>
      </Ram>
    )
  }
  if (sektion.fel) {
    return (
      <Ram lage="fel">
        <Rubrik farg={FARG.text3}>Importens läge kunde inte läsas</Rubrik>
        <div style={{ ...TYP.text, color: FARG.text2 }}>Ladda om sidan för att försöka igen.</div>
        <div style={{ ...TYP.meta, color: FARG.text3, wordBreak: 'break-word' }}>{sektion.fel}</div>
      </Ram>
    )
  }
  const rad = (sektion.data ?? []).find((r) => r.id === IMPORT_LIVE) ?? null
  const vy = importLiveVy(rad, nu ?? Date.now())
  const larm = vy.lage === 'larm'
  return (
    <Ram lage={vy.lage}>
      <Rubrik farg={PRICK[vy.lage]}>{vy.rubrik}</Rubrik>
      {vy.rader.length > 0 && (
        <ul data-testid="import-live-rader" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          {vy.rader.map((r) => (
            <li key={r} style={{ ...TYP.text, color: larm ? FARG.text : FARG.text2, overflowWrap: 'anywhere' }}>{r}</li>
          ))}
        </ul>
      )}
      {vy.kontrollerad && (
        <div data-testid="import-live-kontrollerad" style={{ ...TYP.meta, color: vy.kontrollGammal ? FARG.orange : FARG.text3 }}>
          {vy.kontrollerad}{vy.kontrollGammal && vy.lage === 'larm' ? ' — kontrollen har stannat' : ''}
        </div>
      )}
    </Ram>
  )
}
