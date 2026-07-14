'use client';

// Ackord vs timpeng för ETT objekt — räknar via lib/ekonomi/acord.ts
// (samma motor som /ekonomi/per-objekt, ingen kopia).
//
// Ärliga tillstånd är bärande här:
//  - null-belopp betyder "kan inte räknas" och får ALDRIG renderas som 0 kr
//  - antagen medelstam flaggas explicit (medelstamAntagen)
//  - tom maskin_timpris (RLS-tomt = 200 utan error) → timpengSaknasOrsak

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { g15Sek } from '@/lib/g15';
import {
  type AcordPris, type MaskinTimpris, type AvstandConfig, type TraktBracket, type SortConfig,
  lookupAcordPris, traktTillagg, sortimentTillagg, skotAvstandKr,
  timpengForTidRows, brytpunktM3PerG15h, ANTAGEN_MEDELSTAM,
} from '@/lib/ekonomi/acord';
import type { UppfoljningObjekt } from '../lib/transform';

export type AcordDetalj = {
  belopp: number;
  effektivtPrisPerM3: number; // grundpris + kr/m³-tillägg (exkl. avstånds-kr)
  grundpris: number;
  klassMedelstam: number;
  medelstam: number;
  medelstamAntagen: boolean;
  traktKrPerM3: number;
  traktBracket: string;
  sortKrPerM3: number;
  sortGrupper: string[];
  avstandKr: number; // skotningsavståndstillägg i kr (bara skotare)
};

export type MaskinEkonomi = {
  maskinId: string;
  label: string;
  typ: 'skordare' | 'skotare';
  volym: number;
  g15h: number;
  m3PerG15h: number | null;
  timpris: number | null;
  timpeng: number | null;
  timmarUtanPris: number;
  timpengSaknasOrsak: string | null;
  acord: AcordDetalj | null;
  acordSaknasOrsak: string | null;
  skillnad: number | null; // ackord − timpeng, bara när båda finns
  brytpunkt: number | null; // m³/G15h där ackord = timpeng
  tackning: number | null; // andel av maskinens G15 i objektets datumspann som är kopplad hit
};

export type ObjektEkonomi = {
  status: 'laddar' | 'fel' | 'ingen_data' | 'ok';
  timpengLage: boolean;
  timpengLageOrsak: 'gallring' | 'override' | null;
  maskiner: MaskinEkonomi[];
  totalSkillnad: number | null;
};

const LADDAR: ObjektEkonomi = { status: 'laddar', timpengLage: false, timpengLageOrsak: null, maskiner: [], totalSkillnad: null };

export function useObjektEkonomi(obj: UppfoljningObjekt, enabled: boolean): ObjektEkonomi {
  const [state, setState] = useState<ObjektEkonomi>(LADDAR);

  const skId = obj.skordareObjektId;
  const stId = obj.skotareObjektId;
  const arGallring = obj.typ === 'gallring';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setState(LADDAR);
      const ids = [...new Set([skId, stId].filter(Boolean))] as string[];
      if (ids.length === 0) {
        if (!cancelled) setState({ ...LADDAR, status: 'ingen_data' });
        return;
      }

      try {
        const [tidRes, prodRes, lassRes, sortRes, sortGruppRes, dimMaskinRes, acordRes, avstandRes, sortTillaggRes, traktRes, timprisRes, flaggaRes] = await Promise.all([
          supabase.from('fakt_tid').select('datum, objekt_id, maskin_id, processing_sek, terrain_sek').in('objekt_id', ids),
          supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar').in('objekt_id', ids),
          stId ? supabase.from('fakt_lass').select('datum, objekt_id, maskin_id, volym_m3sub, korstracka_m').eq('objekt_id', stId) : Promise.resolve({ data: [], error: null }),
          skId ? supabase.from('fakt_sortiment').select('objekt_id, sortiment_id').eq('objekt_id', skId) : Promise.resolve({ data: [], error: null }),
          supabase.from('dim_sortiment_grupp').select('sortiment_id, grupp'),
          supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
          supabase.from('acord_priser').select('medelstam, pris_total, pris_skordare, pris_skotare, giltig_fran, giltig_till'),
          supabase.from('acord_skotningsavstand').select('grundavstand_m, kr_per_100m, giltig_fran, giltig_till').not('grundavstand_m', 'is', null),
          supabase.from('acord_sortiment_tillagg').select('grundantal, kr_per_extra_sortiment').is('giltig_till', null).not('grundantal', 'is', null).order('giltig_fran', { ascending: false }).limit(1),
          supabase.from('acord_traktstorlek').select('fran_m3fub, till_m3fub, tillagg_kr_per_m3fub').is('giltig_till', null).order('fran_m3fub'),
          supabase.from('maskin_timpris').select('maskin_id, maskin_namn, timpris, giltig_fran, giltig_till'),
          supabase.from('objekt_ekonomi').select('objekt_id, rakna_som_timpeng').in('objekt_id', ids),
        ]);

        const anyError = [tidRes, prodRes, lassRes, sortRes, sortGruppRes, dimMaskinRes, acordRes, avstandRes, sortTillaggRes, traktRes, timprisRes, flaggaRes]
          .find((r: any) => r.error);
        if (anyError) throw new Error((anyError as any).error.message || 'Query-fel');

        const tidRows: any[] = tidRes.data || [];
        const prodRows: any[] = prodRes.data || [];
        const lassRows: any[] = (lassRes as any).data || [];
        const sortRows: any[] = (sortRes as any).data || [];
        const acordList: AcordPris[] = acordRes.data || [];
        const avstandList: AvstandConfig[] = (avstandRes.data || []).filter((a: any) => a.grundavstand_m != null && a.kr_per_100m != null) as AvstandConfig[];
        const traktBrackets: TraktBracket[] = (traktRes.data || []) as TraktBracket[];
        const sortConf: SortConfig | null = (sortTillaggRes.data && sortTillaggRes.data[0])
          ? { grundantal: Number(sortTillaggRes.data[0].grundantal), kr_per_extra_sortiment: Number(sortTillaggRes.data[0].kr_per_extra_sortiment) }
          : null;
        const timprisList: MaskinTimpris[] = (timprisRes.data || []) as MaskinTimpris[];
        const timprisLasbart = timprisList.length > 0;

        // Maskintyper — behövs för delat objekt_id (skördare+skotare på samma id)
        const harvesterIds = new Set<string>();
        const forwarderIds = new Set<string>();
        const modellMap = new Map<string, string>();
        (dimMaskinRes.data || []).forEach((m: any) => {
          const typ = (m.maskin_typ || '').toLowerCase();
          if (typ === 'harvester' || typ === 'skördare') harvesterIds.add(m.maskin_id);
          else if (typ === 'forwarder' || typ === 'skotare') forwarderIds.add(m.maskin_id);
          if (m.modell) modellMap.set(m.maskin_id, m.modell);
        });

        const timpengOverride = (flaggaRes.data || []).some((f: any) => f.rakna_som_timpeng === true);

        // Sortimentgrupper (objektnivå, från skördardata)
        const gruppMap = new Map<string, string | null>();
        (sortGruppRes.data || []).forEach((g: any) => gruppMap.set(g.sortiment_id, g.grupp));
        const grupper = new Set<string>();
        sortRows.forEach((s: any) => { const g = gruppMap.get(s.sortiment_id); if (g) grupper.add(g); });
        const sortKrPerM3 = sortimentTillagg(grupper.size, sortConf);

        // Skördare: volym + stammar per harvester-maskin
        type Harv = { vol: number; stammar: number };
        const harv = new Map<string, Harv>();
        prodRows.forEach((r: any) => {
          if (r.objekt_id !== skId) return;
          if (!harvesterIds.has(r.maskin_id)) return;
          const h = harv.get(r.maskin_id) || { vol: 0, stammar: 0 };
          h.vol += Number(r.volym_m3sub) || 0;
          h.stammar += Number(r.stammar) || 0;
          harv.set(r.maskin_id, h);
        });

        // Skotare: volym + avståndstillägg per forwarder-maskin
        type Fwd = { vol: number; avstandKr: number };
        const fwd = new Map<string, Fwd>();
        lassRows.forEach((r: any) => {
          if (!forwarderIds.has(r.maskin_id)) return;
          const f = fwd.get(r.maskin_id) || { vol: 0, avstandKr: 0 };
          const vol = Number(r.volym_m3sub) || 0;
          f.vol += vol;
          f.avstandKr += skotAvstandKr(r.datum, r.korstracka_m || 0, vol, avstandList);
          fwd.set(r.maskin_id, f);
        });

        // Objektets medelstam + traktstorlek (från skördarens totaler)
        let totVol = 0, totStammar = 0;
        harv.forEach(h => { totVol += h.vol; totStammar += h.stammar; });
        const objektMedelstam = totStammar > 0 ? totVol / totStammar : null;
        const trakt = traktTillagg(totVol, traktBrackets);

        // Tid per maskin (objektkopplade rader, maskintypsfiltrerade vid delat id)
        const shared = !!(skId && stId && skId === stId);
        const tidPerMaskin = new Map<string, any[]>();
        tidRows.forEach((r: any) => {
          const isHarv = harvesterIds.has(r.maskin_id);
          const isFwd = forwarderIds.has(r.maskin_id);
          const horTillSk = r.objekt_id === skId && (!shared || !isFwd);
          const horTillSt = r.objekt_id === stId && (!shared || !isHarv);
          if (!horTillSk && !horTillSt) return;
          const arr = tidPerMaskin.get(r.maskin_id) || [];
          arr.push(r);
          tidPerMaskin.set(r.maskin_id, arr);
        });

        // Maskinuppsättning: allt som har volym eller objektkopplad tid
        const maskinIds = [...new Set([...harv.keys(), ...fwd.keys(), ...tidPerMaskin.keys()])];

        // Täckning: maskinens totala G15 inom objektets datumspann (per maskin)
        const spanPerMaskin = new Map<string, { min: string; max: string }>();
        tidPerMaskin.forEach((rows, mid) => {
          const datum = rows.map(r => r.datum).filter(Boolean).sort();
          if (datum.length) spanPerMaskin.set(mid, { min: datum[0], max: datum[datum.length - 1] });
        });
        let totaltPerMaskin = new Map<string, number>();
        if (spanPerMaskin.size > 0) {
          const allMin = [...spanPerMaskin.values()].map(s => s.min).sort()[0];
          const allMax = [...spanPerMaskin.values()].map(s => s.max).sort().reverse()[0];
          const { data: alltTid, error: alltErr } = await supabase
            .from('fakt_tid')
            .select('datum, maskin_id, processing_sek, terrain_sek')
            .in('maskin_id', [...spanPerMaskin.keys()])
            .gte('datum', allMin).lte('datum', allMax);
          if (!alltErr && alltTid) {
            alltTid.forEach((r: any) => {
              const span = spanPerMaskin.get(r.maskin_id);
              if (!span || r.datum < span.min || r.datum > span.max) return;
              totaltPerMaskin.set(r.maskin_id, (totaltPerMaskin.get(r.maskin_id) || 0) + g15Sek(r.processing_sek, r.terrain_sek));
            });
          }
        }

        const maskiner: MaskinEkonomi[] = maskinIds.map(mid => {
          const typ: 'skordare' | 'skotare' = forwarderIds.has(mid) ? 'skotare' : 'skordare';
          const rows = tidPerMaskin.get(mid) || [];
          const tid = timpengForTidRows(rows, timprisList);
          const g15h = tid.timmar;

          const h = harv.get(mid);
          const f = fwd.get(mid);
          const volym = typ === 'skordare' ? (h?.vol || 0) : (f?.vol || 0);

          // Ackord
          let acord: AcordDetalj | null = null;
          let acordSaknasOrsak: string | null = null;
          if (volym <= 0) {
            acordSaknasOrsak = typ === 'skordare'
              ? 'Ingen objektkopplad skördad volym'
              : 'Inga objektkopplade lass';
          } else if (acordList.length === 0) {
            acordSaknasOrsak = 'Ackordprislistan kunde inte läsas';
          } else {
            const medelstamAntagen = typ === 'skotare' ? objektMedelstam == null : false;
            const medelstam = typ === 'skordare'
              ? (h && h.stammar > 0 ? h.vol / h.stammar : null)
              : (objektMedelstam ?? ANTAGEN_MEDELSTAM);
            if (medelstam == null) {
              acordSaknasOrsak = 'Stammar saknas — medelstam kan inte räknas';
            } else {
              const pris = lookupAcordPris(medelstam, acordList);
              if (!pris) {
                acordSaknasOrsak = 'Ingen prisklass hittades';
              } else {
                const grundpris = typ === 'skordare' ? Number(pris.pris_skordare) : Number(pris.pris_skotare);
                const effektivt = grundpris + trakt.krPerM3 + sortKrPerM3;
                const avstandKr = typ === 'skotare' ? (f?.avstandKr || 0) : 0;
                acord = {
                  belopp: volym * effektivt + avstandKr,
                  effektivtPrisPerM3: effektivt,
                  grundpris,
                  klassMedelstam: Number(pris.medelstam),
                  medelstam,
                  medelstamAntagen,
                  traktKrPerM3: trakt.krPerM3,
                  traktBracket: trakt.bracket,
                  sortKrPerM3,
                  sortGrupper: [...grupper].sort(),
                  avstandKr,
                };
              }
            }
          }

          // Timpeng
          let timpengSaknasOrsak: string | null = null;
          if (g15h <= 0) timpengSaknasOrsak = 'Inga objektkopplade G15-timmar';
          else if (!timprisLasbart) timpengSaknasOrsak = 'Timpriser kunde inte läsas (behörighet eller tom prislista)';
          else if (tid.timpeng == null) timpengSaknasOrsak = 'Timpris saknas för maskinen';

          const timprisRad = timprisList.find(p => p.maskin_id === mid);
          const timpeng = timpengSaknasOrsak ? null : tid.timpeng;

          // Skillnad + brytpunkt — bara när båda sidor är riktiga
          const skillnad = acord != null && timpeng != null ? acord.belopp - timpeng : null;
          // Brytpunkt mot effektivt kr/m³ inkl. avstånd omräknat per m³ (skotare)
          const effInklAvstand = acord && volym > 0 ? acord.effektivtPrisPerM3 + acord.avstandKr / volym : null;
          const brytpunkt = timprisRad && effInklAvstand ? brytpunktM3PerG15h(timprisRad.timpris, effInklAvstand) : null;

          const totalt = totaltPerMaskin.get(mid);
          const objektG15 = rows.reduce((s, r) => s + g15Sek(r.processing_sek, r.terrain_sek), 0);
          const tackning = totalt && totalt > 0 ? Math.min(1, objektG15 / totalt) : null;

          return {
            maskinId: mid,
            label: modellMap.get(mid) || timprisRad?.maskin_namn || mid,
            typ,
            volym,
            g15h,
            m3PerG15h: g15h > 0 && volym > 0 ? volym / g15h : null,
            timpris: timprisRad?.timpris ?? null,
            timpeng,
            timmarUtanPris: tid.timmarUtanPris,
            timpengSaknasOrsak,
            acord,
            acordSaknasOrsak,
            skillnad,
            brytpunkt,
            tackning,
          };
        }).filter(m => m.volym > 0 || m.g15h > 0)
          .sort((a, b) => (a.typ === b.typ ? b.volym - a.volym : a.typ === 'skordare' ? -1 : 1));

        const medSkillnad = maskiner.filter(m => m.skillnad != null);
        const totalSkillnad = medSkillnad.length > 0 ? medSkillnad.reduce((s, m) => s + (m.skillnad || 0), 0) : null;

        if (cancelled) return;
        setState({
          status: maskiner.length === 0 ? 'ingen_data' : 'ok',
          timpengLage: arGallring || timpengOverride,
          timpengLageOrsak: arGallring ? 'gallring' : timpengOverride ? 'override' : null,
          maskiner,
          totalSkillnad,
        });
      } catch {
        if (!cancelled) setState({ ...LADDAR, status: 'fel' });
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skId, stId, arGallring, enabled]);

  return state;
}
