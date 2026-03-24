'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// === TYPES ===
interface Maskin {
  id: string;
  maskin_id: string;
  namn: string;
  typ: string;
  marke: string;
  modell: string;
  aktiv: boolean;
}

interface ServiceEntry {
  id: string;
  maskin_id: string;
  del: string;
  kategori: string;
  beskrivning: string;
  timmar: number | null;
  kostnad: number | null;
  utford_av: string | null;
  datum: string;
  skapad_at: string;
}

interface Paminnelse {
  id: string;
  maskin_id: string;
  typ: string;
  intervall_timmar: number;
  senast_utford_timmar: number;
  aktiv: boolean;
}

const KATEGORIER = [
  { value: 'service', label: 'Service', emoji: '🔧' },
  { value: 'hydraulik', label: 'Hydraulik', emoji: '💧' },
  { value: 'slang', label: 'Slang', emoji: '🔗' },
  { value: 'punktering', label: 'Punktering', emoji: '💥' },
  { value: 'motor', label: 'Motor', emoji: '⚙️' },
  { value: 'kran', label: 'Kran', emoji: '🏗️' },
  { value: 'aggregat', label: 'Aggregat', emoji: '🪚' },
  { value: 'elektrisk', label: 'Elektrisk', emoji: '⚡' },
  { value: 'ovrigt', label: 'Övrigt', emoji: '📋' },
];

// Zone definitions for the machine schematic
const ZONES: { id: string; label: string; defaultKategori: string; x: number; y: number; w: number; h: number }[] = [
  { id: 'kran', label: 'Kran', defaultKategori: 'kran', x: 440, y: 20, w: 320, h: 40 },
  { id: 'hytt', label: 'Hytt', defaultKategori: 'ovrigt', x: 260, y: 60, w: 120, h: 100 },
  { id: 'motor', label: 'Motor', defaultKategori: 'motor', x: 100, y: 80, w: 140, h: 80 },
  { id: 'hydraulik_fram', label: 'Hydraulik fram', defaultKategori: 'hydraulik', x: 180, y: 165, w: 60, h: 30 },
  { id: 'hydraulik_bak', label: 'Hydraulik bak', defaultKategori: 'hydraulik', x: 500, y: 165, w: 60, h: 30 },
  { id: 'vagn_fram', label: 'Vagn fram', defaultKategori: 'ovrigt', x: 60, y: 160, w: 200, h: 40 },
  { id: 'vagn_bak', label: 'Vagn bak', defaultKategori: 'ovrigt', x: 420, y: 160, w: 200, h: 40 },
  { id: 'aggregat', label: 'Aggregat', defaultKategori: 'aggregat', x: 710, y: 50, w: 80, h: 80 },
  { id: 'hjul_fl', label: 'Hjul FL', defaultKategori: 'punktering', x: 60, y: 200, w: 60, h: 60 },
  { id: 'hjul_fm', label: 'Hjul FM', defaultKategori: 'punktering', x: 140, y: 200, w: 60, h: 60 },
  { id: 'hjul_fr', label: 'Hjul FR', defaultKategori: 'punktering', x: 220, y: 200, w: 60, h: 60 },
  { id: 'hjul_bl', label: 'Hjul BL', defaultKategori: 'punktering', x: 420, y: 200, w: 60, h: 60 },
  { id: 'hjul_bm', label: 'Hjul BM', defaultKategori: 'punktering', x: 500, y: 200, w: 60, h: 60 },
  { id: 'hjul_br', label: 'Hjul BR', defaultKategori: 'punktering', x: 580, y: 200, w: 60, h: 60 },
];

function getZoneColor(zoneId: string, serviceEntries: ServiceEntry[], paminnelser: Paminnelse[], currentTimmar: number): string {
  const zoneEntries = serviceEntries.filter(e => e.del === zoneId);
  const zonePam = paminnelser.filter(p => p.typ === zoneId && p.aktiv);

  if (zonePam.length > 0) {
    for (const p of zonePam) {
      const timmarSedanService = currentTimmar - p.senast_utford_timmar;
      if (timmarSedanService >= p.intervall_timmar) return '#ff3b30'; // röd - försenad
      if (timmarSedanService >= p.intervall_timmar - 50) return '#ff9500'; // gul - snart
    }
  }
  if (zoneEntries.length > 0) return '#34c759'; // grön - ok
  return '#555'; // grå - ingen data
}

// === SVG Machine Schematic ===
function MaskinSchematic({ onZoneClick, zoneColors }: { onZoneClick: (zoneId: string) => void; zoneColors: Record<string, string> }) {
  return (
    <svg viewBox="0 0 800 280" style={{ width: '100%', height: 'auto' }}>
      {/* Bakgrund */}
      <rect x="0" y="0" width="800" height="280" fill="none" />

      {/* Chassi/vagn fram */}
      <rect x="60" y="140" width="240" height="60" rx="6" fill="#1a1a1a" stroke="#333" strokeWidth="1.5" />
      {/* Led/koppling */}
      <rect x="300" y="150" width="40" height="40" rx="4" fill="#222" stroke="#444" strokeWidth="1" />
      {/* Chassi/vagn bak */}
      <rect x="340" y="140" width="300" height="60" rx="6" fill="#1a1a1a" stroke="#333" strokeWidth="1.5" />

      {/* Motor */}
      <g onClick={() => onZoneClick('motor')} style={{ cursor: 'pointer' }}>
        <rect x="80" y="80" width="160" height="60" rx="8" fill={zoneColors['motor'] || '#555'} fillOpacity="0.25" stroke={zoneColors['motor'] || '#555'} strokeWidth="2" />
        <text x="160" y="106" textAnchor="middle" fill="#ccc" fontSize="11" fontWeight="600">MOTOR</text>
        <text x="160" y="122" textAnchor="middle" fill="#888" fontSize="9">⚙️</text>
      </g>

      {/* Hytt */}
      <g onClick={() => onZoneClick('hytt')} style={{ cursor: 'pointer' }}>
        <rect x="260" y="50" width="100" height="90" rx="10" fill={zoneColors['hytt'] || '#555'} fillOpacity="0.2" stroke={zoneColors['hytt'] || '#555'} strokeWidth="2" />
        {/* Fönster */}
        <rect x="270" y="58" width="80" height="40" rx="6" fill="none" stroke="#4488cc" strokeWidth="1.5" strokeOpacity="0.5" />
        <text x="310" y="116" textAnchor="middle" fill="#ccc" fontSize="11" fontWeight="600">HYTT</text>
      </g>

      {/* Kran */}
      <g onClick={() => onZoneClick('kran')} style={{ cursor: 'pointer' }}>
        <line x1="360" y1="80" x2="460" y2="40" stroke={zoneColors['kran'] || '#555'} strokeWidth="6" strokeLinecap="round" />
        <line x1="460" y1="40" x2="620" y2="30" stroke={zoneColors['kran'] || '#555'} strokeWidth="5" strokeLinecap="round" />
        <line x1="620" y1="30" x2="710" y2="60" stroke={zoneColors['kran'] || '#555'} strokeWidth="4" strokeLinecap="round" />
        {/* Led-punkter */}
        <circle cx="460" cy="40" r="6" fill="#222" stroke={zoneColors['kran'] || '#555'} strokeWidth="2" />
        <circle cx="620" cy="30" r="5" fill="#222" stroke={zoneColors['kran'] || '#555'} strokeWidth="2" />
        <text x="540" y="22" textAnchor="middle" fill="#ccc" fontSize="10" fontWeight="600">KRAN</text>
      </g>

      {/* Aggregat */}
      <g onClick={() => onZoneClick('aggregat')} style={{ cursor: 'pointer' }}>
        <rect x="700" y="45" width="70" height="70" rx="6" fill={zoneColors['aggregat'] || '#555'} fillOpacity="0.25" stroke={zoneColors['aggregat'] || '#555'} strokeWidth="2" />
        <line x1="715" y1="60" x2="755" y2="100" stroke="#888" strokeWidth="1.5" />
        <line x1="755" y1="60" x2="715" y2="100" stroke="#888" strokeWidth="1.5" />
        <text x="735" y="128" textAnchor="middle" fill="#ccc" fontSize="9" fontWeight="600">AGGREGAT</text>
      </g>

      {/* Hydraulik fram */}
      <g onClick={() => onZoneClick('hydraulik_fram')} style={{ cursor: 'pointer' }}>
        <rect x="170" y="145" width="70" height="20" rx="4" fill={zoneColors['hydraulik_fram'] || '#555'} fillOpacity="0.35" stroke={zoneColors['hydraulik_fram'] || '#555'} strokeWidth="1.5" />
        <text x="205" y="159" textAnchor="middle" fill="#ccc" fontSize="7">HYD.FRAM</text>
      </g>

      {/* Hydraulik bak */}
      <g onClick={() => onZoneClick('hydraulik_bak')} style={{ cursor: 'pointer' }}>
        <rect x="490" y="145" width="70" height="20" rx="4" fill={zoneColors['hydraulik_bak'] || '#555'} fillOpacity="0.35" stroke={zoneColors['hydraulik_bak'] || '#555'} strokeWidth="1.5" />
        <text x="525" y="159" textAnchor="middle" fill="#ccc" fontSize="7">HYD.BAK</text>
      </g>

      {/* Hjul fram FL, FM, FR */}
      {[
        { id: 'hjul_fl', cx: 100, label: 'FL' },
        { id: 'hjul_fm', cx: 180, label: 'FM' },
        { id: 'hjul_fr', cx: 260, label: 'FR' },
      ].map(h => (
        <g key={h.id} onClick={() => onZoneClick(h.id)} style={{ cursor: 'pointer' }}>
          <circle cx={h.cx} cy="225" r="25" fill="#111" stroke={zoneColors[h.id] || '#555'} strokeWidth="3" />
          <circle cx={h.cx} cy="225" r="16" fill="none" stroke="#333" strokeWidth="1" />
          <circle cx={h.cx} cy="225" r="5" fill="#333" />
          <text x={h.cx} y="260" textAnchor="middle" fill="#888" fontSize="8">{h.label}</text>
        </g>
      ))}

      {/* Hjul bak BL, BM, BR */}
      {[
        { id: 'hjul_bl', cx: 420, label: 'BL' },
        { id: 'hjul_bm', cx: 500, label: 'BM' },
        { id: 'hjul_br', cx: 580, label: 'BR' },
      ].map(h => (
        <g key={h.id} onClick={() => onZoneClick(h.id)} style={{ cursor: 'pointer' }}>
          <circle cx={h.cx} cy="225" r="25" fill="#111" stroke={zoneColors[h.id] || '#555'} strokeWidth="3" />
          <circle cx={h.cx} cy="225" r="16" fill="none" stroke="#333" strokeWidth="1" />
          <circle cx={h.cx} cy="225" r="5" fill="#333" />
          <text x={h.cx} y="260" textAnchor="middle" fill="#888" fontSize="8">{h.label}</text>
        </g>
      ))}

      {/* Vagn fram/bak klickzoner (osynliga) */}
      <rect x="60" y="145" width="100" height="50" fill="transparent" onClick={() => onZoneClick('vagn_fram')} style={{ cursor: 'pointer' }} />
      <rect x="400" y="145" width="80" height="50" fill="transparent" onClick={() => onZoneClick('vagn_bak')} style={{ cursor: 'pointer' }} />
    </svg>
  );
}

export default function MaskinServicePage() {
  const [view, setView] = useState<'lista' | 'maskin' | 'historik'>('lista');
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [selectedMaskin, setSelectedMaskin] = useState<Maskin | null>(null);
  const [serviceEntries, setServiceEntries] = useState<ServiceEntry[]>([]);
  const [paminnelser, setPaminnelser] = useState<Paminnelse[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTimmar, setCurrentTimmar] = useState(5000);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [formZone, setFormZone] = useState('');
  const [formKategori, setFormKategori] = useState('service');
  const [formBeskrivning, setFormBeskrivning] = useState('');
  const [formTimmar, setFormTimmar] = useState('');
  const [formKostnad, setFormKostnad] = useState('');
  const [formUtfordAv, setFormUtfordAv] = useState('');
  const [formDatum, setFormDatum] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  // Filter state for history
  const [filterKategori, setFilterKategori] = useState<string>('');

  const fetchData = useCallback(async () => {
    const { data: maskinRows } = await supabase.from('maskiner').select('*').eq('aktiv', true).order('namn');
    setMaskiner(maskinRows || []);

    const { data: sRows } = await supabase.from('maskin_service').select('*').order('datum', { ascending: false });
    setServiceEntries(sRows || []);

    const { data: pRows } = await supabase.from('service_paminnelser').select('*').eq('aktiv', true);
    setPaminnelser(pRows || []);

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectMaskin = (m: Maskin) => {
    setSelectedMaskin(m);
    setView('maskin');
  };

  const openForm = (zoneId: string) => {
    const zone = ZONES.find(z => z.id === zoneId);
    setFormZone(zoneId);
    setFormKategori(zone?.defaultKategori || 'ovrigt');
    setFormBeskrivning('');
    setFormTimmar(currentTimmar.toString());
    setFormKostnad('');
    setFormUtfordAv('');
    setFormDatum(new Date().toISOString().split('T')[0]);
    setFormOpen(true);
  };

  const saveService = async () => {
    if (!selectedMaskin || !formZone) return;
    setSaving(true);
    const { error } = await supabase.from('maskin_service').insert({
      maskin_id: selectedMaskin.id,
      del: formZone,
      kategori: formKategori,
      beskrivning: formBeskrivning,
      timmar: parseFloat(formTimmar) || null,
      kostnad: parseFloat(formKostnad) || 0,
      utford_av: formUtfordAv || null,
      datum: formDatum,
    });
    if (error) { console.error('Save error:', error); alert('Fel vid sparning: ' + error.message); }
    else { setFormOpen(false); await fetchData(); }
    setSaving(false);
  };

  // Get latest service per maskin
  const latestServicePerMaskin = (maskinId: string) => {
    return serviceEntries.find(e => e.maskin_id === maskinId);
  };

  // Count overdue reminders per maskin
  const overdueCount = (maskinId: string) => {
    return paminnelser.filter(p =>
      p.maskin_id === maskinId && p.aktiv && (currentTimmar - p.senast_utford_timmar >= p.intervall_timmar)
    ).length;
  };

  // Total overdue across all machines
  const totalOverdue = paminnelser.filter(p => p.aktiv && (currentTimmar - p.senast_utford_timmar >= p.intervall_timmar)).length;

  // Zone colors for selected machine
  const zoneColors: Record<string, string> = {};
  if (selectedMaskin) {
    const maskinEntries = serviceEntries.filter(e => e.maskin_id === selectedMaskin.id);
    const maskinPam = paminnelser.filter(p => p.maskin_id === selectedMaskin.id);
    ZONES.forEach(z => {
      zoneColors[z.id] = getZoneColor(z.id, maskinEntries, maskinPam, currentTimmar);
    });
  }

  // Filtered history
  const maskinHistory = selectedMaskin
    ? serviceEntries.filter(e => e.maskin_id === selectedMaskin.id && (!filterKategori || e.kategori === filterKategori))
    : [];
  const totalKostnad = maskinHistory.reduce((a, e) => a + (e.kostnad || 0), 0);

  if (loading) {
    return (
      <>
        <style jsx global>{styles}</style>
        <div className="ms-loading"><div className="ms-spinner" /><div>Laddar maskiner…</div></div>
      </>
    );
  }

  return (
    <>
      <style jsx global>{styles}</style>
      <div className="ms-page">
        <nav className="ms-nav">
          <button className={`ms-nav-pill ${view === 'lista' ? 'active' : ''}`} onClick={() => setView('lista')}>
            Maskiner{totalOverdue > 0 && <span className="ms-badge-inline">{totalOverdue}</span>}
          </button>
          <button className={`ms-nav-pill ${view === 'maskin' ? 'active' : ''}`} onClick={() => selectedMaskin && setView('maskin')} disabled={!selectedMaskin}>Maskinvy</button>
          <button className={`ms-nav-pill ${view === 'historik' ? 'active' : ''}`} onClick={() => selectedMaskin && setView('historik')} disabled={!selectedMaskin}>Historik</button>
        </nav>

        <div className="ms-container">
          {/* === MASKINLISTA === */}
          {view === 'lista' && (
            <>
              <header className="ms-header">
                <div className="ms-eyebrow">Underhåll</div>
                <h1 className="ms-title">Maskinservice</h1>
                <p className="ms-subtitle">{maskiner.length} maskiner • {serviceEntries.length} serviceåtgärder</p>
              </header>
              <div className="ms-machine-list">
                {maskiner.map(m => {
                  const latest = latestServicePerMaskin(m.id);
                  const overdue = overdueCount(m.id);
                  const maskinEntries = serviceEntries.filter(e => e.maskin_id === m.id);
                  const totalCost = maskinEntries.reduce((a, e) => a + (e.kostnad || 0), 0);
                  return (
                    <div key={m.id} className="ms-machine-card" onClick={() => selectMaskin(m)}>
                      <div className="ms-machine-icon">
                        {m.typ === 'skordare' ? (
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0a84ff" strokeWidth="1.5">
                            <rect x="3" y="8" width="14" height="8" rx="2" />
                            <circle cx="6" cy="16" r="2" /><circle cx="14" cy="16" r="2" />
                            <path d="M17 10l3-4" /><path d="M20 6l2 1" />
                          </svg>
                        ) : (
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="1.5">
                            <rect x="2" y="7" width="16" height="9" rx="2" />
                            <rect x="12" y="5" width="10" height="11" rx="2" />
                            <circle cx="5" cy="16" r="2" /><circle cx="15" cy="16" r="2" /><circle cx="19" cy="16" r="2" />
                          </svg>
                        )}
                      </div>
                      <div className="ms-machine-info">
                        <div className="ms-machine-name">{m.namn}</div>
                        <div className="ms-machine-meta">
                          {m.marke} {m.modell} • {maskinEntries.length} åtgärder
                          {totalCost > 0 && ` • ${Math.round(totalCost).toLocaleString('sv-SE')} kr`}
                        </div>
                        {latest && (
                          <div className="ms-machine-latest">
                            Senast: {KATEGORIER.find(k => k.value === latest.kategori)?.emoji} {latest.del.replace(/_/g, ' ')} — {new Date(latest.datum).toLocaleDateString('sv-SE')}
                          </div>
                        )}
                      </div>
                      {overdue > 0 && <div className="ms-badge-overdue">{overdue}</div>}
                      <span className="ms-chevron">›</span>
                    </div>
                  );
                })}
              </div>

              {/* Serviceöversikt */}
              {paminnelser.length > 0 && (
                <div className="ms-card" style={{ marginTop: 20 }}>
                  <div className="ms-section-title">Servicepåminnelser</div>
                  <div className="ms-section-sub">Baserat på timräknare ({currentTimmar} h)</div>
                  <div className="ms-reminder-list">
                    {paminnelser.filter(p => p.aktiv).map(p => {
                      const maskin = maskiner.find(m => m.id === p.maskin_id);
                      const timmarKvar = p.intervall_timmar - (currentTimmar - p.senast_utford_timmar);
                      const status = timmarKvar <= 0 ? 'overdue' : timmarKvar <= 50 ? 'soon' : 'ok';
                      return (
                        <div key={p.id} className={`ms-reminder ${status}`}>
                          <div className="ms-reminder-icon">{status === 'overdue' ? '🔴' : status === 'soon' ? '🟡' : '🟢'}</div>
                          <div className="ms-reminder-info">
                            <div className="ms-reminder-type">{p.typ.replace(/_/g, ' ')} — {maskin?.namn || '?'}</div>
                            <div className="ms-reminder-meta">
                              {status === 'overdue' ? `${Math.abs(Math.round(timmarKvar))} h försenad` : `${Math.round(timmarKvar)} h kvar`}
                              {' • '}var {p.intervall_timmar}:e timme
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timräknare */}
              <div className="ms-card" style={{ marginTop: 20 }}>
                <div className="ms-section-title">Timräknare</div>
                <div className="ms-timmar-input">
                  <input type="number" value={currentTimmar} onChange={e => setCurrentTimmar(parseInt(e.target.value) || 0)}
                    className="ms-input" style={{ width: '120px', textAlign: 'center', fontSize: '20px', fontWeight: 600 }} />
                  <span style={{ color: '#888', fontSize: 14 }}>drifttimmar</span>
                </div>
              </div>
            </>
          )}

          {/* === MASKINVY === */}
          {view === 'maskin' && selectedMaskin && (
            <>
              <header className="ms-header">
                <div className="ms-eyebrow">{selectedMaskin.marke} {selectedMaskin.modell}</div>
                <h1 className="ms-title">{selectedMaskin.namn}</h1>
                <p className="ms-subtitle">Tryck på en zon för att registrera åtgärd</p>
              </header>
              <div className="ms-card ms-schematic-card">
                <MaskinSchematic onZoneClick={openForm} zoneColors={zoneColors} />
                <div className="ms-legend">
                  <span><span className="ms-dot" style={{ background: '#34c759' }} />OK</span>
                  <span><span className="ms-dot" style={{ background: '#ff9500' }} />Snart service</span>
                  <span><span className="ms-dot" style={{ background: '#ff3b30' }} />Försenad</span>
                  <span><span className="ms-dot" style={{ background: '#555' }} />Ingen data</span>
                </div>
              </div>

              {/* Senaste åtgärder för denna maskin */}
              {serviceEntries.filter(e => e.maskin_id === selectedMaskin.id).length > 0 && (
                <div className="ms-card">
                  <div className="ms-section-title">Senaste åtgärder</div>
                  <div className="ms-entry-list">
                    {serviceEntries.filter(e => e.maskin_id === selectedMaskin.id).slice(0, 5).map(e => (
                      <div key={e.id} className="ms-entry">
                        <div className="ms-entry-emoji">{KATEGORIER.find(k => k.value === e.kategori)?.emoji || '📋'}</div>
                        <div className="ms-entry-info">
                          <div className="ms-entry-title">{e.del.replace(/_/g, ' ')} — {KATEGORIER.find(k => k.value === e.kategori)?.label}</div>
                          <div className="ms-entry-desc">{e.beskrivning}</div>
                          <div className="ms-entry-meta">{new Date(e.datum).toLocaleDateString('sv-SE')}{e.timmar ? ` • ${e.timmar} h` : ''}{e.kostnad ? ` • ${e.kostnad.toLocaleString('sv-SE')} kr` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="ms-btn-text" onClick={() => setView('historik')}>Visa all historik →</button>
                </div>
              )}
            </>
          )}

          {/* === HISTORIK === */}
          {view === 'historik' && selectedMaskin && (
            <>
              <header className="ms-header">
                <div className="ms-eyebrow">Historik</div>
                <h1 className="ms-title">{selectedMaskin.namn}</h1>
                <p className="ms-subtitle">{maskinHistory.length} åtgärder • {totalKostnad > 0 ? `${Math.round(totalKostnad).toLocaleString('sv-SE')} kr totalt` : 'Inga kostnader'}</p>
              </header>

              {/* Filter */}
              <div className="ms-filter-row">
                <button className={`ms-filter-pill ${filterKategori === '' ? 'active' : ''}`} onClick={() => setFilterKategori('')}>Alla</button>
                {KATEGORIER.map(k => (
                  <button key={k.value} className={`ms-filter-pill ${filterKategori === k.value ? 'active' : ''}`} onClick={() => setFilterKategori(k.value)}>
                    {k.emoji} {k.label}
                  </button>
                ))}
              </div>

              {/* Kostnadskort */}
              <div className="ms-stats-row">
                <div className="ms-stat">
                  <div className="ms-stat-value">{maskinHistory.length}</div>
                  <div className="ms-stat-label">Åtgärder</div>
                </div>
                <div className="ms-stat">
                  <div className="ms-stat-value">{Math.round(totalKostnad).toLocaleString('sv-SE')}</div>
                  <div className="ms-stat-label">kr totalt</div>
                </div>
                <div className="ms-stat">
                  <div className="ms-stat-value">{maskinHistory.length > 0 ? Math.round(totalKostnad / maskinHistory.length).toLocaleString('sv-SE') : 0}</div>
                  <div className="ms-stat-label">kr/åtgärd</div>
                </div>
              </div>

              {/* Historiklista */}
              <div className="ms-card">
                {maskinHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>Inga åtgärder{filterKategori ? ' i denna kategori' : ''}</div>
                ) : (
                  <div className="ms-entry-list">
                    {maskinHistory.map(e => (
                      <div key={e.id} className="ms-entry">
                        <div className="ms-entry-emoji">{KATEGORIER.find(k => k.value === e.kategori)?.emoji || '📋'}</div>
                        <div className="ms-entry-info">
                          <div className="ms-entry-title">{e.del.replace(/_/g, ' ')} — {KATEGORIER.find(k => k.value === e.kategori)?.label}</div>
                          {e.beskrivning && <div className="ms-entry-desc">{e.beskrivning}</div>}
                          <div className="ms-entry-meta">
                            {new Date(e.datum).toLocaleDateString('sv-SE')}
                            {e.timmar ? ` • ${e.timmar} h` : ''}
                            {e.kostnad ? ` • ${e.kostnad.toLocaleString('sv-SE')} kr` : ''}
                            {e.utford_av ? ` • ${e.utford_av}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* === FORMULÄR-MODAL === */}
        <div className={`ms-modal-overlay ${formOpen ? 'open' : ''}`} onClick={() => setFormOpen(false)}>
          <div className="ms-modal" onClick={e => e.stopPropagation()}>
            <div className="ms-modal-handle" />
            <div className="ms-modal-header">
              <div className="ms-modal-title">Ny åtgärd</div>
              <div className="ms-modal-sub">{selectedMaskin?.namn} — {ZONES.find(z => z.id === formZone)?.label || formZone}</div>
            </div>

            <div className="ms-form">
              <label className="ms-form-label">Kategori</label>
              <div className="ms-kategori-grid">
                {KATEGORIER.map(k => (
                  <button key={k.value} className={`ms-kategori-btn ${formKategori === k.value ? 'active' : ''}`} onClick={() => setFormKategori(k.value)}>
                    <span>{k.emoji}</span><span>{k.label}</span>
                  </button>
                ))}
              </div>

              <label className="ms-form-label">Beskrivning</label>
              <textarea className="ms-textarea" value={formBeskrivning} onChange={e => setFormBeskrivning(e.target.value)} placeholder="Vad gjordes?" rows={3} />

              <div className="ms-form-row">
                <div className="ms-form-field">
                  <label className="ms-form-label">Timräknare</label>
                  <input type="number" className="ms-input" value={formTimmar} onChange={e => setFormTimmar(e.target.value)} placeholder="h" />
                </div>
                <div className="ms-form-field">
                  <label className="ms-form-label">Kostnad (kr)</label>
                  <input type="number" className="ms-input" value={formKostnad} onChange={e => setFormKostnad(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="ms-form-row">
                <div className="ms-form-field">
                  <label className="ms-form-label">Utförd av</label>
                  <input type="text" className="ms-input" value={formUtfordAv} onChange={e => setFormUtfordAv(e.target.value)} placeholder="Namn" />
                </div>
                <div className="ms-form-field">
                  <label className="ms-form-label">Datum</label>
                  <input type="date" className="ms-input" value={formDatum} onChange={e => setFormDatum(e.target.value)} />
                </div>
              </div>

              <button className="ms-btn-save" onClick={saveService} disabled={saving}>
                {saving ? 'Sparar…' : 'Spara åtgärd'}
              </button>
            </div>

            <button className="ms-modal-close" onClick={() => setFormOpen(false)}>Avbryt</button>
          </div>
        </div>
      </div>
    </>
  );
}

// === STYLES ===
const styles = `
  :root{--bg:#0d0d0f;--card:#1c1c1e;--card2:#2c2c2e;--text:#fff;--text2:#ababab;--text3:#666;--blue:#0a84ff;--green:#30d158;--orange:#ff9f0a;--red:#ff453a;--border:rgba(255,255,255,0.08)}
  .ms-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;color:#888;background:var(--bg)}
  .ms-spinner{width:32px;height:32px;border:3px solid #333;border-top-color:var(--blue);border-radius:50%;animation:ms-spin 0.8s linear infinite;margin-bottom:16px}
  @keyframes ms-spin{to{transform:rotate(360deg)}}
  .ms-page{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased}
  .ms-nav{display:flex;justify-content:center;gap:8px;padding:12px 20px;background:rgba(28,28,30,0.9);backdrop-filter:blur(20px);position:sticky;top:56px;z-index:99;border-bottom:1px solid var(--border)}
  .ms-nav-pill{padding:8px 16px;border-radius:980px;font-size:14px;color:var(--text3);background:transparent;border:none;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:6px}
  .ms-nav-pill.active{background:var(--blue);color:#fff}
  .ms-nav-pill:disabled{opacity:0.3;cursor:default}
  .ms-badge-inline{background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:8px;min-width:16px;text-align:center}
  .ms-container{max-width:700px;margin:0 auto;padding:24px 16px 100px}
  .ms-header{text-align:center;margin-bottom:32px}
  .ms-eyebrow{font-size:12px;font-weight:600;color:var(--orange);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px}
  .ms-title{font-size:34px;font-weight:700;letter-spacing:-0.02em;line-height:1.1;margin-bottom:6px}
  .ms-subtitle{font-size:15px;color:var(--text2)}
  .ms-card{background:var(--card);border-radius:16px;padding:20px;margin-bottom:16px}
  .ms-schematic-card{padding:16px 8px;background:#111}
  .ms-section-title{font-size:18px;font-weight:600;margin-bottom:4px}
  .ms-section-sub{font-size:13px;color:var(--text3);margin-bottom:16px}

  .ms-machine-list{display:flex;flex-direction:column;gap:8px}
  .ms-machine-card{display:flex;align-items:center;gap:14px;padding:16px;background:var(--card);border-radius:16px;cursor:pointer;transition:background 0.15s}
  .ms-machine-card:active{background:var(--card2)}
  .ms-machine-icon{width:48px;height:48px;background:var(--card2);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ms-machine-info{flex:1;min-width:0}
  .ms-machine-name{font-size:16px;font-weight:600;margin-bottom:2px}
  .ms-machine-meta{font-size:12px;color:var(--text3)}
  .ms-machine-latest{font-size:12px;color:var(--text2);margin-top:4px}
  .ms-badge-overdue{background:var(--red);color:#fff;font-size:11px;font-weight:700;width:22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .ms-chevron{color:var(--text3);font-size:20px;flex-shrink:0}

  .ms-legend{display:flex;justify-content:center;gap:16px;margin-top:12px;font-size:11px;color:var(--text3)}
  .ms-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}

  .ms-entry-list{display:flex;flex-direction:column}
  .ms-entry{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border)}
  .ms-entry:last-child{border-bottom:none}
  .ms-entry-emoji{font-size:24px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--card2);border-radius:10px;flex-shrink:0}
  .ms-entry-info{flex:1;min-width:0}
  .ms-entry-title{font-size:14px;font-weight:600}
  .ms-entry-desc{font-size:13px;color:var(--text2);margin-top:2px}
  .ms-entry-meta{font-size:12px;color:var(--text3);margin-top:4px}
  .ms-btn-text{background:none;border:none;color:var(--blue);font-size:14px;cursor:pointer;padding:12px 0 0;font-weight:500}

  .ms-filter-row{display:flex;gap:6px;overflow-x:auto;padding-bottom:16px;margin-bottom:8px;-webkit-overflow-scrolling:touch}
  .ms-filter-pill{padding:6px 14px;border-radius:20px;font-size:12px;color:var(--text2);background:var(--card);border:1px solid var(--border);cursor:pointer;white-space:nowrap;transition:all 0.15s}
  .ms-filter-pill.active{background:var(--blue);color:#fff;border-color:var(--blue)}

  .ms-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
  .ms-stat{text-align:center;padding:16px 8px;background:var(--card);border-radius:14px}
  .ms-stat-value{font-size:24px;font-weight:700;line-height:1}
  .ms-stat-label{font-size:11px;color:var(--text3);margin-top:6px}

  .ms-reminder-list{display:flex;flex-direction:column;gap:8px}
  .ms-reminder{display:flex;align-items:center;gap:12px;padding:12px;background:var(--card2);border-radius:12px}
  .ms-reminder.overdue{border-left:3px solid var(--red)}
  .ms-reminder.soon{border-left:3px solid var(--orange)}
  .ms-reminder.ok{border-left:3px solid var(--green)}
  .ms-reminder-icon{font-size:18px}
  .ms-reminder-info{flex:1}
  .ms-reminder-type{font-size:14px;font-weight:500}
  .ms-reminder-meta{font-size:12px;color:var(--text3);margin-top:2px}

  .ms-timmar-input{display:flex;align-items:center;gap:12px;justify-content:center;padding:12px 0}

  /* Modal */
  .ms-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s}
  .ms-modal-overlay.open{opacity:1;pointer-events:auto}
  .ms-modal{background:var(--card);width:100%;max-width:500px;max-height:90vh;border-radius:20px 20px 0 0;padding:16px 20px 34px;transform:translateY(100%);transition:transform 0.3s ease-out;overflow-y:auto}
  .ms-modal-overlay.open .ms-modal{transform:translateY(0)}
  .ms-modal-handle{width:36px;height:4px;background:#444;border-radius:2px;margin:0 auto 12px}
  .ms-modal-header{text-align:center;margin-bottom:20px}
  .ms-modal-title{font-size:20px;font-weight:700}
  .ms-modal-sub{font-size:13px;color:var(--text2);margin-top:4px}

  .ms-form{display:flex;flex-direction:column;gap:12px}
  .ms-form-label{font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px}
  .ms-kategori-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .ms-kategori-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;background:var(--card2);border:2px solid transparent;border-radius:12px;font-size:11px;color:var(--text2);cursor:pointer;transition:all 0.15s}
  .ms-kategori-btn.active{border-color:var(--blue);background:rgba(10,132,255,0.15);color:#fff}
  .ms-kategori-btn span:first-child{font-size:20px}
  .ms-input{width:100%;padding:12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;font-size:15px;color:#fff;outline:none}
  .ms-input:focus{border-color:var(--blue)}
  .ms-textarea{width:100%;padding:12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;font-size:15px;color:#fff;outline:none;resize:vertical;font-family:inherit}
  .ms-textarea:focus{border-color:var(--blue)}
  .ms-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .ms-form-field{display:flex;flex-direction:column}
  .ms-btn-save{padding:14px;background:var(--blue);color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px}
  .ms-btn-save:disabled{opacity:0.5;cursor:default}
  .ms-modal-close{display:block;width:100%;padding:14px;margin-top:12px;background:var(--card2);border:none;border-radius:12px;font-size:15px;color:var(--text2);cursor:pointer}

  @media(max-width:480px){.ms-title{font-size:28px}.ms-kategori-grid{grid-template-columns:repeat(3,1fr)}}
`;
