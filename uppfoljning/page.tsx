'use client';

import { useState, useMemo } from 'react';

// === TYPER ===
interface Objekt {
  id: string;
  objektNamn: string;
  voNummer: string | null;
  objektUserID: string;
  avverkningstyp: 'slutavverkning' | 'gallring';
  agare: string;
  areal: number;
  volymSkordare: number;
  volymSkotare: number;
  stammar: number;
  startDatum: string;
  status: 'pagaende' | 'avslutat';
}

// === TESTDATA ===
const objektLista: Objekt[] = [
  {
    id: '1',
    objektNamn: 'Karatorp RP 2025',
    voNummer: '11109556',
    objektUserID: '881416',
    avverkningstyp: 'slutavverkning',
    agare: 'Södra',
    areal: 2.33,
    volymSkordare: 545,
    volymSkotare: 432,
    stammar: 700,
    startDatum: '2026-01-15',
    status: 'pagaende',
  },
  {
    id: '2',
    objektNamn: 'Björkebråten',
    voNummer: null,
    objektUserID: '93693',
    avverkningstyp: 'gallring',
    agare: 'Stefan Svensson',
    areal: 4.5,
    volymSkordare: 184,
    volymSkotare: 146,
    stammar: 631,
    startDatum: '2026-01-14',
    status: 'pagaende',
  },
  {
    id: '3',
    objektNamn: 'Stenåsa',
    voNummer: '11108234',
    objektUserID: '881320',
    avverkningstyp: 'gallring',
    agare: 'Södra',
    areal: 8.2,
    volymSkordare: 312,
    volymSkotare: 312,
    stammar: 1245,
    startDatum: '2026-01-08',
    status: 'avslutat',
  },
  {
    id: '4',
    objektNamn: 'Möckleryd',
    voNummer: '11107892',
    objektUserID: '881105',
    avverkningstyp: 'slutavverkning',
    agare: 'Södra',
    areal: 3.8,
    volymSkordare: 856,
    volymSkotare: 856,
    stammar: 1892,
    startDatum: '2025-12-18',
    status: 'avslutat',
  },
  {
    id: '5',
    objektNamn: 'Mossvägen',
    voNummer: null,
    objektUserID: '93701',
    avverkningstyp: 'slutavverkning',
    agare: 'Lars Eriksson',
    areal: 1.2,
    volymSkordare: 246,
    volymSkotare: 246,
    stammar: 423,
    startDatum: '2025-12-10',
    status: 'avslutat',
  },
  {
    id: '6',
    objektNamn: 'Holmsjön Norra',
    voNummer: '11109601',
    objektUserID: '881450',
    avverkningstyp: 'gallring',
    agare: 'Södra',
    areal: 12.4,
    volymSkordare: 0,
    volymSkotare: 0,
    stammar: 0,
    startDatum: '2026-01-17',
    status: 'pagaende',
  }
];

type Flik = 'pagaende' | 'avslutat';
type Filter = 'alla' | 'slutavverkning' | 'gallring';

export default function ObjektLista() {
  const [aktivFlik, setAktivFlik] = useState<Flik>('pagaende');
  const [filter, setFilter] = useState<Filter>('alla');
  const [sok, setSok] = useState('');
  const [valdtObjekt, setValdtObjekt] = useState<Objekt | null>(null);

  // Filtrera och sök
  const filtreradeObjekt = useMemo(() => {
    return objektLista
      .filter(o => o.status === aktivFlik)
      .filter(o => filter === 'alla' || o.avverkningstyp === filter)
      .filter(o => {
        if (!sok.trim()) return true;
        const term = sok.toLowerCase();
        return (
          o.objektNamn.toLowerCase().includes(term) ||
          o.agare.toLowerCase().includes(term) ||
          o.voNummer?.includes(term) ||
          o.objektUserID.includes(term)
        );
      });
  }, [aktivFlik, filter, sok]);

  // Gruppera på typ
  const slutavverkningar = filtreradeObjekt.filter(o => o.avverkningstyp === 'slutavverkning');
  const gallringar = filtreradeObjekt.filter(o => o.avverkningstyp === 'gallring');

  if (valdtObjekt) {
    return <ObjektDetalj objekt={valdtObjekt} onTillbaka={() => setValdtObjekt(null)} />;
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .app {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          background: #f5f5f7;
          color: #1d1d1f;
          min-height: 100vh;
          -webkit-font-smoothing: antialiased;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Header */
        .header {
          background: #fff;
          padding: 24px 20px 0;
        }

        .header h1 {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        /* Sökfält */
        .sok-wrapper {
          padding: 16px 20px 20px;
          background: #fff;
        }

        .sok-falt {
          display: flex;
          align-items: center;
          background: #f5f5f7;
          border-radius: 12px;
          padding: 12px 16px;
          gap: 10px;
        }

        .sok-ikon {
          color: #86868b;
          font-size: 16px;
        }

        .sok-falt input {
          flex: 1;
          border: none;
          background: none;
          font-size: 17px;
          color: #1d1d1f;
          outline: none;
        }

        .sok-falt input::placeholder {
          color: #86868b;
        }

        .rensa-btn {
          background: #86868b;
          border: none;
          color: #fff;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Flikar */
        .flikar {
          display: flex;
          background: #fff;
          padding: 0 20px;
          gap: 28px;
          border-bottom: 1px solid #e5e5e5;
        }

        .flik {
          padding: 14px 0;
          border: none;
          background: none;
          font-size: 15px;
          font-weight: 500;
          color: #86868b;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color 0.2s;
        }

        .flik.aktiv {
          color: #1d1d1f;
          border-bottom-color: #1d1d1f;
        }

        /* Filter */
        .filter-rad {
          display: flex;
          gap: 10px;
          padding: 16px 20px 20px;
          overflow-x: auto;
        }

        .filter-btn {
          padding: 10px 18px;
          border-radius: 20px;
          border: none;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;
          background: #fff;
          color: #1d1d1f;
        }

        .filter-btn.aktiv {
          background: #1d1d1f;
          color: #fff;
        }

        /* Sektioner */
        .sektion {
          padding: 0 20px;
          margin-bottom: 28px;
        }

        .sektion-rubrik {
          font-size: 13px;
          font-weight: 600;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          padding: 8px 0 14px;
        }

        .objekt-lista {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Kort */
        .kort {
          background: #fff;
          border-radius: 16px;
          padding: 20px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .kort:active {
          transform: scale(0.98);
        }

        .kort-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .kort-info {
          flex: 1;
        }

        .kort-namn {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.3px;
          margin-bottom: 4px;
        }

        .kort-meta {
          font-size: 14px;
          color: #86868b;
        }

        .kort-vo {
          margin-left: 8px;
          padding: 2px 8px;
          background: #f0f0f0;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .kort-typ-badge {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          background: #f5f5f7;
          color: #86868b;
        }

        .kort-stats {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .kort-stat {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .kort-stat-varde {
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.5px;
        }

        .kort-stat-label {
          font-size: 15px;
          color: #86868b;
        }

        .kort-kvar {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .kort-kvar-bar {
          width: 100px;
          height: 6px;
          background: #f0f0f0;
          border-radius: 3px;
          overflow: hidden;
        }

        .kort-kvar-fill {
          height: 100%;
          background: #ff9500;
          border-radius: 3px;
        }

        .kort-kvar-text {
          font-size: 13px;
          color: #34c759;
          font-weight: 500;
        }

        .kort-kvar-text.varn {
          color: #ff9500;
        }

        .kort-ej-startad {
          padding: 12px 0 0;
        }

        .kort-ej-startad span {
          font-size: 14px;
          color: #86868b;
          font-weight: 500;
        }

        /* Tom state */
        .tom {
          text-align: center;
          padding: 60px 20px;
          color: #86868b;
        }

        .tom-ikon {
          font-size: 40px;
          margin-bottom: 12px;
          opacity: 0.4;
        }

        .tom p {
          font-size: 15px;
        }
      `}</style>

      <div className="app">
        <header className="header">
          <h1>Objekt</h1>
        </header>

        <div className="sok-wrapper">
          <div className="sok-falt">
            <span className="sok-ikon">⌕</span>
            <input
              type="text"
              placeholder="Sök objekt, ägare eller VO..."
              value={sok}
              onChange={(e) => setSok(e.target.value)}
            />
            {sok && (
              <button className="rensa-btn" onClick={() => setSok('')}>✕</button>
            )}
          </div>
        </div>

        <div className="flikar">
          <button
            className={`flik ${aktivFlik === 'pagaende' ? 'aktiv' : ''}`}
            onClick={() => setAktivFlik('pagaende')}
          >
            Pågående
          </button>
          <button
            className={`flik ${aktivFlik === 'avslutat' ? 'aktiv' : ''}`}
            onClick={() => setAktivFlik('avslutat')}
          >
            Avslutade
          </button>
        </div>

        <div className="filter-rad">
          <button
            className={`filter-btn ${filter === 'alla' ? 'aktiv' : ''}`}
            onClick={() => setFilter('alla')}
          >
            Alla
          </button>
          <button
            className={`filter-btn ${filter === 'slutavverkning' ? 'aktiv' : ''}`}
            onClick={() => setFilter('slutavverkning')}
          >
            Slutavverkning
          </button>
          <button
            className={`filter-btn ${filter === 'gallring' ? 'aktiv' : ''}`}
            onClick={() => setFilter('gallring')}
          >
            Gallring
          </button>
        </div>

        {filtreradeObjekt.length === 0 ? (
          <div className="tom">
            <div className="tom-ikon">○</div>
            <p>Inga objekt hittades</p>
          </div>
        ) : (
          <>
            {filter === 'alla' ? (
              <>
                {slutavverkningar.length > 0 && (
                  <div className="sektion">
                    <div className="sektion-rubrik">Slutavverkning</div>
                    <div className="objekt-lista">
                      {slutavverkningar.map(o => (
                        <ObjektKort key={o.id} objekt={o} onClick={() => setValdtObjekt(o)} />
                      ))}
                    </div>
                  </div>
                )}
                {gallringar.length > 0 && (
                  <div className="sektion">
                    <div className="sektion-rubrik">Gallring</div>
                    <div className="objekt-lista">
                      {gallringar.map(o => (
                        <ObjektKort key={o.id} objekt={o} onClick={() => setValdtObjekt(o)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="sektion">
                <div className="objekt-lista">
                  {filtreradeObjekt.map(o => (
                    <ObjektKort key={o.id} objekt={o} onClick={() => setValdtObjekt(o)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// === KORT-KOMPONENT ===
function ObjektKort({ objekt, onClick }: { objekt: Objekt; onClick: () => void }) {
  const kvarISkogen = objekt.volymSkordare > 0
    ? 100 - Math.round((objekt.volymSkotare / objekt.volymSkordare) * 100)
    : 0;
  const ejStartad = objekt.volymSkordare === 0;

  return (
    <div className="kort" onClick={onClick}>
      <div className="kort-header">
        <div className="kort-info">
          <div className="kort-namn">{objekt.objektNamn}</div>
          <div className="kort-meta">
            {objekt.agare}
            {objekt.voNummer && <span className="kort-vo">VO {objekt.voNummer}</span>}
          </div>
        </div>
        <div className="kort-typ-badge">
          {objekt.avverkningstyp === 'slutavverkning' ? 'SA' : 'G'}
        </div>
      </div>
      
      {ejStartad ? (
        <div className="kort-ej-startad">
          <span>Ej startad</span>
        </div>
      ) : (
        <div className="kort-stats">
          <div className="kort-stat">
            <span className="kort-stat-varde">{objekt.volymSkordare}</span>
            <span className="kort-stat-label">m³</span>
          </div>
          {objekt.status === 'pagaende' && (
            <div className="kort-kvar">
              <div className="kort-kvar-bar">
                <div 
                  className="kort-kvar-fill" 
                  style={{ width: `${kvarISkogen}%` }}
                />
              </div>
              <span className={`kort-kvar-text ${kvarISkogen > 30 ? 'varn' : ''}`}>
                {kvarISkogen}% kvar
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// === DETALJ-KOMPONENT ===
function ObjektDetalj({ objekt, onTillbaka }: { objekt: Objekt; onTillbaka: () => void }) {
  const [aktivVy, setAktivVy] = useState<'oversikt' | 'analys'>('oversikt');
  
  const framkort = objekt.volymSkordare > 0
    ? Math.round((objekt.volymSkotare / objekt.volymSkordare) * 100)
    : 0;

  // Testdata - skulle komma från parsade filer
  const data = {
    g15Skordare: 28.5,
    g15Skotare: 22.3,
    tempoSkordare: objekt.volymSkordare > 0 ? (objekt.volymSkordare / 28.5).toFixed(1) : '0',
    tempoSkotare: objekt.volymSkotare > 0 ? (objekt.volymSkotare / 22.3).toFixed(1) : '0',
    medelstam: 0.29,
    
    // Skördare detaljerad data
    skordare: {
      arbetstid: 36.5,
      g15: 28.5,
      g0: 32.1,
      kortaStopp: 85,
      avbrottsTid: 115,
      rast: 60,
      tomgang: 42,
      stammarPerG15: 22.1,
      m3PerG15: 19.1,
      antalStammar: 631,
      flertradProcent: 34,
      dieselTotalt: 142,
      dieselPerM3: 0.26,
      dieselPerTim: 4.98,
      sortiment: [
        { namn: 'Grantimmer', volym: 186, stammar: 145 },
        { namn: 'Granmassaved', volym: 142, stammar: 198 },
        { namn: 'Talltimmer', volym: 98, stammar: 87 },
        { namn: 'Tallmassaved', volym: 65, stammar: 112 },
        { namn: 'Björkmassaved', volym: 54, stammar: 89 },
      ],
      avbrott: [
        { typ: 'Reparation', tid: 45 },
        { typ: 'Tankning', tid: 25 },
        { typ: 'Planering', tid: 15 },
        { typ: 'Flytt', tid: 30 },
      ]
    },
    
    // Skotare detaljerad data
    skotare: {
      arbetstid: 28.5,
      g15: 22.3,
      g0: 25.8,
      kortaStopp: 42,
      avbrottsTid: 95,
      rast: 45,
      tomgang: 38,
      antalLass: 48,
      medelLass: 9.0,
      lassPerG15: 2.15,
      m3PerG15: 19.4,
      korAvstand: 645,
      lastrede: 'breddat',
      dieselTotalt: 98,
      dieselPerM3: 0.23,
      dieselPerG15: 4.39,
      avbrott: [
        { typ: 'Reparation', tid: 25 },
        { typ: 'Tankning', tid: 20 },
        { typ: 'Väntan på skördare', tid: 35 },
        { typ: 'Flytt', tid: 15 },
      ]
    }
  };

  return (
    <>
      <style jsx global>{`
        .detalj {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          background: #f5f5f7;
          color: #1d1d1f;
          min-height: 100vh;
          max-width: 600px;
          margin: 0 auto;
          padding-bottom: 40px;
        }

        .detalj-header {
          background: #fff;
          padding: 16px 20px 20px;
        }

        .tillbaka {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: #007aff;
          font-size: 17px;
          cursor: pointer;
          padding: 0;
          margin-bottom: 20px;
        }

        .detalj-titel {
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }

        .detalj-meta {
          font-size: 15px;
          color: #86868b;
          margin-bottom: 0;
        }

        .detalj-typ {
          display: inline-block;
          margin-left: 10px;
          padding: 4px 12px;
          border-radius: 14px;
          font-size: 13px;
          font-weight: 500;
        }

        .typ-slut { background: #fff3e0; color: #e65100; }
        .typ-gall { background: #e8f5e9; color: #2e7d32; }

        /* Vy-flikar */
        .vy-flikar {
          display: flex;
          gap: 0;
          background: #fff;
          padding: 0 20px;
          border-bottom: 1px solid #e5e5e5;
        }

        .vy-flik {
          padding: 14px 0;
          margin-right: 28px;
          border: none;
          background: none;
          font-size: 15px;
          font-weight: 500;
          color: #86868b;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color 0.2s;
        }

        .vy-flik.aktiv {
          color: #1d1d1f;
          border-bottom-color: #1d1d1f;
        }

        /* Content */
        .vy-content {
          padding: 20px;
        }

        /* Nyckeltal-grid */
        .nyckeltal {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }

        .nyckeltal.tre {
          grid-template-columns: 1fr 1fr 1fr;
        }

        .nyckeltal.fyra {
          grid-template-columns: 1fr 1fr;
          row-gap: 12px;
        }

        .nyckeltal-kort {
          background: #fff;
          border-radius: 14px;
          padding: 20px;
          text-align: center;
        }

        .nyckeltal-kort label {
          display: block;
          font-size: 12px;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .nyckeltal-kort .varde {
          font-size: 32px;
          font-weight: 600;
          letter-spacing: -0.5px;
        }

        .nyckeltal-kort .enhet {
          font-size: 15px;
          color: #86868b;
          font-weight: 400;
        }

        /* Progress */
        .progress-kort {
          background: #fff;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 16px;
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .progress-header label {
          font-size: 15px;
          font-weight: 500;
        }

        .progress-header span {
          font-size: 17px;
          font-weight: 600;
        }

        .progress-header .kvar-ok {
          color: #34c759;
        }

        .progress-header .kvar-varn {
          color: #ff9500;
        }

        .progress-track {
          height: 10px;
          background: #f0f0f0;
          border-radius: 5px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: #34c759;
          border-radius: 5px;
        }

        .progress-fill.kvar {
          background: #ff9500;
        }

        /* Maskin-sektion */
        .maskin-sektion {
          background: #fff;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 12px;
        }

        .maskin-header {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .maskin-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .dot-blue { background: #007aff; }
        .dot-green { background: #34c759; }

        .maskin-stats {
          display: flex;
          justify-content: space-between;
        }

        .maskin-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .maskin-stat label {
          display: block;
          font-size: 12px;
          color: #86868b;
          margin-bottom: 6px;
        }

        .maskin-stat span {
          font-size: 20px;
          font-weight: 600;
        }

        .maskin-stat .sub {
          font-size: 14px;
          color: #86868b;
          font-weight: 400;
        }

        /* Diesel fritt bilväg */
        .diesel-kort {
          background: #fff;
          border-radius: 14px;
          padding: 20px;
          margin-top: 4px;
        }

        .diesel-header {
          text-align: center;
          margin-bottom: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f0f0f0;
        }

        .diesel-titel {
          display: block;
          font-size: 12px;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .diesel-total {
          font-size: 34px;
          font-weight: 600;
          letter-spacing: -0.5px;
        }

        .diesel-total .enhet {
          font-size: 16px;
          color: #86868b;
          font-weight: 400;
        }

        .diesel-detalj {
          display: flex;
          justify-content: center;
          gap: 24px;
          font-size: 14px;
          color: #86868b;
        }

        .diesel-detalj span {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .diesel-detalj span::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .diesel-detalj span:first-child::before {
          background: #007aff;
        }

        .diesel-detalj span:last-child::before {
          background: #34c759;
        }

        /* Graf */
        .graf-kort {
          background: #fff;
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .graf-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .graf-header h3 {
          font-size: 15px;
          font-weight: 600;
        }

        .graf-legend {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #86868b;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .graf-staplar {
          display: flex;
          gap: 12px;
          height: 100px;
          align-items: flex-end;
        }

        .stapel-grupp {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .stapel-stack {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stapel {
          width: 100%;
          border-radius: 3px;
          min-height: 2px;
        }

        .stapel-blue { background: #007aff; }
        .stapel-green { background: #34c759; }

        .stapel-label {
          font-size: 11px;
          color: #86868b;
        }

        /* Analys-sektion */
        .analys-rubrik {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 20px;
          font-weight: 600;
          margin: 32px 0 16px;
          padding-top: 8px;
        }

        .analys-rubrik:first-of-type {
          margin-top: 16px;
        }

        .analys-kort {
          background: #fff;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 12px;
        }

        .analys-kort h4 {
          font-size: 11px;
          font-weight: 600;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 16px;
        }

        .analys-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px 16px;
        }

        .analys-grid.fyra {
          grid-template-columns: repeat(4, 1fr);
        }

        .analys-grid.sex {
          grid-template-columns: repeat(3, 1fr);
          row-gap: 20px;
        }

        .analys-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .analys-item label {
          font-size: 12px;
          color: #86868b;
          font-weight: 500;
        }

        .analys-item span {
          font-size: 18px;
          font-weight: 600;
          letter-spacing: -0.3px;
        }

        .analys-item .sub {
          font-size: 14px;
          font-weight: 400;
          color: #86868b;
        }

        /* Tid-sektion layout */
        .tid-grid {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .tid-rad {
          display: flex;
          justify-content: space-between;
        }

        .tid-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .tid-varde {
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.5px;
        }

        .tid-label {
          font-size: 13px;
          color: #86868b;
          margin-top: 4px;
        }

        .tid-separator {
          height: 1px;
          background: #f0f0f0;
          margin: 20px 0;
        }

        .tid-rad.sekundar {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .tid-item-mini {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .tid-mini-label {
          font-size: 11px;
          color: #86868b;
          margin-bottom: 4px;
        }

        .tid-mini-varde {
          font-size: 14px;
          font-weight: 600;
        }

        .sortiment-lista {
          display: flex;
          flex-direction: column;
        }

        .sagbart-sammanfattning {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f0f0f0;
        }

        .sagbart-procent {
          font-size: 34px;
          font-weight: 600;
          color: #007aff;
          letter-spacing: -0.5px;
        }

        .sagbart-label {
          font-size: 16px;
          color: #86868b;
        }

        .produktiv-sammanfattning {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f0f0f0;
        }

        .produktiv-procent {
          font-size: 34px;
          font-weight: 600;
          color: #34c759;
          letter-spacing: -0.5px;
        }

        .produktiv-label {
          font-size: 16px;
          color: #86868b;
        }

        .flertrad-sammanfattning {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f0f0f0;
        }

        .flertrad-procent {
          font-size: 34px;
          font-weight: 600;
          color: #5856d6;
          letter-spacing: -0.5px;
        }

        .flertrad-label {
          font-size: 16px;
          color: #86868b;
        }

        .sortiment-rad {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f5f5f5;
        }

        .sortiment-rad:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .sortiment-rad:first-child {
          padding-top: 0;
        }

        .sortiment-namn {
          flex: 1;
          font-size: 15px;
          font-weight: 500;
        }

        .sortiment-volym {
          font-size: 15px;
          font-weight: 600;
          min-width: 70px;
          text-align: right;
        }

        .sortiment-antal {
          font-size: 14px;
          color: #86868b;
          min-width: 55px;
          text-align: right;
        }

        .avbrott-lista {
          display: flex;
          flex-direction: column;
        }

        .avbrott-rad {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f5f5f5;
        }

        .avbrott-rad:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .avbrott-rad:first-child {
          padding-top: 0;
        }

        .avbrott-typ {
          font-size: 15px;
          font-weight: 500;
        }

        .avbrott-tid {
          font-size: 15px;
          font-weight: 600;
          color: #ff9500;
        }

        .lastrede-badge-container {
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f0f0f0;
        }

        .lastrede-badge {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
        }

        .lastrede-badge.breddat {
          background: #e8f5e9;
          color: #2e7d32;
        }

        .lastrede-badge.smalt {
          background: #fff3e0;
          color: #e65100;
        }

        .tidsbalans {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .tidsbalans-bar {
          display: flex;
          height: 40px;
          border-radius: 10px;
          overflow: hidden;
        }

        .tidsbalans-skordare {
          background: #007aff;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }

        .tidsbalans-skotare {
          background: #34c759;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }

        .tidsbalans-legend {
          display: flex;
          justify-content: center;
          gap: 24px;
          font-size: 13px;
          color: #86868b;
        }

        .dot-blue-inline,
        .dot-green-inline {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 6px;
        }

        .dot-blue-inline { background: #007aff; }
        .dot-green-inline { background: #34c759; }

        .tidsbalans-diff {
          text-align: center;
          font-size: 15px;
          font-weight: 500;
          padding-top: 4px;
        }

        .diff-warn { color: #ff9500; }
        .diff-ok { color: #34c759; }
        .diff-neutral { color: #86868b; }

        /* ID-rad */
        .id-rad {
          display: flex;
          gap: 32px;
          padding: 16px 20px;
          margin-bottom: 8px;
          background: #fff;
          border-radius: 14px;
        }

        .id-item label {
          display: block;
          font-size: 11px;
          color: #86868b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .id-item span {
          font-size: 16px;
          font-weight: 500;
          font-family: 'SF Mono', Monaco, monospace;
        }
      `}</style>

      <div className="detalj">
        <header className="detalj-header">
          <button className="tillbaka" onClick={onTillbaka}>
            ‹ Objekt
          </button>
          <div className="detalj-titel">{objekt.objektNamn}</div>
          <div className="detalj-meta">
            {objekt.agare} · {objekt.areal} ha
            <span className={`detalj-typ ${objekt.avverkningstyp === 'slutavverkning' ? 'typ-slut' : 'typ-gall'}`}>
              {objekt.avverkningstyp}
            </span>
          </div>
        </header>

        <div className="vy-flikar">
          <button
            className={`vy-flik ${aktivVy === 'oversikt' ? 'aktiv' : ''}`}
            onClick={() => setAktivVy('oversikt')}
          >
            Översikt
          </button>
          <button
            className={`vy-flik ${aktivVy === 'analys' ? 'aktiv' : ''}`}
            onClick={() => setAktivVy('analys')}
          >
            Analys
          </button>
        </div>

        {aktivVy === 'oversikt' ? (
          <div className="vy-content">
            {/* Nyckeltal */}
            <div className="nyckeltal fyra">
              <div className="nyckeltal-kort">
                <label>Skördat</label>
                <div className="varde">{objekt.volymSkordare}<span className="enhet"> m³</span></div>
              </div>
              <div className="nyckeltal-kort">
                <label>Skotat</label>
                <div className="varde">{objekt.volymSkotare}<span className="enhet"> m³</span></div>
              </div>
              <div className="nyckeltal-kort">
                <label>Medelstam</label>
                <div className="varde">{data.medelstam}<span className="enhet"> m³fub</span></div>
              </div>
              <div className="nyckeltal-kort">
                <label>Volym/ha</label>
                <div className="varde">{(objekt.volymSkordare / objekt.areal).toFixed(0)}<span className="enhet"> m³</span></div>
              </div>
            </div>

            {/* Kvar i skogen */}
            <div className="progress-kort">
              <div className="progress-header">
                <label>Kvar i skogen</label>
                <span className={100 - framkort > 30 ? 'kvar-varn' : 'kvar-ok'}>{100 - framkort}%</span>
              </div>
              <div className="progress-track kvar">
                <div className="progress-fill kvar" style={{ width: `${100 - framkort}%` }} />
              </div>
            </div>

            {/* Skördare */}
            <div className="maskin-sektion">
              <div className="maskin-header">
                <div className="maskin-dot dot-blue" />
                Skördare
              </div>
              <div className="maskin-stats">
                <div className="maskin-stat">
                  <label>Volym</label>
                  <span>{objekt.volymSkordare} <span className="sub">m³</span></span>
                </div>
                <div className="maskin-stat">
                  <label>G15-tid</label>
                  <span>{data.g15Skordare} <span className="sub">tim</span></span>
                </div>
                <div className="maskin-stat">
                  <label>m³/G15</label>
                  <span>{data.tempoSkordare}</span>
                </div>
              </div>
            </div>

            {/* Skotare */}
            <div className="maskin-sektion">
              <div className="maskin-header">
                <div className="maskin-dot dot-green" />
                Skotare
              </div>
              <div className="maskin-stats">
                <div className="maskin-stat">
                  <label>Volym</label>
                  <span>{objekt.volymSkotare} <span className="sub">m³</span></span>
                </div>
                <div className="maskin-stat">
                  <label>G15-tid</label>
                  <span>{data.g15Skotare} <span className="sub">tim</span></span>
                </div>
                <div className="maskin-stat">
                  <label>m³/G15</label>
                  <span>{data.tempoSkotare}</span>
                </div>
              </div>
            </div>

            {/* Fritt bilväg - diesel totalt */}
            <div className="diesel-kort">
              <div className="diesel-header">
                <span className="diesel-titel">Diesel fritt bilväg</span>
                <div className="diesel-total">
                  {(data.skordare.dieselPerM3 + data.skotare.dieselPerM3).toFixed(2)}
                  <span className="enhet"> L/m³fub</span>
                </div>
              </div>
              <div className="diesel-detalj">
                <span>Skördare {data.skordare.dieselPerM3} L</span>
                <span>Skotare {data.skotare.dieselPerM3} L</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="vy-content">
            {/* Tidsjämförelse */}
            <div className="analys-kort">
              <h4>Tidsbalans</h4>
              <div className="tidsbalans">
                <div className="tidsbalans-bar">
                  <div 
                    className="tidsbalans-skordare" 
                    style={{ width: `${(data.skordare.g15 / (data.skordare.g15 + data.skotare.g15)) * 100}%` }}
                  >
                    <span>{data.skordare.g15}h</span>
                  </div>
                  <div 
                    className="tidsbalans-skotare"
                    style={{ width: `${(data.skotare.g15 / (data.skordare.g15 + data.skotare.g15)) * 100}%` }}
                  >
                    <span>{data.skotare.g15}h</span>
                  </div>
                </div>
                <div className="tidsbalans-legend">
                  <span><span className="dot-blue-inline"></span> Skördare</span>
                  <span><span className="dot-green-inline"></span> Skotare</span>
                </div>
                <div className="tidsbalans-diff">
                  {data.skotare.g15 > data.skordare.g15 ? (
                    <span className="diff-warn">Skotare +{Math.round(((data.skotare.g15 / data.skordare.g15) - 1) * 100)}% längre tid</span>
                  ) : data.skotare.g15 < data.skordare.g15 ? (
                    <span className="diff-ok">Skotare {Math.round((1 - (data.skotare.g15 / data.skordare.g15)) * 100)}% snabbare</span>
                  ) : (
                    <span className="diff-neutral">Samma tid</span>
                  )}
                </div>
              </div>
            </div>

            {/* ID-info */}
            <div className="id-rad">
              <div className="id-item">
                <label>VO-nummer</label>
                <span>{objekt.voNummer || '—'}</span>
              </div>
              <div className="id-item">
                <label>Objekt-ID</label>
                <span>{objekt.objektUserID}</span>
              </div>
            </div>

            {/* SKÖRDARE SEKTION */}
            <div className="analys-rubrik">
              <div className="maskin-dot dot-blue" />
              Skördare
            </div>

            {/* Tid */}
            <div className="analys-kort">
              <h4>Tid</h4>
              <div className="produktiv-sammanfattning">
                <div className="produktiv-procent">
                  {Math.round((data.skordare.g15 / data.skordare.arbetstid) * 100)}%
                </div>
                <div className="produktiv-label">produktiv tid</div>
              </div>
              <div className="tid-grid">
                <div className="tid-rad">
                  <div className="tid-item">
                    <span className="tid-varde">{data.skordare.arbetstid}</span>
                    <span className="tid-label">Arbetstid</span>
                  </div>
                  <div className="tid-item">
                    <span className="tid-varde">{data.skordare.g15}</span>
                    <span className="tid-label">G15</span>
                  </div>
                  <div className="tid-item">
                    <span className="tid-varde">{data.skordare.g0}</span>
                    <span className="tid-label">G0</span>
                  </div>
                </div>
                <div className="tid-separator"></div>
                <div className="tid-rad sekundar">
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Korta stopp</span>
                    <span className="tid-mini-varde">{data.skordare.kortaStopp} min</span>
                  </div>
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Avbrott</span>
                    <span className="tid-mini-varde">{data.skordare.avbrottsTid} min</span>
                  </div>
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Rast</span>
                    <span className="tid-mini-varde">{data.skordare.rast} min</span>
                  </div>
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Tomgång</span>
                    <span className="tid-mini-varde">{data.skordare.tomgang} min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Produktion */}
            <div className="analys-kort">
              <h4>Produktion</h4>
              <div className="flertrad-sammanfattning">
                <div className="flertrad-procent">
                  {data.skordare.flertradProcent}%
                </div>
                <div className="flertrad-label">flerträd</div>
              </div>
              <div className="analys-grid">
                <div className="analys-item">
                  <label>Stammar/G15</label>
                  <span>{data.skordare.stammarPerG15}</span>
                </div>
                <div className="analys-item">
                  <label>m³/G15</label>
                  <span>{data.skordare.m3PerG15}</span>
                </div>
                <div className="analys-item">
                  <label>Antal stammar</label>
                  <span>{data.skordare.antalStammar}</span>
                </div>
              </div>
            </div>

            {/* Diesel */}
            <div className="analys-kort">
              <h4>Diesel</h4>
              <div className="analys-grid">
                <div className="analys-item">
                  <label>Totalt</label>
                  <span>{data.skordare.dieselTotalt} <span className="sub">L</span></span>
                </div>
                <div className="analys-item">
                  <label>Per m³fub</label>
                  <span>{data.skordare.dieselPerM3} <span className="sub">L</span></span>
                </div>
                <div className="analys-item">
                  <label>Per timme</label>
                  <span>{data.skordare.dieselPerTim} <span className="sub">L</span></span>
                </div>
              </div>
            </div>

            {/* Sortiment */}
            <div className="analys-kort">
              <h4>Sortiment</h4>
              <div className="sagbart-sammanfattning">
                <div className="sagbart-procent">
                  {Math.round((data.skordare.sortiment
                    .filter(s => s.namn.toLowerCase().includes('timmer'))
                    .reduce((sum, s) => sum + s.volym, 0) / 
                    data.skordare.sortiment.reduce((sum, s) => sum + s.volym, 0)) * 100)}%
                </div>
                <div className="sagbart-label">sågbart</div>
              </div>
              <div className="sortiment-lista">
                {data.skordare.sortiment.map((s, i) => (
                  <div key={i} className="sortiment-rad">
                    <span className="sortiment-namn">{s.namn}</span>
                    <span className="sortiment-volym">{s.volym} m³</span>
                    <span className="sortiment-antal">{s.stammar} st</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Avbrott */}
            <div className="analys-kort">
              <h4>Avbrott & stillestånd</h4>
              <div className="avbrott-lista">
                {data.skordare.avbrott.map((a, i) => (
                  <div key={i} className="avbrott-rad">
                    <span className="avbrott-typ">{a.typ}</span>
                    <span className="avbrott-tid">{a.tid} min</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SKOTARE SEKTION */}
            <div className="analys-rubrik" style={{ marginTop: '24px' }}>
              <div className="maskin-dot dot-green" />
              Skotare
            </div>

            {/* Tid */}
            <div className="analys-kort">
              <h4>Tid</h4>
              <div className="produktiv-sammanfattning">
                <div className="produktiv-procent">
                  {Math.round((data.skotare.g15 / data.skotare.arbetstid) * 100)}%
                </div>
                <div className="produktiv-label">produktiv tid</div>
              </div>
              <div className="tid-grid">
                <div className="tid-rad">
                  <div className="tid-item">
                    <span className="tid-varde">{data.skotare.arbetstid}</span>
                    <span className="tid-label">Arbetstid</span>
                  </div>
                  <div className="tid-item">
                    <span className="tid-varde">{data.skotare.g15}</span>
                    <span className="tid-label">G15</span>
                  </div>
                  <div className="tid-item">
                    <span className="tid-varde">{data.skotare.g0}</span>
                    <span className="tid-label">G0</span>
                  </div>
                </div>
                <div className="tid-separator"></div>
                <div className="tid-rad sekundar">
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Korta stopp</span>
                    <span className="tid-mini-varde">{data.skotare.kortaStopp} min</span>
                  </div>
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Avbrott</span>
                    <span className="tid-mini-varde">{data.skotare.avbrottsTid} min</span>
                  </div>
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Rast</span>
                    <span className="tid-mini-varde">{data.skotare.rast} min</span>
                  </div>
                  <div className="tid-item-mini">
                    <span className="tid-mini-label">Tomgång</span>
                    <span className="tid-mini-varde">{data.skotare.tomgang} min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Produktion */}
            <div className="analys-kort">
              <h4>Produktion</h4>
              <div className="lastrede-badge-container">
                <span className={`lastrede-badge ${data.skotare.lastrede === 'breddat' ? 'breddat' : 'smalt'}`}>
                  {data.skotare.lastrede === 'breddat' ? 'Breddat lastredd' : 'Smalt lastredd'}
                </span>
              </div>
              <div className="analys-grid sex">
                <div className="analys-item">
                  <label>Antal lass</label>
                  <span>{data.skotare.antalLass}</span>
                </div>
                <div className="analys-item">
                  <label>Snitt lass</label>
                  <span>{data.skotare.medelLass} <span className="sub">m³</span></span>
                </div>
                <div className="analys-item">
                  <label>Lass/G15</label>
                  <span>{data.skotare.lassPerG15}</span>
                </div>
                <div className="analys-item">
                  <label>m³/G15</label>
                  <span>{data.skotare.m3PerG15}</span>
                </div>
                <div className="analys-item">
                  <label>Skotningsavstånd</label>
                  <span>{data.skotare.korAvstand} <span className="sub">m</span></span>
                </div>
              </div>
            </div>

            {/* Diesel */}
            <div className="analys-kort">
              <h4>Diesel</h4>
              <div className="analys-grid">
                <div className="analys-item">
                  <label>Totalt</label>
                  <span>{data.skotare.dieselTotalt} <span className="sub">L</span></span>
                </div>
                <div className="analys-item">
                  <label>Per m³fub</label>
                  <span>{data.skotare.dieselPerM3} <span className="sub">L</span></span>
                </div>
                <div className="analys-item">
                  <label>Per G15</label>
                  <span>{data.skotare.dieselPerG15} <span className="sub">L</span></span>
                </div>
              </div>
            </div>

            {/* Avbrott */}
            <div className="analys-kort">
              <h4>Avbrott & stillestånd</h4>
              <div className="avbrott-lista">
                {data.skotare.avbrott.map((a, i) => (
                  <div key={i} className="avbrott-rad">
                    <span className="avbrott-typ">{a.typ}</span>
                    <span className="avbrott-tid">{a.tid} min</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
