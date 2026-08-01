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
//
// Skiljer OFARLIGT från ÄKTA: avvisade dubbletter (409) visas
// dämpat/grupperat, aldrig rött — inget tappades. Rött = verkligt tapp.
// ─────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import {
  useDatahalsa, KANDA_IMPORTFEL, LEV_GRON_DYGN, LEV_GUL_DYGN,
  importFelKlass, type Besked, type LeveransRad, type ImportFelRad,
} from './useDatahalsa'

const C = {
  bg: '#000', card: '#141416', divider: 'rgba(255,255,255,0.06)',
  text: '#f2f2f4', muted: '#8e8e93', dim: '#5c5c61',
  gron: '#30d158', gul: '#ffd60a', rod: '#ff453a', bla: '#0a84ff',
}
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif"

const KVITT_NYCKEL = 'datahalsa_leverans_forvantat'
const KVITT_DYGN = 21   // hur länge en "förväntat"-kvittering håller (täcker semester)

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

// ── Leverans-rad: färg ur dagar sedan senaste DATA (fakt_tid/fakt_lass),
//    aldrig ur maskintyp eller fil-loggen ──
type LevLage = { farg: string; etikett: string; dimmad: boolean; kanKvittera: boolean }

function dagEtikett(dagar: number): string {
  return dagar <= 0 ? 'i dag' : dagar === 1 ? '1 dag sedan' : `${dagar} dagar sedan`
}

function levLage(m: LeveransRad): LevLage {
  if (m.aktivTill)
    return { farg: C.dim, etikett: `ur drift ${m.aktivTill.slice(0, 10)}`, dimmad: true, kanKvittera: false }
  if (!m.sanderFiler)
    return { farg: C.dim, etikett: 'sänder inte filer', dimmad: true, kanKvittera: false }
  if (m.senasteData == null || m.dagarSedan == null)
    return { farg: C.muted, etikett: 'ingen data ännu', dimmad: true, kanKvittera: false }
  const farg = m.dagarSedan <= LEV_GRON_DYGN ? C.gron : m.dagarSedan <= LEV_GUL_DYGN ? C.gul : C.rod
  return { farg, etikett: dagEtikett(m.dagarSedan), dimmad: false, kanKvittera: farg === C.rod }
}

export default function DatahalsaPage() {
  const { filer, leverans, invarianter, gapCheck, importFel, besked } = useDatahalsa()
  const [visaFel, setVisaFel] = useState(false)

  // Kvittering "förväntat tyst" per maskin — client-lokal (ingen migration),
  // med utgång (KVITT_DYGN) så en glömd kvittering inte döljer ett verkligt
  // stopp för evigt. Håller bara nere FÄRGEN i denna vy; beskedet påverkas ej.
  const [kvitt, setKvitt] = useState<Record<string, string>>({})
  useEffect(() => {
    try {
      const rått = JSON.parse(localStorage.getItem(KVITT_NYCKEL) || '{}') as Record<string, string>
      const nu = Date.now()
      const giltiga: Record<string, string> = {}
      for (const [id, until] of Object.entries(rått)) {
        if (until && new Date(until).getTime() > nu) giltiga[id] = until
      }
      setKvitt(giltiga)
    } catch { /* tom/trasig localStorage — ignorera */ }
  }, [])

  const sparaKvitt = (next: Record<string, string>) => {
    setKvitt(next)
    try { localStorage.setItem(KVITT_NYCKEL, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const kvitteraForvantat = (maskinId: string) => {
    const until = new Date(Date.now() + KVITT_DYGN * 86400_000).toISOString()
    sparaKvitt({ ...kvitt, [maskinId]: until })
  }
  const angraKvitt = (maskinId: string) => {
    const next = { ...kvitt }; delete next[maskinId]; sparaKvitt(next)
  }

  const importFarg = filer.data?.timmarSedan == null ? C.muted
    : filer.data.timmarSedan < 24 ? C.gron
    : filer.data.timmarSedan < 72 ? C.gul : C.rod

  const felAntal = filer.data?.felFiler.length ?? 0
  const nyaFel = Math.max(0, felAntal - KANDA_IMPORTFEL)

  // Klassificera import_fel: ofarliga (409-dubbletter) grupperas dämpat,
  // äkta tapp listas rött. Rubriken svarar ärligt på om något tappades.
  const importFelData = importFel.data ?? []
  const ofarliga = importFelData.filter(r => importFelKlass(r) === 'ofarligt')
  const akta = importFelData.filter(r => importFelKlass(r) === 'akta')
  // Gruppera ofarliga per tabell för en dämpad sammanfattning (ej en rad/förekomst).
  const ofarligaPerTabell = ofarliga.reduce<Record<string, number>>((acc, r) => {
    acc[r.tabell] = (acc[r.tabell] || 0) + 1
    return acc
  }, {})

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

        {/* ── LEVERANS-ÖVERBLICK — senaste DATA per maskin (MAX datum i
            fakt_tid/fakt_lass, inte fil-loggen). Visas, larmar ALDRIG
            (tystnad = observation, inte fel). Röd kan kvitteras som
            "förväntat" (semester) → dämpas utan att döljas. ── */}
        <Kort rubrik="LEVERERAR MASKINERNA?" laddar={leverans.laddar} fel={leverans.fel}>
          {(leverans.data ?? []).map(m => {
            const lage = levLage(m)
            const kvitteradTill = kvitt[m.maskinId]
            const kvitterad = !!kvitteradTill && lage.kanKvittera
            return (
              <div key={m.maskinId} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 0', borderTop: `0.5px solid ${C.divider}`, gap: 10,
                fontSize: 14, color: (lage.dimmad || kvitterad) ? C.dim : C.text,
              }}>
                <span style={{ minWidth: 0 }}>
                  {m.namn}
                  {!m.bekraftad && <span style={{ color: C.gul }}> · obekräftad</span>}
                </span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                }}>
                  {kvitterad ? (
                    <>
                      <span style={{ color: C.dim, fontSize: 13 }}>
                        förväntat t.o.m. {kvitteradTill.slice(0, 10)}
                      </span>
                      <button onClick={() => angraKvitt(m.maskinId)} style={{
                        background: 'none', border: 'none', color: C.bla, fontFamily: FONT,
                        fontSize: 12, cursor: 'pointer', padding: 0,
                      }}>ångra</button>
                      <Prick farg={C.gul} />
                    </>
                  ) : (
                    <>
                      <span style={{ color: lage.dimmad ? C.dim : C.text }}>{lage.etikett}</span>
                      {lage.kanKvittera && (
                        <button onClick={() => kvitteraForvantat(m.maskinId)} style={{
                          background: 'none', border: `0.5px solid ${C.dim}`, color: C.muted,
                          fontFamily: FONT, fontSize: 11, cursor: 'pointer', padding: '2px 8px',
                          borderRadius: 7, whiteSpace: 'nowrap',
                        }}>förväntat?</button>
                      )}
                      <Prick farg={lage.farg} />
                    </>
                  )}
                </span>
              </div>
            )
          })}
          <div style={{ paddingTop: 8, fontSize: 11, color: C.dim }}>
            Senaste dag med data (fakt_tid/fakt_lass), inte fil-loggen — kumulativa
            filer bär flera dagar per fil. Tystnad kan vara semester eller planerat
            uppehåll — visas, larmas aldrig. Ur drift och icke-filsändande gråtonas.
          </div>
        </Kort>

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

        {/* ── 3b. Tappades något vid import? — skiljer ÄKTA tapp (rött) från
            OFARLIGA avvisade dubbletter (409, dämpat). En 409 = raden fanns
            redan = inget tappades, tvärtom (dedup rätt). ── */}
        <Kort rubrik="TAPPADES NÅGOT VID IMPORT?" laddar={importFel.laddar} fel={importFel.fel}>
          {importFel.tabellSaknas ? (
            <div style={{ fontSize: 13, color: C.muted }}>
              Kräver att migrationen för <code>import_fel</code> körs — tills dess
              syns tabellskrivfel bara i importloggen på datorn.
            </div>
          ) : (
            <>
              {/* Ärligt svar i rubrikraden */}
              <Rad
                vanster="Äkta datatapp (7 dygn)"
                hoger={akta.length === 0
                  ? (ofarliga.length > 0
                      ? `Nej — allt sparades`
                      : '0 ✅')
                  : `${akta.length} ⛔`}
                hogerFarg={akta.length === 0 ? C.gron : C.rod}
              />
              {/* Äkta tapp — rött, per rad */}
              {akta.map(r => (
                <div key={r.tid + r.tabell} style={{
                  padding: '6px 0 6px 16px', fontSize: 12, color: C.rod,
                  borderTop: `0.5px solid ${C.divider}`, wordBreak: 'break-all',
                }}>
                  <div>{new Date(r.tid).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })} · {r.tabell}{r.felkod ? ` · ${r.felkod}` : ''}</div>
                  {r.filnamn && <div style={{ color: C.muted }}>{r.filnamn}</div>}
                  {r.feltext && <div style={{ color: C.dim }}>{r.feltext.slice(0, 160)}</div>}
                </div>
              ))}
              {/* Ofarliga avvisade dubbletter — dämpat, grupperat, aldrig rött */}
              {ofarliga.length > 0 && (
                <div style={{
                  marginTop: 8, padding: '10px 12px', borderTop: `0.5px solid ${C.divider}`,
                  background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                }}>
                  <div style={{ fontSize: 13, color: C.muted, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Prick farg={C.dim} />
                    {ofarliga.length} avvisade dubbletter — ofarligt, fanns redan i databasen
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: C.dim, paddingLeft: 18 }}>
                    {Object.entries(ofarligaPerTabell)
                      .map(([tabell, n]) => `${tabell}: ${n}`)
                      .join(' · ')}
                  </div>
                </div>
              )}
            </>
          )}
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
