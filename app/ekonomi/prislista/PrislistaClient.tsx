'use client';

// Priser (barnregeln, 2026-10-25): första skärmen är en rad per pris i vanliga
// ord. Ett tryck öppnar ETT pris, som också är rader ("Medelstam 0,25 · 122 kr"),
// och ett tryck på en rad öppnar ETT ark med stora fält. Inga tabeller, inga
// kolumnrubriker, inga × i raderna. EN spara-knapp per pris, och bara när något
// är ändrat. Totalt räknas som skördare + skotare medan man skriver.
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

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { saveAllBracket, saveFormelConfig } from '@/lib/ekonomi/prisversion';
import { VARDEMINSKNING_FORVAL_SKORDARE, VARDEMINSKNING_FORVAL_SKOTARE } from '@/lib/ekonomi/vardeminskning';
import { FORESTLINK_KR_PER_TIM } from '@/lib/ekonomi/forestlink';
import {
  type Num, numOrNull,
  type MaskinRad, maskinRadFranDb, arMaskinSmutsig, rebaseMaskin, sparaMaskinRad,
  type TerrangRad, terrangSnapshot, arTerrangSmutsig, rebaseTerrang, sparaTerrangRad,
  type OvrigtRad, ovrigtSnapshot, arOvrigtSmutsig, rebaseOvrigt, sparaOvrigtRad,
  acordSnapshot, traktSnapshot, avstandSnapshot, sortSnapshot,
  sparaAllaSmutsiga, sparaSammanfattning, slaIhopEfterSpar, grundprisSumma,
} from '@/lib/ekonomi/prislistaSpara';
import { EkonomiSida, Laddar, MAXBREDD_BRED } from '../delade/mall';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import { FARG, TYP, TNUM, AVSTAND, RADIE, KNAPP, TRAFFYTA } from '@/lib/design/tokens';

type AcordRad = {
  id?: string; medelstam: Num; pris_total: Num; pris_skordare: Num; pris_skotare: Num;
  giltig_fran: string | null;
};
type AvstandConfig = { id?: string; grundavstand_m: Num; kr_per_100m: Num; giltig_fran: string | null };
type TraktRad = { id?: string; fran_m3fub: Num; till_m3fub: Num; tillagg_kr_per_m3fub: Num; giltig_fran: string | null };
type SortConfig = { id?: string; grundantal: Num; kr_per_extra_sortiment: Num; giltig_fran: string | null };

type Del = 'maskiner' | 'acord' | 'avstand' | 'trakt' | 'sort' | 'terrang' | 'ovrigt';

// Priserna i vanliga ord (barnregeln): en rad per pris på första skärmen,
// ett tryck öppnar just det priset att ändra. Inga tabeller förrän man valt.
export const DELAR: Record<Del, { titel: string; forklaring: string }> = {
  acord: { titel: 'Grundpris per kubik', forklaring: 'Vad vi får per kubikmeter i slutavverkning. Grövre träd ger lägre pris per kubik.' },
  maskiner: { titel: 'Timpris per maskin', forklaring: 'Vad varje maskin får per timme när vi jobbar på timpeng, och vad maskinen kostar i värdeminskning.' },
  avstand: { titel: 'Långt att skota', forklaring: 'Extra betalt när skotaren kör längre än vanligt till vägen.' },
  trakt: { titel: 'Liten trakt', forklaring: 'Extra betalt per kubik när trakten är liten.' },
  sort: { titel: 'Många sortiment', forklaring: 'Extra betalt när virket ska delas i fler sorter än vanligt.' },
  terrang: { titel: 'Svår terräng', forklaring: 'Extra betalt per kubik när marken är svår.' },
  ovrigt: { titel: 'Övrigt', forklaring: 'Kvalitetssäkring, flytt, diesel och annat som läggs till.' },
};
export const DEL_GRUPPER: { rubrik: string; delar: Del[] }[] = [
  { rubrik: 'Det vi får betalt', delar: ['acord', 'maskiner'] },
  { rubrik: 'Tillägg', delar: ['avstand', 'trakt', 'sort', 'terrang', 'ovrigt'] },
];
const ARDEL = (v: string | null): Del | null => (v && v in DELAR ? (v as Del) : null);
const tal = (v: Num) => String(v).replace('.', ',');
const st = (n: number, en: string, flera: string) => `${n} ${n === 1 ? en : flera}`;


// Förslag för formel-config när databasen saknar rad — visas som placeholder,
// aldrig som ifyllt värde.
const FORSLAG_AVSTAND = { grundavstand_m: 200, kr_per_100m: 4 };
const FORSLAG_SORT = { grundantal: 6, kr_per_extra_sortiment: 2 };

const datumText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const krText = (v: Num) => (v === '' ? '–' : `${tal(v)} kr`);
const traktTitel = (r: TraktRad) => (r.fran_m3fub === '' ? 'Ny storlek'
  : r.till_m3fub === '' ? `Över ${tal(r.fran_m3fub)} kubik` : `${tal(r.fran_m3fub)}–${tal(r.till_m3fub)} kubik`);

// Tal i ett vanligt textfält: decimalkomma går att skriva ("0,25") utan att
// fältet hoppar. Texten bor i fältet, talet skickas vidare först när det går
// att läsa. MODULNIVÅ: en komponent definierad i vyn remountas varje render
// och tappar fokus efter varje siffra (inköpsår-buggen, #358).
const lasTal = (s: string): Num | null => {
  const x = s.replace(/\s/g, '').replace(',', '.');
  if (x === '') return '';
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
function TalFalt({ etikett, value, onChange, enhet, placeholder, stod, autoFocus }: {
  etikett: string; value: Num; onChange: (v: Num) => void; enhet?: string; placeholder?: string; stod?: ReactNode; autoFocus?: boolean;
}) {
  const [text, setText] = useState(value === '' ? '' : tal(value));
  useEffect(() => { if (lasTal(text) !== value) setText(value === '' ? '' : tal(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Falt etikett={etikett} value={text} inputMode="decimal" enhet={enhet} placeholder={placeholder} stod={stod} autoFocus={autoFocus}
      onChange={s => { setText(s); const n = lasTal(s); if (n !== null) onChange(n); }} />
  );
}

// Av/på som en rad (iOS-brytare): ordet står alltid, färgen förstärker bara.
function Val({ titel, under, pa, onAndra }: { titel: string; under?: string; pa: boolean; onAndra: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={pa} onClick={() => onAndra(!pa)}
      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, marginBottom: AVSTAND.l,
        background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.text, color: FARG.text }}>{titel}</span>
        {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{under}</span>}
      </span>
      <span aria-hidden style={{ width: 52, height: 32, borderRadius: RADIE.cirkel, background: pa ? FARG.gron : FARG.fyllning, position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: pa ? 22 : 2, width: 28, height: 28, borderRadius: RADIE.cirkel, background: FARG.text }} />
      </span>
    </button>
  );
}

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
  if (dimRes.error) return { rader: [], fel: `Kunde inte läsa maskinregistret: ${dimRes.error.message}` };
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

  const [sparar, setSparar] = useState<Partial<Record<Del, boolean>>>({});
  const [sektionMsg, setSektionMsg] = useState<Partial<Record<Del, { text: string; fel: boolean }>>>({});
  const [lamna, setLamna] = useState<{ href: string } | null>(null);
  // Vilket pris som är öppet bor i adressen (?del=), så bakåtknappen tar en tillbaka till listan.
  const [del, setDel] = useState<Del | null>(() => (typeof window === 'undefined' ? null : ARDEL(new URLSearchParams(window.location.search).get('del'))));
  useEffect(() => {
    const p = () => setDel(ARDEL(new URLSearchParams(window.location.search).get('del')));
    window.addEventListener('popstate', p);
    return () => window.removeEventListener('popstate', p);
  }, []);
  const valjDel = (d: Del | null) => {
    const u = new URL(window.location.href);
    if (d) u.searchParams.set('del', d); else u.searchParams.delete('del');
    if (d) window.history.pushState(null, '', u); else window.history.replaceState(null, '', u);
    setDel(d);
    window.scrollTo(0, 0);
  };

  // Bekräftelsen visas VID sparaknappen (där blicken är), inte bara högst upp.
  // Lyckat försvinner efter en stund; fel står kvar tills nästa spar.
  const visaMsg = (sek: Del, text: string, fel: boolean) => {
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
  const smutsig: Record<Del, boolean> = {
    acord: acordSmutsig, maskiner: nMask > 0, avstand: avstandSmutsig, trakt: traktSmutsig,
    sort: sortSmutsig, terrang: nTerr > 0, ovrigt: nOvr > 0,
  };
  const sammanfattning: Record<Del, string> = {
    acord: acord.length ? st(acord.length, 'klass', 'klasser') + ' efter trädens grovlek' : 'Inte satt',
    maskiner: maskiner.length ? st(maskiner.length, 'maskin', 'maskiner') : 'Inga maskiner',
    avstand: avstand.grundavstand_m !== '' && avstand.kr_per_100m !== '' ? `Över ${tal(avstand.grundavstand_m)} m: ${tal(avstand.kr_per_100m)} kr per 100 m` : 'Inte satt',
    trakt: trakt.length ? st(trakt.length, 'storlek', 'storlekar') : 'Inte satt',
    sort: sortiment.grundantal !== '' && sortiment.kr_per_extra_sortiment !== '' ? `Fler än ${tal(sortiment.grundantal)}: ${tal(sortiment.kr_per_extra_sortiment)} kr per extra sortiment` : 'Inte satt',
    terrang: terrang.length ? st(terrang.length, 'sort', 'sorter') : 'Inte satt',
    ovrigt: ovrigt.length ? st(ovrigt.length, 'post', 'poster') : 'Inget',
  };

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
  const kor = async (sek: Del, jobb: () => Promise<{ text: string; fel: boolean }>) => {
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
    // Totalt läses av fakturaunderlaget, rollpriserna av allt annat — de får inte glida isär.
    if (acord.some(r => grundprisSumma(r) != null)) return { text: 'Totalt måste vara skördare + skotare — rätta de markerade raderna', fel: true };
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
  const addMaskin = () => { const lid = nyLid(); setMaskiner(prev => [...prev, {
    lid, maskin_id: '', maskin_namn: '', timpris: '',
    vardeminskning_kr_per_g15h: '', forslagVm: VARDEMINSKNING_FORVAL_SKORDARE,
    sald: false, sald_datum: '', forestlink: true, dimFinns: true,
    giltig_fran: null, isNew: true, basTp: '', basDim: '',
  }]); return lid; };
  const taBortNyMaskin = (lid: string) => setMaskiner(prev => prev.filter(m => m.lid !== lid));

  const updateAcord = (idx: number, p: Partial<AcordRad>) => setAcord(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeAcord = (idx: number) => setAcord(prev => prev.filter((_, i) => i !== idx));
  const addAcord = () => setAcord(prev => [...prev, { medelstam: '', pris_total: '', pris_skordare: '', pris_skotare: '', giltig_fran: null }]);

  const updateTrakt = (idx: number, p: Partial<TraktRad>) => setTrakt(prev => prev.map((a, i) => i === idx ? { ...a, ...p } : a));
  const removeTrakt = (idx: number) => setTrakt(prev => prev.filter((_, i) => i !== idx));
  const addTrakt = () => setTrakt(prev => [...prev, { fran_m3fub: '', till_m3fub: '', tillagg_kr_per_m3fub: '', giltig_fran: null }]);

  const updateTerrang = (lid: string, p: Partial<TerrangRad>) => setTerrang(prev => prev.map(a => a.lid === lid ? { ...a, ...p, fel: undefined } : a));
  const addTerrang = () => { const lid = nyLid(); setTerrang(prev => [...prev, { lid, namn: '', tillagg_kr_per_m3fub: '', giltig_fran: null, isNew: true, bas: '' }]); return lid; };
  const taBortNyTerrang = (lid: string) => setTerrang(prev => prev.filter(a => a.lid !== lid));

  const updateOvrigt = (lid: string, p: Partial<OvrigtRad>) => setOvrigt(prev => prev.map(a => a.lid === lid ? { ...a, ...p, fel: undefined } : a));
  const addOvrigt = () => { const lid = nyLid(); setOvrigt(prev => [...prev, { lid, nyckel: '', beskrivning: '', varde: '', enhet: '', giltig_fran: null, isNew: true, bas: '' }]); return lid; };
  const taBortNyOvrigt = (lid: string) => setOvrigt(prev => prev.filter(a => a.lid !== lid));

  // ── Ändra ETT pris i ett ark (barnregeln: en sak åt gången, stora fält) ──
  const [ark, setArk] = useState<{ del: Del; nyckel: string } | null>(null);
  const oppna = (d: Del, nyckel: string) => setArk({ del: d, nyckel });
  // Medan en del sparas går raderna inte att öppna: en ändring under pågående
  // spar skulle försvinna i omladdningen (samma regel som det låsta formuläret förut).
  const lasbar = (d: Del, f: () => void) => (sparar[d] ? undefined : f);
  // Ett nytt pris som stängs helt tomt tas bort igen — annars stoppar en tom rad sparandet.
  const stangArk = () => {
    if (ark) {
      const { del: d, nyckel } = ark;
      if (d === 'acord') { const a = acord[Number(nyckel)]; if (a && !a.id && a.medelstam === '' && a.pris_skordare === '' && a.pris_skotare === '' && a.pris_total === '') removeAcord(Number(nyckel)); }
      if (d === 'trakt') { const r = trakt[Number(nyckel)]; if (r && !r.id && r.fran_m3fub === '' && r.till_m3fub === '' && r.tillagg_kr_per_m3fub === '') removeTrakt(Number(nyckel)); }
      if (d === 'maskiner') { const m = maskiner.find(x => x.lid === nyckel); if (m?.isNew && !m.maskin_id.trim() && !m.maskin_namn.trim() && m.timpris === '') taBortNyMaskin(nyckel); }
      if (d === 'terrang') { const r = terrang.find(x => x.lid === nyckel); if (r?.isNew && !r.namn.trim() && r.tillagg_kr_per_m3fub === '') taBortNyTerrang(nyckel); }
      if (d === 'ovrigt') { const r = ovrigt.find(x => x.lid === nyckel); if (r?.isNew && !r.nyckel.trim() && !r.beskrivning.trim() && r.varde === '') taBortNyOvrigt(nyckel); }
    }
    setArk(null);
  };
  const giltigSedan = (d: Del): string | null => (
    d === 'acord' ? acord[0]?.giltig_fran ?? null
      : d === 'trakt' ? trakt[0]?.giltig_fran ?? null
        : d === 'avstand' ? avstand.giltig_fran
          : d === 'sort' ? sortiment.giltig_fran : null
  );
  const SPARA: Record<Del, () => void> = {
    acord: sparaAcord, maskiner: sparaMaskiner, avstand: sparaAvstand, trakt: sparaTrakt,
    sort: sparaSort, terrang: sparaTerrang, ovrigt: sparaOvrigt,
  };

  const klar = <button type="button" style={KNAPP.primar} onClick={stangArk}>Klar</button>;
  const taBort = (text: string, f: () => void) => (
    <button type="button" style={{ ...KNAPP.destruktiv, alignSelf: 'center' }} onClick={() => { f(); setArk(null); }}>{text}</button>
  );
  const fotText = (text: ReactNode, farg: string = FARG.text2) => <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: farg }}>{text}</p>;

  const renderArk = () => {
    if (!ark) return null;
    const { del: d, nyckel } = ark;

    if (d === 'acord') {
      const idx = Number(nyckel); const a = acord[idx];
      if (!a) return null;
      // Totalt följer skördare + skotare (fakturan räknar på Totalt; sparandet kräver att de stämmer).
      const satt = (p: Partial<AcordRad>) => {
        const n = { ...a, ...p };
        updateAcord(idx, n.pris_skordare !== '' && n.pris_skotare !== ''
          ? { ...p, pris_total: (Math.round(Number(n.pris_skordare) * 100) + Math.round(Number(n.pris_skotare) * 100)) / 100 } : p);
      };
      const summa = grundprisSumma(a);
      return (
        <Ark rubrik={a.medelstam === '' ? 'Ny klass' : `Medelstam ${tal(a.medelstam)}`} onStang={stangArk}
          fot={<>{klar}{taBort('Ta bort klassen', () => removeAcord(idx))}</>}>
          <TalFalt etikett="Medelstam" enhet="m³ per träd" value={a.medelstam} onChange={v => updateAcord(idx, { medelstam: v })} autoFocus={a.medelstam === ''} />
          <TalFalt etikett="Skördaren får" enhet="kr per kubik" value={a.pris_skordare} onChange={v => satt({ pris_skordare: v })} />
          <TalFalt etikett="Skotaren får" enhet="kr per kubik" value={a.pris_skotare} onChange={v => satt({ pris_skotare: v })} />
          {summa == null
            ? fotText(<>Totalt <span style={{ color: FARG.text, ...TNUM }}>{krText(a.pris_total)}</span> per kubik</>)
            : (<>
              {fotText(`Totalt är ${tal(a.pris_total)} kr, men skördare + skotare blir ${tal(summa)} kr. Fakturan räknar på totalt.`, FARG.orange)}
              <button type="button" style={{ ...KNAPP.sekundar, marginBottom: AVSTAND.l }} onClick={() => updateAcord(idx, { pris_total: summa })}>Använd {tal(summa)} kr</button>
            </>)}
        </Ark>
      );
    }

    if (d === 'maskiner') {
      const m = maskiner.find(x => x.lid === nyckel);
      if (!m) return null;
      const u = (p: Partial<MaskinRad>) => updateMaskin(m.lid, p);
      const kanSattaDim = m.dimFinns || !!m.isNew;
      return (
        <Ark rubrik={m.maskin_namn || m.maskin_id || 'Ny maskin'} onStang={stangArk}
          fot={<>{klar}{m.isNew && taBort('Ta bort maskinen', () => taBortNyMaskin(m.lid))}</>}>
          {m.isNew && <Falt etikett="Maskin-ID" value={m.maskin_id} onChange={v => u({ maskin_id: v })} stod="Samma som i maskinregistret." autoFocus />}
          <Falt etikett="Namn" value={m.maskin_namn} onChange={v => u({ maskin_namn: v })} />
          <TalFalt etikett="Timpris" enhet="kr per timme" value={m.timpris} onChange={v => u({ timpris: v })}
            stod={m.forestlink && kanSattaDim && m.timpris !== '' ? `Med ForestLink blir det ${tal(Number(m.timpris) + FORESTLINK_KR_PER_TIM)} kr per timme.` : undefined} />
          {kanSattaDim ? (<>
            <TalFalt etikett="Värdeminskning" enhet="kr per G15-timme" value={m.vardeminskning_kr_per_g15h} placeholder={`förslag ${m.forslagVm}`}
              onChange={v => u({ vardeminskning_kr_per_g15h: v })}
              stod={m.vardeminskning_kr_per_g15h === ''
                ? <span style={{ color: FARG.orange }}>Inte satt – räknas inte.</span>
                : 'Skördare brukar ligga på 300–500, skotare på 250–350.'} />
            {m.vardeminskning_kr_per_g15h === '' && (
              <button type="button" style={{ ...KNAPP.sekundar, marginBottom: AVSTAND.l }} onClick={() => u({ vardeminskning_kr_per_g15h: m.forslagVm })}>Använd förslaget {m.forslagVm}</button>
            )}
            <Val titel="ForestLink" under={`+${FORESTLINK_KR_PER_TIM} kr per timme på timpeng`} pa={m.forestlink} onAndra={v => u({ forestlink: v })} />
            <Val titel="Såld" under="En såld maskin räknar ingen värdeminskning framåt" pa={m.sald} onAndra={v => u({ sald: v })} />
            {m.sald && <Falt etikett="Såld datum" typ="date" value={m.sald_datum} onChange={v => u({ sald_datum: v })} />}
          </>) : fotText('Maskinen finns inte i maskinregistret. Värdeminskning, ForestLink och såld kan inte sättas.', FARG.orange)}
          {m.giltig_fran && fotText(`Priset gäller sedan ${datumText(m.giltig_fran)}.`)}
          {m.fel && fotText(`Inte sparad: ${m.fel}`, FARG.rod)}
        </Ark>
      );
    }

    if (d === 'avstand') return (
      <Ark rubrik="Långt att skota" onStang={stangArk} fot={klar}>
        <TalFalt etikett="Ingen extra betalning upp till" enhet="meter" value={avstand.grundavstand_m} placeholder={`förslag ${FORSLAG_AVSTAND.grundavstand_m}`}
          onChange={v => setAvstand(p => ({ ...p, grundavstand_m: v }))} />
        <TalFalt etikett="Sedan, för varje påbörjad 100 m" enhet="kr per kubik" value={avstand.kr_per_100m} placeholder={`förslag ${tal(FORSLAG_AVSTAND.kr_per_100m)}`}
          onChange={v => setAvstand(p => ({ ...p, kr_per_100m: v }))} />
      </Ark>
    );

    if (d === 'sort') return (
      <Ark rubrik="Många sortiment" onStang={stangArk} fot={klar}>
        <TalFalt etikett="Ingår utan extra betalning" enhet="sortiment" value={sortiment.grundantal} placeholder={`förslag ${FORSLAG_SORT.grundantal}`}
          onChange={v => setSortiment(p => ({ ...p, grundantal: v }))} />
        <TalFalt etikett="För varje sortiment därutöver" enhet="kr per kubik" value={sortiment.kr_per_extra_sortiment} placeholder={`förslag ${tal(FORSLAG_SORT.kr_per_extra_sortiment)}`}
          onChange={v => setSortiment(p => ({ ...p, kr_per_extra_sortiment: v }))} />
      </Ark>
    );

    if (d === 'trakt') {
      const idx = Number(nyckel); const r = trakt[idx];
      if (!r) return null;
      return (
        <Ark rubrik={traktTitel(r)} onStang={stangArk} fot={<>{klar}{taBort('Ta bort storleken', () => removeTrakt(idx))}</>}>
          <TalFalt etikett="Från" enhet="kubik" value={r.fran_m3fub} onChange={v => updateTrakt(idx, { fran_m3fub: v })} autoFocus={r.fran_m3fub === ''} />
          <TalFalt etikett="Till" enhet="kubik" value={r.till_m3fub} onChange={v => updateTrakt(idx, { till_m3fub: v })} stod="Tomt = ingen övre gräns." />
          <TalFalt etikett="Tillägg" enhet="kr per kubik" value={r.tillagg_kr_per_m3fub} onChange={v => updateTrakt(idx, { tillagg_kr_per_m3fub: v })} />
        </Ark>
      );
    }

    if (d === 'terrang') {
      const r = terrang.find(x => x.lid === nyckel);
      if (!r) return null;
      return (
        <Ark rubrik={r.namn || 'Ny terräng'} onStang={stangArk} fot={<>{klar}{r.isNew && taBort('Ta bort', () => taBortNyTerrang(r.lid))}</>}>
          {r.isNew && <Falt etikett="Namn" value={r.namn} onChange={v => updateTerrang(r.lid, { namn: v })} autoFocus />}
          <TalFalt etikett="Tillägg" enhet="kr per kubik" value={r.tillagg_kr_per_m3fub} onChange={v => updateTerrang(r.lid, { tillagg_kr_per_m3fub: v })} />
          {r.giltig_fran && fotText(`Gäller sedan ${datumText(r.giltig_fran)}.`)}
          {r.fel && fotText(`Inte sparad: ${r.fel}`, FARG.rod)}
        </Ark>
      );
    }

    const r = ovrigt.find(x => x.lid === nyckel);
    if (!r) return null;
    return (
      <Ark rubrik={r.beskrivning || r.nyckel || 'Ny post'} onStang={stangArk} fot={<>{klar}{r.isNew && taBort('Ta bort', () => taBortNyOvrigt(r.lid))}</>}>
        {r.isNew && <Falt etikett="Kod" value={r.nyckel} onChange={v => updateOvrigt(r.lid, { nyckel: v })} stod="Ett kort namn som appen känner igen, till exempel diesel." autoFocus />}
        <Falt etikett="Vad är det?" value={r.beskrivning} onChange={v => updateOvrigt(r.lid, { beskrivning: v })} />
        <TalFalt etikett="Värde" value={r.varde} onChange={v => updateOvrigt(r.lid, { varde: v })} />
        <Falt etikett="Enhet" value={r.enhet} onChange={v => updateOvrigt(r.lid, { enhet: v })} placeholder="till exempel kr per kubik" />
        {r.giltig_fran && fotText(`Gäller sedan ${datumText(r.giltig_fran)}.`)}
        {r.fel && fotText(`Inte sparad: ${r.fel}`, FARG.rod)}
      </Ark>
    );
  };

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
        {/* En sak per skärm: listan över priserna, eller ETT pris att ändra (som Inställningar i iOS). */}
        {del && (
          <div style={{ marginTop: AVSTAND.l }}>
            <button type="button" onClick={() => valjDel(null)} style={{ ...KNAPP.tertiar, padding: 0, minHeight: TRAFFYTA.min }}>‹ Priser</button>
            <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel, color: FARG.text }}>{DELAR[del].titel}</h1>
            <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{DELAR[del].forklaring}</p>
          </div>
        )}

        {laddFel && (
          <div style={{ marginTop: AVSTAND.m, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, background: FARG.kort, border: `1px solid ${FARG.linje}`, borderRadius: RADIE.rad, ...TYP.meta, color: FARG.rod }}>
            {laddFel} — spara inget förrän det är löst (det som visas kan vara ofullständigt).
          </div>
        )}

        {loading && <Laddar />}

        {!loading && !del && (
          <div style={{ marginTop: AVSTAND.l }}>
            {DEL_GRUPPER.map(g => (
              <Sektion key={g.rubrik} rubrik={g.rubrik}>
                {g.delar.map((k, i) => (
                  <Rad key={k} titel={DELAR[k].titel} under={sammanfattning[k]} onTryck={() => valjDel(k)} pil
                    sista={i === g.delar.length - 1} attr={{ 'data-del': k }}
                    hoger={smutsig[k] ? <span style={{ ...TYP.meta, color: FARG.orange }}>Inte sparat</span> : undefined} />
                ))}
              </Sektion>
            ))}
          </div>
        )}

        {!loading && del && (
          <div style={{ marginTop: AVSTAND.l }}>
            {/* Barnregeln i ändra-läget: en rad per pris i vanliga ord, ett tryck öppnar
                ETT ark med stora fält. Inga kolumnrubriker, inga × i raderna, och EN
                spara-knapp som bara finns när något är ändrat. Spar-logiken är orörd. */}
            {del === 'acord' && (
              <Sektion rubrik="Pris per kubik" not="Medelstam är hur mycket virke ett träd har i snitt, i kubikmeter. Grövre träd ger lägre pris per kubik.">
                {acord.map((a, idx) => {
                  const fel = grundprisSumma(a) != null;
                  return (
                    <Rad key={a.id || `ny-${idx}`} attr={{ 'data-pris-rad': String(idx) }}
                      titel={a.medelstam === '' ? 'Ny klass' : `Medelstam ${tal(a.medelstam)}`}
                      under={<>Skördare {a.pris_skordare === '' ? '–' : tal(a.pris_skordare)} · skotare {a.pris_skotare === '' ? '–' : tal(a.pris_skotare)}{fel && <span style={{ color: FARG.orange }}> · totalt stämmer inte</span>}</>}
                      hoger={krText(a.pris_total)} onTryck={lasbar('acord', () => oppna('acord', String(idx)))} />
                  );
                })}
                <Rad titel="Lägg till klass" sista onTryck={lasbar('acord', () => { addAcord(); oppna('acord', String(acord.length)); })} />
              </Sektion>
            )}

            {del === 'maskiner' && (
              <Sektion rubrik="Maskiner" not="Tryck på en maskin för att ändra timpris, värdeminskning, ForestLink eller såld.">
                {maskiner.map(m => (
                  <Rad key={m.lid} attr={{ 'data-pris-rad': m.lid }}
                    titel={m.maskin_namn || m.maskin_id || 'Ny maskin'}
                    under={<>i timmen{m.forestlink && m.dimFinns ? ' · ForestLink' : ''}{m.sald ? ' · såld' : ''}
                      {m.dimFinns && m.vardeminskning_kr_per_g15h === '' && <span style={{ color: FARG.orange }}> · värdeminskning saknas</span>}
                      {(m.isNew || arMaskinSmutsig(m)) && <span style={{ color: FARG.orange }}> · inte sparat</span>}
                      {m.fel && <span style={{ color: FARG.rod }}> · {m.fel}</span>}</>}
                    hoger={krText(m.timpris)} onTryck={lasbar('maskiner', () => oppna('maskiner', m.lid))} />
                ))}
                <Rad titel="Lägg till maskin" sista onTryck={lasbar('maskiner', () => oppna('maskiner', addMaskin()))} />
              </Sektion>
            )}

            {del === 'avstand' && (
              <Sektion rubrik="Så räknas det" not="Avståndet är hur långt skotaren kör virket till vägen.">
                <Rad attr={{ 'data-pris-rad': 'grund' }} titel="Ingen extra betalning upp till"
                  under={avstand.grundavstand_m === '' ? <span style={{ color: FARG.orange }}>Inte satt</span> : undefined}
                  hoger={avstand.grundavstand_m === '' ? '–' : `${tal(avstand.grundavstand_m)} m`} onTryck={lasbar('avstand', () => oppna('avstand', 'config'))} />
                <Rad titel="Sedan, för varje påbörjad 100 m" sista under="per kubik"
                  hoger={avstand.kr_per_100m === '' ? '–' : `+${tal(avstand.kr_per_100m)} kr`} onTryck={lasbar('avstand', () => oppna('avstand', 'config'))} />
              </Sektion>
            )}

            {del === 'trakt' && (
              <Sektion rubrik="Tillägg efter traktens storlek" not="Storleken är hur mycket virke hela trakten ger, i kubikmeter.">
                {trakt.map((r, idx) => (
                  <Rad key={r.id || `ny-${idx}`} attr={{ 'data-pris-rad': String(idx) }}
                    titel={traktTitel(r)} under="per kubik"
                    hoger={r.tillagg_kr_per_m3fub === '' ? '–' : `+${tal(r.tillagg_kr_per_m3fub)} kr`}
                    onTryck={lasbar('trakt', () => oppna('trakt', String(idx)))} />
                ))}
                <Rad titel="Lägg till storlek" sista onTryck={lasbar('trakt', () => { addTrakt(); oppna('trakt', String(trakt.length)); })} />
              </Sektion>
            )}

            {del === 'sort' && (
              <Sektion rubrik="Så räknas det" not="Ett sortiment är en sort virke, till exempel timmer eller massaved.">
                <Rad attr={{ 'data-pris-rad': 'grund' }} titel="Ingår utan extra betalning"
                  under={sortiment.grundantal === '' ? <span style={{ color: FARG.orange }}>Inte satt</span> : undefined}
                  hoger={sortiment.grundantal === '' ? '–' : st(Number(sortiment.grundantal), 'sortiment', 'sortiment')} onTryck={lasbar('sort', () => oppna('sort', 'config'))} />
                <Rad titel="För varje sortiment därutöver" sista under="per kubik"
                  hoger={sortiment.kr_per_extra_sortiment === '' ? '–' : `+${tal(sortiment.kr_per_extra_sortiment)} kr`} onTryck={lasbar('sort', () => oppna('sort', 'config'))} />
              </Sektion>
            )}

            {del === 'terrang' && (
              <Sektion rubrik="Tillägg efter terräng">
                {terrang.map(r => (
                  <Rad key={r.lid} attr={{ 'data-pris-rad': r.lid }} titel={r.namn || 'Ny terräng'}
                    under={<>per kubik{(r.isNew || arTerrangSmutsig(r)) && <span style={{ color: FARG.orange }}> · inte sparat</span>}{r.fel && <span style={{ color: FARG.rod }}> · {r.fel}</span>}</>}
                    hoger={r.tillagg_kr_per_m3fub === '' ? '–' : `+${tal(r.tillagg_kr_per_m3fub)} kr`}
                    onTryck={lasbar('terrang', () => oppna('terrang', r.lid))} />
                ))}
                <Rad titel="Lägg till terräng" sista onTryck={lasbar('terrang', () => oppna('terrang', addTerrang()))} />
              </Sektion>
            )}

            {del === 'ovrigt' && (
              <Sektion rubrik="Övriga poster">
                {ovrigt.map(r => (
                  <Rad key={r.lid} attr={{ 'data-pris-rad': r.lid }} titel={r.beskrivning || r.nyckel || 'Ny post'}
                    under={<>{r.enhet || 'ingen enhet'}{(r.isNew || arOvrigtSmutsig(r)) && <span style={{ color: FARG.orange }}> · inte sparat</span>}{r.fel && <span style={{ color: FARG.rod }}> · {r.fel}</span>}</>}
                    hoger={r.varde === '' ? '–' : tal(r.varde)}
                    onTryck={lasbar('ovrigt', () => oppna('ovrigt', r.lid))} />
                ))}
                <Rad titel="Lägg till post" sista onTryck={lasbar('ovrigt', () => oppna('ovrigt', addOvrigt()))} />
              </Sektion>
            )}

            {/* EN spara-knapp per skärm, och bara när något är ändrat. */}
            <div style={{ marginTop: AVSTAND.l }}>
              {smutsig[del]
                ? <p style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Ändrat – inte sparat. Sparar du gäller de nya priserna från i dag. Det som redan körts räknas med de gamla.</p>
                : giltigSedan(del) && <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Gäller sedan {datumText(giltigSedan(del))}</p>}
              {sektionMsg[del] && (
                <p data-spar-svar="" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: sektionMsg[del]!.fel ? FARG.rod : FARG.gron }}>{sektionMsg[del]!.text}</p>
              )}
              {smutsig[del] && (
                <button type="button" style={{ ...KNAPP.primar, marginTop: AVSTAND.m, opacity: sparar[del] ? 0.6 : 1 }}
                  disabled={!!sparar[del]} onClick={SPARA[del]}>
                  {sparar[del] ? 'Sparar…' : 'Spara'}
                </button>
              )}
            </div>
          </div>
        )}

        {ark && renderArk()}
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
