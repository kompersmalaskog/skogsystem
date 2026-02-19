'use client'
import type { KorbarhetsResultat } from '../../lib/korbarhet'

interface KorbarhetPanelProps {
  resultat: KorbarhetsResultat | null;
  loading: boolean;
  totalVolymM3sk: number;
}

type Bedomning = 'kor' | 'planera' | 'undvik';

const bedomningConfig: Record<Bedomning, { icon: string; label: string; color: string; bg: string }> = {
  kor:     { icon: '\u2713', label: 'KÖR',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  planera: { icon: '!',      label: 'PLANERA',  color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  undvik:  { icon: '\u2715', label: 'UNDVIK',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const sasongText: Record<string, string> = { torrt: 'torrt just nu', normalt: 'normala förhållanden', blott: 'blött just nu' };

const bedomningText: Record<Bedomning, string> = {
  kor: 'bra bärighet',
  planera: 'begränsad bärighet',
  undvik: 'dålig bärighet',
};

// Wsymb2 → väderikon
function weatherIcon(symbol: number): string {
  if (symbol <= 2) return '\u2600\uFE0F';       // sol
  if (symbol <= 6) return '\u26C5';               // halvmoln
  if (symbol <= 10) return '\u2601\uFE0F';       // moln
  if (symbol <= 14) return '\uD83C\uDF27\uFE0F'; // regn
  if (symbol <= 17) return '\u2744\uFE0F';       // snö
  if (symbol <= 19) return '\u2601\uFE0F';       // moln
  if (symbol <= 21) return '\uD83C\uDF27\uFE0F'; // regn
  return '\u26A1';                                // åska
}

const VECKODAGAR = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

export default function KorbarhetPanel({ resultat, loading, totalVolymM3sk }: KorbarhetPanelProps) {
  if (!resultat && !loading) return null;

  const sasong = resultat?.smhi?.sasong ?? 'normalt';

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

  const bedomning: Bedomning = ford.gron > 0.7 ? 'kor' : ford.gron >= 0.4 ? 'planera' : 'undvik';
  const cfg = bedomningConfig[bedomning];

  // Sammanfattningsrad
  const jordart = resultat?.dominantJordart ?? '';
  const lutning = resultat?.medelLutning ?? 0;
  const markstatus = sasongText[sasong] || 'normala förhållanden';
  const sammanfattning = `${jordart}, ${lutning}\u00B0 lutning, ${markstatus} \u2013 ${bedomningText[bedomning]}`;

  // Intelligent vädervarning
  const prognos = resultat?.smhi?.prognos;
  let vaderVarning: string | null = null;
  if (prognos) {
    const summa3d = prognos.summa3d;
    const summa7d = prognos.summa7d;

    // Hitta första regniga dagen (>5mm)
    const forstaRegnDag = prognos.dagar.findIndex(d => d.nederbord > 5);

    if (sasong === 'torrt' && summa3d > 10 && forstaRegnDag >= 0) {
      vaderVarning = `Torrt nu men regn om ${forstaRegnDag + 1} dag${forstaRegnDag > 0 ? 'ar' : ''} \u2013 planera skotning f\u00F6re`;
    } else if (summa3d > 15) {
      const nyttLage = bedomning === 'kor' ? 'GUL' : 'R\u00D6D';
      vaderVarning = `Regn v\u00E4ntas (${Math.round(summa3d)}mm/3d) \u2013 k\u00F6rbarheten sjunker till ${nyttLage}`;
    } else if (sasong === 'blott' && summa7d < 10) {
      vaderVarning = `Bl\u00F6tt nu men uppeh\u00E5ll kommande veckan \u2013 b\u00E4ttre om 3\u20134 dagar`;
    }
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '11px', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '1px', padding: '0 4px', marginBottom: '8px' }}>
        K\u00F6rbarhetsanalys
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '16px', fontSize: '13px', opacity: 0.5 }}>
          <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          Analyserar k\u00F6rbarhet...
        </div>
      )}

      {resultat?.status === 'error' && (
        <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#f87171' }}>
          {resultat.felmeddelande}
        </div>
      )}

      {resultat?.status === 'done' && (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '12px 14px' }}>

          {/* Stor bedömningsikon + sammanfattning */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
              background: cfg.bg, border: `2px solid ${cfg.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px', fontWeight: '700', color: cfg.color,
            }}>
              {cfg.icon}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: cfg.color, marginBottom: '2px' }}>
                {cfg.label}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.7, lineHeight: '1.4' }}>
                {sammanfattning}
              </div>
            </div>
          </div>

          {/* Fördelningsstapel */}
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '6px' }}>
            {ford.gron > 0 && <div style={{ width: `${ford.gron * 100}%`, background: '#22c55e' }} />}
            {ford.gul > 0 && <div style={{ width: `${ford.gul * 100}%`, background: '#eab308' }} />}
            {ford.rod > 0 && <div style={{ width: `${ford.rod * 100}%`, background: '#ef4444' }} />}
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '11px', opacity: 0.7, marginBottom: '12px' }}>
            {ford.gron > 0.01 && <span style={{ color: '#22c55e' }}>K\u00F6rbart {Math.round(ford.gron * 100)}%</span>}
            {ford.gul > 0.01 && <span style={{ color: '#eab308' }}>Begr\u00E4nsat {Math.round(ford.gul * 100)}%</span>}
            {ford.rod > 0.01 && <span style={{ color: '#ef4444' }}>Ej k\u00F6rbart {Math.round(ford.rod * 100)}%</span>}
          </div>

          {/* 10-dagars väderprognos */}
          {prognos && prognos.dagar.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '8px 6px',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '10px', opacity: 0.4, marginBottom: '6px', paddingLeft: '4px' }}>
                SMHI 10-DAGARSPROGNOS {resultat.smhi?.station ? `\u2013 ${resultat.smhi.station}` : ''}
              </div>
              <div style={{
                display: 'flex',
                gap: '0',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
              }}>
                {prognos.dagar.map((dag, i) => {
                  const dt = new Date(dag.datum + 'T12:00:00');
                  const veckodag = VECKODAGAR[dt.getDay()];
                  const isHeavy = dag.nederbord > 5;
                  return (
                    <div key={dag.datum} style={{
                      flex: '1 0 auto',
                      minWidth: '36px',
                      textAlign: 'center',
                      padding: '2px 3px',
                      borderRight: i < prognos.dagar.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}>
                      <div style={{ fontSize: '9px', opacity: 0.5, textTransform: 'uppercase' }}>
                        {veckodag}
                      </div>
                      <div style={{ fontSize: '16px', lineHeight: '1.2' }}>
                        {weatherIcon(dag.symbol)}
                      </div>
                      <div style={{
                        fontSize: '10px',
                        fontVariantNumeric: 'tabular-nums',
                        color: isHeavy ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                        fontWeight: isHeavy ? '600' : '400',
                      }}>
                        {dag.nederbord > 0 ? `${dag.nederbord}` : '\u2013'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '4px', paddingLeft: '4px' }}>
                3d: {prognos.summa3d}mm \u00B7 7d: {prognos.summa7d}mm
              </div>
            </div>
          )}

          {/* Intelligent vädervarning */}
          {vaderVarning && (
            <div style={{
              background: 'rgba(96,165,250,0.12)',
              border: '1px solid rgba(96,165,250,0.25)',
              borderRadius: '10px',
              padding: '8px 12px',
              fontSize: '12px',
              marginBottom: '12px',
              color: '#93c5fd',
              lineHeight: '1.4',
            }}>
              {vaderVarning}
            </div>
          )}

          {/* Varning: undvik */}
          {bedomning === 'undvik' && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '12px',
            }}>
              <div style={{ fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
                Ej l\u00E4mplig utan special\u00E5tg\u00E4rder
              </div>
              <div style={{ opacity: 0.7, lineHeight: '1.4' }}>
                Risning, kavling eller tj\u00E4lad mark kr\u00E4vs f\u00F6r att undvika markskador.
              </div>
            </div>
          )}

          {bedomning !== 'undvik' && basvagVarning && (
            <div style={{
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.25)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '12px',
            }}>
              <div style={{ fontWeight: '600', color: '#fbbf24', marginBottom: '4px' }}>
                H\u00F6g volym ({antalLass} lass) p\u00E5 k\u00E4nslig mark
              </div>
              <div style={{ opacity: 0.7, lineHeight: '1.4' }}>
                Planera basv\u00E4gen p\u00E5 fastmark &ndash; det \u00E4r basv\u00E4gen som \u00E4r den kritiska punkten, inte avverkningsytan.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
