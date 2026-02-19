'use client'
import { useState } from 'react'
import type { KorbarhetsResultat } from '../../lib/korbarhet'

interface KorbarhetPanelProps {
  resultat: KorbarhetsResultat | null;
  loading: boolean;
  totalVolymM3sk: number;
}

type Sasong = 'torrt' | 'normalt' | 'blott';

export default function KorbarhetPanel({ resultat, loading, totalVolymM3sk }: KorbarhetPanelProps) {
  const [sasong, setSasong] = useState<Sasong>('normalt');

  if (!resultat && !loading) return null;

  const getFordelning = () => {
    if (!resultat) return { gron: 0, gul: 0, rod: 0 };
    const { gron, gul, rod } = resultat.fordelning;
    switch (sasong) {
      case 'torrt': return { gron: gron + gul, gul: 0, rod };
      case 'blott': return { gron, gul: 0, rod: gul + rod };
      default: return { gron, gul, rod };
    }
  };

  const ford = getFordelning();
  const antalLass = totalVolymM3sk > 0 ? Math.ceil(totalVolymM3sk * 0.8 / 13) : 0;
  const basvagVarning = antalLass > 30 && (ford.gul + ford.rod) > 0.4;

  const getSammanfattning = (): string => {
    if (ford.gron > 0.7) return 'Trakten är körbar under normala förhållanden';
    if (ford.rod > 0.5) return 'Trakten har dålig bärighet \u2013 undvik körning vid blöta förhållanden';
    if (ford.gul > 0.3) return 'Trakten har begränsad körbarhet \u2013 planera för torra perioder';
    return 'Blandad bärighet \u2013 anpassa efter aktuella förhållanden';
  };

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', padding: '0 4px', marginBottom: '8px' }}>
        Körbarhetsanalys
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '16px', fontSize: '13px', opacity: 0.5 }}>
          <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          Analyserar körbarhet...
        </div>
      )}

      {resultat?.status === 'error' && (
        <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#f87171' }}>
          {resultat.felmeddelande}
        </div>
      )}

      {resultat?.status === 'done' && (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px 14px' }}>
          {/* Säsongsväljare */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            {([
              { key: 'torrt' as Sasong, label: 'Torrt', desc: 'Sommar' },
              { key: 'normalt' as Sasong, label: 'Normalt', desc: 'Vår/höst' },
              { key: 'blott' as Sasong, label: 'Blött', desc: 'Utan tjäle' },
            ]).map(s => (
              <button
                key={s.key}
                onClick={() => setSasong(s.key)}
                style={{
                  flex: 1,
                  padding: '8px 0 6px',
                  border: sasong === s.key ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: sasong === s.key ? '600' : '400',
                  background: sasong === s.key ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                  color: '#fff',
                  cursor: 'pointer',
                  lineHeight: '1.2',
                }}
              >
                {s.label}
                <div style={{ fontSize: '9px', opacity: 0.4, marginTop: '2px' }}>{s.desc}</div>
              </button>
            ))}
          </div>

          {/* Fördelningsstapel */}
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '6px' }}>
            {ford.gron > 0 && <div style={{ width: `${ford.gron * 100}%`, background: '#22c55e' }} />}
            {ford.gul > 0 && <div style={{ width: `${ford.gul * 100}%`, background: '#eab308' }} />}
            {ford.rod > 0 && <div style={{ width: `${ford.rod * 100}%`, background: '#ef4444' }} />}
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '11px', opacity: 0.7, marginBottom: '12px' }}>
            {ford.gron > 0.01 && <span style={{ color: '#22c55e' }}>Körbart {Math.round(ford.gron * 100)}%</span>}
            {ford.gul > 0.01 && <span style={{ color: '#eab308' }}>Begränsat {Math.round(ford.gul * 100)}%</span>}
            {ford.rod > 0.01 && <span style={{ color: '#ef4444' }}>Ej körbart {Math.round(ford.rod * 100)}%</span>}
          </div>

          {/* Sammanfattning */}
          <div style={{ fontSize: '13px', marginBottom: '12px', lineHeight: '1.4' }}>
            {getSammanfattning()}
          </div>

          {/* Info-rad */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>Skotarlass</div>
              <div style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>~{antalLass}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>Medellutning</div>
              <div style={{ fontSize: '14px', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{resultat.medelLutning}°</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '2px' }}>Jordart</div>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>{resultat.dominantJordart}</div>
            </div>
          </div>

          {/* Jordart-fördelning om blandad */}
          {resultat.jordartFordelning.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', opacity: 0.5, marginBottom: '10px', flexWrap: 'wrap', padding: '0 2px' }}>
              {resultat.jordartFordelning.map(j => (
                <span key={j.namn}>{j.namn} {Math.round(j.andel * 100)}%</span>
              ))}
            </div>
          )}

          {/* Basvägsvarning */}
          {basvagVarning && (
            <div style={{
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '12px',
            }}>
              <div style={{ fontWeight: '600', color: '#fbbf24', marginBottom: '4px' }}>
                Hög volym ({antalLass} lass) på känslig mark
              </div>
              <div style={{ opacity: 0.7, lineHeight: '1.4' }}>
                Planera basvägen på fastmark &ndash; det är basvägen som är den kritiska punkten, inte avverkningsytan.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
