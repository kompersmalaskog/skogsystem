'use client';

// STARTA JOBB — jobb UTAN Vida-objekt: privata jobb, och jobb där Vida inte levererat än. Den ENDA födelsevägen för objekt.
//
// Omgjord 2026-10-24 (Martin: "samma design som i resten av appen, och man ser om ett VO är förbrukat/använt — tydligt"):
//  • Byggd på components/design (Sektion, Rad, Falt, Flikkontroll, Ark) som Arbetsrapporten och markägarvyn. Inga egna kort/flikar.
//  • Huvudvyn är LISTAN över P-VO grupperad på läge: Pågående (taget, eller startat utan data — orange), Lediga, Klara (hopfälld).
//    Läget står i ord på varje rad ("Tagen · H8E -26 · sedan 23 okt"), räknat i lib/startaJobbLage + lib/startaJobbLista.
//  • Ett tryck på ett jobb visar det: VO-numret stort, läget, maskinerna (och vilken roll som saknas), jobbets fakta, "Planera på kartan".
//  • "Nytt jobb" och "Maskinobjekt utan VO" är ark. Att ge ett maskinobjekt VO kräver ett tryck till (det går inte att ångra).
//  • Nytt jobb frågar: namn, typ, Vida, skotning (bara slutavverkning/gallring), hör till (bara GROT), position (KRÄVS — ett objekt
//    utan lat/lng gör planerarens markeringar fel, se STATUS/CLAUDE om P-1016/P-1017). Markägare och bolag fylls i via Redigering.
//  • Bredd: under 1100 px en sak per skärm; från 1100 px listan som sidokolumn och jobbet till höger (som Gallring och markägarrapporten).
//
// Maskindatorn (enheten är bunden till en maskin): maskinens position tas automatiskt, maskinen tilldelas, status pågående och körvyn
// öppnas direkt (överlämning via lib/startaJobbOverlamning) — oförändrat. Får den ingen GPS pekar man på kartan i stället.
//
// Ärlig sparning genomgående: insert/RPC läses tillbaka, fel visas i klartext, aldrig tyst retur. En lista som inte gick att läsa är aldrig
// "tom", och en maskindata som inte gick att läsa visar aldrig "Ledig".

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  AVSTAND, FARG, FONT, INAKTIV, KNAPP, KOLUMN, KOLUMN_CSS, LAYOUT, ROT_MIN_HOJD, TYP, designCss, medSafeBotten,
} from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import {
  jobbTypLabel, narmasteVirkesobjekt, skapaJobb, valideraJobb, type JobbIndata, type JobbRoll, type JobbTyp, type JobbUrsprung, type VirkesobjektRad,
} from '@/lib/startaJobb';
import { inknappningsText, kanHaEgenSkotning } from '@/lib/startaJobbLage';
import { grupperaJobb, lasJobbLista, sokJobb, type JobbVy } from '@/lib/startaJobbLista';
import { sparaSkotning } from '@/lib/startaJobbSkotning';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
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
import { FaltEtikett, ForslagKort, HorTill, JobbRader, LageUnder, MaskinSektion, PlatsVal, SkotningVal, TypVal, UrsprungVal, falt } from './delar';

interface DimObjekt {
  objekt_id: string;
  object_name: string | null;
  vo_nummer: string | null;
  skogsagare: string | null;
  bolag: string | null;
  huvudtyp: string | null;
  maskin_id?: string | null;
  start_date?: string | null;
}

type Forslag = SlaIhopForslag & { jobb: JobbForSla; vida: { id: string; namn: string | null; vo_nummer: string | null } };
type ArkLage = null | 'nytt' | 'maskinobjekt' | 'skotning' | { bekrafta: DimObjekt };

const MASKIN_GPS_MS = 15000;
const GRANS_KM = 30;
/** Från denna bredd står listan bredvid jobbet (samma som Gallring och markägarrapporten). */
const SIDOKOLUMN_FRAN_PX = 1100;
const SIDOKOLUMN_BREDD_PX = 360;
/** Sökfältet visas när listan är längre än så. */
const SOK_FRAN = 8;

const startaFel = (e: any) => (e?.message ? String(e.message) : 'okänt fel');

// Inga citattecken i CSS-strängen: React escapar dem i <style> vid serverrendering (CLAUDE.md, markägarrapporten).
const css = `
.sj-ram { display: flex; min-height: ${ROT_MIN_HOJD}; background: ${FARG.bg}; color: ${FARG.text}; }
.sj-lista { width: 100%; box-sizing: border-box; padding: ${AVSTAND.xl}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; }
.sj-lista-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
.sj-detalj { flex: 1; min-width: 0; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl}px; }
.sj-detalj-inre { max-width: ${KOLUMN.smal}px; margin: 0 auto; }
@media (max-width: ${SIDOKOLUMN_FRAN_PX - 1}px) {
  .sj-lista-vy .sj-detalj { display: none; }
  .sj-jobb-vy .sj-lista { display: none; }
}
@media (min-width: ${SIDOKOLUMN_FRAN_PX}px) {
  .sj-lista {
    width: ${SIDOKOLUMN_BREDD_PX}px; flex-shrink: 0; border-right: 1px solid ${FARG.linje};
    position: sticky; top: ${LAYOUT.topbar}; height: ${ROT_MIN_HOJD}; overflow-y: auto;
  }
  .sj-lista-inre { max-width: none; }
  .sj-detalj { padding-top: ${AVSTAND.xxl}px; }
  .sj-bara-smal { display: none !important; }
}
`;

export default function StartaJobbPage() {
  const idagAr = new Date().getFullYear();
  const { medarbetare } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';

  // ── Data ──
  const [jobb, setJobb] = useState<JobbVy[]>([]);
  const [dimUtanVo, setDimUtanVo] = useState<DimObjekt[]>([]);
  const [virkes, setVirkes] = useState<(VirkesobjektRad & { kalla?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lasVarningar, setLasVarningar] = useState<string[]>([]);

  // ── Navigering ──
  const [valt, setValt] = useState<string | null>(null);        // JobbVy.nyckel
  const [nyss, setNyss] = useState<string | null>(null);        // nyckeln på jobbet som just skapades (visar "Knappa in …" + Klar)
  const [ark, setArk] = useState<ArkLage>(null);
  const [sok, setSok] = useState('');
  const [sokMaskin, setSokMaskin] = useState('');
  const [visaKlara, setVisaKlara] = useState(false);

  // ── Formulär ──
  const [namn, setNamn] = useState('');
  const [typ, setTyp] = useState<JobbTyp>('slutavverkning');
  const [ursprung, setUrsprung] = useState<JobbUrsprung>('vanta_vida');
  const [egenSkotning, setEgenSkotning] = useState(false);
  const [horTill, setHorTill] = useState<string | null>(null);
  const [plats, setPlats] = useState<KartPlats | null>(null);
  const [platsText, setPlatsText] = useState<string | null>(null);
  const [namnForslag, setNamnForslag] = useState<string | null>(null);

  // ── Tillstånd ──
  const [saving, setSaving] = useState(false);
  const [fel, setFel] = useState('');
  const [varning, setVarning] = useState<string | null>(null);
  const [skotningSparar, setSkotningSparar] = useState(false);
  const [skotningFel, setSkotningFel] = useState('');

  // ── Maskindator ──
  const [maskin, setMaskin] = useState<{ id: string; namn: string; roll: JobbRoll | null } | null>(null);
  const [gps, setGps] = useState<{ status: 'soker' | 'ok' | 'ingen'; lat?: number; lng?: number; noggrannhetM?: number | null }>({ status: 'soker' });

  // ── Vida-förslag ──
  const [forslag, setForslag] = useState<Forslag[]>([]);
  const [forslagFel, setForslagFel] = useState<string | null>(null);
  const [ihopBusy, setIhopBusy] = useState<string | null>(null);
  const [ihopKlart, setIhopKlart] = useState<string | null>(null);

  // ───────────────────────── Laddning ─────────────────────────
  // Har Vida levererat ett objekt över något av jobben som väntar? Läser Vida-objekt, deras traktgräns och jobbens hyttspår.
  const kontrolleraVida = useCallback(async (jobbLista: JobbForSla[]) => {
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

  const ladda = useCallback(async () => {
    try {
      const [lista, utanVo, virkesR] = await Promise.all([
        lasJobbLista(supabase as any, idagAr),
        supabase.from('dim_objekt')
          .select('objekt_id, object_name, vo_nummer, skogsagare, bolag, huvudtyp, maskin_id, start_date')
          .or('vo_nummer.is.null,vo_nummer.eq.')
          .order('object_name'),
        supabase.from('objekt').select('id, namn, vo_nummer, typ, status, lat, lng').in('typ', ['slutavverkning', 'gallring']).limit(500),
      ]);
      if (!lista.ok) { setError(lista.fel); setLoading(false); return; }
      const varn = [...lista.varningar];
      if (utanVo.error) varn.push(`Maskinobjekt utan VO kunde inte läsas: ${utanVo.error.message}`);
      if (virkesR.error) varn.push(`Virkesobjekt (för GROT "hör till") kunde inte läsas: ${virkesR.error.message}`);
      setLasVarningar(varn);
      setJobb(lista.jobb);
      setDimUtanVo(utanVo.data || []);
      setVirkes(virkesR.data || []);
      setError(null);
      setLoading(false);
      void kontrolleraVida(lista.jobb.map((j) => j.rad).filter((r): r is NonNullable<typeof r> => !!r) as JobbForSla[]);
    } catch (err: any) {
      setError(`Nätverksfel: ${startaFel(err)}`);
      setLoading(false);
    }
  }, [idagAr, kontrolleraVida]);

  useEffect(() => {
    // ?objekt=<id> (matchningsvyns "Skapa") öppnar bekräftelsen för det maskinobjektet när listan är läst.
    void ladda();
  }, [ladda]);

  useEffect(() => {
    let id: string | null = null;
    try { id = new URLSearchParams(window.location.search).get('objekt'); } catch { /* */ }
    if (!id || loading) return;
    const o = dimUtanVo.find((d) => d.objekt_id === id);
    if (o) setArk({ bekrafta: o });
    try { const u = new URL(window.location.href); u.searchParams.delete('objekt'); window.history.replaceState(null, '', u.toString()); } catch { /* */ }
  }, [loading, dimUtanVo]);

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

  // Positionen jobbet får: maskinens GPS på maskindatorn, annars den valda på kartan (också på maskindatorn när GPS saknas).
  const maskinGpsOk = !!maskin && gps.status === 'ok';
  const position: KartPlats | null = maskinGpsOk ? { lat: gps.lat!, lng: gps.lng! } : plats;

  // Närmaste ortnamn → förslag på jobbets namn (bara när namnet är tomt och en position finns).
  useEffect(() => {
    setNamnForslag(null);
    if (!position || namn.trim()) return;
    let avbruten = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/plats?lat=${position.lat}&lng=${position.lng}`);
        const j = await r.json().catch(() => null);
        if (!avbruten && r.ok && j?.ok && j.ort?.namn) setNamnForslag(String(j.ort.namn));
      } catch { /* ett saknat förslag är inget fel */ }
    }, 600);
    return () => { avbruten = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.lat, position?.lng, namn === '']);

  // ───────────────────────── Härledda ─────────────────────────
  const horTillAlternativ = useMemo(() => narmasteVirkesobjekt(position, virkes, 6), [virkes, position?.lat, position?.lng]);   // eslint-disable-line react-hooks/exhaustive-deps
  const grupper = useMemo(() => grupperaJobb(sokJobb(jobb, sok)), [jobb, sok]);
  const valtJobb = valt ? jobb.find((j) => j.nyckel === valt) ?? null : null;
  const forslagPerJobb = useMemo(() => new Map(forslag.map((f) => [f.jobbId, f])), [forslag]);
  const forslagUtanValt = forslag.filter((f) => !valtJobb || f.jobbId !== valtJobb.jobbId);
  const maskinLista = useMemo(() => {
    const t = sokMaskin.trim().toLowerCase();
    if (!t) return dimUtanVo;
    return dimUtanVo.filter((o) => [o.object_name, o.skogsagare, o.bolag].some((v) => (v || '').toLowerCase().includes(t)));
  }, [dimUtanVo, sokMaskin]);
  const maskinNamn = useMemo(() => new Map(jobb.flatMap((j) => j.maskiner.map((m) => [m.maskinId, m.namn] as const))), [jobb]);

  // ───────────────────────── Åtgärder ─────────────────────────
  const valj = (j: JobbVy) => { setValt(j.nyckel); setNyss(null); setFel(''); setVarning(null); try { window.scrollTo({ top: 0 }); } catch { /* jsdom */ } };
  const tillListan = () => { setValt(null); setNyss(null); setVarning(null); };

  const nollstallFormular = () => {
    setNamn(''); setTyp('slutavverkning'); setUrsprung('vanta_vida'); setEgenSkotning(false); setHorTill(null); setPlats(null); setPlatsText(null);
  };

  const formularKlart = !!namn.trim() && !!position;

  // Ändra skotningen på ett befintligt jobb (bara admin). Ett tryck på ett val sparar; arket stängs först när det är sparat.
  const andraSkotning = async (j: JobbVy, egen: boolean) => {
    if (skotningSparar) return;
    if (egen === j.egenSkotning) { setArk(null); return; }
    setSkotningFel('');
    setSkotningSparar(true);
    const r = await sparaSkotning(supabase as any, { jobbId: j.jobbId, dimIds: j.dimIds }, egen);
    setSkotningSparar(false);
    if (!r.ok) { setSkotningFel(r.fel); return; }
    setArk(null);
    await ladda();
  };

  const skapa = async () => {
    if (saving) return;
    setFel('');
    const indata: JobbIndata = {
      namn, typ, ursprung, lat: position?.lat ?? null, lng: position?.lng ?? null,
      horTillObjektId: typ === 'grot' ? horTill : null,
      egenSkotning: kanHaEgenSkotning(typ) ? egenSkotning : false,
      maskin: maskin?.roll ? { maskinId: maskin.id, roll: maskin.roll } : null,
    };
    if (!position) { setFel('Välj var jobbet är — peka på kartan eller sök fastigheten.'); return; }
    const v = valideraJobb(indata);
    if (!v.ok) { setFel(v.fel); return; }
    setSaving(true);
    const r = await skapaJobb(supabase as any, indata);
    if (!r.ok) {
      const saknasKolumn = /egen_skotning/.test(r.fel);
      setFel(r.fel + (saknasKolumn ? ' (Egen skotning kräver migrationen 20261024121848_objekt_egen_skotning — välj Vi skotar så länge.)' : '')
        + (r.voForbrukat ? ' VO-numret är förbrukat — nästa jobb får nästa nummer.' : ''));
      setSaving(false);
      return;
    }
    const rad = r.rad;

    // Maskindator: körvyn öppnas direkt på det nya objektet.
    if (maskin?.roll) {
      sattSenasteObjekt(maskin.id, rad.id);
      // Spår som loggats utan objekt tills nu (skyddsnätet) kopplas hit (server, service-roll). Får aldrig stoppa starten.
      // keepalive: anropet ska hinna iväg trots att sidan byter till /planering direkt efter.
      try { void fetch('/api/hyttspar/koppla', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objektId: rad.id, maskinId: maskin.id }) }).catch(() => {}); } catch { /* */ }
      try { skrivOverlamning(sessionStorage, { objektId: rad.id, roll: maskin.roll, besked: `${r.vo} — ${inknappningsText(typ === 'grot' || typ === 'energiklippning' ? 'en_maskin' : egenSkotning ? 'bara_skordare' : 'skordare_och_skotare').toLowerCase()}` }); } catch { /* */ }
      window.location.href = '/planering';
      return;
    }
    setVarning(maskin && !maskin.roll ? 'Maskinen saknar typ i maskinregistret — jobbet skapades utan tilldelning och är inte startat.' : null);
    setArk(null);
    nollstallFormular();
    setSaving(false);
    await ladda();
    setValt('obj-' + rad.id);
    setNyss('obj-' + rad.id);
  };

  // Maskinobjekt (i efterhand): P-VO på dim-raden via den smala RPC:n + objekt-rad med dim_objekt_id.
  const tilldelaMaskinObjekt = async (obj: DimObjekt) => {
    if (saving) return;
    setFel('');
    setSaving(true);
    const { data: vo, error: rpcErr } = await supabase.rpc('next_privat_vo');
    if (rpcErr || !vo) {
      setFel('Kunde inte hämta VO-nummer' + (rpcErr ? `: ${rpcErr.message}` : ' — inget svar från databasen'));
      setSaving(false);
      return;
    }

    const { data: antal, error: dimErr } = await supabase.rpc('tilldela_vo_maskinobjekt', { p_dim_objekt_id: obj.objekt_id, p_vo: vo });
    if (dimErr) {
      const saknas = /could not find the function|does not exist/i.test(dimErr.message || '');
      setFel('Inget sparades — VO-numret sattes inte på maskinobjektet: ' + dimErr.message + (saknas ? ' (Migrationen 20261014125025_starta_jobb_ursprung_hor_till har inte körts.)' : ''));
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
    const delvis = objErr || !objRows || objRows.length === 0;
    setVarning(delvis ? 'OBS: VO-numret är satt på maskinobjektet, men planeringsraden kunde inte skapas — objektet syns inte i Objekt-vyn. Försök igen eller kontakta admin.' : null);
    setArk(null);
    setSaving(false);
    await ladda();
    const nyckel = delvis ? 'dim-' + obj.objekt_id : 'obj-' + objRows![0].id;
    setValt(nyckel);
    setNyss(nyckel);
  };

  const slaIhop = async (f: Forslag) => {
    if (ihopBusy) return;
    setFel(''); setIhopKlart(null); setIhopBusy(f.jobbId);
    try {
      const r = await fetch('/api/starta-jobb/sla-ihop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ franId: f.jobbId, tillId: f.vidaId }) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) { setFel('Kunde inte slå ihop: ' + (j?.fel || `svar ${r.status}`) + ' Jobbet finns kvar.'); return; }
      setIhopKlart(sammanfattaIhop(j, f.jobb.vo_nummer || f.jobb.namn || 'Jobbet', f.vida.namn || f.vida.vo_nummer || 'Vida-objektet'));
      tillListan();
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
    setForslag((prev) => prev.filter((x) => x.jobbId !== f.jobbId));
  };

  // Sök och "Använd min position" (telefon/dator).
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

  // ───────────────────────── Delar av vyn ─────────────────────────
  const meddelanden = (
    <>
      {fel && !ark && <div role="alert" data-testid="fel" style={{ ...TYP.meta, color: FARG.rod, marginBottom: AVSTAND.m }}>{fel}</div>}
      {ihopKlart && <div role="status" data-testid="ihop-klart" style={{ ...TYP.meta, color: FARG.text, marginBottom: AVSTAND.m }}>{ihopKlart}</div>}
      {lasVarningar.map((v) => <div key={v} role="status" style={{ ...TYP.meta, color: FARG.orange, marginBottom: AVSTAND.s }}>{v}</div>)}
      {forslagFel && <div role="status" style={{ ...TYP.meta, color: FARG.orange, marginBottom: AVSTAND.s }}>{forslagFel}</div>}
    </>
  );

  const listan = (
    <div className="sj-lista-inre">
      <h1 style={{ margin: 0, ...TYP.titel }}>Starta jobb</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.xl}px` }}>Privata jobb och jobb där Vida inte levererat än.</p>
      {meddelanden}

      {forslagUtanValt.map((f) => (
        <ForslagKort key={f.jobbId} text={forslagText(f.jobb, f.vida)} orsak={f.orsak} upptagen={ihopBusy === f.jobbId} onJa={() => void slaIhop(f)} onNej={() => void avvisa(f)} />
      ))}

      <button type="button" data-testid="nytt-jobb" onClick={() => { setFel(''); setArk('nytt'); }} style={KNAPP.primar}>Nytt jobb</button>

      {dimUtanVo.length > 0 && (
        <div style={{ marginTop: AVSTAND.m }}>
          <Sektion rubrik="Maskinobjekt" foljdAvLankar>
            <Rad titel={`${dimUtanVo.length} ${dimUtanVo.length === 1 ? 'maskinobjekt saknar' : 'maskinobjekt saknar'} VO`} under="Data har kommit in utan VO-nummer" sista
              onTryck={() => { setFel(''); setSokMaskin(''); setArk('maskinobjekt'); }} attr={{ 'data-testid': 'maskinobjekt-rad' }} />
          </Sektion>
        </div>
      )}

      {jobb.length > SOK_FRAN && (
        <input type="search" value={sok} onChange={(e) => setSok(e.target.value)} placeholder="Sök jobb, VO eller maskin" aria-label="Sök jobb" style={{ ...falt, marginTop: AVSTAND.l }} />
      )}

      <div style={{ marginTop: AVSTAND.xl }}>
        {error ? (
          <div style={{ textAlign: 'center', padding: AVSTAND.xxl }}>
            <div style={{ ...TYP.text, color: FARG.rod, marginBottom: AVSTAND.l }}>{error}</div>
            <button type="button" onClick={() => { setLoading(true); setError(null); void ladda(); }} style={KNAPP.sekundar}>Försök igen</button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: AVSTAND.xxl, color: FARG.text2, ...TYP.text }}>Läser jobben och om numren är inknappade …</div>
        ) : jobb.length === 0 ? (
          <div style={{ textAlign: 'center', padding: AVSTAND.xxl, color: FARG.text2 }}>
            <div style={TYP.text}>Inga jobb än</div>
            <div style={{ ...TYP.meta, marginTop: AVSTAND.s }}>Nytt jobb ger ett P-nummer att knappa in i maskinerna.</div>
          </div>
        ) : (
          <>
            {grupper.pagaende.length > 0 && <Sektion rubrik="Pågående"><JobbRader jobb={grupper.pagaende} onValj={valj} /></Sektion>}
            {grupper.lediga.length > 0 && <Sektion rubrik="Lediga" not="Inte inknappade i någon maskin än."><JobbRader jobb={grupper.lediga} onValj={valj} /></Sektion>}
            {grupper.klara.length > 0 && (
              visaKlara || sok.trim()
                ? <Sektion rubrik="Klara" onRubrikTryck={() => setVisaKlara(false)} hoger="Dölj"><JobbRader jobb={grupper.klara} onValj={valj} dampad /></Sektion>
                : <Sektion rubrik="Klara" kort={false} onRubrikTryck={() => setVisaKlara(true)} hoger={String(grupper.klara.length)}>{null}</Sektion>
            )}
            {sok.trim() && grupper.pagaende.length + grupper.lediga.length + grupper.klara.length === 0 && (
              <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', padding: AVSTAND.xl }}>Inget jobb matchar ”{sok.trim()}”.</div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const detaljen = valtJobb ? (() => {
    const j = valtJobb;
    const f = j.jobbId ? forslagPerJobb.get(j.jobbId) : undefined;
    const arNyss = nyss === j.nyckel;
    const vidaText = j.ursprung === 'vanta_vida' ? 'Väntar på Vida' : j.ursprung === 'privat' ? 'Privat jobb' : null;
    const horTillNamn = j.horTillId ? (virkes.find((v) => v.id === j.horTillId)?.namn ?? 'Virkesobjekt') : null;
    const fakta: [string, string][] = [
      ['Typ', j.typ ? jobbTypLabel(j.typ) : 'Okänd typ'],
      ...(vidaText ? [['Vida', vidaText] as [string, string]] : []),
      ...(horTillNamn ? [['Hör till', horTillNamn] as [string, string]] : []),
      ...(j.markagare ? [['Markägare', j.markagare] as [string, string]] : []),
    ];
    return (
      <div className="sj-detalj-inre" data-testid="jobb-detalj">
        <div className="sj-bara-smal" style={{ marginBottom: AVSTAND.s }}>
          <button type="button" onClick={tillListan} style={KNAPP.lank}>‹ Starta jobb</button>
        </div>
        {meddelanden}
        <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0 ${AVSTAND.xl}px` }}>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{j.namn}</div>
          {arNyss && <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.s }}>{inknappningsText(j.forvantat)}</div>}
          <div data-testid="vo-nummer" style={{ ...TYP.tal, marginTop: AVSTAND.m }}>{j.vo}</div>
          <div data-testid="vo-lage" style={{ ...TYP.listtitel, marginTop: AVSTAND.m }}><LageUnder jobb={j} /></div>
          {varning && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m }}>{varning}</div>}
        </div>

        {f && <ForslagKort text={forslagText(f.jobb, f.vida)} orsak={f.orsak} upptagen={ihopBusy === f.jobbId} onJa={() => void slaIhop(f)} onNej={() => void avvisa(f)} />}

        <MaskinSektion forvantat={j.forvantat} maskiner={j.maskiner} idagAr={idagAr} />

        <Sektion rubrik="Jobbet" not={j.jobbId ? 'Inköpare, åtgärd och egenskaper fylls i via Redigering.' : 'Bara ett maskinobjekt — ingen planeringsrad finns.'}>
          {fakta.map(([k, v], i) => <Rad key={k} titel={k} hoger={v} sista={i === fakta.length - 1 && !kanHaEgenSkotning(j.typ)} />)}
          {kanHaEgenSkotning(j.typ) && (
            <Rad titel="Skotning" hoger={j.egenSkotning ? 'Egen skotning' : 'Vi skotar'} sista
              onTryck={arAdmin ? () => { setSkotningFel(''); setArk('skotning'); } : undefined}
              attr={{ 'data-testid': 'skotning-rad' }} />
          )}
        </Sektion>

        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          {j.jobbId && <a href={`/planering?objekt=${encodeURIComponent(j.jobbId)}`} data-testid="planera" style={{ ...KNAPP.sekundar, textDecoration: 'none', boxSizing: 'border-box' }}>Planera på kartan</a>}
          {arNyss && <button type="button" className="sj-bara-smal" data-testid="klar" onClick={tillListan} style={KNAPP.primar}>Klar</button>}
        </div>
      </div>
    );
  })() : (
    <div className="sj-detalj-inre" style={{ textAlign: 'center', padding: AVSTAND.xxl, color: FARG.text2 }}>
      <div style={TYP.text}>Välj ett jobb</div>
      <div style={{ ...TYP.meta, marginTop: AVSTAND.s }}>Där ser du om numret är inknappat och av vilken maskin.</div>
    </div>
  );

  // ── Ark: Nytt jobb ──
  const nyttJobbArk = ark === 'nytt' && (
    <Ark rubrik="Nytt jobb" onStang={() => setArk(null)}
      fot={
        <>
          {fel && <div role="alert" data-testid="fel" style={{ ...TYP.meta, color: FARG.rod }}>{fel}</div>}
          <div style={saving || !formularKlart ? INAKTIV : undefined}>
            <button type="button" data-testid="skapa" onClick={() => void skapa()} style={KNAPP.primar}>
              {saving ? 'Skapar …' : maskin?.roll ? 'Starta jobb' : 'Skapa jobb & få VO'}
            </button>
          </div>
          {!formularKlart && !saving && <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>{!namn.trim() ? 'Skriv ett namn' : 'Välj var jobbet är'}</div>}
        </>
      }>
      <Falt etikett="Namn" value={namn} onChange={setNamn} placeholder="t.ex. Husjönäs 3:1" name="namn"
        stod={namnForslag && !namn.trim()
          ? <button type="button" data-testid="namnforslag" onClick={() => setNamn(namnForslag)} style={{ ...KNAPP.tertiar, minHeight: 0 }}>Närmaste ort: <strong style={{ margin: `0 ${AVSTAND.xs}px`, color: FARG.text }}>{namnForslag}</strong> — använd</button>
          : undefined} />
      <FaltEtikett etikett="Typ"><TypVal valt={typ} onVal={(t) => { setTyp(t); if (t !== 'grot') setHorTill(null); }} /></FaltEtikett>
      <FaltEtikett etikett="Vida"><UrsprungVal valt={ursprung} onVal={setUrsprung} /></FaltEtikett>
      {kanHaEgenSkotning(typ) && (
        <FaltEtikett etikett="Skotning" stod={egenSkotning ? 'Markägaren skotar själv — numret knappas bara in i skördaren.' : undefined}>
          <SkotningVal egen={egenSkotning} onVal={setEgenSkotning} />
        </FaltEtikett>
      )}
      {typ === 'grot' && (
        <FaltEtikett etikett="Hör till objekt" stod="Då syns virkesobjektets traktgräns, ytor och skördarens spår på GROT-jobbet.">
          <HorTill alternativ={horTillAlternativ} valt={horTill} onVal={setHorTill} harPosition={!!position} />
        </FaltEtikett>
      )}
      <FaltEtikett etikett={maskin ? 'Maskin och position' : 'Position'}>
        {maskin && (
          <div data-testid="gps-status" style={{ ...TYP.meta, color: maskinGpsOk ? FARG.text : FARG.text2, marginBottom: AVSTAND.s }}>
            {maskin.namn}{maskin.roll ? ` · ${maskin.roll === 'skordare' ? 'skördare' : 'skotare'}` : ''} · {gps.status === 'soker' ? 'väntar på GPS …' : maskinGpsOk ? `maskinens position${gps.noggrannhetM != null ? ` (±${Math.round(gps.noggrannhetM)} m)` : ''}` : 'ingen GPS — peka på kartan'}
          </div>
        )}
        {!maskinGpsOk && (!maskin || gps.status === 'ingen') && (
          <PlatsVal plats={plats} platsText={platsText} onPlats={(p, t) => { setPlats(p); setPlatsText(t); }} onSok={sokPlats} onHar={harPlats} />
        )}
      </FaltEtikett>
    </Ark>
  );

  // ── Ark: Maskinobjekt utan VO ──
  const maskinobjektArk = ark === 'maskinobjekt' && (
    <Ark rubrik="Maskinobjekt utan VO" onStang={() => setArk(null)} stang="Klar">
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.m}px` }}>Maskindata som kommit in utan VO-nummer. Välj ett för att ge det ett P-nummer.</p>
      {dimUtanVo.length > SOK_FRAN && <input type="search" value={sokMaskin} onChange={(e) => setSokMaskin(e.target.value)} placeholder="Sök objekt eller ägare" aria-label="Sök maskinobjekt" style={{ ...falt, marginBottom: AVSTAND.m }} />}
      {maskinLista.length === 0 ? (
        <div style={{ ...TYP.meta, color: FARG.text2, padding: AVSTAND.l, textAlign: 'center' }}>{dimUtanVo.length === 0 ? 'Alla maskinobjekt har VO-nummer.' : 'Inget matchar sökningen.'}</div>
      ) : (
        <Sektion rubrik={`${maskinLista.length} maskinobjekt`} kort={false}>
          {maskinLista.map((o, i) => (
            <Rad key={o.objekt_id} titel={o.object_name ? o.object_name : <span style={{ color: FARG.orange }}>Namnlöst objekt</span>}
              under={[o.skogsagare || o.bolag || 'Okänd ägare', o.maskin_id ? maskinNamn.get(o.maskin_id) ?? o.maskin_id : null].filter(Boolean).join(' · ')}
              sista={i === maskinLista.length - 1} onTryck={() => { setFel(''); setArk({ bekrafta: o }); }} attr={{ 'data-testid': `maskinobjekt-${o.objekt_id}` }} />
          ))}
        </Sektion>
      )}
    </Ark>
  );

  // ── Ark: bekräfta VO till ett maskinobjekt (går inte att ångra) ──
  const bekrafta = ark && typeof ark === 'object' ? ark.bekrafta : null;
  const bekraftaArk = bekrafta && (
    <Ark rubrik="Maskinobjekt" onStang={() => setArk(dimUtanVo.length > 1 ? 'maskinobjekt' : null)}
      fot={
        <>
          {fel && <div role="alert" data-testid="fel" style={{ ...TYP.meta, color: FARG.rod }}>{fel}</div>}
          <div style={saving ? INAKTIV : undefined}>
            <button type="button" data-testid="ge-vo" onClick={() => void tilldelaMaskinObjekt(bekrafta)} style={KNAPP.primar}>{saving ? 'Ger VO-nummer …' : 'Ge VO-nummer'}</button>
          </div>
        </>
      }>
      <Sektion rubrik="Objektet" kort={false} not="Objektet får nästa P-nummer. Det går inte att ångra.">
        <Rad titel={bekrafta.object_name ? bekrafta.object_name : <span style={{ color: FARG.orange }}>Namnlöst objekt</span>}
          under={bekrafta.object_name ? ([bekrafta.skogsagare, bekrafta.bolag].filter(Boolean).join(' · ') || 'Okänd ägare') : 'Namn saknas i maskinfilen'} />
        {bekrafta.maskin_id && <Rad titel="Maskin" hoger={maskinNamn.get(bekrafta.maskin_id) ?? bekrafta.maskin_id} sista={!bekrafta.start_date} />}
        {bekrafta.start_date && <Rad titel="Första data" hoger={String(bekrafta.start_date).slice(0, 10)} sista />}
      </Sektion>
    </Ark>
  );

  // ── Ark: skotning på ett befintligt jobb (bara admin) — ett tryck på ett val sparar ──
  const skotningArk = ark === 'skotning' && valtJobb && (() => {
    const j = valtJobb;
    const val = (egen: boolean, titel: string, under: string, sista: boolean) => (
      <Rad titel={titel} under={under} hoger={j.egenSkotning === egen ? 'Vald' : undefined} pil={false} sista={sista}
        onTryck={() => void andraSkotning(j, egen)}
        attr={{ 'data-testid': egen ? 'skotning-egen' : 'skotning-vi', role: 'radio', 'aria-checked': String(j.egenSkotning === egen) }} />
    );
    return (
      <Ark rubrik="Skotning" onStang={() => setArk(null)}>
        <div style={skotningSparar ? INAKTIV : undefined}>
          <Sektion rubrik={j.namn} kort={false}
            not={j.dimIds.length ? 'Sparas på jobbet och på maskinobjekten, så Översikten och Redigering visar samma sak.' : 'Ingen maskin har skickat data än — valet följer med när den gör det.'}>
            {val(false, 'Vi skotar', 'Numret knappas in i skördaren och skotaren', false)}
            {val(true, 'Egen skotning', 'Markägaren skotar själv — inga filer från skotaren', true)}
          </Sektion>
        </div>
        {skotningSparar && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.m }}>Sparar …</div>}
        {skotningFel && <div role="alert" data-testid="skotning-fel" style={{ ...TYP.meta, color: FARG.rod, marginTop: AVSTAND.m }}>{skotningFel}</div>}
      </Ark>
    );
  })();

  return (
    // Typsnittet inline: FONT har citattecken och fungerar inte i en serverrenderad <style>.
    <div className={`sj-ram ${valtJobb ? 'sj-jobb-vy' : 'sj-lista-vy'}`} style={{ fontFamily: FONT, paddingBottom: medSafeBotten(0) }} data-starta-jobb="">
      <style>{designCss + KOLUMN_CSS + css}</style>
      <div className="sj-lista">{listan}</div>
      <div className="sj-detalj">{detaljen}</div>
      {nyttJobbArk}
      {maskinobjektArk}
      {bekraftaArk}
      {skotningArk}
    </div>
  );
}
