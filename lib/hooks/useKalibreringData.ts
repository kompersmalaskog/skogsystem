'use client';
/**
 * DATAN BAKOM KALIBRERINGSVYN — hämtning, vald maskin och det som härleds ur den. Flyttat ur app/kalibrering/page.tsx
 * (2026-10), oförändrat: samma frågor, samma ordning, samma cachning per maskin, samma tysta fel där de var tysta.
 * Räknandet bor i lib/kalibrering; vyn (components/kalibrering) ritar bara.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { maskinNamn, maskinKortNamn } from '@/lib/kalibrering/ordlista';
import { diagnos } from '@/lib/kalibrering/diagnos';
import { filtreradSammanfattning } from '@/lib/kalibrering/kalender';
import { idagManad } from '@/lib/kalibrering/datum';
import { aktivaMaskinIds, artSnitt, effektivMaskin, filtreraKalib, heroFilnamnFor, heroMaskinId, rapportBedomning, rapportDom, rapportSnitt, rapportSedan, tradslagRader } from '@/lib/kalibrering/rapport';
import { senasteSumma } from '@/lib/kalibrering/kontroll';
import {
  STOCK_SELECT, type AlleMaskin, type BedomningResp, type CalResponse, type DetaljKontrollStock, type DiagnosResp, type FaktKalibrering,
  type KalibHistorik, type ObjektData, type TradslagData,
} from '@/lib/kalibrering/typer';

export type Flik = 'today' | 'trend' | 'objekt' | 'calendar' | 'report';

export function useKalibreringData(activeTab: Flik) {
  const [loading, setLoading] = useState(true);
  const [allKalib, setAllKalib] = useState<FaktKalibrering[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, DetaljKontrollStock[]>>({});
  const [, setHistorik] = useState<KalibHistorik[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);

  // === Kalender-fliken: egen state + lazy fetch på tab-byte/manad-byte ===
  const [calManad, setCalManad] = useState<string>(idagManad);
  const [calData, setCalData] = useState<CalResponse | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  // Globalt maskinfilter — persistent över flikar
  const [selectedMaskinId, setSelectedMaskinId] = useState<string | 'all'>('all');
  const [alleMaskiner, setAlleMaskiner] = useState<AlleMaskin[]>([]);

  // Profilbedömning per maskin (90-dagarsfönster) — cachas per maskin_id.
  const [bedomningMap, setBedomningMap] = useState<Record<string, BedomningResp>>({});
  // Diagnos-underlag per maskin (klasser, planområden, markörer).
  const [diagnosMap, setDiagnosMap] = useState<Record<string, DiagnosResp>>({});
  // Objekt-fliken (maskinoberoende)
  const [objektData, setObjektData] = useState<ObjektData | null>(null);
  // Rapport per-trädslag (per maskin, all-time) — träff%/syst/std mot maskinens profil.
  const [tradslagMap, setTradslagMap] = useState<Record<string, TradslagData>>({});
  const [nyMarkorDatum, setNyMarkorDatum] = useState('');
  const [nyMarkorText, setNyMarkorText] = useState('');
  const [markorSparar, setMarkorSparar] = useState(false);

  // Hämta alla skördare (även sålda) en gång vid mount — listan i maskinarket
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('dim_maskin')
      .select('maskin_id, tillverkare, modell, visningsnamn, aktiv_till')
      .eq('maskin_typ', 'Harvester')
      .order('aktiv_till', { ascending: false, nullsFirst: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setAlleMaskiner(data as AlleMaskin[]);
      });
    return () => { cancelled = true; };
  }, []);

  const effektiv: string | 'all' = effektivMaskin(selectedMaskinId, alleMaskiner);

  const filterLabel = useMemo(() => {
    if (effektiv === 'all') return 'Alla maskiner';
    const m = alleMaskiner.find(x => x.maskin_id === effektiv);
    return maskinNamn(m ?? { maskin_id: effektiv });
  }, [effektiv, alleMaskiner]);
  // Namn för ett id var som helst i vyn — aldrig råa id:n i UI:t.
  const maskinNamnFor = (id: string | null | undefined): string =>
    id ? maskinNamn(alleMaskiner.find(x => x.maskin_id === id) ?? { maskin_id: id }) : '—';
  const maskinKortNamnFor = (id: string | null | undefined): string =>
    id ? maskinKortNamn(alleMaskiner.find(x => x.maskin_id === id) ?? { maskin_id: id }) : '—';

  // Aktiva maskiner: sålda döljs från väljare + 'alla'-aggregat. Historiken finns kvar i DB.
  const aktivaIds = useMemo(() => aktivaMaskinIds(alleMaskiner), [alleMaskiner]);
  const arAktiv = useCallback(
    (mid: string) => aktivaIds.length === 0 || aktivaIds.includes(mid),
    [aktivaIds],
  );
  // Senaste-fliken bedöms alltid per maskin.
  const heroMaskin = useMemo<string | null>(() => heroMaskinId(effektiv, allKalib, arAktiv), [effektiv, allKalib, arAktiv]);
  const heroFilnamn = useMemo<string | null>(() => heroFilnamnFor(heroMaskin, allKalib), [heroMaskin, allKalib]);
  const bedomning = heroMaskin ? (bedomningMap[heroMaskin] ?? null) : null;
  const diagnosData = heroMaskin ? (diagnosMap[heroMaskin] ?? null) : null;
  const verdikt = diagnos(diagnosData);
  const heroMaskinObj = heroMaskin ? alleMaskiner.find(m => m.maskin_id === heroMaskin) : undefined;
  const heroNamn = heroMaskin ? maskinNamn(heroMaskinObj ?? { maskin_id: heroMaskin }) : '';

  // Hämta diagnos-underlag (klasser, planområden, markörer) för vald maskin.
  const laddaDiagnos = useCallback((maskin: string, force = false) => {
    if (!maskin) return;
    if (!force && diagnosMap[maskin]) return;
    fetch(`/api/kalibrering/diagnos?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: DiagnosResp & { ok?: boolean }) => {
        if (!data?.ok) return;
        setDiagnosMap(prev => ({ ...prev, [maskin]: data }));
      })
      .catch(() => { /* tyst — förarvyn faller tillbaka på "läser diagnos" */ });
  }, [diagnosMap]);

  // Spara en åtgärdsmarkör (förare: "höjde trycket till 400 mm").
  const sparaMarkor = useCallback(async () => {
    if (!heroMaskin || !nyMarkorDatum || !nyMarkorText.trim()) return;
    setMarkorSparar(true);
    const { error } = await supabase.from('kalibrering_atgard').insert({
      maskin_id: heroMaskin, datum: nyMarkorDatum, text: nyMarkorText.trim(),
    });
    setMarkorSparar(false);
    if (!error) {
      setNyMarkorText(''); setNyMarkorDatum('');
      laddaDiagnos(heroMaskin, true); // ladda om så markören syns direkt
    }
  }, [heroMaskin, nyMarkorDatum, nyMarkorText, laddaDiagnos]);

  // Sammanfattning omberäknad efter filter
  const filteredSammanfattning = useMemo(
    () => (calData ? filtreradSammanfattning(calData, effektiv) : null),
    [calData, effektiv],
  );

  // Öppna kalendern på månaden för senaste kontrollen (inte innevarande, som ofta är tom). Körs en gång när data laddats;
  // överskrivs inte om användaren sen bläddrar bort.
  const calInitRef = useRef(false);
  useEffect(() => {
    if (calInitRef.current || allKalib.length === 0) return;
    calInitRef.current = true;
    setCalManad(allKalib[0].datum.slice(0, 7)); // "YYYY-MM"
  }, [allKalib]);

  useEffect(() => {
    if (activeTab !== 'calendar') return;
    if (calData?.manad === calManad && !calError) return; // har redan datan
    let cancelled = false;
    setCalLoading(true);
    setCalError(null);
    fetch(`/api/kalibrering/kalender?manad=${calManad}&key=skogsystem-debug`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: CalResponse) => { if (!cancelled) { setCalData(data); setCalLoading(false); } })
      .catch(err => { if (!cancelled) { setCalError(err?.message || 'Kunde inte ladda kalendern'); setCalLoading(false); } });
    return () => { cancelled = true; };
  }, [activeTab, calManad, calData, calError]);

  // === Objekt-fliken: lazy fetch (maskinoberoende, en gång)
  useEffect(() => {
    if (activeTab !== 'objekt' || objektData) return;
    let cancelled = false;
    fetch('/api/kalibrering/objekt?key=skogsystem-debug', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean } & ObjektData) => {
        if (cancelled || !data?.ok) return;
        setObjektData({ objekt: data.objekt, maskiner: data.maskiner });
      })
      .catch(() => { /* tyst — objekt-fliken visar "kunde inte ladda" */ });
    return () => { cancelled = true; };
  }, [activeTab, objektData]);

  // === Rapport per-trädslag: lazy fetch per maskin (bara när EN maskin är vald)
  useEffect(() => {
    if (activeTab !== 'report' || effektiv === 'all' || tradslagMap[effektiv]) return;
    const maskin = effektiv;
    let cancelled = false;
    // dagar=90 → samma rullande fönster som hjälten/bedomning. Ett fönster i hela rapporten.
    fetch(`/api/kalibrering/tradslag?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}&dagar=90`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean } & TradslagData) => {
        if (cancelled || !data?.ok) return;
        setTradslagMap(prev => ({ ...prev, [maskin]: { profil: data.profil, trosklar: data.trosklar, tradslag: data.tradslag } }));
      })
      .catch(() => { /* tyst — tabellen faller tillbaka på snitt */ });
    return () => { cancelled = true; };
  }, [activeTab, effektiv, tradslagMap]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setPartialError(null);
    try {
      const { data: kalibRows, error: kalibErr } = await supabase
        .from('fakt_kalibrering')
        .select('*')
        .order('datum', { ascending: false });

      if (kalibErr) {
        console.error('fakt_kalibrering error:', kalibErr);
        setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
        setLoading(false);
        return;
      }
      if (!kalibRows || kalibRows.length === 0) { setLoading(false); return; }

      setAllKalib(kalibRows);

      // stockMap används BARA för Senaste-kortet (latestStockar). Hämta därför bara senaste kontrollens stockar via
      // filnamn — komplett och billigt. (Tidigare hämtades ALLA rader utan pagination → PostgREST kapade vid 1000 av
      // 4160 → senaste kontrollen undercountades.)
      const latestFilnamn = kalibRows[0].filnamn;
      const { data: stockRows, error: stockErr } = await supabase
        .from('detalj_kontroll_stock')
        .select(STOCK_SELECT)
        .eq('filnamn', latestFilnamn)
        .order('stock_nummer', { ascending: true });

      if (stockErr) {
        console.error('detalj_kontroll_stock error:', stockErr);
        setPartialError('Vissa data kunde inte laddas');
      }

      const sMap: Record<string, DetaljKontrollStock[]> = {};
      (stockRows || []).forEach((s: DetaljKontrollStock) => {
        if (!sMap[s.filnamn]) sMap[s.filnamn] = [];
        sMap[s.filnamn].push(s);
      });
      setStockMap(sMap);

      const { data: histRows, error: histErr } = await supabase
        .from('fakt_kalibrering_historik')
        .select('*')
        .order('datum', { ascending: false });

      if (histErr) {
        console.error('fakt_kalibrering_historik error:', histErr);
        setPartialError('Vissa data kunde inte laddas');
      }
      setHistorik(histRows || []);
    } catch (err) {
      console.error('Fetch error:', err);
      setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Hämta profilbedömning (90-dagarsfönster) för den maskin Senaste-fliken visar.
  useEffect(() => {
    if (!heroMaskin || bedomningMap[heroMaskin]) return;
    let cancelled = false;
    fetch(`/api/kalibrering/bedomning?key=skogsystem-debug&maskin_id=${encodeURIComponent(heroMaskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: BedomningResp & { ok?: boolean }) => {
        if (cancelled || !data?.ok) return;
        setBedomningMap(prev => (prev[heroMaskin] ? prev : { ...prev, [heroMaskin]: data }));
      })
      .catch(() => { /* tyst — hjälten faller tillbaka på "inget underlag" */ });
    return () => { cancelled = true; };
  }, [heroMaskin, bedomningMap]);

  useEffect(() => { if (heroMaskin) laddaDiagnos(heroMaskin); }, [heroMaskin, laddaDiagnos]);

  // Senaste kontrollens stockar för vald maskin (kan skilja sig från globalt senaste när man filtrerar per maskin —
  // stockMap laddar annars bara den globala).
  useEffect(() => {
    if (!heroFilnamn || stockMap[heroFilnamn]) return;
    let cancelled = false;
    supabase
      .from('detalj_kontroll_stock')
      .select(STOCK_SELECT)
      .eq('filnamn', heroFilnamn)
      .order('stock_nummer', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setStockMap(prev => (prev[heroFilnamn] ? prev : { ...prev, [heroFilnamn]: data as unknown as DetaljKontrollStock[] }));
      });
    return () => { cancelled = true; };
  }, [heroFilnamn, stockMap]);

  // === Härlett ===
  // Senaste-fliken använder ALLTID hela datasetet (oberoende av filter)
  const latestKalib = heroFilnamn ? (allKalib.find(k => k.filnamn === heroFilnamn) ?? null) : (allKalib[0] ?? null);
  const latestStockar = latestKalib ? (stockMap[latestKalib.filnamn] || []).sort((a, b) => a.stock_nummer - b.stock_nummer) : [];
  const { totalLen: totalLatestLen, utanfor: latestUtanfor } = senasteSumma(latestStockar);

  // Filtrerade datakällor — Rapport räknar på dessa
  const filteredKalib = filtreraKalib(allKalib, effektiv, arAktiv);
  const speciesData = artSnitt(filteredKalib);
  const { totalStockar, avgLen: avgLenReport, avgDia: avgDiaReport } = rapportSnitt(filteredKalib);

  const reportBed = rapportBedomning(effektiv, bedomning);
  const trData = effektiv !== 'all' ? (tradslagMap[effektiv] ?? null) : null;
  const trRader = tradslagRader(trData);
  const reportSedan = rapportSedan(filteredKalib);
  const { diaBed: reportDiaBed, lenBed: reportLenBed, inomTolerans: verdictWithinTolerance } = rapportDom(reportBed, avgLenReport, avgDiaReport);

  return {
    loading, fetchError, partialError, fetchData, allKalib,
    alleMaskiner, selectedMaskinId, setSelectedMaskinId, effektiv, filterLabel, maskinNamnFor, maskinKortNamnFor, arAktiv,
    heroMaskin, heroNamn, bedomning, diagnosData, verdikt,
    nyMarkorDatum, setNyMarkorDatum, nyMarkorText, setNyMarkorText, markorSparar, sparaMarkor,
    calManad, setCalManad, calData, calLoading, calError, filteredSammanfattning,
    objektData, trData, trRader,
    latestKalib, latestStockar, totalLatestLen, latestUtanfor,
    filteredKalib, speciesData, totalStockar, avgLenReport, avgDiaReport,
    reportBed, reportDiaBed, reportLenBed, verdictWithinTolerance, reportSedan,
  };
}

export type KalibreringData = ReturnType<typeof useKalibreringData>;
