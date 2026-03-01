"use client";
import React, { useState, useEffect } from 'react';

// Animationer
const pulseKeyframes = `
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0.4); }
    70% { box-shadow: 0 0 0 12px rgba(0, 122, 255, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 122, 255, 0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes checkPop {
    0% { transform: scale(0); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulseGreen {
    0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); }
    70% { box-shadow: 0 0 0 10px rgba(52, 199, 89, 0); }
    100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
  }
`;

const TimePicker = ({ value, onChange, label }) => {
  const [timme, minut] = value.split(':').map(Number);
  const ändraTimme = (d) => onChange(`${String((timme + d + 24) % 24).padStart(2, '0')}:${String(minut).padStart(2, '0')}`);
  const ändraMinut = (d) => onChange(`${String(timme).padStart(2, '0')}:${String((minut + d + 60) % 60).padStart(2, '0')}`);
  const btn = { 
    width: 52, height: 44, 
    background: 'linear-gradient(180deg, #fff 0%, #f5f5f7 100%)',
    border: 'none', borderRadius: 12, fontSize: 18, cursor: 'pointer', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    color: '#1d1d1f'
  };
  const box = { 
    width: 64, height: 56, 
    background: '#fff', 
    borderRadius: 14, fontSize: 32, fontWeight: 600, 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    color: '#1d1d1f'
  };
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#86868b', textAlign: 'center', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</p>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button style={btn} onClick={() => ändraTimme(1)}>▲</button>
          <div style={box}>{String(timme).padStart(2, '0')}</div>
          <button style={btn} onClick={() => ändraTimme(-1)}>▼</button>
        </div>
        <span style={{ fontSize: 32, fontWeight: 300, color: '#86868b' }}>:</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button style={btn} onClick={() => ändraMinut(1)}>▲</button>
          <div style={box}>{String(minut).padStart(2, '0')}</div>
          <button style={btn} onClick={() => ändraMinut(-1)}>▼</button>
        </div>
      </div>
    </div>
  );
};

const KmPicker = ({ value, onChange, label }) => {
  const h = Math.floor(value / 100), t = Math.floor((value % 100) / 10), e = value % 10;
  const btn = { 
    width: 48, height: 44, 
    background: 'linear-gradient(180deg, #fff 0%, #f5f5f7 100%)',
    border: 'none', borderRadius: 12, fontSize: 18, cursor: 'pointer', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    color: '#1d1d1f'
  };
  const box = { 
    width: 52, height: 56, 
    background: '#fff', 
    borderRadius: 14, fontSize: 30, fontWeight: 600, 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    color: '#1d1d1f'
  };
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#86868b', textAlign: 'center', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</p>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        {[{ v: h, add: 100 }, { v: t, add: 10 }, { v: e, add: 1 }].map((col, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button style={btn} onClick={() => onChange(Math.min(999, value + col.add))}>▲</button>
            <div style={box}>{col.v}</div>
            <button style={btn} onClick={() => onChange(Math.max(0, value - col.add))}>▼</button>
          </div>
        ))}
        <span style={{ fontSize: 17, color: '#86868b', marginLeft: 10, fontWeight: 600 }}>km</span>
      </div>
    </div>
  );
};

const MinPicker = ({ value, onChange, label }) => {
  const h = Math.floor(value / 60), m = value % 60;
  const btn = { 
    width: 52, height: 44, 
    background: 'linear-gradient(180deg, #fff 0%, #f5f5f7 100%)',
    border: 'none', borderRadius: 12, fontSize: 18, cursor: 'pointer', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    color: '#1d1d1f'
  };
  const box = { 
    width: 64, height: 56, 
    background: '#fff', 
    borderRadius: 14, fontSize: 32, fontWeight: 600, 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    color: '#1d1d1f'
  };
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: '#86868b', textAlign: 'center', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</p>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button style={btn} onClick={() => onChange(Math.min(480, (h + 1) * 60 + m))}>▲</button>
          <div style={box}>{h}</div>
          <button style={btn} onClick={() => onChange(Math.max(0, (h - 1) * 60 + m))}>▼</button>
        </div>
        <span style={{ fontSize: 15, color: '#86868b', fontWeight: 600 }}>tim</span>
        <span style={{ fontSize: 32, fontWeight: 300, color: '#86868b' }}>:</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button style={btn} onClick={() => onChange(h * 60 + (m + 1) % 60)}>▲</button>
          <div style={box}>{String(m).padStart(2, '0')}</div>
          <button style={btn} onClick={() => onChange(h * 60 + (m - 1 + 60) % 60)}>▼</button>
        </div>
        <span style={{ fontSize: 15, color: '#86868b', fontWeight: 600 }}>min</span>
      </div>
    </div>
  );
};

// Bakåtknapp komponent
const BackBtn = ({ onClick, dark }) => (
  <button onClick={onClick} style={{ 
    width: 44, height: 44, 
    background: dark ? 'rgba(255,255,255,0.1)' : '#f5f5f7', 
    border: 'none', borderRadius: 14, cursor: 'pointer', 
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: dark ? 'none' : '0 2px 8px rgba(0,0,0,0.06)'
  }}>
    <svg width="10" height="18" viewBox="0 0 10 18" fill="none">
      <path d="M9 1L1 9L9 17" stroke={dark ? '#fff' : '#1d1d1f'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </button>
);

export default function ArbetsrapportPage() {
  const [steg, setSteg] = useState('morgon');
  const [gps, setGps] = useState(false);
  const [kmMorgon, setKmMorgon] = useState(null);
  const [kmKväll, setKmKväll] = useState(null);
  const [extra, setExtra] = useState([]);
  const [start, setStart] = useState('06:12');
  const [slut, setSlut] = useState('16:45');
  const [ändring, setÄndring] = useState(null);
  const [tStart, setTStart] = useState('06:12');
  const [tSlut, setTSlut] = useState('16:45');
  const [tMKm, setTMKm] = useState(72);
  const [tKKm, setTKKm] = useState(75);
  const [tRast, setTRast] = useState(30);
  const [anledn, setAnledn] = useState('');
  const [sista, setSista] = useState(false);
  const [betald, setBetald] = useState(0);
  const [tExMin, setTExMin] = useState(30);
  const [tExBesk, setTExBesk] = useState('');
  const [tExDeb, setTExDeb] = useState(false);
  const [tExObj, setTExObj] = useState(null);
  
  // Tider för smart extra tid-beräkning
  const [gpsHem, setGpsHem] = useState(null); // När lämnade hemmet
  const [momIn, setMomIn] = useState(null); // MOM inloggning
  const [momUt, setMomUt] = useState(null); // MOM utloggning
  const [gpsHemKväll, setGpsHemKväll] = useState(null); // När kom hem
  const normalRestid = 45; // Minuter (skulle kunna beräknas från GPS-historik)
  const EXTRA_TID_TRÖSKEL = 15; // Min avvikelse innan vi frågar (kan sänkas när vi har mer data)
  
  // Extra tid morgon/kväll
  const [extraMorgon, setExtraMorgon] = useState(null); // { minuter, hanterad }
  const [extraKväll, setExtraKväll] = useState(null);
  
  // Frånvaro/manuell dag
  const [dagTyp, setDagTyp] = useState('normal'); // normal, sjuk, vab, service, annat, utbildning
  const [manuellStart, setManuellStart] = useState('07:00');
  const [manuellSlut, setManuellSlut] = useState('16:00');
  const [manuellBesk, setManuellBesk] = useState('');
  const [manuellRast, setManuellRast] = useState(30);
  const [rast, setRast] = useState(30); // Rast i minuter (från MOM-fil eller manuell)
  const [traktamente, setTraktamente] = useState(null); // { summa: 300 }
  
  // Historik (senaste 7 dagarna) - demo-data
  const [historik] = useState([
    { datum: 'Tor 16 jan', arbMin: 555, km: 144, extra: 0, traktamente: null, status: 'ok' },
    { datum: 'Ons 15 jan', arbMin: 602, km: 138, extra: 45, traktamente: null, status: 'ok' },
    { datum: 'Tis 14 jan', arbMin: 510, km: 156, extra: 0, traktamente: null, status: 'saknas' },
    { datum: 'Mån 13 jan', arbMin: 480, km: 144, extra: 0, traktamente: null, status: 'ok' },
    { datum: 'Fre 10 jan', arbMin: 540, km: 150, extra: 30, traktamente: { summa: 300 }, status: 'ok' },
  ]);
  const [redigeraDag, setRedigeraDag] = useState(null);
  
  // Temporära states för inställningar
  const [tempAdress, setTempAdress] = useState('');
  const [tempMaskin, setTempMaskin] = useState('Ponsse Scorpion');
  const [tempKmGräns, setTempKmGräns] = useState(60);
  const [tempKmErsättning, setTempKmErsättning] = useState(2.90);
  const [sökerPosition, setSökerPosition] = useState(false);
  
  // Dynamiskt datum
  const idag = new Date();
  const dagNamn = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][idag.getDay()];
  const månader = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const datumStr = `${idag.getDate()} ${månader[idag.getMonth()]}`;
  
  // Användare (kommer från Supabase auth senare)
  const [användare, setAnvändare] = useState({
    namn: 'Stefan',
    email: 'stefan@kompersmalaskog.se',
    hemadress: '',
    hemLat: null,
    hemLng: null,
    maskin: 'Ponsse Scorpion',
    roll: 'förare'
  });
  
  // Företagsinställningar (GS-avtalet)
  const [företag, setFöretag] = useState({
    körersättningEfter: 60,    // km enkel väg innan ersättning
    körersättningPerKm: 2.90,  // kr/km (2025 års avtal)
    traktamente: 300,          // kr/dag skattefritt
    avtalÅr: 2025
  });

  const obj = [{ id: 1, namn: "Karatorp RP 2025", ägare: "Lindströms Gård AB" }, { id: 2, namn: "Bäckadalen 1:4", ägare: "Sveaskog" }, { id: 3, namn: "Norra Skogen 2:1", ägare: "Holmen" }];

  // Simulera GPS-loggning vid start
  useEffect(() => { 
    if (gps) { 
      const t = setTimeout(() => { 
        setKmMorgon({ km: 72 }); 
        setGpsHem('06:00'); // Lämnade hemmet
        setGps(false); 
      }, 1500); 
      return () => clearTimeout(t); 
    } 
  }, [gps]);
  
  // Starta GPS automatiskt på morgonen
  useEffect(() => {
    if (steg === 'morgon' && !gps && !kmMorgon) {
      const t = setTimeout(() => setGps(true), 500);
      return () => clearTimeout(t);
    }
  }, [steg]);

  const tim = (a, b) => { const [sh, sm] = a.split(':').map(Number); const [eh, em] = b.split(':').map(Number); return Math.max(0, (eh * 60 + em - sh * 60 - sm)); };
  const fmtTid = (minuter) => {
    const h = Math.floor(minuter / 60), m = minuter % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} tim`;
    return `${h} tim ${m} min`;
  };
  
  // Beräkna saknad tid
  const beräknaSaknadMorgon = () => {
    if (!gpsHem || !momIn) return 0;
    const faktisk = tim(gpsHem, momIn);
    return Math.max(0, faktisk - normalRestid);
  };
  
  const beräknaSaknadKväll = () => {
    if (!momUt || !gpsHemKväll) return 0;
    const faktisk = tim(momUt, gpsHemKväll);
    return Math.max(0, faktisk - normalRestid);
  };

  const d = { namn: användare.namn, datum: datumStr, dag: dagNamn, ska: 176, har: 184 };
  const arbMinBrutto = tim(start, slut);
  const arbMin = Math.max(0, arbMinBrutto - rast); // Arbetstid minus rast
  const totKm = (kmMorgon?.km || 0) + (kmKväll?.km || 0);
  const ers = Math.max(0, totKm - (företag.körersättningEfter * 2)); // Gräns är enkel väg, *2 för tur och retur
  const öt = Math.max(0, d.har - d.ska);
  const totEx = extra.reduce((a, e) => a + e.minuter, 0);
  const totaltMin = arbMin + totEx;

  const s = {
    c: { minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif', color: '#1d1d1f', display: 'flex', flexDirection: 'column', padding: '0 20px' },
    t: { paddingTop: 60, paddingBottom: 16 },
    m: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' },
    b: { paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 12 },
    p: { width: '100%', padding: '18px 24px', background: 'linear-gradient(180deg, #2d2d2d 0%, #1d1d1f 100%)', color: '#fff', border: 'none', borderRadius: 16, fontSize: 17, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', letterSpacing: '0.3px' },
    g: { width: '100%', padding: '18px 24px', background: 'linear-gradient(180deg, #34d058 0%, #22c55e 100%)', color: '#fff', border: 'none', borderRadius: 16, fontSize: 17, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(34,197,94,0.35)', letterSpacing: '0.3px' },
    x: { width: '100%', padding: '18px 24px', background: '#fff', color: '#1d1d1f', border: 'none', borderRadius: 16, fontSize: 17, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.08)', letterSpacing: '0.3px' },
    r: { width: '100%', padding: '18px 24px', background: '#fff', color: '#ff3b30', border: '2px solid #ff3b30', borderRadius: 16, fontSize: 17, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.3px' },
    i: { width: '100%', padding: '16px 18px', fontSize: 17, border: 'none', borderRadius: 14, boxSizing: 'border-box', outline: 'none', background: '#fff', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)' },
    k: { background: '#fff', borderRadius: 20, padding: 20, marginBottom: 12, cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.04)' },
  };

  // MORGON
  if (steg === 'morgon') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}>
        <p 
          onClick={() => setSteg('datumMeny')} 
          style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600, letterSpacing: '0.5px', cursor: 'pointer' }}
        >
          {d.dag} {d.datum}
        </p>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 36, animation: 'fadeIn 0.5s ease' }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>Godmorgon {d.namn}</h1>
          <p style={{ margin: '12px 0 0', fontSize: 17, color: '#86868b', fontWeight: 500 }}>Kör försiktigt till jobbet</p>
        </div>
        
        {/* Väder-kort */}
        <div style={{ 
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          borderRadius: 24, padding: 24, marginBottom: 24, color: '#fff',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          animation: 'slideUp 0.5s ease'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.6, fontWeight: 600, letterSpacing: '0.5px' }}>📍 Karatorp</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 48, fontWeight: 600, letterSpacing: '-2px' }}>-3°</span>
                <span style={{ fontSize: 16, opacity: 0.8, fontWeight: 500 }}>Lätt snö</span>
              </div>
            </div>
            <span style={{ fontSize: 52 }}>❄️</span>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>🦌</span>
              <span style={{ fontSize: 15, opacity: 0.9, fontWeight: 500 }}>Gryning – extra viltrisk</span>
            </div>
          </div>
        </div>
        
        {/* GPS Status */}
        {gps && <div style={{ background: 'rgba(0,122,255,0.1)', borderRadius: 16, padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, border: '1px solid rgba(0,122,255,0.2)', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#007aff', animation: 'pulse 1.5s infinite' }} />
          <span style={{ fontSize: 15, color: '#007aff', fontWeight: 600 }}>GPS loggar körning...</span>
        </div>}
        
        {/* Körning loggad */}
        {kmMorgon && <div style={{ background: 'rgba(34,197,94,0.1)', borderRadius: 16, padding: 18, marginBottom: 16, border: '1px solid rgba(34,197,94,0.2)', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'checkPop 0.4s ease' }}>
              <span style={{ color: '#fff', fontSize: 16 }}>✓</span>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, color: '#16a34a', fontWeight: 600 }}>Körning loggas automatiskt</p>
              <p style={{ margin: '2px 0 0', fontSize: 14, color: '#166534', fontWeight: 500 }}>{kmMorgon.km} km hittills</p>
            </div>
          </div>
        </div>}
      </div>
      <div style={s.b}>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#86868b', textAlign: 'center', fontWeight: 500 }}>
          Appen registrerar automatiskt när du loggar in på maskinen
        </p>
        <button onClick={() => setSista(!sista)} style={{ padding: 12, background: 'transparent', border: '1px dashed #c7c7cc', borderRadius: 12, fontSize: 13, color: '#86868b', cursor: 'pointer', fontWeight: 500 }}>Demo: {sista ? '📅 Sista dagen' : '📆 Vanlig dag'}</button>
        <button style={{...s.x, marginTop: 8}} onClick={() => { setMomIn('06:45'); setSteg('dag'); }}>Simulera inloggning på maskin →</button>
      </div>
    </div>
  );

  // DATUM-MENY (gömd bakom datumklick)
  if (steg === 'datumMeny') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}>
        <p style={{ margin: 0, fontSize: 14, color: '#007aff', fontWeight: 600, letterSpacing: '0.5px' }}>{d.dag} {d.datum}</p>
        <h1 style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 700 }}>Vad vill du göra?</h1>
      </div>
      <div style={{ flex: 1, paddingTop: 12, overflowY: 'auto' }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Idag</p>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { setDagTyp('sjuk'); setSteg('bekräftaFrånvaro'); }}>
          <span style={{ fontSize: 24 }}>🤒</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sjuk</p>
          </div>
        </button>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { setDagTyp('vab'); setSteg('bekräftaFrånvaro'); }}>
          <span style={{ fontSize: 24 }}>👶</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>VAB</p>
          </div>
        </button>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { setDagTyp('service'); setSteg('manuellDag'); }}>
          <span style={{ fontSize: 24 }}>🔧</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Service / Haveri</p>
          </div>
        </button>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { setDagTyp('annat'); setSteg('manuellDag'); }}>
          <span style={{ fontSize: 24 }}>📋</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Annat arbete</p>
          </div>
        </button>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { setDagTyp('utbildning'); setSteg('manuellDag'); }}>
          <span style={{ fontSize: 24 }}>📚</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Utbildning</p>
          </div>
        </button>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => setSteg('traktamente')}>
          <span style={{ fontSize: 24 }}>🛏️</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Traktamente</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#86868b' }}>300 kr/dag</p>
          </div>
        </button>
        
        {/* INSTÄLLNINGAR */}
        <p style={{ margin: '24px 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Konto</p>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => setSteg('inställningar')}>
          <span style={{ fontSize: 24 }}>⚙️</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Inställningar</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#86868b' }}>{användare.namn} • {användare.maskin}</p>
          </div>
        </button>
        
        {/* TIDIGARE DAGAR */}
        <p style={{ margin: '24px 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Tidigare (max 7 dagar)</p>
        {historik.map((dag, i) => (
          <button 
            key={i}
            style={{
              ...s.x, 
              marginBottom: 8, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '16px 20px',
              background: dag.status === 'saknas' ? 'rgba(251,191,36,0.1)' : '#fff',
              border: dag.status === 'saknas' ? '1px solid rgba(251,191,36,0.3)' : '1px solid #e5e5e5'
            }} 
            onClick={() => { setRedigeraDag(dag); setSteg('redigeraHistorik'); }}
          >
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1d1d1f' }}>{dag.datum}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#86868b' }}>
                {fmtTid(dag.arbMin)} • {dag.km} km
                {dag.extra > 0 && ` • +${dag.extra} min`}
                {dag.traktamente && ` • 🛏️`}
              </p>
            </div>
            <span style={{ fontSize: 18, color: dag.status === 'saknas' ? '#f59e0b' : '#22c55e' }}>
              {dag.status === 'saknas' ? '⚠️' : '✓'}
            </span>
          </button>
        ))}
      </div>
      <div style={s.b}>
        <button style={s.g} onClick={() => setSteg('morgon')}>← Tillbaka</button>
      </div>
    </div>
  );

  // TRAKTAMENTE
  if (steg === 'traktamente') {
    const belopp = 300; // Skatteverkets skattefria belopp
    
    return (
      <div style={{...s.c, background: '#fff'}}>
        <style>{pulseKeyframes}</style>
        <div style={s.t}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BackBtn onClick={() => setSteg(kmKväll ? 'kväll' : 'datumMeny')} />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Traktamente</h1>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s ease' }}>
            <div style={{ 
              width: 100, height: 100, borderRadius: '50%', 
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              margin: '0 auto 28px',
              boxShadow: '0 10px 40px rgba(16,185,129,0.3)'
            }}>
              <span style={{ fontSize: 48 }}>🛏️</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', color: '#1d1d1f' }}>Heldagstraktamente</h2>
            <p style={{ fontSize: 16, color: '#86868b', margin: '0 0 32px', fontWeight: 500 }}>Skattefritt enligt Skatteverket</p>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.05) 100%)', 
              borderRadius: 24, 
              padding: 32, 
              border: '1px solid rgba(16,185,129,0.2)',
              margin: '0 20px'
            }}>
              <p style={{ margin: 0, fontSize: 64, fontWeight: 700, color: '#059669', letterSpacing: '-2px' }}>{belopp} kr</p>
              <p style={{ margin: '8px 0 0', fontSize: 15, color: '#86868b', fontWeight: 500 }}>per dag</p>
            </div>
          </div>
        </div>
        <div style={s.b}>
          {!traktamente ? (
            <button 
              style={s.g} 
              onClick={() => { 
                setTraktamente({ summa: belopp });
                setSteg(kmKväll ? 'kväll' : 'morgon'); 
              }}
            >
              Lägg till traktamente
            </button>
          ) : (
            <button 
              style={s.r} 
              onClick={() => { 
                setTraktamente(null); 
                setSteg(kmKväll ? 'kväll' : 'morgon'); 
              }}
            >
              Ta bort traktamente
            </button>
          )}
        </div>
      </div>
    );
  }

  // REDIGERA HISTORIK
  if (steg === 'redigeraHistorik' && redigeraDag) {
    return (
      <div style={{...s.c, background: '#fff'}}>
        <style>{pulseKeyframes}</style>
        <div style={s.t}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BackBtn onClick={() => setSteg('datumMeny')} />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{redigeraDag.datum}</h1>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 20, overflowY: 'auto' }}>
          {/* Sammanfattning */}
          <div style={{ background: '#f5f5f7', borderRadius: 16, padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: '#86868b', fontWeight: 500 }}>Arbetstid</span>
              <span style={{ fontSize: 14, color: '#1d1d1f', fontWeight: 600 }}>{fmtTid(redigeraDag.arbMin)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: '#86868b', fontWeight: 500 }}>Körning</span>
              <span style={{ fontSize: 14, color: '#1d1d1f', fontWeight: 600 }}>{redigeraDag.km} km</span>
            </div>
            {redigeraDag.extra > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, color: '#86868b', fontWeight: 500 }}>Extra tid</span>
              <span style={{ fontSize: 14, color: '#1d1d1f', fontWeight: 600 }}>{redigeraDag.extra} min</span>
            </div>}
            {redigeraDag.traktamente && <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#86868b', fontWeight: 500 }}>Traktamente</span>
              <span style={{ fontSize: 14, color: '#1d1d1f', fontWeight: 600 }}>{redigeraDag.traktamente.summa} kr</span>
            </div>}
          </div>
          
          {/* Status */}
          {redigeraDag.status === 'saknas' && <div style={{ background: 'rgba(251,191,36,0.1)', borderRadius: 14, padding: '14px 18px', marginBottom: 24, border: '1px solid rgba(251,191,36,0.3)' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#92400e', fontWeight: 600 }}>
              ⚠️ Något kan saknas - granska och bekräfta
            </p>
          </div>}
          
          {/* Lägg till */}
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Lägg till</p>
          <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { /* TODO: Lägg till extra tid för historik-dag */ }}>
            <span style={{ fontSize: 24 }}>🕐</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Extra tid</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#86868b' }}>{redigeraDag.extra > 0 ? `${redigeraDag.extra} min registrerad` : 'Ingen registrerad'}</p>
            </div>
          </button>
          <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '18px 20px'}} onClick={() => { /* TODO: Lägg till traktamente för historik-dag */ }}>
            <span style={{ fontSize: 24 }}>🛏️</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Traktamente</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#86868b' }}>{redigeraDag.traktamente ? `${redigeraDag.traktamente.summa} kr` : '300 kr/dag'}</p>
            </div>
          </button>
        </div>
        <div style={s.b}>
          <button style={s.g} onClick={() => setSteg('datumMeny')}>
            {redigeraDag.status === 'saknas' ? 'Bekräfta dag ✓' : 'Spara ändringar'}
          </button>
        </div>
      </div>
    );
  }

  // INSTÄLLNINGAR
  if (steg === 'inställningar') {
    const hämtaPosition = () => {
      setSökerPosition(true);
      
      // Kolla om GPS finns
      if (!navigator.geolocation) {
        alert('GPS stöds inte. Testa i en riktig webbläsare (Chrome/Safari).');
        setSökerPosition(false);
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Lyckades! Kolla precision
          if (position.coords.accuracy > 15) {
            setSökerPosition(false);
            alert('GPS-positionen är för osäker (' + Math.round(position.coords.accuracy) + 'm). Försök igen utomhus.');
            return;
          }
          setAnvändare(prev => ({
            ...prev,
            hemLat: position.coords.latitude,
            hemLng: position.coords.longitude
          }));
          setSökerPosition(false);
          alert(`✓ Position sparad!\n\nLat: ${position.coords.latitude.toFixed(6)}\nLng: ${position.coords.longitude.toFixed(6)}`);
        },
        (error) => {
          // Misslyckades
          setSökerPosition(false);
          if (error.code === 1) {
            alert('Du nekade GPS-åtkomst. Gå till webbläsarens inställningar och tillåt platsåtkomst.');
          } else if (error.code === 2) {
            alert('Kunde inte hämta position. Kontrollera att GPS är aktiverat på din enhet.');
          } else if (error.code === 3) {
            alert('GPS-förfrågan tog för lång tid. Försök igen.');
          } else {
            alert('Okänt fel: ' + error.message);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    };
    
    return (
      <div style={{...s.c, background: '#fff'}}>
        <div style={s.t}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BackBtn onClick={() => setSteg('datumMeny')} />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Inställningar</h1>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 20, overflowY: 'auto' }}>
          {/* Profil */}
          <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(34,197,94,0.05) 100%)', borderRadius: 20, padding: 20, marginBottom: 24, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 24, color: '#fff', fontWeight: 700 }}>{användare.namn.charAt(0)}</span>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1d1d1f' }}>{användare.namn}</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, color: '#86868b' }}>{användare.email}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>● Inloggad</p>
              </div>
            </div>
          </div>
          
          {/* Hemadress */}
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Hemadress (för GPS)</p>
          <div style={{ marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="T.ex. Skogsvägen 12, Kompersmåla" 
              value={tempAdress || användare.hemadress} 
              onChange={(e) => setTempAdress(e.target.value)} 
              style={s.i} 
            />
          </div>
          
          <button 
            style={{...s.x, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 20px', background: användare.hemLat ? 'rgba(34,197,94,0.1)' : '#f5f5f7', border: användare.hemLat ? '1px solid rgba(34,197,94,0.3)' : '1px solid #e5e5e5'}} 
            onClick={hämtaPosition}
            disabled={sökerPosition}
          >
            <span style={{ fontSize: 20 }}>{sökerPosition ? '⏳' : '📍'}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: användare.hemLat ? '#16a34a' : '#1d1d1f' }}>
              {sökerPosition ? 'Hämtar position...' : användare.hemLat ? `✓ Position sparad (${användare.hemLat.toFixed(4)}, ${användare.hemLng.toFixed(4)})` : 'Använd nuvarande position som hem'}
            </span>
          </button>
          
          {/* Maskin */}
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Maskin</p>
          <div style={{ marginBottom: 24 }}>
            <input 
              type="text" 
              placeholder="T.ex. Ponsse Scorpion" 
              value={tempMaskin || användare.maskin} 
              onChange={(e) => setTempMaskin(e.target.value)} 
              style={s.i} 
            />
          </div>
          
          {/* GS-AVTAL KÖRERSÄTTNING */}
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Körersättning (GS-avtalet {företag.avtalÅr})</p>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666', fontWeight: 500 }}>Ersättning efter</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input 
                  type="number" 
                  value={tempKmGräns || företag.körersättningEfter} 
                  onChange={(e) => setTempKmGräns(Number(e.target.value))} 
                  style={{...s.i, width: 80, textAlign: 'center'}} 
                />
                <span style={{ fontSize: 15, color: '#666', fontWeight: 500 }}>km enkel väg</span>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666', fontWeight: 500 }}>Ersättning per km</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input 
                  type="number" 
                  step="0.10"
                  value={tempKmErsättning || företag.körersättningPerKm} 
                  onChange={(e) => setTempKmErsättning(Number(e.target.value))} 
                  style={{...s.i, width: 80, textAlign: 'center'}} 
                />
                <span style={{ fontSize: 15, color: '#666', fontWeight: 500 }}>kr/km</span>
              </div>
            </div>
          </div>
          
          {/* Exempel */}
          <div style={{ background: 'rgba(245,158,11,0.08)', borderRadius: 14, padding: '14px 18px', marginBottom: 24, border: '1px solid rgba(245,158,11,0.2)' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#92400e', fontWeight: 600 }}>
              📍 Exempel: {(tempKmGräns || företag.körersättningEfter) + 10} km enkel väg = {10 * 2} km ersättning = {(10 * 2 * (tempKmErsättning || företag.körersättningPerKm)).toFixed(0)} kr
            </p>
          </div>
          
          {/* Info */}
          <div style={{ background: 'rgba(59,130,246,0.08)', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(59,130,246,0.2)' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#1d4ed8', fontWeight: 600 }}>
              💡 Uppdatera dessa värden när GS-avtalet ändras. Körersättning beräknas på sträckan över {tempKmGräns || företag.körersättningEfter} km enkel väg.
            </p>
          </div>
        </div>
        <div style={s.b}>
          <button 
            style={s.g} 
            onClick={() => { 
              setAnvändare(prev => ({ 
                ...prev, 
                hemadress: tempAdress || prev.hemadress, 
                maskin: tempMaskin || prev.maskin 
              }));
              setFöretag(prev => ({
                ...prev,
                körersättningEfter: tempKmGräns || prev.körersättningEfter,
                körersättningPerKm: tempKmErsättning || prev.körersättningPerKm
              }));
              setSteg('datumMeny'); 
            }}
          >
            Spara inställningar
          </button>
        </div>
      </div>
    );
  }

  // PUSH-NOTIS - leder nu till datumMeny
  // (I verkligheten öppnar push-notisen appen direkt till datumMeny)
  
  // BEKRÄFTA FRÅNVARO (Sjuk/VAB)
  if (steg === 'bekräftaFrånvaro') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}><p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600 }}>{d.dag} {d.datum}</p></div>
      <div style={s.m}>
        <div style={{ 
          width: 100, height: 100, borderRadius: '50%', 
          background: dagTyp === 'sjuk' ? 'linear-gradient(135deg, #fca5a5 0%, #f87171 100%)' : 'linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32,
          boxShadow: dagTyp === 'sjuk' ? '0 8px 32px rgba(248,113,113,0.3)' : '0 8px 32px rgba(96,165,250,0.3)',
          animation: 'checkPop 0.5s ease'
        }}>
          <span style={{ fontSize: 48 }}>{dagTyp === 'sjuk' ? '🤒' : '👶'}</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 12px' }}>
          {dagTyp === 'sjuk' ? 'Krya på dig!' : 'Hoppas barnet blir bättre!'}
        </h1>
        <p style={{ fontSize: 17, color: '#86868b', margin: 0, fontWeight: 500 }}>
          {dagTyp === 'sjuk' ? 'Sjukanmälan' : 'VAB'} registrerad för {d.datum}
        </p>
      </div>
      <div style={s.b}>
        <button style={s.g} onClick={() => setSteg('klarFrånvaro')}>OK</button>
        <button style={s.x} onClick={() => setSteg('datumMeny')}>Ångra</button>
      </div>
    </div>
  );

  // KLAR FRÅNVARO
  if (steg === 'klarFrånvaro') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}><p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600 }}>{d.dag} {d.datum}</p></div>
      <div style={s.m}>
        <div style={{ 
          width: 100, height: 100, borderRadius: '50%', 
          background: 'linear-gradient(180deg, #34d058 0%, #22c55e 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32,
          boxShadow: '0 10px 40px rgba(34,197,94,0.35)',
          animation: 'checkPop 0.5s ease'
        }}>
          <span style={{ color: '#fff', fontSize: 48 }}>✓</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 12px' }}>Registrerat!</h1>
        <p style={{ fontSize: 17, color: '#86868b', margin: 0, fontWeight: 500 }}>
          {dagTyp === 'sjuk' ? 'Sjukanmälan' : 'VAB'} för {d.datum}
        </p>
        <p style={{ fontSize: 15, color: '#86868b', margin: '20px 0 0', fontWeight: 400 }}>
          Vila och ta hand om {dagTyp === 'sjuk' ? 'dig' : 'barnet'}
        </p>
      </div>
      <div style={s.b}>
        <button style={s.x} onClick={() => { setDagTyp('normal'); setKmMorgon(null); setKmKväll(null); setExtra([]); setÄndring(null); setStart('06:12'); setSlut('16:45'); setBetald(0); setGpsHem(null); setMomIn(null); setMomUt(null); setGpsHemKväll(null); setExtraMorgon(null); setExtraKväll(null); setManuellBesk(''); setTraktamente(null); setSteg('morgon'); }}>Börja om (demo)</button>
      </div>
    </div>
  );

  // MANUELL ARBETSDAG (Service/Annat/Utbildning) - bara starttid + beskrivning
  if (steg === 'manuellDag') {
    const getTitel = () => {
      if (dagTyp === 'service') return 'Service / Haveri';
      if (dagTyp === 'utbildning') return 'Utbildning';
      return 'Annat arbete';
    };
    const getIkon = () => {
      if (dagTyp === 'service') return '🔧';
      if (dagTyp === 'utbildning') return '📚';
      return '📋';
    };
    const getFärg = () => {
      if (dagTyp === 'service') return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#92400e' };
      if (dagTyp === 'utbildning') return { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', text: '#6d28d9' };
      return { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#1d4ed8' };
    };
    const getPlaceholder = () => {
      if (dagTyp === 'service') return "T.ex. Service hos Skruv Maskin";
      if (dagTyp === 'utbildning') return "T.ex. Motorsågskörkort";
      return "T.ex. Röjning vid väg";
    };
    const getBeskrivning = () => {
      if (dagTyp === 'service') return 'Maskinen är på service eller trasig';
      if (dagTyp === 'utbildning') return 'Kurs, certifiering eller utbildning';
      return 'Annat arbete utan maskin';
    };
    const f = getFärg();
    
    return (
      <div style={{...s.c, background: '#fff'}}>
        <div style={s.t}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BackBtn onClick={() => setSteg('datumMeny')} />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{getTitel()}</h1>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 20, overflowY: 'auto' }}>
          <div style={{ background: f.bg, borderRadius: 14, padding: '14px 18px', marginBottom: 24, border: `1px solid ${f.border}` }}>
            <p style={{ margin: 0, fontSize: 14, color: f.text, fontWeight: 600 }}>
              {getIkon()} {getBeskrivning()}
            </p>
          </div>
          
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: 'block', fontSize: 14, color: '#86868b', marginBottom: 10, fontWeight: 600 }}>Vad gör du?</label>
            <input 
              type="text" 
              placeholder={getPlaceholder()} 
              value={manuellBesk} 
              onChange={(e) => setManuellBesk(e.target.value)} 
              style={s.i} 
            />
          </div>
          
          <TimePicker value={manuellStart} onChange={setManuellStart} label="När började du?" />
          
          <div style={{ background: 'rgba(134,134,139,0.1)', borderRadius: 14, padding: '14px 18px', marginTop: 8 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 500 }}>
              💡 Sluttid och rast fyller du i när dagen är slut
            </p>
          </div>
          
          <div style={{ background: 'rgba(34,197,94,0.08)', borderRadius: 14, padding: '14px 18px', marginTop: 12, border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#16a34a', fontWeight: 600 }}>
              ✓ Körning loggas automatiskt via GPS
            </p>
          </div>
        </div>
        <div style={s.b}>
          <button 
            style={{ ...s.g, opacity: manuellBesk ? 1 : 0.4 }} 
            disabled={!manuellBesk} 
            onClick={() => { 
              setStart(manuellStart); 
              setSlut(''); // Tom sluttid - fylls i på kvällen
              setSteg('manuellDagPågår'); 
            }}
          >
            Starta dagen
          </button>
        </div>
      </div>
    );
  }

  // MANUELL DAG PÅGÅR
  if (steg === 'manuellDagPågår') {
    const getIkon = () => {
      if (dagTyp === 'service') return '🔧';
      if (dagTyp === 'utbildning') return '📚';
      return '📋';
    };
    const getFärg = () => {
      if (dagTyp === 'service') return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#92400e', puls: '#f59e0b' };
      if (dagTyp === 'utbildning') return { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', text: '#6d28d9', puls: '#8b5cf6' };
      return { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#1d4ed8', puls: '#3b82f6' };
    };
    const f = getFärg();
    
    return (
      <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
        <style>{pulseKeyframes}</style>
        <div style={s.t}>
          <p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600 }}>{d.dag} {d.datum}</p>
        </div>
        <div style={s.m}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: f.puls, marginBottom: 28, animation: 'pulseGreen 2s infinite' }} />
          <p style={{ fontSize: 80, fontWeight: 600, margin: 0, letterSpacing: '-3px', color: '#1d1d1f' }}>{start}</p>
          <p style={{ fontSize: 17, color: '#86868b', margin: '12px 0 0', fontWeight: 500 }}>Arbetsdag startad</p>
          <div style={{ marginTop: 32, padding: '14px 24px', background: f.bg, borderRadius: 14, border: `1px solid ${f.border}` }}>
            <p style={{ margin: 0, fontSize: 15, color: f.text, fontWeight: 600 }}>
              {getIkon()} {manuellBesk}
            </p>
          </div>
        </div>
        <div style={s.b}>
          <button style={s.x} onClick={() => { setKmMorgon({ km: 72 }); setKmKväll({ km: 72 }); setSteg('manuellKväll'); }}>
            Avsluta dagen →
          </button>
        </div>
      </div>
    );
  }

  // MANUELL KVÄLL - fyll i sluttid + rast
  if (steg === 'manuellKväll') {
    const getIkon = () => {
      if (dagTyp === 'service') return '🔧';
      if (dagTyp === 'utbildning') return '📚';
      return '📋';
    };
    const getFärg = () => {
      if (dagTyp === 'service') return { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#92400e' };
      if (dagTyp === 'utbildning') return { bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.2)', text: '#6d28d9' };
      return { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', text: '#1d4ed8' };
    };
    const f = getFärg();
    
    return (
      <div style={{...s.c, background: '#fff'}}>
        <div style={s.t}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BackBtn onClick={() => setSteg('manuellDagPågår')} />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Avsluta dagen</h1>
          </div>
        </div>
        <div style={{ flex: 1, paddingTop: 20, overflowY: 'auto' }}>
          <div style={{ background: f.bg, borderRadius: 14, padding: '14px 18px', marginBottom: 24, border: `1px solid ${f.border}` }}>
            <p style={{ margin: 0, fontSize: 14, color: f.text, fontWeight: 600 }}>
              {getIkon()} {manuellBesk}
            </p>
          </div>
          
          <div style={{ background: '#f5f5f7', borderRadius: 14, padding: '14px 18px', marginBottom: 24 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600 }}>Startade: {start}</p>
          </div>
          
          <TimePicker value={manuellSlut} onChange={setManuellSlut} label="När slutade du?" />
          
          <MinPicker value={manuellRast} onChange={setManuellRast} label="Rast" />
          
          <div style={{ textAlign: 'center', padding: 20, background: 'rgba(34,197,94,0.08)', borderRadius: 20, marginBottom: 24, border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Arbetstid</p>
            <p style={{ margin: '10px 0 0', fontSize: 32, fontWeight: 700, color: '#16a34a' }}>{fmtTid(Math.max(0, tim(start, manuellSlut) - manuellRast))}</p>
          </div>
        </div>
        <div style={s.b}>
          <button 
            style={s.g} 
            onClick={() => { 
              setSlut(manuellSlut);
              setRast(manuellRast);
              setSteg('kväll'); 
            }}
          >
            Spara och fortsätt
          </button>
        </div>
      </div>
    );
  }

  // DAG PÅGÅR - kolla först om det finns saknad morgontid
  if (steg === 'dag') {
    const saknadMorgon = beräknaSaknadMorgon();
    
    // Om det finns saknad tid på morgonen (>15 min) och inte hanterad
    if (saknadMorgon > EXTRA_TID_TRÖSKEL && !extraMorgon?.hanterad) {
      return (
        <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
          <style>{pulseKeyframes}</style>
          <div style={s.t}><p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600 }}>{d.dag} {d.datum}</p></div>
          <div style={s.m}>
            <div style={{ 
              width: 80, height: 80, borderRadius: '50%', 
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28,
              boxShadow: '0 8px 32px rgba(245,158,11,0.3)'
            }}>
              <span style={{ fontSize: 36 }}>🤔</span>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Du var iväg tidigt idag</h2>
            <p style={{ fontSize: 16, color: '#86868b', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
              Du lämnade hemmet <strong>06:00</strong><br/>
              men loggade in på maskinen <strong>06:45</strong>
            </p>
            <div style={{ 
              background: 'rgba(245,158,11,0.1)', borderRadius: 16, padding: 20, marginTop: 24,
              border: '1px solid rgba(245,158,11,0.2)'
            }}>
              <p style={{ margin: 0, fontSize: 15, color: '#92400e', fontWeight: 600 }}>
                ⏱️ {fmtTid(saknadMorgon)} utöver normal restid
              </p>
            </div>
            <p style={{ fontSize: 16, color: '#1d1d1f', margin: '28px 0 0', fontWeight: 600 }}>
              Gjorde du något på vägen?
            </p>
          </div>
          <div style={s.b}>
            <button style={s.g} onClick={() => { 
              setTExMin(saknadMorgon); 
              setTExBesk(''); 
              setTExDeb(null); 
              setTExObj(null); 
              setExtraMorgon({ minuter: saknadMorgon, hanterad: false });
              setSteg('exDeb'); 
            }}>
              Ja, registrera tid
            </button>
            <button style={s.x} onClick={() => setExtraMorgon({ minuter: 0, hanterad: true })}>
              Nej, bara trafik
            </button>
          </div>
        </div>
      );
    }
    
    // Normal dag-vy
    return (
      <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
        <style>{pulseKeyframes}</style>
        <div style={s.t}>
          <p 
            onClick={() => setSteg('datumMeny')} 
            style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600, cursor: 'pointer' }}
          >
            {d.dag} {d.datum}
          </p>
        </div>
        <div style={s.m}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#34c759', marginBottom: 28, animation: 'pulseGreen 2s infinite' }} />
          <p style={{ fontSize: 80, fontWeight: 600, margin: 0, letterSpacing: '-3px', color: '#1d1d1f' }}>{start}</p>
          <p style={{ fontSize: 17, color: '#86868b', margin: '12px 0 0', fontWeight: 500 }}>Inloggad på maskin</p>
          <div style={{ marginTop: 32, padding: '14px 24px', background: 'rgba(34,197,94,0.1)', borderRadius: 14, border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ margin: 0, fontSize: 15, color: '#16a34a', fontWeight: 600 }}>🌲 Karatorp RP 2025</p>
          </div>
        </div>
        <div style={s.b}><button style={s.x} onClick={() => { setMomUt('16:45'); setGpsHemKväll('17:45'); setKmKväll({ km: 75 }); setSteg('kvällFråga'); }}>Simulera kväll →</button></div>
      </div>
    );
  }

  // KVÄLL - Fråga om extra tid på hemvägen
  if (steg === 'kvällFråga') {
    const saknadKväll = beräknaSaknadKväll();
    
    // Om det finns saknad tid på kvällen (>15 min)
    if (saknadKväll > EXTRA_TID_TRÖSKEL && !extraKväll?.hanterad) {
      return (
        <div style={{...s.c, background: 'linear-gradient(180deg, #1a1a2e 0%, #0f172a 100%)', color: '#fff'}}>
          <style>{pulseKeyframes}</style>
          <div style={s.t}>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{d.dag} {d.datum}</p>
            <h1 style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 700 }}>Välkommen hem!</h1>
          </div>
          <div style={s.m}>
            <div style={{ 
              width: 80, height: 80, borderRadius: '50%', 
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28,
              boxShadow: '0 8px 32px rgba(245,158,11,0.3)'
            }}>
              <span style={{ fontSize: 36 }}>🤔</span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Tog hemresan längre tid?</h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: 0, fontWeight: 500, lineHeight: 1.5 }}>
              Du loggade ut från maskinen <strong style={{ color: '#fff' }}>16:45</strong><br/>
              men kom hem <strong style={{ color: '#fff' }}>17:45</strong>
            </p>
            <div style={{ 
              background: 'rgba(245,158,11,0.15)', borderRadius: 16, padding: 20, marginTop: 24,
              border: '1px solid rgba(245,158,11,0.25)'
            }}>
              <p style={{ margin: 0, fontSize: 15, color: '#fcd34d', fontWeight: 600 }}>
                ⏱️ {fmtTid(saknadKväll)} utöver normal restid
              </p>
            </div>
            <p style={{ fontSize: 16, color: '#fff', margin: '28px 0 0', fontWeight: 600 }}>
              Gjorde du något på vägen hem?
            </p>
          </div>
          <div style={s.b}>
            <button style={s.g} onClick={() => { 
              setTExMin(saknadKväll); 
              setTExBesk(''); 
              setTExDeb(null); 
              setTExObj(null); 
              setExtraKväll({ minuter: saknadKväll, hanterad: false });
              setSteg('exDeb'); 
            }}>
              Ja, registrera tid
            </button>
            <button style={{...s.x, background: 'rgba(255,255,255,0.1)', color: '#fff'}} onClick={() => { setExtraKväll({ minuter: 0, hanterad: true }); setSteg('kväll'); }}>
              Nej, bara trafik
            </button>
          </div>
        </div>
      );
    }
    
    // Ingen saknad tid, gå vidare till kväll
    setSteg('kväll');
    return null;
  }

  // KVÄLL
  if (steg === 'kväll') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #1a1a2e 0%, #0f172a 100%)', color: '#fff'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}>
        <p 
          onClick={() => setSteg('kvällMeny')} 
          style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 600, cursor: 'pointer' }}
        >
          {d.dag} {d.datum}
        </p>
        <h1 style={{ margin: '10px 0 0', fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' }}>Godkväll {d.namn}</h1>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 12, paddingBottom: 20 }}>
        {/* ARBETSTID */}
        <div style={{ ...s.k, background: ändring ? 'rgba(252,211,77,0.12)' : 'rgba(255,255,255,0.08)', border: ändring ? '1px solid rgba(252,211,77,0.25)' : '1px solid rgba(255,255,255,0.08)' }} onClick={() => { setTStart(start); setTSlut(slut); setTRast(rast); setAnledn(''); setSteg('äTid'); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Arbetstid</p>
              <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700, color: '#fff' }}>{fmtTid(arbMin)}</p>
              <p style={{ margin: '6px 0 0', fontSize: 15, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{start} – {slut} ({rast} min rast)</p>
              {ändring && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#fcd34d', fontWeight: 600 }}>⚠️ Ändrad</p>}
            </div>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: ändring ? 'rgba(252,211,77,0.2)' : 'rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: ändring ? '#fcd34d' : '#4ade80', fontSize: 18 }}>{ändring ? '✎' : '✓'}</span>
            </div>
          </div>
        </div>
        
        {/* KÖRNING */}
        <div style={{ ...s.k, background: totKm > 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={() => { setTMKm(kmMorgon?.km || 0); setTKKm(kmKväll?.km || 0); setAnledn(''); setSteg('äKm'); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Körning</p>
              {totKm > 0 ? <>
                <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700, color: '#fff' }}>{totKm} km</p>
                {ers > 0 && <p style={{ margin: '6px 0 0', fontSize: 15, color: '#4ade80', fontWeight: 600 }}>+{ers} km = {(ers * företag.körersättningPerKm).toFixed(0)} kr</p>}
              </> : <p style={{ margin: '10px 0 0', fontSize: 17, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Ingen körning</p>}
            </div>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: totKm > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: totKm > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)', fontSize: 18 }}>{totKm > 0 ? '✓' : '+'}</span>
            </div>
          </div>
        </div>
        
        {/* EXTRA TID - bara om finns */}
        {extra.length > 0 && <div style={{ ...s.k, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }} onClick={() => { 
          setTExMin(extra[0].minuter); setTExBesk(extra[0].beskrivning); setTExDeb(extra[0].debiterbar); setTExObj(extra[0].objekt); setSteg('äExtra'); 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Extra tid</p>
              <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700, color: '#fff' }}>{fmtTid(totEx)}</p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{extra.map(e => e.beskrivning).join(', ')}</p>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#60a5fa', fontSize: 20 }}>✎</span>
            </div>
          </div>
        </div>}
        
        {/* TRAKTAMENTE - bara om finns */}
        {traktamente && <div style={{ ...s.k, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }} onClick={() => setSteg('traktamente')}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Traktamente</p>
              <p style={{ margin: '10px 0 0', fontSize: 34, fontWeight: 700, color: '#fff' }}>{traktamente.summa} kr</p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Heldag (skattefritt)</p>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#34d399', fontSize: 18 }}>✓</span>
            </div>
          </div>
        </div>}
        
        {/* TOTALT */}
        <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.08) 100%)', borderRadius: 20, padding: 22, marginTop: 8, border: '1px solid rgba(34,197,94,0.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Totalt idag</p>
              <p style={{ margin: '10px 0 0', fontSize: 40, fontWeight: 700, color: '#4ade80' }}>{fmtTid(totaltMin)}</p>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#4ade80', fontSize: 22 }}>✓</span>
            </div>
          </div>
        </div>
        
        {/* Ledtext för att lägga till mer */}
        {(!extra.length || !traktamente) && <p style={{ margin: '16px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontWeight: 500 }}>
          Tryck på datumet för att lägga till mer
        </p>}
        
        {sista && <div style={{ background: 'rgba(252,211,77,0.12)', borderRadius: 20, padding: 20, marginTop: 12, border: '1px solid rgba(252,211,77,0.25)', cursor: 'pointer' }} onClick={() => setSteg('månad')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 30 }}>📊</span>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fcd34d' }}>Sista arbetsdagen</p>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: 'rgba(252,211,77,0.7)', fontWeight: 500 }}>Se månadssammanfattning →</p>
            </div>
          </div>
        </div>}
      </div>
      <div style={s.b}>
        <button style={{...s.g, boxShadow: '0 4px 20px rgba(34,197,94,0.4)'}} onClick={() => setSteg(sista ? 'månad' : 'klar')}>Allt stämmer ✓</button>
      </div>
    </div>
  );

  // KVÄLL MENY (tryck på datumet)
  if (steg === 'kvällMeny') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #1a1a2e 0%, #0f172a 100%)', color: '#fff'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}>
        <p style={{ margin: 0, fontSize: 14, color: '#4ade80', fontWeight: 600 }}>{d.dag} {d.datum}</p>
        <h1 style={{ margin: '10px 0 0', fontSize: 28, fontWeight: 700 }}>Lägg till</h1>
      </div>
      <div style={{ flex: 1, paddingTop: 20 }}>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '20px 24px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)'}} onClick={() => { setTExMin(30); setTExBesk(''); setTExDeb(null); setTExObj(null); setSteg('exDeb'); }}>
          <span style={{ fontSize: 28 }}>🕐</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#fff' }}>Extra tid</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{extra.length > 0 ? `${fmtTid(totEx)} registrerad` : 'Ärende, hämtning, etc.'}</p>
          </div>
        </button>
        <button style={{...s.x, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 16, padding: '20px 24px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)'}} onClick={() => setSteg('traktamente')}>
          <span style={{ fontSize: 28 }}>🛏️</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#fff' }}>Traktamente</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{traktamente ? `${traktamente.summa} kr registrerad` : '300 kr/dag (skattefritt)'}</p>
          </div>
        </button>
      </div>
      <div style={s.b}>
        <button style={{...s.g, background: 'rgba(255,255,255,0.1)', color: '#fff'}} onClick={() => setSteg('kväll')}>← Tillbaka</button>
      </div>
    </div>
  );

  // ÄNDRA ARBETSTID
  if (steg === 'äTid') {
    const tArbMin = Math.max(0, tim(tStart, tSlut) - tRast);
    const ä = tStart !== start || tSlut !== slut || tRast !== rast;
    return (
      <div style={{...s.c, background: '#fff'}}>
        <div style={s.t}><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><BackBtn onClick={() => setSteg('kväll')} /><h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Arbetstid</h1></div></div>
        <div style={{ flex: 1, paddingTop: 24, overflowY: 'auto' }}>
          <TimePicker value={tStart} onChange={setTStart} label="Start" />
          <TimePicker value={tSlut} onChange={setTSlut} label="Slut" />
          <MinPicker value={tRast} onChange={setTRast} label="Rast" />
          <div style={{ textAlign: 'center', padding: 24, background: ä ? 'rgba(34,197,94,0.08)' : '#f5f5f7', borderRadius: 20, marginBottom: 24, border: ä ? '1px solid rgba(34,197,94,0.2)' : 'none' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Total arbetstid</p>
            <p style={{ margin: '12px 0 0', fontSize: 48, fontWeight: 700, color: ä ? '#16a34a' : '#1d1d1f', letterSpacing: '-1px' }}>{fmtTid(tArbMin)}</p>
          </div>
          {ä && <div style={{ marginBottom: 20 }}><label style={{ display: 'block', fontSize: 14, color: '#86868b', marginBottom: 10, fontWeight: 600 }}>Anledning <span style={{ color: '#ff3b30' }}>*</span></label><input type="text" placeholder="T.ex. datorn hängde sig" value={anledn} onChange={(e) => setAnledn(e.target.value)} style={s.i} /></div>}
        </div>
        <div style={s.b}><button style={{ ...s.p, opacity: (ä && !anledn) ? 0.4 : 1 }} disabled={ä && !anledn} onClick={() => { if (ä) { setStart(tStart); setSlut(tSlut); setRast(tRast); setÄndring(anledn); } setSteg('kväll'); }}>{ä ? 'Spara ändring' : 'Tillbaka'}</button></div>
      </div>
    );
  }

  // ÄNDRA KÖRNING
  if (steg === 'äKm') {
    const ny = tMKm + tKKm, ä = tMKm !== (kmMorgon?.km || 0) || tKKm !== (kmKväll?.km || 0);
    return (
      <div style={{...s.c, background: '#fff'}}>
        <div style={s.t}><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><BackBtn onClick={() => setSteg('kväll')} /><h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Körning</h1></div></div>
        <div style={{ flex: 1, paddingTop: 24 }}>
          <KmPicker value={tMKm} onChange={setTMKm} label="Morgon" />
          <KmPicker value={tKKm} onChange={setTKKm} label="Kväll" />
          <div style={{ textAlign: 'center', padding: 24, background: 'rgba(34,197,94,0.08)', borderRadius: 20, marginBottom: 24, border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Totalt idag</p>
            <p style={{ margin: '12px 0 0', fontSize: 48, fontWeight: 700, color: '#16a34a', letterSpacing: '-1px' }}>{ny} km</p>
            {ny > 120 && <p style={{ margin: '12px 0 0', fontSize: 16, color: '#16a34a', fontWeight: 600 }}>+{ny - 120} km ersättning</p>}
          </div>
          {ä && <div style={{ marginBottom: 20 }}><label style={{ display: 'block', fontSize: 14, color: '#86868b', marginBottom: 10, fontWeight: 600 }}>Anledning <span style={{ color: '#ff3b30' }}>*</span></label><input type="text" placeholder="T.ex. telefonen var urladdad" value={anledn} onChange={(e) => setAnledn(e.target.value)} style={s.i} /></div>}
        </div>
        <div style={s.b}><button style={{ ...s.p, opacity: (ä && !anledn) ? 0.4 : 1 }} disabled={ä && !anledn} onClick={() => { if (ä) { setKmMorgon({ km: tMKm }); setKmKväll({ km: tKKm }); } setSteg('kväll'); }}>{ä ? 'Spara' : 'Tillbaka'}</button></div>
      </div>
    );
  }

  // EXTRA TID - DEBITERBAR
  if (steg === 'exDeb') return (
    <div style={{...s.c, background: '#fff'}}>
      <div style={s.t}><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><BackBtn onClick={() => {
        // Markera som hanterad och gå tillbaka
        if (extraMorgon && !extraMorgon.hanterad) {
          setExtraMorgon({ minuter: 0, hanterad: true });
          setSteg('dag');
        } else if (extraKväll && !extraKväll.hanterad) {
          setExtraKväll({ minuter: 0, hanterad: true });
          setSteg('kväll');
        } else {
          setSteg('kväll');
        }
      }} /><h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Extra tid</h1></div></div>
      <div style={s.m}>
        <p style={{ fontSize: 18, color: '#86868b', margin: '0 0 12px', fontWeight: 500 }}>Steg 1 av 2</p>
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Kan tiden debiteras?</h2>
        <div style={{ display: 'flex', gap: 16, width: '100%', marginTop: 40 }}>
          <button style={{ ...s.g, flex: 1 }} onClick={() => { setTExDeb(true); setSteg('exObj'); }}>Ja</button>
          <button style={{ ...s.x, flex: 1 }} onClick={() => { setTExDeb(false); setTExObj(null); setSteg('äExtra'); }}>Nej</button>
        </div>
      </div>
      {extra.length > 0 && <div style={s.b}><button style={s.r} onClick={() => { setExtra([]); setSteg('kväll'); }}>Ta bort extra tid</button></div>}
    </div>
  );

  // EXTRA TID - OBJEKT
  if (steg === 'exObj') return (
    <div style={{...s.c, background: '#fff'}}>
      <div style={s.t}><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><BackBtn onClick={() => setSteg('exDeb')} /><div><p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 500 }}>Steg 2 av 2</p><h1 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}>Vilket objekt?</h1></div></div></div>
      <div style={{ flex: 1, paddingTop: 16 }}>
        {obj.map((o) => <button key={o.id} onClick={() => { setTExObj(o); setSteg('äExtra'); }} style={{ ...s.k, width: '100%', border: 'none', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{o.namn}</p><p style={{ margin: '4px 0 0', fontSize: 14, color: '#86868b', fontWeight: 500 }}>{o.ägare}</p></div>
            <span style={{ color: '#c7c7cc', fontSize: 20 }}>›</span>
          </div>
        </button>)}
      </div>
    </div>
  );

  // ÄNDRA EXTRA TID
  if (steg === 'äExtra') {
    const redigerar = extra.length > 0;
    return (
      <div style={{...s.c, background: '#fff'}}>
        <div style={s.t}><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><BackBtn onClick={() => { 
          if (redigerar) {
            setSteg('kväll');
          } else if (tExDeb) {
            setSteg('exObj');
          } else {
            setSteg('exDeb');
          }
        }} /><h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Extra tid</h1></div></div>
        <div style={{ flex: 1, paddingTop: 20, overflowY: 'auto' }}>
          <div style={{ background: tExDeb ? 'rgba(34,197,94,0.08)' : '#f5f5f7', borderRadius: 14, padding: '14px 18px', marginBottom: 24, border: tExDeb ? '1px solid rgba(34,197,94,0.2)' : 'none' }}>
            <p style={{ margin: 0, fontSize: 14, color: tExDeb ? '#16a34a' : '#86868b', fontWeight: 600 }}>{tExDeb ? '● Debiterbar' : '○ Ej debiterbar'}{tExObj && ` • ${tExObj.namn}`}</p>
          </div>
          
          <MinPicker value={tExMin} onChange={setTExMin} label="Tid" />
          
          <div style={{ textAlign: 'center', padding: 20, background: 'rgba(34,197,94,0.08)', borderRadius: 20, marginBottom: 24, border: '1px solid rgba(34,197,94,0.2)' }}>
            <p style={{ margin: 0, fontSize: 13, color: '#86868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Registrerad tid</p>
            <p style={{ margin: '10px 0 0', fontSize: 32, fontWeight: 700, color: '#16a34a' }}>{fmtTid(tExMin)}</p>
          </div>
          
          <div style={{ marginBottom: 24 }}><label style={{ display: 'block', fontSize: 14, color: '#86868b', marginBottom: 10, fontWeight: 600 }}>Beskrivning</label><input type="text" placeholder="T.ex. Hämta reservdelar" value={tExBesk} onChange={(e) => setTExBesk(e.target.value)} style={s.i} /></div>
        </div>
        <div style={s.b}>
          <button style={{ ...s.g, opacity: tExBesk ? 1 : 0.4 }} disabled={!tExBesk} onClick={() => { 
            setExtra([...extra, { beskrivning: tExBesk, minuter: tExMin, debiterbar: tExDeb, objekt: tExObj }]); 
            // Gå till rätt steg beroende på var vi kom från
            if (extraMorgon && !extraMorgon.hanterad) {
              setExtraMorgon({ ...extraMorgon, hanterad: true });
              setSteg('dag');
            } else if (extraKväll && !extraKväll.hanterad) {
              setExtraKväll({ ...extraKväll, hanterad: true });
              setSteg('kväll');
            } else {
              setSteg('kväll');
            }
          }}>Spara</button>
          {redigerar && <button style={s.r} onClick={() => { setExtra([]); setSteg('kväll'); }}>Ta bort</button>}
          <button style={s.x} onClick={() => { 
            // Markera som hanterad även vid avbryt
            if (extraMorgon && !extraMorgon.hanterad) {
              setExtraMorgon({ minuter: 0, hanterad: true });
              setSteg('dag');
            } else if (extraKväll && !extraKväll.hanterad) {
              setExtraKväll({ minuter: 0, hanterad: true });
              setSteg('kväll');
            } else {
              setSteg('kväll');
            }
          }}>Avbryt</button>
        </div>
      </div>
    );
  }

  // MÅNADSSAMMANFATTNING
  if (steg === 'månad') {
    const komp = öt - betald;
    return (
      <div style={{...s.c, background: 'linear-gradient(180deg, #1a1a2e 0%, #0f172a 100%)', color: '#fff'}}>
        <div style={s.t}><div style={{ display: 'flex', alignItems: 'center', gap: 16 }}><BackBtn onClick={() => setSteg('kväll')} dark /><h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Januari 2025</h1></div></div>
        <div style={{ flex: 1, paddingTop: 20, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 24, textAlign: 'center', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1.5px' }}>Mål</p>
              <p style={{ margin: '14px 0 0', fontSize: 40, fontWeight: 700 }}>{d.ska}</p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>timmar</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(34,197,94,0.15)', borderRadius: 20, padding: 24, textAlign: 'center', border: '1px solid rgba(34,197,94,0.25)' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1.5px' }}>Jobbat</p>
              <p style={{ margin: '14px 0 0', fontSize: 40, fontWeight: 700, color: '#4ade80' }}>{d.har}</p>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>timmar</p>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, height: 10, marginBottom: 12, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, (d.har / d.ska) * 100)}%`, background: 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)', borderRadius: 8 }} /></div>
          <p style={{ margin: '0 0 28px', fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontWeight: 500 }}>{Math.round((d.har / d.ska) * 100)}% av månadsmål</p>
          
          {öt > 0 && <div style={{ background: 'rgba(252,211,77,0.12)', borderRadius: 20, padding: 24, border: '1px solid rgba(252,211,77,0.25)' }}>
            <p style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#fcd34d', textAlign: 'center' }}>⏰ Övertid: {öt} timmar</p>
            
            {/* Visuell fördelningsstapel */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>💰 {betald} tim</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>🏖️ {komp} tim</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, height: 20, overflow: 'hidden', display: 'flex' }}>
                <div style={{ 
                  width: `${(betald / öt) * 100}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)',
                  borderRadius: betald === öt ? 10 : '10px 0 0 10px',
                  transition: 'width 0.3s ease'
                }} />
                <div style={{ 
                  width: `${(komp / öt) * 100}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, #06b6d4 0%, #22d3ee 100%)',
                  borderRadius: komp === öt ? 10 : '0 10px 10px 0',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
            
            {/* Betald kontroll */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 18, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 24 }}>💰</span><span style={{ fontSize: 16, fontWeight: 600 }}>Betald</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button onClick={() => setBetald(Math.max(0, betald - 1))} style={{ width: 42, height: 42, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 12, fontSize: 20, cursor: 'pointer', color: '#fff', fontWeight: 600 }}>−</button>
                <span style={{ fontSize: 28, fontWeight: 700, minWidth: 50, textAlign: 'center' }}>{betald}</span>
                <button onClick={() => setBetald(Math.min(öt, betald + 1))} style={{ width: 42, height: 42, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 12, fontSize: 20, cursor: 'pointer', color: '#fff', fontWeight: 600 }}>+</button>
              </div>
            </div>
            
            {/* Kompledigt (automatiskt) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 24 }}>🏖️</span><span style={{ fontSize: 16, fontWeight: 600 }}>Kompledigt</span></div>
              <span style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{komp}</span>
            </div>
            
            {/* Snabbval */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {[{ l: 'Allt betald', v: öt }, { l: 'Hälften', v: Math.round(öt / 2) }, { l: 'Allt komp', v: 0 }].map((b) => (
                <button key={b.l} onClick={() => setBetald(b.v)} style={{ padding: '10px 16px', background: betald === b.v ? '#fff' : 'rgba(255,255,255,0.08)', color: betald === b.v ? '#1d1d1f' : '#fff', border: 'none', borderRadius: 20, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' }}>{b.l}</button>
              ))}
            </div>
          </div>}
        </div>
        <div style={s.b}><button style={{...s.g, boxShadow: '0 4px 20px rgba(34,197,94,0.4)'}} onClick={() => setSteg('klar')}>Bekräfta och skicka</button></div>
      </div>
    );
  }

  // KLAR
  if (steg === 'klar') return (
    <div style={{...s.c, background: 'linear-gradient(180deg, #f8f8fa 0%, #e8e8ed 100%)'}}>
      <style>{pulseKeyframes}</style>
      <div style={s.t}><p style={{ margin: 0, fontSize: 14, color: '#86868b', fontWeight: 600 }}>{d.dag} {d.datum}</p></div>
      <div style={s.m}>
        <div style={{ width: 110, height: 110, borderRadius: '50%', background: 'linear-gradient(180deg, #34d058 0%, #22c55e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 36, boxShadow: '0 10px 40px rgba(34,197,94,0.35)', animation: 'checkPop 0.5s ease' }}>
          <span style={{ color: '#fff', fontSize: 52 }}>✓</span>
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.5px', animation: 'fadeIn 0.5s ease 0.2s both' }}>Tack {d.namn}!</h1>
        <p style={{ fontSize: 20, color: '#86868b', margin: 0, fontWeight: 500, animation: 'fadeIn 0.5s ease 0.3s both' }}>Ha en riktigt bra kväll</p>
        <div style={{ width: '100%', background: 'linear-gradient(135deg, rgba(252,211,77,0.15) 0%, rgba(252,211,77,0.08) 100%)', borderRadius: 20, padding: '20px 22px', marginTop: 44, display: 'flex', alignItems: 'center', gap: 18, border: '1px solid rgba(252,211,77,0.25)', animation: 'slideUp 0.5s ease 0.4s both' }}>
          <span style={{ fontSize: 36 }}>🦌</span>
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#92400e' }}>Kör försiktigt hem</p>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#a16207', fontWeight: 500 }}>Skymning – extra viltrisk</p>
          </div>
        </div>
      </div>
      <div style={s.b}><button style={s.x} onClick={() => { setKmMorgon(null); setKmKväll(null); setExtra([]); setÄndring(null); setStart('06:12'); setSlut('16:45'); setRast(30); setBetald(0); setGpsHem(null); setMomIn(null); setMomUt(null); setGpsHemKväll(null); setExtraMorgon(null); setExtraKväll(null); setDagTyp('normal'); setManuellBesk(''); setManuellRast(30); setTraktamente(null); setSteg('morgon'); }}>Börja om (demo)</button></div>
    </div>
  );

  return null;
}
