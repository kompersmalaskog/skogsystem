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
import { objektSkotat, resolveSkotareVolym, type SkotareManuellRad } from '@/lib/skotat';

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
  // Skotad total enligt DELADE regeln (lib/skotat.objektSkotat): lass + manuell
  // per-maskin (skotare_objekt_manuell) — inte bara lass. En filfri/manuell
  // skotare (t.ex. Elephant King på Åbogen) ingår här och i `maskiner`.
  skotatM3: number;
  // true när skotad volym kommer från manuell inmatning (per-maskin eller
  // objekt-nivå), inte mätta lass — styr "(manuell)"-märkningen i badgen.
  skotatManuell: boolean;
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

export function typAvMaskin(maskinTyp: string | null | undefined): 'skordare' | 'skotare' | null {
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
        const [dimRes, planRes, maskinRes, exkluderade, prodRows, lassRows, tidRows, manuellRes] = await Promise.all([
          supabase.from('dim_objekt').select('objekt_id, object_name, vo_nummer, maskin_id, bolag, inkopare, huvudtyp, atgard, start_date, exkludera'),
          supabase.from('objekt').select('id, namn, vo_nummer, status, dim_objekt_id'),
          supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
          hamtaExkluderadeObjektId(),
          hamtaAlla('fakt_produktion', 'objekt_id, volym_m3sub'),
          hamtaAlla('fakt_lass', 'objekt_id, maskin_id, volym_m3sub'),
          hamtaAlla('fakt_tid', 'objekt_id, maskin_id, datum'),
          // Manuell skotning per objekt (skotare_objekt_manuell, hela objektet:
          // datum_fran IS NULL). Per-maskin-rader OCH objekt-nivå (maskin_id NULL).
          supabase.from('skotare_objekt_manuell')
            .select('objekt_id, maskin_id, volym_egen_skotning, volym_omlastning, volym_m3, ar_omlastning')
            .is('datum_fran', null),
        ]);
        if (dimRes.error) throw new Error('Kunde inte läsa dim_objekt: ' + dimRes.error.message);
        if (planRes.error) throw new Error('Kunde inte läsa objekt: ' + planRes.error.message);
        if (maskinRes.error) throw new Error('Kunde inte läsa dim_maskin: ' + maskinRes.error.message);

        const maskinMap = new Map<string, { modell: string | null; typ: 'skordare' | 'skotare' | null }>();
        (maskinRes.data || []).forEach((m: any) => maskinMap.set(m.maskin_id, { modell: m.modell || null, typ: typAvMaskin(m.maskin_typ) }));

        // Aggregat per objekt_id
        const skordat = new Map<string, number>();
        prodRows.forEach((r: any) => { if (r.objekt_id) skordat.set(r.objekt_id, (skordat.get(r.objekt_id) || 0) + (r.volym_m3sub || 0)); });

        // Lass PER MASKIN per objekt (maskin_id NULL → sentinel, som lib/skotat).
        const lassPerMaskinPerObjekt = new Map<string, Map<string, number>>();
        lassRows.forEach((r: any) => {
          if (!r.objekt_id) return;
          const mm = lassPerMaskinPerObjekt.get(r.objekt_id) || new Map<string, number>();
          const mid = r.maskin_id || '__ingen__';
          mm.set(mid, (mm.get(mid) || 0) + (r.volym_m3sub || 0));
          lassPerMaskinPerObjekt.set(r.objekt_id, mm);
        });

        // Manuell skotning per objekt: per-maskin-rader + objekt-nivå (maskin_id NULL).
        const manPerMaskinPerObjekt = new Map<string, Map<string, SkotareManuellRad>>();
        const manObjektNiva = new Map<string, number>();
        (manuellRes.data || []).forEach((r: any) => {
          if (!r.objekt_id) return;
          if (r.maskin_id) {
            const mm = manPerMaskinPerObjekt.get(r.objekt_id) || new Map<string, SkotareManuellRad>();
            mm.set(r.maskin_id, r as SkotareManuellRad);
            manPerMaskinPerObjekt.set(r.objekt_id, mm);
          } else if (r.volym_m3 != null) {
            manObjektNiva.set(r.objekt_id, Number(r.volym_m3) || 0); // objekt-nivå-avslut, trumfar
          }
        });

        // Skotad total = DELADE regeln (lib/skotat.objektSkotat), IDENTISK med
        // uppföljning/översikt: lass + manuell per maskin, manuell trumfar lass,
        // omlastning räknas aldrig. Inkluderar filfri/manuell skotare.
        const skotat = new Map<string, number>();
        const skotatArManuell = new Map<string, boolean>();
        const objektMedManuell = new Set<string>([...manPerMaskinPerObjekt.keys(), ...manObjektNiva.keys()]);
        const allaSkotObjIds = new Set<string>([...lassPerMaskinPerObjekt.keys(), ...objektMedManuell]);
        allaSkotObjIds.forEach((oid) => {
          const lassPM = lassPerMaskinPerObjekt.get(oid) || new Map<string, number>();
          const manPM = manPerMaskinPerObjekt.get(oid) || new Map<string, SkotareManuellRad>();
          const objNiva = manObjektNiva.has(oid) ? (manObjektNiva.get(oid) as number) : null;
          skotat.set(oid, objektSkotat({ lassPerMaskin: lassPM, manuellRadPerMaskin: manPM, manuellObjektNiva: objNiva }).skotat);
          skotatArManuell.set(oid, objNiva != null || manPM.size > 0);
        });
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
          // Lyft in filfria/manuella skotare (skotare_objekt_manuell per-maskin,
          // ingen fil) så de syns i maskinlistan/badgen — bara de som faktiskt
          // skotade (egen > 0), aldrig rena omlastningsmaskiner.
          const manPMkort = manPerMaskinPerObjekt.get(d.objekt_id);
          if (manPMkort) {
            const lassPMkort = lassPerMaskinPerObjekt.get(d.objekt_id) || new Map<string, number>();
            manPMkort.forEach((rad, mid) => {
              if (resolveSkotareVolym(rad, lassPMkort.get(mid) || 0).egen > 0) maskinIdSet.add(mid);
            });
          }
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
            skotatManuell: skotatArManuell.get(d.objekt_id) || false,
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
