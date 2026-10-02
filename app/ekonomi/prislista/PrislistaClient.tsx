'use client';

// Prislista — EGEN vy i A4-tabellstil för dator (utbruten ur Inställningar,
// steg 1 av 3; Fortnox-mappning och datamappning ligger kvar i
// /ekonomi/installningar tills de får egna vyer).
//
// BARA PRISER: grundpris per medelstam överst (det viktigaste), sedan
// maskinpriser, sedan tilläggen. Rubriker i små dämpade versaler, talceller
// högerställda i TAL_FONT, luft i stället för Excel-linjer.
//
// SPARLOGIKEN ÄR HELIG: priser versionshanteras — ändring avslutar gamla
// raden (giltig_till = igår) och skriver en ny (giltig_fran = idag), via
// lib/ekonomi/prisversion (ordagrant utbrutna helpers) och uppdateraVerifierat
// för dim_maskin. En snygg vy som tyst slutar spara vore katastrof: priser
// uppdateras inte och ekonomin räknar fel. Varje Spara visar bekräftelse.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { uppdateraVerifierat } from '@/lib/supabase-save';
import { saveAllBracket, saveOneByKey, saveFormelConfig, todayIso, yesterdayIso } from '@/lib/ekonomi/prisversion';
import { VARDEMINSKNING_FORVAL_SKORDARE, VARDEMINSKNING_FORVAL_SKOTARE } from '@/lib/ekonomi/vardeminskning';
import { FORESTLINK_KR_PER_TIM } from '@/lib/ekonomi/forestlink';
import { EkonomiSida, Lista, SektionsTitel, Laddar, MAXBREDD_BRED } from '../delade/mall';
import { rubrikCell, talCell, gridRad } from '../delade/tabell';
import { FARG, TYP, TAL_FONT, AVSTAND, RADIE, KNAPP, TRAFFYTA } from '@/lib/design/tokens';

type Num = number | '';

type MaskinRad = {
  id?: string; maskin_id: string; maskin_namn: string; timpris: Num;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
  // Verklig värdeminskning (dim_maskin, INTE timpris-versionerad):
  // kr/G15-tim är ENDA modellen (Ponsse-säljarens); tomt = räknas ej.
  vardeminskning_kr_per_g15h: Num;
  sald: boolean; sald_datum: string;  // avyttrad = ingen värdeminskning framåt
  // ForestLink (dim_maskin, konstant hela året): ibockad = +FORESTLINK_KR_PER_TIM
  // kr/tim på timpeng. Basen i timpris-fältet är ALDRIG bas+FL — tillägget
  // läggs på i motorn (lib/ekonomi/forestlink), inte i det sparade priset.
  forestlink: boolean;
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
type OvrigtRad = {
  id?: string; nyckel: string; beskrivning: string; varde: Num; enhet: string;
  giltig_fran: string | null; isNew?: boolean; dirty?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE');
}
function numOrNull(v: Num): number | null {
  return v === '' || v === null ? null : Number(v);
}

// Tabellkolumner (A4-grid, luft — inga cellinjer)
const ACORD_KOLUMNER = 'minmax(0, 1fr) repeat(3, minmax(0, 1fr)) minmax(0, 0.3fr)';
const MASKIN_KOLUMNER = 'minmax(0, 1.2fr) minmax(0, 1.4fr) repeat(2, minmax(0, 1fr)) minmax(0, 1.2fr) minmax(0, 0.9fr) minmax(0, 0.7fr)';
const TRAKT_KOLUMNER = 'repeat(3, minmax(0, 1fr)) minmax(0, 0.3fr)';
const TERRANG_KOLUMNER = 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.7fr)';
const OVRIGT_KOLUMNER = 'minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 0.8fr) minmax(0, 0.6fr) minmax(0, 0.7fr)';

// Redigerbara fält — tokeniserade. MODULNIVÅ, inte inne i komponenten: en
// inline-definierad komponent får ny typreferens varje render → React
// remountar inputen på varje tangenttryck och fokus tappas efter varje
// siffra (inköpsår-buggen, fixad i #358). Stabil referens är kravet.
const inputStil = {
  background: FARG.fyllning, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.rad,
  padding: `${AVSTAND.s}px ${AVSTAND.m}px`, color: FARG.text, ...TYP.meta,
  fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
};
const NumInput = ({ value, onChange, step, placeholder }: { value: Num; onChange: (v: Num) => void; step?: string; placeholder?: string }) => (
  <input
    style={{ ...inputStil, ...TAL_FONT, textAlign: 'right' }}
    type="number" step={step || '1'} inputMode={step ? 'decimal' : 'numeric'}
    value={value}
    onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
    placeholder={placeholder}
  />
);
const TextInput = ({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) => (
  <input style={{ ...inputStil, opacity: disabled ? 0.5 : 1 }} value={value} disabled={disabled}
    onChange={e => onChange(e.target.value)} placeholder={placeholder} />
);

export default function PrislistaClient() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [laddFel, setLaddFel] = useState('');  // beständigt — försvinner inte som sparat-bekräftelsen

  const [maskiner, setMaskiner] = useState<MaskinRad[]>([]);
  const [acord, setAcord] = useState<AcordRad[]>([]);
  const [avstand, setAvstand] = useState<AvstandConfig>({ grundavstand_m: '', kr_per_100m: '', giltig_fran: null });
  const [trakt, setTrakt] = useState<TraktRad[]>([]);
  const [terrang, setTerrang] = useState<TerrangRad[]>([]);
  const [sortiment, setSortiment] = useState<SortConfig>({ grundantal: '', kr_per_extra_sortiment: '', giltig_fran: null });
  const [ovrigt, setOvrigt] = useState<OvrigtRad[]>([]);

  const [savingMaskin, setSavingMaskin] = useState<string | null>(null);
  const [savingAcord, setSavingAcord] = useState(false);
  const [savingAvstand, setSavingAvstand] = useState(false);
  const [savingTrakt, setSavingTrakt] = useState(false);
  const [savingTerrang, setSavingTerrang] = useState<string | null>(null);
  const [savingSort, setSavingSort] = useState(false);
  const [savingOvrigt, setSavingOvrigt] = useState<string | null>(null);

  const flashMsg = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [mRes, aRes, avRes, trRes, teRes, soRes, ovRes, dimMaskinRes] = await Promise.all([
      supabase.from('maskin_timpris').select('id, maskin_id, maskin_namn, timpris, giltig_fran, giltig_till').is('giltig_till', null).order('maskin_namn'),
      supabase.from('acord_priser').select('id, medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till').is('giltig_till', null).order('medelstam'),
      supabase.from('acord_skotningsavstand').select('id, grundavstand_m, kr_per_100m, giltig_fran, giltig_till').is('giltig_till', null).not('grundavstand_m', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
      supabase.from('acord_traktstorlek').select('id, fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub'),
      supabase.from('acord_terrang').select('id, namn, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('namn'),
      supabase.from('acord_sortiment_tillagg').select('id, grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
      supabase.from('acord_ovrigt').select('id, nyckel, beskrivning, varde, enhet, giltig_fran, giltig_till').is('giltig_till', null).order('nyckel'),
      supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ, vardeminskning_kr_per_g15h, sald, sald_datum, forestlink').order('visningsnamn', { nullsFirst: false }),
    ]);
    // Ärligt fel: ett tyst tomt dim_maskin-svar skulle visa FÖRVALEN som om
    // de vore sparade värden (och en Spara skriver då över dem).
    setLaddFel(dimMaskinRes.error ? `Kunde inte läsa maskindata (dim_maskin): ${dimMaskinRes.error.message}` : '');
    const dimMap: Record<string, any> = {};
    for (const d of (dimMaskinRes.data || [])) dimMap[d.maskin_id] = d;
    setMaskiner((mRes.data || []).map((m: any) => ({
      id: m.id, maskin_id: m.maskin_id, maskin_namn: m.maskin_namn || '', timpris: m.timpris, giltig_fran: m.giltig_fran,
      // kr/G15-tim: förval efter maskintyp när inget sparats (skördare 400,
      // skotare 300 — mitten av Ponsse-spannet). Aktivt tömt = null = räknas ej.
      vardeminskning_kr_per_g15h: dimMap[m.maskin_id]?.vardeminskning_kr_per_g15h
        ?? (dimMap[m.maskin_id]?.maskin_typ === 'Forwarder' ? VARDEMINSKNING_FORVAL_SKOTARE : VARDEMINSKNING_FORVAL_SKORDARE),
      sald: !!dimMap[m.maskin_id]?.sald,
      sald_datum: dimMap[m.maskin_id]?.sald_datum || '',
      // Kolumnen är NOT NULL default true; saknad dim-rad → false (okänt är inte "ja")
      forestlink: dimMap[m.maskin_id]?.forestlink === true,
    })));
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
    setOvrigt((ovRes.data || []).map((a: any) => ({ id: a.id, nyckel: a.nyckel, beskrivning: a.beskrivning || '', varde: a.varde, enhet: a.enhet || '', giltig_fran: a.giltig_fran })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Maskin ── (sparlogiken ordagrant från Inställningar — rör ej)
  const updateMaskin = (idx: number, p: Partial<MaskinRad>) => setMaskiner(prev => prev.map((m, i) => i === idx ? { ...m, ...p, dirty: true } : m));
  const addMaskin = () => setMaskiner(prev => [...prev, { maskin_id: '', maskin_namn: '', timpris: '', vardeminskning_kr_per_g15h: '', sald: false, sald_datum: '', forestlink: true, giltig_fran: null, isNew: true, dirty: true }]);
  const saveMaskin = async (idx: number) => {
    const row = maskiner[idx];
    if (!row.maskin_id.trim() || !row.maskin_namn.trim() || row.timpris === '' || Number(row.timpris) <= 0) { flashMsg('Fyll i maskin-ID, namn och ett pris > 0'); return; }
    setSavingMaskin(row.maskin_id || `ny-${idx}`);
    const err = await saveOneByKey(supabase, 'maskin_timpris', 'maskin_id', row.maskin_id, {
      maskin_id: row.maskin_id.trim(), maskin_namn: row.maskin_namn.trim(), timpris: Number(row.timpris),
    }, !!row.isNew);
    if (err) { setSavingMaskin(null); flashMsg(`Fel: ${err.message}`); return; }

    // Värdeminskningen bor i dim_maskin (admin-only RLS — chef får tyst 0
    // rader, därför verifierat sparande med värde-återläsning, aldrig tyst).
    const villSaldDatum = row.sald && row.sald_datum ? row.sald_datum : null;
    const villKrPerTim = numOrNull(row.vardeminskning_kr_per_g15h);
    const dimRes = await uppdateraVerifierat(
      supabase, 'dim_maskin',
      { vardeminskning_kr_per_g15h: villKrPerTim, sald: row.sald, sald_datum: villSaldDatum, forestlink: row.forestlink },
      { maskin_id: row.maskin_id.trim() },
      'maskin_id, vardeminskning_kr_per_g15h, sald, sald_datum, forestlink',
    );
    setSavingMaskin(null);
    if (!dimRes.ok) { flashMsg(`Timpris sparat, men värdeminskning: ${dimRes.fel}`); return; }
    const r0: any = dimRes.rows[0];
    const landat = (v: any) => (v == null ? null : Number(v));
    if (landat(r0.vardeminskning_kr_per_g15h) !== villKrPerTim
        || !!r0.sald !== row.sald || (r0.sald_datum || null) !== villSaldDatum
        || !!r0.forestlink !== row.forestlink) {
      flashMsg('Värdeminskning: värdet landade inte i dim_maskin — kontrollera behörighet'); return;
    }
    flashMsg(`Sparat: ${row.maskin_namn}`);
    await fetchData();
  };

  // ── Grundpris per medelstam ──
  const updateAcord = (idx: number, p: Partial<AcordRad>) => setAcord(prev => prev.map((a, i) => i === idx ? { ...a, ...p, dirty: true } : a));
  const removeAcord = (idx: number) => setAcord(prev => prev.filter((_, i) => i !== idx));
  const addAcord = () => setAcord(prev => [...prev, { medelstam: '', pris_total: '', pris_skordare: '', pris_skotare: '', giltig_fran: null, isNew: true, dirty: true }]);
  const saveAllAcord = async () => {
    for (const r of acord) {
      if (r.medelstam === '' || r.pris_total === '' || r.pris_skordare === '' || r.pris_skotare === '') { flashMsg('Alla acord-fält måste vara ifyllda'); return; }
      if (Number(r.pris_total) <= 0 || Number(r.medelstam) <= 0) { flashMsg('Pris och medelstam måste vara > 0'); return; }
    }
    setSavingAcord(true);
    const err = await saveAllBracket(supabase, 'acord_priser', acord, r => ({
      medelstam: Number(r.medelstam), pris_total: Number(r.pris_total), pris_skordare: Number(r.pris_skordare), pris_skotare: Number(r.pris_skotare),
    }));
    setSavingAcord(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Ny grundprisuppsättning sparad');
    await fetchData();
  };

  // ── Skotningsavstånd (formel-config, en rad) ──
  const saveAvstand = async () => {
    if (avstand.grundavstand_m === '' || avstand.kr_per_100m === '') {
      flashMsg('Fyll i grundavstånd och tillägg'); return;
    }
    setSavingAvstand(true);
    const err = await saveFormelConfig(supabase, 'acord_skotningsavstand', 'grundavstand_m', {
      grundavstand_m: Number(avstand.grundavstand_m),
      kr_per_100m: Number(avstand.kr_per_100m),
    });
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
    const err = await saveAllBracket(supabase, 'acord_traktstorlek', trakt, r => ({
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
    const err = await saveOneByKey(supabase, 'acord_terrang', 'namn', row.namn.trim(), {
      namn: row.namn.trim(), tillagg_kr_per_m3fub: Number(row.tillagg_kr_per_m3fub),
    }, !!row.isNew);
    setSavingTerrang(null);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg(`Sparat: ${row.namn}`);
    await fetchData();
  };

  // ── Sortiment (formel-config, en rad) ──
  const saveSort = async () => {
    if (sortiment.grundantal === '' || sortiment.kr_per_extra_sortiment === '') {
      flashMsg('Fyll i grundantal och tillägg'); return;
    }
    setSavingSort(true);
    const err = await saveFormelConfig(supabase, 'acord_sortiment_tillagg', 'grundantal', {
      grundantal: Number(sortiment.grundantal),
      kr_per_extra_sortiment: Number(sortiment.kr_per_extra_sortiment),
    });
    setSavingSort(false);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg('Sortiment sparat');
    await fetchData();
  };

  // ── Övrigt ──
  const updateOvrigt = (idx: number, p: Partial<OvrigtRad>) => setOvrigt(prev => prev.map((a, i) => i === idx ? { ...a, ...p, dirty: true } : a));
  const addOvrigt = () => setOvrigt(prev => [...prev, { nyckel: '', beskrivning: '', varde: '', enhet: '', giltig_fran: null, isNew: true, dirty: true }]);
  const saveOvrigt = async (idx: number) => {
    const row = ovrigt[idx];
    if (!row.nyckel.trim() || row.varde === '') { flashMsg('Övrigt: nyckel och värde krävs'); return; }
    setSavingOvrigt(row.nyckel || `ny-${idx}`);
    const err = await saveOneByKey(supabase, 'acord_ovrigt', 'nyckel', row.nyckel.trim(), {
      nyckel: row.nyckel.trim(), beskrivning: row.beskrivning || null, varde: Number(row.varde), enhet: row.enhet || null,
    }, !!row.isNew);
    setSavingOvrigt(null);
    if (err) { flashMsg(`Fel: ${err.message}`); return; }
    flashMsg(`Sparat: ${row.beskrivning || row.nyckel}`);
    await fetchData();
  };

  // ── Delade småstilar ──
  const sparaKnapp = (saving: boolean, onClick: () => void, text = 'Spara') => (
    <button style={{ ...KNAPP.sekundar, opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap' }} disabled={saving} onClick={onClick}>
      {saving ? 'Sparar…' : text}
    </button>
  );
  const laggTillKnapp = (text: string, onClick: () => void) => (
    <button style={{ ...KNAPP.tertiar, width: '100%' }} onClick={onClick}>+ {text}</button>
  );
  const tabortKnapp = (onClick: () => void) => (
    <button aria-label="Ta bort rad" style={{ background: 'none', border: 'none', color: FARG.text3, cursor: 'pointer', ...TYP.text, minHeight: TRAFFYTA.min, padding: 0 }} onClick={onClick}>×</button>
  );
  const gallerFran = (d: string | null) => (
    <span style={{ ...TYP.meta, color: FARG.text3 }}>Gäller från {formatDate(d)}</span>
  );
  const uppsattningsFot = (rows: { giltig_fran: string | null }[], saving: boolean, onSave: () => void) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: AVSTAND.m, gap: AVSTAND.m }}>
      <span style={{ ...TYP.meta, color: FARG.text3 }}>
        {rows.length > 0 && rows[0].giltig_fran ? `Nuvarande uppsättning gäller från ${formatDate(rows[0].giltig_fran)}` : 'Ingen aktiv uppsättning'}
      </span>
      {sparaKnapp(saving, onSave, 'Spara alla (ny uppsättning)')}
    </div>
  );
  const acordGrid = gridRad(ACORD_KOLUMNER);
  const maskGrid = gridRad(MASKIN_KOLUMNER);
  const traktGrid = gridRad(TRAKT_KOLUMNER);
  const terrangGrid = gridRad(TERRANG_KOLUMNER);
  const ovrigtGrid = gridRad(OVRIGT_KOLUMNER);
  const formelEtikett = { ...TYP.micro, color: FARG.text3, marginBottom: AVSTAND.xs } as const;

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
        <div style={TYP.titel}>Prislista</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
          Ändringar skapar nya rader med dagens datum ({todayIso()}) — gamla priser bevaras och äldre produktion räknas med de priser som gällde då.
        </div>

        {/* Sparat-bekräftelsen — ALLTID synlig vid lyckat/misslyckat spar */}
        {msg && (
          <div style={{
            marginTop: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`,
            background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.rad,
            ...TYP.meta, color: msg.startsWith('Fel') || msg.includes('inte') ? FARG.rod : FARG.gron,
          }}>
            {msg}
          </div>
        )}

        {laddFel && (
          <div style={{ marginTop: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.rad, ...TYP.meta, color: FARG.rod }}>
            {laddFel} — spara inte maskinpriser förrän det är löst (värdena nedan är förval, inte sparade).
          </div>
        )}

        {loading && <Laddar />}

        {!loading && (
          <>
            {/* 1. GRUNDPRIS PER MEDELSTAM — det viktigaste, överst.
                Totalt-kolumnen BEHÅLLS redigerbar: sparkontraktet skriver
                pris_total och att härleda den vore att ändra sparlogiken. */}
            <SektionsTitel>Grundpris per medelstam — kr/m³fub, slutavverkning</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ ...acordGrid, padding: `${AVSTAND.s}px 0` }}>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Medelstam</div>
                <div style={rubrikCell}>Skördare</div>
                <div style={rubrikCell}>Skotare</div>
                <div style={rubrikCell}>Totalt</div>
                <div />
              </div>
              {acord.map((a, idx) => (
                <div key={a.id || `ny-${idx}`} style={{ ...acordGrid, padding: `${AVSTAND.s}px 0` }}>
                  <NumInput value={a.medelstam} onChange={v => updateAcord(idx, { medelstam: v })} step="0.01" />
                  <NumInput value={a.pris_skordare} onChange={v => updateAcord(idx, { pris_skordare: v })} />
                  <NumInput value={a.pris_skotare} onChange={v => updateAcord(idx, { pris_skotare: v })} />
                  <NumInput value={a.pris_total} onChange={v => updateAcord(idx, { pris_total: v })} />
                  <div style={{ textAlign: 'right' }}>{tabortKnapp(() => removeAcord(idx))}</div>
                </div>
              ))}
              {acord.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Ingen aktiv uppsättning.</div>}
              {laggTillKnapp('Lägg till medelstam-rad', addAcord)}
              {uppsattningsFot(acord, savingAcord, saveAllAcord)}
            </Lista>

            {/* 2. MASKINPRISER (timpeng + värdeminskning + såld) */}
            <SektionsTitel>Maskinpriser</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ ...maskGrid, padding: `${AVSTAND.s}px 0` }}>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Maskin-ID</div>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Namn</div>
                <div style={rubrikCell}>Timpris kr/tim</div>
                <div style={rubrikCell}>Värdem. kr/G15h</div>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>FL</div>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Såld</div>
                <div />
              </div>
              {maskiner.map((m, idx) => {
                const isSaving = savingMaskin === (m.maskin_id || `ny-${idx}`);
                return (
                  <div key={m.id || `ny-${idx}`} style={{ padding: `${AVSTAND.s}px 0` }}>
                    <div style={{ ...maskGrid }}>
                      <TextInput value={m.maskin_id} onChange={v => updateMaskin(idx, { maskin_id: v })} placeholder="Maskin-ID" disabled={!m.isNew} />
                      <TextInput value={m.maskin_namn} onChange={v => updateMaskin(idx, { maskin_namn: v })} placeholder="Namn" />
                      <NumInput value={m.timpris} onChange={v => updateMaskin(idx, { timpris: v })} placeholder="kr/tim" />
                      <NumInput value={m.vardeminskning_kr_per_g15h} onChange={v => updateMaskin(idx, { vardeminskning_kr_per_g15h: v })} placeholder="tomt = räknas ej" />
                      {/* ForestLink: ibockad = +FORESTLINK_KR_PER_TIM kr/tim på timpeng */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2, cursor: 'pointer', minHeight: TRAFFYTA.min }}>
                        <input type="checkbox" checked={m.forestlink} onChange={e => updateMaskin(idx, { forestlink: e.target.checked })} />
                        {m.forestlink ? `+${FORESTLINK_KR_PER_TIM} kr/tim` : 'ingen FL'}
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: m.sald ? FARG.orange : FARG.text2, cursor: 'pointer' }}>
                        <input type="checkbox" checked={m.sald} onChange={e => updateMaskin(idx, { sald: e.target.checked })} />
                        Såld
                      </label>
                      <div style={{ textAlign: 'right' }}>{sparaKnapp(isSaving, () => saveMaskin(idx))}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginTop: AVSTAND.xs }}>
                      {gallerFran(m.giltig_fran)}
                      {m.timpris !== '' && m.forestlink && (
                        <span style={{ ...TYP.meta, color: FARG.text3 }}>
                          effektivt timpeng-pris {(Number(m.timpris) + FORESTLINK_KR_PER_TIM).toLocaleString('sv-SE')} kr/tim
                        </span>
                      )}
                      {m.isNew && <span style={{ ...TYP.meta, color: FARG.gron }}>Ny — ej sparad</span>}
                      {m.dirty && !m.isNew && <span style={{ ...TYP.meta, color: FARG.orange }}>Ändrad — ej sparad</span>}
                      {m.sald && (
                        <input type="date" value={m.sald_datum} onChange={e => updateMaskin(idx, { sald_datum: e.target.value })}
                          style={{ ...inputStil, width: 'auto' }} />
                      )}
                    </div>
                  </div>
                );
              })}
              {maskiner.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga aktiva maskinpriser.</div>}
              {laggTillKnapp('Lägg till maskin', addMaskin)}
            </Lista>
            <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>
              Värdeminskning: skördare ~300–500 · skotare ~250–350 kr/G15-tim (Ponsse, första 4000 h). Såld maskin bär ingen värdeminskning framåt.
            </div>

            {/* 3. TILLÄGG */}
            <SektionsTitel>Tillägg — skotavstånd</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) auto', columnGap: AVSTAND.l, alignItems: 'end' }}>
                <div>
                  <div style={formelEtikett}>Grundavstånd m — under detta: inget tillägg</div>
                  <NumInput value={avstand.grundavstand_m} onChange={v => setAvstand(prev => ({ ...prev, grundavstand_m: v }))} placeholder="200" />
                </div>
                <div>
                  <div style={formelEtikett}>Tillägg per påbörjad 100 m — kr/m³fub</div>
                  <NumInput value={avstand.kr_per_100m} onChange={v => setAvstand(prev => ({ ...prev, kr_per_100m: v }))} step="0.01" placeholder="4" />
                </div>
                {sparaKnapp(savingAvstand, saveAvstand)}
              </div>
              <div style={{ marginTop: AVSTAND.s }}>{gallerFran(avstand.giltig_fran)}</div>
            </Lista>

            <SektionsTitel>Tillägg — traktstorlek</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ ...traktGrid, padding: `${AVSTAND.s}px 0` }}>
                <div style={rubrikCell}>Från m³fub</div>
                <div style={rubrikCell}>Till m³fub (tom = ∞)</div>
                <div style={rubrikCell}>Tillägg kr/m³fub</div>
                <div />
              </div>
              {trakt.map((r, idx) => (
                <div key={r.id || `ny-${idx}`} style={{ ...traktGrid, padding: `${AVSTAND.s}px 0` }}>
                  <NumInput value={r.fran_m3fub} onChange={v => updateTrakt(idx, { fran_m3fub: v })} />
                  <NumInput value={r.till_m3fub} onChange={v => updateTrakt(idx, { till_m3fub: v })} />
                  <NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateTrakt(idx, { tillagg_kr_per_m3fub: v })} step="0.01" />
                  <div style={{ textAlign: 'right' }}>{tabortKnapp(() => removeTrakt(idx))}</div>
                </div>
              ))}
              {trakt.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga rader.</div>}
              {laggTillKnapp('Lägg till traktstorlek-rad', addTrakt)}
              {uppsattningsFot(trakt, savingTrakt, saveAllTrakt)}
            </Lista>

            <SektionsTitel>Tillägg — sortiment</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) auto', columnGap: AVSTAND.l, alignItems: 'end' }}>
                <div>
                  <div style={formelEtikett}>Grundantal sortiment — under detta: inget tillägg</div>
                  <NumInput value={sortiment.grundantal} onChange={v => setSortiment(prev => ({ ...prev, grundantal: v }))} placeholder="6" />
                </div>
                <div>
                  <div style={formelEtikett}>Tillägg per extra sortiment — kr/m³fub</div>
                  <NumInput value={sortiment.kr_per_extra_sortiment} onChange={v => setSortiment(prev => ({ ...prev, kr_per_extra_sortiment: v }))} step="0.01" placeholder="2" />
                </div>
                {sparaKnapp(savingSort, saveSort)}
              </div>
              <div style={{ marginTop: AVSTAND.s }}>{gallerFran(sortiment.giltig_fran)}</div>
            </Lista>

            <SektionsTitel>Tillägg — terräng</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ ...terrangGrid, padding: `${AVSTAND.s}px 0` }}>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Kategori</div>
                <div style={rubrikCell}>Tillägg kr/m³fub</div>
                <div />
              </div>
              {terrang.map((r, idx) => {
                const isSaving = savingTerrang === (r.namn || `ny-${idx}`);
                return (
                  <div key={r.id || `ny-${idx}`} style={{ padding: `${AVSTAND.s}px 0` }}>
                    <div style={terrangGrid}>
                      <TextInput value={r.namn} onChange={v => updateTerrang(idx, { namn: v })} placeholder="Terrängnamn" disabled={!r.isNew} />
                      <NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateTerrang(idx, { tillagg_kr_per_m3fub: v })} step="0.01" placeholder="kr/m³fub" />
                      <div style={{ textAlign: 'right' }}>{sparaKnapp(isSaving, () => saveTerrang(idx))}</div>
                    </div>
                    <div style={{ marginTop: AVSTAND.xs, display: 'flex', gap: AVSTAND.m }}>
                      {gallerFran(r.giltig_fran)}
                      {r.isNew && <span style={{ ...TYP.meta, color: FARG.gron }}>Ny — ej sparad</span>}
                    </div>
                  </div>
                );
              })}
              {terrang.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga terräng-kategorier.</div>}
              {laggTillKnapp('Lägg till terräng-kategori', addTerrang)}
            </Lista>

            <SektionsTitel>Tillägg — övrigt (kvalitetssäkring, flytt, diesel m.m.)</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <div style={{ ...ovrigtGrid, padding: `${AVSTAND.s}px 0` }}>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Nyckel</div>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Beskrivning</div>
                <div style={rubrikCell}>Värde</div>
                <div style={{ ...rubrikCell, textAlign: 'left' }}>Enhet</div>
                <div />
              </div>
              {ovrigt.map((r, idx) => {
                const isSaving = savingOvrigt === (r.nyckel || `ny-${idx}`);
                return (
                  <div key={r.id || `ny-${idx}`} style={{ padding: `${AVSTAND.s}px 0` }}>
                    <div style={ovrigtGrid}>
                      <TextInput value={r.nyckel} onChange={v => updateOvrigt(idx, { nyckel: v })} placeholder="Nyckel" disabled={!r.isNew} />
                      <TextInput value={r.beskrivning} onChange={v => updateOvrigt(idx, { beskrivning: v })} placeholder="Beskrivning" />
                      <NumInput value={r.varde} onChange={v => updateOvrigt(idx, { varde: v })} step="0.01" placeholder="Värde" />
                      <TextInput value={r.enhet} onChange={v => updateOvrigt(idx, { enhet: v })} placeholder="Enhet" />
                      <div style={{ textAlign: 'right' }}>{sparaKnapp(isSaving, () => saveOvrigt(idx))}</div>
                    </div>
                    <div style={{ marginTop: AVSTAND.xs, display: 'flex', gap: AVSTAND.m }}>
                      {gallerFran(r.giltig_fran)}
                      {r.isNew && <span style={{ ...TYP.meta, color: FARG.gron }}>Ny — ej sparad</span>}
                    </div>
                  </div>
                );
              })}
              {ovrigt.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga poster.</div>}
              {laggTillKnapp('Lägg till övrig post', addOvrigt)}
            </Lista>

            <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.sektion, lineHeight: 1.6 }}>
              Varje prisändring sparas som en ny rad med giltig_fran = {todayIso()}; den gamla raden får giltig_till = {yesterdayIso()} så historiken bevaras.
              Fortnox-mappning och datamappning ligger kvar under Inställningar.
            </div>
          </>
        )}
      </div>
    </EkonomiSida>
  );
}
