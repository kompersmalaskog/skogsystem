'use client'
import type { VolymResultat } from '../../lib/skoglig-berakning'

interface VolymPanelProps {
  resultat: VolymResultat | null;
  loading: boolean;
  onClose: () => void;
}

const fmtNum = (n: number, d = 0) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function VolymPanel({ resultat, loading, onClose }: VolymPanelProps) {
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
      maxHeight: '70vh',
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
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '16px' }}>
          ✕
        </button>
      </div>

      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '14px', opacity: 0.6 }}>Beräknar volym via Skogliga Grunddata...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {resultat?.status === 'error' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠</div>
          <div style={{ fontSize: '14px', color: '#f87171' }}>{resultat.felmeddelande}</div>
        </div>
      )}

      {resultat?.status === 'no_data' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🌲</div>
          <div style={{ fontSize: '14px', opacity: 0.6 }}>{resultat.felmeddelande}</div>
          <div style={{ fontSize: '12px', opacity: 0.4, marginTop: '4px' }}>Areal: {resultat.areal} ha</div>
        </div>
      )}

      {resultat?.status === 'done' && (
        <div style={{ padding: '0 16px 20px' }}>
          {/* Avverkningsvarning */}
          {resultat.avverkatVarning && (
            <div style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>⚠</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#fbbf24' }}>Området verkar avverkat</div>
                <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '2px' }}>Låg volym trots skogsmark. Data kan vara inaktuellt.</div>
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
                <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '15px', fontWeight: '600' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Skogsmark-rad */}
          {resultat.andelSkog < 1.0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '4px' }}>Skogsmark</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{fmtNum(resultat.arealSkog, 2)} ha ({Math.round(resultat.andelSkog * 100)}%)</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '4px' }}>Medeldiameter</div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{resultat.medeldiameter} cm</div>
              </div>
            </div>
          )}

          {/* Extra info */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', fontSize: '12px', opacity: 0.5, padding: '0 4px', flexWrap: 'wrap' }}>
            {resultat.andelSkog >= 1.0 && <span>Medeldiameter: {resultat.medeldiameter} cm</span>}
            <span>Medelhöjd: {resultat.medelhojd} m</span>
            <span>Laserskannat: {resultat.skanningsAr}</span>
            <span>SLU Skogskarta: ~{resultat.sluAr}</span>
          </div>

          {/* Trädslag-tabell */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px 50px', gap: '4px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', opacity: 0.5 }}>
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
                <span style={{ fontSize: '14px', textAlign: 'right', opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{Math.round(t.andel * 100)}%</span>
              </div>
            ))}
          </div>

          {/* Gallringsanalys */}
          {resultat.gallring && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', padding: '0 4px', marginBottom: '8px' }}>
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
                  <span style={{ fontSize: '14px', fontWeight: '600', color: resultat.gallring.behov ? '#ef4444' : '#22c55e' }}>
                    Gallringsbehov: {resultat.gallring.behov ? 'Ja' : 'Nej'}
                  </span>
                  <span style={{ fontSize: '11px', opacity: 0.5 }}>Mall: {resultat.gallring.sis}</span>
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
                      <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>{item.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                      <div style={{ fontSize: '10px', opacity: 0.4 }}>{item.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Fördelningsstapel */}
                <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                  {resultat.gallring.fordelning.lagt > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.lagt * 100}%`, background: '#22c55e' }} />
                  )}
                  {resultat.gallring.fordelning.medel > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.medel * 100}%`, background: '#eab308' }} />
                  )}
                  {resultat.gallring.fordelning.hogt > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.hogt * 100}%`, background: '#f97316' }} />
                  )}
                  {resultat.gallring.fordelning.akut > 0 && (
                    <div style={{ width: `${resultat.gallring.fordelning.akut * 100}%`, background: '#ef4444' }} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', fontSize: '11px', opacity: 0.7, flexWrap: 'wrap' }}>
                  {resultat.gallring.fordelning.lagt > 0.01 && <span style={{ color: '#22c55e' }}>Lågt {Math.round(resultat.gallring.fordelning.lagt * 100)}%</span>}
                  {resultat.gallring.fordelning.medel > 0.01 && <span style={{ color: '#eab308' }}>Medel {Math.round(resultat.gallring.fordelning.medel * 100)}%</span>}
                  {resultat.gallring.fordelning.hogt > 0.01 && <span style={{ color: '#f97316' }}>Högt {Math.round(resultat.gallring.fordelning.hogt * 100)}%</span>}
                  {resultat.gallring.fordelning.akut > 0.01 && <span style={{ color: '#ef4444' }}>Akut {Math.round(resultat.gallring.fordelning.akut * 100)}%</span>}
                </div>
              </div>
            </div>
          )}

          {/* Källa */}
          <div style={{ fontSize: '11px', opacity: 0.3, textAlign: 'center', marginTop: '16px', padding: '0 8px' }}>
            Volym: Skogliga Grunddata (laserdata {resultat.skanningsAr}). Trädslag: SLU Skogskarta (~{resultat.sluAr}).
          </div>
        </div>
      )}
    </div>
  );
}
