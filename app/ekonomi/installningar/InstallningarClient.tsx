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
type AvstandConfig = { id?: string; grundavstand_m: Num; kr_per_100m: Num; giltig_fran: string | null };
type TraktRad = { id?: string; fran_m3fub: Num; till_m3fub: Num; tillagg_kr_per_m3fub: Num; giltig_fran: string | null };
type TerrangRad = {
  id?: string; namn: string; tillagg_kr_per_m3fub: Num;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};
type SortConfig = { id?: string; grundantal: Num; kr_per_extra_sortiment: Num; giltig_fran: string | null };
type FlyttRad = { id?: string; km_fran: Num; km_till: Num; fast_kr: Num; timpris_trailer_kr: Num; beskrivning: string; giltig_fran: string | null };
type OvrigtRad = {
  id?: string; nyckel: string; beskrivning: string; varde: Num; enhet: string;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};
type Mappning = { id: string; maskin_id: string; kostnadsstalle_kod: string };
type FortnoxCc = { kod: string; namn?: string; aktiv?: boolean; har_trafik?: boolean };
type Maskinopt = { maskin_id: string; modell: string | null; maskin_typ?: string | null };
type OmappadFaktura = {
  id: number;
  document_number: number;
  invoice_date: string | null;
  description: string | null;
  total: number | null;
  matched_objekt_id: string | null;
  manual_objekt_id: string | null;
  valt_objekt_id: string;  // UI-state
};
type ObjektVal = { objekt_id: string; label: string };
type SortGruppRad = {
  sortiment_id: string;
  namn: string;
  grupp: string | null;  // null = exkluderad
  grupp_manuell: boolean;
  dirty?: boolean;
};
const SORT_GRUPPER = ['Timmer', 'Klentimmer', 'Kubb', 'Massa', 'Energi', 'Övrigt'] as const;

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
  const [avstand, setAvstand] = useState<AvstandConfig>({ grundavstand_m: '', kr_per_100m: '', giltig_fran: null });
  const [trakt, setTrakt] = useState<TraktRad[]>([]);
  const [terrang, setTerrang] = useState<TerrangRad[]>([]);
  const [sortiment, setSortiment] = useState<SortConfig>({ grundantal: '', kr_per_extra_sortiment: '', giltig_fran: null });
  const [flytt, setFlytt] = useState<FlyttRad[]>([]);
  const [ovrigt, setOvrigt] = useState<OvrigtRad[]>([]);
  const [mappningar, setMappningar] = useState<Mappning[]>([]);
  const [maskinOptLista, setMaskinOptLista] = useState<Maskinopt[]>([]);
  const [fortnoxCc, setFortnoxCc] = useState<FortnoxCc[]>([]);
  const [omappadeCc, setOmappadeCc] = useState<FortnoxCc[]>([]);
  const [savingCcMap, setSavingCcMap] = useState(false);
  // Per-omappad: vald maskin i dropdown innan tryck på Spara
  const [omappadVal, setOmappadVal] = useState<Record<string, string>>({});
  const [omappade, setOmappade] = useState<OmappadFaktura[]>([]);
  const [objektVal, setObjektVal] = useState<ObjektVal[]>([]);
  const [savingMap, setSavingMap] = useState<number | null>(null);
  const [sortGruppRader, setSortGruppRader] = useState<SortGruppRad[]>([]);
  const [savingSortGrupp, setSavingSortGrupp] = useState<string | null>(null);
  const [sortGruppFilter, setSortGruppFilter] = useState<string>('Ej manuella');

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
    const [mRes, aRes, avRes, trRes, teRes, soRes, flRes, ovRes, dimMaskinRes, ksRes, omappadRes, objektValRes, sortGruppRes] = await Promise.all([
      supabase.from('maskin_timpris').select('id, maskin_id, maskin_namn, timpris, giltig_fran, giltig_till').is('giltig_till', null).order('maskin_namn'),
      supabase.from('acord_priser').select('id, medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till').is('giltig_till', null).order('medelstam'),
      supabase.from('acord_skotningsavstand').select('id, grundavstand_m, kr_per_100m, giltig_fran, giltig_till').is('giltig_till', null).not('grundavstand_m', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
      supabase.from('acord_traktstorlek').select('id, fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
      supabase.from('acord_terrang').select('id, namn, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('namn'),
      supabase.from('acord_sortiment_tillagg').select('id, grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
      supabase.from('acord_flyttkostnad').select('id, km_fran, km_till, fast_kr, timpris_trailer_kr, beskrivning, giltig_fran, giltig_till').is('giltig_till', null).order('km_fran'),
      supabase.from('acord_ovrigt').select('id, nyckel, beskrivning, varde, enhet, giltig_fran, giltig_till').is('giltig_till', null).order('nyckel'),
      supabase.from('dim_maskin').select('maskin_id, modell').order('modell'),
      supabase.from('maskin_kostnadsstalle').select('maskin_id, kostnadsstalle_kod'),
      supabase.from('fortnox_invoice_rows')
        .select('id, document_number, invoice_date, description, total, matched_objekt_id, manual_objekt_id')
        .is('matched_objekt_id', null)
        .is('manual_objekt_id', null)
        .not('total', 'is', null)
        .order('invoice_date', { ascending: false })
        .limit(200),
      supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer').order('object_name').limit(1000),
      supabase.from('dim_sortiment').select('sortiment_id, namn, dim_sortiment_grupp(grupp, grupp_manuell)').order('namn'),
    ]);
    setMaskiner((mRes.data || []).map((m: any) => ({ id: m.id, maskin_id: m.maskin_id, maskin_namn: m.maskin_namn || '', timpris: m.timpris, giltig_fran: m.giltig_fran })));
    setAcord((aRes.data || []).map((a: any) => ({ id: a.id, medelstam: a.medelstam, pris_total: a.pris_total, pris_skordare: a.pris_skordare, pris_skotare: a.pris_skotare, giltig_fran: a.giltig_fran })));
    const avRow = (avRes.data || [])[0];
    setAvstand(avRow
      ? { id: avRow.id, grundavstand_m: avRow.grundavstand_m, kr_per_100m: avRow.kr_per_100m, giltig_fran: avRow.giltig_fran }
      : { grundavstand_m: 200, kr_per_100m: 4, giltig_fran: null });
    setTrakt((trRes.data || []).map((a: any) => ({ id: a.id, fran_m3fub: a.fran_m3fub, till_m3fub: a.till_m3fub ?? '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })));
    setTerrang((teRes.data || []).map((a: any) => ({ id: a.id, namn: a.namn || '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })));
    const soRow = (soRes.data || [])[0];
    setSortiment(soRow
      ? { id: soRow.id, grundantal: soRow.grundantal, kr_per_extra_sortiment: soRow.kr_per_extra_sortiment, giltig_fran: soRow.giltig_fran }
      : { grundantal: 6, kr_per_extra_sortiment: 2, giltig_fran: null });
    setFlytt((flRes.data || []).map((a: any) => ({ id: a.id, km_fran: a.km_fran, km_till: a.km_till ?? '', fast_kr: a.fast_kr ?? '', timpris_trailer_kr: a.timpris_trailer_kr ?? '', beskrivning: a.beskrivning || '', giltig_fran: a.giltig_fran })));
    setOvrigt((ovRes.data || []).map((a: any) => ({ id: a.id, nyckel: a.nyckel, beskrivning: a.beskrivning || '', varde: a.varde, enhet: a.enhet || '', giltig_fran: a.giltig_fran })));

    // Kostnadsställe-mappning (flera CC per maskin tillåtna) — hämtas via
    // dedikerat API som även returnerar omappade CC och Fortnox-listan.
    try {
      const mapResp = await fetch('/api/fortnox/mappning', { cache: 'no-store' });
      const mapBody = await mapResp.json();
      if (mapResp.ok && mapBody.ok) {
        setMappningar(mapBody.mappningar || []);
        setMaskinOptLista(mapBody.maskiner || []);
        setFortnoxCc(mapBody.fortnox_kostnadsstallen || []);
        setOmappadeCc(mapBody.omappade || []);
      }
    } catch { /* behåll tidigare state vid fel */ }

    setOmappade((omappadRes.data || []).map((r: any) => ({
      id: r.id,
      document_number: r.document_number,
      invoice_date: r.invoice_date,
      description: r.description,
      total: r.total,
      matched_objekt_id: r.matched_objekt_id,
      manual_objekt_id: r.manual_objekt_id,
      valt_objekt_id: '',
    })));

    setObjektVal((objektValRes.data || []).map((o: any) => ({
      objekt_id: o.objekt_id,
      label: o.object_name
        ? (o.vo_nummer ? `${o.object_name} (VO ${o.vo_nummer})` : o.object_name)
        : (o.vo_nummer ? `VO ${o.vo_nummer}` : o.objekt_id),
    })));

    setSortGruppRader((sortGruppRes.data || []).map((s: any) => {
      const g = Array.isArray(s.dim_sortiment_grupp) ? s.dim_sortiment_grupp[0] : s.dim_sortiment_grupp;
      return {
        sortiment_id: s.sortiment_id,
        namn: s.namn || '',
        grupp: g?.grupp ?? null,
        grupp_manuell: !!g?.grupp_manuell,
      };
    }));

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

  // ── Skotningsavstånd (formel-config, en rad) ──
  const updateAvstand = (p: Partial<AvstandConfig>) => setAvstand(prev => ({ ...prev, ...p }));
  const saveAvstand = async () => {
    if (avstand.grundavstand_m === '' || avstand.kr_per_100m === '') {
      flashMsg('Fyll i grundavstånd och tillägg'); return;
    }
    setSavingAvstand(true);
    const today = todayIso(), yest = yesterdayIso();
    // Avsluta bara den aktiva formel-raden (inte ev. gamla bracket-rader)
    const { error: endErr } = await supabase.from('acord_skotningsavstand')
      .update({ giltig_till: yest })
      .is('giltig_till', null)
      .not('grundavstand_m', 'is', null);
    if (endErr) { setSavingAvstand(false); flashMsg(`Fel: ${endErr.message}`); return; }
    const { error: insErr } = await supabase.from('acord_skotningsavstand').insert({
      grundavstand_m: Number(avstand.grundavstand_m),
      kr_per_100m: Number(avstand.kr_per_100m),
      giltig_fran: today, giltig_till: null,
    });
    setSavingAvstand(false);
    if (insErr) { flashMsg(`Fel: ${insErr.message}`); return; }
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

  // ── Sortiment (formel-config, en rad) ──
  const updateSort = (p: Partial<SortConfig>) => setSortiment(prev => ({ ...prev, ...p }));
  const saveSort = async () => {
    if (sortiment.grundantal === '' || sortiment.kr_per_extra_sortiment === '') {
      flashMsg('Fyll i grundantal och tillägg'); return;
    }
    setSavingSort(true);
    const today = todayIso(), yest = yesterdayIso();
    const { error: endErr } = await supabase.from('acord_sortiment_tillagg')
      .update({ giltig_till: yest })
      .is('giltig_till', null)
      .not('grundantal', 'is', null);
    if (endErr) { setSavingSort(false); flashMsg(`Fel: ${endErr.message}`); return; }
    const { error: insErr } = await supabase.from('acord_sortiment_tillagg').insert({
      grundantal: Number(sortiment.grundantal),
      kr_per_extra_sortiment: Number(sortiment.kr_per_extra_sortiment),
      giltig_fran: today, giltig_till: null,
    });
    setSavingSort(false);
    if (insErr) { flashMsg(`Fel: ${insErr.message}`); return; }
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

  // ── Manuell fakturarads-mappning ──
  const updateOmappad = (idx: number, objekt_id: string) => {
    setOmappade(prev => prev.map((r, i) => i === idx ? { ...r, valt_objekt_id: objekt_id } : r));
  };
  const saveOmappad = async (idx: number) => {
    const row = omappade[idx];
    if (!row.valt_objekt_id) { flashMsg('Välj objekt först'); return; }
    setSavingMap(row.id);
    const { error } = await supabase
      .from('fortnox_invoice_rows')
      .update({ manual_objekt_id: row.valt_objekt_id })
      .eq('id', row.id);
    setSavingMap(null);
    if (error) { flashMsg(`Fel: ${error.message}`); return; }
    // Ta bort raden lokalt (den är nu mappad)
    setOmappade(prev => prev.filter((_, i) => i !== idx));
    flashMsg(`Mappad: faktura ${row.document_number} → ${objektVal.find(o => o.objekt_id === row.valt_objekt_id)?.label || row.valt_objekt_id}`);
  };

  // ── Sortiment-grupp-mappning ──
  const updateSortGrupp = (idx: number, grupp: string | null) => {
    setSortGruppRader(prev => prev.map((r, i) => i === idx ? { ...r, grupp, dirty: true } : r));
  };
  const saveSortGrupp = async (idx: number) => {
    const row = sortGruppRader[idx];
    setSavingSortGrupp(row.sortiment_id);
    const { error } = await supabase.from('dim_sortiment_grupp')
      .upsert({
        sortiment_id: row.sortiment_id,
        grupp: row.grupp,
        grupp_manuell: true,
        uppdaterad_tid: new Date().toISOString(),
      }, { onConflict: 'sortiment_id' });
    setSavingSortGrupp(null);
    if (error) { flashMsg(`Fel: ${error.message}`); return; }
    setSortGruppRader(prev => prev.map((r, i) => i === idx
      ? { ...r, grupp_manuell: true, dirty: false }
      : r));
    flashMsg(`Sparad: ${row.namn || row.sortiment_id} → ${row.grupp || '(exkluderad)'}`);
  };

  // ── Kostnadsställe-mappning (flera CC per maskin) ──
  const läggTillMappning = async (maskin_id: string, kod: string) => {
    if (!maskin_id || !kod) return;
    setSavingCcMap(true);
    const r = await fetch('/api/fortnox/mappning', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maskin_id, kostnadsstalle_kod: kod }),
    });
    const body = await r.json();
    setSavingCcMap(false);
    if (!r.ok || !body.ok) { flashMsg(`Fel: ${body.error || r.status}`); return; }
    flashMsg(`Mappning tillagd: ${kod} → ${maskin_id}`);
    setOmappadVal(prev => { const n = { ...prev }; delete n[kod]; return n; });
    await fetchData();
  };
  const taBortMappning = async (id: string) => {
    setSavingCcMap(true);
    const r = await fetch(`/api/fortnox/mappning/${id}`, { method: 'DELETE' });
    const body = await r.json();
    setSavingCcMap(false);
    if (!r.ok || !body.ok) { flashMsg(`Fel: ${body.error || r.status}`); return; }
    flashMsg('Mappning borttagen');
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

          {/* 3. Skotningsavstånd — formel-config */}
          <div style={s.sectionTitle as CSSProperties}>Skotningsavstånd</div>
          <div style={s.sectionBlurb as CSSProperties}>Systemet räknar ut tillägget automatiskt per objekt: påbörjad 100m över grundavståndet × kr/m³fub.</div>
          <div style={s.card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#7a7a72', fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>Grundavstånd (m)</div>
                <NumInput value={avstand.grundavstand_m} onChange={v => updateAvstand({ grundavstand_m: v })} placeholder="200" />
                <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 4 }}>Under detta avstånd: inget tillägg.</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#7a7a72', fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>Tillägg per påbörjad 100m</div>
                <NumInput value={avstand.kr_per_100m} onChange={v => updateAvstand({ kr_per_100m: v })} step="0.01" placeholder="4" />
                <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 4 }}>kr/m³fub</div>
              </div>
              <button
                style={{ ...s.btnDark, opacity: savingAvstand ? 0.6 : 1 } as CSSProperties}
                disabled={savingAvstand}
                onClick={saveAvstand}>
                {savingAvstand ? 'Sparar...' : 'Spara'}
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              {datePillFor(avstand.giltig_fran)}
            </div>
            {/* Preview */}
            {avstand.grundavstand_m !== '' && avstand.kr_per_100m !== '' && Number(avstand.kr_per_100m) !== 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>Exempel</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#bfcab9' }}>
                  {[0, 100, 200, 300, 400, 500, 600, 800].map(d => {
                    const g = Number(avstand.grundavstand_m), k = Number(avstand.kr_per_100m);
                    const step = Math.max(0, Math.ceil((d - g) / 100));
                    const kr = step * k;
                    return (
                      <div key={d} style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 8 }}>
                        <span style={{ color: '#7a7a72' }}>{d} m</span>
                        <span style={{ marginLeft: 8, color: kr === 0 ? '#7a7a72' : '#e8e8e4' }}>+{kr.toFixed(kr === Math.floor(kr) ? 0 : 2)} kr</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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

          {/* 6. Sortiment — formel-config */}
          <div style={s.sectionTitle as CSSProperties}>Sortiment</div>
          <div style={s.sectionBlurb as CSSProperties}>Tillägg per m³fub: (antal sortiment − grundantal) × kr/m³fub.</div>
          <div style={s.card}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <div style={{ fontSize: 11, color: '#7a7a72', fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>Grundantal sortiment</div>
                <NumInput value={sortiment.grundantal} onChange={v => updateSort({ grundantal: v })} placeholder="6" />
                <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 4 }}>Under detta antal: inget tillägg.</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#7a7a72', fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>Tillägg per extra sortiment</div>
                <NumInput value={sortiment.kr_per_extra_sortiment} onChange={v => updateSort({ kr_per_extra_sortiment: v })} step="0.01" placeholder="2" />
                <div style={{ fontSize: 10, color: '#7a7a72', marginTop: 4 }}>kr/m³fub</div>
              </div>
              <button
                style={{ ...s.btnDark, opacity: savingSort ? 0.6 : 1 } as CSSProperties}
                disabled={savingSort}
                onClick={saveSort}>
                {savingSort ? 'Sparar...' : 'Spara'}
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              {datePillFor(sortiment.giltig_fran)}
            </div>
            {sortiment.grundantal !== '' && sortiment.kr_per_extra_sortiment !== '' && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 10, color: '#7a7a72', fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>Exempel</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#bfcab9' }}>
                  {[6, 7, 8, 9, 10, 12].map(n => {
                    const g = Number(sortiment.grundantal), k = Number(sortiment.kr_per_extra_sortiment);
                    const extra = Math.max(0, n - g);
                    const kr = extra * k;
                    return (
                      <div key={n} style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 10px', borderRadius: 8 }}>
                        <span style={{ color: '#7a7a72' }}>{n} st</span>
                        <span style={{ marginLeft: 8, color: kr === 0 ? '#7a7a72' : '#e8e8e4' }}>+{kr.toFixed(kr === Math.floor(kr) ? 0 : 2)} kr</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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

          {/* Kostnadsställe per maskin — stöder flera CC per maskin */}
          <div style={s.sectionTitle as CSSProperties}>Kostnadsställe per maskin (Fortnox)</div>
          <div style={s.sectionBlurb as CSSProperties}>Flera kostnadsställen kan kopplas till samma maskin — används när Fortnox har skilda CC för intäkter och kostnader (t.ex. Scorpion Gigant med både SCO och M13).</div>
          <div style={s.card}>
            {maskinOptLista.map((m, idx) => {
              const kopplade = mappningar.filter(x => x.maskin_id === m.maskin_id);
              return (
                <div key={m.maskin_id} style={{ padding: '12px 0', borderBottom: idx < maskinOptLista.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{m.modell || m.maskin_id}</div>
                      <div style={{ fontSize: 10, color: '#7a7a72', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{m.maskin_id}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                      {kopplade.length === 0 && (
                        <span style={{ fontSize: 11, color: '#7a7a72', fontStyle: 'italic' as const }}>inga kostnadsställen</span>
                      )}
                      {kopplade.map(k => {
                        const cc = fortnoxCc.find(c => c.kod === k.kostnadsstalle_kod);
                        return (
                          <span key={k.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 6px 4px 10px', background: 'rgba(173,198,255,0.08)', border: '1px solid rgba(173,198,255,0.2)', borderRadius: 999, color: '#adc6ff' }}
                            title={cc?.namn || ''}>
                            <span style={{ fontWeight: 600 }}>{k.kostnadsstalle_kod}</span>
                            {cc?.namn && <span style={{ color: '#7a7a72' }}>{cc.namn}</span>}
                            <button
                              onClick={() => taBortMappning(k.id)}
                              disabled={savingCcMap}
                              style={{ background: 'transparent', border: 'none', color: '#7a7a72', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}
                              aria-label="Ta bort mappning">×</button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
            {maskinOptLista.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Inga maskiner i dim_maskin.</div>}
          </div>

          {/* Omappade kostnadsställen från Fortnox */}
          <div style={s.sectionTitle as CSSProperties}>Omappade kostnadsställen</div>
          <div style={s.sectionBlurb as CSSProperties}>
            Kostnadsställen i Fortnox som inte är kopplade till någon maskin. Välj maskin och tryck Koppla — eller lämna som ”egna kostnadsobjekt” (t.ex. M8 Lastbil, TRA Trailer).
          </div>
          <div style={s.card}>
            {omappadeCc.length === 0 && <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>Alla kostnadsställen är mappade.</div>}
            {omappadeCc.map((cc, idx) => (
              <div key={cc.kod} style={{ padding: '12px 0', borderBottom: idx < omappadeCc.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.6fr auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {cc.kod}
                      {cc.aktiv === false && <span style={{ marginLeft: 6, fontSize: 10, color: '#7a7a72' }}>(inaktiv)</span>}
                      {cc.har_trafik && <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(255,179,64,0.95)' }}>• data finns</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#7a7a72', marginTop: 2 }}>{cc.namn || '—'}</div>
                  </div>
                  <select
                    style={{ ...s.input, fontSize: 12 } as CSSProperties}
                    value={omappadVal[cc.kod] || ''}
                    onChange={e => setOmappadVal(prev => ({ ...prev, [cc.kod]: e.target.value }))}>
                    <option value="">Välj maskin…</option>
                    {maskinOptLista.map(m => (
                      <option key={m.maskin_id} value={m.maskin_id}>{m.modell || m.maskin_id}</option>
                    ))}
                  </select>
                  <button
                    style={{ ...s.btnDark, opacity: !omappadVal[cc.kod] || savingCcMap ? 0.4 : 1 } as CSSProperties}
                    disabled={!omappadVal[cc.kod] || savingCcMap}
                    onClick={() => läggTillMappning(omappadVal[cc.kod], cc.kod)}>
                    Koppla
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Omappade fakturarader */}
          <div style={s.sectionTitle as CSSProperties}>Omappade fakturarader</div>
          <div style={s.sectionBlurb as CSSProperties}>
            Rader där VO-regex inte hittade matchande objekt. Välj objekt manuellt — detta bevaras över framtida synkar.
          </div>
          <div style={s.card}>
            {omappade.length === 0 && (
              <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0' }}>
                Inga omappade rader. Kör <code style={{ fontFamily: 'inherit', color: '#bfcab9' }}>POST /api/fortnox/sync-invoices?full=1</code> för första synkningen.
              </div>
            )}
            {omappade.map((r, idx) => {
              const isSaving = savingMap === r.id;
              return (
                <div key={r.id} style={{ padding: '12px 0', borderBottom: idx < omappade.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Faktura {r.document_number}</div>
                    <div style={{ fontSize: 10, color: '#7a7a72', fontVariantNumeric: 'tabular-nums' }}>
                      {r.invoice_date || '—'} · {r.total != null ? Math.round(r.total).toLocaleString('sv-SE') : '—'} kr
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#bfcab9', marginBottom: 8, fontStyle: 'italic' }}>
                    {r.description || '(ingen beskrivning)'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                    <select
                      value={r.valt_objekt_id}
                      onChange={e => updateOmappad(idx, e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 8, padding: '8px 10px', color: '#e8e8e4', fontSize: 13,
                        fontFamily: 'inherit', outline: 'none', width: '100%',
                      }}>
                      <option value="">— Välj objekt —</option>
                      {objektVal.map(o => <option key={o.objekt_id} value={o.objekt_id}>{o.label}</option>)}
                    </select>
                    <button
                      style={{ ...s.btnDark, opacity: isSaving || !r.valt_objekt_id ? 0.6 : 1 } as CSSProperties}
                      disabled={isSaving || !r.valt_objekt_id}
                      onClick={() => saveOmappad(idx)}>
                      {isSaving ? 'Sparar...' : 'Mappa'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sortiment-grupp-mappning */}
          <div style={s.sectionTitle as CSSProperties}>Sortimentgrupp-mappning</div>
          <div style={s.sectionBlurb as CSSProperties}>
            Varje sortiment-id får en grupp som räknas i acord (Timmer/Klentimmer/Kubb/Massa/Energi/Övrigt).
            Välj "Exkluderat" för Avkap, test och fallback. Manuell ändring skyddas från framtida auto-seed.
          </div>
          <div style={{ ...s.card, padding: 14 } as CSSProperties}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {['Alla', 'Ej manuella', 'Exkluderade', 'Timmer', 'Klentimmer', 'Kubb', 'Massa', 'Energi', 'Övrigt'].map(f => (
                <button key={f}
                  style={{
                    ...s.periodBtn,
                    ...(sortGruppFilter === f ? s.periodBtnActive : {}),
                  } as CSSProperties}
                  onClick={() => setSortGruppFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
            {(() => {
              const filtered = sortGruppRader.filter(r => {
                if (sortGruppFilter === 'Alla') return true;
                if (sortGruppFilter === 'Ej manuella') return !r.grupp_manuell;
                if (sortGruppFilter === 'Exkluderade') return r.grupp == null;
                return r.grupp === sortGruppFilter;
              });
              if (filtered.length === 0) {
                return <div style={{ color: '#7a7a72', fontSize: 12, padding: '8px 0', textAlign: 'center' }}>Inga rader i filtret.</div>;
              }
              return (
                <div>
                  <div style={{ fontSize: 10, color: '#7a7a72', marginBottom: 8 }}>Visar {filtered.length} av {sortGruppRader.length} sortiment.</div>
                  {filtered.map(r => {
                    const idx = sortGruppRader.findIndex(x => x.sortiment_id === r.sortiment_id);
                    const isSaving = savingSortGrupp === r.sortiment_id;
                    return (
                      <div key={r.sortiment_id} style={{
                        padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 8, alignItems: 'center',
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.namn || <span style={{ color: '#7a7a72', fontStyle: 'italic' }}>(tom)</span>}
                          </div>
                          <div style={{ fontSize: 9, color: '#7a7a72', fontFamily: 'ui-monospace, monospace', marginTop: 1 }}>
                            {r.sortiment_id}
                            {r.grupp_manuell && <span style={{ marginLeft: 6, color: 'rgba(173,198,255,0.7)' }}>● manuell</span>}
                          </div>
                        </div>
                        <select
                          value={r.grupp ?? ''}
                          onChange={e => updateSortGrupp(idx, e.target.value || null)}
                          style={{
                            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, padding: '6px 8px', color: '#e8e8e4', fontSize: 12,
                            fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                          }}>
                          <option value="">Exkluderat</option>
                          {SORT_GRUPPER.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <button
                          style={{ ...s.btnDark, padding: '6px 10px', fontSize: 11, opacity: isSaving || !r.dirty ? 0.4 : 1 } as CSSProperties}
                          disabled={isSaving || !r.dirty}
                          onClick={() => saveSortGrupp(idx)}>
                          {isSaving ? '…' : 'Spara'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

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
