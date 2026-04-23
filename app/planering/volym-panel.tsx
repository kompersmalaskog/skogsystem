'use client'
import type { VolymResultat } from '../../lib/skoglig-berakning'
import type { KorbarhetsResultat } from '../../lib/korbarhet'
import KorbarhetPanel from './korbarhet-panel'

interface VolymPanelProps {
  resultat: VolymResultat | null;
  loading: boolean;
  onClose: () => void;
  onRetry?: () => void;
  korbarhetsResultat?: KorbarhetsResultat | null;
  korbarhetsLoading?: boolean;
}

const fmtNum = (n: number, d = 0) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const retryBtnStyle: React.CSSProperties = { marginTop: 16, padding: '10px 20px', borderRadius: 12, border: 'none', background: '#0a84ff', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 44 };

export default function VolymPanel({ resultat, loading, onClose, onRetry, korbarhetsResultat, korbarhetsLoading }: VolymPanelProps) {
  if (!resultat && !loading) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#111',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '20px 20px 0 0',
      zIndex: 450,
      maxHeight: 'calc(70vh + env(safe-area-inset-bottom, 0px))',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      overflowY: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
      color: '#fff',
    }}>
      {/* Drag handle */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
        <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)' }} />
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 12px' }}>
        <span style={{ fontSize: '17px', fontWeight: '600' }}>Volymberäkning</span>
        <button type="button" onClick={onClose} aria-label="Stäng volymberäkning" style={{ background: 'transparent', border: 'none', padding: '6px', borderRadius: '22px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'transform 0.12s' }} onPointerDown={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.94)'} onPointerUp={e => (e.currentTarget as HTMLButtonElement).style.transform = ''} onPointerLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = ''}>
          <span style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 L6 18" />
              <path d="M6 6 L18 18" />
            </svg>
          </span>
        </button>
      </div>

      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#30d158', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', opacity: 0.75 }}>Beräknar volym via Skogliga Grunddata...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {resultat?.status === 'error' && (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '32px', color: '#ff453a', marginBottom: '8px', display: 'block' }}>warning</span>
          <div style={{ fontSize: '14px', color: '#ff453a' }}>{resultat.felmeddelande}</div>
          {onRetry && (
            <button type="button" onClick={onRetry} style={retryBtnStyle}>Försök igen</button>
          )}
        </div>
      )}

      {resultat?.status === 'no_data' && (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '32px', opacity: 0.5, marginBottom: '8px', display: 'block' }}>forest</span>
          <div style={{ fontSize: '14px', opacity: 0.75 }}>{resultat.felmeddelande}</div>
          <div style={{ fontSize: '13px', opacity: 0.65, marginTop: '4px' }}>Areal: {resultat.areal} ha</div>
          {onRetry && (
            <button type="button" onClick={onRetry} style={retryBtnStyle}>Försök igen</button>
          )}
        </div>
      )}

      {resultat?.status === 'done' && (
        <div style={{ padding: '0 16px 20px' }}>
          {/* Avverkningsvarning */}
          {resultat.avverkatVarning && (
            <div style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '24px', color: '#fbbf24' }}>warning</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fbbf24' }}>Området verkar avverkat</div>
                <div style={{ fontSize: '13px', opacity: 0.75, marginTop: '2px' }}>Låg volym trots skogsmark. Data kan vara inaktuellt.</div>
              </div>
            </div>
          )}

          {/* Sammanfattning */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            {[
              { label: 'Total areal', value: `${fmtNum(resultat.areal, 2)} ha` },
              { label: 'Volym/ha', value: `${fmtNum(resultat.totalVolymHa, 1)} m³sk` },
              { label: 'Total volym', value: `${fmtNum(resultat.totalVolym)} m³sk` },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '15px', fontWeight: '600' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Skogsmark-rad */}
          {resultat.andelSkog < 1.0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '4px' }}>Skogsmark</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{fmtNum(resultat.arealSkog, 2)} ha ({Math.round(resultat.andelSkog * 100)}%)</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '4px' }}>Medeldiameter</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{resultat.medeldiameter} cm</div>
              </div>
            </div>
          )}

          {/* Extra info */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', fontSize: '13px', opacity: 0.7, padding: '0 4px', flexWrap: 'wrap' }}>
            {resultat.andelSkog >= 1.0 && <span>Medeldiameter: {resultat.medeldiameter} cm</span>}
            <span>Medelhöjd: {resultat.medelhojd} m</span>
            <span>Laserskannat: {resultat.skanningsAr}</span>
            <span>SLU Skogskarta: ~{resultat.sluAr}</span>
          </div>

          {/* Trädslag-tabell */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 50px', gap: '4px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px', opacity: 0.75 }}>
              <span>Trädslag</span>
              <span style={{ textAlign: 'right' }}>m³sk/ha</span>
              <span style={{ textAlign: 'right' }}>Total m³sk</span>
              <span style={{ textAlign: 'right' }}>Andel</span>
            </div>

            {/* Rader */}
            {resultat.tradslag.map(t => (
              <div key={t.namn} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 50px', gap: '4px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize: '14px' }}>{t.namn}</span>
                <span style={{ fontSize: '14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.volymHa, 1)}</span>
                <span style={{ fontSize: '14px', textAlign: 'right', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.totalVolym)}</span>
                <span style={{ fontSize: '14px', textAlign: 'right', opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>{Math.round(t.andel * 100)}%</span>
              </div>
            ))}
          </div>

          {/* Gallringsanalys */}
          {resultat.gallring && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', padding: '0 4px', marginBottom: '8px' }}>
                Gallringsanalys
              </div>
              <div style={{
                background: resultat.gallring.behov
                  ? 'rgba(239,68,68,0.12)'
                  : 'rgba(34,197,94,0.12)',
                border: `1px solid ${resultat.gallring.behov ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                borderRadius: '12px',
                padding: '12px 14px',
              }}>
                {/* Ja/Nej-bedömning */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: resultat.gallring.behov ? '#ff453a' : '#30d158' }}>
                    Gallringsbehov: {resultat.gallring.behov ? 'Ja' : 'Nej'}
                  </span>
                  <span style={{ fontSize: '13px', opacity: 0.75 }}>Mall: {resultat.gallring.sis}</span>
                </div>

                {/* Rekommendation */}
                {resultat.gallring.behov && resultat.gallring.malGrundyta && (
                  <div style={{ background: 'rgba(239,68,68,0.1)', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px', fontSize: '13px' }}>
                    Grundyta {resultat.gallring.grundyta} m²/ha → bör gallras till ca {resultat.gallring.malGrundyta} m²/ha
                  </div>
                )}

                {/* Skogliga värden */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                  {[
                    { label: 'Grundyta', value: `${resultat.grundyta}`, unit: 'm²/ha' },
                    { label: 'Medelhöjd', value: `${resultat.medelhojd}`, unit: 'm' },
                    { label: 'Medeldia.', value: `${resultat.medeldiameter}`, unit: 'cm' },
                    { label: 'Stamantal', value: `${fmtNum(resultat.gallring.stamantal)}`, unit: 'st/ha' },
                  ].map(item => (
                    <div key={item.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                      <div style={{ fontSize: '13px', opacity: 0.7 }}>{item.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Fördelningsstapel */}
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                  {resultat.gallring.fordelning.lagt > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.lagt * 100}%`, background: '#30d158' }} />
                  )}
                  {resultat.gallring.fordelning.medel > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.medel * 100}%`, background: '#eab308' }} />
                  )}
                  {resultat.gallring.fordelning.hogt > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.hogt * 100}%`, background: '#f97316' }} />
                  )}
                  {resultat.gallring.fordelning.akut > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.akut * 100}%`, background: '#ff453a' }} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '13px', opacity: 0.85, flexWrap: 'wrap' }}>
                  {resultat.gallring.fordelning.lagt > 0.01 && <span style={{ color: '#30d158' }}>Lågt {Math.round(resultat.gallring.fordelning.lagt * 100)}%</span>}
                  {resultat.gallring.fordelning.medel > 0.01 && <span style={{ color: '#eab308' }}>Medel {Math.round(resultat.gallring.fordelning.medel * 100)}%</span>}
                  {resultat.gallring.fordelning.hogt > 0.01 && <span style={{ color: '#f97316' }}>Högt {Math.round(resultat.gallring.fordelning.hogt * 100)}%</span>}
                  {resultat.gallring.fordelning.akut > 0.01 && <span style={{ color: '#ff453a' }}>Akut {Math.round(resultat.gallring.fordelning.akut * 100)}%</span>}
                </div>
              </div>
            </div>
          )}

          {/* Körbarhet */}
          {(korbarhetsLoading || korbarhetsResultat) && (
            <KorbarhetPanel
              resultat={korbarhetsResultat ?? null}
              loading={korbarhetsLoading ?? false}
              totalVolymM3sk={resultat.totalVolym}
            />
          )}

          {/* Källa */}
          <div style={{ fontSize: '13px', opacity: 0.6, textAlign: 'center', marginTop: '16px', padding: '0 8px' }}>
            Volym: Skogliga Grunddata (laserdata {resultat.skanningsAr}). Trädslag: SLU Skogskarta (~{resultat.sluAr}).{korbarhetsResultat?.status === 'done' ? ' Körbarhet: SGU jordarter + SLU markfuktighet + SKS lutning.' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
