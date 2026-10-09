'use client';

// STARTA JOBB — vyn för jobb UTAN Vida-objekt: privata jobb, och jobb där Vida inte levererat än.
// Den ENDA födelsevägen för objekt (Martins beslut: /objekt-vyns eget skapande är borttaget och länkar hit).
//
// Tre ingångar:
//  1) NYTT JOBB: namn, typ (slutavverkning / gallring / GROT / energiklippning), Privat eller Väntar på Vida, valfri position.
//     • Maskindator (enheten är bunden till en maskin): maskinens position tas automatiskt, maskinen tilldelas i rätt rollfält,
//       status pågående, och körvyn öppnas direkt på det nya objektet (överlämning via lib/startaJobbOverlamning).
//     • Telefon/dator: position är valfri — peka på kartan, sök fastighet/ort eller "Här" (bara om man står på platsen).
//     • GROT: valfritt "Hör till objekt" (virkesobjektet på samma trakt; närmaste först).
//  2) MASKINOBJEKT (i efterhand): dim_objekt utan VO → P-VO sätts på maskinraden (smal RPC — dim_objekt är skrivskyddat för förare) och en
//     objekt-rad skapas med dim_objekt_id. ?objekt=<id> förväljer (matchningsvyns "Skapa").
//  3) SLÅ IHOP MED VIDA (bara "Väntar på Vida"): när Vida levererat ett objekt vars traktgräns innehåller jobbets position eller hyttspår
//     föreslås det överst och på jobbets rad. Ja flyttar allt till Vidas objekt och tar bort jobbet. Privata jobb frågas aldrig.
//
// Ärlig sparning genomgående: insert/RPC läses tillbaka, fel visas i klartext, aldrig tyst retur. Alla läsfel visas (en lista som felade är inte
// "tom"). Mått och färger ur lib/design/tokens.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AVSTAND, FARG, INAKTIV, KNAPP, KORT, RADIE, TYP, VY_ROT, designCss, underTopbar, medSafeBotten } from '@/lib/design/tokens';
import {
  jobbTypLabel, narmasteVirkesobjekt, skapaJobb, valideraJobb, type JobbIndata, type JobbRoll, type JobbTyp, type JobbUrsprung, type VirkesobjektRad,
} from '@/lib/startaJobb';
import {
  arVantaVidaJobb, arVidaObjekt, forslagText, hittaSlaIhopForslag, type JobbForSla, type SlaIhopForslag, type SparPunkt, type VidaObjektForSla,
} from '@/lib/vidaSammanslagning';
import { sammanfattaIhop } from '@/lib/slaIhopJobb';
import { skrivOverlamning } from '@/lib/startaJobbOverlamning';
import { hamtaEnhetMaskin } from '@/lib/enhetMaskin';
import { sattSenasteObjekt } from '@/lib/senasteObjekt';
import { rollAvMaskintyp } from '@/lib/maskindatorStart';
import { hamtaEnGpsFix } from '@/lib/gpsKalla';
import { haversineMeters } from '@/lib/gps-guard';
import type { KartPlats } from '@/components/starta/PlatsKarta';
import { falt, ForslagKort, Grupp, HorTill, Marke, PlatsVal, TypVal, UrsprungVal } from './delar';

interface DimObjekt {
  objekt_id: string;
  object_name: string | null;
  vo_nummer: string | null;
  skogsagare: string | null;
  bolag: string | null;
  huvudtyp: string | null;
}

/** Jobb-raden ur objekt (P-VO). */
interface JobbRad extends JobbForSla {
  markagare?: string | null;
  bolag?: string | null;
  typ?: string | null;
  status?: string | null;
}

interface TilldeladRad {
  nyckel: string;
  namn: string;
  vo: string;
  agare: string | null;
  bolag: string | null;
  typ: string | null;
  ursprung: string | null;
  jobbId: string | null;
  status: string | null;
}

interface Resultat { namn: string; vo_nummer: string; ursprung: JobbUrsprung | null; varning: string | null }

type Flik = 'nytt' | 'maskin' | 'tilldelade';
type Forslag = SlaIhopForslag & { jobb: JobbRad; vida: { id: string; namn: string | null; vo_nummer: string | null } };

const MASKIN_GPS_MS = 15000;
const GRANS_KM = 30;

const startaFel = (e: any) => (e?.message ? String(e.message) : 'okänt fel');

export default function StartaJobbPage() {
  // ── Data ──
  const [dimUtanVo, setDimUtanVo] = useState<DimObjekt[]>([]);
  const [tilldelade, setTilldelade] = useState<TilldeladRad[]>([]);
  const [jobb, setJobb] = useState<JobbRad[]>([]);
  const [virkes, setVirkes] = useState<(VirkesobjektRad & { kalla?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lasVarningar, setLasVarningar] = useState<string[]>([]);
  const [flik, setFlik] = useState<Flik>('nytt');
  const [sok, setSok] = useState('');
  const [forvalt, setForvalt] = useState<string | null>(null);   // ?objekt=<id>

  // ── Formulär ──
  const [namn, setNamn] = useState('');
  const [typ, setTyp] = useState<JobbTyp>('slutavverkning');
  const [ursprung, setUrsprung] = useState<JobbUrsprung>('vanta_vida');
  const [horTill, setHorTill] = useState<string | null>(null);
  const [markagare, setMarkagare] = useState('');
  const [bolag, setBolag] = useState('');
  const [plats, setPlats] = useState<KartPlats | null>(null);
  const [platsText, setPlatsText] = useState<string | null>(null);
  const [namnForslag, setNamnForslag] = useState<string | null>(null);

  // ── Tillstånd ──
  const [saving, setSaving] = useState(false);
  const [fel, setFel] = useState('');
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [visaVo, setVisaVo] = useState<{ namn: string; vo: string } | null>(null);

  // ── Maskindator ──
  const [maskin, setMaskin] = useState<{ id: string; namn: string; roll: JobbRoll | null } | null>(null);
  const [gps, setGps] = useState<{ status: 'soker' | 'ok' | 'ingen'; lat?: number; lng?: number; noggrannhetM?: number | null }>({ status: 'soker' });

  // ── Vida-förslag ──
  const [forslag, setForslag] = useState<Forslag[]>([]);
  const [forslagFel, setForslagFel] = useState<string | null>(null);
  const [ihopBusy, setIhopBusy] = useState<string | null>(null);
  const [ihopKlart, setIhopKlart] = useState<string | null>(null);

  // ───────────────────────── Laddning ─────────────────────────
  const ladda = useCallback(async () => {
    try {
      const [utanVo, dimTilldelade, objTilldelade, virkesR] = await Promise.all([
        supabase.from('dim_objekt')
          .select('objekt_id, object_name, vo_nummer, skogsagare, bolag, huvudtyp')
          .or('vo_nummer.is.null,vo_nummer.eq.')
          .order('object_name'),
        supabase.from('dim_objekt')
          .select('objekt_id, object_name, vo_nummer, skogsagare, bolag, huvudtyp')
          .like('vo_nummer', 'P-%')
          .order('object_name'),
        supabase.from('objekt')
          .select('id, namn, vo_nummer, markagare, bolag, typ, status, ursprung, lat, lng, created_at, sla_ihop_avvisade')
          .like('vo_nummer', 'P-%'),
        supabase.from('objekt')
          .select('id, namn, vo_nummer, typ, status, lat, lng')
          .in('typ', ['slutavverkning', 'gallring'])
          .limit(500),
      ]);
      if (utanVo.error) { setError(`Databasfel: ${utanVo.error.message}`); setLoading(false); return; }
      setDimUtanVo(utanVo.data || []);

      // Läsfel visas — en lista som felade är inte "tom".
      const varn: string[] = [];
      if (dimTilldelade.error) varn.push(`Maskinobjekt med VO kunde inte läsas: ${dimTilldelade.error.message}`);
      if (objTilldelade.error) varn.push(`Jobben kunde inte läsas: ${objTilldelade.error.message}`);
      if (virkesR.error) varn.push(`Virkesobjekt (för GROT "hör till") kunde inte läsas: ${virkesR.error.message}`);
      setLasVarningar(varn);
      setVirkes(virkesR.data || []);

      const jobbLista: JobbRad[] = (objTilldelade.data || []) as JobbRad[];
      setJobb(jobbLista);

      // Tilldelade = maskinobjekt med P-VO + jobb med P-VO, dedupe på VO (jobbraden bär mest information och vinner).
      const rader = new Map<string, TilldeladRad>();
      (dimTilldelade.data || []).forEach((o: any) => {
        if (o.vo_nummer) rader.set(o.vo_nummer, { nyckel: 'dim-' + o.objekt_id, namn: o.object_name || 'Namnlöst objekt', vo: o.vo_nummer, agare: o.skogsagare, bolag: o.bolag, typ: null, ursprung: null, jobbId: null, status: null });
      });
      jobbLista.forEach((o) => {
        if (o.vo_nummer) rader.set(o.vo_nummer, { nyckel: 'obj-' + o.id, namn: o.namn || 'Namnlöst objekt', vo: o.vo_nummer, agare: o.markagare ?? null, bolag: o.bolag ?? null, typ: o.typ ?? null, ursprung: o.ursprung ?? null, jobbId: o.id, status: o.status ?? null });
      });
      setTilldelade(Array.from(rader.values()).sort((a, b) => a.namn.localeCompare(b.namn, 'sv')));
      setError(null);
      setLoading(false);
      void kontrolleraVida(jobbLista);
    } catch (err: any) {
      setError(`Nätverksfel: ${startaFel(err)}`);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Har Vida levererat ett objekt över något av jobben som väntar? Läser Vida-objekt, deras traktgräns och jobbens hyttspår.
  const kontrolleraVida = useCallback(async (jobbLista: JobbRad[]) => {
    const vanta = jobbLista.filter(arVantaVidaJobb);
    if (vanta.length === 0) { setForslag([]); setForslagFel(null); return; }
    try {
      const [spR, vkR] = await Promise.all([
        supabase.from('hyttspar').select('objekt_id, points').in('objekt_id', vanta.map((j) => j.id)),
        supabase.from('objekt').select('id, namn, vo_nummer, ursprung, kalla, lat, lng, created_at').is('ursprung', null).not('vo_nummer', 'like', 'P-%').limit(500),
      ]);
      if (spR.error || vkR.error) { setForslagFel(`Kunde inte kontrollera om Vida levererat: ${(spR.error || vkR.error)!.message}`); return; }

      const sparPerJobb = new Map<string, SparPunkt[]>();
      for (const r of spR.data || []) {
        const lista = sparPerJobb.get(r.objekt_id) ?? [];
        for (const p of Array.isArray(r.points) ? r.points : []) if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) lista.push({ lat: p.lat, lng: p.lng });
        sparPerJobb.set(r.objekt_id, lista);
      }

      // Bara Vida-objekt i närheten av något jobb (jobbets punkt eller dess spårs ändpunkter) får sin traktgräns hämtad.
      const ref: { lat: number; lng: number }[] = [];
      for (const j of vanta) {
        if (Number.isFinite(Number(j.lat)) && Number.isFinite(Number(j.lng)) && j.lat != null && j.lng != null) ref.push({ lat: Number(j.lat), lng: Number(j.lng) });
        const sp = sparPerJobb.get(j.id) ?? [];
        if (sp.length) { ref.push(sp[0]); ref.push(sp[sp.length - 1]); }
      }
      const kandidater = ((vkR.data || []) as VidaObjektForSla[]).filter(arVidaObjekt)
        .map((v) => {
          const vl = Number(v.lat), vg = Number(v.lng);
          const d = ref.length && Number.isFinite(vl) && Number.isFinite(vg) ? Math.min(...ref.map((p) => haversineMeters(p.lat, p.lng, vl, vg))) : Infinity;
          return { v, d };
        })
        .filter((x) => x.d <= GRANS_KM * 1000)
        .sort((a, b) => a.d - b.d)
        .slice(0, 12)
        .map((x) => x.v);
      if (kandidater.length === 0) { setForslag([]); setForslagFel(null); return; }

      const geoR = await supabase.from('objekt_geometri').select('objekt_id, geometri').in('objekt_id', kandidater.map((k) => k.id));
      if (geoR.error) { setForslagFel(`Traktgränserna kunde inte läsas: ${geoR.error.message}`); return; }
      // objekt_geometri har RLS: en utgången session ger TOMT utan fel. Tomt fast kandidater finns → säg det, hävda inte "inget levererat".
      if ((geoR.data || []).length === 0) { setForslagFel('Traktgränserna kunde inte läsas (tomt svar) — förslag kan saknas. Logga in igen om det fortsätter.'); setForslag([]); return; }
      const geoMap = new Map((geoR.data || []).map((g: any) => [g.objekt_id, g.geometri]));
      const vida: VidaObjektForSla[] = kandidater.map((k) => ({ ...k, geometri: geoMap.get(k.id) ?? null }));

      const f = hittaSlaIhopForslag({ jobb: vanta, vida, sparPerJobb });
      const byId = new Map(vida.map((v) => [v.id, v]));
      setForslag(f.map((x) => ({ ...x, jobb: vanta.find((j) => j.id === x.jobbId)!, vida: { id: x.vidaId, namn: byId.get(x.vidaId)?.namn ?? null, vo_nummer: byId.get(x.vidaId)?.vo_nummer ?? null } })));
      setForslagFel(null);
    } catch (e: any) {
      setForslagFel(`Kunde inte kontrollera om Vida levererat: ${startaFel(e)}`);
    }
  }, []);

  useEffect(() => {
    // ?objekt=<id> läses utan useSearchParams (slipper Suspense-kravet)
    try {
      const id = new URLSearchParams(window.location.search).get('objekt');
      if (id) { setForvalt(id); setFlik('maskin'); }
    } catch { /* */ }
    void ladda();
  }, [ladda]);

  // Maskindator? Enheten är bunden till en maskin → maskinens position och rollen ur maskinregistret.
  useEffect(() => {
    const id = hamtaEnhetMaskin();
    if (!id) return;
    let avbruten = false;
    setMaskin({ id, namn: id, roll: null });
    (async () => {
      const { data, error: e } = await supabase.from('dim_maskin').select('maskin_id, maskin_typ, visningsnamn, modell').eq('maskin_id', id).maybeSingle();
      if (avbruten) return;
      if (e || !data) { setMaskin({ id, namn: id, roll: null }); return; }
      setMaskin({ id, namn: (data as any).visningsnamn || (data as any).modell || id, roll: rollAvMaskintyp((data as any).maskin_typ) });
    })();
    hamtaEnGpsFix(MASKIN_GPS_MS).then((fix) => {
      if (avbruten) return;
      if (fix && fix.giltig && fix.lat != null && fix.lng != null) setGps({ status: 'ok', lat: fix.lat, lng: fix.lng, noggrannhetM: fix.noggrannhetM ?? null });
      else setGps({ status: 'ingen' });
    });
    return () => { avbruten = true; };
  }, []);

  // Närmaste ortnamn → förslag på jobbets namn (bara när namnet är tomt och en position finns).
  const positionAttNamnaEfter = maskin ? (gps.status === 'ok' ? { lat: gps.lat!, lng: gps.lng! } : null) : plats;
  useEffect(() => {
    setNamnForslag(null);
    if (!positionAttNamnaEfter || namn.trim()) return;
    let avbruten = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/plats?lat=${positionAttNamnaEfter.lat}&lng=${positionAttNamnaEfter.lng}`);
        const j = await r.json().catch(() => null);
        if (!avbruten && r.ok && j?.ok && j.ort?.namn) setNamnForslag(String(j.ort.namn));
      } catch { /* ett saknat förslag är inget fel */ }
    }, 600);
    return () => { avbruten = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionAttNamnaEfter?.lat, positionAttNamnaEfter?.lng, namn === '']);

  // ───────────────────────── Härledda listor ─────────────────────────
  const horTillAlternativ = useMemo(() => narmasteVirkesobjekt(positionAttNamnaEfter, virkes, 6), [virkes, positionAttNamnaEfter?.lat, positionAttNamnaEfter?.lng]);   // eslint-disable-line react-hooks/exhaustive-deps

  const maskinLista = useMemo(() => {
    if (!sok.trim()) return dimUtanVo;
    const t = sok.toLowerCase();
    return dimUtanVo.filter((o) => (o.object_name || '').toLowerCase().includes(t) || (o.skogsagare || '').toLowerCase().includes(t) || (o.bolag || '').toLowerCase().includes(t));
  }, [dimUtanVo, sok]);

  const tilldeladeLista = useMemo(() => {
    if (!sok.trim()) return tilldelade;
    const t = sok.toLowerCase();
    return tilldelade.filter((o) => o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.bolag || '').toLowerCase().includes(t) || o.vo.toLowerCase().includes(t));
  }, [tilldelade, sok]);

  const forslagPerJobb = useMemo(() => new Map(forslag.map((f) => [f.jobbId, f])), [forslag]);

  // ───────────────────────── Åtgärder ─────────────────────────
  const hamtaVo = async (): Promise<string | null> => {
    const { data: vo, error: rpcErr } = await supabase.rpc('next_privat_vo');
    if (rpcErr || !vo) {
      setFel('Kunde inte hämta VO-nummer' + (rpcErr ? `: ${rpcErr.message}` : ' — inget svar från databasen'));
      return null;
    }
    return vo as string;
  };

  const skapa = async () => {
    if (saving) return;
    setFel('');
    const pos: KartPlats | null = maskin ? (gps.status === 'ok' ? { lat: gps.lat!, lng: gps.lng! } : null) : plats;
    const indata: JobbIndata = {
      namn, typ, ursprung, lat: pos?.lat ?? null, lng: pos?.lng ?? null,
      markagare, bolag, horTillObjektId: typ === 'grot' ? horTill : null,
      maskin: maskin?.roll ? { maskinId: maskin.id, roll: maskin.roll } : null,
    };
    const v = valideraJobb(indata);
    if (!v.ok) { setFel(v.fel); return; }
    setSaving(true);
    const r = await skapaJobb(supabase as any, indata);
    if (!r.ok) {
      setFel(r.fel + (r.voForbrukat ? ' (VO-numret är förbrukat — nästa jobb får nästa nummer.)' : ''));
      setSaving(false);
      return;
    }
    const rad = r.rad;
    setJobb((prev) => [rad, ...prev]);
    setTilldelade((prev) => [{ nyckel: 'obj-' + rad.id, namn: rad.namn, vo: r.vo, agare: rad.markagare ?? null, bolag: rad.bolag ?? null, typ: rad.typ ?? null, ursprung: rad.ursprung ?? null, jobbId: rad.id, status: rad.status ?? null }, ...prev]);

    // Maskindator: körvyn öppnas direkt på det nya objektet.
    if (maskin?.roll) {
      sattSenasteObjekt(maskin.id, rad.id);
      // Spår som loggats utan objekt tills nu (skyddsnätet) kopplas hit (server, service-roll). Får aldrig stoppa starten.
      try { void fetch('/api/hyttspar/koppla', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objektId: rad.id, maskinId: maskin.id }) }).catch(() => {}); } catch { /* */ }
      try { skrivOverlamning(sessionStorage, { objektId: rad.id, roll: maskin.roll, besked: `${r.vo} — knappa in numret i båda maskinerna` }); } catch { /* */ }
      window.location.href = '/planering';
      return;
    }
    setResultat({ namn: rad.namn, vo_nummer: r.vo, ursprung: indata.ursprung, varning: maskin && !maskin.roll ? 'Maskinen saknar typ i maskinregistret — jobbet skapades utan tilldelning och är inte startat.' : null });
    setNamn(''); setMarkagare(''); setBolag(''); setPlats(null); setPlatsText(null); setHorTill(null);
    setSaving(false);
    void kontrolleraVida([rad, ...jobb]);
  };

  // Maskinobjekt (i efterhand): P-VO på dim-raden via den smala RPC:n + objekt-rad med dim_objekt_id.
  const tilldelaMaskinObjekt = async (obj: DimObjekt) => {
    if (saving) return;
    setFel('');
    setSaving(true);
    const vo = await hamtaVo();
    if (!vo) { setSaving(false); return; }

    const { data: antal, error: dimErr } = await supabase.rpc('tilldela_vo_maskinobjekt', { p_dim_objekt_id: obj.objekt_id, p_vo: vo });
    if (dimErr) {
      const saknas = /could not find the function|does not exist/i.test(dimErr.message || '');
      setFel('Inget sparades — VO-numret sattes inte på maskinobjektet: ' + dimErr.message + (saknas ? ' (Migrationen 20261009110000_starta_jobb_ursprung_hor_till har inte körts.)' : ''));
      setSaving(false);
      return;
    }
    if (!antal || Number(antal) < 1) {
      setFel('Inget sparades — maskinobjektet har redan ett VO-nummer eller finns inte längre. Listan laddas om.');
      setSaving(false);
      void ladda();
      return;
    }

    const t = (obj.huvudtyp || '').toLowerCase().includes('gallr') ? 'gallring' : (obj.huvudtyp || '').toLowerCase().includes('slut') ? 'slutavverkning' : null;
    const { data: objRows, error: objErr } = await supabase.from('objekt').insert({
      namn: obj.object_name || null, vo_nummer: vo, markagare: obj.skogsagare || null, bolag: obj.bolag || null,
      ...(t ? { typ: t } : {}), dim_objekt_id: obj.objekt_id, kalla: 'starta-jobb', status: 'planerad',
    }).select('id');
    // Delvis misslyckande redovisas — VO:t är satt men planeringsraden saknas
    const varning = (objErr || !objRows || objRows.length === 0)
      ? 'OBS: VO-numret är satt på maskinobjektet, men planeringsraden kunde inte skapas — objektet syns inte i Objekt-vyn. Försök igen eller kontakta admin.'
      : null;
    setDimUtanVo((prev) => prev.filter((o) => o.objekt_id !== obj.objekt_id));
    setTilldelade((prev) => [{ nyckel: 'dim-' + obj.objekt_id, namn: obj.object_name || 'Namnlöst objekt', vo, agare: obj.skogsagare, bolag: obj.bolag, typ: t, ursprung: null, jobbId: null, status: null }, ...prev]);
    setResultat({ namn: obj.object_name || 'Namnlöst objekt', vo_nummer: vo, ursprung: null, varning });
    setForvalt(null);
    setSaving(false);
  };

  const slaIhop = async (f: Forslag) => {
    if (ihopBusy) return;
    setFel(''); setIhopKlart(null); setIhopBusy(f.jobbId);
    try {
      const r = await fetch('/api/starta-jobb/sla-ihop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ franId: f.jobbId, tillId: f.vidaId }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setFel('Kunde inte slå ihop: ' + (j?.fel || `svar ${r.status}`) + ' Jobbet finns kvar.'); return; }
      setIhopKlart(sammanfattaIhop(j, f.jobb.vo_nummer || f.jobb.namn || 'Jobbet', f.vida.namn || f.vida.vo_nummer || 'Vida-objektet'));
      await ladda();
    } catch (e: any) {
      setFel('Kunde inte slå ihop: ' + startaFel(e) + ' Jobbet finns kvar.');
    } finally {
      setIhopBusy(null);
    }
  };

  const avvisa = async (f: Forslag) => {
    setFel('');
    const ny = Array.from(new Set([...(f.jobb.sla_ihop_avvisade || []), f.vidaId]));
    const { data, error: e } = await supabase.from('objekt').update({ sla_ihop_avvisade: ny }).eq('id', f.jobbId).select('id');
    if (e || !data || data.length === 0) { setFel('Kunde inte spara ditt nej — förslaget kommer tillbaka' + (e ? `: ${e.message}` : ' (raden träffades inte).')); return; }
    setJobb((prev) => prev.map((j) => (j.id === f.jobbId ? { ...j, sla_ihop_avvisade: ny } : j)));
    setForslag((prev) => prev.filter((x) => x.jobbId !== f.jobbId));
  };

  // Sök och "Här" (telefon/dator).
  const sokPlats = async (q: string): Promise<{ traffar: any[] } | { fel: string }> => {
    try {
      const r = await fetch('/api/plats?q=' + encodeURIComponent(q));
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) return { fel: j?.fel || `Sökningen svarade ${r.status}` };
      return { traffar: j.traffar || [] };
    } catch (e: any) { return { fel: 'Sökningen nådde inte fram: ' + startaFel(e) }; }
  };
  const harPlats = async (): Promise<{ plats: KartPlats; noggrannhetM: number | null } | { fel: string }> => {
    const fix = await hamtaEnGpsFix(12000);
    if (fix && fix.giltig && fix.lat != null && fix.lng != null) return { plats: { lat: fix.lat, lng: fix.lng }, noggrannhetM: fix.noggrannhetM ?? null };
    return { fel: 'Ingen position från enheten — peka på kartan i stället.' };
  };

  // ───────────────────────── Vyer ─────────────────────────
  const yta: React.CSSProperties = { position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, background: FARG.bg, color: FARG.text, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: AVSTAND.sidmarginal, textAlign: 'center', fontFamily: 'inherit' };

  if (visaVo) {
    return (
      <div style={yta}><style>{designCss}</style>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{visaVo.namn}</div>
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.s }}>VO-nummer:</div>
        <div data-testid="vo-nummer" style={{ ...TYP.tal, marginTop: AVSTAND.l }}>{visaVo.vo}</div>
        <div style={{ width: '100%', maxWidth: 360, marginTop: AVSTAND.xxl }}>
          <button type="button" onClick={() => setVisaVo(null)} style={KNAPP.primar}>Tillbaka</button>
        </div>
      </div>
    );
  }

  if (resultat) {
    return (
      <div style={yta}><style>{designCss}</style>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{resultat.namn}</div>
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.s, maxWidth: 360 }}>Mata in detta nummer i terminalen — i båda maskinerna:</div>
        <div data-testid="vo-nummer" style={{ ...TYP.tal, marginTop: AVSTAND.l }}>{resultat.vo_nummer}</div>
        {resultat.ursprung && (
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.l, maxWidth: 360 }}>
            {resultat.ursprung === 'vanta_vida' ? 'Väntar på Vida — när Vida levererar objektet föreslår appen att slå ihop dem.' : 'Privat jobb — inget Vida-objekt kommer.'}
          </div>
        )}
        {resultat.varning && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.l, maxWidth: 360 }}>{resultat.varning}</div>}
        <div style={{ width: '100%', maxWidth: 360, marginTop: AVSTAND.xxl }}>
          <button type="button" data-testid="resultat-klar" onClick={() => setResultat(null)} style={KNAPP.primar}>Klar</button>
        </div>
      </div>
    );
  }

  const forvaltObjekt = forvalt ? dimUtanVo.find((o) => o.objekt_id === forvalt) : null;
  const maskinLage = !!maskin;
  const gpsText = gps.status === 'soker' ? 'Väntar på GPS …' : gps.status === 'ok' ? `Maskinens position hämtad${gps.noggrannhetM != null ? ` (±${Math.round(gps.noggrannhetM)} m)` : ''}` : 'Ingen GPS-position — jobbet skapas utan plats.';

  return (
    <div style={{ position: 'fixed', top: underTopbar(), left: 0, right: 0, bottom: 0, background: FARG.bg, color: FARG.text, fontFamily: 'inherit', overflowY: 'auto' }}>
      <style>{designCss}</style>
      <div style={{ ...VY_ROT, minHeight: 0, maxWidth: 640, margin: '0 auto', paddingTop: AVSTAND.xl, paddingBottom: medSafeBotten(120) }}>
        <h1 style={{ margin: 0, ...TYP.titel }}>Starta jobb</h1>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>För jobb utan Vida-objekt: privata jobb och jobb där Vida inte levererat än.</div>

        {/* Förvalt maskinobjekt (?objekt=<id> — matchningsvyns "Skapa") */}
        {forvaltObjekt && (
          <div style={{ ...KORT, marginTop: AVSTAND.sektion }}>
            <div style={{ ...TYP.micro, color: FARG.text2 }}>Valt maskinobjekt</div>
            <div style={{ ...TYP.listtitel, marginTop: AVSTAND.xs, color: forvaltObjekt.object_name ? FARG.text : FARG.orange }}>{forvaltObjekt.object_name || 'Namnlöst objekt'}</div>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{[forvaltObjekt.skogsagare, forvaltObjekt.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}</div>
            <div style={{ marginTop: AVSTAND.m, ...(saving ? INAKTIV : null) }}>
              <button type="button" onClick={() => void tilldelaMaskinObjekt(forvaltObjekt)} style={KNAPP.primar}>{saving ? 'Skapar …' : 'Skapa objekt & få VO'}</button>
            </div>
          </div>
        )}

        {fel && <div role="alert" data-testid="fel" style={{ ...KORT, color: FARG.rod, marginTop: AVSTAND.sektion, ...TYP.meta }}>{fel}</div>}
        {ihopKlart && <div role="status" data-testid="ihop-klart" style={{ ...KORT, marginTop: AVSTAND.sektion, ...TYP.meta }}>{ihopKlart}</div>}
        {lasVarningar.map((v) => <div key={v} role="status" style={{ ...KORT, color: FARG.orange, marginTop: AVSTAND.s, ...TYP.meta }}>{v}</div>)}
        {forslagFel && <div role="status" style={{ ...KORT, color: FARG.orange, marginTop: AVSTAND.s, ...TYP.meta }}>{forslagFel}</div>}

        {/* Vida har levererat — överst */}
        {forslag.length > 0 && (
          <section style={{ marginTop: AVSTAND.sektion }} data-testid="forslag-overst">
            <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Vida har levererat</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
              {forslag.map((f) => (
                <ForslagKort key={f.jobbId} text={forslagText(f.jobb, f.vida)} orsak={f.orsak} upptagen={ihopBusy === f.jobbId} onJa={() => void slaIhop(f)} onNej={() => void avvisa(f)} />
              ))}
            </div>
          </section>
        )}

        {/* Flikar */}
        <div role="tablist" style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.sektion, flexWrap: 'wrap' }}>
          {([['nytt', 'Nytt jobb'], ['maskin', `Maskinobjekt (${dimUtanVo.length})`], ['tilldelade', `Tilldelade (${tilldelade.length})`]] as [Flik, string][]).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={flik === k} data-testid={`flik-${k}`} onClick={() => setFlik(k)}
              style={{ ...KNAPP.tertiar, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp, ...(flik === k ? { background: FARG.fyllning, color: FARG.text } : null) }}>{label}</button>
          ))}
        </div>

        {flik !== 'nytt' && (
          <input type="search" value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Sök objekt, ägare …" aria-label="Sök" style={{ ...falt, marginTop: AVSTAND.m }} />
        )}

        <div style={{ marginTop: AVSTAND.l }}>
          {error ? (
            <div style={{ textAlign: 'center', padding: AVSTAND.xxl }}>
              <div style={{ ...TYP.text, color: FARG.rod, marginBottom: AVSTAND.l }}>{error}</div>
              <button type="button" onClick={() => window.location.reload()} style={KNAPP.sekundar}>Försök igen</button>
            </div>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: AVSTAND.xxl, color: FARG.text2, ...TYP.text }}>Laddar jobb …</div>
          ) : flik === 'nytt' ? (
            /* ── Nytt jobb ── */
            <div>
              <Grupp rubrik="Namn">
                <input value={namn} onChange={(e) => setNamn(e.target.value)} placeholder="Objektnamn (t.ex. Husjönäs 3:1 RP -26)" aria-label="Objektnamn" data-testid="falt-namn" style={falt} />
                {namnForslag && !namn.trim() && (
                  <button type="button" data-testid="namnforslag" onClick={() => setNamn(namnForslag)} style={{ ...KNAPP.tertiar, marginTop: AVSTAND.xs }}>Förslag på namn (närmaste ort): <strong style={{ marginLeft: AVSTAND.xs, color: FARG.text }}>{namnForslag}</strong>&nbsp;— använd</button>
                )}
              </Grupp>

              <Grupp rubrik="Typ"><TypVal valt={typ} onVal={(t) => { setTyp(t); if (t !== 'grot') setHorTill(null); }} /></Grupp>

              <Grupp rubrik="Vida"><UrsprungVal valt={ursprung} onVal={setUrsprung} /></Grupp>

              {typ === 'grot' && (
                <Grupp rubrik="Hör till objekt" valfri>
                  <HorTill alternativ={horTillAlternativ} valt={horTill} onVal={setHorTill} harPosition={!!positionAttNamnaEfter} />
                </Grupp>
              )}

              <Grupp rubrik={maskinLage ? 'Maskin och position' : 'Position'} valfri={!maskinLage}>
                {maskinLage ? (
                  <div style={KORT}>
                    <div style={TYP.listtitel}>{maskin!.namn}{maskin!.roll ? ` · ${maskin!.roll === 'skordare' ? 'skördare' : 'skotare'}` : ''}</div>
                    <div data-testid="gps-status" style={{ ...TYP.meta, color: gps.status === 'ok' ? FARG.text : FARG.text2, marginTop: AVSTAND.xs }}>{gpsText}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                      {maskin!.roll ? 'Jobbet startas direkt: maskinen tilldelas, status blir pågående och körvyn öppnas på objektet.' : 'Maskinen saknar typ i maskinregistret — jobbet skapas men startas inte.'}
                    </div>
                  </div>
                ) : (
                  <PlatsVal plats={plats} platsText={platsText} onPlats={(p, t) => { setPlats(p); setPlatsText(t); }} onSok={sokPlats} onHar={harPlats} />
                )}
              </Grupp>

              <Grupp rubrik="Markägare och bolag" valfri>
                <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                  <input value={markagare} onChange={(e) => setMarkagare(e.target.value)} placeholder="Markägare" aria-label="Markägare" style={falt} />
                  <input value={bolag} onChange={(e) => setBolag(e.target.value)} placeholder="Bolag" aria-label="Bolag" style={falt} />
                </div>
              </Grupp>

              <div style={{ marginTop: AVSTAND.sektion, ...(saving || !namn.trim() ? INAKTIV : null) }}>
                <button type="button" data-testid="skapa" onClick={() => void skapa()} style={KNAPP.primar}>
                  {saving ? 'Skapar …' : maskinLage && maskin?.roll ? 'Starta jobb' : 'Skapa jobb & få VO'}
                </button>
              </div>
              <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>
                Jobbet hamnar i Objekt-vyn. Knappa in VO-numret i båda maskinerna — maskindatan kopplas ihop automatiskt när filerna kommer in. Resten (inköpare, åtgärd, egenskaper) fylls i via Redigering.
              </div>
            </div>
          ) : flik === 'maskin' ? (
            /* ── Maskinobjekt utan VO ── */
            maskinLista.length === 0 ? (
              <div style={{ textAlign: 'center', padding: AVSTAND.xxl, color: FARG.text2 }}>
                <div style={TYP.text}>Alla maskinobjekt har VO-nummer</div>
                <div style={{ ...TYP.meta, marginTop: AVSTAND.s }}>Här dyker maskinobjekt upp som kommit in utan VO-nummer.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {maskinLista.map((obj) => (
                  <button key={obj.objekt_id} type="button" onClick={() => void tilldelaMaskinObjekt(obj)} data-testid={`maskinobjekt-${obj.objekt_id}`}
                    style={{ ...KORT, border: 'none', textAlign: 'left', cursor: 'pointer', color: FARG.text, fontFamily: 'inherit', ...(saving ? INAKTIV : null) }}>
                    <div style={{ ...TYP.listtitel, color: obj.object_name ? FARG.text : FARG.orange }}>{obj.object_name || 'Namnlöst objekt'}</div>
                    <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{[obj.skogsagare, obj.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}</div>
                  </button>
                ))}
              </div>
            )
          ) : (
            /* ── Tilldelade ── */
            tilldeladeLista.length === 0 ? (
              <div style={{ textAlign: 'center', padding: AVSTAND.xxl, color: FARG.text2, ...TYP.text }}>Inga tilldelade objekt ännu</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {tilldeladeLista.map((o) => {
                  const f = o.jobbId ? forslagPerJobb.get(o.jobbId) : undefined;
                  return (
                    <div key={o.nyckel} data-testid={`tilldelad-${o.vo}`} style={KORT}>
                      <div role="button" tabIndex={0} onClick={() => setVisaVo({ namn: o.namn, vo: o.vo })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setVisaVo({ namn: o.namn, vo: o.vo }); }} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, alignItems: 'baseline' }}>
                          <div style={TYP.listtitel}>{o.namn}</div>
                          <div style={TYP.rubrik}>{o.vo}</div>
                        </div>
                        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{[o.agare, o.bolag].filter(Boolean).join(' · ') || 'Okänd ägare'}</div>
                        {(o.typ || o.ursprung) && (
                          <div style={{ display: 'flex', gap: AVSTAND.xs, flexWrap: 'wrap', marginTop: AVSTAND.s }}>
                            {o.typ && <Marke text={jobbTypLabel(o.typ)} />}
                            {o.ursprung === 'vanta_vida' && <Marke text="Väntar på Vida" />}
                            {o.ursprung === 'privat' && <Marke text="Privat" />}
                            {o.status === 'pagaende' && <Marke text="Pågående" />}
                          </div>
                        )}
                      </div>
                      {f && <ForslagKort kompakt text={forslagText(f.jobb, f.vida)} orsak={f.orsak} upptagen={ihopBusy === f.jobbId} onJa={() => void slaIhop(f)} onNej={() => void avvisa(f)} />}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
