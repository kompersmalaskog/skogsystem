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
import { idagManad, idagStr } from '@/lib/kalibrering/datum';
import { startMaskin } from '@/lib/kalibrering/laget';
import { aktivaMaskinIds, artSnitt, filtreraKalib, rapportSnitt, rapportSedan, tradslagRader } from '@/lib/kalibrering/rapport';
import {
  type AlleMaskin, type BedomningResp, type CalResponse, type DiagnosResp, type FaktKalibrering, type ForslagResp, type GreppResp, type GrovlekResp,
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
  // Över tid › Per grovlek (stammar per månad och grovlek, kontrollerna) och Greppet (maskinens egna stamprofiler, alla stammar) — per maskin, hämtas när vinkeln öppnas.
  const [grovlekMap, setGrovlekMap] = useState<Record<string, GrovlekResp>>({});
  const [grovlekFelMap, setGrovlekFelMap] = useState<Record<string, string>>({});
  const [greppMap, setGreppMap] = useState<Record<string, GreppResp>>({});
  const [greppFelMap, setGreppFelMap] = useState<Record<string, string>>({});
  const greppPagar = useRef<Set<string>>(new Set()); // maskiner vars Grepp-hämtning pågår
  // Läget › "Gör så här": nästa steg och besked per punkt på kurvan — per maskin. Läses när Läget öppnas och efter varje svar på ett steg.
  const [forslagMap, setForslagMap] = useState<Record<string, ForslagResp>>({});
  const [forslagFelMap, setForslagFelMap] = useState<Record<string, string>>({});
  const forslagPagar = useRef<Set<string>>(new Set());
  const [forslagSparar, setForslagSparar] = useState(false);
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
    fetch(`/api/kalibrering/diagnos?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: DiagnosResp & { ok?: boolean }) => {
        if (!data?.ok) throw new Error('svar utan diagnos');
        setDiagnosMap(prev => ({ ...prev, [maskin]: data }));
      })
      .catch(() => setDiagnosFelMap(prev => ({ ...prev, [maskin]: 'Kurvorna kunde inte läsas.' })));
  }, [diagnosMap, diagnosFelMap]);

  // Per grovlek: hela historiken för maskinen, en gång.
  const laddaGrovlek = useCallback((maskin: string) => {
    if (!maskin || grovlekMap[maskin] || grovlekFelMap[maskin]) return;
    fetch(`/api/kalibrering/grovlek?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: GrovlekResp) => {
        if (!data?.ok) throw new Error('svar utan grovlek');
        setGrovlekMap(prev => ({ ...prev, [maskin]: data }));
      })
      .catch(() => setGrovlekFelMap(prev => ({ ...prev, [maskin]: 'Grovlekarna kunde inte läsas.' })));
  }, [grovlekMap, grovlekFelMap]);

  // Greppet: servern läser bara cachen (cron-jobbet räknar om efter importen). `kvar` > 0 = några objekt ligger efter; vyn säger "Räknas om" och det som
  // redan är räknat visas. Vi frågar en gång per maskin — siffrorna kompletteras nästa gång vyn öppnas, ingen väntar på dem.
  const laddaGrepp = useCallback(async (maskin: string) => {
    if (!maskin || greppPagar.current.has(maskin)) return;
    if (greppFelMap[maskin] || greppMap[maskin]) return;
    greppPagar.current.add(maskin);
    try {
      const r = await fetch(`/api/kalibrering/grepp?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as GreppResp;
      if (!data?.ok) throw new Error('svar utan grepp');
      setGreppMap(prev => ({ ...prev, [maskin]: data }));
    } catch {
      setGreppFelMap(prev => ({ ...prev, [maskin]: 'Greppet kunde inte läsas.' }));
    } finally {
      greppPagar.current.delete(maskin);
    }
  }, [greppMap, greppFelMap]);

  // Justeringsförslagen. `force` hämtar om även när vi redan har ett svar (efter att föraren svarat på ett steg).
  const laddaForslag = useCallback(async (maskin: string, force = false) => {
    if (!maskin || forslagPagar.current.has(maskin)) return;
    if (!force && (forslagMap[maskin] || forslagFelMap[maskin])) return;
    forslagPagar.current.add(maskin);
    try {
      const r = await fetch(`/api/kalibrering/forslag?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as ForslagResp;
      if (!data?.ok) throw new Error('svar utan förslag');
      setForslagMap(prev => ({ ...prev, [maskin]: data }));
      setForslagFelMap(prev => { const { [maskin]: _borta, ...rest } = prev; return rest; });
    } catch {
      setForslagFelMap(prev => ({ ...prev, [maskin]: 'Det som ska göras kunde inte läsas.' }));
    } finally {
      forslagPagar.current.delete(maskin);
    }
  }, [forslagMap, forslagFelMap]);

  /**
   * Svar på ett steg i "Gör så här": en åtgärdsmarkör per text i kalibrering_atgard (samma tabell och samma datum som "Lägg till åtgärd"). Markören ÄR svaret —
   * nästa läsning av förslagen ser den och stegen flyttar sig. Returnerar true när allt sparats; false lämnar kortet kvar så föraren kan försöka igen.
   */
  const sparaForslagMarkor = useCallback(async (texter: string[]): Promise<boolean> => {
    if (!effektiv || texter.length === 0) return false;
    const maskin = effektiv;
    setForslagSparar(true);
    const datum = idagStr();
    const { error } = await supabase.from('kalibrering_atgard').insert(texter.map(text => ({ maskin_id: maskin, datum, text })));
    if (error) { setForslagSparar(false); return false; }
    laddaDiagnos(maskin, true); // diagrammens linjer
    setBedomningMap(prev => { const { [maskin]: _borta, ...rest } = prev; return rest; }); // åtgärdsraderna (före → efter) läses om
    await laddaForslag(maskin, true);
    setForslagSparar(false);
    return true;
  }, [effektiv, laddaDiagnos, laddaForslag]);

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
    fetch(`/api/kalibrering/kalender?manad=${calManad}`, { cache: 'no-store' })
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
    fetch(`/api/kalibrering/kontroller?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
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
    fetch('/api/kalibrering/objekt', { cache: 'no-store' })
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
    fetch(`/api/kalibrering/tradslag?maskin_id=${encodeURIComponent(maskin)}&dagar=90`, { cache: 'no-store' })
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
    fetch(`/api/kalibrering/bedomning?maskin_id=${encodeURIComponent(maskin)}`, { cache: 'no-store' })
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
  useEffect(() => { if (activeTab === 'laget' && effektiv) laddaForslag(effektiv); }, [activeTab, effektiv, laddaForslag]);

  /** Försök igen efter ett läsfel: nollar felen för vald maskin, och effekterna ovan hämtar om. */
  const forsokIgen = useCallback(() => {
    if (!effektiv) return;
    const maskin = effektiv;
    setBedomningFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setDiagnosFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setTradslagFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setGrovlekFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setGreppFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
    setForslagFelMap(prev => { const { [maskin]: _a, ...rest } = prev; return rest; });
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
    forslag: effektiv ? forslagMap[effektiv] ?? null : null, forslagFel: effektiv ? forslagFelMap[effektiv] ?? null : null, forslagSparar, sparaForslagMarkor,
    calManad, setCalManad, calData, calLoading, calError, filteredSammanfattning,
    objektData, objektFel, trData, trRader, tradslagFel: effektiv ? tradslagFelMap[effektiv] ?? null : null,
    tider, tiderFel,
    laddaGrovlek, grovlekData: effektiv ? grovlekMap[effektiv] ?? null : null, grovlekFel: effektiv ? grovlekFelMap[effektiv] ?? null : null,
    laddaGrepp, greppData: effektiv ? greppMap[effektiv] ?? null : null, greppFel: effektiv ? greppFelMap[effektiv] ?? null : null,
    filteredKalib, speciesData, totalStockar, reportSedan,
  };
}

export type KalibreringData = ReturnType<typeof useKalibreringData>;
