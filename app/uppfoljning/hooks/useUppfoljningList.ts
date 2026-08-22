'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { hamtaExkluderadeObjektId } from '@/lib/objekt/exkludera';
import { harledTyp } from '@/lib/objekt/typ';
import { type UppfoljningObjekt } from '../lib/transform';
import { objektSkotat, type SkotareManuellRad } from '@/lib/skotat';

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
// Paginerad hämtning (PostgREST-taket är 1000 rader) — fakt_lass är rå och kan överstiga det.
async function hamtaAlla<T>(bygg: () => any): Promise<T[]> {
  const PAGE = 1000; const out: T[] = []; let from = 0;
  while (true) {
    const { data, error } = await bygg().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data as T[]) || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
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
        // Volym SUMMERAS I DB via aggregat-vyer (en rad per objekt_id) — INTE
        // genom att hämta 8000+ råa fakt-rader och summera i klienten. Den råa
        // vägen trunkerades tyst vid PostgREST 1000-radstaket och gav dessutom
        // icke-deterministiska summor när importen skrev under paginering.
        // prod-vyns maskiner = skördare (producerar), lass-vyns = skotare.
        const [dimObjektRes, dimMaskinRes, objektTblRes, prodRes, lassRes, kopplingRes, exkluderade, skotareManuellRes, faktLassRows] = await Promise.all([
          supabase.from('dim_objekt').select('*'),
          supabase.from('dim_maskin').select('*'),
          supabase.from('objekt').select('vo_nummer, markagare, areal, typ'),
          supabase.from('vy_uppf_prod_per_objekt').select('objekt_id, volym_m3sub, stammar, sista_datum, maskin_ids'),
          supabase.from('vy_uppf_lass_per_objekt').select('objekt_id, volym_m3sub, antal_lass, sista_datum, maskin_ids'),
          supabase.from('grot_koppling').select('risjobb_objekt_id, avverknings_objekt_id'),
          hamtaExkluderadeObjektId(),
          // ALLA manuell-rader (inte bara maskin_id NULL): maskin_id SATT = utförd skotning per maskin.
          // Nya fält (volym_egen_skotning/volym_omlastning) driver EN-regeln (lib/skotat); volym_m3 = läs-fallback.
          supabase.from('skotare_objekt_manuell').select('objekt_id, maskin_id, volym_m3, g15_timmar, volym_egen_skotning, volym_omlastning, ar_omlastning'),
          // Per-maskin lass (rå, paginerad) — för den delade skotat-regeln (lib/skotat).
          hamtaAlla<{ objekt_id: string; maskin_id: string | null; volym_m3sub: number | null }>(() => supabase.from('fakt_lass').select('objekt_id, maskin_id, volym_m3sub').order('objekt_id')),
        ]);

        // Ett fel på någon källa får ALDRIG se ut som tom lista.
        const forstaFel = dimObjektRes.error || dimMaskinRes.error || objektTblRes.error || prodRes.error || lassRes.error || kopplingRes.error || skotareManuellRes.error;
        if (forstaFel) throw forstaFel;

        const dimObjekt: any[] = dimObjektRes.data || [];
        const dimMaskin: any[] = dimMaskinRes.data || [];
        const objektTbl: any[] = objektTblRes.data || [];
        const prodView: any[] = prodRes.data || [];
        const lassView: any[] = lassRes.data || [];
        const kopplingar: any[] = kopplingRes.data || [];

        const maskinMap = new Map<string, any>();
        dimMaskin.forEach(m => maskinMap.set(m.maskin_id, m));
        const skotareManuellMap = new Map<string, { volym_m3: number | null; g15_timmar: number | null }>();
        // Per (objekt, maskin) → RÅ rad. EN-regeln (lib/skotat) delar upp i egen/omlastning.
        const manPerMaskinById = new Map<string, Map<string, SkotareManuellRad>>();
        for (const r of (skotareManuellRes.data || [])) {
          if (r.maskin_id == null) {
            skotareManuellMap.set(r.objekt_id, { volym_m3: r.volym_m3, g15_timmar: r.g15_timmar });   // objekt-nivå → trumfar allt
          } else {
            if (!manPerMaskinById.has(r.objekt_id)) manPerMaskinById.set(r.objekt_id, new Map());
            manPerMaskinById.get(r.objekt_id)!.set(r.maskin_id, r as SkotareManuellRad);   // utförd skotning per maskin (rå rad)
          }
        }
        // Per-maskin lass (fakt_lass) för den delade skotat-regeln (lib/skotat): manuell per maskin trumfar
        // DEN maskinens lass. Lass utan maskin_id under sentinel (bevaras, kan aldrig trumfas).
        const lassPerMaskinById = new Map<string, Map<string, number>>();
        for (const r of faktLassRows) {
          if (!r.objekt_id) continue;
          const mid = r.maskin_id || '__ingen__';
          if (!lassPerMaskinById.has(r.objekt_id)) lassPerMaskinById.set(r.objekt_id, new Map());
          const mm = lassPerMaskinById.get(r.objekt_id)!;
          mm.set(mid, (mm.get(mid) || 0) + (Number(r.volym_m3sub) || 0));
        }

        const objektInfo = new Map<string, { agare: string; areal: number; typ: string }>();
        objektTbl.forEach(o => {
          if (o.vo_nummer) {
            objektInfo.set(o.vo_nummer, { agare: o.markagare || '', areal: o.areal || 0, typ: o.typ || '' });
          }
        });

        // ── Prod-aggregat (skördare) per objekt_id, ur vyn ──
        const prodAgg = new Map<string, { vol: number; stammar: number }>();
        const prodMaxDatum = new Map<string, string>();
        const prodMaskinMap = new Map<string, string>();
        const prodMaskiner = new Map<string, string[]>();
        prodView.forEach(p => {
          if (!p.objekt_id) return;
          prodAgg.set(p.objekt_id, { vol: Number(p.volym_m3sub) || 0, stammar: Number(p.stammar) || 0 });
          if (p.sista_datum) prodMaxDatum.set(p.objekt_id, p.sista_datum);
          const mids = (p.maskin_ids || []).filter(Boolean) as string[];
          if (mids[0]) prodMaskinMap.set(p.objekt_id, mids[0]);
          prodMaskiner.set(p.objekt_id, mids);
        });

        // ── Lass-aggregat (skotare) per objekt_id, ur vyn ──
        const lassAgg = new Map<string, { vol: number; count: number }>();
        const lassMaxDatum = new Map<string, string>();
        const lassMaskinMap = new Map<string, string>();
        const lassMaskiner = new Map<string, string[]>();
        lassView.forEach(l => {
          if (!l.objekt_id) return;
          lassAgg.set(l.objekt_id, { vol: Number(l.volym_m3sub) || 0, count: Number(l.antal_lass) || 0 });
          if (l.sista_datum) lassMaxDatum.set(l.objekt_id, l.sista_datum);
          const mids = (l.maskin_ids || []).filter(Boolean) as string[];
          if (mids[0]) lassMaskinMap.set(l.objekt_id, mids[0]);
          lassMaskiner.set(l.objekt_id, mids);
        });

        // F3: ett avverkningsobjekt har "risskotning pågår" när det är kopplat
        // till ett risjobb vars skotning ännu inte är avslutad.
        const risjobbKlart = new Map<string, boolean>();
        dimObjekt.forEach(d => {
          if (d.objekt_id) risjobbKlart.set(d.objekt_id, d.skotning_avslutad != null);
        });
        const harPagaendeRis = new Set<string>();
        kopplingar.forEach(k => {
          if (!k.avverknings_objekt_id || !k.risjobb_objekt_id) return;
          if (risjobbKlart.get(k.risjobb_objekt_id) === false) harPagaendeRis.add(k.avverknings_objekt_id);
        });

        const voGroups = new Map<string, any[]>();
        dimObjekt.forEach(d => {
          if (!d.objekt_id) return;
          if (exkluderade.has(d.objekt_id)) return; // central exkludera-regel
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

          // Maskiner som PRODUCERAT/SKOTAT på objektet men inte sitter på en
          // dim_objekt-rad (delade objekt): prod-vyns maskiner är skördare,
          // lass-vyns är skotare. Härleds ur vyerna, inte ur råa fakt_tid.
          const allObjIds = entries.map((e: any) => e.objekt_id);
          for (const oid of allObjIds) {
            for (const mid of (prodMaskiner.get(oid) || [])) {
              if (knownMaskinIds.has(mid)) continue;
              knownMaskinIds.add(mid);
              skordareEntries.push({ objekt_id: oid, maskin_id: mid, _synthetic: true });
            }
            for (const mid of (lassMaskiner.get(oid) || [])) {
              if (knownMaskinIds.has(mid)) continue;
              knownMaskinIds.add(mid);
              skotareEntries.push({ objekt_id: oid, maskin_id: mid, _synthetic: true });
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
          // Typen härleds ur risskotning-flaggan + huvudtyp — aldrig gissad.
          const risFlagga = entries.some((e: any) => e.risskotning === true);
          const typ = harledTyp(risFlagga, firstEntry.huvudtyp || info?.typ);

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
          // Manuellt angiven skotad volym (skotare_objekt_manuell.volym_m3, maskin_id IS NULL)
          // TRUMFAR lass-summan — skotaren registrerar inte alltid lass, och en
          // mänsklig rapport vinner över ofullständig lassdata. Gäller så snart
          // fältet är SATT (även = 0: "0 skotat, bekräftat" vinner över lass).
          // Källan följer med till UI:t så det alltid syns att den är manuell.
          const manuellRader = entries
            .map((e: any) => skotareManuellMap.get(e.objekt_id)?.volym_m3)
            .filter((v: any) => v != null)
            .map((v: any) => Number(v) || 0);
          const skotatArManuell = manuellRader.length > 0;
          const manuellVolym = skotatArManuell ? Math.max(0, ...manuellRader) : 0;
          // Manuella G15-timmar för icke-filsändande skotare (JD810E) —
          // skotare_objekt_manuell.g15_timmar, ingen fakt_tid finns. Max över
          // gruppen (skrivs likadant över syskonraderna som volymen).
          const g15ManuellRader = entries
            .map((e: any) => skotareManuellMap.get(e.objekt_id)?.g15_timmar)
            .filter((v: any) => v != null)
            .map((v: any) => Number(v) || 0);
          const skotarG15Manuell = g15ManuellRader.length > 0 ? Math.max(0, ...g15ManuellRader) : 0;

          if (stCount === 0 && skotareEntry) {
            const seenFb = new Set<string>();
            for (const e of skordareEntries) {
              if (seenFb.has(e.objekt_id)) continue;
              seenFb.add(e.objekt_id);
              const l = lassAgg.get(e.objekt_id);
              if (l) { stVol += l.vol; stCount += l.count; }
            }
          }

          // Skotad volym enligt den DELADE regeln (lib/skotat): objekt-nivå-manuell trumfar allt; annars
          // per maskin — manuell för maskin X (utförd skotning, t.ex. filfri JD810E) trumfar maskin X:s
          // lass, aldrig dubbelräkna samma maskin. Ersätter "objekt-nivå-manuell ELLER lass-total".
          const aggLassPM = new Map<string, number>();
          const seenLassObj = new Set<string>();
          const laggLass = (oid: string) => { if (seenLassObj.has(oid)) return; seenLassObj.add(oid); const mm = lassPerMaskinById.get(oid); if (mm) for (const [mid, v] of mm) aggLassPM.set(mid, (aggLassPM.get(mid) || 0) + v); };
          for (const e of skotareEntries) laggLass(e.objekt_id);
          if (aggLassPM.size === 0) for (const e of skordareEntries) laggLass(e.objekt_id);
          const aggManPM = new Map<string, SkotareManuellRad>();
          for (const e of entries) { const mm = manPerMaskinById.get(e.objekt_id); if (mm) for (const [mid, rad] of mm) aggManPM.set(mid, rad); }
          const volymSkotareEff = objektSkotat({ lassPerMaskin: aggLassPM, manuellRadPerMaskin: aggManPM, manuellObjektNiva: skotatArManuell ? manuellVolym : null }).skotat;

          const skStart = skordareEntry?.start_date || null;
          const skSlut = skordareEntry?.end_date || skordareEntry?.skordning_avslutad || null;
          const stStart = skotareEntry?.start_date || null;
          const stSlut = skotareEntry?.end_date || skotareEntry?.skotning_avslutad || null;

          // Skördning klar ≠ avslutat. Ett objekt är AVSLUTAT först när
          // SKOTNINGEN är markerad klar (skotning_avslutad). Ett skördning-
          // klart men oskotat objekt är pågående — annars sväljs oskotat-
          // våningen och objekten hamnar felaktigt bland avslutade.
          const skordningKlar = entries.some((e: any) => e.skordning_avslutad != null || e.end_date != null);
          const skotningKlar = entries.some((e: any) => e.skotning_avslutad != null);
          const allDone = skotningKlar;

          const earliestStart = [skStart, stStart].filter(Boolean).sort()[0] || null;
          const latestEnd = [skSlut, stSlut].filter(Boolean).sort().reverse()[0] || null;
          let dagar: number | null = null;
          if (earliestStart) {
            dagar = allDone && latestEnd ? daysBetween(earliestStart, latestEnd) : daysSince(earliestStart);
          }

          const skMaskinId = skordareEntry?.maskin_id || prodMaskinMap.get(skordareEntry?.objekt_id);
          const stMaskinId = skotareEntry?.maskin_id || lassMaskinMap.get(skotareEntry?.objekt_id);

          // Sista avverkningsdag = MAX över skördarens objekt_id ur prod-vyn.
          let sistaAvverkning: string | null = null;
          for (const e of skordareEntries) {
            const d = prodMaxDatum.get(e.objekt_id);
            if (d && (!sistaAvverkning || d > sistaAvverkning)) sistaAvverkning = d;
          }

          // SKOTARGRUPPERING — BARA maskinnamn, aldrig förarnamn, och ALDRIG
          // dim_objekt.maskin_id (den är SKÖRDAREN).
          //  1. Lassdata (vy_uppf_lass_per_objekt) = hård data, vinner alltid.
          //  2. dim_objekt.tilldelad_skotare = Martins planering, grupperar
          //     objektet redan innan första lasset.
          //  3. Annars null → "Ej tilldelad". Gissa aldrig.
          let lassMaskinId: string | null = null;
          for (const e of skotareEntries) {
            const mid = lassMaskinMap.get(e.objekt_id);
            if (mid) { lassMaskinId = mid; break; }
          }
          const tilldeladId = entries.map((e: any) => e.tilldelad_skotare).find(Boolean) || null;
          const namnFranLass = lassMaskinId ? getMachineLabel(maskinMap.get(lassMaskinId)) : '';
          const namnFranTilldelning = tilldeladId ? getMachineLabel(maskinMap.get(tilldeladId)) : '';
          const skotareKalla: 'lass' | 'tilldelad' | null =
            namnFranLass ? 'lass' : namnFranTilldelning ? 'tilldelad' : null;
          // Lassdatan vinner vid konflikt — men avvikelsen tigs inte ihjäl.
          const skotareAvvikelse = (lassMaskinId && tilldeladId && lassMaskinId !== tilldeladId && namnFranLass && namnFranTilldelning)
            ? { lass: namnFranLass, tilldelad: namnFranTilldelning }
            : null;

          // Senaste aktivitet: skördaren ur prod-vyns sista_datum, skotaren ur
          // lass-vyns — produktion/lass ÄR maskinens aktivitet.
          let skLastDate: string | null = null;
          for (const e of skordareEntries) {
            const d = prodMaxDatum.get(e.objekt_id);
            if (d && (!skLastDate || d > skLastDate)) skLastDate = d;
          }
          let stLastDate: string | null = null;
          for (const e of skotareEntries) {
            const d = lassMaxDatum.get(e.objekt_id);
            if (d && (!stLastDate || d > stLastDate)) stLastDate = d;
          }

          // Alla objekt_id i VO-gruppen, per roll — så detaljvyn räknar/hämtar över
          // HELA gruppen (delat VO → flera skotare) och blir identisk med listan.
          const skordareObjektIds = Array.from(new Set(skordareEntries.map((e: any) => e.objekt_id).filter(Boolean))) as string[];
          const skotareObjektIds = Array.from(new Set(skotareEntries.map((e: any) => e.objekt_id).filter(Boolean))) as string[];

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
            skordareObjektIds,
            skordareModellMaskinId: skMaskinId || null,
            volymSkordare: skVol,
            stammar: skStammar,
            skotareModell: skotareEntry ? getMachineLabel(maskinMap.get(stMaskinId)) : null,
            skotareStart: stStart,
            skotareSlut: stSlut,
            skotareObjektId: skotareEntry?.objekt_id || null,
            skotareObjektIds,
            skotareModellMaskinId: stMaskinId || null,
            volymSkotare: volymSkotareEff,
            skotatArManuell,
            skotarG15Manuell,
            sistaAvverkning,
            tilldeladSkotare: namnFranLass || namnFranTilldelning || null,
            skotareKalla,
            skotareAvvikelse,
            risskotningPagar: entries.some((e: any) => harPagaendeRis.has(e.objekt_id)),
            antalLass: stCount,
            dieselTotal: 0, // visas inte på förstasidan; detaljvyn hämtar sitt eget
            dagar,
            status: allDone ? 'avslutat' : 'pagaende',
            skordningAvslutad: skordningKlar,
            skotningAvslutad: skotningKlar,
            egenSkotning: entries.some((e: any) => e.egen_skotning === true),
            grotSkotning: entries.some((e: any) => e.risskotning === true),
            grotAnpassad: entries.some((e: any) => e.grot_anpassad === true),
            grotHamtad: entries.map((e: any) => e.grot_hamtad).find(Boolean) || null,
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
