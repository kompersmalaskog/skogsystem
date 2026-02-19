'use client'
import type { KorbarhetsResultat, SmhiPrognosDag } from '../../lib/korbarhet'

interface KorbarhetPanelProps {
  resultat: KorbarhetsResultat | null;
  loading: boolean;
  totalVolymM3sk: number;
}

type Bedomning = 'kor' | 'planera' | 'undvik';

const bedomningConfig: Record<Bedomning, { icon: string; label: string; color: string; bg: string }> = {
  kor:     { icon: '✓', label: 'KÖR',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  planera: { icon: '!', label: 'PLANERA',  color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  undvik:  { icon: '✕', label: 'UNDVIK',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

const sasongText: Record<string, string> = {
  torrt: 'torrt just nu',
  normalt: 'normala förhållanden',
  blott: 'blött just nu',
};

const bedomningText: Record<Bedomning, string> = {
  kor: 'bra bärighet',
  planera: 'begränsad bärighet',
  undvik: 'dålig bärighet',
};

// Wsymb2 + temperatur → väderikon
function weatherIcon(dag: SmhiPrognosDag): string {
  const { symbol, tempMin, tempMax, nederbord } = dag;
  const avgTemp = (tempMin + tempMax) / 2;

  // Åska (Wsymb2: 21, 11 med åska-varianter)
  if (symbol === 21 || symbol === 11) return '⛈️';

  // Nederbörd + temperatur → snö/regn
  if (nederbord > 0 && symbol >= 11) {
    if (avgTemp < 0) return '❄️';           // Snö
    if (avgTemp < 2) return '🌨️';           // Snöblandat regn
    if (nederbord > 8) return '🌧️🌧️';      // Kraftigt regn
    return '🌧️';                             // Lätt–måttligt regn
  }

  // Wsymb2-baserade ikoner (utan betydande nederbörd)
  if (symbol <= 2) return '☀️';              // Klart
  if (symbol <= 4) return '⛅';              // Halvmoln
  if (symbol <= 6) return '🌤️';             // Mest moln
  if (symbol <= 10) return '☁️';             // Mulet
  if (symbol <= 14) {                        // Regn-klasser
    if (avgTemp < 0) return '❄️';
    if (avgTemp < 2) return '🌨️';
    if (nederbord > 8) return '🌧️🌧️';
    return '🌧️';
  }
  if (symbol <= 17) return '❄️';             // Snö-klasser
  if (symbol <= 19) return '☁️';             // Dimma/dis
  if (symbol <= 21) {                        // Åska
    if (avgTemp < 0) return '❄️';
    return '🌧️';
  }
  return '⛈️';                               // Åska kraftigt
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
  const sammanfattning = `${jordart}, ${lutning}° lutning, ${markstatus} – ${bedomningText[bedomning]}`;

  // Intelligent vädervarning
  const prognos = resultat?.smhi?.prognos;
  let väderVarning: string | null = null;
  if (prognos) {
    const summa3d = prognos.summa3d;
    const summa7d = prognos.summa7d;

    // Hitta första regniga dagen (>5mm)
    const förstaRegnDag = prognos.dagar.findIndex(d => d.nederbord > 5);

    if (sasong === 'torrt' && summa3d > 10 && förstaRegnDag >= 0) {
      väderVarning = `Torrt nu men regn om ${förstaRegnDag + 1} dag${förstaRegnDag > 0 ? 'ar' : ''} – planera skotning före`;
    } else if (summa3d > 15) {
      const nyttLäge = bedomning === 'kor' ? 'GUL' : 'RÖD';
      väderVarning = `Regn väntas (${Math.round(summa3d)}mm/3d) – körbarheten sjunker till ${nyttLäge}`;
    } else if (sasong === 'blott' && summa7d < 10) {
      väderVarning = 'Blött nu men uppehåll kommande veckan – bättre om 3–4 dagar';
    }
  }

  const today = new Date().toISOString().slice(0, 10);

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
            {ford.gron > 0.01 && <span style={{ color: '#22c55e' }}>Körbart {Math.round(ford.gron * 100)}%</span>}
            {ford.gul > 0.01 && <span style={{ color: '#eab308' }}>Begränsat {Math.round(ford.gul * 100)}%</span>}
            {ford.rod > 0.01 && <span style={{ color: '#ef4444' }}>Ej körbart {Math.round(ford.rod * 100)}%</span>}
          </div>

          {/* 10-dagars väderprognos */}
          {prognos && prognos.dagar.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '8px 4px 6px',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '10px', opacity: 0.4, marginBottom: '6px', paddingLeft: '6px' }}>
                SMHI 10-DAGARSPROGNOS{resultat.smhi?.station ? ` – ${resultat.smhi.station}` : ''}
              </div>
              <div style={{
                display: 'flex',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch' as never,
              }}>
                {prognos.dagar.map((dag, i) => {
                  const dt = new Date(dag.datum + 'T12:00:00');
                  const veckodag = VECKODAGAR[dt.getDay()];
                  const isToday = dag.datum === today;
                  const isHeavy = dag.nederbord > 5;
                  const isFreezing = dag.tempMin < 0;

                  return (
                    <div key={dag.datum} style={{
                      flex: '1 0 auto',
                      minWidth: '38px',
                      textAlign: 'center',
                      padding: '4px 2px 3px',
                      borderRight: i < prognos.dagar.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      background: isToday ? 'rgba(96,165,250,0.12)' : 'transparent',
                      borderRadius: isToday ? '6px' : '0',
                    }}>
                      {/* Veckodag */}
                      <div style={{
                        fontSize: '9px',
                        opacity: isToday ? 0.9 : 0.5,
                        textTransform: 'uppercase',
                        fontWeight: isToday ? '600' : '400',
                        color: isToday ? '#93c5fd' : 'inherit',
                        marginBottom: '2px',
                      }}>
                        {isToday ? 'idag' : veckodag}
                      </div>

                      {/* Väderikon */}
                      <div style={{ fontSize: '15px', lineHeight: '1.3' }}>
                        {weatherIcon(dag)}
                      </div>

                      {/* Temperatur min/max */}
                      <div style={{
                        fontSize: '9px',
                        fontVariantNumeric: 'tabular-nums',
                        color: isFreezing ? '#93c5fd' : 'rgba(255,255,255,0.5)',
                        lineHeight: '1.3',
                        marginTop: '1px',
                      }}>
                        {dag.tempMin}/{dag.tempMax}°
                      </div>

                      {/* Nederbörd mm */}
                      <div style={{
                        fontSize: '9px',
                        fontVariantNumeric: 'tabular-nums',
                        color: isHeavy ? '#60a5fa' : 'rgba(255,255,255,0.35)',
                        fontWeight: isHeavy ? '600' : '400',
                        marginTop: '1px',
                      }}>
                        {dag.nederbord > 0 ? `${dag.nederbord}mm` : '–'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.4, marginTop: '4px', paddingLeft: '6px' }}>
                3d: {prognos.summa3d}mm · 7d: {prognos.summa7d}mm
              </div>
            </div>
          )}

          {/* Intelligent vädervarning */}
          {väderVarning && (
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
              {väderVarning}
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
                Ej lämplig utan specialåtgärder
              </div>
              <div style={{ opacity: 0.7, lineHeight: '1.4' }}>
                Risning, kavling eller tjälad mark krävs för att undvika markskador.
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
                Hög volym ({antalLass} lass) på känslig mark
              </div>
              <div style={{ opacity: 0.7, lineHeight: '1.4' }}>
                Planera basvägen på fastmark – det är basvägen som är den kritiska punkten, inte avverkningsytan.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
