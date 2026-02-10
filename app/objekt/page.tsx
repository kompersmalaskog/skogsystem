'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

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
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const [importStatus, setImportStatus] = useState('');


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

  const bestallningar = [
    { manad: 1, typ: 'slutavverkning', volym: 2000 },
    { manad: 1, typ: 'gallring', volym: 1500 },
    { manad: 2, typ: 'slutavverkning', volym: 2500 },
    { manad: 2, typ: 'gallring', volym: 1000 },
  ];

  const [form, setForm] = useState({ 
    voNummer: '', traktNr: '', namn: '', bolag: '', 
    inkopare: '', inkoparetel: '', markagare: '', markagaretel: '', markagareepost: '',
    cert: '', typ: 'slut', atgard: '', volym: '', areal: '', grot: false,
    maskiner: [] as string[], koordinatX: '', koordinatY: '',
    sortiment: [] as string[], anteckningar: '',
    ar: 2026, manad: 1, ordning: 1, status: 'planerad'
  });

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

  const planerade = objekt.filter(o => o.ar === year && o.manad === month + 1);
  const oplanerade = objekt.filter(o => !o.ar || !o.manad);

  const slutObj = planerade.filter(o => o.typ === 'slutavverkning');
  const gallObj = planerade.filter(o => o.typ === 'gallring');
  const slutTotal = slutObj.reduce((s, o) => s + (o.volym || 0), 0);
  const gallTotal = gallObj.reduce((s, o) => s + (o.volym || 0), 0);
  const slutBest = bestallningar.filter(b => b.manad === month + 1 && b.typ === 'slutavverkning').reduce((s, b) => s + (b.volym || 0), 0);
  const gallBest = bestallningar.filter(b => b.manad === month + 1 && b.typ === 'gallring').reduce((s, b) => s + (b.volym || 0), 0);

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

      // Lägg till det importerade objektet i listan
      const newObj = {
        id: data.objekt.id || Date.now().toString(),
        vo_nummer: data.objekt.vo_nummer || '',
        traktnr: data.objekt.traktnr || '',
        namn: data.objekt.namn || '',
        bolag: data.objekt.bolag || '',
        inkopare: data.objekt.inkopare || '',
        inkopare_tel: data.objekt.inkopare_tel || '',
        markagare: data.objekt.markagare || '',
        markagare_tel: data.objekt.markagare_tel || '',
        markagare_epost: data.objekt.markagare_epost || '',
        cert: data.objekt.cert || '',
        typ: data.objekt.typ || 'slutavverkning',
        volym: data.objekt.volym || 0,
        areal: data.objekt.areal || 0,
        grot: data.objekt.grot || false,
        lat: data.objekt.lat,
        lng: data.objekt.lng,
        ar: data.objekt.ar,
        manad: data.objekt.manad,
        status: data.objekt.status || 'planerad',
        atgard: '',
        maskiner: data.objekt.maskiner || [],
        sortiment: data.objekt.sortiment || [],
        anteckningar: data.objekt.anteckningar || '',
        ordning: planerade.length + 1
      };

      setObjekt([...objekt, newObj]);
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

  const openFormWithType = (typ: string) => {
    setShowForm(true);
    setEditingId(null);
    setImportStatus('');
    setExpandedSection('grund');
    setEditMode(null);
    setShowAdd(null);
    setForm({ 
      voNummer: '', traktNr: '', namn: '', bolag: '', 
      inkopare: '', inkoparetel: '', markagare: '', markagaretel: '', markagareepost: '',
      cert: '', typ, atgard: '', volym: '', areal: '', grot: false,
      maskiner: [], koordinatX: '', koordinatY: '',
      sortiment: [], anteckningar: '',
      ar: year, manad: month + 1, ordning: planerade.length + 1, status: 'planerad'
    });
  };

  const saveObj = () => {
    if (!form.namn || !form.bolag || !form.volym) {
      alert('Fyll i namn, bolag och volym');
      return;
    }
    const newObj = {
      id: editingId || Date.now().toString(),
      vo_nummer: form.voNummer, traktnr: form.traktNr, namn: form.namn, bolag: form.bolag,
      inkopare: form.inkopare, inkopare_tel: form.inkoparetel,
      markagare: form.markagare, markagare_tel: form.markagaretel, markagare_epost: form.markagareepost,
      cert: form.cert, typ: form.typ === 'slut' ? 'slutavverkning' : 'gallring',
      atgard: form.atgard, volym: parseInt(form.volym),
      areal: form.areal ? parseFloat(form.areal) : 0, grot: form.grot, status: form.status,
      lat: form.koordinatX ? parseFloat(form.koordinatX) : null,
      lng: form.koordinatY ? parseFloat(form.koordinatY) : null,
      maskiner: form.maskiner, sortiment: form.sortiment, anteckningar: form.anteckningar,
      ar: form.manad === 0 ? null : form.ar, manad: form.manad === 0 ? null : form.manad, ordning: form.ordning,
    };
    if (editingId) setObjekt(objekt.map(o => o.id === editingId ? newObj : o));
    else setObjekt([...objekt, newObj]);
    setShowForm(false);
    setImportStatus('');
    setEditMode(null);
    setShowAdd(null);
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
    setEditingId(obj.id);
    setImportStatus('');
    setExpandedSection('planering');
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

  const Section = ({ title, id, children }: { title: string; id: string; children: React.ReactNode }) => {
    const isOpen = expandedSection === id;
    return (
      <div style={{ marginBottom: '8px' }}>
        <button onClick={() => setExpandedSection(isOpen ? '' : id)}
          style={{ width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: 'none',
            borderRadius: isOpen ? '12px 12px 0 0' : '12px', color: '#fff', fontSize: '14px', fontWeight: '600',
            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title}
          <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.3, fontSize: '12px' }}>▼</span>
        </button>
        {isOpen && (
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 12px 12px' }}>{children}</div>
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
      
      {/* Header */}
      <div style={{ padding: '20px 24px 12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontWeight: '600', letterSpacing: '1.5px' }}>KOMPERSMÅLA SKOG</div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginTop: '4px', letterSpacing: '-1px' }}>Objekt</div>
      </div>

      {/* Import */}
      <div style={{ padding: '0 24px 16px' }}>
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

      {/* Månadsväljare */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 24px 16px', gap: '24px' }}>
        <button onClick={() => bytManad(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>‹</button>
        <span style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.85)', letterSpacing: '-0.3px' }}>{MANADER[month]} {year}</span>
        <button onClick={() => bytManad(1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>›</button>
      </div>

      {/* Cirkeldiagram */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', padding: '16px 24px 32px' }}>
        {[
          { typ: 'slut', label: 'Slutavverkning', total: slutTotal, best: slutBest, color: '#eab308' }, 
          { typ: 'gallring', label: 'Gallring', total: gallTotal, best: gallBest, color: '#22c55e' }
        ].map(item => {
          const percent = item.best ? (item.total / item.best) * 100 : 0;
          return (
            <div key={item.typ} onClick={() => openFormWithType(item.typ)} style={{ textAlign: 'center', cursor: 'pointer' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Arc percent={percent} color={item.color} />
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff', letterSpacing: '-1px' }}><AnimatedNumber value={Math.round(percent)} /></div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '-2px' }}>%</div>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}><AnimatedNumber value={item.total} /> / {item.best} m³</div>
              </div>
            </div>
          );
        })}
      </div>


      {/* Objektlista */}
      <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>
        {planerade.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.2)' }}>
            Inga objekt för {MANADER[month]}
          </div>
        ) : (
          planerade.map((obj, i) => (
            <div key={obj.id} onClick={() => editObj(obj)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '16px', padding: '18px 0', 
                borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' 
              }}>
              {/* Typlinje */}
              <div style={{ 
                width: '3px', height: '32px', borderRadius: '2px', 
                background: obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e', 
                opacity: (obj.lat && obj.lng) ? 0.8 : 0.15,
              }} />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff', letterSpacing: '-0.2px' }}>{obj.namn}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)', marginTop: '3px' }}>
                  {obj.bolag}{obj.atgard && ` · ${obj.atgard}`}
                </div>
              </div>

              {/* Volym */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.5px' }}>{obj.volym}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '1px' }}>m³</div>
              </div>

              {/* Pil */}
              <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: '16px' }}>›</div>
            </div>
          ))
        )}
      </div>

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

            {importStatus && (
              <div style={{ textAlign: 'center', padding: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>
                {importStatus}
              </div>
            )}

            {/* PLANERING */}
            <Section title="Planering" id="planering">
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
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

              <ChipSelect items={sparadeMaskiner} selected={form.maskiner} 
                onSelect={(v: string[]) => setForm({ ...form, maskiner: v })} 
                label="MASKINER" editKey="maskin" onAdd={addMaskin} onRemove={removeMaskin} multi />

              <InputField label="KÖRORDNING" value={form.ordning} onChange={(e: any) => setForm({ ...form, ordning: parseInt(e.target.value) || 1 })} type="number" />
            </Section>

            {/* GRUNDINFO */}
            <Section title="Grundinfo" id="grund">
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
            </Section>

            {/* KONTAKT */}
            <Section title="Kontakt" id="kontakt">
              <InputField label="MARKÄGARE" value={form.markagare} onChange={(e: any) => setForm({ ...form, markagare: e.target.value })} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}><InputField label="TELEFON" value={form.markagaretel} onChange={(e: any) => setForm({ ...form, markagaretel: e.target.value })} /></div>
                <div style={{ flex: 1 }}><InputField label="E-POST" value={form.markagareepost} onChange={(e: any) => setForm({ ...form, markagareepost: e.target.value })} /></div>
              </div>
              <InputField label="INKÖPARE" value={form.inkopare} onChange={(e: any) => setForm({ ...form, inkopare: e.target.value })} />
              <InputField label="INKÖPARE TELEFON" value={form.inkoparetel} onChange={(e: any) => setForm({ ...form, inkoparetel: e.target.value })} />
            </Section>

            {/* SORTIMENT */}
            <Section title="Sortiment" id="virke">
              <SortimentSelector selected={form.sortiment} onToggle={toggleSortiment} />
            </Section>

            {/* ÖVRIGT */}
            <Section title="Övrigt" id="ovrigt">
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>KOORDINATER</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input value={form.koordinatX} onChange={e => setForm({ ...form, koordinatX: e.target.value })} placeholder="N" style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                  <input value={form.koordinatY} onChange={e => setForm({ ...form, koordinatY: e.target.value })} placeholder="E" style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>ANTECKNINGAR</label>
                <textarea value={form.anteckningar} onChange={e => setForm({ ...form, anteckningar: e.target.value })} rows={3}
                  style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </Section>

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
