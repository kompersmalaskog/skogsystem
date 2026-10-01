'use client';
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaEnGpsFix } from '@/lib/gpsKalla';
import { grupperaForareObjekt, type ForareObjekt } from '@/lib/objektlista';
import { objektHuvudtyp, arTilldelad } from '@/lib/objektPlats';
import { typLabel } from '@/lib/objekt/typ';

interface ObjektValjareProps {
  onSelectObjekt: (objekt: any) => void;
  onNavigera: (lat: number, lng: number) => void;
  /** Sätts av planeringsvyn när inloggad är FÖRARE → grupperad lista (HÄR/PÅGÅENDE/PLANERADE/AVSLUTADE),
   *  ingen typ-flik, Starta-cirkel på planerade. ALLA objekt visas — tilldelning sorterar bara (sektion B),
   *  den filtrerar INTE längre bort andras objekt. medarbetareId används för "egna"-chip + sortering. */
  forareFilter?: { medarbetareId: string };
  /** Sätts av planeringsvyn när inloggad är förare → visa grön Starta-cirkel
   *  istället för pil på rader med status='planerad'. Tap = starta+öppna
   *  (samma underliggande logik som kart-pillens "Starta körning"). */
  onStartObjekt?: (objekt: any) => void;
  /** Maskindatorns bundna maskin (lib/enhetMaskin). Styr typ-sorteringen + "egna"-chip när den finns;
   *  på telefon faller vi tillbaka på förarens medarbetare.maskin_id. */
  enhetMaskinId?: string | null;
}

export default function ObjektValjare({ onSelectObjekt, onNavigera, forareFilter, onStartObjekt, enhetMaskinId }: ObjektValjareProps) {
  // STEG 7: avslutade-flik tillagd. Default 'planerade' för förare (de har
  // inga oplanerade objekt), 'oplanerade' för admin (befintligt beteende).
  const [activeTab, setActiveTab] = useState<'oplanerade' | 'planerade' | 'avslutade'>(
    forareFilter ? 'planerade' : 'oplanerade'
  );
  const [filter, setFilter] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [selectedObj, setSelectedObj] = useState<any>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [objekt, setObjekt] = useState<any[]>([]);
  // vo_nummer där SKOTNINGEN inte är klar + virke kvar på backen (avverkat > skotat).
  // Skörd klar ≠ skotning klar: ett objekt som markerats avslutat men har virke kvar
  // ska ändå synas i "att köra" för skotaren. skotning_avslutad styr, aldrig skördning.
  const [skotKvarVo, setSkotKvarVo] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [roadDist, setRoadDist] = useState<Record<string, number | 'loading'>>({});
  const [sheetVisible, setSheetVisible] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  // === FÖRAR-LÄGE (steg 3): grupperad lista + avslutade-vy ===
  const [geometriMap, setGeometriMap] = useState<Map<string, any>>(new Map());
  const [maskinNamn, setMaskinNamn] = useState<Map<string, string>>(new Map());
  const [maskinKlararMap, setMaskinKlararMap] = useState<Map<string, string>>(new Map());
  const [medarbetareNamn, setMedarbetareNamn] = useState<Map<string, string>>(new Map());
  const [medMaskinMap, setMedMaskinMap] = useState<Map<string, string>>(new Map());
  const [aktivSet, setAktivSet] = useState<Set<string>>(new Set());   // objekt.id med hyttspår ≤7 dgr
  const [lassVoSet, setLassVoSet] = useState<Set<string>>(new Set()); // vo_nummer med lass ≤7 dgr
  const [visaAvslutade, setVisaAvslutade] = useState(false);

  useEffect(() => {
    const fetchObjekt = async () => {
      const { data, error } = await supabase
        .from('objekt')
        .select('*')
        .order('namn', { ascending: true });
      if (error) console.error('Fetch error:', error);
      else setObjekt(data || []);
      setLoading(false);
    };
    fetchObjekt();
  }, []);

  // Räkna ut vilka VO som har SKOTNING kvar (skotning_avslutad NULL + virke på backen),
  // så avslutat-markerade objekt med oskotat virke ändå syns i "att köra". Skördningen
  // får vara klar — det är skotningen som styr. egen_skotning = säljaren skotar → ej vårt.
  useEffect(() => {
    let avbruten = false;
    (async () => {
      const [dimR, prodR, lassR, manR] = await Promise.all([
        supabase.from('dim_objekt').select('objekt_id, vo_nummer, skotning_avslutad, egen_skotning'),
        supabase.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub'),
        supabase.from('vy_uppf_lass_per_objekt').select('objekt_id, volym_m3sub'),
        supabase.from('skotare_objekt_manuell').select('objekt_id, maskin_id, volym_egen_skotning, volym_m3, ar_omlastning').is('datum_fran', null),
      ]);
      if (avbruten) return;
      const voAv = new Map<string, string>();
      const skotKlar = new Set<string>(), egen = new Set<string>();
      for (const d of dimR.data || []) {
        const vo = d.vo_nummer || d.objekt_id;
        if (d.objekt_id) voAv.set(d.objekt_id, vo);
        if (d.skotning_avslutad) skotKlar.add(vo);
        if (d.egen_skotning === true) egen.add(vo);
      }
      const voFor = (oid: string) => voAv.get(oid) || oid;
      const skordat = new Map<string, number>(), skotat = new Map<string, number>();
      for (const p of prodR.data || []) { const vo = voFor(p.objekt_id); skordat.set(vo, (skordat.get(vo) || 0) + (p.volym_m3sub || 0)); }
      for (const l of lassR.data || []) { const vo = voFor(l.objekt_id); skotat.set(vo, (skotat.get(vo) || 0) + (l.volym_m3sub || 0)); }
      // Manuell EGEN skotning räknas som skotat (omlastning aldrig); grot-rader (maskin_id NULL) hoppas över.
      for (const m of manR.data || []) {
        if (!m.maskin_id) continue;
        const vo = voFor(m.objekt_id);
        const e = m.volym_egen_skotning ?? (m.ar_omlastning ? 0 : (m.volym_m3 ?? 0));
        skotat.set(vo, (skotat.get(vo) || 0) + (Number(e) || 0));
      }
      const kvar = new Set<string>();
      for (const [vo, sk] of skordat) {
        if (skotKlar.has(vo) || egen.has(vo)) continue;      // skotning klar el. egen → ej på vår backe
        if (sk - (skotat.get(vo) || 0) > 5) kvar.add(vo);    // > 5 m³fub kvar = virke på backen
      }
      if (!avbruten) setSkotKvarVo(kvar);
    })();
    return () => { avbruten = true; };
  }, []);

  useEffect(() => {
    // Via GPS-KÄLLAN (delad hub) — aldrig navigator.geolocation direkt. På
    // maskindatorn ger geolocation IP-position (mil fel); serial-fixen används
    // när den finns. Faller tillbaka till verksamhetens mitt om ingen fix.
    let avbruten = false;
    hamtaEnGpsFix(10000).then((fix) => {
      if (avbruten) return;
      if (fix && fix.giltig && fix.lat != null && fix.lng != null) {
        setUserPos({ lat: fix.lat, lng: fix.lng });
      } else {
        setUserPos({ lat: 56.40, lng: 14.70 });
      }
    });
    return () => { avbruten = true; };
  }, []);

  // FÖRAR-LÄGE: ladda traktgräns-geometri (HÄR-gruppen), maskin-/förarnamn (chips), maskinens
  // klarar_typ (typ-sort) och 7-dgrs-aktivitet (hyttspår/lass → pågående tills statusrapporten finns).
  useEffect(() => {
    if (!forareFilter) return;
    let avbruten = false;
    (async () => {
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const [geoR, maskR, medR, hsR, flR] = await Promise.all([
        supabase.from('objekt_geometri').select('objekt_id, geometri'),
        supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, klarar_typ'),
        supabase.from('medarbetare').select('id, namn, maskin_id'),
        supabase.from('hyttspar').select('objekt_id').gte('datum', weekAgo),
        supabase.from('fakt_lass').select('objekt_id').gte('datum', weekAgo),
      ]);
      if (avbruten) return;
      const gm = new Map<string, any>(); for (const g of geoR.data || []) gm.set((g as any).objekt_id, (g as any).geometri);
      const mn = new Map<string, string>(); const mk = new Map<string, string>();
      for (const m of maskR.data || []) { mn.set(m.maskin_id, (m.visningsnamn?.trim() || m.modell || m.maskin_id)); if (m.klarar_typ) mk.set(m.maskin_id, m.klarar_typ); }
      const pn = new Map<string, string>(); const pm = new Map<string, string>();
      for (const p of medR.data || []) { if (p.namn) pn.set(p.id, p.namn); if (p.maskin_id) pm.set(p.id, p.maskin_id); }
      setGeometriMap(gm); setMaskinNamn(mn); setMaskinKlararMap(mk); setMedarbetareNamn(pn); setMedMaskinMap(pm);
      // 7-dgrs-aktivitet. hyttspar.objekt_id = objekt.id (UUID). fakt_lass.objekt_id = vo_nummer
      // (mappas till objekt.id i render via voToId, där `objekt` finns).
      const aktiv = new Set<string>();
      for (const h of hsR.data || []) if ((h as any).objekt_id) aktiv.add(String((h as any).objekt_id));
      setAktivSet(aktiv);
      setLassVoSet(new Set((flR.data || []).map((l: any) => String(l.objekt_id))));
    })();
    return () => { avbruten = true; };
  }, [forareFilter]);

  // Fetch road distances one by one via OSRM
  useEffect(() => {
    if (!userPos || objekt.length === 0) return;
    let cancelled = false;

    const fetchRoadDistances = async () => {
      const withCoords = objekt.filter(o => o.lat && o.lng);
      // Sort by straight-line distance so nearest load first
      const sorted = [...withCoords].sort((a, b) => {
        return (getDistance(a.lat, a.lng) || 999) - (getDistance(b.lat, b.lng) || 999);
      });

      for (const obj of sorted) {
        if (cancelled) break;
        const key = obj.id;
        setRoadDist(prev => ({ ...prev, [key]: 'loading' }));
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${userPos.lng},${userPos.lat};${obj.lng},${obj.lat}?overview=false`;
          const res = await fetch(url);
          const data = await res.json();
          if (!cancelled && data.routes?.[0]) {
            const km = Math.round(data.routes[0].distance / 100) / 10; // 1 decimal
            setRoadDist(prev => ({ ...prev, [key]: km }));
          }
        } catch {
          // Silently fail — straight-line fallback will show
          if (!cancelled) setRoadDist(prev => { const n = { ...prev }; delete n[key]; return n; });
        }
      }
    };

    fetchRoadDistances();
    return () => { cancelled = true; };
  }, [userPos, objekt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sheet open/close animation
  useEffect(() => {
    if (selectedObj) {
      requestAnimationFrame(() => setSheetVisible(true));
    }
  }, [selectedObj]);

  const closeSheet = () => {
    setSheetVisible(false);
    setTimeout(() => setSelectedObj(null), 300);
  };

  // Swipe-down to close
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const dy = touchCurrentY.current - touchStartY.current;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };
  const handleTouchEnd = () => {
    const dy = touchCurrentY.current - touchStartY.current;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
    }
    if (dy > 80) {
      closeSheet();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
  };

  const getDistance = (lat: number | null, lng: number | null) => {
    if (!userPos || !lat || !lng) return null;
    const R = 6371;
    const dLat = (lat - userPos.lat) * Math.PI / 180;
    const dLng = (lng - userPos.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(userPos.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Avslutat MEN skotning kvar (virke på backen) = ännu inte klart för skotaren → visas
  // som "att köra", inte bland Avslutade. Skörd klar ≠ objektet klart.
  const harSkotningKvar = (o: any) => skotKvarVo.has(o.vo_nummer);
  const arKlartAvslutat = (o: any) => o.status === 'avslutat' && !harSkotningKvar(o);

  // STEG 7: exkludera avslutade från Oplanerade/Planerade (annars dubblerade)
  const oplanerade = objekt.filter(o => (!o.ar || !o.manad) && !arKlartAvslutat(o));
  const planerade = objekt.filter(o => o.ar && o.manad && !arKlartAvslutat(o));
  const avslutade = objekt
    .filter(o => arKlartAvslutat(o))
    .sort((a, b) => (b.avslutad_timestamp || '').localeCompare(a.avslutad_timestamp || ''));

  // Admin-lista (oförändrad). Förar-läget bygger sina egna grupper längre ner.
  let lista: any[] = [];
  if (!forareFilter) {
    let allData: any[];
    if (activeTab === 'avslutade') {
      allData = avslutade;
    } else {
      allData = activeTab === 'oplanerade' ? oplanerade : planerade;
    }
    lista = filter === 'alla' ? allData : allData.filter(o => o.typ === filter);
    if (userPos) {
      lista = [...lista].sort((a, b) => {
        const distA = (typeof roadDist[a.id] === 'number' ? roadDist[a.id] as number : null) ?? getDistance(a.lat, a.lng) ?? 999;
        const distB = (typeof roadDist[b.id] === 'number' ? roadDist[b.id] as number : null) ?? getDistance(b.lat, b.lng) ?? 999;
        return distA - distB;
      });
    }
  }

  const filtreratTotal = lista.reduce((sum, o) => sum + (o.volym || 0), 0);

  // === FÖRAR-LÄGE: härled maskin (typ-sort + egna), grupper och avslutade-kolumner ===
  const maskinForTyp: string | null = enhetMaskinId
    ?? (forareFilter ? (medMaskinMap.get(forareFilter.medarbetareId) ?? null) : null);
  const klararTyp: string | null = maskinForTyp ? (maskinKlararMap.get(maskinForTyp) ?? null) : null;

  const forareAktiv = (o: any) => aktivSet.has(o.id) || lassVoSet.has(String(o.vo_nummer));

  const forareObjekt: ForareObjekt[] = forareFilter
    ? objekt.map(o => ({
        ...o,
        geometri: geometriMap.get(o.id) ?? null,
        aktivSenaste7: forareAktiv(o),
        // virke kvar på backen (avslutat men oskotat) hålls kvar som pågående för skotaren
        status: (o.status === 'avslutat' && harSkotningKvar(o)) ? 'pagaende' : o.status,
      }))
    : [];
  const grupper = forareFilter
    ? grupperaForareObjekt({ objekt: forareObjekt, pos: userPos, maskinId: maskinForTyp, klararTyp })
    : null;

  // "Egna" = tilldelad maskinen (enhet/medarbetare-maskin) eller mig som medarbetare.
  const arEgen = (o: any) =>
    arTilldelad(o, maskinForTyp) ||
    (!!forareFilter && (o.assigned_skordare_user_id === forareFilter.medarbetareId || o.assigned_skotare_user_id === forareFilter.medarbetareId));

  const maskinnamnPa = (o: any): string[] =>
    [o.skordare_maskin_id, o.skotare_maskin_id].filter(Boolean).map((id: string) => maskinNamn.get(id) || id);
  const forarePa = (o: any): string[] =>
    [o.assigned_skordare_user_id, o.assigned_skotare_user_id].filter(Boolean).map((id: string) => medarbetareNamn.get(id) || '').filter(Boolean);

  const distText = (o: any): string => {
    const roadKm = typeof roadDist[o.id] === 'number' ? (roadDist[o.id] as number) : null;
    if (roadKm != null) return `${roadKm} km`;
    const d = getDistance(o.lat, o.lng);
    return d == null ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
  };

  // Avslutade senaste 3 mån, grupperade i tre kolumner (sektion D).
  const treManSedan = new Date(Date.now() - 92 * 864e5).toISOString().slice(0, 10);
  const avslutadeSenaste = avslutade.filter(o => !o.avslutad_timestamp || o.avslutad_timestamp.slice(0, 10) >= treManSedan);
  const avslutadeKol = (typ: 'slutavverkning' | 'gallring' | 'grot') =>
    avslutadeSenaste.filter(o => objektHuvudtyp(o) === typ);

  // En förar-rad (grupperade listan)
  const renderForareRad = (obj: any) => {
    const typTxt = typLabel(objektHuvudtyp(obj));
    const volymLabel = obj.volym ? `${obj.volym} m³` : 'ingen volym angiven';
    const visaStarta = !!(obj.status === 'planerad' && onStartObjekt);
    const egen = arEgen(obj);
    const pagar = obj.status === 'pagaende' || forareAktiv(obj);
    const maskiner = maskinnamnPa(obj);
    const forare = forarePa(obj);
    const dt = distText(obj);
    return (
      <div
        key={obj.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedObj(obj)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedObj(obj); } }}
        aria-label={`${obj.namn}, ${typTxt}, ${volymLabel}`}
        style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #1a1a1a', cursor: 'pointer' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {obj.namn}
          </div>
          <div style={{ fontSize: '13px' }}>
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>{typTxt}</span>
            {obj.bolag && <span style={{ color: '#8e8e93' }}> · {obj.bolag}</span>}
          </div>
          {/* Chips: egna tilldelade + maskin/förare som är där (pågående) */}
          {(egen || (pagar && maskiner.length > 0)) && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {egen && (
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#000', background: '#30d158', borderRadius: '8px', padding: '2px 8px' }}>
                  {maskinForTyp && maskinNamn.get(maskinForTyp) ? maskinNamn.get(maskinForTyp) : 'Egen'}
                </span>
              )}
              {pagar && maskiner.length > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#9edcae', border: '1px solid rgba(48,209,88,0.5)', borderRadius: '8px', padding: '2px 8px' }}>
                  {maskiner.join(' · ')}{forare.length > 0 ? ` · ${forare.join(', ')}` : ''}
                </span>
              )}
            </div>
          )}
        </div>
        {dt && (
          <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
            <div style={{ fontSize: '13px', color: '#8e8e93' }}>{dt}</div>
          </div>
        )}
        <div style={{ textAlign: 'right', marginLeft: '16px', flexShrink: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: obj.volym ? '#fff' : '#8e8e93' }}>{obj.volym ? obj.volym : '–'}</div>
          <div style={{ fontSize: '13px', color: '#8e8e93' }}>m³</div>
        </div>
        {visaStarta ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onStartObjekt!(obj); }}
            aria-label={`Starta körning på ${obj.namn}`}
            style={{ marginLeft: '16px', width: 52, height: 52, borderRadius: '50%', background: '#30d158', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: '0 2px 8px rgba(48, 209, 88, 0.35)', padding: 0 }}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '28px' }}>play_arrow</span>
          </button>
        ) : (
          <div style={{ marginLeft: '16px', color: '#8e8e93', fontSize: '20px' }} aria-hidden="true">›</div>
        )}
      </div>
    );
  };

  const gruppRubrik = (txt: string, n: number) => (
    <div style={{ padding: '16px 20px 6px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', color: '#8e8e93', textTransform: 'uppercase' }}>
      {txt} <span style={{ color: '#636366' }}>({n})</span>
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @keyframes sheet-in {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {forareFilter && visaAvslutade && (
          <button type="button" onClick={() => setVisaAvslutade(false)} aria-label="Tillbaka"
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer', padding: 0, lineHeight: 1 }}>‹</button>
        )}
        <div>
          <div style={{ fontSize: '13px', color: '#8e8e93', letterSpacing: '0.5px', marginBottom: '4px' }}>
            Kompersmåla Skog
          </div>
          <div style={{ fontSize: '24px', fontWeight: '600' }}>
            {forareFilter ? (visaAvslutade ? 'Avslutade' : 'Objekt') : 'Välj objekt'}
          </div>
        </div>
      </div>

      {/* Filter — bara admin */}
      {!forareFilter && (
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '16px 20px',
          borderBottom: '1px solid #222',
        }}>
          {[
            { key: 'alla', label: 'Alla' },
            { key: 'slutavverkning', label: 'Slutavverkning' },
            { key: 'gallring', label: 'Gallring' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key as any)}
              aria-pressed={filter === f.key}
              style={{
                minHeight: '44px',
                padding: '10px 20px',
                borderRadius: '22px',
                border: filter === f.key ? '1px solid #fff' : '1px solid #555',
                background: filter === f.key ? '#fff' : 'transparent',
                color: filter === f.key ? '#000' : '#fff',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Admin-tabs (Oplanerade/Planerade/Avslutade) */}
      {!forareFilter && (
        <div style={{ display: 'flex', borderBottom: '1px solid #222' }}>
          <button
            type="button"
            onClick={() => setActiveTab('oplanerade')}
            aria-pressed={activeTab === 'oplanerade'}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              color: activeTab === 'oplanerade' ? '#fff' : '#8e8e93',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              borderBottom: activeTab === 'oplanerade' ? '2px solid #fff' : '2px solid transparent',
            }}
          >
            Oplanerade ({oplanerade.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('planerade')}
            aria-pressed={activeTab === 'planerade'}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              color: activeTab === 'planerade' ? '#fff' : '#8e8e93',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              borderBottom: activeTab === 'planerade' ? '2px solid #fff' : '2px solid transparent',
            }}
          >
            Planerade ({planerade.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('avslutade')}
            aria-pressed={activeTab === 'avslutade'}
            style={{
              flex: 1,
              padding: '16px',
              background: 'none',
              border: 'none',
              color: activeTab === 'avslutade' ? '#fff' : '#8e8e93',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              borderBottom: activeTab === 'avslutade' ? '2px solid #fff' : '2px solid transparent',
            }}
          >
            Avslutade ({avslutade.length})
          </button>
        </div>
      )}

      {/* Admin-lista */}
      {!forareFilter && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {/* Förklaringstext för oplanerade */}
          {activeTab === 'oplanerade' && !loading && oplanerade.length > 0 && (
            <div style={{ padding: '12px 20px 4px', fontSize: '13px', color: '#8e8e93' }}>
              Välj ett objekt och tryck Planera för att lägga till volym
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8e93', fontSize: '13px' }}>
              Laddar...
            </div>
          ) : lista.map((obj: any) => {
            const dist = getDistance(obj.lat, obj.lng);
            const typLabelTxt = obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring';
            const volymLabel = obj.volym ? `${obj.volym} m³` : 'ingen volym angiven';
            const ärAvslutad = obj.status === 'avslutat';
            const avslutsdatum = ärAvslutad && obj.avslutad_timestamp
              ? obj.avslutad_timestamp.slice(0, 10) : null;
            return (
              <div
                key={obj.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedObj(obj)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedObj(obj);
                  }
                }}
                aria-label={`${obj.namn}, ${typLabelTxt}, ${volymLabel}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderBottom: '1px solid #1a1a1a',
                  background: 'transparent',
                  color: 'inherit',
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                  opacity: ärAvslutad ? 0.7 : 1,
                }}
              >
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: '500',
                    marginBottom: '4px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {obj.namn}
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.85)' }}>{typLabelTxt}</span>
                    {obj.bolag && <span style={{ color: '#8e8e93' }}> · {obj.bolag}</span>}
                  </div>
                </div>

                {/* Avstånd (aktiva) eller avslutsdatum (avslutade) */}
                {ärAvslutad ? (
                  <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                    <div style={{ fontSize: '12px', color: '#8e8e93' }}>Avslutat</div>
                    <div style={{ fontSize: '13px', color: '#8e8e93', fontVariantNumeric: 'tabular-nums' }}>
                      {avslutsdatum || '—'}
                    </div>
                  </div>
                ) : (dist !== null || roadDist[obj.id]) && (
                  <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                    <div style={{ fontSize: '13px', color: '#8e8e93' }}>
                      {typeof roadDist[obj.id] === 'number'
                        ? `${roadDist[obj.id]} km`
                        : roadDist[obj.id] === 'loading'
                          ? (dist !== null ? `~${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}` : '...')
                          : dist !== null
                            ? (dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`)
                            : ''}
                    </div>
                  </div>
                )}

                {/* Volym */}
                <div style={{ textAlign: 'right', marginLeft: '16px', flexShrink: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: obj.volym ? '#fff' : '#8e8e93' }}>
                    {obj.volym ? obj.volym : '–'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#8e8e93' }}>
                    m³
                  </div>
                </div>

                {/* Pil */}
                <div style={{ marginLeft: '16px', color: '#8e8e93', fontSize: '20px' }} aria-hidden="true">
                  ›
                </div>
              </div>
            );
          })}

          {/* Tom state */}
          {!loading && lista.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#8e8e93',
              fontSize: '13px',
            }}>
              Inga objekt
            </div>
          )}
        </div>
      )}

      {/* === FÖRAR-LÄGE: grupperad lista (B+C) === */}
      {forareFilter && !visaAvslutade && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8e93', fontSize: '13px' }}>Laddar...</div>
          ) : (
            <>
              {grupper && grupper.har.length > 0 && (
                <>
                  {gruppRubrik('Här', grupper.har.length)}
                  {grupper.har.map(renderForareRad)}
                </>
              )}
              {grupper && grupper.pagaende.length > 0 && (
                <>
                  {gruppRubrik('Pågående', grupper.pagaende.length)}
                  {grupper.pagaende.map(renderForareRad)}
                </>
              )}
              {grupper && grupper.planerade.length > 0 && (
                <>
                  {gruppRubrik('Planerade', grupper.planerade.length)}
                  {grupper.planerade.map(renderForareRad)}
                </>
              )}
              {grupper && grupper.har.length === 0 && grupper.pagaende.length === 0 && grupper.planerade.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: '#8e8e93', fontSize: '13px' }}>Inga aktiva objekt</div>
              )}
              {/* AVSLUTADE: hopfälld rad med antal → egen vy */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setVisaAvslutade(true)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVisaAvslutade(true); } }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', marginTop: '8px', borderTop: '1px solid #1a1a1a', cursor: 'pointer' }}
              >
                <span style={{ fontSize: '15px', fontWeight: 500 }}>Avslutade <span style={{ color: '#8e8e93' }}>({avslutade.length})</span></span>
                <span style={{ color: '#8e8e93', fontSize: '20px' }} aria-hidden="true">›</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* === FÖRAR-LÄGE: avslutade-vy (D) — tre kolumner, senaste 3 mån === */}
      {forareFilter && visaAvslutade && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
            {([
              ['slutavverkning', 'Slutavverkning'],
              ['gallring', 'Gallring'],
              ['grot', 'Grot'],
            ] as const).map(([typ, rubrik]) => {
              const kol = avslutadeKol(typ as any);
              return (
                <div key={typ}>
                  <div style={{ padding: '16px 20px 6px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.6px', color: '#8e8e93', textTransform: 'uppercase' }}>
                    {rubrik} <span style={{ color: '#636366' }}>({kol.length})</span>
                  </div>
                  {kol.length === 0 ? (
                    <div style={{ padding: '4px 20px 12px', fontSize: '13px', color: '#636366' }}>—</div>
                  ) : kol.map((obj: any) => {
                    const datum = obj.avslutad_timestamp ? obj.avslutad_timestamp.slice(0, 10) : null;
                    const maskiner = maskinnamnPa(obj);
                    return (
                      <div
                        key={obj.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedObj(obj)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedObj(obj); } }}
                        style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #1a1a1a', cursor: 'pointer', opacity: 0.85 }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.namn}</div>
                          <div style={{ fontSize: '13px', color: '#8e8e93' }}>
                            Avslutat {datum || '—'}{maskiner.length > 0 ? ` · ${maskiner.join(', ')}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: '16px', flexShrink: 0 }}>
                          <div style={{ fontSize: '15px', fontWeight: 500, color: obj.volym ? '#fff' : '#8e8e93' }}>{obj.volym ? obj.volym : '–'}</div>
                          <div style={{ fontSize: '13px', color: '#8e8e93' }}>m³</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {avslutadeSenaste.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#8e8e93', fontSize: '13px' }}>Inga avslutade de senaste tre månaderna</div>
          )}
        </div>
      )}

      {/* Footer med total — bara admin */}
      {!forareFilter && (
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: '#0a0a0a',
          textAlign: 'center',
        }}>
          <span style={{ color: '#8e8e93', fontSize: '15px' }}>
            {activeTab === 'oplanerade' ? 'Oplanerat' : activeTab === 'planerade' ? 'Planerat' : 'Avslutat'} totalt:{' '}
          </span>
          <span style={{ fontSize: '15px', fontWeight: '600', color: '#fff' }}>
            {filtreratTotal.toLocaleString()} m³
          </span>
        </div>
      )}

      {/* Bottom Sheet (delad admin + förare) */}
      {selectedObj && (
        <div
          onClick={closeSheet}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: sheetVisible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
            transition: 'background-color 0.3s ease',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            ref={sheetRef}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              backgroundColor: '#1c1c1e',
              borderRadius: '16px 16px 0 0',
              padding: '12px 24px calc(24px + env(safe-area-inset-bottom, 10px))',
              width: '100%',
              maxWidth: '500px',
              transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)',
              transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {/* Drag handle */}
            <div style={{
              width: '36px',
              height: '4px',
              backgroundColor: '#555',
              borderRadius: '2px',
              margin: '0 auto 20px',
            }} />

            {/* Objektnamn */}
            <h2 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: '600' }}>
              {selectedObj.namn}
            </h2>

            {/* Typ + volym + avstånd */}
            <p style={{ margin: '0 0 24px', color: '#8e8e93', fontSize: '13px' }}>
              {selectedObj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}
              {' · '}{selectedObj.volym ? `${selectedObj.volym} m³` : '–'}
              {typeof roadDist[selectedObj.id] === 'number'
                ? <> · {roadDist[selectedObj.id]} km</>
                : getDistance(selectedObj.lat, selectedObj.lng) !== null
                  ? <> · ~{getDistance(selectedObj.lat, selectedObj.lng)!.toFixed(1)} km</>
                  : null}
            </p>

            {/* Knappar — staplade vertikalt */}
            <button
              type="button"
              onClick={() => {
                onSelectObjekt(selectedObj);
                setSelectedObj(null);
              }}
              style={{
                width: '100%',
                padding: '0',
                height: '56px',
                borderRadius: '16px',
                border: 'none',
                background: '#30d158',
                color: '#fff',
                fontSize: '17px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '10px',
              }}
            >
              {forareFilter ? 'Öppna' : 'Planera'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedObj.lat && selectedObj.lng) {
                  onNavigera(selectedObj.lat, selectedObj.lng);
                }
                closeSheet();
              }}
              disabled={!selectedObj.lat || !selectedObj.lng}
              style={{
                width: '100%',
                padding: '0',
                height: '56px',
                borderRadius: '16px',
                border: '1px solid #555',
                background: 'transparent',
                color: selectedObj.lat && selectedObj.lng ? '#fff' : '#8e8e93',
                fontSize: '15px',
                fontWeight: '500',
                cursor: selectedObj.lat && selectedObj.lng ? 'pointer' : 'not-allowed',
              }}
            >
              Navigera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
