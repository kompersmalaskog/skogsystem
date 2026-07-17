'use client';

// Fildata per objekt: vilka maskinfiler som BÄR objektets data.
//
// Källa: faktaradernas filnamn (fakt_tid/fakt_produktion/fakt_lass/
// fakt_sortiment) — de är 100 % objekt-kopplade (0 null, 0 orphans,
// verifierat 2026-07-17). meta_importerade_filer används BARA för
// importerad_tid via filnamn-join: den saknar objektkoppling helt och
// listar dessutom ersatta kumulativa snapshots. Joinen får tåla missar —
// 8 kända fakta-filnamn saknas i metaloggen (reparations-script), och
// meta-namn kan bära ett extra "_YYYYMMDD_HHMMSS"-suffix från flytten
// till Behandlade-mappen.

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { typAvMaskin } from './useMatchning';

export type MaskinFiler = {
  maskinId: string;
  modell: string | null;
  typ: 'skordare' | 'skotare' | null;
  antalFiler: number;
  filtyper: string[]; // ur filändelsen: MOM/HPR/FPR/HQC
  senasteData: string | null; // max fakt-datum (YYYY-MM-DD) — "data t.o.m."
  senasteImport: string | null; // max meta.importerad_tid — null när metaloggen saknar filerna
};

export type FildataStatus = 'laddar' | 'fel' | 'ok';

export type Fildata = {
  status: FildataStatus;
  perObjekt: Map<string, MaskinFiler[]>;
};

// Förväntan per maskinslag utifrån objektets egenskaper + status för
// kortprickar och Filer-undersidan. Regler:
// - Skotare förväntas EJ när egen skotning eller extern skotare är på.
// - Skördare förväntas EJ på rena skotarjobb: risskotning eller klippning
//   (klippaggregatet sitter på skotaren — ingen skördarfil kommer).
// - Data som finns är alltid grönt, även oväntad — flaggan för oväntad
//   skotardata bär SubFiler, inte pricken.
export type MaskinslagStatus = 'data' | 'saknas' | 'forvantas_ej';

export function harExternSkotning(obj: any): boolean {
  if (obj?._extern_skotning === true) return true;
  try {
    const p = JSON.parse(obj?.ovrigt_info || '{}');
    return p.extern_skotning === true;
  } catch {
    return false;
  }
}

export function filStatus(obj: any, rader: MaskinFiler[] | undefined): {
  skordare: MaskinslagStatus;
  skotare: MaskinslagStatus;
  skotareEjOrsak: 'egen skotning' | 'extern skotare' | null;
  skordareEjOrsak: 'risskotning' | 'klippning' | null;
  ovantadSkotardata: boolean;
} {
  const r = rader || [];
  const harSkordarfiler = r.some(x => x.typ === 'skordare');
  const harSkotarfiler = r.some(x => x.typ === 'skotare');
  const skotareEjOrsak = obj?.egen_skotning === true ? 'egen skotning' as const
    : harExternSkotning(obj) ? 'extern skotare' as const
    : null;
  const skordareEjOrsak = obj?.risskotning === true ? 'risskotning' as const
    : obj?.klippning === true ? 'klippning' as const
    : null;
  return {
    skordare: harSkordarfiler ? 'data' : (skordareEjOrsak ? 'forvantas_ej' : 'saknas'),
    skotare: harSkotarfiler ? 'data' : (skotareEjOrsak ? 'forvantas_ej' : 'saknas'),
    skotareEjOrsak,
    skordareEjOrsak,
    ovantadSkotardata: harSkotarfiler && skotareEjOrsak !== null,
  };
}

function filtypAvNamn(filnamn: string): string {
  const m = String(filnamn || '').match(/\.(\w+)$/);
  return m ? m[1].toUpperCase() : '?';
}

// Strippar Behandlade-flyttens suffix: "namn_20260713_145515.mom" -> "namn.mom"
function utanImportSuffix(filnamn: string): string {
  return String(filnamn || '').replace(/_\d{8}_\d{6}(\.\w+)$/, '$1');
}

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

export function useFildata(): Fildata {
  const [status, setStatus] = useState<FildataStatus>('laddar');
  const [perObjekt, setPerObjekt] = useState<Map<string, MaskinFiler[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const KOL = 'objekt_id, maskin_id, filnamn, datum';
        const [tid, prod, lass, sortiment, maskinRes, meta] = await Promise.all([
          hamtaAlla('fakt_tid', KOL),
          hamtaAlla('fakt_produktion', KOL),
          hamtaAlla('fakt_lass', KOL),
          hamtaAlla('fakt_sortiment', KOL),
          supabase.from('dim_maskin').select('maskin_id, modell, maskin_typ'),
          hamtaAlla('meta_importerade_filer', 'filnamn, importerad_tid'),
        ]);
        if (maskinRes.error) throw new Error('Kunde inte läsa dim_maskin: ' + maskinRes.error.message);

        const maskinMap = new Map<string, { modell: string | null; typ: 'skordare' | 'skotare' | null }>();
        (maskinRes.data || []).forEach((m: any) =>
          maskinMap.set(m.maskin_id, { modell: m.modell || null, typ: typAvMaskin(m.maskin_typ) }));

        // Importtid per filnamn — nyckla på både metanamnet och det
        // suffix-strippade namnet (fakta refererar originalnamnet)
        const importTid = new Map<string, string>();
        const satt = (nyckel: string, tidpunkt: string) => {
          const prev = importTid.get(nyckel);
          if (!prev || tidpunkt > prev) importTid.set(nyckel, tidpunkt);
        };
        meta.forEach((m: any) => {
          if (!m.filnamn || !m.importerad_tid) return;
          satt(m.filnamn, m.importerad_tid);
          satt(utanImportSuffix(m.filnamn), m.importerad_tid);
        });

        // objektId -> maskinId -> { filnamn -> filtyp } + max-datum
        const agg = new Map<string, Map<string, { filer: Map<string, string>; senasteData: string | null }>>();
        const laggTill = (r: any) => {
          if (!r.objekt_id || !r.maskin_id || !r.filnamn) return;
          let perMaskin = agg.get(r.objekt_id);
          if (!perMaskin) { perMaskin = new Map(); agg.set(r.objekt_id, perMaskin); }
          let m = perMaskin.get(r.maskin_id);
          if (!m) { m = { filer: new Map(), senasteData: null }; perMaskin.set(r.maskin_id, m); }
          m.filer.set(r.filnamn, filtypAvNamn(r.filnamn));
          const d = r.datum ? String(r.datum).slice(0, 10) : null;
          if (d && (!m.senasteData || d > m.senasteData)) m.senasteData = d;
        };
        tid.forEach(laggTill);
        prod.forEach(laggTill);
        lass.forEach(laggTill);
        sortiment.forEach(laggTill);

        const resultat = new Map<string, MaskinFiler[]>();
        agg.forEach((perMaskin, objektId) => {
          const rader: MaskinFiler[] = [];
          perMaskin.forEach((m, maskinId) => {
            let senasteImport: string | null = null;
            m.filer.forEach((_typ, namn) => {
              const t = importTid.get(namn) || importTid.get(utanImportSuffix(namn)) || null;
              if (t && (!senasteImport || t > senasteImport)) senasteImport = t;
            });
            rader.push({
              maskinId,
              modell: maskinMap.get(maskinId)?.modell || null,
              typ: maskinMap.get(maskinId)?.typ || null,
              antalFiler: m.filer.size,
              filtyper: Array.from(new Set(Array.from(m.filer.values()))).sort(),
              senasteData: m.senasteData,
              senasteImport: senasteImport ? String(senasteImport).slice(0, 10) : null,
            });
          });
          // Skördare först, sedan flest filer
          rader.sort((a, b) => (a.typ === b.typ ? b.antalFiler - a.antalFiler : a.typ === 'skordare' ? -1 : 1));
          resultat.set(objektId, rader);
        });

        if (cancelled) return;
        setPerObjekt(resultat);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('fel');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { status, perObjekt };
}
