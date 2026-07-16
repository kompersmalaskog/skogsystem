'use client';

// Matchningsdata för redigeringsvyn: stämmer maskinernas objekt (dim_objekt)
// med de planerade (objekt-tabellen)?
//
// Koppling räknas i två steg:
//   1) objekt.dim_objekt_id === dim_objekt.objekt_id  (den riktiga FK:n —
//      väcks ur döden av matchningsvyn; 1/40 ifylld vid bygget)
//   2) legacy-fallback: exakt vo_nummer-likhet (icke-tom) — dagens implicita
//      koppling som vyerna länge förlitat sig på
//
// Korten berikas med volym/senaste aktivitet/maskintyp så man ser VAD ett
// objekt är utan att öppna det ("20250731" — skräp eller riktigt?).
// namn === null betyder ÄRLIGT NAMNLÖST (importen hittar inte på namn längre)
// — UI ska visa det som ett tillstånd med åtgärd, aldrig hitta på text.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaExkluderadeObjektId } from '@/lib/objekt/exkludera';

export type MaskinKallInfo = { id: string; modell: string | null; typ: 'skordare' | 'skotare' | null };

export type MaskinObjektKort = {
  objektId: string;
  namn: string | null; // null = namnlöst
  voNummer: string | null;
  maskinId: string | null;
  maskinModell: string | null;
  maskinTyp: 'skordare' | 'skotare' | null;
  // ALLA maskiner som skickat filer för objektet (fakt_tid + dim-raden) —
  // det är maskinen man vill identifiera i sheeten, inte bara volymen
  maskiner: MaskinKallInfo[];
  skordatM3: number;
  skotatM3: number;
  senasteAktivitet: string | null; // max datum i fakt_tid
  startDatum: string | null;
  saknadeFalt: string[]; // av: Bolag, Inköpare, Huvudtyp, Åtgärd
  kopplatTillId: string | null; // objekt.id (uuid) när matchad
};

export type PlaneratKort = {
  id: string;
  namn: string | null;
  voNummer: string | null;
  status: string | null;
  dimObjektId: string | null;
  harMaskindata: boolean;
};

export type MatchningData = {
  status: 'laddar' | 'fel' | 'ok';
  omatchadeMaskin: MaskinObjektKort[]; // maskinobjekt utan planering
  utanMaskindata: PlaneratKort[]; // planerade utan maskindata
  matchade: { maskin: MaskinObjektKort; planerat: PlaneratKort }[];
  // Ignorerade (exkludera=true) — ÅNGERBART: visas med volymer så riktiga
  // jobb (Lövhuggning 542 m³) går att skilja från skräp (Flytt) och plockas
  // tillbaka. Ignorera = "stör mig inte nu", inte "radera för alltid".
  ignorerade: MaskinObjektKort[];
  uppdatera: () => void;
};

async function hamtaAlla(tabell: string, kolumner: string): Promise<any[]> {
  const SIDA = 1000;
  let alla: any[] = [];
  let fran = 0;
  while (true) {
    const { data, error } = await supabase.from(tabell).select(kolumner).range(fran, fran + SIDA - 1);
    if (error) throw new Error(`Kunde inte läsa ${tabell}: ${error.message}`);
    const batch = data || [];
    alla = alla.concat(batch);
    if (batch.length < SIDA) break;
    fran += SIDA;
  }
  return alla;
}

function typAvMaskin(maskinTyp: string | null | undefined): 'skordare' | 'skotare' | null {
  const t = (maskinTyp || '').toLowerCase();
  if (t === 'harvester' || t.includes('skörd')) return 'skordare';
  if (t === 'forwarder' || t.includes('skot')) return 'skotare';
  return null;
}

export function useMatchning(): MatchningData {
  const [status, setStatus] = useState<'laddar' | 'fel' | 'ok'>('laddar');
  const [omatchadeMaskin, setOmatchadeMaskin] = useState<MaskinObjektKort[]>([]);
  const [utanMaskindata, setUtanMaskindata] = useState<PlaneratKort[]>([]);
  const [matchade, setMatchade] = useState<{ maskin: MaskinObjektKort; planerat: PlaneratKort }[]>([]);
  const [ignorerade, setIgnorerade] = useState<MaskinObjektKort[]>([]);
  const [version, setVersion] = useState(0);

  const uppdatera = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('laddar');
      try {
        const [dimRes, planRes, maskinRes, exkluderade, prodRows, lassRows, tidRows] = await Promise.all([
          supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, maskin_id, bolag, inkopare, huvudtyp, atgard, start_date, exkludera'),
          supabase.from('objekt').select('id, namn, vo_nummer, status, dim_objekt_id'),
          supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
          hamtaExkluderadeObjektId(),
          hamtaAlla('fakt_produktion', 'objekt_id, volym_m3sub'),
          hamtaAlla('fakt_lass', 'objekt_id, volym_m3sub'),
          hamtaAlla('fakt_tid', 'objekt_id, maskin_id, datum'),
        ]);
        if (dimRes.error) throw new Error('Kunde inte läsa dim_objekt: ' + dimRes.error.message);
        if (planRes.error) throw new Error('Kunde inte läsa objekt: ' + planRes.error.message);
        if (maskinRes.error) throw new Error('Kunde inte läsa dim_maskin: ' + maskinRes.error.message);

        const maskinMap = new Map<string, { modell: string | null; typ: 'skordare' | 'skotare' | null }>();
        (maskinRes.data || []).forEach((m: any) => maskinMap.set(m.maskin_id, { modell: m.modell || null, typ: typAvMaskin(m.maskin_typ) }));

        // Aggregat per objekt_id
        const skordat = new Map<string, number>();
        prodRows.forEach((r: any) => { if (r.objekt_id) skordat.set(r.objekt_id, (skordat.get(r.objekt_id) || 0) + (r.volym_m3sub || 0)); });
        const skotat = new Map<string, number>();
        lassRows.forEach((r: any) => { if (r.objekt_id) skotat.set(r.objekt_id, (skotat.get(r.objekt_id) || 0) + (r.volym_m3sub || 0)); });
        const senaste = new Map<string, string>();
        const tidMaskin = new Map<string, string>();
        const maskinerPerObjekt = new Map<string, Set<string>>();
        tidRows.forEach((r: any) => {
          if (!r.objekt_id || !r.datum) return;
          const prev = senaste.get(r.objekt_id);
          if (!prev || r.datum > prev) senaste.set(r.objekt_id, r.datum);
          if (r.maskin_id) {
            if (!tidMaskin.has(r.objekt_id)) tidMaskin.set(r.objekt_id, r.maskin_id);
            const set = maskinerPerObjekt.get(r.objekt_id) || new Set<string>();
            set.add(r.maskin_id);
            maskinerPerObjekt.set(r.objekt_id, set);
          }
        });

        // Planerade objekt, indexerade för koppling
        const planerade: PlaneratKort[] = (planRes.data || []).map((o: any) => ({
          id: o.id, namn: o.namn || null, voNummer: o.vo_nummer || null,
          status: o.status || null, dimObjektId: o.dim_objekt_id || null,
          harMaskindata: false,
        }));
        const planPerDimId = new Map<string, PlaneratKort>();
        const planPerVo = new Map<string, PlaneratKort>();
        planerade.forEach(p => {
          if (p.dimObjektId) planPerDimId.set(p.dimObjektId, p);
          if (p.voNummer) planPerVo.set(p.voNummer, p);
        });

        const omatchade: MaskinObjektKort[] = [];
        const par: { maskin: MaskinObjektKort; planerat: PlaneratKort }[] = [];

        const ignoreradeKort: MaskinObjektKort[] = [];
        (dimRes.data || []).forEach((d: any) => {
          const arIgnorerad = exkluderade.has(d.objekt_id);
          const maskinId = d.maskin_id || tidMaskin.get(d.objekt_id) || null;
          const maskin = maskinId ? maskinMap.get(maskinId) : undefined;
          const saknade: string[] = [];
          if (!d.bolag) saknade.push('Bolag');
          if (!d.inkopare) saknade.push('Inköpare');
          if (!d.huvudtyp) saknade.push('Huvudtyp');
          if (!d.atgard) saknade.push('Åtgärd');

          // FK primärt, exakt vo-likhet som legacy-fallback
          const planerat = planPerDimId.get(d.objekt_id)
            || (d.vo_nummer ? planPerVo.get(d.vo_nummer) : undefined)
            || null;

          const maskinIdSet = new Set<string>(maskinerPerObjekt.get(d.objekt_id) || []);
          if (d.maskin_id) maskinIdSet.add(d.maskin_id);
          const maskinLista: MaskinKallInfo[] = Array.from(maskinIdSet).map(id => ({
            id,
            modell: maskinMap.get(id)?.modell || null,
            typ: maskinMap.get(id)?.typ || null,
          }));

          const kort: MaskinObjektKort = {
            objektId: d.objekt_id,
            namn: d.object_name || null,
            voNummer: d.vo_nummer || null,
            maskinId,
            maskinModell: maskin?.modell || null,
            maskinTyp: maskin?.typ || null,
            maskiner: maskinLista,
            skordatM3: Math.round(skordat.get(d.objekt_id) || 0),
            skotatM3: Math.round(skotat.get(d.objekt_id) || 0),
            senasteAktivitet: senaste.get(d.objekt_id) || null,
            startDatum: d.start_date ? String(d.start_date).slice(0, 10) : null,
            saknadeFalt: saknade,
            kopplatTillId: planerat?.id || null,
          };
          if (arIgnorerad) {
            ignoreradeKort.push(kort); // egen hink — aldrig i matchningen
          } else if (planerat) {
            planerat.harMaskindata = true;
            par.push({ maskin: kort, planerat });
          } else {
            omatchade.push(kort);
          }
        });

        if (cancelled) return;
        // Mest angelägna först: aktivitet nyligen > volym > namnlösa sist i övrigt
        omatchade.sort((a, b) => (b.senasteAktivitet || '').localeCompare(a.senasteAktivitet || ''));
        setOmatchadeMaskin(omatchade);
        setUtanMaskindata(planerade.filter(p => !p.harMaskindata));
        setMatchade(par);
        // Störst volym först — riktiga jobb syns direkt, skräpet sist
        setIgnorerade(ignoreradeKort.sort((a, b) => (b.skordatM3 + b.skotatM3) - (a.skordatM3 + a.skotatM3)));
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('fel');
      }
    })();

    return () => { cancelled = true; };
  }, [version]);

  return { status, omatchadeMaskin, utanMaskindata, matchade, ignorerade, uppdatera };
}
