'use client'
import type { KorbarhetsResultat, SmhiPrognosDag } from '../../lib/korbarhet'

interface KorbarhetPanelProps {
  resultat: KorbarhetsResultat | null;
  loading: boolean;
  totalVolymM3sk: number;
}

type Bedomning = 'kor' | 'planera' | 'undvik';

const bedomningConfig: Record<Bedomning, { icon: string; label: string; color: string; bg: string }> = {
  kor:     { icon: '✓', label: 'KÖR',     color: '#30d158', bg: 'rgba(34,197,94,0.15)' },
  planera: { icon: '!', label: 'PLANERA',  color: '#eab308', bg: 'rgba(234,179,8,0.15)' },
  undvik:  { icon: '✕', label: 'UNDVIK',   color: '#ff453a', bg: 'rgba(239,68,68,0.15)' },
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
// Material Symbols Outlined-namn för Wsymb2 + temperatur
function weatherIcon(dag: SmhiPrognosDag): string {
  const { symbol, tempMin, tempMax, nederbord } = dag;
  const avgTemp = (tempMin + tempMax) / 2;

  // Åska
  if (symbol === 21 || symbol === 11) return 'thunderstorm';

  // Nederbörd + temperatur → snö/regn
  if (nederbord > 0 && symbol >= 11) {
    if (avgTemp < 0) return 'weather_snowy';
    if (avgTemp < 2) return 'cloudy_snowing';
    return 'rainy';
  }

  // Wsymb2-baserade ikoner (utan betydande nederbörd)
  if (symbol <= 2) return 'sunny';
  if (symbol <= 4) return 'partly_cloudy_day';
  if (symbol <= 6) return 'partly_cloudy_day';
  if (symbol <= 10) return 'cloud';
  if (symbol <= 14) {
    if (avgTemp < 0) return 'weather_snowy';
    if (avgTemp < 2) return 'cloudy_snowing';
    return 'rainy';
  }
  if (symbol <= 17) return 'weather_snowy';
  if (symbol <= 19) return 'foggy';
  if (symbol <= 21) {
    if (avgTemp < 0) return 'weather_snowy';
    return 'rainy';
  }
  return 'thunderstorm';
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
      <div style={{ fontSize: '13px', opacity: 0.7, padding: '0 4px', marginBottom: '8px' }}>
        Körbarhetsanalys
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '16px', fontSize: '13px', opacity: 0.75 }}>
          <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }} />
          Analyserar körbarhet...
        </div>
      )}

      {resultat?.status === 'error' && (
        <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: '#ff453a' }}>
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
              <div style={{ fontSize: '13px', opacity: 0.85, lineHeight: '1.4' }}>
                {sammanfattning}
              </div>
            </div>
          </div>

          {/* Fördelningsstapel */}
          <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '6px' }}>
            {ford.gron > 0 && <div style={{ width: `${ford.gron * 100}%`, background: '#30d158' }} />}
            {ford.gul > 0 && <div style={{ width: `${ford.gul * 100}%`, background: '#eab308' }} />}
            {ford.rod > 0 && <div style={{ width: `${ford.rod * 100}%`, background: '#ff453a' }} />}
          </div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '13px', opacity: 0.85, marginBottom: '12px' }}>
            {ford.gron > 0.01 && <span style={{ color: '#30d158' }}>Körbart {Math.round(ford.gron * 100)}%</span>}
            {ford.gul > 0.01 && <span style={{ color: '#eab308' }}>Begränsat {Math.round(ford.gul * 100)}%</span>}
            {ford.rod > 0.01 && <span style={{ color: '#ff453a' }}>Ej körbart {Math.round(ford.rod * 100)}%</span>}
          </div>

          {/* 10-dagars väderprognos */}
          {prognos && prognos.dagar.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '8px',
              padding: '8px 4px 6px',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.7, marginBottom: '6px', paddingLeft: '6px' }}>
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
                      minWidth: '58px',
                      textAlign: 'center',
                      padding: '4px 2px 3px',
                      borderRight: i < prognos.dagar.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      background: isToday ? 'rgba(96,165,250,0.12)' : 'transparent',
                      borderRadius: isToday ? '6px' : '0',
                    }}>
                      {/* Veckodag */}
                      <div style={{
                        fontSize: '13px',
                        opacity: isToday ? 0.95 : 0.75,
                        fontWeight: isToday ? '600' : '400',
                        color: isToday ? '#93c5fd' : 'inherit',
                        marginBottom: '2px',
                      }}>
                        {isToday ? 'idag' : veckodag}
                      </div>

                      {/* Väderikon */}
                      <div style={{ lineHeight: 1, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)' }}>
                          {weatherIcon(dag)}
                        </span>
                      </div>

                      {/* Temperatur min/max */}
                      <div style={{
                        fontSize: '13px',
                        fontVariantNumeric: 'tabular-nums',
                        color: isFreezing ? '#93c5fd' : 'rgba(255,255,255,0.75)',
                        lineHeight: '1.3',
                        marginTop: '1px',
                      }}>
                        {dag.tempMin}/{dag.tempMax}°
                      </div>

                      {/* Nederbörd mm */}
                      <div style={{
                        fontSize: '13px',
                        fontVariantNumeric: 'tabular-nums',
                        color: isHeavy ? '#60a5fa' : 'rgba(255,255,255,0.7)',
                        fontWeight: isHeavy ? '600' : '400',
                        marginTop: '1px',
                      }}>
                        {dag.nederbord > 0 ? `${dag.nederbord}mm` : '–'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '4px', paddingLeft: '6px' }}>
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
              fontSize: '13px',
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
              fontSize: '13px',
            }}>
              <div style={{ fontWeight: '600', color: '#ff453a', marginBottom: '4px' }}>
                Ej lämplig utan specialåtgärder
              </div>
              <div style={{ opacity: 0.85, lineHeight: '1.4' }}>
                Risning, kavling eller tjälad mark krävs för att undvika markskador.
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
