'use client';

// Prislista — EGEN vy i A4-tabellstil för dator (utbruten ur Inställningar;
// Fortnox-mappning och datamappning ligger kvar i /ekonomi/installningar).
//
// BARA PRISER: grundpris per medelstam överst (det viktigaste), sedan
// maskinpriser, sedan tilläggen. Rubriker i små dämpade versaler, talceller
// högerställda i TAL_FONT, luft i stället för Excel-linjer.
//
// SPARANDET — "man ska aldrig tro att något är sparat som inte är det":
// - EN knapp per sektion ("Spara ändringar") sparar ALLA smutsiga rader i
//   sektionen i ett svep; misslyckade rader behålls smutsiga med felmarkering
//   och "3 maskiner sparade" visas vid knappen (inte bara högst upp).
// - Smutsigt HÄRLEDS ur en ögonblicksbild av det som laddades — aldrig en
//   klibbig flagga — och efter ett spar laddas BARA den sparade sektionen om.
//   Ett spar kan därför aldrig skriva över osparade ändringar någon annanstans.
// - Lämnar man sidan med osparade ändringar varnas man (beforeunload + en
//   app-egen dialog för klick på länkar; window.confirm blockeras tyst i
//   inbäddade miljöer).
// - FÖRVAL ser inte ut som sparade värden: NULL i databasen är ett eget
//   tillstånd — tomt fält med förslaget som placeholder och orange "ej satt".
//
// Versionskontraktet är orört (lib/ekonomi/prisversion + uppdateraVerifierat);
// all spar-orkestrering bor i lib/ekonomi/prislistaSpara (ren, testad).

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { saveAllBracket, saveFormelConfig, todayIso, yesterdayIso } from '@/lib/ekonomi/prisversion';
import { VARDEMINSKNING_FORVAL_SKORDARE, VARDEMINSKNING_FORVAL_SKOTARE } from '@/lib/ekonomi/vardeminskning';
import { FORESTLINK_KR_PER_TIM } from '@/lib/ekonomi/forestlink';
import {
  type Num, numOrNull,
  type MaskinRad, maskinRadFranDb, arMaskinSmutsig, rebaseMaskin, sparaMaskinRad,
  type TerrangRad, terrangSnapshot, arTerrangSmutsig, rebaseTerrang, sparaTerrangRad,
  type OvrigtRad, ovrigtSnapshot, arOvrigtSmutsig, rebaseOvrigt, sparaOvrigtRad,
  acordSnapshot, traktSnapshot, avstandSnapshot, sortSnapshot,
  sparaAllaSmutsiga, sparaSammanfattning, slaIhopEfterSpar,
} from '@/lib/ekonomi/prislistaSpara';
import { EkonomiSida, Lista, SektionsTitel, Laddar, MAXBREDD_BRED } from '../delade/mall';
import { rubrikCell, talCell, gridRad } from '../delade/tabell';
import { FARG, TYP, TAL_FONT, AVSTAND, RADIE, KNAPP, TRAFFYTA } from '@/lib/design/tokens';

type AcordRad = {
  id?: string; medelstam: Num; pris_total: Num; pris_skordare: Num; pris_skotare: Num;
  giltig_fran: string | null;
};
type AvstandConfig = { id?: string; grundavstand_m: Num; kr_per_100m: Num; giltig_fran: string | null };
type TraktRad = { id?: string; fran_m3fub: Num; till_m3fub: Num; tillagg_kr_per_m3fub: Num; giltig_fran: string | null };
type SortConfig = { id?: string; grundantal: Num; kr_per_extra_sortiment: Num; giltig_fran: string | null };

type Sektion = 'maskiner' | 'acord' | 'avstand' | 'trakt' | 'sort' | 'terrang' | 'ovrigt';

// Förslag för formel-config när databasen saknar rad — visas som placeholder,
// aldrig som ifyllt värde.
const FORSLAG_AVSTAND = { grundavstand_m: 200, kr_per_100m: 4 };
const FORSLAG_SORT = { grundantal: 6, kr_per_extra_sortiment: 2 };

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('sv-SE');
}

// Tabellkolumner (A4-grid, luft — inga cellinjer)
const ACORD_KOLUMNER = 'minmax(0, 1fr) repeat(3, minmax(0, 1fr)) minmax(0, 0.3fr)';
const MASKIN_KOLUMNER = 'minmax(0, 1.2fr) minmax(0, 1.4fr) repeat(2, minmax(0, 1fr)) minmax(0, 1.2fr) minmax(0, 0.9fr)';
const TRAKT_KOLUMNER = 'repeat(3, minmax(0, 1fr)) minmax(0, 0.3fr)';
const TERRANG_KOLUMNER = 'minmax(0, 1.6fr) minmax(0, 1fr)';
const OVRIGT_KOLUMNER = 'minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 0.8fr) minmax(0, 0.6fr)';

// Sektionens innehåll låses medan ett spar pågår — en ändring som skrivs
// under pågående spar skulle annars försvinna i omladdningen.
const FIELDSET = { border: 'none', margin: 0, padding: 0, minWidth: 0 } as const;

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

// Lokalt rad-id (React-nyckel och identitet för misslyckade rader över omladdning)
let lidRaknare = 0;
const nyLid = () => `l${++lidRaknare}`;

// ── Hämtning per sektion (modulnivå: stabila, delar inget state) ─────────
// Ärligt fel på varje läsning: en tyst tom lista skulle visas som "ingen
// uppsättning" — och en Spara av en tom uppsättning avslutar alla priser.

async function hamtaMaskiner(): Promise<{ rader: MaskinRad[]; fel: string }> {
  const [mRes, dimRes] = await Promise.all([
    supabase.from('maskin_timpris').select('id, maskin_id, maskin_namn, timpris, giltig_fran, giltig_till').is('giltig_till', null).order('maskin_namn'),
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, maskin_typ, vardeminskning_kr_per_g15h, sald, sald_datum, forestlink').order('visningsnamn', { nullsFirst: false }),
  ]);
  if (mRes.error) return { rader: [], fel: `Kunde inte läsa maskinpriser (maskin_timpris): ${mRes.error.message}` };
  if (dimRes.error) return { rader: [], fel: `Kunde inte läsa maskindata (dim_maskin): ${dimRes.error.message}` };
  const dimMap: Record<string, any> = {};
  for (const d of (dimRes.data || [])) dimMap[d.maskin_id] = d;
  // NULL i databasen = tomt fält ("ej satt — räknas inte"); förslaget visas
  // som placeholder och blir ett värde först när någon väljer det.
  const rader = (mRes.data || []).map((m: any) => maskinRadFranDb(
    m, dimMap[m.maskin_id], nyLid,
    { skordare: VARDEMINSKNING_FORVAL_SKORDARE, skotare: VARDEMINSKNING_FORVAL_SKOTARE },
  ));
  return { rader, fel: '' };
}

async function hamtaAcord(): Promise<{ rader: AcordRad[]; fel: string }> {
  const r = await supabase.from('acord_priser').select('id, medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till').is('giltig_till', null).order('medelstam');
  if (r.error) return { rader: [], fel: `Kunde inte läsa grundpriser (acord_priser): ${r.error.message}` };
  return { rader: (r.data || []).map((a: any) => ({ id: a.id, medelstam: a.medelstam, pris_total: a.pris_total, pris_skordare: a.pris_skordare, pris_skotare: a.pris_skotare, giltig_fran: a.giltig_fran })), fel: '' };
}

async function hamtaAvstand(): Promise<{ data: AvstandConfig; fel: string }> {
  const r = await supabase.from('acord_skotningsavstand').select('id, grundavstand_m, kr_per_100m, giltig_fran, giltig_till').is('giltig_till', null).not('grundavstand_m', 'is', null).order('giltig_fran', { ascending: false }).limit(1);
  const tom: AvstandConfig = { grundavstand_m: '', kr_per_100m: '', giltig_fran: null };
  if (r.error) return { data: tom, fel: `Kunde inte läsa skotavstånd (acord_skotningsavstand): ${r.error.message}` };
  const row = (r.data || [])[0];
  return { data: row ? { id: row.id, grundavstand_m: row.grundavstand_m, kr_per_100m: row.kr_per_100m, giltig_fran: row.giltig_fran } : tom, fel: '' };
}

async function hamtaTrakt(): Promise<{ rader: TraktRad[]; fel: string }> {
  const r = await supabase.from('acord_traktstorlek').select('id, fran_m3fub, till_m3fub, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('fran_m3fub');
  if (r.error) return { rader: [], fel: `Kunde inte läsa traktstorlek (acord_traktstorlek): ${r.error.message}` };
  return { rader: (r.data || []).map((a: any) => ({ id: a.id, fran_m3fub: a.fran_m3fub, till_m3fub: a.till_m3fub ?? '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub, giltig_fran: a.giltig_fran })), fel: '' };
}

async function hamtaTerrang(): Promise<{ rader: TerrangRad[]; fel: string }> {
  const r = await supabase.from('acord_terrang').select('id, namn, tillagg_kr_per_m3fub, giltig_fran, giltig_till').is('giltig_till', null).order('namn');
  if (r.error) return { rader: [], fel: `Kunde inte läsa terräng (acord_terrang): ${r.error.message}` };
  return {
    rader: (r.data || []).map((a: any): TerrangRad => {
      const rad: TerrangRad = { lid: nyLid(), id: a.id, namn: a.namn || '', tillagg_kr_per_m3fub: a.tillagg_kr_per_m3fub ?? '', giltig_fran: a.giltig_fran, bas: '' };
      rad.bas = terrangSnapshot(rad);
      return rad;
    }),
    fel: '',
  };
}

async function hamtaSort(): Promise<{ data: SortConfig; fel: string }> {
  const r = await supabase.from('acord_sortiment_tillagg').select('id, grundantal, kr_per_extra_sortiment, giltig_fran, giltig_till').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1);
  const tom: SortConfig = { grundantal: '', kr_per_extra_sortiment: '', giltig_fran: null };
  if (r.error) return { data: tom, fel: `Kunde inte läsa sortimenttillägg (acord_sortiment_tillagg): ${r.error.message}` };
  const row = (r.data || [])[0];
  return { data: row ? { id: row.id, grundantal: row.grundantal, kr_per_extra_sortiment: row.kr_per_extra_sortiment, giltig_fran: row.giltig_fran } : tom, fel: '' };
}

async function hamtaOvrigt(): Promise<{ rader: OvrigtRad[]; fel: string }> {
  const r = await supabase.from('acord_ovrigt').select('id, nyckel, beskrivning, varde, enhet, giltig_fran, giltig_till').is('giltig_till', null).order('nyckel');
  if (r.error) return { rader: [], fel: `Kunde inte läsa övriga tillägg (acord_ovrigt): ${r.error.message}` };
  return {
    rader: (r.data || []).map((a: any): OvrigtRad => {
      const rad: OvrigtRad = { lid: nyLid(), id: a.id, nyckel: a.nyckel, beskrivning: a.beskrivning || '', varde: a.varde ?? '', enhet: a.enhet || '', giltig_fran: a.giltig_fran, bas: '' };
      rad.bas = ovrigtSnapshot(rad);
      return rad;
    }),
    fel: '',
  };
}

export default function PrislistaClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [laddFel, setLaddFel] = useState('');  // beständigt — försvinner inte som sparat-bekräftelsen

  const [maskiner, setMaskiner] = useState<MaskinRad[]>([]);
  const [acord, setAcord] = useState<AcordRad[]>([]);
  const [acordBas, setAcordBas] = useState('');
  const [avstand, setAvstand] = useState<AvstandConfig>({ grundavstand_m: '', kr_per_100m: '', giltig_fran: null });
  const [avstandBas, setAvstandBas] = useState('');
  const [trakt, setTrakt] = useState<TraktRad[]>([]);
  const [traktBas, setTraktBas] = useState('');
  const [terrang, setTerrang] = useState<TerrangRad[]>([]);
  const [sortiment, setSortiment] = useState<SortConfig>({ grundantal: '', kr_per_extra_sortiment: '', giltig_fran: null });
  const [sortBas, setSortBas] = useState('');
  const [ovrigt, setOvrigt] = useState<OvrigtRad[]>([]);

  const [sparar, setSparar] = useState<Partial<Record<Sektion, boolean>>>({});
  const [sektionMsg, setSektionMsg] = useState<Partial<Record<Sektion, { text: string; fel: boolean }>>>({});
  const [lamna, setLamna] = useState<{ href: string } | null>(null);

  // Bekräftelsen visas VID sparaknappen (där blicken är), inte bara högst upp.
  // Lyckat försvinner efter en stund; fel står kvar tills nästa spar.
  const visaMsg = (sek: Sektion, text: string, fel: boolean) => {
    setSektionMsg(p => ({ ...p, [sek]: { text, fel } }));
    if (!fel) setTimeout(() => setSektionMsg(p => (p[sek]?.text === text ? { ...p, [sek]: undefined } : p)), 6000);
  };

  const laddaAllt = useCallback(async () => {
    setLoading(true);
    const [m, a, av, tr, te, so, ov] = await Promise.all([
      hamtaMaskiner(), hamtaAcord(), hamtaAvstand(), hamtaTrakt(), hamtaTerrang(), hamtaSort(), hamtaOvrigt(),
    ]);
    setLaddFel([m.fel, a.fel, av.fel, tr.fel, te.fel, so.fel, ov.fel].filter(Boolean).join(' · '));
    setMaskiner(m.rader);
    setAcord(a.rader); setAcordBas(acordSnapshot(a.rader));
    setAvstand(av.data); setAvstandBas(avstandSnapshot(av.data));
    setTrakt(tr.rader); setTraktBas(traktSnapshot(tr.rader));
    setTerrang(te.rader);
    setSortiment(so.data); setSortBas(sortSnapshot(so.data));
    setOvrigt(ov.rader);
    setLoading(false);
  }, []);

  useEffect(() => { laddaAllt(); }, [laddaAllt]);

  // ── Härledd smutsighet (aldrig en klibbig flagga) ──
  const nMask = maskiner.filter(arMaskinSmutsig).length;
  const nTerr = terrang.filter(arTerrangSmutsig).length;
  const nOvr = ovrigt.filter(arOvrigtSmutsig).length;
  const acordSmutsig = acordSnapshot(acord) !== acordBas;
  const traktSmutsig = traktSnapshot(trakt) !== traktBas;
  const avstandSmutsig = avstandSnapshot(avstand) !== avstandBas;
  const sortSmutsig = sortSnapshot(sortiment) !== sortBas;
  const harOsparat = nMask + nTerr + nOvr > 0 || acordSmutsig || traktSmutsig || avstandSmutsig || sortSmutsig;

  // ── Varning vid lämnande av sidan med osparade ändringar ──
  // beforeunload fångar omladdning/stängning; klick på länkar (nav-flikarna är
  // next/link, som beforeunload inte ser) fångas i capture-fasen och ger en
  // APP-EGEN dialog (window.confirm blockeras tyst i inbäddade miljöer).
  // Webbläsarens tillbaka-knapp fångas inte i App Router.
  useEffect(() => {
    if (!harOsparat) return;
    const fore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const klick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setLamna({ href: url.pathname + url.search + url.hash });
    };
    window.addEventListener('beforeunload', fore);
    document.addEventListener('click', klick, true);
    return () => {
      window.removeEventListener('beforeunload', fore);
      document.removeEventListener('click', klick, true);
    };
  }, [harOsparat]);

  // Kör ett spar-jobb för en sektion: låser sektionen, visar resultatet vid knappen.
  const kor = async (sek: Sektion, jobb: () => Promise<{ text: string; fel: boolean }>) => {
    setSparar(p => ({ ...p, [sek]: true }));
    setSektionMsg(p => ({ ...p, [sek]: undefined }));
    try {
      const r = await jobb();
      visaMsg(sek, r.text, r.fel);
    } catch (e: any) {
      visaMsg(sek, `Fel: ${e?.message || 'okänt fel'}`, true);
    } finally {
      setSparar(p => ({ ...p, [sek]: false }));
    }
  };

  // ── Maskinpriser / terräng / övrigt: ALLA smutsiga rader i ett svep ──
  const sparaMaskiner = () => kor('maskiner', async () => {
    const res = await sparaAllaSmutsiga(maskiner, arMaskinSmutsig, r => sparaMaskinRad(supabase, r, maskiner));
    const mis = new Map(res.misslyckade.map(x => [x.rad.lid, x.fel]));
    const ny = await hamtaMaskiner();
    if (ny.fel) { setLaddFel(ny.fel); return { text: `${res.lyckade.length} sparade men kunde inte läsa om — ladda om sidan`, fel: true }; }
    setMaskiner(prev => slaIhopEfterSpar({ fresh: ny.rader, lokala: prev, misslyckade: mis, nyckel: r => r.maskin_id.trim(), rebase: rebaseMaskin }));
    return sparaSammanfattning(res.lyckade.length, res.misslyckade.length, 'maskin', 'maskiner');
  });

  const sparaTerrang = () => kor('terrang', async () => {
    const res = await sparaAllaSmutsiga(terrang, arTerrangSmutsig, r => sparaTerrangRad(supabase, r, terrang));
    const mis = new Map(res.misslyckade.map(x => [x.rad.lid, x.fel]));
    const ny = await hamtaTerrang();
    if (ny.fel) { setLaddFel(ny.fel); return { text: `${res.lyckade.length} sparade men kunde inte läsa om — ladda om sidan`, fel: true }; }
    setTerrang(prev => slaIhopEfterSpar({ fresh: ny.rader, lokala: prev, misslyckade: mis, nyckel: r => r.namn.trim(), rebase: rebaseTerrang }));
    return sparaSammanfattning(res.lyckade.length, res.misslyckade.length, 'terrängkategori', 'terrängkategorier');
  });

  const sparaOvrigt = () => kor('ovrigt', async () => {
    const res = await sparaAllaSmutsiga(ovrigt, arOvrigtSmutsig, r => sparaOvrigtRad(supabase, r, ovrigt));
    const mis = new Map(res.misslyckade.map(x => [x.rad.lid, x.fel]));
    const ny = await hamtaOvrigt();
    if (ny.fel) { setLaddFel(ny.fel); return { text: `${res.lyckade.length} sparade men kunde inte läsa om — ladda om sidan`, fel: true }; }
    setOvrigt(prev => slaIhopEfterSpar({ fresh: ny.rader, lokala: prev, misslyckade: mis, nyckel: r => r.nyckel.trim(), rebase: rebaseOvrigt }));
    return sparaSammanfattning(res.lyckade.length, res.misslyckade.length, 'post', 'poster');
  });

  // ── Hela uppsättningar (ny komplett version) och formel-config ──
  const sparaAcord = () => kor('acord', async () => {
    if (acord.length === 0) return { text: 'En tom prisuppsättning sparas aldrig — den skulle avsluta alla grundpriser utan ersättning', fel: true };
    for (const r of acord) {
      if (r.medelstam === '' || r.pris_total === '' || r.pris_skordare === '' || r.pris_skotare === '') return { text: 'Alla grundpris-fält måste vara ifyllda', fel: true };
      if (Number(r.pris_total) <= 0 || Number(r.medelstam) <= 0) return { text: 'Pris och medelstam måste vara > 0', fel: true };
    }
    const err = await saveAllBracket(supabase, 'acord_priser', acord, r => ({
      medelstam: Number(r.medelstam), pris_total: Number(r.pris_total), pris_skordare: Number(r.pris_skordare), pris_skotare: Number(r.pris_skotare),
    }));
    if (err) return { text: `Fel: ${err.message}`, fel: true };
    const ny = await hamtaAcord();
    if (ny.fel) { setLaddFel(ny.fel); return { text: 'Sparat men kunde inte läsa om — ladda om sidan', fel: true }; }
    setAcord(ny.rader); setAcordBas(acordSnapshot(ny.rader));
    return { text: 'Ny grundprisuppsättning sparad', fel: false };
  });

  const sparaAvstand = () => kor('avstand', async () => {
    if (avstand.grundavstand_m === '' || avstand.kr_per_100m === '') return { text: 'Fyll i grundavstånd och tillägg', fel: true };
    const err = await saveFormelConfig(supabase, 'acord_skotningsavstand', 'grundavstand_m', {
      grundavstand_m: Number(avstand.grundavstand_m),
      kr_per_100m: Number(avstand.kr_per_100m),
    });
    if (err) return { text: `Fel: ${err.message}`, fel: true };
    const ny = await hamtaAvstand();
    if (ny.fel) { setLaddFel(ny.fel); return { text: 'Sparat men kunde inte läsa om — ladda om sidan', fel: true }; }
    setAvstand(ny.data); setAvstandBas(avstandSnapshot(ny.data));
    return { text: 'Skotavstånd sparat', fel: false };
  });

  const sparaTrakt = () => kor('trakt', async () => {
    for (const r of trakt) {
      if (r.fran_m3fub === '' || r.tillagg_kr_per_m3fub === '') return { text: 'Traktstorlek: från och tillägg måste fyllas i', fel: true };
    }
    const err = await saveAllBracket(supabase, 'acord_traktstorlek', trakt, r => ({
      fran_m3fub: Number(r.fran_m3fub), till_m3fub: numOrNull(r.till_m3fub), tillagg_kr_per_m3fub: Number(r.tillagg_kr_per_m3fub),
    }));
    if (err) return { text: `Fel: ${err.message}`, fel: true };
    const ny = await hamtaTrakt();
    if (ny.fel) { setLaddFel(ny.fel); return { text: 'Sparat men kunde inte läsa om — ladda om sidan', fel: true }; }
    setTrakt(ny.rader); setTraktBas(traktSnapshot(ny.rader));
    return { text: 'Traktstorlek sparad', fel: false };
  });

  const sparaSort = () => kor('sort', async () => {
    if (sortiment.grundantal === '' || sortiment.kr_per_extra_sortiment === '') return { text: 'Fyll i grundantal och tillägg', fel: true };
    const err = await saveFormelConfig(supabase, 'acord_sortiment_tillagg', 'grundantal', {
      grundantal: Number(sortiment.grundantal),
      kr_per_extra_sortiment: Number(sortiment.kr_per_extra_sortiment),
    });
    if (err) return { text: `Fel: ${err.message}`, fel: true };
    const ny = await hamtaSort();
    if (ny.fel) { setLaddFel(ny.fel); return { text: 'Sparat men kunde inte läsa om — ladda om sidan', fel: true }; }
    setSortiment(ny.data); setSortBas(sortSnapshot(ny.data));
    return { text: 'Sortiment sparat', fel: false };
  });

  // ── Redigering (rör bara lokalt state) ──
  const updateMaskin = (lid: string, p: Partial<MaskinRad>) => setMaskiner(prev => prev.map(m => m.lid === lid ? { ...m, ...p, fel: undefined } : m));
  const addMaskin = () => setMaskiner(prev => [...prev, {
    lid: nyLid(), maskin_id: '', maskin_namn: '', timpris: '',
    vardeminskning_kr_per_g15h: '', forslagVm: VARDEMINSKNING_FORVAL_SKORDARE,
    sald: false, sald_datum: '', forestlink: true, dimFinns: true,
    giltig_fran: null, isNew: true, basTp: '', basDim: '',
  }]);
  const taBortNyMaskin = (lid: string) => setMaskiner(prev => prev.filter(m => m.lid !== lid));

  const updateAcord = (idx: number, p: Partial<AcordRad>) => setAcord(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeAcord = (idx: number) => setAcord(prev => prev.filter((_, i) => i !== idx));
  const addAcord = () => setAcord(prev => [...prev, { medelstam: '', pris_total: '', pris_skordare: '', pris_skotare: '', giltig_fran: null }]);

  const updateTrakt = (idx: number, p: Partial<TraktRad>) => setTrakt(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeTrakt = (idx: number) => setTrakt(prev => prev.filter((_, i) => i !== idx));
  const addTrakt = () => setTrakt(prev => [...prev, { fran_m3fub: '', till_m3fub: '', tillagg_kr_per_m3fub: '', giltig_fran: null }]);

  const updateTerrang = (lid: string, p: Partial<TerrangRad>) => setTerrang(prev => prev.map(a => a.lid === lid ? { ...a, ...p, fel: undefined } : a));
  const addTerrang = () => setTerrang(prev => [...prev, { lid: nyLid(), namn: '', tillagg_kr_per_m3fub: '', giltig_fran: null, isNew: true, bas: '' }]);
  const taBortNyTerrang = (lid: string) => setTerrang(prev => prev.filter(a => a.lid !== lid));

  const updateOvrigt = (lid: string, p: Partial<OvrigtRad>) => setOvrigt(prev => prev.map(a => a.lid === lid ? { ...a, ...p, fel: undefined } : a));
  const addOvrigt = () => setOvrigt(prev => [...prev, { lid: nyLid(), nyckel: '', beskrivning: '', varde: '', enhet: '', giltig_fran: null, isNew: true, bas: '' }]);
  const taBortNyOvrigt = (lid: string) => setOvrigt(prev => prev.filter(a => a.lid !== lid));

  // ── Delade småstilar ──
  const sparaKnapp = (saving: boolean, onClick: () => void, text: string, disabled = false) => (
    <button style={{ ...KNAPP.sekundar, opacity: saving || disabled ? 0.6 : 1, whiteSpace: 'nowrap' }} disabled={saving || disabled} onClick={onClick}>
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
  // Bekräftelse/fel vid sparaknappen
  const msgVid = (sek: Sektion) => sektionMsg[sek] && (
    <span style={{ ...TYP.meta, color: sektionMsg[sek]!.fel ? FARG.rod : FARG.gron }}>{sektionMsg[sek]!.text}</span>
  );
  // Fot för sektioner med en rad per nyckel: EN knapp som sparar alla smutsiga rader
  const sektionsFot = (sek: Sektion, antal: number, onSave: () => void) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: AVSTAND.m, gap: AVSTAND.m }}>
      <span style={{ ...TYP.meta, color: antal > 0 ? FARG.orange : FARG.text3 }}>
        {antal > 0 ? `${antal} ${antal === 1 ? 'ändring ej sparad' : 'ändringar ej sparade'}` : 'Inga osparade ändringar'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        {msgVid(sek)}
        {sparaKnapp(!!sparar[sek], onSave, antal > 0 ? `Spara ändringar (${antal})` : 'Spara ändringar', antal === 0)}
      </div>
    </div>
  );
  // Fot för hela uppsättningar: ny komplett version
  const uppsattningsFot = (sek: Sektion, rows: { giltig_fran: string | null }[], smutsig: boolean, onSave: () => void) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: AVSTAND.m, gap: AVSTAND.m }}>
      <span style={{ ...TYP.meta, color: smutsig ? FARG.orange : FARG.text3 }}>
        {smutsig ? 'Ändrad — ej sparad'
          : rows.length > 0 && rows[0].giltig_fran ? `Nuvarande uppsättning gäller från ${formatDate(rows[0].giltig_fran)}` : 'Ingen aktiv uppsättning'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        {msgVid(sek)}
        {sparaKnapp(!!sparar[sek], onSave, 'Spara alla (ny uppsättning)', !smutsig)}
      </div>
    </div>
  );
  const felRad = (fel?: string) => fel ? <span style={{ ...TYP.meta, color: FARG.rod }}>Ej sparad: {fel}</span> : null;

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

        {laddFel && (
          <div style={{ marginTop: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.rad, ...TYP.meta, color: FARG.rod }}>
            {laddFel} — spara inget förrän det är löst (det som visas kan vara ofullständigt).
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
              <fieldset disabled={!!sparar.acord} style={FIELDSET}>
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
              </fieldset>
              {uppsattningsFot('acord', acord, acordSmutsig, sparaAcord)}
            </Lista>

            {/* 2. MASKINPRISER (timpeng + värdeminskning + FL + såld) */}
            <SektionsTitel>Maskinpriser</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <fieldset disabled={!!sparar.maskiner} style={FIELDSET}>
                <div style={{ ...maskGrid, padding: `${AVSTAND.s}px 0` }}>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Maskin-ID</div>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Namn</div>
                  <div style={rubrikCell}>Timpris kr/tim</div>
                  <div style={rubrikCell}>Värdem. kr/G15h</div>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>FL</div>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Såld</div>
                </div>
                {maskiner.map(m => {
                  const andrad = !m.isNew && arMaskinSmutsig(m);
                  const kanSattaDim = m.dimFinns || !!m.isNew;
                  return (
                    <div key={m.lid} style={{ padding: `${AVSTAND.s}px 0` }}>
                      <div style={maskGrid}>
                        <TextInput value={m.maskin_id} onChange={v => updateMaskin(m.lid, { maskin_id: v })} placeholder="Maskin-ID" disabled={!m.isNew} />
                        <TextInput value={m.maskin_namn} onChange={v => updateMaskin(m.lid, { maskin_namn: v })} placeholder="Namn" />
                        <NumInput value={m.timpris} onChange={v => updateMaskin(m.lid, { timpris: v })} placeholder="kr/tim" />
                        {kanSattaDim ? (
                          <>
                            {/* NULL = tomt fält; förslaget är en placeholder, inte ett värde */}
                            <NumInput value={m.vardeminskning_kr_per_g15h} onChange={v => updateMaskin(m.lid, { vardeminskning_kr_per_g15h: v })} placeholder={`förslag ${m.forslagVm}`} />
                            {/* ForestLink: ibockad = +FORESTLINK_KR_PER_TIM kr/tim på timpeng */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2, cursor: 'pointer', minHeight: TRAFFYTA.min }}>
                              <input type="checkbox" checked={m.forestlink} onChange={e => updateMaskin(m.lid, { forestlink: e.target.checked })} />
                              {m.forestlink ? `+${FORESTLINK_KR_PER_TIM} kr/tim` : 'ingen FL'}
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: m.sald ? FARG.orange : FARG.text2, cursor: 'pointer' }}>
                              <input type="checkbox" checked={m.sald} onChange={e => updateMaskin(m.lid, { sald: e.target.checked })} />
                              Såld
                            </label>
                          </>
                        ) : (
                          <div style={{ gridColumn: 'span 3', ...TYP.meta, color: FARG.orange }}>
                            Maskinen saknas i dim_maskin — värdeminskning, FL och såld kan inte sättas
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: AVSTAND.m, marginTop: AVSTAND.xs }}>
                        {gallerFran(m.giltig_fran)}
                        {m.timpris !== '' && m.forestlink && kanSattaDim && (
                          <span style={{ ...TYP.meta, color: FARG.text3 }}>
                            effektivt timpeng-pris {(Number(m.timpris) + FORESTLINK_KR_PER_TIM).toLocaleString('sv-SE')} kr/tim
                          </span>
                        )}
                        {kanSattaDim && m.vardeminskning_kr_per_g15h === '' && (
                          <>
                            <span style={{ ...TYP.meta, color: FARG.orange }}>Värdeminskning ej satt — räknas inte</span>
                            <button style={{ ...KNAPP.tertiar, ...TYP.meta }} onClick={() => updateMaskin(m.lid, { vardeminskning_kr_per_g15h: m.forslagVm })}>
                              Använd förslag {m.forslagVm}
                            </button>
                          </>
                        )}
                        {m.sald && kanSattaDim && (
                          <input type="date" value={m.sald_datum} onChange={e => updateMaskin(m.lid, { sald_datum: e.target.value })}
                            style={{ ...inputStil, width: 'auto' }} />
                        )}
                        {m.isNew && <span style={{ ...TYP.meta, color: FARG.gron }}>Ny — ej sparad</span>}
                        {andrad && <span style={{ ...TYP.meta, color: FARG.orange }}>Ändrad — ej sparad</span>}
                        {felRad(m.fel)}
                        {m.isNew && (
                          <button style={{ ...KNAPP.tertiar, ...TYP.meta }} onClick={() => taBortNyMaskin(m.lid)}>Ta bort raden</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {maskiner.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga aktiva maskinpriser.</div>}
                {laggTillKnapp('Lägg till maskin', addMaskin)}
              </fieldset>
              {sektionsFot('maskiner', nMask, sparaMaskiner)}
            </Lista>
            <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>
              Värdeminskning: skördare ~300–500 · skotare ~250–350 kr/G15-tim (Ponsse, första 4000 h) — förslaget används aldrig tyst; tomt fält = ingen värdeminskning räknas. Såld maskin bär ingen värdeminskning framåt.
            </div>

            {/* 3. TILLÄGG */}
            <SektionsTitel>Tillägg — skotavstånd</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <fieldset disabled={!!sparar.avstand} style={FIELDSET}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: AVSTAND.l, alignItems: 'end' }}>
                  <div>
                    <div style={formelEtikett}>Grundavstånd m — under detta: inget tillägg</div>
                    <NumInput value={avstand.grundavstand_m} onChange={v => setAvstand(prev => ({ ...prev, grundavstand_m: v }))} placeholder={`förslag ${FORSLAG_AVSTAND.grundavstand_m}`} />
                  </div>
                  <div>
                    <div style={formelEtikett}>Tillägg per påbörjad 100 m — kr/m³fub</div>
                    <NumInput value={avstand.kr_per_100m} onChange={v => setAvstand(prev => ({ ...prev, kr_per_100m: v }))} step="0.01" placeholder={`förslag ${FORSLAG_AVSTAND.kr_per_100m}`} />
                  </div>
                </div>
              </fieldset>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: AVSTAND.s, gap: AVSTAND.m }}>
                {avstand.giltig_fran === null
                  ? <span style={{ ...TYP.meta, color: FARG.orange }}>Ej satt — inget skotavståndstillägg räknas</span>
                  : <span style={{ ...TYP.meta, color: avstandSmutsig ? FARG.orange : FARG.text3 }}>{avstandSmutsig ? 'Ändrad — ej sparad' : `Gäller från ${formatDate(avstand.giltig_fran)}`}</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
                  {msgVid('avstand')}
                  {sparaKnapp(!!sparar.avstand, sparaAvstand, 'Spara', !avstandSmutsig)}
                </div>
              </div>
            </Lista>

            <SektionsTitel>Tillägg — traktstorlek</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <fieldset disabled={!!sparar.trakt} style={FIELDSET}>
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
              </fieldset>
              {uppsattningsFot('trakt', trakt, traktSmutsig, sparaTrakt)}
            </Lista>

            <SektionsTitel>Tillägg — sortiment</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <fieldset disabled={!!sparar.sort} style={FIELDSET}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: AVSTAND.l, alignItems: 'end' }}>
                  <div>
                    <div style={formelEtikett}>Grundantal sortiment — under detta: inget tillägg</div>
                    <NumInput value={sortiment.grundantal} onChange={v => setSortiment(prev => ({ ...prev, grundantal: v }))} placeholder={`förslag ${FORSLAG_SORT.grundantal}`} />
                  </div>
                  <div>
                    <div style={formelEtikett}>Tillägg per extra sortiment — kr/m³fub</div>
                    <NumInput value={sortiment.kr_per_extra_sortiment} onChange={v => setSortiment(prev => ({ ...prev, kr_per_extra_sortiment: v }))} step="0.01" placeholder={`förslag ${FORSLAG_SORT.kr_per_extra_sortiment}`} />
                  </div>
                </div>
              </fieldset>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: AVSTAND.s, gap: AVSTAND.m }}>
                {sortiment.giltig_fran === null
                  ? <span style={{ ...TYP.meta, color: FARG.orange }}>Ej satt — inget sortimenttillägg räknas</span>
                  : <span style={{ ...TYP.meta, color: sortSmutsig ? FARG.orange : FARG.text3 }}>{sortSmutsig ? 'Ändrad — ej sparad' : `Gäller från ${formatDate(sortiment.giltig_fran)}`}</span>}
                <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
                  {msgVid('sort')}
                  {sparaKnapp(!!sparar.sort, sparaSort, 'Spara', !sortSmutsig)}
                </div>
              </div>
            </Lista>

            <SektionsTitel>Tillägg — terräng</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <fieldset disabled={!!sparar.terrang} style={FIELDSET}>
                <div style={{ ...terrangGrid, padding: `${AVSTAND.s}px 0` }}>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Kategori</div>
                  <div style={rubrikCell}>Tillägg kr/m³fub</div>
                </div>
                {terrang.map(r => (
                  <div key={r.lid} style={{ padding: `${AVSTAND.s}px 0` }}>
                    <div style={terrangGrid}>
                      <TextInput value={r.namn} onChange={v => updateTerrang(r.lid, { namn: v })} placeholder="Terrängnamn" disabled={!r.isNew} />
                      <NumInput value={r.tillagg_kr_per_m3fub} onChange={v => updateTerrang(r.lid, { tillagg_kr_per_m3fub: v })} step="0.01" placeholder="kr/m³fub" />
                    </div>
                    <div style={{ marginTop: AVSTAND.xs, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: AVSTAND.m }}>
                      {gallerFran(r.giltig_fran)}
                      {r.isNew && <span style={{ ...TYP.meta, color: FARG.gron }}>Ny — ej sparad</span>}
                      {!r.isNew && arTerrangSmutsig(r) && <span style={{ ...TYP.meta, color: FARG.orange }}>Ändrad — ej sparad</span>}
                      {felRad(r.fel)}
                      {r.isNew && <button style={{ ...KNAPP.tertiar, ...TYP.meta }} onClick={() => taBortNyTerrang(r.lid)}>Ta bort raden</button>}
                    </div>
                  </div>
                ))}
                {terrang.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga terräng-kategorier.</div>}
                {laggTillKnapp('Lägg till terräng-kategori', addTerrang)}
              </fieldset>
              {sektionsFot('terrang', nTerr, sparaTerrang)}
            </Lista>

            <SektionsTitel>Tillägg — övrigt (kvalitetssäkring, flytt, diesel m.m.)</SektionsTitel>
            <Lista style={{ padding: `${AVSTAND.m}px ${AVSTAND.sidmarginal}px` }}>
              <fieldset disabled={!!sparar.ovrigt} style={FIELDSET}>
                <div style={{ ...ovrigtGrid, padding: `${AVSTAND.s}px 0` }}>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Nyckel</div>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Beskrivning</div>
                  <div style={rubrikCell}>Värde</div>
                  <div style={{ ...rubrikCell, textAlign: 'left' }}>Enhet</div>
                </div>
                {ovrigt.map(r => (
                  <div key={r.lid} style={{ padding: `${AVSTAND.s}px 0` }}>
                    <div style={ovrigtGrid}>
                      <TextInput value={r.nyckel} onChange={v => updateOvrigt(r.lid, { nyckel: v })} placeholder="Nyckel" disabled={!r.isNew} />
                      <TextInput value={r.beskrivning} onChange={v => updateOvrigt(r.lid, { beskrivning: v })} placeholder="Beskrivning" />
                      <NumInput value={r.varde} onChange={v => updateOvrigt(r.lid, { varde: v })} step="0.01" placeholder="Värde" />
                      <TextInput value={r.enhet} onChange={v => updateOvrigt(r.lid, { enhet: v })} placeholder="Enhet" />
                    </div>
                    <div style={{ marginTop: AVSTAND.xs, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: AVSTAND.m }}>
                      {gallerFran(r.giltig_fran)}
                      {r.isNew && <span style={{ ...TYP.meta, color: FARG.gron }}>Ny — ej sparad</span>}
                      {!r.isNew && arOvrigtSmutsig(r) && <span style={{ ...TYP.meta, color: FARG.orange }}>Ändrad — ej sparad</span>}
                      {felRad(r.fel)}
                      {r.isNew && <button style={{ ...KNAPP.tertiar, ...TYP.meta }} onClick={() => taBortNyOvrigt(r.lid)}>Ta bort raden</button>}
                    </div>
                  </div>
                ))}
                {ovrigt.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Inga poster.</div>}
                {laggTillKnapp('Lägg till övrig post', addOvrigt)}
              </fieldset>
              {sektionsFot('ovrigt', nOvr, sparaOvrigt)}
            </Lista>

            <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.sektion, lineHeight: 1.6 }}>
              Varje prisändring sparas som en ny rad med giltig_fran = {todayIso()}; den gamla raden får giltig_till = {yesterdayIso()} så historiken bevaras.
              Fortnox-mappning och datamappning ligger kvar under Inställningar.
            </div>
          </>
        )}
      </div>

      {/* Lämna sidan med osparade ändringar — APP-EGEN dialog, alltid i DOM:en
          (window.confirm blockeras tyst i inbäddade miljöer). */}
      {lamna && (
        <>
          {/* Overlay-dim saknar token (lint-känd literal) — samma värde som appens övriga sheets */}
          <div onClick={() => setLamna(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: FARG.kort, borderRadius: `${RADIE.sheet}px ${RADIE.sheet}px 0 0`,
            padding: `${AVSTAND.xl}px ${AVSTAND.xl}px calc(${AVSTAND.sektion}px + env(safe-area-inset-bottom))`,
            borderTop: `1px solid ${FARG.linje}`, color: FARG.text, fontFamily: 'inherit',
          }}>
            <div style={{ ...TYP.rubrik, marginBottom: AVSTAND.s }}>Osparade ändringar</div>
            <div style={{ ...TYP.meta, color: FARG.text2, lineHeight: 1.6 }}>
              Prislistan har ändringar som inte är sparade. Lämnar du sidan nu försvinner de.
            </div>
            <div style={{ display: 'grid', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
              <button style={KNAPP.sekundar} onClick={() => setLamna(null)}>Stanna kvar</button>
              <button style={KNAPP.destruktiv} onClick={() => { const h = lamna.href; setLamna(null); router.push(h); }}>Lämna utan att spara</button>
            </div>
          </div>
        </>
      )}
    </EkonomiSida>
  );
}
