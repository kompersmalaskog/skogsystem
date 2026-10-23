'use client';
/**
 * DATAN BAKOM KALIBRERINGSVYN — hämtning, vald maskin och det som härleds ur den. Flyttat ur app/kalibrering/page.tsx
 * (2026-10), oförändrat: samma frågor, samma ordning, samma cachning per maskin, samma tysta fel där de var tysta.
 * Räknandet bor i lib/kalibrering; vyn (components/kalibrering) ritar bara.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { hamtaEnhetMaskin } from '@/lib/enhetMaskin';
import { maskinNamn, maskinKortNamn } from '@/lib/kalibrering/ordlista';
import { filtreradSammanfattning } from '@/lib/kalibrering/kalender';
import { idagManad } from '@/lib/kalibrering/datum';
import { startMaskin } from '@/lib/kalibrering/laget';
import { aktivaMaskinIds, artSnitt, filtreraKalib, rapportSnitt, rapportSedan, tradslagRader } from '@/lib/kalibrering/rapport';
import {
  type AlleMaskin, type BedomningResp, type CalResponse, type DiagnosResp, type FaktKalibrering,
  type KontrollTid, type ObjektData, type TradslagData,
} from '@/lib/kalibrering/typer';

/** De fyra flikarna: Läget (är vi godkända?), Över tid (blir det bättre?), Kontroller (vad mättes?), Objekt (slå upp en trakt). */
export type Flik = 'laget' | 'tid' | 'kontroller' | 'objekt';

export function useKalibreringData(activeTab: Flik) {
  const [loading, setLoading] = useState(true);
  const [allKalib, setAllKalib] = useState<FaktKalibrering[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // === Kalender-fliken: egen state + lazy fetch på tab-byte/manad-byte ===
  const [calManad, setCalManad] = useState<string>(idagManad);
  const [calData, setCalData] = useState<CalResponse | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);

  // Vilken maskin vyn visar — alltid EN (en sammanslagen bedömning av flera maskiner är ingen Vida-bedömning). null = föraren har inte valt:
  // då gäller datorns maskin, förarens egen, annars senaste kontrollens (startMaskin).
  const [valdMaskin, setValdMaskin] = useState<string | null>(null);
  const [alleMaskiner, setAlleMaskiner] = useState<AlleMaskin[]>([]);
  const { medarbetare } = useCurrentMedarbetare();
  const [enhetMaskin, setEnhetMaskin] = useState<string | null>(null);
  useEffect(() => { setEnhetMaskin(hamtaEnhetMaskin()); }, []); // läses efter montering — localStorage finns inte på servern

  // Profilbedömning per maskin (90-dagarsfönster) — cachas per maskin_id.
  const [bedomningMap, setBedomningMap] = useState<Record<string, BedomningResp>>({});
  // Diagnos-underlag per maskin (klasser, planområden, markörer).
  const [diagnosMap, setDiagnosMap] = useState<Record<string, DiagnosResp>>({});
  // Läsfel per maskin — ett fel är ett fel med "Försök igen", aldrig en evig "Läser…".
  const [bedomningFelMap, setBedomningFelMap] = useState<Record<string, string>>({});
  const [diagnosFelMap, setDiagnosFelMap] = useState<Record<string, string>>({});
  const [tradslagFelMap, setTradslagFelMap] = useState<Record<string, string>>({});
  const [objektFel, setObjektFel] = useState<string | null>(null);
  // Objekt-fliken (maskinoberoende)
  const [objektData, setObjektData] = useState<ObjektData | null>(null);
  // Per-trädslag (per maskin) — träff%/syst/std mot maskinens profil.
  const [tradslagMap, setTradslagMap] = useState<Record<string, TradslagData>>({});
  // Kontrollernas mättid och urval (per maskin) — Kontroller-listan. Läses när fliken öppnas.
  const [tiderMap, setTiderMap] = useState<Record<string, Record<string, KontrollTid>>>({});
  const [tiderFel, setTiderFel] = useState<string | null>(null);
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

  // Aktiva maskiner: sålda döljs från väljaren. Historiken finns kvar i DB.
  const aktivaIds = useMemo(() => aktivaMaskinIds(alleMaskiner), [alleMaskiner]);
  const arAktiv = useCallback(
    (mid: string) => aktivaIds.length === 0 || aktivaIds.includes(mid),
    [aktivaIds],
  );
  const aktivaMaskiner = useMemo(() => alleMaskiner.filter(m => arAktiv(m.maskin_id)), [alleMaskiner, arAktiv]);

  // Maskinen vyn visar: förarens val om det fortfarande går (maskinen finns och är aktiv), annars startmaskinen. Aldrig "alla".
  const effektiv: string | null = useMemo(() => {
    const giltigt = valdMaskin && arAktiv(valdMaskin) && (alleMaskiner.length === 0 || alleMaskiner.some(m => m.maskin_id === valdMaskin));
    return giltigt ? valdMaskin : startMaskin({ enhet: enhetMaskin, egen: medarbetare?.maskin_id ?? null, maskiner: alleMaskiner, arAktiv, allKalib });
  }, [valdMaskin, enhetMaskin, medarbetare, alleMaskiner, arAktiv, allKalib]);

  // Namn för ett id var som helst i vyn — aldrig råa id:n i UI:t.
  const maskinNamnFor = (id: string | null | undefined): string =>
    id ? maskinNamn(alleMaskiner.find(x => x.maskin_id === id) ?? { maskin_id: id }) : '—';
  const maskinKortNamnFor = (id: string | null | undefined): string =>
    id ? maskinKortNamn(alleMaskiner.find(x => x.maskin_id === id) ?? { maskin_id: id }) : '—';

  const bedomning = effektiv ? (bedomningMap[effektiv] ?? null) : null;
  const diagnosData = effektiv ? (diagnosMap[effektiv] ?? null) : null;
  const heroNamn = effektiv ? maskinNamnFor(effektiv) : '';
  // Är bedömningen eller diagnosen för den här maskinen på väg? (Skiljer "läser" från "kunde inte läsa".)
  const bedomningFel = effektiv ? bedomningFelMap[effektiv] ?? null : null;

  // Hämta diagnos-underlag (klasser, planområden, markörer) för vald maskin.
  const laddaDiagnos = useCallback((maskin: string, force = false) => {
    if (!maskin) return;
    if (!force && (diagnosMap[maskin] || diagnosFelMap[maskin])) return;
    fetch(`/api/kalibrering/diagnos?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: DiagnosResp & { ok?: boolean }) => {
        if (!data?.ok) throw new Error('svar utan diagnos');
        setDiagnosMap(prev => ({ ...prev, [maskin]: data }));
      })
      .catch(() => setDiagnosFelMap(prev => ({ ...prev, [maskin]: 'Kurvorna kunde inte läsas.' })));
  }, [diagnosMap, diagnosFelMap]);

  // Spara en åtgärdsmarkör (förare: "höjde trycket till 400 mm").
  // Returnerar true när åtgärden sparats (arket stängs då); false lämnar arket öppet med det som skrivits.
  const sparaMarkor = useCallback(async (): Promise<boolean> => {
    if (!effektiv || !nyMarkorDatum || !nyMarkorText.trim()) return false;
    const maskin = effektiv;
    setMarkorSparar(true);
    const { error } = await supabase.from('kalibrering_atgard').insert({
      maskin_id: maskin, datum: nyMarkorDatum, text: nyMarkorText.trim(),
    });
    setMarkorSparar(false);
    if (error) return false;
    setNyMarkorText(''); setNyMarkorDatum('');
    laddaDiagnos(maskin, true); // diagrammens linjer
    setBedomningMap(prev => { const { [maskin]: _borta, ...rest } = prev; return rest; }); // åtgärdsraderna (före → efter) läses om
    return true;
  }, [effektiv, nyMarkorDatum, nyMarkorText, laddaDiagnos]);

  // Sammanfattning omberäknad efter maskin
  const filteredSammanfattning = useMemo(
    () => (calData && effektiv ? filtreradSammanfattning(calData, effektiv) : null),
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

  // === Kontroller: kalendermånaden hämtas när fliken öppnas
  useEffect(() => {
    if (activeTab !== 'kontroller') return;
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

  // === Kontroller: mättid och urval per kontroll (en maskin åt gången)
  useEffect(() => {
    if (activeTab !== 'kontroller' || !effektiv || tiderMap[effektiv] || tiderFel) return;
    const maskin = effektiv;
    let cancelled = false;
    fetch(`/api/kalibrering/kontroller?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean; tider?: Record<string, KontrollTid> }) => {
        if (cancelled) return;
        if (!data?.ok || !data.tider) throw new Error('svar utan tider');
        setTiderMap(prev => ({ ...prev, [maskin]: data.tider as Record<string, KontrollTid> }));
      })
      .catch(() => { if (!cancelled) setTiderFel('Klockslag och urval kunde inte läsas.'); });
    return () => { cancelled = true; };
  }, [activeTab, effektiv, tiderMap, tiderFel]);
  // Byter man maskin börjar felet om från noll.
  useEffect(() => { setTiderFel(null); }, [effektiv]);

  // === Objekt: lazy fetch (maskinoberoende, en gång)
  useEffect(() => {
    if (activeTab !== 'objekt' || objektData || objektFel) return;
    let cancelled = false;
    fetch('/api/kalibrering/objekt?key=skogsystem-debug', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean } & ObjektData) => {
        if (cancelled) return;
        if (!data?.ok) throw new Error('svar utan objekt');
        setObjektData({ objekt: data.objekt, maskiner: data.maskiner });
      })
      .catch(() => { if (!cancelled) setObjektFel('Objekten kunde inte läsas.'); });
    return () => { cancelled = true; };
  }, [activeTab, objektData, objektFel]);

  // === Läget: per trädslag, lazy per maskin
  useEffect(() => {
    if (activeTab !== 'laget' || !effektiv || tradslagMap[effektiv] || tradslagFelMap[effektiv]) return;
    const maskin = effektiv;
    let cancelled = false;
    // dagar=90 → samma rullande fönster som bedomning. Ett fönster i hela Läget.
    fetch(`/api/kalibrering/tradslag?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}&dagar=90`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { ok?: boolean } & TradslagData) => {
        if (cancelled) return;
        if (!data?.ok) throw new Error('svar utan trädslag');
        setTradslagMap(prev => ({ ...prev, [maskin]: { profil: data.profil, trosklar: data.trosklar, tradslag: data.tradslag } }));
      })
      .catch(() => { if (!cancelled) setTradslagFelMap(prev => ({ ...prev, [maskin]: 'Trädslagen kunde inte läsas.' })); });
    return () => { cancelled = true; };
  }, [activeTab, effektiv, tradslagMap, tradslagFelMap]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
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
    } catch (err) {
      console.error('Fetch error:', err);
      setFetchError('Kunde inte ladda kontrolldata. Dra ner för att uppdatera.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Profilbedömning (90-dagarsfönster) för vald maskin — domen, Vidas krav och åtgärderna bygger på den.
  useEffect(() => {
    if (!effektiv || bedomningMap[effektiv] || bedomningFelMap[effektiv]) return;
    const maskin = effektiv;
    let cancelled = false;
    fetch(`/api/kalibrering/bedomning?key=skogsystem-debug&maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: BedomningResp & { ok?: boolean }) => {
        if (cancelled) return;
        if (!data?.ok) throw new Error('svar utan bedömning');
        setBedomningMap(prev => (prev[maskin] ? prev : { ...prev, [maskin]: data }));
      })
      .catch(() => { if (!cancelled) setBedomningFelMap(prev => ({ ...prev, [maskin]: 'Läget kunde inte läsas.' })); });
    return () => { cancelled = true; };
  }, [effektiv, bedomningMap, bedomningFelMap]);

  useEffect(() => { if (effektiv) laddaDiagnos(effektiv); }, [effektiv, laddaDiagnos]);

  /** Försök igen efter ett läsfel: nollar felen för vald maskin, och effekterna ovan hämtar om. */
  const forsokIgen = useCallback(() => {
    if (!effektiv) return;
    const maskin = effektiv;
    setBedomningFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setDiagnosFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setTradslagFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setObjektFel(null);
    setTiderFel(null);
  }, [effektiv]);

  // === Härlett ===
  // Urvalet för vald maskin (aldrig flera maskiner ihop)
  const filteredKalib = effektiv ? filtreraKalib(allKalib, effektiv, arAktiv) : [];
  const speciesData = artSnitt(filteredKalib);
  const { totalStockar } = rapportSnitt(filteredKalib);
  const trData = effektiv ? (tradslagMap[effektiv] ?? null) : null;
  const trRader = tradslagRader(trData);
  const reportSedan = rapportSedan(filteredKalib);
  const tider = effektiv ? (tiderMap[effektiv] ?? null) : null;

  return {
    loading, fetchError, fetchData, allKalib,
    alleMaskiner, aktivaMaskiner, valdMaskin, setValdMaskin, effektiv, maskinNamnFor, maskinKortNamnFor, arAktiv,
    heroNamn, bedomning, bedomningFel, diagnosData, diagnosFel: effektiv ? diagnosFelMap[effektiv] ?? null : null, forsokIgen,
    nyMarkorDatum, setNyMarkorDatum, nyMarkorText, setNyMarkorText, markorSparar, sparaMarkor,
    calManad, setCalManad, calData, calLoading, calError, filteredSammanfattning,
    objektData, objektFel, trData, trRader, tradslagFel: effektiv ? tradslagFelMap[effektiv] ?? null : null,
    tider, tiderFel,
    filteredKalib, speciesData, totalStockar, reportSedan,
  };
}

export type KalibreringData = ReturnType<typeof useKalibreringData>;
