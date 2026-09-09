'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { buildUppfoljningData, buildEmptyData, type UppfoljningObjekt } from '../lib/transform';
import { byggAvvikelser } from '../lib/avvikelser';
import type { UppfoljningData } from '../UppfoljningVy';

export interface UseObjektUppfoljningResult {
  data: UppfoljningData | null;
  loading: boolean;
  error: Error | null;
}

export function useObjektUppfoljning(obj: UppfoljningObjekt): UseObjektUppfoljningResult {
  const [data, setData] = useState<UppfoljningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const skId = obj.skordareObjektId;
  const stId = obj.skotareObjektId;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // VO-grupp: delat VO → flera objekt_id. Hämta över HELA gruppen (samma
        // mängd som listan) så detalj==lista. Fallback till enskilt objekt.
        const skIds = (obj.skordareObjektIds?.length ? obj.skordareObjektIds : [skId].filter(Boolean)) as string[];
        const stIds = (obj.skotareObjektIds?.length ? obj.skotareObjektIds : [stId].filter(Boolean)) as string[];
        const ids = Array.from(new Set([...skIds, ...stIds]));

        if (ids.length === 0) {
          if (!cancelled) {
            setData(buildEmptyData(obj));
            setLoading(false);
          }
          return;
        }

        // PostgREST or()-lista: citerade objekt_id-värden (text-id, ev. med _).
        const idList = ids.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');

        const [tidRes, prodRes, sortRes, dimSortRes, dimTradslagRes, avbrottRes, lassRes, lassSortRes, dimOperatorRes, dimMaskinRes, manuellRes] = await Promise.all([
          supabase.from('fakt_tid').select('datum, objekt_id, maskin_id, operator_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, avbrott_sek, rast_sek, kort_stopp_sek, bransle_liter, engine_time_sek, tomgang_sek').in('objekt_id', ids),
          supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar, processtyp, tradslag_id, datum').in('objekt_id', ids),
          // 'antal' fanns inte — kolumnen heter 'stockar'. PostgREST svarar 400 på
          // okänd kolumn, så HELA sortiment-fetchen föll och blev tyst tom lista.
          // Antalet används inte här (transform läser sortiment_id + volym_m3sub),
          // därför tas det bort istället för att döpas om.
          supabase.from('fakt_sortiment').select('objekt_id, sortiment_id, volym_m3sub').in('objekt_id', ids),
          supabase.from('dim_sortiment').select('sortiment_id, namn'),
          supabase.from('dim_tradslag').select('tradslag_id, namn'),
          supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').in('objekt_id', ids),
          stIds.length ? supabase.from('fakt_lass').select('objekt_id, maskin_id, datum, volym_m3sub, korstracka_m').in('objekt_id', stIds) : Promise.resolve({ data: [] }),
          stIds.length ? supabase.from('fakt_lass_sortiment').select('objekt_id, sortiment_id, sortiment_namn, volym_m3sub').in('objekt_id', stIds) : Promise.resolve({ data: [] }),
          supabase.from('dim_operator').select('operator_id, operator_namn, operator_key'),
          supabase.from('dim_maskin').select('maskin_id, maskin_typ, visningsnamn, modell'),
          // Manuellt skotarlager per (objekt, maskin) — hela objektet (datum_fran
          // IS NULL). Rader som RÖR detta objekt (egna) eller som TILLSKRIVS det
          // (omlastning, avser_objekt_id). GROT-markörer (maskin_id NULL) skippas.
          supabase.from('skotare_objekt_manuell')
            .select('id, objekt_id, maskin_id, datum_fran, volym_m3, volym_egen_skotning, volym_omlastning, g15_timmar, ar_omlastning, avser_objekt_id')
            .is('datum_fran', null)
            .not('maskin_id', 'is', null)
            .or(`objekt_id.in.(${idList}),avser_objekt_id.in.(${idList})`),
        ]);

        // Sanity-guard: dessa fetchar är opaginerade (per objekt_id — typiskt < 500 rader).
        // Exakt 1 000 rader = PostgREST-taket träffat, data trunkerat.
        if ((tidRes.data?.length ?? 0)     === 1000) console.warn('[useObjektUppfoljning] 1000-rader: fakt_tid', ids)
        if ((prodRes.data?.length ?? 0)    === 1000) console.warn('[useObjektUppfoljning] 1000-rader: fakt_produktion', ids)
        if ((avbrottRes.data?.length ?? 0) === 1000) console.warn('[useObjektUppfoljning] 1000-rader: fakt_avbrott', ids)
        if ((lassRes.data?.length ?? 0)    === 1000) console.warn('[useObjektUppfoljning] 1000-rader: fakt_lass', stIds)

        // Ett fel får aldrig se ut som tom data. Varje `res.data || []` nedan gör
        // en misslyckad fetch till en tom lista — det var så det felstavade
        // 'antal' kunde ligga och tömma sortimentlistan utan att någon såg det.
        for (const [namn, res] of Object.entries({
          fakt_tid: tidRes, fakt_produktion: prodRes, fakt_sortiment: sortRes,
          dim_sortiment: dimSortRes, dim_tradslag: dimTradslagRes, fakt_avbrott: avbrottRes,
          fakt_lass: lassRes, fakt_lass_sortiment: lassSortRes,
          dim_operator: dimOperatorRes, dim_maskin: dimMaskinRes,
        })) {
          const e = (res as { error?: { message?: string } })?.error;
          if (e) console.error(`[useObjektUppfoljning] ${namn} misslyckades:`, e.message ?? e);
        }

        let avbrottRows: any[] = avbrottRes.data || [];

        // If objekt_id query missed avbrott for a machine, fetch by maskin_id as fallback
        const skMidFb = obj.skordareModellMaskinId;
        const stMidFb = obj.skotareModellMaskinId;
        const hasSkAvbrott = skMidFb ? avbrottRows.some((r: any) => r.maskin_id === skMidFb) : true;
        const hasStAvbrott = stMidFb ? avbrottRows.some((r: any) => r.maskin_id === stMidFb) : true;
        if (!hasSkAvbrott || !hasStAvbrott) {
          const fallbackQueries = [];
          if (!hasSkAvbrott && skMidFb) fallbackQueries.push(supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').eq('maskin_id', skMidFb).limit(2000));
          if (!hasStAvbrott && stMidFb) fallbackQueries.push(supabase.from('fakt_avbrott').select('objekt_id, maskin_id, typ, kategori_kod, langd_sek, datum').eq('maskin_id', stMidFb).limit(2000));
          const fallbackResults = await Promise.all(fallbackQueries);
          for (const res of fallbackResults) {
            if (res.data) avbrottRows = [...avbrottRows, ...res.data];
          }
        }

        // ── Våning 2-referens: maskinens eget 90-dagarsfönster ──
        // Per-objekt-kvoter ur fakt_tid; volymgrunden hämtas SEPARAT ur
        // fakt_produktion (skördare) resp. fakt_lass (skotare) och möts
        // per objekt_id i JS — fakt_tid joinas ALDRIG med produktionen.
        const refFran = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
        const refMaskiner = [skMidFb, stMidFb].filter(Boolean) as string[];
        const hamtaAllt = async (bygg: (a: number, b: number) => any): Promise<any[]> => {
          let alla: any[] = [];
          let from = 0;
          const sida = 1000;
          while (true) {
            const { data: rows } = await bygg(from, from + sida - 1);
            if (!rows || rows.length === 0) break;
            alla = alla.concat(rows);
            if (rows.length < sida) break;
            from += sida;
          }
          return alla;
        };
        // Tillskriven omlastning: manuella rader vars avser_objekt_id pekar på ett
        // av de visade objekten OCH ar_omlastning=true. Arbetet ligger fysiskt
        // under den RADENS objekt_id (t.ex. A130743_7) — hämta det objektets
        // lass + tid så transformen kan räkna maskinens volym/lass/G15.
        const manuellRows: any[] = manuellRes.data || [];
        const omlObjektIds = Array.from(new Set(
          manuellRows
            .filter((r: any) => r.ar_omlastning && r.avser_objekt_id && ids.includes(r.avser_objekt_id) && r.objekt_id)
            .map((r: any) => r.objekt_id as string)
        ));

        const [refTid, refProdVolym, refLassVolym, omlLassRes, omlTidRes] = await Promise.all([
          refMaskiner.length > 0
            ? hamtaAllt((a, b) => supabase.from('fakt_tid').select('objekt_id, maskin_id, processing_sek, terrain_sek, other_work_sek, maintenance_sek, disturbance_sek, avbrott_sek, bransle_liter').in('maskin_id', refMaskiner).gte('datum', refFran).order('id').range(a, b))
            : Promise.resolve([] as any[]),
          skMidFb
            ? hamtaAllt((a, b) => supabase.from('fakt_produktion').select('objekt_id, volym_m3sub').eq('maskin_id', skMidFb).gte('datum', refFran).order('id').range(a, b))
            : Promise.resolve([] as any[]),
          stMidFb
            ? hamtaAllt((a, b) => supabase.from('fakt_lass').select('objekt_id, volym_m3sub').eq('maskin_id', stMidFb).gte('datum', refFran).order('id').range(a, b))
            : Promise.resolve([] as any[]),
          omlObjektIds.length > 0
            ? supabase.from('fakt_lass').select('objekt_id, maskin_id, datum, volym_m3sub, korstracka_m').in('objekt_id', omlObjektIds)
            : Promise.resolve({ data: [] as any[] }),
          omlObjektIds.length > 0
            ? supabase.from('fakt_tid').select('objekt_id, maskin_id, datum, processing_sek, terrain_sek, other_work_sek, bransle_liter, kort_stopp_sek').in('objekt_id', omlObjektIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        if (cancelled) return;

        // FLERTRÄD — HPR-härlett ur detalj_stam.stam_bunt_nyckel (#460), aldrig MOM.
        //
        // Mätt population = FILER som skrivits av den flerträdsmedvetna importen.
        // Importen upsertar på (maskin_id, stam_key) med filnamn i payloaden, så
        // varje stam bär namnet på den fil som senast skrev den; en fil som har
        // minst en rad med skapad_tid ≥ 2026-08-23 (då MultiTreeProcessedStem
        // började läsas, #460) är skriven av den nya importen, och då är ALLA
        // stammar med det filnamnet mätta. Varken "skapad_tid ≥ datum" (upsert
        // rör inte skapad_tid på befintliga enträdsrader → Svinhult 11109652 hade
        // gett falska 100 %) eller "senaste filen" (Svinhult har två skördarserier,
        // R64101 + R64428, 8 850 + 12 936 stammar) duger som nämnare.
        // meta_importerade_filer.importerad_tid uppdateras inte av omimporten.
        // Inga sådana filer → "ej mätt", ALDRIG 0 %. Täljare och nämnare filtreras
        // på samma filer → konsistenta. Känd lucka (konservativ åt fel håll bara
        // om den inträffar): en omimporterad serie helt utan buntar och utan nya
        // rader syns inte och hamnar utanför nämnaren.
        // Grepp = distinkta (filnamn, maskin_id, nyckel): StemBunchKey börjar om
        // per fil (migration 20260823) och alla stammar i en bunt bär samma
        // filnamn efter upsert. Buntrader hämtas paginerade — PostgREST cappar
        // svaret på 1 000 rader oavsett .limit().
        let flertrad: any = null;
        if (skIds.length) {
          const FLERTRAD_SEDAN = '2026-08-23T00:00:00Z';
          let stammar = 0, matta = 0, buntStammar = 0, buntRaderLasta = 0;
          const greppNycklar = new Set<string>();
          for (const oid of skIds) {
            const totR = await supabase.from('detalj_stam').select('id', { count: 'exact', head: true }).eq('objekt_id', oid);
            stammar += totR.count ?? 0;
            // Distinkta filnamn med post-#460-rader — få filer per objekt, en rad per varv.
            const filer: string[] = [];
            let sista: string | null = null;
            for (let i = 0; i < 50; i++) {
              let q = supabase.from('detalj_stam').select('filnamn').eq('objekt_id', oid).gte('skapad_tid', FLERTRAD_SEDAN).not('filnamn', 'is', null).order('filnamn', { ascending: true }).limit(1);
              if (sista) q = q.gt('filnamn', sista);
              const { data } = await q;
              const f: string | undefined = data?.[0]?.filnamn;
              if (!f) break;
              filer.push(f);
              sista = f;
            }
            if (!filer.length) continue; // ej mätt för det här skördarobjektet
            const [iFilR, buntR] = await Promise.all([
              supabase.from('detalj_stam').select('id', { count: 'exact', head: true }).eq('objekt_id', oid).in('filnamn', filer),
              supabase.from('detalj_stam').select('id', { count: 'exact', head: true }).eq('objekt_id', oid).in('filnamn', filer).not('stam_bunt_nyckel', 'is', null),
            ]);
            matta += iFilR.count ?? 0;
            buntStammar += buntR.count ?? 0;
            for (let from = 0; from < 50000; from += 1000) {
              const { data } = await supabase
                .from('detalj_stam')
                .select('filnamn, maskin_id, stam_bunt_nyckel')
                .eq('objekt_id', oid).in('filnamn', filer).not('stam_bunt_nyckel', 'is', null)
                .order('stam_key', { ascending: true }).order('maskin_id', { ascending: true })
                .range(from, from + 999);
              const rader = data || [];
              rader.forEach((r: any) => greppNycklar.add(`${r.filnamn}|${r.maskin_id}|${r.stam_bunt_nyckel}`));
              buntRaderLasta += rader.length;
              if (rader.length < 1000) break;
            }
          }
          const grepp = greppNycklar.size;
          if (stammar > 0) {
            flertrad = {
              matt: matta > 0,
              andelPct: matta > 0 ? (100 * buntStammar) / matta : 0,
              stammarPerGrepp: grepp > 0 ? buntRaderLasta / grepp : 0,
              grepp, buntStammar, stammar,
            };
          }
        }

        const bas = buildUppfoljningData({
          obj,
          tidRows: tidRes.data || [],
          prodRows: prodRes.data || [],
          sortRows: sortRes.data || [],
          lassRows: lassRes.data || [],
          lassSortRows: lassSortRes.data || [],
          avbrottRows,
          dimSort: dimSortRes.data || [],
          dimTradslag: dimTradslagRes.data || [],
          dimOperators: dimOperatorRes.data || [],
          dimMaskin: dimMaskinRes.data || [],
          skotareManuellRows: manuellRows,
          omlLassRows: omlLassRes?.data || [],
          omlTidRows: omlTidRes?.data || [],
        });
        setData({
          ...bas,
          flertrad,
          avvikelser: byggAvvikelser({
            ...bas,
            refTid,
            refProdVolym,
            refLassVolym,
            skMaskinId: skMidFb || null,
            stMaskinId: stMidFb || null,
            egnaObjektId: ids,
          }),
        });
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setData(null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skId, stId]);

  return { data, loading, error };
}
