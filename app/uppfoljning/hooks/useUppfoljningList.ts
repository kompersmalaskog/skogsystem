'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { type UppfoljningObjekt } from '../lib/transform';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── URL-identifierare för ett objekt ─────────────────────────────────────
// Används av både listsidan (för router.push) och detaljsidan (för find).
// Prioritetsordning matchar React-keying på listraderna: läsbart vo_nummer
// först, sedan tekniska ID:n som fallback.
export function urlIdFor(obj: UppfoljningObjekt): string {
  return obj.vo_nummer || obj.skordareObjektId || obj.skotareObjektId || '';
}

// ── Helpers (lokala kopior — använda enbart inom list-bygget) ────────────
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 864e5));
}
function daysBetween(a: string, b: string): number {
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 864e5));
}
function getMachineType(maskin: any): 'skordare' | 'skotare' | 'unknown' {
  if (!maskin) return 'unknown';
  const cat = (maskin.maskin_typ || maskin.machineCategory || '').toLowerCase();
  if (cat.includes('skördare') || cat.includes('skordare') || cat.includes('harvester')) return 'skordare';
  if (cat.includes('skotare') || cat.includes('forwarder')) return 'skotare';
  return 'unknown';
}
function getMachineLabel(maskin: any): string {
  if (!maskin) return '';
  return [maskin.tillverkare, maskin.modell].filter(Boolean).join(' ');
}
function inferType(huvudtyp: string | undefined): 'slutavverkning' | 'gallring' {
  if (!huvudtyp) return 'slutavverkning';
  const t = huvudtyp.toLowerCase();
  if (t.includes('gallr')) return 'gallring';
  return 'slutavverkning';
}

export interface UseUppfoljningListResult {
  objekt: UppfoljningObjekt[];
  loading: boolean;
  error: Error | null;
}

export function useUppfoljningList(): UseUppfoljningListResult {
  const [objekt, setObjekt] = useState<UppfoljningObjekt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const [dimObjektRes, dimMaskinRes, objektTblRes] = await Promise.all([
          supabase.from('dim_objekt').select('*'),
          supabase.from('dim_maskin').select('*'),
          supabase.from('objekt').select('vo_nummer, markagare, areal, typ'),
        ]);

        const dimObjekt: any[] = dimObjektRes.data || [];
        const dimMaskin: any[] = dimMaskinRes.data || [];
        const objektTbl: any[] = objektTblRes.data || [];

        const allObjektIds = [...new Set(dimObjekt.map(d => d.objekt_id).filter(Boolean))] as string[];

        const fetchPaginated = async <T>(query: () => any): Promise<T[]> => {
          let all: T[] = [];
          let from = 0;
          const pageSize = 1000;
          while (true) {
            const { data } = await query().range(from, from + pageSize - 1);
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
          }
          return all;
        };

        const [produktion, lass, tid] = await Promise.all([
          allObjektIds.length > 0
            ? fetchPaginated<any>(() => supabase.from('fakt_produktion').select('objekt_id, maskin_id, volym_m3sub, stammar').in('objekt_id', allObjektIds))
            : Promise.resolve([] as any[]),
          allObjektIds.length > 0
            ? fetchPaginated<any>(() => supabase.from('fakt_lass').select('objekt_id, volym_m3sob').in('objekt_id', allObjektIds))
            : Promise.resolve([] as any[]),
          allObjektIds.length > 0
            ? fetchPaginated<any>(() => supabase.from('fakt_tid').select('objekt_id, maskin_id, bransle_liter, datum').in('objekt_id', allObjektIds))
            : Promise.resolve([] as any[]),
        ]);

        const maskinMap = new Map<string, any>();
        dimMaskin.forEach(m => maskinMap.set(m.maskin_id, m));

        const objektInfo = new Map<string, { agare: string; areal: number; typ: string }>();
        objektTbl.forEach(o => {
          if (o.vo_nummer) {
            objektInfo.set(o.vo_nummer, { agare: o.markagare || '', areal: o.areal || 0, typ: o.typ || '' });
          }
        });

        const prodAgg = new Map<string, { vol: number; stammar: number }>();
        produktion.forEach(p => {
          const key = p.objekt_id;
          const prev = prodAgg.get(key) || { vol: 0, stammar: 0 };
          prev.vol += (p.volym_m3sub || 0);
          prev.stammar += (p.stammar || 0);
          prodAgg.set(key, prev);
        });

        const prodMaskinMap = new Map<string, string>();
        produktion.forEach(p => {
          if (p.maskin_id && p.objekt_id && !prodMaskinMap.has(p.objekt_id)) {
            prodMaskinMap.set(p.objekt_id, p.maskin_id);
          }
        });

        const tidMaskinMap = new Map<string, string>();
        tid.forEach(t => {
          if (t.maskin_id && t.objekt_id && !tidMaskinMap.has(t.objekt_id)) {
            tidMaskinMap.set(t.objekt_id, t.maskin_id);
          }
        });

        const lassAgg = new Map<string, { vol: number; count: number }>();
        lass.forEach(l => {
          const key = l.objekt_id;
          const prev = lassAgg.get(key) || { vol: 0, count: 0 };
          prev.vol += (l.volym_m3sob || 0);
          prev.count += 1;
          lassAgg.set(key, prev);
        });

        const tidPerMaskin = new Map<string, number>();
        tid.forEach(t => {
          if (t.objekt_id && t.maskin_id) {
            const k = t.objekt_id + '::' + t.maskin_id;
            tidPerMaskin.set(k, (tidPerMaskin.get(k) || 0) + (t.bransle_liter || 0));
          }
        });

        const tidMaskinPerObjekt = new Map<string, Set<string>>();
        tid.forEach(t => {
          if (t.objekt_id && t.maskin_id) {
            const s = tidMaskinPerObjekt.get(t.objekt_id) || new Set<string>();
            s.add(t.maskin_id);
            tidMaskinPerObjekt.set(t.objekt_id, s);
          }
        });

        // Track last activity date per (objekt_id::maskin_id)
        const lastDatePerMaskin = new Map<string, string>();
        tid.forEach(t => {
          if (t.objekt_id && t.maskin_id && t.datum) {
            const k = t.objekt_id + '::' + t.maskin_id;
            const prev = lastDatePerMaskin.get(k);
            if (!prev || t.datum > prev) lastDatePerMaskin.set(k, t.datum);
          }
        });

        const voGroups = new Map<string, any[]>();
        dimObjekt.forEach(d => {
          if (!d.objekt_id) return;
          if (d.exkludera === true) return;
          const key = d.vo_nummer || d.objekt_id;
          const arr = voGroups.get(key) || [];
          arr.push(d);
          voGroups.set(key, arr);
        });

        const result: UppfoljningObjekt[] = [];

        voGroups.forEach((entries, key) => {
          const skordareEntries: any[] = [];
          const skotareEntries: any[] = [];
          const unknownEntries: any[] = [];
          const knownMaskinIds = new Set<string>();

          for (const e of entries) {
            if (e.maskin_id) knownMaskinIds.add(e.maskin_id);
            const maskin = maskinMap.get(e.maskin_id);
            const mType = getMachineType(maskin);
            if (mType === 'skordare') skordareEntries.push(e);
            else if (mType === 'skotare') skotareEntries.push(e);
            else unknownEntries.push(e);
          }

          const allObjIds = entries.map((e: any) => e.objekt_id);
          for (const oid of allObjIds) {
            const tidMaskiner = tidMaskinPerObjekt.get(oid);
            if (!tidMaskiner) continue;
            for (const mid of tidMaskiner) {
              if (knownMaskinIds.has(mid)) continue;
              knownMaskinIds.add(mid);
              const maskin = maskinMap.get(mid);
              const mType = getMachineType(maskin);
              const synthetic = { objekt_id: oid, maskin_id: mid, _synthetic: true };
              if (mType === 'skordare') skordareEntries.push(synthetic);
              else if (mType === 'skotare') skotareEntries.push(synthetic);
              else unknownEntries.push(synthetic);
            }
          }

          if (skordareEntries.length === 0 && skotareEntries.length === 0) {
            for (const e of unknownEntries) {
              if (prodAgg.has(e.objekt_id)) { skordareEntries.push(e); continue; }
              if (lassAgg.has(e.objekt_id)) { skotareEntries.push(e); continue; }
            }
          }
          if (skordareEntries.length === 0 && skotareEntries.length === 0 && entries.length > 0) {
            skordareEntries.push(entries[0]);
            if (entries.length > 1) skotareEntries.push(entries[1]);
          }

          const skordareEntry = skordareEntries[0] || null;
          const skotareEntry = skotareEntries[0] || null;

          const firstEntry = entries[0];
          const vo = firstEntry.vo_nummer || '';
          const namn = firstEntry.object_name || firstEntry.objektnamn || vo || key;
          const info = objektInfo.get(vo);

          const agare = firstEntry.skogsagare || firstEntry.bolag || info?.agare || '';
          const areal = info?.areal || 0;
          const typ = inferType(firstEntry.huvudtyp || info?.typ);

          let skVol = 0, skStammar = 0;
          const seenSkObjIds = new Set<string>();
          for (const e of skordareEntries) {
            if (seenSkObjIds.has(e.objekt_id)) continue;
            seenSkObjIds.add(e.objekt_id);
            const p = prodAgg.get(e.objekt_id);
            if (p) { skVol += p.vol; skStammar += p.stammar; }
          }

          let stVol = 0, stCount = 0;
          const seenStObjIds = new Set<string>();
          for (const e of skotareEntries) {
            if (seenStObjIds.has(e.objekt_id)) continue;
            seenStObjIds.add(e.objekt_id);
            const l = lassAgg.get(e.objekt_id);
            if (l) { stVol += l.vol; stCount += l.count; }
          }
          if (stCount === 0 && skotareEntry) {
            const seenFb = new Set<string>();
            for (const e of skordareEntries) {
              if (seenFb.has(e.objekt_id)) continue;
              seenFb.add(e.objekt_id);
              const l = lassAgg.get(e.objekt_id);
              if (l) { stVol += l.vol; stCount += l.count; }
            }
          }

          let skDiesel = 0, stDiesel = 0;
          for (const e of skordareEntries) {
            const k = e.objekt_id + '::' + e.maskin_id;
            skDiesel += tidPerMaskin.get(k) || 0;
          }
          for (const e of skotareEntries) {
            const k = e.objekt_id + '::' + e.maskin_id;
            stDiesel += tidPerMaskin.get(k) || 0;
          }

          const skStart = skordareEntry?.start_date || null;
          const skSlut = skordareEntry?.end_date || skordareEntry?.skordning_avslutad || null;
          const stStart = skotareEntry?.start_date || null;
          const stSlut = skotareEntry?.end_date || skotareEntry?.skotning_avslutad || null;

          const allDone = entries.every((e: any) => e.end_date || e.skordning_avslutad || e.skotning_avslutad);

          const earliestStart = [skStart, stStart].filter(Boolean).sort()[0] || null;
          const latestEnd = [skSlut, stSlut].filter(Boolean).sort().reverse()[0] || null;
          let dagar: number | null = null;
          if (earliestStart) {
            dagar = allDone && latestEnd ? daysBetween(earliestStart, latestEnd) : daysSince(earliestStart);
          }

          const skMaskinId = skordareEntry?.maskin_id || prodMaskinMap.get(skordareEntry?.objekt_id);
          const stMaskinId = skotareEntry?.maskin_id || tidMaskinMap.get(skotareEntry?.objekt_id);

          // Find last activity dates
          let skLastDate: string | null = null;
          for (const e of skordareEntries) {
            const d = lastDatePerMaskin.get(e.objekt_id + '::' + e.maskin_id);
            if (d && (!skLastDate || d > skLastDate)) skLastDate = d;
          }
          let stLastDate: string | null = null;
          for (const e of skotareEntries) {
            const d = lastDatePerMaskin.get(e.objekt_id + '::' + e.maskin_id);
            if (d && (!stLastDate || d > stLastDate)) stLastDate = d;
          }

          result.push({
            vo_nummer: vo,
            namn,
            typ,
            agare,
            areal,
            skordareModell: skordareEntry ? getMachineLabel(maskinMap.get(skMaskinId)) : null,
            skordareStart: skStart,
            skordareSlut: skSlut,
            skordareObjektId: skordareEntry?.objekt_id || null,
            skordareModellMaskinId: skMaskinId || null,
            volymSkordare: skVol,
            stammar: skStammar,
            skotareModell: skotareEntry ? getMachineLabel(maskinMap.get(stMaskinId)) : null,
            skotareStart: stStart,
            skotareSlut: stSlut,
            skotareObjektId: skotareEntry?.objekt_id || null,
            skotareModellMaskinId: stMaskinId || null,
            volymSkotare: stVol,
            antalLass: stCount,
            dieselTotal: skDiesel + stDiesel,
            dagar,
            status: allDone ? 'avslutat' : 'pagaende',
            egenSkotning: entries.some((e: any) => e.egen_skotning === true),
            grotSkotning: entries.some((e: any) => e.risskotning === true),
            externSkotning: entries.some((e: any) => {
              try { return e.ovrigt_info && JSON.parse(e.ovrigt_info).extern_skotning === true; } catch { return false; }
            }),
            externForetag: (() => {
              for (const e of entries) {
                try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_foretag || ''; } catch {}
              }
              return '';
            })(),
            externPrisTyp: (() => {
              for (const e of entries) {
                try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_pris_typ || 'm3'; } catch {}
              }
              return 'm3' as const;
            })(),
            externPris: (() => {
              for (const e of entries) {
                try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_pris || 0; } catch {}
              }
              return 0;
            })(),
            externAntal: (() => {
              for (const e of entries) {
                try { const p = e.ovrigt_info && JSON.parse(e.ovrigt_info); if (p?.extern_skotning) return p.extern_antal || 0; } catch {}
              }
              return 0;
            })(),
            skordareLastDate: skLastDate,
            skotareLastDate: stLastDate,
          });
        });

        result.sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));

        if (cancelled) return;
        setObjekt(result);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setObjekt([]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { objekt, loading, error };
}
