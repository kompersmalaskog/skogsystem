'use client';

import { useState, useEffect } from 'react';

const MANADER = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];

const statusColor = { 
  planerad: '#444', 
  skordning: '#eab308', 
  skotning: '#3b82f6', 
  klar: '#22c55e' 
};

// Demo-data som simulerar importerad TD
const DEMO_IMPORT = {
  voNummer: '11080935',
  traktNr: '883907',
  namn: 'Lönsbygd AU 2025',
  bolag: 'Vida',
  inkopare: 'Jan-Erik Gustafsson',
  inkoparetel: '070-2327410',
  markagare: 'Agneta Ragnarsson',
  markagaretel: '0705430793',
  markagareepost: 'agnetha.ragnarsson@telia.com',
  cert: '',
  typ: 'slut',
  volym: '565',
  areal: '1.7',
  grot: true,
  koordinatX: '6264879',
  koordinatY: '482509',
  sortiment: ['Tall timmer · Urshult', 'Tall timmer · Vislanda', 'Gran timmer · Urshult', 'Gran timmer · Vislanda', 'Tall kubb', 'Gran kubb', 'Barrmassa', 'Björkmassa', 'Bränsleved'],
  anteckningar: 'Fornåkrar över hela ytan.'
};

export default function ObjektPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [animated, setAnimated] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  
  const [objekt, setObjekt] = useState([
    { id: '1', namn: 'Björkbacken', bolag: 'Södra', typ: 'slutavverkning', volym: 850, status: 'planerad', atgard: 'Rp', koordinater: { x: 6300000, y: 480000 } },
    { id: '2', namn: 'Stormyran', bolag: 'Vida', typ: 'gallring', volym: 420, status: 'skordning', atgard: 'Första gallring', koordinater: { x: null, y: null } }
  ]);

  const [form, setForm] = useState({ 
    voNummer: '', traktNr: '', namn: '', bolag: '', 
    inkopare: '', inkoparetel: '', markagare: '', markagaretel: '', markagareepost: '',
    cert: '', typ: 'slut', atgard: '', volym: '', areal: '', grot: false,
    maskiner: [], koordinatX: '', koordinatY: '',
    sortiment: [], anteckningar: ''
  });

  // Redigerbara listor
  const [sparadeBolag, setSparadeBolag] = useState(['Vida', 'Södra', 'ATA', 'Privat']);
  const [sparadeMaskiner, setSparadeMaskiner] = useState(['Ponsse Scorpion', 'Ponsse Buffalo', 'Extern skotare']);
  const [sparadeAtgarder, setSparadeAtgarder] = useState({ 
    slut: ['Rp', 'Lrk', 'Au', 'VF/BarkB'], 
    gallring: ['Första gallring', 'Andra gallring', 'Gallring'] 
  });
  const [sparadeCert, setSparadeCert] = useState(['FSC', 'PEFC', 'Ej FSC', 'FSC (grön plan)', 'Ej FSC (grön plan)']);
  const [sparadeSortiment, setSparadeSortiment] = useState([
    { group: 'Tall timmer', items: ['Urshult', 'Vislanda'] },
    { group: 'Gran timmer', items: ['Urshult', 'Vislanda'] },
    { group: 'Kubb', items: ['Tall', 'Gran'] },
    { group: 'Massa', items: ['Barr', 'Björk'] },
    { group: 'Energi', items: ['Bränsleved'] },
  ]);

  // Edit mode states
  const [editMode, setEditMode] = useState(null);
  const [showAdd, setShowAdd] = useState(null);
  const [newValue, setNewValue] = useState('');

  const [expandedSection, setExpandedSection] = useState('grund');

  useEffect(() => {
    setAnimated(false);
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, [month, year]);

  const aktuella = objekt;
  const slutObj = aktuella.filter(o => o.typ === 'slutavverkning');
  const gallObj = aktuella.filter(o => o.typ === 'gallring');
  const slutTotal = slutObj.reduce((s, o) => s + (o.volym || 0), 0);
  const gallTotal = gallObj.reduce((s, o) => s + (o.volym || 0), 0);
  const slutBest = 2000;
  const gallBest = 1500;

  const bytManad = (dir) => {
    let m = month + dir, y = year;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setMonth(m); setYear(y);
  };

  const handleImport = () => {
    setImportStatus('Läser traktdirektiv...');
    setTimeout(() => {
      setForm({ ...form, ...DEMO_IMPORT });
      setImportStatus('✓ Importerat från TD!');
      setShowForm(true);
      setEditingId(null);
      setExpandedSection('grund');
    }, 800);
  };

  const toggleStatus = (e, id) => {
    e.stopPropagation();
    const statusCycle = { planerad: 'skordning', skordning: 'skotning', skotning: 'klar', klar: 'planerad' };
    setObjekt(objekt.map(o => o.id === id ? { ...o, status: statusCycle[o.status] || 'planerad' } : o));
  };

  const openFormWithType = (typ) => {
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
      sortiment: [], anteckningar: ''
    });
  };

  const saveObj = () => {
    if (!form.voNummer || !form.namn || !form.bolag || !form.volym) {
      alert('Fyll i VO-nummer, namn, bolag och volym');
      return;
    }
    
    const newObj = {
      id: Date.now().toString(),
      vo_nummer: form.voNummer,
      namn: form.namn,
      bolag: form.bolag,
      typ: form.typ === 'slut' ? 'slutavverkning' : 'gallring',
      atgard: form.atgard,
      volym: parseInt(form.volym),
      status: 'planerad',
      koordinater: { x: form.koordinatX ? parseFloat(form.koordinatX) : null, y: form.koordinatY ? parseFloat(form.koordinatY) : null }
    };
    
    setObjekt([...objekt, newObj]);
    setShowForm(false);
    setImportStatus('');
  };

  const editObj = (obj) => {
    setForm({
      voNummer: obj.vo_nummer || '',
      traktNr: '',
      namn: obj.namn,
      bolag: obj.bolag,
      inkopare: '', inkoparetel: '', markagare: '', markagaretel: '', markagareepost: '',
      cert: '',
      typ: obj.typ === 'slutavverkning' ? 'slut' : 'gallring',
      atgard: obj.atgard || '',
      volym: obj.volym?.toString() || '',
      areal: '',
      grot: false,
      maskiner: [],
      koordinatX: obj.koordinater?.x?.toString() || '',
      koordinatY: obj.koordinater?.y?.toString() || '',
      sortiment: [],
      anteckningar: ''
    });
    setEditingId(obj.id);
    setImportStatus('');
    setExpandedSection('grund');
    setEditMode(null);
    setShowAdd(null);
    setShowForm(true);
  };

  const toggleSortiment = (name) => {
    if (form.sortiment.includes(name)) {
      setForm({ ...form, sortiment: form.sortiment.filter(s => s !== name) });
    } else {
      setForm({ ...form, sortiment: [...form.sortiment, name] });
    }
  };

  const Arc = ({ percent, size = 110, color }) => {
    const stroke = 6;
    const r = (size - stroke) / 2;
    const circ = r * 2 * Math.PI;
    const animatedPercent = animated ? Math.min(percent, 100) : 0;
    const offset = circ - (animatedPercent / 100) * circ;
    const isComplete = percent >= 100;
    
    return (
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle 
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color} 
          strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} 
          strokeLinecap="round" 
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)', filter: `drop-shadow(0 0 ${isComplete ? 8 : 4}px ${color})` }} 
        />
      </svg>
    );
  };

  const AnimatedNumber = ({ value }) => {
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

  const Section = ({ title, id, children }) => {
    const isOpen = expandedSection === id;
    return (
      <div style={{ marginBottom: '8px' }}>
        <button 
          onClick={() => setExpandedSection(isOpen ? null : id)}
          style={{
            width: '100%',
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.04)',
            border: 'none',
            borderRadius: isOpen ? '12px 12px 0 0' : '12px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          {title}
          <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.5 }}>▼</span>
        </button>
        {isOpen && (
          <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 12px 12px' }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const InputField = ({ label, value, onChange, placeholder, type = 'text' }) => (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '8px', fontWeight: '600' }}>{label}</label>
      <input 
        type={type}
        value={value} 
        onChange={onChange} 
        placeholder={placeholder}
        style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '10px', fontSize: '15px', color: '#fff', boxSizing: 'border-box' }} 
      />
    </div>
  );

  // Redigerbar ChipSelect
  const ChipSelect = ({ items, selected, onSelect, label, editKey, onAdd, onRemove, multi = false }) => {
    const isEditing = editMode === editKey;
    const isAdding = showAdd === editKey;
    const isSelected = (item) => multi ? (selected || []).includes(item) : selected === item;
    
    const handleSelect = (item) => {
      if (isEditing) return;
      if (multi) {
        if (isSelected(item)) {
          onSelect(selected.filter(s => s !== item));
        } else {
          onSelect([...(selected || []), item]);
        }
      } else {
        onSelect(item);
      }
    };

    const handleAdd = () => {
      if (newValue.trim() && !items.includes(newValue.trim())) {
        onAdd(newValue.trim());
        if (!multi) {
          onSelect(newValue.trim());
        }
      }
      setNewValue('');
      setShowAdd(null);
    };
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>{label}</label>
          <button 
            onClick={() => setEditMode(isEditing ? null : editKey)} 
            style={{ background: 'none', border: 'none', fontSize: '11px', color: isEditing ? '#ef4444' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
          >
            {isEditing ? 'Klar' : 'Ändra'}
          </button>
        </div>
        
        {isAdding ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              value={newValue} 
              onChange={e => setNewValue(e.target.value)} 
              placeholder="Lägg till..." 
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} 
            />
            <button onClick={handleAdd} style={{ padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
            <button onClick={() => { setShowAdd(null); setNewValue(''); }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {items.map(item => (
              <button 
                key={item} 
                onClick={() => handleSelect(item)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isSelected(item) ? '#fff' : 'rgba(255,255,255,0.06)',
                  color: isSelected(item) ? '#000' : 'rgba(255,255,255,0.5)',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isEditing ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {item}
                {isEditing && (
                  <span 
                    onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </span>
                )}
              </button>
            ))}
            <button 
              onClick={() => setShowAdd(editKey)}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: '1.5px dashed rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              +
            </button>
          </div>
        )}
      </div>
    );
  };

  // Sortiment med redigerbara grupper och items
  const SortimentSelector = ({ selected, onToggle }) => {
    const [addingToGroup, setAddingToGroup] = useState(null);
    const [newItemValue, setNewItemValue] = useState('');
    const [addingGroup, setAddingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    const handleAddItem = (groupIndex) => {
      if (newItemValue.trim()) {
        const updated = [...sparadeSortiment];
        updated[groupIndex].items.push(newItemValue.trim());
        setSparadeSortiment(updated);
        setNewItemValue('');
        setAddingToGroup(null);
      }
    };

    const handleRemoveItem = (groupIndex, item) => {
      const updated = [...sparadeSortiment];
      updated[groupIndex].items = updated[groupIndex].items.filter(i => i !== item);
      setSparadeSortiment(updated);
      // Ta bort från valda om den var vald
      const fullId = updated[groupIndex].group + ' · ' + item;
      if (selected.includes(fullId)) {
        onToggle(fullId);
      }
    };

    const handleRemoveGroup = (groupIndex) => {
      const updated = sparadeSortiment.filter((_, i) => i !== groupIndex);
      setSparadeSortiment(updated);
    };

    const handleAddGroup = () => {
      if (newGroupName.trim()) {
        setSparadeSortiment([...sparadeSortiment, { group: newGroupName.trim(), items: [] }]);
        setNewGroupName('');
        setAddingGroup(false);
      }
    };

    const isEditing = editMode === 'sortiment';

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>SORTIMENT</label>
          <button 
            onClick={() => setEditMode(isEditing ? null : 'sortiment')} 
            style={{ background: 'none', border: 'none', fontSize: '11px', color: isEditing ? '#ef4444' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
          >
            {isEditing ? 'Klar' : 'Ändra'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {sparadeSortiment.map(({ group, items }, groupIndex) => (
            <div key={group}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {group}
                </div>
                {isEditing && (
                  <button 
                    onClick={() => handleRemoveGroup(groupIndex)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', padding: '2px 6px' }}
                  >
                    Ta bort
                  </button>
                )}
              </div>
              
              {addingToGroup === groupIndex ? (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input 
                    value={newItemValue} 
                    onChange={e => setNewItemValue(e.target.value)} 
                    placeholder="Lägg till..." 
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleAddItem(groupIndex)}
                    style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} 
                  />
                  <button onClick={() => handleAddItem(groupIndex)} style={{ padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
                  <button onClick={() => { setAddingToGroup(null); setNewItemValue(''); }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {items.map(item => {
                    const fullId = group + ' · ' + item;
                    const isActive = selected.includes(fullId);
                    return (
                      <button
                        key={item}
                        onClick={() => !isEditing && onToggle(fullId)}
                        style={{
                          padding: '12px 20px',
                          borderRadius: '10px',
                          border: 'none',
                          background: isActive ? '#fff' : 'rgba(255,255,255,0.06)',
                          color: isActive ? '#000' : 'rgba(255,255,255,0.5)',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: isEditing ? 'default' : 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        {item}
                        {isEditing && (
                          <span 
                            onClick={(e) => { e.stopPropagation(); handleRemoveItem(groupIndex, item); }}
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              background: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              color: '#fff',
                              cursor: 'pointer'
                            }}
                          >
                            ✕
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button 
                    onClick={() => setAddingToGroup(groupIndex)}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '10px',
                      border: '1.5px dashed rgba(255,255,255,0.15)',
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Lägg till ny grupp */}
          {addingGroup ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                value={newGroupName} 
                onChange={e => setNewGroupName(e.target.value)} 
                placeholder="Ny sortimentsgrupp..." 
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} 
              />
              <button onClick={handleAddGroup} style={{ padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>✓</button>
              <button onClick={() => { setAddingGroup(false); setNewGroupName(''); }} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
            </div>
          ) : (
            <button 
              onClick={() => setAddingGroup(true)}
              style={{
                padding: '14px',
                borderRadius: '10px',
                border: '1.5px dashed rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '14px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              + Lägg till sortimentsgrupp
            </button>
          )}
        </div>
      </div>
    );
  };

  // Handlers för att lägga till/ta bort
  const addBolag = (val) => setSparadeBolag([...sparadeBolag, val]);
  const removeBolag = (val) => {
    setSparadeBolag(sparadeBolag.filter(b => b !== val));
    if (form.bolag === val) setForm({ ...form, bolag: '' });
  };

  const addCert = (val) => setSparadeCert([...sparadeCert, val]);
  const removeCert = (val) => {
    setSparadeCert(sparadeCert.filter(c => c !== val));
    if (form.cert === val) setForm({ ...form, cert: '' });
  };

  const addAtgard = (val) => {
    setSparadeAtgarder({ ...sparadeAtgarder, [form.typ]: [...sparadeAtgarder[form.typ], val] });
  };
  const removeAtgard = (val) => {
    setSparadeAtgarder({ ...sparadeAtgarder, [form.typ]: sparadeAtgarder[form.typ].filter(a => a !== val) });
    if (form.atgard === val) setForm({ ...form, atgard: '' });
  };

  const addMaskin = (val) => setSparadeMaskiner([...sparadeMaskiner, val]);
  const removeMaskin = (val) => {
    setSparadeMaskiner(sparadeMaskiner.filter(m => m !== val));
    setForm({ ...form, maskiner: form.maskiner.filter(m => m !== val) });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      
      {/* Header */}
      <div style={{ padding: '20px 24px 12px' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: '600', letterSpacing: '1px' }}>KOMPERSMÅLA SKOG</div>
        <div style={{ fontSize: '32px', fontWeight: '700', color: '#fff', marginTop: '4px', letterSpacing: '-1px' }}>Objekt</div>
      </div>

      {/* Import-knapp */}
      <div style={{ padding: '0 24px 16px' }}>
        <button
          onClick={handleImport}
          style={{
            width: '100%',
            padding: '16px',
            background: 'rgba(255,255,255,0.06)',
            border: '1.5px dashed rgba(255,255,255,0.2)',
            borderRadius: '12px',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          Importera traktfiler
        </button>
      </div>

      {/* Månadsväljare */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 24px 16px', gap: '24px' }}>
        <button onClick={() => bytManad(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>‹</button>
        <span style={{ fontSize: '18px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>{MANADER[month]} {year}</span>
        <button onClick={() => bytManad(1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '20px', cursor: 'pointer', padding: '8px' }}>›</button>
      </div>

      {/* Cirkeldiagram */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', padding: '16px 24px 48px' }}>
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
                  <div style={{ fontSize: '24px', fontWeight: '700', color: '#fff' }}><AnimatedNumber value={Math.round(percent)} /></div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '-2px' }}>%</div>
                </div>
              </div>
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}><AnimatedNumber value={item.total} /> / {item.best} m³</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Objektlista */}
      <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>
        {aktuella.map((obj, i) => (
          <div 
            key={obj.id} 
            onClick={() => editObj(obj)} 
            style={{ 
              display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 0', 
              borderTop: i === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', 
              borderBottom: '1px solid rgba(255,255,255,0.06)', 
              cursor: 'pointer' 
            }}
          >
            <div style={{ 
              width: '4px', height: '36px', borderRadius: '2px', 
              background: obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e', 
              opacity: (obj.koordinater?.x && obj.koordinater?.y) ? 1 : 0.25,
              boxShadow: (obj.koordinater?.x && obj.koordinater?.y) ? `0 0 8px ${obj.typ === 'slutavverkning' ? '#eab308' : '#22c55e'}` : 'none'
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#fff' }}>{obj.namn}</div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{obj.bolag}{obj.atgard && ` · ${obj.atgard}`}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '20px', fontWeight: '600', color: '#fff' }}>{obj.volym}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>m³</div>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '18px', marginLeft: '8px' }}>›</div>
          </div>
        ))}
      </div>

      {/* Formulär */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowForm(false)}>
          <div style={{ background: '#161616', width: '100%', maxWidth: '500px', borderRadius: '20px 20px 0 0', padding: '20px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '36px', height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', margin: '0 auto 20px' }} />
            
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: '8px' }}>
              {editingId ? 'Redigera objekt' : (form.typ === 'slut' ? 'Ny slutavverkning' : 'Ny gallring')}
            </h2>
            
            {importStatus && (
              <div style={{ 
                textAlign: 'center', padding: '10px', marginBottom: '16px',
                background: importStatus.includes('✓') ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                borderRadius: '8px',
                color: importStatus.includes('✓') ? '#22c55e' : '#3b82f6',
                fontSize: '13px'
              }}>
                {importStatus}
              </div>
            )}

            {/* GRUNDINFO */}
            <Section title="Grundinfo" id="grund">
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <InputField label="VO-NUMMER" value={form.voNummer} onChange={e => setForm({ ...form, voNummer: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <InputField label="TRAKTNR" value={form.traktNr} onChange={e => setForm({ ...form, traktNr: e.target.value })} />
                </div>
              </div>
              
              <InputField label="NAMN" value={form.namn} onChange={e => setForm({ ...form, namn: e.target.value })} />
              
              <ChipSelect 
                items={sparadeBolag} 
                selected={form.bolag} 
                onSelect={v => setForm({ ...form, bolag: v })} 
                label="BOLAG"
                editKey="bolag"
                onAdd={addBolag}
                onRemove={removeBolag}
              />
              
              <ChipSelect 
                items={sparadeCert} 
                selected={form.cert} 
                onSelect={v => setForm({ ...form, cert: v })} 
                label="CERTIFIERING"
                editKey="cert"
                onAdd={addCert}
                onRemove={removeCert}
              />
              
              <ChipSelect 
                items={sparadeAtgarder[form.typ]} 
                selected={form.atgard} 
                onSelect={v => setForm({ ...form, atgard: v })} 
                label="ÅTGÄRD"
                editKey="atgard"
                onAdd={addAtgard}
                onRemove={removeAtgard}
              />

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <InputField label="VOLYM M³" value={form.volym} onChange={e => setForm({ ...form, volym: e.target.value })} type="number" />
                </div>
                <div style={{ flex: 1 }}>
                  <InputField label="AREAL HA" value={form.areal} onChange={e => setForm({ ...form, areal: e.target.value })} />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>GROT</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setForm({ ...form, grot: true })} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: form.grot ? '#22c55e' : 'rgba(255,255,255,0.06)', color: form.grot ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Ja</button>
                  <button onClick={() => setForm({ ...form, grot: false })} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: !form.grot ? '#ef4444' : 'rgba(255,255,255,0.06)', color: !form.grot ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Nej</button>
                </div>
              </div>
            </Section>

            {/* KONTAKTINFO */}
            <Section title="Kontakt" id="kontakt">
              <InputField label="MARKÄGARE" value={form.markagare} onChange={e => setForm({ ...form, markagare: e.target.value })} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <InputField label="TELEFON" value={form.markagaretel} onChange={e => setForm({ ...form, markagaretel: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <InputField label="E-POST" value={form.markagareepost} onChange={e => setForm({ ...form, markagareepost: e.target.value })} />
                </div>
              </div>
              <InputField label="INKÖPARE" value={form.inkopare} onChange={e => setForm({ ...form, inkopare: e.target.value })} />
              <InputField label="INKÖPARE TELEFON" value={form.inkoparetel} onChange={e => setForm({ ...form, inkoparetel: e.target.value })} />
            </Section>

            {/* SORTIMENT */}
            <Section title="Sortiment" id="virke">
              <SortimentSelector 
                selected={form.sortiment} 
                onToggle={toggleSortiment}
              />
            </Section>

            {/* ÖVRIGT */}
            <Section title="Övrigt" id="ovrigt">
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>KOORDINATER</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input value={form.koordinatX} onChange={e => setForm({ ...form, koordinatX: e.target.value })} placeholder="N" style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                  <input value={form.koordinatY} onChange={e => setForm({ ...form, koordinatY: e.target.value })} placeholder="E" style={{ flex: 1, padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff' }} />
                </div>
              </div>

              <ChipSelect 
                items={sparadeMaskiner} 
                selected={form.maskiner} 
                onSelect={v => setForm({ ...form, maskiner: v })} 
                label="MASKINER"
                editKey="maskin"
                onAdd={addMaskin}
                onRemove={removeMaskin}
                multi
              />

              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '10px', fontWeight: '600' }}>ANTECKNINGAR</label>
                <textarea
                  value={form.anteckningar}
                  onChange={e => setForm({ ...form, anteckningar: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '10px', fontSize: '14px', color: '#fff', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            </Section>

            <div style={{ marginTop: '20px' }}>
              <button onClick={saveObj} style={{ width: '100%', padding: '16px', border: 'none', borderRadius: '10px', background: '#fff', color: '#000', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '10px' }}>Spara</button>
              <button onClick={() => { setShowForm(false); setImportStatus(''); setEditMode(null); setShowAdd(null); }} style={{ width: '100%', padding: '14px', border: 'none', borderRadius: '10px', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '15px', cursor: 'pointer' }}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
