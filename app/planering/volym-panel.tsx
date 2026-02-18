'use client'
import { useState } from 'react'
import type { VolymResultat } from '../../lib/skoglig-berakning'

interface VolymPanelProps {
  resultat: VolymResultat | null;
  loading: boolean;
  onClose: () => void;
}

const fmtNum = (n: number, d = 0) => n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function VolymPanel({ resultat, loading, onClose }: VolymPanelProps) {
  const [showGrot, setShowGrot] = useState(false);

  if (!resultat && !loading) return null;

  const totalSagtimmer = resultat?.tradslag.reduce((s, t) => s + t.sagtimmer, 0) || 0;
  const totalMassaved = resultat?.tradslag.reduce((s, t) => s + t.massaved, 0) || 0;
  const totalGrot = resultat?.tradslag.reduce((s, t) => s + t.grot, 0) || 0;

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
          <div style={{ fontSize: '14px', opacity: 0.6 }}>Beräknar volym via SLU Skogskarta...</div>
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
          {/* Sammanfattning */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            {[
              { label: 'Areal', value: `${fmtNum(resultat.areal, 2)} ha` },
              { label: 'Volym/ha', value: `${fmtNum(resultat.totalVolymHa, 1)} m³sk` },
              { label: 'Total volym', value: `${fmtNum(resultat.totalVolym)} m³sk` },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '15px', fontWeight: '600' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Extra info */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', fontSize: '12px', opacity: 0.5, padding: '0 4px' }}>
            <span>Medeldiameter: {resultat.medeldiameter} cm</span>
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

          {/* Sortiment */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', padding: '0 4px', marginBottom: '8px' }}>
              Sortiment (uppskattat)
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px', gap: '4px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', opacity: 0.5 }}>
                <span>Trädslag</span>
                <span style={{ textAlign: 'right' }}>Sågtimmer</span>
                <span style={{ textAlign: 'right' }}>Massaved</span>
              </div>
              {resultat.tradslag.map(t => (
                <div key={t.namn} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px', gap: '4px', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '14px' }}>{t.namn}</span>
                  <span style={{ fontSize: '14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.sagtimmer)} m³fub</span>
                  <span style={{ fontSize: '14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.massaved)} m³fub</span>
                </div>
              ))}
              {/* Summa */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px', gap: '4px', padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: '600' }}>
                <span style={{ fontSize: '14px' }}>Totalt</span>
                <span style={{ fontSize: '14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(totalSagtimmer)} m³fub</span>
                <span style={{ fontSize: '14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(totalMassaved)} m³fub</span>
              </div>
            </div>
          </div>

          {/* GROT toggle */}
          <div style={{ marginTop: '12px' }}>
            <button
              onClick={() => setShowGrot(!showGrot)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>GROT (grenar och toppar)</span>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#22c55e' }}>{fmtNum(totalGrot, 1)} ton TS</span>
            </button>
            {showGrot && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0 0 10px 10px', overflow: 'hidden', borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {resultat.tradslag.map(t => (
                  <div key={t.namn} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                    <span style={{ opacity: 0.7 }}>{t.namn}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.grot, 1)} ton TS</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Källa */}
          <div style={{ fontSize: '11px', opacity: 0.3, textAlign: 'center', marginTop: '16px', padding: '0 8px' }}>
            Data: SLU Skogskarta via Skogsstyrelsen. Sortiment uppskattat med förenklade utbytestabeller.
          </div>
        </div>
      )}
    </div>
  );
}
