'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { signeraKartfil } from '@/lib/kartfiler';
import PageContainer from '@/components/PageContainer';
import proj4 from 'proj4';
import { TreePine, Trees } from 'lucide-react';

// SWEREF99 TM (EPSG:3006) → WGS84 — samma logik som /api/import-trakt
const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
function sweref99ToWgs84(n: number, e: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [e, n]);
  return { lat, lng };
}

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

// Visningsnormalisering av bolagsnamn (rör INTE DB-värdet): title-case, men behåll
// korta versala akronymer (ATA/JGA). T.ex. "VIDA" → "Vida", "ATA" → "ATA".
const cap = (s: string) => (s || '').split(' ').map(w =>
  (w.length <= 3 && w === w.toUpperCase()) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
).join(' ');

// Läs-rad för traktfakta (lugn text, ej input)
function Las({ label, value, color }: { label: string; value?: string | number | null; color?: string }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '15px', color: color || '#fff' }}>{(value === '' || value == null) ? '—' : value}</div>
    </div>
  );
}

// Demo-data
const DEMO_IMPORT = {
  voNummer: '11080935', traktNr: '883907', namn: 'Lönsbygd AU 2025', bolag: 'Vida',
  inkopare: 'Jan-Erik Gustafsson', inkoparetel: '070-2327410',
  markagare: 'Agneta Ragnarsson', markagaretel: '0705430793', markagareepost: 'agnetha.ragnarsson@telia.com',
  cert: '', typ: 'slut', volym: '565', areal: '1.7', grot: true,
  koordinatX: '6264879', koordinatY: '482509',
  sortiment: ['Tall timmer · Urshult', 'Tall timmer · Vislanda', 'Gran timmer · Urshult', 'Gran timmer · Vislanda', 'Kubb · Tall', 'Kubb · Gran', 'Massa · Barr', 'Massa · Björk', 'Energi · Bränsleved'],
  anteckningar: 'Fornåkrar över hela ytan.'
};

export default function ObjektPage() {
  return <Suspense fallback={null}><ObjektPageInner /></Suspense>;
}

function ObjektPageInner() {
  // Förval av månad från URL (?ar=&manad=), t.ex. från helikopter-guiden. Fallback: innevarande månad.
  const sp = useSearchParams();
  const arParam = parseInt(sp.get('ar') || '');
  const manadParam = parseInt(sp.get('manad') || '');
  const [year, setYear] = useState(Number.isFinite(arParam) ? arParam : new Date().getFullYear());
  const [month, setMonth] = useState(Number.isFinite(manadParam) && manadParam >= 1 && manadParam <= 12 ? manadParam - 1 : new Date().getMonth()); // 0-index
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [ejPlanOpen, setEjPlanOpen] = useState(false);


  const [objekt, setObjekt] = useState<any[]>([]);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('objekt')
      .select('*')
      .order('ar', { ascending: true })
      .order('manad', { ascending: true })
      .order('ordning', { ascending: true });

    if (error) {
      console.error('Fetch error:', error);
      return;
    }

    setObjekt(data || []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Beställningar för vald månad — riktiga bestallningar-tabellen (samma källa som helikoptervyn)
  const [bestallningar, setBestallningar] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('bestallningar')
        .select('typ, volym')
        .eq('ar', year)
        .eq('manad', month + 1);
      if (error) { console.error('Beställningar-hämtning misslyckades:', error); setBestallningar([]); return; }
      setBestallningar(data || []);
    })();
  }, [year, month]);

  const [form, setForm] = useState({ 
    voNummer: '', traktNr: '', namn: '', bolag: '', 
    inkopare: '', inkoparetel: '', markagare: '', markagaretel: '', markagareepost: '',
    cert: '', typ: 'slut', atgard: '', volym: '', areal: '', grot: false,
    maskiner: [] as string[], koordinatX: '', koordinatY: '',
    sortiment: [] as string[], anteckningar: '',
    ar: 2026, manad: 1, ordning: 1, status: 'planerad'
  });

  // Rätta-läge per traktinfo-sektion (null = läs), och dokument-URL:er för knapparna
  const [rattaSektion, setRattaSektion] = useState<string | null>(null);
  const [dokUrls, setDokUrls] = useState<{ td: string | null; sl: string | null }>({ td: null, sl: null });

  const [sparadeBolag, setSparadeBolag] = useState(['Vida', 'Södra', 'ATA', 'JGA', 'Rönås', 'Privat']);
  const [sparadeMaskiner, setSparadeMaskiner] = useState(['PONSSE Scorpion Giant 8W', 'Wisent 2015', 'Elephant King AF', 'Rottne']);
  const [sparadeAtgarder, setSparadeAtgarder] = useState<Record<string, string[]>>({ 
    slut: ['Rp', 'Lrk', 'Au', 'VF/BarkB'], 
    gallring: ['Första gallring', 'Andra gallring', 'Gallring'] 
  });
  const [sparadeCert, setSparadeCert] = useState(['FSC', 'PEFC', 'FSC PEFC', 'Ej certifierad']);
  const [sparadeSortiment, setSparadeSortiment] = useState([
    { group: 'Tall timmer', items: ['Urshult', 'Vislanda'] },
    { group: 'Gran timmer', items: ['Urshult', 'Vislanda'] },
    { group: 'Kubb', items: ['Tall', 'Gran'] },
    { group: 'Massa', items: ['Barr', 'Björk'] },
    { group: 'Energi', items: ['Bränsleved'] },
  ]);

  const [editMode, setEditMode] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [expandedSection, setExpandedSection] = useState('grund');

  useEffect(() => {
    setAnimated(false);
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, [month, year]);

  // status='avslutat' döljs ur hela aktiva vyn — samma villkor som planeringsvyns
  // ObjektValjare (oplanerade/planerade exkluderar avslutade; de hör hemma i avslut-vyn).
  const planerade = objekt.filter(o => o.ar === year && o.manad === month + 1 && o.status !== 'avslutat');
  const oplanerade = objekt.filter(o => (!o.ar || !o.manad) && o.status !== 'avslutat');
  const typFarg = form.typ === 'slut' ? '#eab308' : '#22c55e';

  const slutObj = planerade.filter(o => o.typ === 'slutavverkning');
  const gallObj = planerade.filter(o => o.typ === 'gallring');
  const slutTotal = slutObj.reduce((s, o) => s + (o.volym || 0), 0);
  const gallTotal = gallObj.reduce((s, o) => s + (o.volym || 0), 0);
  const slutBest = bestallningar.filter(b => b.typ === 'slutavverkning').reduce((s, b) => s + (Number(b.volym) || 0), 0);
  const gallBest = bestallningar.filter(b => b.typ === 'gallring').reduce((s, b) => s + (Number(b.volym) || 0), 0);

  const bytManad = (dir: number) => {
    let m = month + dir, y = year;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setMonth(m); setYear(y);
  };

  const handleZipImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Läser traktdirektiv...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ar', year.toString());
      formData.append('manad', (month + 1).toString());

      const res = await fetch('/api/import-trakt', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setImportStatus('⚠ Objektet finns redan');
        } else {
          setImportStatus(`Fel: ${data.error || 'Import misslyckades'}`);
        }
        setTimeout(() => setImportStatus(''), 4000);
        return;
      }

      // Importen persisterar redan server-side (/api/import-trakt) → hämta om från
      // DB så listan får den riktiga raden (rätt uuid), inte en optimistisk lokal-add.
      await fetchData();
      setImportStatus('✓ Importerat!');
      setTimeout(() => setImportStatus(''), 2000);

    } catch (error) {
      console.error('Import error:', error);
      setImportStatus('Fel: Kunde inte importera');
      setTimeout(() => setImportStatus(''), 3000);
    }

    // Återställ input så samma fil kan väljas igen
    e.target.value = '';
  };

  const saveObj = async () => {
    if (!form.namn || !form.bolag || !form.volym) {
      alert('Fyll i namn, bolag och volym');
      return;
    }

    // Koordinater: konvertera SWEREF99 TM → WGS84 (samma som import-routen).
    // Vid redigering laddas lat/lng (WGS84, små tal) tillbaka i fälten → konvertera inte då.
    let lat: number | null = null, lng: number | null = null;
    const kx = parseFloat(form.koordinatX), ky = parseFloat(form.koordinatY);
    if (Number.isFinite(kx) && Number.isFinite(ky)) {
      if (Math.abs(kx) > 1000) {        // SWEREF99 TM (northing/easting)
        const c = sweref99ToWgs84(kx, ky); lat = c.lat; lng = c.lng;
      } else {                          // redan WGS84 (lat/lng)
        lat = kx; lng = ky;
      }
    }

    const rad = {
      vo_nummer: form.voNummer || null, traktnr: form.traktNr || null,
      namn: form.namn, bolag: form.bolag,
      inkopare: form.inkopare || null, inkopare_tel: form.inkoparetel || null,
      markagare: form.markagare || null, markagare_tel: form.markagaretel || null, markagare_epost: form.markagareepost || null,
      cert: form.cert || null, typ: form.typ === 'slut' ? 'slutavverkning' : 'gallring',
      atgard: form.atgard || null, volym: parseInt(form.volym),
      areal: form.areal ? parseFloat(form.areal) : null, grot: form.grot,
      // status utelämnas medvetet → DB-default 'planerad' vid insert, oförändrad vid
      // update. Status styrs av planeringsvyn, inte detta formulär (objekt_status_check).
      lat, lng,
      sortiment: form.sortiment, anteckningar: form.anteckningar || null,
      // maskiner + ordning skrivs INTE härifrån — de ägs av planeringsvyn (strikt separation).
      ar: form.manad === 0 ? null : form.ar, manad: form.manad === 0 ? null : form.manad,
    };

    // Skriv via inloggad session (lib/supabase) — authenticated-policyerna släpper igenom.
    const { error } = editingId
      ? await supabase.from('objekt').update(rad).eq('id', editingId)
      : await supabase.from('objekt').insert(rad);

    if (error) {
      console.error('Spara misslyckades:', error);
      alert('Kunde inte spara: ' + error.message);
      return;
    }

    setShowForm(false);
    setImportStatus('');
    setEditMode(null);
    setShowAdd(null);
    fetchData();
  };

  const editObj = (obj: any) => {
    setForm({
      voNummer: obj.vo_nummer || '', traktNr: obj.traktnr || '', namn: obj.namn, bolag: obj.bolag,
      inkopare: obj.inkopare || '', inkoparetel: obj.inkopare_tel || '',
      markagare: obj.markagare || '', markagaretel: obj.markagare_tel || '', markagareepost: obj.markagare_epost || '',
      cert: obj.cert || '', typ: obj.typ === 'slutavverkning' ? 'slut' : 'gallring',
      atgard: obj.atgard || '', volym: obj.volym?.toString() || '',
      areal: obj.areal?.toString() || '', grot: obj.grot || false,
      maskiner: obj.maskiner || [], koordinatX: obj.lat?.toString() || '', koordinatY: obj.lng?.toString() || '',
      sortiment: obj.sortiment || [], anteckningar: obj.anteckningar || '',
      ar: obj.ar || year, manad: obj.manad || 0, ordning: obj.ordning || 1, status: obj.status || 'planerad'
    });
    setDokUrls({ td: obj.traktdirektiv_url || null, sl: obj.stamplingslangd_url || null });
    setRattaSektion(null);
    setEditingId(obj.id);
    setImportStatus('');
    setExpandedSection(''); // traktinfo-raderna kollapsade vid redigering — lugnt undanstoppat
    setEditMode(null);
    setShowAdd(null);
    setShowForm(true);
  };

  const deleteObj = async () => {
    if (!editingId || !confirm('Ta bort objektet?')) return;

    console.log('Tar bort objekt:', editingId);

    const { error } = await supabase
      .from('objekt')
      .delete()
      .eq('id', editingId);

    if (error) {
      console.error('Delete error:', error);
      alert('Kunde inte ta bort objektet');
      return;
    }

    console.log('Borttaget från Supabase');
    setShowForm(false);
    setEditingId(null);
    fetchData();
  };

  const toggleSortiment = (name: string) => {
    if (form.sortiment.includes(name)) setForm({ ...form, sortiment: form.sortiment.filter(s => s !== name) });
    else setForm({ ...form, sortiment: [...form.sortiment, name] });
  };

  // === KOMPONENTER ===
  const Arc = ({ percent, size = 110, color }: { percent: number; size?: number; color: string }) => {
    const stroke = 6;
    const r = (size - stroke) / 2;
    const circ = r * 2 * Math.PI;
    const animatedPercent = animated ? Math.min(percent, 100) : 0;
    const offset = circ - (animatedPercent / 100) * circ;
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)', filter: `drop-shadow(0 0 4px ${color})` }} />
      </svg>
    );
  };

  const AnimatedNumber = ({ value }: { value: number }) => {
    const [displayValue, setDisplayValue] = useState(0);
    useEffect(() => {
      if (!animated) { setDisplayValue(0); return; }
      const startTime = Date.now();
      const animate = () => {
        const progress = Math.min((Date.now() - startTime) / 1500, 1);
        setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }, [animated, value]);
    return <>{displayValue}</>;
  };

  // Tunn hopfällbar rad för traktinfo — lugn lista, underordnad planeringen
  const Rad = ({ title, id, children }: { title: string; id: string; children: React.ReactNode }) => {
    const isOpen = expandedSection === id;
    return (
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={() => setExpandedSection(isOpen ? '' : id)}
          style={{ width: '100%', padding: '14px 2px', background: 'none', border: 'none',
            color: isOpen ? '#fff' : 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: '500',
            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title}
          <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.3, fontSize: '11px' }}>▼</span>
        </button>
        {isOpen && (
          <div style={{ padding: '2px 2px 18px' }}>{children}</div>
        )}
      </div>
    );
  };

  const InputField = ({ label, value, onChange, placeholder, type = 'text' }: any) => (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px' }}>{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '15px', color: '#fff', boxSizing: 'border-box' }} />
    </div>
  );

  const ChipSelect = ({ items, selected, onSelect, label, editKey, onAdd, onRemove, multi = false }: any) => {
    const isEditing = editMode === editKey;
    const isAdding = showAdd === editKey;
    const isSelected = (item: string) => multi ? (selected || []).includes(item) : selected === item;
    const handleSelect = (item: string) => {
      if (isEditing) return;
      if (multi) {
        if (isSelected(item)) onSelect(selected.filter((s: string) => s !== item));
        else onSelect([...(selected || []), item]);
      } else onSelect(item);
    };
    const handleAdd = () => {
      if (newValue.trim() && !items.includes(newValue.trim())) {
        onAdd(newValue.trim());
        if (!multi) onSelect(newValue.trim());
      }
      setNewValue(''); setShowAdd(null);
    };
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '600', letterSpacing: '0.5px' }}>{label}</label>
          <button onClick={() => setEditMode(isEditing ? null : editKey)}
            style={{ background: 'none', border: 'none', fontSize: '11px', color: isEditing ? '#ef4444' : 'rgba(255,255,255,0.2)', cursor: 'pointer' }}>
            {isEditing ? 'Klar' : 'Ändra'}
          </button>
        </div>
        {isAdding ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="Lägg till..." autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
            <button onClick={handleAdd} style={{ padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
            <button onClick={() => { setShowAdd(null); setNewValue(''); }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {items.map((item: string) => (
              <button key={item} onClick={() => handleSelect(item)}
                style={{
                  padding: '10px 16px', borderRadius: '10px', border: 'none',
                  background: isSelected(item) ? '#fff' : 'rgba(255,255,255,0.06)',
                  color: isSelected(item) ? '#000' : 'rgba(255,255,255,0.4)',
                  fontSize: '14px', fontWeight: '500', cursor: isEditing ? 'default' : 'pointer',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                {item}
                {isEditing && (
                  <span onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                    style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#fff', cursor: 'pointer' }}>✕</span>
                )}
              </button>
            ))}
            <button onClick={() => setShowAdd(editKey)}
              style={{ padding: '10px 16px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.2)', fontSize: '14px', cursor: 'pointer' }}>+</button>
          </div>
        )}
      </div>
    );
  };

  const SortimentSelector = ({ selected, onToggle }: { selected: string[]; onToggle: (name: string) => void }) => {
    const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
    const [newItemValue, setNewItemValue] = useState('');
    const [addingGroup, setAddingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const handleAddItem = (gi: number) => {
      if (newItemValue.trim()) { const u = [...sparadeSortiment]; u[gi].items.push(newItemValue.trim()); setSparadeSortiment(u); setNewItemValue(''); setAddingToGroup(null); }
    };
    const handleRemoveItem = (gi: number, item: string) => {
      const u = [...sparadeSortiment]; u[gi].items = u[gi].items.filter(i => i !== item); setSparadeSortiment(u);
      const fullId = u[gi].group + ' · ' + item; if (selected.includes(fullId)) onToggle(fullId);
    };
    const handleRemoveGroup = (gi: number) => setSparadeSortiment(sparadeSortiment.filter((_, i) => i !== gi));
    const handleAddGroup = () => { if (newGroupName.trim()) { setSparadeSortiment([...sparadeSortiment, { group: newGroupName.trim(), items: [] }]); setNewGroupName(''); setAddingGroup(false); } };
    const isEditing = editMode === 'sortiment';
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '600', letterSpacing: '0.5px' }}>SORTIMENT</label>
          <button onClick={() => setEditMode(isEditing ? null : 'sortiment')}
            style={{ background: 'none', border: 'none', fontSize: '11px', color: isEditing ? '#ef4444' : 'rgba(255,255,255,0.2)', cursor: 'pointer' }}>
            {isEditing ? 'Klar' : 'Ändra'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {sparadeSortiment.map(({ group, items }, gi) => (
            <div key={group}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{group}</div>
                {isEditing && <button onClick={() => handleRemoveGroup(gi)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer' }}>Ta bort</button>}
              </div>
              {addingToGroup === gi ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={newItemValue} onChange={e => setNewItemValue(e.target.value)} placeholder="Lägg till..." autoFocus onKeyDown={e => e.key === 'Enter' && handleAddItem(gi)}
                    style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                  <button onClick={() => handleAddItem(gi)} style={{ padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
                  <button onClick={() => { setAddingToGroup(null); setNewItemValue(''); }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {items.map(item => {
                    const fullId = group + ' · ' + item;
                    const isActive = selected.includes(fullId);
                    return (
                      <button key={item} onClick={() => !isEditing && onToggle(fullId)}
                        style={{ padding: '12px 20px', borderRadius: '10px', border: 'none',
                          background: isActive ? '#fff' : 'rgba(255,255,255,0.06)',
                          color: isActive ? '#000' : 'rgba(255,255,255,0.4)',
                          fontSize: '14px', fontWeight: '500', cursor: isEditing ? 'default' : 'pointer',
                          transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item}
                        {isEditing && <span onClick={(e) => { e.stopPropagation(); handleRemoveItem(gi, item); }}
                          style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#fff', cursor: 'pointer' }}>✕</span>}
                      </button>
                    );
                  })}
                  <button onClick={() => setAddingToGroup(gi)}
                    style={{ padding: '12px 20px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.2)', fontSize: '14px', cursor: 'pointer' }}>+</button>
                </div>
              )}
            </div>
          ))}
          {addingGroup ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Ny sortimentsgrupp..." autoFocus onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
              <button onClick={handleAddGroup} style={{ padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
              <button onClick={() => { setAddingGroup(false); setNewGroupName(''); }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)}
              style={{ padding: '14px', borderRadius: '10px', border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.2)', fontSize: '14px', cursor: 'pointer', width: '100%' }}>
              + Lägg till sortimentsgrupp
            </button>
          )}
        </div>
      </div>
    );
  };

  const addBolag = (v: string) => setSparadeBolag([...sparadeBolag, v]);
  const removeBolag = (v: string) => { setSparadeBolag(sparadeBolag.filter(b => b !== v)); if (form.bolag === v) setForm({ ...form, bolag: '' }); };
  const addCert = (v: string) => setSparadeCert([...sparadeCert, v]);
  const removeCert = (v: string) => { setSparadeCert(sparadeCert.filter(c => c !== v)); if (form.cert === v) setForm({ ...form, cert: '' }); };
  const addAtgard = (v: string) => setSparadeAtgarder({ ...sparadeAtgarder, [form.typ]: [...sparadeAtgarder[form.typ], v] });
  const removeAtgard = (v: string) => { setSparadeAtgarder({ ...sparadeAtgarder, [form.typ]: sparadeAtgarder[form.typ].filter(a => a !== v) }); if (form.atgard === v) setForm({ ...form, atgard: '' }); };
  const addMaskin = (v: string) => setSparadeMaskiner([...sparadeMaskiner, v]);
  const removeMaskin = (v: string) => { setSparadeMaskiner(sparadeMaskiner.filter(m => m !== v)); setForm({ ...form, maskiner: form.maskiner.filter(m => m !== v) }); };

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      
      <PageContainer width="smal">
      {/* Header */}
      <div style={{ padding: '20px 0 12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontWeight: '600', letterSpacing: '1.5px' }}>KOMPERSMÅLA SKOG</div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginTop: '4px', letterSpacing: '-1px' }}>Objekt</div>
      </div>

      {/* Import */}
      <div style={{ padding: '0 0 16px' }}>
        <input
          type="file"
          id="zip-import"
          accept=".zip"
          onChange={handleZipImport}
          style={{ display: 'none' }}
        />
        <label
          htmlFor="zip-import"
          style={{
            width: '100%', padding: '14px', background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '12px',
            color: importStatus ? (importStatus.includes('✓') ? 'rgba(255,255,255,0.6)' : importStatus.includes('Fel') ? '#ef4444' : 'rgba(255,255,255,0.4)') : 'rgba(255,255,255,0.3)',
            fontSize: '14px', fontWeight: '500', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxSizing: 'border-box'
          }}>
          {importStatus || 'Importera traktdirektiv (.zip)'}
        </label>
      </div>

      {/* Ej planerad — skyddsnät: periodlösa objekt (ar/manad = null). Hopfällbar; default hopfälld vid > 3. */}
      {oplanerade.length > 0 && (() => {
        const many = oplanerade.length > 3;
        const open = many ? ejPlanOpen : true;
        return (
          <div style={{ marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: open ? '8px' : '0' }}>
            <button onClick={() => many && setEjPlanOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: '10px 0', cursor: many ? 'pointer' : 'default' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ej planerad ({oplanerade.length})</span>
              {many && <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>}
            </button>
            {open && oplanerade.map(obj => (
              <div key={obj.id} onClick={() => editObj(obj)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                <div style={{ width: '3px', height: '32px', borderRadius: '2px', flexShrink: 0, background: obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e', opacity: (obj.lat && obj.lng) ? 0.8 : 0.15 }} />
                <div style={{ minWidth: 0, flexShrink: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: '500', color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.namn}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cap(obj.bolag)}{obj.atgard && ` · ${obj.atgard}`}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flexShrink: 0 }}>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>{obj.volym}</span>
                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>m³fub</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '15px', marginLeft: '2px' }}>›</span>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Månadsväljare */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0 16px', gap: '24px' }}>
        <button onClick={() => bytManad(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>‹</button>
        <span style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.3px' }}>{MANADER[month]} {year}</span>
        <button onClick={() => bytManad(1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>›</button>
      </div>

      {/* Sammanfattning — planerat (objekt) vs beställt per typ. Klick = skapa
          nytt objekt via Starta jobb (EN födelseväg — /objekt planerar bara). */}
      <div style={{ background: '#1c1c1e', borderRadius: '14px', padding: '2px 16px', marginBottom: '20px' }}>
        {[
          { typ: 'slut', namn: 'Slutavverkning', Ikon: TreePine, farg: '#eab308', plan: slutTotal, best: slutBest },
          { typ: 'gallring', namn: 'Gallring', Ikon: Trees, farg: '#22c55e', plan: gallTotal, best: gallBest },
        ].map((rad, i) => {
          const Ikon = rad.Ikon;
          const pct = rad.best > 0 ? Math.min(100, (rad.plan / rad.best) * 100) : 0;
          return (
            <div key={rad.typ} onClick={() => { window.location.href = '/starta-jobb'; }}
              style={{ padding: '14px 0', cursor: 'pointer', borderTop: i === 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Ikon size={18} color={rad.farg} strokeWidth={2} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>{rad.namn}</span>
                </div>
                <div style={{ fontSize: '15px' }}>
                  <span style={{ color: rad.farg, fontWeight: '700' }}>{Math.round(rad.plan).toLocaleString('sv-SE')}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)' }}> / {Math.round(rad.best).toLocaleString('sv-SE')} m³fub</span>
                </div>
              </div>
              <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: rad.farg, borderRadius: '3px', transition: 'width 0.6s ease' }} />
              </div>
            </div>
          );
        })}
      </div>


      {/* Objektlista */}
      <div>
        {planerade.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.2)' }}>
            Inga objekt för {MANADER[month]}
          </div>
        ) : (
          planerade.map(obj => (
            <div key={obj.id} onClick={() => editObj(obj)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
              {/* Typstreck */}
              <div style={{ width: '3px', height: '32px', borderRadius: '2px', flexShrink: 0, background: obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e', opacity: (obj.lat && obj.lng) ? 0.8 : 0.15 }} />
              {/* Namn + bolag·åtgärd */}
              <div style={{ minWidth: 0, flexShrink: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: '500', color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.namn}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cap(obj.bolag)}{obj.atgard && ` · ${obj.atgard}`}</div>
              </div>
              {/* Volym + enhet + chevron, direkt efter namnet */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flexShrink: 0 }}>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>{obj.volym}</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>m³fub</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '15px', marginLeft: '2px' }}>›</span>
              </div>
            </div>
          ))
        )}
      </div>
      </PageContainer>

      {/* Formulär */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', justifyContent: 'center', zIndex: 100 }} 
          onClick={() => { setShowForm(false); setImportStatus(''); setEditMode(null); setShowAdd(null); }}>
          <div style={{ background: '#000', width: '100%', height: '100%', padding: '20px', overflow: 'auto' }} 
            onClick={e => e.stopPropagation()}>
            
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: '8px', letterSpacing: '-0.5px' }}>
              {editingId ? (form.namn || 'Redigera') : (form.typ === 'slut' ? 'Ny slutavverkning' : 'Ny gallring')}
            </h2>
            
            {editingId && form.voNummer && (
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: '16px' }}>
                {form.voNummer}{form.traktNr && ` · ${form.traktNr}`}
              </div>
            )}

            {/* Dokumentknappar — kompakta typfärgade pillar (ikon + text), bara om url finns */}
            {editingId && (dokUrls.td || dokUrls.sl) && (() => {
              const dokFarg = form.typ === 'slut' ? '#BA7515' : '#3f9457'; // dämpade typtoner (matchande dämpning)
              const ikonStil = { width: '14px', height: '14px', flexShrink: 0 } as React.CSSProperties;
              const pill = (url: string, etikett: string, ikon: React.ReactNode) => (
                <a href="#" target="_blank" rel="noopener noreferrer"
                  onClick={async (e) => {
                    e.preventDefault();
                    // Privat bucket — signera läs-URL vid klick (TTL 1h)
                    const signerad = await signeraKartfil(url);
                    if (signerad) window.open(signerad, '_blank', 'noopener,noreferrer');
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 12px', borderRadius: '9px',
                    textDecoration: 'none', fontSize: '13px', fontWeight: 500, lineHeight: 1,
                    background: `${dokFarg}18`, border: `1px solid ${dokFarg}40`, color: dokFarg }}>{ikon}{etikett}</a>
              );
              const fileTextIcon = (
                <svg style={ikonStil} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
                </svg>
              );
              const clipboardIcon = (
                <svg style={ikonStil} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
                </svg>
              );
              return (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  {dokUrls.td && pill(dokUrls.td, 'Traktdirektiv', fileTextIcon)}
                  {dokUrls.sl && pill(dokUrls.sl, 'Stämplingslängd', clipboardIcon)}
                </div>
              );
            })()}

            {importStatus && (
              <div style={{ textAlign: 'center', padding: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                {importStatus}
              </div>
            )}

            {/* PLANERING — alltid framme (det användaren faktiskt redigerar) */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', fontWeight: '700', letterSpacing: '1px', marginBottom: '12px' }}>PLANERING</div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px' }}>MÅNAD</label>
                  <select value={form.manad} onChange={e => setForm({ ...form, manad: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px' }}>
                    <option value={0} style={{ background: '#111' }}>Ej planerad</option>
                    {MANADER.map((m, i) => <option key={i} value={i + 1} style={{ background: '#111' }}>{m}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px' }}>ÅR</label>
                  <select value={form.ar} onChange={e => setForm({ ...form, ar: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px' }}>
                    {[2025, 2026, 2027].map(y => <option key={y} value={y} style={{ background: '#111' }}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* TRAKTINFO FRÅN VIDA — lugn lista, underordnad planeringen */}
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '700', letterSpacing: '1px', margin: '4px 0 2px' }}>TRAKTINFO FRÅN VIDA</div>

            {/* GRUNDDATA (läs; "Rätta" för sällsynt korrigering) */}
            <Rad title="Grunddata" id="grund">
              {(!editingId || rattaSektion === 'grund') ? (
                <>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}><InputField label="VO-NUMMER" value={form.voNummer} onChange={(e: any) => setForm({ ...form, voNummer: e.target.value })} /></div>
                    <div style={{ flex: 1 }}><InputField label="TRAKTNR" value={form.traktNr} onChange={(e: any) => setForm({ ...form, traktNr: e.target.value })} /></div>
                  </div>
                  <InputField label="NAMN" value={form.namn} onChange={(e: any) => setForm({ ...form, namn: e.target.value })} />
                  <ChipSelect items={sparadeBolag} selected={form.bolag} onSelect={(v: string) => setForm({ ...form, bolag: v })} label="BOLAG" editKey="bolag" onAdd={addBolag} onRemove={removeBolag} />
                  <ChipSelect items={sparadeCert} selected={form.cert} onSelect={(v: string) => setForm({ ...form, cert: v })} label="CERTIFIERING" editKey="cert" onAdd={addCert} onRemove={removeCert} />
                  <ChipSelect items={sparadeAtgarder[form.typ] || []} selected={form.atgard} onSelect={(v: string) => setForm({ ...form, atgard: v })} label="ÅTGÄRD" editKey="atgard" onAdd={addAtgard} onRemove={removeAtgard} />
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}><InputField label="VOLYM M³" value={form.volym} onChange={(e: any) => setForm({ ...form, volym: e.target.value })} type="number" /></div>
                    <div style={{ flex: 1 }}><InputField label="AREAL HA" value={form.areal} onChange={(e: any) => setForm({ ...form, areal: e.target.value })} /></div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>GROT</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setForm({ ...form, grot: true })} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: form.grot ? '#22c55e' : 'rgba(255,255,255,0.06)', color: form.grot ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Ja</button>
                      <button onClick={() => setForm({ ...form, grot: false })} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: !form.grot ? '#ef4444' : 'rgba(255,255,255,0.06)', color: !form.grot ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Nej</button>
                    </div>
                  </div>
                  <SortimentSelector selected={form.sortiment} onToggle={toggleSortiment} />
                  {editingId && <button onClick={() => setRattaSektion(null)} style={{ background: 'none', border: 'none', color: typFarg, fontSize: '13px', fontWeight: '600', cursor: 'pointer', padding: '6px 0' }}>Klar</button>}
                </>
              ) : (
                <>
                  <Las label="VO-NUMMER" value={form.voNummer} />
                  <Las label="TRAKTNR" value={form.traktNr} />
                  <Las label="NAMN" value={form.namn} />
                  <Las label="BOLAG" value={cap(form.bolag)} />
                  <Las label="CERTIFIERING" value={form.cert} />
                  <Las label="ÅTGÄRD" value={form.atgard} />
                  <Las label="VOLYM" value={form.volym ? `${form.volym} m³fub` : ''} />
                  <Las label="AREAL" value={form.areal ? `${form.areal} ha` : ''} />
                  <Las label="GROT" value={form.grot ? 'Ja' : 'Nej'} />
                  <Las label="SORTIMENT" value={form.sortiment.join(', ')} />
                  <button onClick={() => setRattaSektion('grund')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '2px 0' }}>Rätta</button>
                </>
              )}
            </Rad>

            {/* KONTAKT (läs, typfärg; tel = ring-länk) */}
            <Rad title="Kontakt" id="kontakt">
              {(!editingId || rattaSektion === 'kontakt') ? (
                <>
                  <InputField label="MARKÄGARE" value={form.markagare} onChange={(e: any) => setForm({ ...form, markagare: e.target.value })} />
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1 }}><InputField label="TELEFON" value={form.markagaretel} onChange={(e: any) => setForm({ ...form, markagaretel: e.target.value })} /></div>
                    <div style={{ flex: 1 }}><InputField label="E-POST" value={form.markagareepost} onChange={(e: any) => setForm({ ...form, markagareepost: e.target.value })} /></div>
                  </div>
                  <InputField label="INKÖPARE" value={form.inkopare} onChange={(e: any) => setForm({ ...form, inkopare: e.target.value })} />
                  <InputField label="INKÖPARE TELEFON" value={form.inkoparetel} onChange={(e: any) => setForm({ ...form, inkoparetel: e.target.value })} />
                  {editingId && <button onClick={() => setRattaSektion(null)} style={{ background: 'none', border: 'none', color: typFarg, fontSize: '13px', fontWeight: '600', cursor: 'pointer', padding: '6px 0' }}>Klar</button>}
                </>
              ) : (
                <>
                  <Las label="MARKÄGARE" value={cap(form.markagare)} color={typFarg} />
                  {form.markagaretel && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>TELEFON</div>
                      <a href={`tel:${form.markagaretel.replace(/\s/g, '')}`} style={{ fontSize: '15px', color: typFarg, textDecoration: 'none', fontWeight: 600 }}>{form.markagaretel}</a>
                    </div>
                  )}
                  {form.markagareepost && <Las label="E-POST" value={form.markagareepost} />}
                  <Las label="INKÖPARE" value={form.inkopare} color={typFarg} />
                  {form.inkoparetel && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>INKÖPARE TELEFON</div>
                      <a href={`tel:${form.inkoparetel.replace(/\s/g, '')}`} style={{ fontSize: '15px', color: typFarg, textDecoration: 'none', fontWeight: 600 }}>{form.inkoparetel}</a>
                    </div>
                  )}
                  <button onClick={() => setRattaSektion('kontakt')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '2px 0' }}>Rätta</button>
                </>
              )}
            </Rad>

            {/* KARTA (läs; Vägbeskrivning till koordinaten) */}
            <Rad title="Karta" id="karta">
              {(!editingId || rattaSektion === 'karta') ? (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>KOORDINATER (N / E)</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <input value={form.koordinatX} onChange={e => setForm({ ...form, koordinatX: e.target.value })} placeholder="N" style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                      <input value={form.koordinatY} onChange={e => setForm({ ...form, koordinatY: e.target.value })} placeholder="E" style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                    </div>
                  </div>
                  {editingId && <button onClick={() => setRattaSektion(null)} style={{ background: 'none', border: 'none', color: typFarg, fontSize: '13px', fontWeight: '600', cursor: 'pointer', padding: '6px 0' }}>Klar</button>}
                </>
              ) : (
                <>
                  {(form.koordinatX && form.koordinatY) ? (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${form.koordinatX},${form.koordinatY}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', textAlign: 'center', padding: '12px', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: 600, background: `${typFarg}1a`, border: `1px solid ${typFarg}55`, color: typFarg, marginBottom: '12px' }}>Vägbeskrivning</a>
                  ) : (
                    <Las label="KOORDINATER" value="" />
                  )}
                  <button onClick={() => setRattaSektion('karta')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '12px', fontWeight: '600', cursor: 'pointer', padding: '2px 0' }}>Rätta</button>
                </>
              )}
            </Rad>

            {/* ANTECKNINGAR (redigeras — egna noteringar; Vida-anteckningar landar också här) */}
            <Rad title="Anteckningar" id="anteckningar">
              <textarea value={form.anteckningar} onChange={e => setForm({ ...form, anteckningar: e.target.value })} rows={3}
                style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff', resize: 'vertical', boxSizing: 'border-box' }} />
            </Rad>

            {/* Knappar */}
            <div style={{ marginTop: '20px' }}>
              <button onClick={saveObj} style={{ width: '100%', padding: '16px', border: 'none', borderRadius: '10px', background: '#fff', color: '#000', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '10px' }}>Spara</button>
              {editingId && (
                <button onClick={deleteObj} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.25)', fontSize: '14px', cursor: 'pointer', marginBottom: '6px' }}>Ta bort</button>
              )}
              <button onClick={() => { setShowForm(false); setImportStatus(''); setEditMode(null); setShowAdd(null); }} 
                style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.3)', fontSize: '14px', cursor: 'pointer' }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
