'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import OversiktMaskiner from './OversiktMaskiner';
import OversiktKarta from './OversiktKarta';
import OversiktGrot from './OversiktGrot';
import OversiktObjektLista from './OversiktObjektLista';
import { Maskin, MaskinKoItem, OversiktObjekt, TabId, C } from './oversikt-types';
import { globalCss, ff } from './oversikt-styles';
import { objektSkotat, type SkotareManuellRad } from '@/lib/skotat';

const OBJEKT_SELECT = `id, namn, vo_nummer, typ, atgard, status, volym, areal, lat, lng, ar, manad, bolag, markagare, markagare_tel,
  barighet, terrang, skordare_maskin, skordare_band, skordare_band_par, skordare_manuell_fallning, skordare_manuell_fallning_text,
  skotare_maskin, skotare_band, skotare_band_par, skotare_lastreder_breddat, skotare_ris_direkt,
  transport_trailer_in, transport_kommentar, markagare_ska_ha_ved, markagare_ved_text, info_anteckningar, anteckningar,
  faktisk_slut, grot, grot_status, grot_volym, grot_anteckning, grot_deadline, trakt_data`;

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'maskiner', label: 'Maskiner', icon: 'precision_manufacturing' },
  { id: 'karta', label: 'Karta', icon: 'map' },
  { id: 'grot', label: 'GROT', icon: 'forest' },
  { id: 'objekt', label: 'Objekt', icon: 'format_list_bulleted' },
];

// Aggregated production per objekt_id: { skordareVol, skotareVol }
export interface ProdAgg {
  skordareVol: number;
  skotareVol: number;
}

// Produktion per objekt (m³fub) — skördat (vy_uppf_prod_per_objekt) + skotat
// (vy_uppf_lass_per_objekt). NYCKEL = vo_nummer (vyernas objekt_id-kolumn innehåller
// vo-nummer, inte objekt.id). "På backen" = skördat − skotat räknas i vyn.
export interface SkordAgg {
  skordat: number;              // m³fub
  skotat: number | null;        // m³fub — null = ingen skotdata registrerad (≠ 0). Manuell trumfar lass.
  sista: string | null;         // sista skörddatum
  lassSista: string | null;     // sista LASS-datum (skotarens aktivitet) — för skotar-tillståndet
  harManuell: boolean;          // finns en manuell skotregistrering? (= användarens avslut → skotare KLAR)
  // Skotargruppering — SAMMA härledning som uppföljningen (useUppfoljningList): lassdata (hård) →
  // dim_objekt.tilldelad_skotare (planerad) → null. Sätts för alla vo:n i fetchAll (valfria = null tills dess).
  tilldeladSkotare?: string | null;                              // skotarens maskinnamn (grupperingsetikett)
  skotareKalla?: 'lass' | 'tilldelad' | null;                    // varifrån namnet kom
  skotareAvvikelse?: { lass: string; tilldelad: string } | null; // lassdata ≠ planerad skotare (ärlig)
  egenSkotning?: boolean;   // dim_objekt.egen_skotning — säljaren/markägaren skotar själv → ur på-backen
}

/** Fetch all rows with pagination (Supabase default limit is 1000) */
async function fetchAllRows<T>(query: () => any): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data } = await query().range(offset, offset + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// Maskinnamn = tillverkare + modell (identiskt med uppföljningens getMachineLabel) — grupperingsetikett.
function getMachineLabel(m: any): string { return m ? [m.tillverkare, m.modell].filter(Boolean).join(' ') : ''; }

export default function OversiktPage() {
  // Default = Objekt (uppgiftslistan "vad ska jag göra idag") — kartan är ett tryck bort.
  const [activeTab, setActiveTab] = useState<TabId>('objekt');
  const [objekt, setObjekt] = useState<OversiktObjekt[]>([]);
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [prodMap, setProdMap] = useState<Record<string, ProdAgg>>({});
  const [skordMap, setSkordMap] = useState<Record<string, SkordAgg>>({});
  const [grotAnpassad, setGrotAnpassad] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    // Core data — small tables, single fetch
    const [maskinerRes, koRes] = await Promise.all([
      supabase.from('dim_maskin').select('*').order('modell'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);

    // Fetch ALL objekt with pagination (Supabase default limit is 1000)
    let allObjekt = await fetchAllRows<any>(() => supabase.from('objekt').select(OBJEKT_SELECT).order('namn'));
    if (allObjekt.length === 0) {
      // OBJEKT_SELECT might have invalid columns — fallback to select('*')
      console.warn('[Översikt] OBJEKT_SELECT returned 0 rows, falling back to select(*)');
      allObjekt = await fetchAllRows<any>(() => supabase.from('objekt').select('*').order('namn'));
    }
    console.log(`[Översikt] Hämtade ${allObjekt.length} objekt`);
    setObjekt(allObjekt);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
    setLoading(false);

    // Fetch grot_anpassad from dim_objekt
    const grotRes = await supabase.from('dim_objekt').select('vo_nummer').eq('grot_anpassad', true);
    if (grotRes.data) {
      setGrotAnpassad(new Set(grotRes.data.map((r: { vo_nummer: string }) => r.vo_nummer)));
    }

    // Production data — paginated, can be large
    const [prodRows, lassRows, skordRows, skotRows, manuellRows, tilldeladRows] = await Promise.all([
      fetchAllRows<{ objekt_id: string; volym_m3sub: number }>(
        () => supabase.from('fakt_produktion').select('objekt_id, volym_m3sub').order('objekt_id')
      ),
      // .order() KRAVS - utan stabil sortering tappar .range()-pagineringen rader over 1000-radsgransen
      // (fakt_lass > 1000 rader) -> skotat under-raknas (se project_postgrest_paginering_order).
      fetchAllRows<{ objekt_id: string; volym_m3sub: number; maskin_id: string | null }>(
        () => supabase.from('fakt_lass').select('objekt_id, volym_m3sub, maskin_id').order('objekt_id')
      ),
      // Skördat per objekt (m³fub) — aggregatvy, en rad per objekt_id=vo_nummer.
      fetchAllRows<{ objekt_id: string; volym_m3sub: number; sista_datum: string }>(
        () => supabase.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub, sista_datum').order('objekt_id')
      ),
      // Skotat per objekt (m³fub) — aggregatvy, en rad per objekt_id=vo_nummer. maskin_ids = skotarmaskin(er).
      fetchAllRows<{ objekt_id: string; volym_m3sub: number; sista_datum: string | null; maskin_ids: string[] | null }>(
        () => supabase.from('vy_uppf_lass_per_objekt').select('objekt_id, volym_m3sub, sista_datum, maskin_ids').order('objekt_id')
      ),
      // Manuell skotad volym (skotare_objekt_manuell). maskin_id IS NULL = objekt-nivå (trumfar allt);
      // maskin_id SATT = utförd skotning per maskin (egen/omlastning via EN-regeln). Se lib/skotat.
      fetchAllRows<{ objekt_id: string; maskin_id: string | null; volym_m3: number | null; volym_egen_skotning: number | null; volym_omlastning: number | null; ar_omlastning: boolean | null }>(
        () => supabase.from('skotare_objekt_manuell').select('objekt_id, maskin_id, volym_m3, volym_egen_skotning, volym_omlastning, ar_omlastning').order('objekt_id')
      ),
      // Planerad skotare per objekt (dim_objekt.tilldelad_skotare) — grupperar objektet under sin
      // skotare redan innan första lasset, precis som uppföljningen.
      fetchAllRows<{ vo_nummer: string; tilldelad_skotare: string | null; egen_skotning: boolean | null }>(
        () => supabase.from('dim_objekt').select('vo_nummer, tilldelad_skotare, egen_skotning').order('vo_nummer')
      ),
    ]);

    const map: Record<string, ProdAgg> = {};
    for (const r of prodRows) {
      if (!r.objekt_id) continue;
      if (!map[r.objekt_id]) map[r.objekt_id] = { skordareVol: 0, skotareVol: 0 };
      map[r.objekt_id].skordareVol += r.volym_m3sub || 0;
    }
    for (const r of lassRows) {
      if (!r.objekt_id) continue;
      if (!map[r.objekt_id]) map[r.objekt_id] = { skordareVol: 0, skotareVol: 0 };
      map[r.objekt_id].skotareVol += r.volym_m3sub || 0;
    }
    setProdMap(map);

    // Produktion per objekt (m³fub) — nyckel = vo_nummer (matchas mot objekt.vo_nummer).
    // skotat startar som null (ingen rad = okänt, ≠ 0); sätts bara när en lass-rad finns.
    const skmap: Record<string, SkordAgg> = {};
    for (const r of skordRows) {
      if (!r.objekt_id) continue;
      skmap[String(r.objekt_id)] = { skordat: r.volym_m3sub || 0, skotat: null, sista: r.sista_datum || null, lassSista: null, harManuell: false };
    }
    // Per-maskin lass (fakt_lass) — skotat-regeln (lib/skotat) kräver att manuell per maskin kan trumfa
    // DEN maskinens lass, aldrig dubbelräkna. Σ per maskin = vy_uppf_lass-totalen (verifierat). Lass utan
    // maskin_id läggs under en sentinel så totalen bevaras (kan aldrig trumfas av per-maskin-manuell).
    const lassPerMaskinByVo: Record<string, Map<string, number>> = {};
    for (const r of lassRows) {
      if (!r.objekt_id) continue;
      const k = String(r.objekt_id);
      const mid = r.maskin_id || '__ingen__';
      if (!lassPerMaskinByVo[k]) lassPerMaskinByVo[k] = new Map();
      lassPerMaskinByVo[k].set(mid, (lassPerMaskinByVo[k].get(mid) || 0) + (r.volym_m3sub || 0));
    }
    const lassMaskinByVo: Record<string, string | null> = {};
    for (const r of skotRows) {
      if (!r.objekt_id) continue;
      const k = String(r.objekt_id);
      if (!skmap[k]) skmap[k] = { skordat: 0, skotat: null, sista: null, lassSista: null, harManuell: false };
      skmap[k].lassSista = r.sista_datum || null;   // sista lass-datum → skotar-aktivitet/färskhet
      lassMaskinByVo[k] = (r.maskin_ids || []).filter(Boolean)[0] || null;   // skotarmaskin ur lassdatan (hård)
    }
    // Manuell skotad volym (lib/skotat): maskin_id NULL = objekt-nivå-avslut (trumfar allt); maskin_id
    // SATT = utförd skotning per maskin (trumfar den maskinens lass). Skotat = null om varken lass eller
    // manuell finns (okänt, ≠ 0). harManuell (= KLAR-force) sätts BARA av objekt-nivå-raden.
    const manNivaByVo: Record<string, number> = {};
    const manPerMaskinByVo: Record<string, Map<string, SkotareManuellRad>> = {};
    for (const r of manuellRows) {
      if (!r.objekt_id) continue;
      const k = String(r.objekt_id);
      if (r.maskin_id == null) {
        // Objekt-nivå-avslut (trumfar allt). volym_m3 = källan; hoppa tomma rader.
        if (r.volym_m3 == null) continue;
        const v = Number(r.volym_m3) || 0;
        manNivaByVo[k] = k in manNivaByVo ? Math.max(manNivaByVo[k], v) : v;
      } else {
        // Per-maskin: rå rad → EN-regeln (lib/skotat) delar upp i egen/omlastning.
        if (!manPerMaskinByVo[k]) manPerMaskinByVo[k] = new Map();
        manPerMaskinByVo[k].set(r.maskin_id, r as SkotareManuellRad);
      }
    }
    for (const k of new Set([...Object.keys(skmap), ...Object.keys(manNivaByVo), ...Object.keys(manPerMaskinByVo)])) {
      if (!skmap[k]) skmap[k] = { skordat: 0, skotat: null, sista: null, lassSista: null, harManuell: false };
      const lassPM = lassPerMaskinByVo[k] || new Map<string, number>();
      const manPM = manPerMaskinByVo[k] || new Map<string, SkotareManuellRad>();
      const manNiva = k in manNivaByVo ? manNivaByVo[k] : null;
      if (lassPM.size > 0 || manPM.size > 0 || manNiva != null) {
        const res = objektSkotat({ lassPerMaskin: lassPM, manuellRadPerMaskin: manPM, manuellObjektNiva: manNiva });
        skmap[k].skotat = res.skotat;
        skmap[k].harManuell = res.harManuellAvslut;   // bara objekt-nivå-manuell = KLAR-force
      }
    }

    // ── tilldeladSkotare per vo — SAMMA prioritet som uppföljningen (useUppfoljningList rad 285-304):
    //    lassdatan (hård) → dim_objekt.tilldelad_skotare (planerad) → null. Grupperar objektet under
    //    skotaren redan innan första lasset. De två vyerna får ALDRIG gruppera olika. ──
    const maskinMap = new Map<string, any>();
    for (const m of (maskinerRes.data || [])) maskinMap.set(m.maskin_id, m);
    const tilldByVo: Record<string, string> = {};
    const egenByVo = new Set<string>();
    for (const r of tilldeladRows) {
      if (r.vo_nummer && r.egen_skotning === true) egenByVo.add(r.vo_nummer);   // egen skotning (säljaren skotar själv)
      if (!r.vo_nummer || !r.tilldelad_skotare) continue;
      if (!(r.vo_nummer in tilldByVo)) tilldByVo[r.vo_nummer] = r.tilldelad_skotare;   // första icke-null per vo
    }
    for (const k of new Set([...Object.keys(skmap), ...Object.keys(tilldByVo), ...egenByVo])) {
      if (!skmap[k]) skmap[k] = { skordat: 0, skotat: null, sista: null, lassSista: null, harManuell: false };
      skmap[k].egenSkotning = egenByVo.has(k);
      const lassId = lassMaskinByVo[k] || null;
      const tilldId = tilldByVo[k] || null;
      const namnLass = lassId ? getMachineLabel(maskinMap.get(lassId)) : '';
      const namnTilld = tilldId ? getMachineLabel(maskinMap.get(tilldId)) : '';
      skmap[k].skotareKalla = namnLass ? 'lass' : namnTilld ? 'tilldelad' : null;
      skmap[k].tilldeladSkotare = namnLass || namnTilld || null;
      skmap[k].skotareAvvikelse = (lassId && tilldId && lassId !== tilldId && namnLass && namnTilld) ? { lass: namnLass, tilldelad: namnTilld } : null;
    }
    setSkordMap(skmap);
  };

  useEffect(() => { fetchAll(); }, []);

  const refreshMaskiner = async () => {
    const [maskinerRes, koRes] = await Promise.all([
      supabase.from('dim_maskin').select('*').order('modell'),
      supabase.from('maskin_ko').select('*').order('ordning'),
    ]);
    if (maskinerRes.data) setMaskiner(maskinerRes.data);
    if (koRes.data) setMaskinKo(koRes.data);
  };

  const refreshObjekt = async () => {
    let data = await fetchAllRows<any>(() => supabase.from('objekt').select(OBJEKT_SELECT).order('namn'));
    if (data.length === 0) data = await fetchAllRows<any>(() => supabase.from('objekt').select('*').order('namn'));
    setObjekt(data);
  };

  return (
    <div style={{ height: 'calc(100vh - 56px)', width: '100vw', fontFamily: ff, background: C.bg, color: C.t1, overflow: 'hidden', display: 'flex', flexDirection: 'column', WebkitFontSmoothing: 'antialiased' }}>
      <style>{globalCss}</style>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3 }}>
          Laddar...
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            opacity: activeTab === 'karta' ? 1 : 0,
            pointerEvents: activeTab === 'karta' ? 'auto' : 'none',
            zIndex: activeTab === 'karta' ? 1 : 0,
            transition: 'opacity 180ms ease-out',
          }}>
            <OversiktKarta objekt={objekt} maskiner={maskiner} maskinKo={maskinKo} prodMap={prodMap} skordMap={skordMap} />
          </div>
          <div style={{
            position: 'absolute', inset: 0, overflow: 'auto',
            opacity: activeTab === 'maskiner' ? 1 : 0,
            pointerEvents: activeTab === 'maskiner' ? 'auto' : 'none',
            zIndex: activeTab === 'maskiner' ? 1 : 0,
            transition: 'opacity 180ms ease-out',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}>
            <OversiktMaskiner
              maskiner={maskiner}
              maskinKo={maskinKo}
              objekt={objekt}
              supabase={supabase}
              onRefresh={refreshMaskiner}
            />
          </div>
          <div style={{
            position: 'absolute', inset: 0, overflow: 'auto',
            opacity: activeTab === 'grot' ? 1 : 0,
            pointerEvents: activeTab === 'grot' ? 'auto' : 'none',
            zIndex: activeTab === 'grot' ? 1 : 0,
            transition: 'opacity 180ms ease-out',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}>
            <OversiktGrot
              objekt={objekt}
              grotAnpassadVo={grotAnpassad}
              supabase={supabase}
              onRefresh={refreshObjekt}
            />
          </div>
          <div style={{
            position: 'absolute', inset: 0, overflow: 'auto',
            opacity: activeTab === 'objekt' ? 1 : 0,
            pointerEvents: activeTab === 'objekt' ? 'auto' : 'none',
            zIndex: activeTab === 'objekt' ? 1 : 0,
            transition: 'opacity 180ms ease-out',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}>
            <OversiktObjektLista objekt={objekt} skordMap={skordMap} />
          </div>
        </div>
      )}

      {/* Bottom nav — uppföljning-matched tab bar */}
      <div role="tablist" style={{
        flexShrink: 0, background: 'rgba(7,7,8,0.95)', backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${C.borderStrong}`, display: 'flex',
        paddingTop: 4,
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        zIndex: 30,
      }}>
        {tabs.map((v) => {
          const active = activeTab === v.id;
          return (
            <button key={v.id} onClick={() => setActiveTab(v.id)}
              role="tab" aria-selected={active} aria-label={v.label}
              style={{
                flex: 1, background: 'none',
                border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '8px 0', minHeight: 52, fontFamily: ff,
                transition: 'all 0.25s',
              }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{
                fontSize: 24, lineHeight: 1,
                color: active ? C.t1 : C.t3,
                fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
                transform: active ? 'scale(1.04)' : 'scale(1)',
                transition: 'all 0.25s',
              }}>{v.icon}</span>
              <span style={{
                fontSize: 11, fontWeight: active ? 600 : 500, letterSpacing: '-0.01em',
                color: active ? C.t1 : C.t3,
                transition: 'color 0.25s',
              }}>{v.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
