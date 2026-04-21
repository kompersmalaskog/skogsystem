'use client';

import { useEffect, useState, useCallback, CSSProperties } from 'react';
import { supabase } from '@/lib/supabase';
import EkonomiBottomNav from '../EkonomiBottomNav';

type Num = number | '';

type MaskinRad = {
  id?: string; maskin_id: string; maskin_namn: string; timpris: Num;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};
type AcordRad = {
  id?: string; medelstam: Num; pris_total: Num; pris_skordare: Num; pris_skotare: Num;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};
type AvstandRad = { id?: string; fran_m: Num; till_m: Num; tillagg_kr_per_m3fub: Num; giltig_fran: string | null };
type TraktRad = { id?: string; fran_m3fub: Num; till_m3fub: Num; tillagg_kr_per_m3fub: Num; giltig_fran: string | null };
type TerrangRad = {
  id?: string; namn: string; tillagg_kr_per_m3fub: Num;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};
type SortRad = { id?: string; antal_fran: Num; antal_till: Num; tillagg_kr_per_m3fub: Num; giltig_fran: string | null };
type FlyttRad = { id?: string; km_fran: Num; km_till: Num; fast_kr: Num; timpris_trailer_kr: Num; beskrivning: string; giltig_fran: string | null };
type OvrigtRad = {
  id?: string; nyckel: string; beskrivning: string; varde: Num; enhet: string;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};

function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function yesterdayIso() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('sv-SE');
}
function numOrNull(v: Num): number | null {
  return v === '' || v === null ? null : Number(v);
}

export default function InstallningarClient() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const [maskiner, setMaskiner] = useState<MaskinRad[]>([]);
  const [acord, setAcord] = useState<AcordRad[]>([]);
  const [avstand, setAvstand] = useState<AvstandRad[]>([]);
  const [trakt, setTrakt] = useState<TraktRad[]>([]);
  const [terrang, setTerrang] = useState<TerrangRad[]>([]);
  const [sortiment, setSortiment] = useState<SortRad[]>([]);
  const [flytt, setFlytt] = useState<FlyttRad[]>([]);
  const [ovrigt, setOvrigt] = useState<OvrigtRad[]>([]);

  const [savingMaskin, setSavingMaskin] = useState<string | null>(null);
  const [savingAcord, setSavingAcord] = useState(false);
  const [savingAvstand, setSavingAvstand] = useState(false);
  const [savingTrakt, setSavingTrakt] = useState(false);
  const [savingTerrang, setSavingTerrang] = useState<string | null>(null);
  const [savingSort, setSavingSort] = useState(false);
  const [savingFlytt, setSavingFlytt] = useState(false);
  const [savingOvrigt, setSavingOvrigt] = useState<string | null>(null);

  const flashMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [mRes, aRes, avRes, trRes, teRes, soRes, flRes, ovRes] = await Promise.all([
      supabase.from('maskin_timpris').select('id, maskin_id, maskin_namn, timpris, giltig_fran, giltig_till').is('giltig_till', null).order('maskin_namn'),
      supabase.from('acord_priser').select('id, medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till').is('giltig_till', null).order('medelstam'),
      supabase.from('acord_skotningsavstand').select('id, fran_m, till_m, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m'),
      supabase.from('acord_traktstorlek').select('id, fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
      supabase.from('acord_terrang').select('id, namn, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('namn'),
      supabase.from('acord_sortiment_tillagg').select('id, antal_fran, antal_till, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('antal_fran'),
      supabase.from('acord_flyttkostnad').select('id, km_fran, km_till, fast_kr, timpris_trailer_kr, beskrivning, giltig_fran, giltig_till').is('giltig_till', null).order('km_fran'),
      supabase.from('acord_ovrigt').select('id, nyckel, beskrivning, varde, enhet, giltig_fran, giltig_till').is('giltig_till', null).order('nyckel'),
    ]);
    setMaskiner((mRes.data || []).map((m: any) => ({ id: m.id, maskin_id: m.maskin_id, maskin_namn: m.maskin_namn || '', timpris: m.timpris, giltig_fran: m.giltig_fran })));
    setAcord((aRes.data || []).map((a: any) => ({ id: a.id, medelstam: a.medelstam, pris_total: a.pris_total, pris_skordare: a.pris_skordare, pris_skotare: a.pris_skotare, giltig_fran: a.giltig_fran })));
    setAvstand((avRes.data || []).map((a: any) => ({ id: a.id, fran_m: a.fran_m, till_m: a.till_m ?? '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })));
    setTrakt((trRes.data || []).map((a: any) => ({ id: a.id, fran_m3fub: a.fran_m3fub, till_m3fub: a.till_m3fub ?? '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })));
    setTerrang((teRes.data || []).map((a: any) => ({ id: a.id, namn: a.namn || '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })));
    setSortiment((soRes.data || []).map((a: any) => ({ id: a.id, antal_fran: a.antal_fran, antal_till: a.antal_till ?? '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })));
    setFlytt((flRes.data || []).map((a: any) => ({ id: a.id, km_fran: a.km_fran, km_till: a.km_till ?? '', fast_kr: a.fast_kr ?? '', timpris_trailer_kr: a.timpris_trailer_kr ?? '', beskrivning: a.beskrivning || '', giltig_fran: a.giltig_fran })));
    setOvrigt((ovRes.data || []).map((a: any) => ({ id: a.id, nyckel: a.nyckel, beskrivning: a.beskrivning || '', varde: a.varde, enhet: a.enhet || '', giltig_fran: a.giltig_fran })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Shared save-all-bracket helper ──
  async function saveAllBracket<T>(tableName: string, rows: T[], mapRow: (r: T) => Record<string, any>) {
    const today = todayIso(), yest = yesterdayIso();
    const { error: endErr } = await supabase.from(tableName).update({ giltig_till: yest }).is('giltig_till', null);
    if (endErr) return endErr;
    const { error: insErr } = await supabase.from(tableName).insert(
      rows.map(r => ({ ...mapRow(r), giltig_fran: today, giltig_till: null }))
    );
    return insErr;
  }

  // ── Shared save-one-by-key helper ──
  async function saveOneByKey(tableName: string, keyCol: string, keyVal: string, newRow: Record<string, any>, isNew: boolean) {
    const today = todayIso(), yest = yesterdayIso();
    if (!isNew) {
      const { error } = await supabase.from(tableName).update({ giltig_till: yest }).eq(keyCol, keyVal).is('giltig_till', null);
      if (error) return error;
    }
    const { error } = await supabase.from(tableName).insert({ ...newRow, giltig_fran: today, giltig_till: null });
    return error;
  }

  // ── Maskin ──
  const updateMaskin = (idx: number, p: Partial<MaskinRad>) => setMaskiner(prev => prev.map((m, i) => i === idx ? { ...m, ...p, dirty: true } : m));
  const addMaskin = () => setMaskiner(prev => [...prev, { maskin_id: '', maskin_namn: '', timpris: '', giltig_fran: null, isNew: true, dirty: true }]);
  const saveMaskin = async (idx: number) => {
    const row = maskiner[idx];
    if (!row.maskin_id.trim() || !row.maskin_namn.trim() || row.timpris === '' || Number(row.timpris) <= 0) { flashMsg('Fyll i maskin-ID, namn och ett pris > 0'); return; }
    setSavingMaskin(row.maskin_id || `ny-${idx}`);
    const err = await saveOneByKey('maskin_timpris', 'maskin_id', row.maskin_id, {
      maskin_id: row.maskin_id.trim(), maskin_namn: row.maskin_namn.trim(), timpris: Number(row.timpris),
    }, !!row.isNew);
    setSavingMaskin(null);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg(`Sparat: ${row.maskin_namn}`);
    await fetchData();
  };

  // ── Acord ──
  const updateAcord = (idx: number, p: Partial<AcordRad>) => setAcord(prev => prev.map((a, i) => i === idx ? { ...a, ...p, dirty: true } : a));
  const removeAcord = (idx: number) => setAcord(prev => prev.filter((_, i) => i !== idx));
  const addAcord = () => setAcord(prev => [...prev, { medelstam: '', pris_total: '', pris_skordare: '', pris_skotare: '', giltig_fran: null, isNew: true, dirty: true }]);
  const saveAllAcord = async () => {
    for (const r of acord) {
      if (r.medelstam === '' || r.pris_total === '' || r.pris_skordare === '' || r.pris_skotare === '') { flashMsg('Alla acord-fält måste vara ifyllda'); return; }
      if (Number(r.pris_total) <= 0 || Number(r.medelstam) <= 0) { flashMsg('Pris och medelstam måste vara > 0'); return; }
    }
    setSavingAcord(true);
    const err = await saveAllBracket('acord_priser', acord, r => ({
      medelstam: Number(r.medelstam), pris_total: Number(r.pris_total), pris_skordare: Number(r.pris_skordare), pris_skotare: Number(r.pris_skotare),
    }));
    setSavingAcord(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Ny acord-prisuppsättning sparad');
    await fetchData();
  };

  // ── Skotningsavstånd ──
  const updateAvstand = (idx: number, p: Partial<AvstandRad>) => setAvstand(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeAvstand = (idx: number) => setAvstand(prev => prev.filter((_, i) => i !== idx));
  const addAvstand = () => setAvstand(prev => [...prev, { fran_m: '', till_m: '', tillagg_kr_per_m3fub: '', giltig_fran: null }]);
  const saveAllAvstand = async () => {
    for (const r of avstand) {
      if (r.fran_m === '' || r.tillagg_kr_per_m3fub === '') { flashMsg('Skotningsavstånd: från_m och tillägg måste fyllas i'); return; }
    }
    setSavingAvstand(true);
    const err = await saveAllBracket('acord_skotningsavstand', avstand, r => ({
      fran_m: Number(r.fran_m), till_m: numOrNull(r.till_m), tillagg_kr_per_m3fub: Number(r.tillagg_kr_per_m3fub),
    }));
    setSavingAvstand(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Skotningsavstånd sparat');
    await fetchData();
  };

  // ── Traktstorlek ──
  const updateTrakt = (idx: number, p: Partial<TraktRad>) => setTrakt(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeTrakt = (idx: number) => setTrakt(prev => prev.filter((_, i) => i !== idx));
  const addTrakt = () => setTrakt(prev => [...prev, { fran_m3fub: '', till_m3fub: '', tillagg_kr_per_m3fub: '', giltig_fran: null }]);
  const saveAllTrakt = async () => {
    for (const r of trakt) {
      if (r.fran_m3fub === '' || r.tillagg_kr_per_m3fub === '') { flashMsg('Traktstorlek: från och tillägg måste fyllas i'); return; }
    }
    setSavingTrakt(true);
    const err = await saveAllBracket('acord_traktstorlek', trakt, r => ({
      fran_m3fub: Number(r.fran_m3fub), till_m3fub: numOrNull(r.till_m3fub), tillagg_kr_per_m3fub: Number(r.tillagg_kr_per_m3fub),
    }));
    setSavingTrakt(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Traktstorlek sparad');
    await fetchData();
  };

  // ── Terräng ──
  const updateTerrang = (idx: number, p: Partial<TerrangRad>) => setTerrang(prev => prev.map((a, i) => i === idx ? { ...a, ...p, dirty: true } : a));
  const addTerrang = () => setTerrang(prev => [...prev, { namn: '', tillagg_kr_per_m3fub: '', giltig_fran: null, isNew: true, dirty: true }]);
  const saveTerrang = async (idx: number) => {
    const row = terrang[idx];
    if (!row.namn.trim() || row.tillagg_kr_per_m3fub === '') { flashMsg('Terräng: namn och tillägg krävs'); return; }
    setSavingTerrang(row.namn || `ny-${idx}`);
    const err = await saveOneByKey('acord_terrang', 'namn', row.namn.trim(), {
      namn: row.namn.trim(), tillagg_kr_per_m3fub: Number(row.tillagg_kr_per_m3fub),
    }, !!row.isNew);
    setSavingTerrang(null);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg(`Sparat: ${row.namn}`);
    await fetchData();
  };

  // ── Sortiment ──
  const updateSort = (idx: number, p: Partial<SortRad>) => setSortiment(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeSort = (idx: number) => setSortiment(prev => prev.filter((_, i) => i !== idx));
  const addSort = () => setSortiment(prev => [...prev, { antal_fran: '', antal_till: '', tillagg_kr_per_m3fub: '', giltig_fran: null }]);
  const saveAllSort = async () => {
    for (const r of sortiment) {
      if (r.antal_fran === '' || r.tillagg_kr_per_m3fub === '') { flashMsg('Sortiment: antal och tillägg måste fyllas i'); return; }
    }
    setSavingSort(true);
    const err = await saveAllBracket('acord_sortiment_tillagg', sortiment, r => ({
      antal_fran: Number(r.antal_fran), antal_till: numOrNull(r.antal_till), tillagg_kr_per_m3fub: Number(r.tillagg_kr_per_m3fub),
    }));
    setSavingSort(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Sortiment sparat');
    await fetchData();
  };

  // ── Flyttkostnad ──
  const updateFlytt = (idx: number, p: Partial<FlyttRad>) => setFlytt(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeFlytt = (idx: number) => setFlytt(prev => prev.filter((_, i) => i !== idx));
  const addFlytt = () => setFlytt(prev => [...prev, { km_fran: '', km_till: '', fast_kr: '', timpris_trailer_kr: '', beskrivning: '', giltig_fran: null }]);
  const saveAllFlytt = async () => {
    for (const r of flytt) {
      if (r.km_fran === '') { flashMsg('Flyttkostnad: km från krävs'); return; }
      if (r.fast_kr === '' && r.timpris_trailer_kr === '') { flashMsg('Flyttkostnad: fyll i antingen fast pris eller timpris'); return; }
    }
    setSavingFlytt(true);
    const err = await saveAllBracket('acord_flyttkostnad', flytt, r => ({
      km_fran: Number(r.km_fran), km_till: numOrNull(r.km_till),
      fast_kr: numOrNull(r.fast_kr), timpris_trailer_kr: numOrNull(r.timpris_trailer_kr),
      beskrivning: r.beskrivning || null,
    }));
    setSavingFlytt(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Flyttkostnad sparad');
    await fetchData();
  };

  // ── Övrigt ──
  const updateOvrigt = (idx: number, p: Partial<OvrigtRad>) => setOvrigt(prev => prev.map((a, i) => i === idx ? { ...a, ...p, dirty: true } : a));
  const addOvrigt = () => setOvrigt(prev => [...prev, { nyckel: '', beskrivning: '', varde: '', enhet: '', giltig_fran: null, isNew: true, dirty: true }]);
  const saveOvrigt = async (idx: number) => {
    const row = ovrigt[idx];
    if (!row.nyckel.trim() || row.varde === '') { flashMsg('Övrigt: nyckel och värde krävs'); return; }
    setSavingOvrigt(row.nyckel || `ny-${idx}`);
    const err = await saveOneByKey('acord_ovrigt', 'nyckel', row.nyckel.trim(), {
      nyckel: row.nyckel.trim(), beskrivning: row.beskrivning || null, varde: Number(row.varde), enhet: row.enhet || null,
    }, !!row.isNew);
    setSavingOvrigt(null);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg(`Sparat: ${row.beskrivning || row.nyckel}`);
    await fetchData();
  };

  // ── Styles ──
  const s: Record<string, CSSProperties> = {
    page: { background: '#111110', minHeight: '100vh', paddingTop: 16, paddingBottom: 130, color: '#e8e8e4', fontFamily: "'Geist', system-ui, sans-serif" },
    header: { padding: '16px 16px 0' },
    sectionTitle: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, color: '#7a7a72', marginBottom: 10, marginTop: 28, padding: '0 4px' },
    sectionBlurb: { fontSize: 11, color: '#7a7a72', padding: '0 4px', marginBottom: 10, marginTop: -4 },
    card: { background: '#1a1a18', borderRadius: 14, padding: 16 },
    input: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', color: '#e8e8e4', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' },
    btnDark: { background: '#000', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
    btnGhost: { background: 'rgba(255,255,255,0.03)', color: '#bfcab9', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', width: '100%', marginTop: 10 },
    btnRemove: { background: 'transparent', color: '#7a7a72', border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 18, lineHeight: 1 },
    pill: { display: 'inline-block', fontSize: 10, color: '#7a7a72', padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 999, fontWeight: 600, letterSpacing: 0.3 },
    th: { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7a7a72', textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)' },
    tdCell: { padding: '6px 6px' },
    inputNum: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
    saveRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12 },
    dateNote: { fontSize: 11, color: '#7a7a72' },
  };

  const NumInput = ({ value, onChange, step, placeholder }: { value: Num; onChange: (v: Num) => void; step?: string; placeholder?: string }) => (
    <input
      style={{ ...s.input, ...s.inputNum }}
      type="number" step={step || '1'} inputMode={step ? 'decimal' : 'numeric'}
      value={value}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      placeholder={placeholder}
    />
  );

  const datePillFor = (d: string | null) => <span style={s.pill as CSSProperties}>Gäller från {formatDate(d)}</span>;

  const saveAllFooter = (rows: { giltig_fran: string | null }[], saving: boolean, onSave: () => void) => (
    <div style={s.saveRow as CSSProperties}>
      <div style={s.dateNote as CSSProperties}>
        {rows.length > 0 && rows[0].giltig_fran ? `Nuvarande uppsättning gäller från ${formatDate(rows[0].giltig_fran)}` : 'Ingen aktiv uppsättning'}
      </div>
      <button style={{ ...s.btnDark, opacity: saving ? 0.6 : 1 } as CSSProperties} disabled={saving} onClick={onSave}>
        {saving ? 'Sparar...' : 'Spara alla (ny uppsättning)'}
      </button>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{`
        .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
      `}</style>

      <div style={s.header}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Prisinställningar</div>
        <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>Ändringar skapar nya rader med dagens datum. Gamla priser bevaras.</div>
      </div>

      {msg && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(90,255,140,0.1)', border: '1px solid rgba(90,255,140,0.3)', color: 'rgba(90,255,140,0.95)', borderRadius: 10, fontSize: 12 }}>
          {msg}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#7a7a72' }}>Laddar...</div>}

      {!loading && (
        <div style={{ padding: '0 16px' }}>

          {/* 1. Maskinpriser */}
          <div style={s.sectionTitle as CSSProperties}>Maskinpriser (timpeng)</div>
          <div style={s.sectionBlurb as CSSProperties}>Per maskin. Spara skriver en ny rad med dagens datum och avslutar den gamla.</div>
          <div style={s.card}>
            {maskiner.map((m, idx) => {
              const isSaving = savingMaskin === (m.maskin_id || `ny-${idx}`);
              return (
                <div key={m.id || `ny-${idx}`} style={{ padding: '12px 0', borderBottom: idx < maskiner.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <input style={s.input} value={m.maskin_id} onChange={e => updateMaskin(idx, { maskin_id: e.target.value })} placeholder="Maskin-ID" disabled={!m.isNew} />
                    <input style={s.input} value={m.maskin_namn} onChange={e => updateMaskin(idx, { maskin_namn: e.target.value })} placeholder="Namn" />
                    <NumInput value={m.timpris} onChange={v => updateMaskin(idx, { timpris: v })} placeholder="Kr/tim" />
                    <button style={{ ...s.btnDark, opacity: isSaving ? 0.6 : 1 } as CSSProperties} disabled={isSaving} onClick={() => saveMaskin(idx)}>
                      {isSaving ? 'Sparar...' : 'Spara'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    {datePillFor(m.giltig_fran)}
                    {m.isNew && <span style={{ ...s.pill, color: 'rgba(90,255,140,0.9)', background: 'rgba(90,255,140,0.08)' } as CSSProperties}>Ny</span>}
                    {m.dirty && !m.isNew && <span style={{ ...s.pill, color: 'rgba(255,179,64,0.9)', background: 'rgba(255,179,64,0.08)' } as CSSProperties}>Ändrad — ej sparad</span>}
                  </div>
                </div>
              );
            })}
            {maskiner.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Inga aktiva maskinpriser.</div>}
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addMaskin}>+ Lägg till maskin</button>

          {/* 2. Acordpriser */}
          <div style={s.sectionTitle as CSSProperties}>Acordpriser (slutavverkning)</div>
          <div style={s.sectionBlurb as CSSProperties}>Prisbrackets per medelstam. Spara skapar en ny, komplett prisuppsättning.</div>
          <div style={{ ...s.card, padding: '4px 14px 14px' } as CSSProperties}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={s.th as CSSProperties}>Medelstam</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Total</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Skördare</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Skotare</th>
                <th style={s.th as CSSProperties}></th>
              </tr></thead>
              <tbody>
                {acord.map((a, idx) => (
                  <tr key={a.id || `ny-${idx}`}>
                    <td style={s.tdCell}><NumInput value={a.medelstam} onChange={v => updateAcord(idx, { medelstam: v })} step="0.01" /></td>
                    <td style={s.tdCell}><NumInput value={a.pris_total} onChange={v => updateAcord(idx, { pris_total: v })} /></td>
                    <td style={s.tdCell}><NumInput value={a.pris_skordare} onChange={v => updateAcord(idx, { pris_skordare: v })} /></td>
                    <td style={s.tdCell}><NumInput value={a.pris_skotare} onChange={v => updateAcord(idx, { pris_skotare: v })} /></td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}><button style={s.btnRemove as CSSProperties} onClick={() => removeAcord(idx)}>×</button></td>
                  </tr>
                ))}
                {acord.length === 0 && <tr><td colSpan={5} style={{ color: '#7a7a72', fontSize: 12, padding: '12px 6px', textAlign: 'center' }}>Ingen aktiv uppsättning.</td></tr>}
              </tbody>
            </table>
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addAcord}>+ Lägg till medelstam-rad</button>
          {saveAllFooter(acord, savingAcord, saveAllAcord)}

          {/* 3. Skotningsavstånd */}
          <div style={s.sectionTitle as CSSProperties}>Skotningsavstånd</div>
          <div style={s.sectionBlurb as CSSProperties}>Tillägg per m³fub baserat på avstånd. +4 kr per påbörjad 100m över 200m (standard).</div>
          <div style={{ ...s.card, padding: '4px 14px 14px' } as CSSProperties}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={s.th as CSSProperties}>Från (m)</th>
                <th style={s.th as CSSProperties}>Till (m) — tom = ∞</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Tillägg kr/m³fub</th>
                <th style={s.th as CSSProperties}></th>
              </tr></thead>
              <tbody>
                {avstand.map((r, idx) => (
                  <tr key={r.id || `ny-${idx}`}>
                    <td style={s.tdCell}><NumInput value={r.fran_m} onChange={v => updateAvstand(idx, { fran_m: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.till_m} onChange={v => updateAvstand(idx, { till_m: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateAvstand(idx, { tillagg_kr_per_m3fub: v })} step="0.01" /></td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}><button style={s.btnRemove as CSSProperties} onClick={() => removeAvstand(idx)}>×</button></td>
                  </tr>
                ))}
                {avstand.length === 0 && <tr><td colSpan={4} style={{ color: '#7a7a72', fontSize: 12, padding: '12px 6px', textAlign: 'center' }}>Inga rader.</td></tr>}
              </tbody>
            </table>
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addAvstand}>+ Lägg till avstånds-rad</button>
          {saveAllFooter(avstand, savingAvstand, saveAllAvstand)}

          {/* 4. Traktstorlek */}
          <div style={s.sectionTitle as CSSProperties}>Traktstorlek</div>
          <div style={s.sectionBlurb as CSSProperties}>Tillägg per m³fub baserat på total traktvolym.</div>
          <div style={{ ...s.card, padding: '4px 14px 14px' } as CSSProperties}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={s.th as CSSProperties}>Från (m³fub)</th>
                <th style={s.th as CSSProperties}>Till (m³fub) — tom = ∞</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Tillägg kr/m³fub</th>
                <th style={s.th as CSSProperties}></th>
              </tr></thead>
              <tbody>
                {trakt.map((r, idx) => (
                  <tr key={r.id || `ny-${idx}`}>
                    <td style={s.tdCell}><NumInput value={r.fran_m3fub} onChange={v => updateTrakt(idx, { fran_m3fub: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.till_m3fub} onChange={v => updateTrakt(idx, { till_m3fub: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateTrakt(idx, { tillagg_kr_per_m3fub: v })} step="0.01" /></td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}><button style={s.btnRemove as CSSProperties} onClick={() => removeTrakt(idx)}>×</button></td>
                  </tr>
                ))}
                {trakt.length === 0 && <tr><td colSpan={4} style={{ color: '#7a7a72', fontSize: 12, padding: '12px 6px', textAlign: 'center' }}>Inga rader.</td></tr>}
              </tbody>
            </table>
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addTrakt}>+ Lägg till traktstorlek-rad</button>
          {saveAllFooter(trakt, savingTrakt, saveAllTrakt)}

          {/* 5. Terräng */}
          <div style={s.sectionTitle as CSSProperties}>Terräng</div>
          <div style={s.sectionBlurb as CSSProperties}>En kategori per rad. Spara per rad — skapar ny rad med dagens datum.</div>
          <div style={s.card}>
            {terrang.map((r, idx) => {
              const isSaving = savingTerrang === (r.namn || `ny-${idx}`);
              return (
                <div key={r.id || `ny-${idx}`} style={{ padding: '12px 0', borderBottom: idx < terrang.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <input style={s.input} value={r.namn} onChange={e => updateTerrang(idx, { namn: e.target.value })} placeholder="Terrängnamn" disabled={!r.isNew} />
                    <NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateTerrang(idx, { tillagg_kr_per_m3fub: v })} step="0.01" placeholder="kr/m³fub" />
                    <button style={{ ...s.btnDark, opacity: isSaving ? 0.6 : 1 } as CSSProperties} disabled={isSaving} onClick={() => saveTerrang(idx)}>
                      {isSaving ? 'Sparar...' : 'Spara'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    {datePillFor(r.giltig_fran)}
                    {r.isNew && <span style={{ ...s.pill, color: 'rgba(90,255,140,0.9)', background: 'rgba(90,255,140,0.08)' } as CSSProperties}>Ny</span>}
                  </div>
                </div>
              );
            })}
            {terrang.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Inga terräng-kategorier.</div>}
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addTerrang}>+ Lägg till terräng-kategori</button>

          {/* 6. Sortiment */}
          <div style={s.sectionTitle as CSSProperties}>Sortiment (antal sortiment)</div>
          <div style={s.sectionBlurb as CSSProperties}>Tillägg per m³fub baserat på antal sortiment på objektet.</div>
          <div style={{ ...s.card, padding: '4px 14px 14px' } as CSSProperties}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={s.th as CSSProperties}>Antal från</th>
                <th style={s.th as CSSProperties}>Antal till — tom = ∞</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Tillägg kr/m³fub</th>
                <th style={s.th as CSSProperties}></th>
              </tr></thead>
              <tbody>
                {sortiment.map((r, idx) => (
                  <tr key={r.id || `ny-${idx}`}>
                    <td style={s.tdCell}><NumInput value={r.antal_fran} onChange={v => updateSort(idx, { antal_fran: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.antal_till} onChange={v => updateSort(idx, { antal_till: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateSort(idx, { tillagg_kr_per_m3fub: v })} step="0.01" /></td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}><button style={s.btnRemove as CSSProperties} onClick={() => removeSort(idx)}>×</button></td>
                  </tr>
                ))}
                {sortiment.length === 0 && <tr><td colSpan={4} style={{ color: '#7a7a72', fontSize: 12, padding: '12px 6px', textAlign: 'center' }}>Inga rader.</td></tr>}
              </tbody>
            </table>
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addSort}>+ Lägg till sortiment-rad</button>
          {saveAllFooter(sortiment, savingSort, saveAllSort)}

          {/* 7. Flyttkostnad */}
          <div style={s.sectionTitle as CSSProperties}>Flyttkostnad</div>
          <div style={s.sectionBlurb as CSSProperties}>Fast belopp eller trailer-timpris per km-intervall.</div>
          <div style={{ ...s.card, padding: '4px 14px 14px' } as CSSProperties}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={s.th as CSSProperties}>Km från</th>
                <th style={s.th as CSSProperties}>Km till — tom = ∞</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Fast kr</th>
                <th style={{ ...s.th, textAlign: 'right' } as CSSProperties}>Timpris kr</th>
                <th style={s.th as CSSProperties}>Beskrivning</th>
                <th style={s.th as CSSProperties}></th>
              </tr></thead>
              <tbody>
                {flytt.map((r, idx) => (
                  <tr key={r.id || `ny-${idx}`}>
                    <td style={s.tdCell}><NumInput value={r.km_fran} onChange={v => updateFlytt(idx, { km_fran: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.km_till} onChange={v => updateFlytt(idx, { km_till: v })} /></td>
                    <td style={s.tdCell}><NumInput value={r.fast_kr} onChange={v => updateFlytt(idx, { fast_kr: v })} step="0.01" /></td>
                    <td style={s.tdCell}><NumInput value={r.timpris_trailer_kr} onChange={v => updateFlytt(idx, { timpris_trailer_kr: v })} step="0.01" /></td>
                    <td style={s.tdCell}>
                      <input style={s.input} value={r.beskrivning} onChange={e => updateFlytt(idx, { beskrivning: e.target.value })} placeholder="Valfri beskrivning" />
                    </td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}><button style={s.btnRemove as CSSProperties} onClick={() => removeFlytt(idx)}>×</button></td>
                  </tr>
                ))}
                {flytt.length === 0 && <tr><td colSpan={6} style={{ color: '#7a7a72', fontSize: 12, padding: '12px 6px', textAlign: 'center' }}>Inga rader.</td></tr>}
              </tbody>
            </table>
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addFlytt}>+ Lägg till flytt-rad</button>
          {saveAllFooter(flytt, savingFlytt, saveAllFlytt)}

          {/* 8. Övrigt */}
          <div style={s.sectionTitle as CSSProperties}>Övrigt (enskilda tillägg & konstanter)</div>
          <div style={s.sectionBlurb as CSSProperties}>3m massaved, kvalitetssäkring, dieselklausul m.m. Spara per rad.</div>
          <div style={s.card}>
            {ovrigt.map((r, idx) => {
              const isSaving = savingOvrigt === (r.nyckel || `ny-${idx}`);
              return (
                <div key={r.id || `ny-${idx}`} style={{ padding: '12px 0', borderBottom: idx < ovrigt.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                    <input style={s.input} value={r.nyckel} onChange={e => updateOvrigt(idx, { nyckel: e.target.value })} placeholder="Nyckel" disabled={!r.isNew} />
                    <input style={s.input} value={r.beskrivning} onChange={e => updateOvrigt(idx, { beskrivning: e.target.value })} placeholder="Beskrivning" />
                    <NumInput value={r.varde} onChange={v => updateOvrigt(idx, { varde: v })} step="0.01" placeholder="Värde" />
                    <input style={s.input} value={r.enhet} onChange={e => updateOvrigt(idx, { enhet: e.target.value })} placeholder="Enhet" />
                    <button style={{ ...s.btnDark, opacity: isSaving ? 0.6 : 1 } as CSSProperties} disabled={isSaving} onClick={() => saveOvrigt(idx)}>
                      {isSaving ? 'Sparar...' : 'Spara'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    {datePillFor(r.giltig_fran)}
                    {r.isNew && <span style={{ ...s.pill, color: 'rgba(90,255,140,0.9)', background: 'rgba(90,255,140,0.08)' } as CSSProperties}>Ny</span>}
                  </div>
                </div>
              );
            })}
            {ovrigt.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Inga poster.</div>}
          </div>
          <button style={s.btnGhost as CSSProperties} onClick={addOvrigt}>+ Lägg till övrig post</button>

          {/* Info */}
          <div style={s.sectionTitle as CSSProperties}>Giltighetsdatum</div>
          <div style={s.card}>
            <div style={{ fontSize: 12, color: '#bfcab9', lineHeight: 1.55 }}>
              Varje prisändring sparas som en <strong>ny rad</strong> med <code style={{ fontFamily: 'inherit', color: '#e8e8e4' }}>giltig_fran = {todayIso()}</code>.
              Den gamla raden får <code style={{ fontFamily: 'inherit', color: '#e8e8e4' }}>giltig_till = {yesterdayIso()}</code> så att historiken bevaras.
              Ekonomi-vyn slår upp rätt pris per produktionsdag, så äldre data räknas med de priser som gällde då.
            </div>
          </div>

        </div>
      )}
      <EkonomiBottomNav />
    </div>
  );
}
