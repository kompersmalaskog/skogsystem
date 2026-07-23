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
  filnamnLista: string[]; // unika filnamn — gör VO-grupp-merge dedupbar
  senasteData: string | null; // max fakt-datum (YYYY-MM-DD) — "data t.o.m."
  senasteImport: string | null; // max meta.importerad_tid — null när metaloggen saknar filerna
};

// Slår ihop fildata över en VO-grupps rader (syskonRader) till en lista per
// maskin. Ett fysiskt objekt är ofta FLERA dim_objekt-rader — filerna ska
// synas oavsett vilken rad i gruppen som öppnas. Dedupe per filnamn: samma
// fil kan bära data för flera rader i gruppen.
export function slaIhopFildata(listor: (MaskinFiler[] | undefined)[]): MaskinFiler[] {
  const perMaskin = new Map<string, MaskinFiler & { _filer: Set<string>; _typer: Set<string> }>();
  listor.forEach(lista => (lista || []).forEach(r => {
    let m = perMaskin.get(r.maskinId);
    if (!m) {
      m = { ...r, _filer: new Set<string>(), _typer: new Set<string>() };
      perMaskin.set(r.maskinId, m);
    }
    (r.filnamnLista || []).forEach(f => m!._filer.add(f));
    (r.filtyper || []).forEach(t => m!._typer.add(t));
    if (r.senasteData && (!m.senasteData || r.senasteData > m.senasteData)) m.senasteData = r.senasteData;
    if (r.senasteImport && (!m.senasteImport || r.senasteImport > m.senasteImport)) m.senasteImport = r.senasteImport;
  }));
  const ut: MaskinFiler[] = [];
  perMaskin.forEach(m => {
    ut.push({
      maskinId: m.maskinId, modell: m.modell, typ: m.typ,
      antalFiler: m._filer.size,
      filtyper: Array.from(m._typer).sort(),
      filnamnLista: Array.from(m._filer),
      senasteData: m.senasteData, senasteImport: m.senasteImport,
    });
  });
  ut.sort((a, b) => (a.typ === b.typ ? b.antalFiler - a.antalFiler : a.typ === 'skordare' ? -1 : 1));
  return ut;
}

export type FildataStatus = 'laddar' | 'fel' | 'ok';

export type MaskinInfo = {
  modell: string | null;
  typ: 'skordare' | 'skotare' | null;
  // dim_maskin.sander_filer — false = maskinen sänder aldrig filer (JD810E).
  // Läses defensivt: saknas kolumnen behandlas maskinen som sändande.
  sanderFiler: boolean;
};

export type Fildata = {
  status: FildataStatus;
  perObjekt: Map<string, MaskinFiler[]>;
  maskinInfo: Map<string, MaskinInfo>;
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

// Extern skördare = annans maskin avverkar, vi skotar bara. Spegelbild av
// extern skotning. Boolean-kolumn dim_objekt.extern_skordning (symmetri med
// egen_skotning i schemat); läses defensivt så koden tål en DB utan kolumnen.
export function harExternSkordning(obj: any): boolean {
  return obj?.extern_skordning === true;
}

export function filStatus(obj: any, rader: MaskinFiler[] | undefined, opts?: { skotareSanderEjFiler?: boolean }): {
  skordare: MaskinslagStatus;
  skotare: MaskinslagStatus;
  skotareEjOrsak: 'egen skotning' | 'extern skotare' | 'sänder inte filer' | null;
  skordareEjOrsak: 'risskotning' | 'klippning' | 'extern skördare' | null;
  ovantadSkordardata: boolean;
  ovantadSkotardata: boolean;
} {
  const r = rader || [];
  const harSkordarfiler = r.some(x => x.typ === 'skordare');
  const harSkotarfiler = r.some(x => x.typ === 'skotare');
  const egenExternOrsak = obj?.egen_skotning === true ? 'egen skotning' as const
    : harExternSkotning(obj) ? 'extern skotare' as const
    : null;
  // Icke-filsändande skotarmaskin (dim_maskin.sander_filer=false på gruppens
  // skotarrad) -> grå "förväntas ej", aldrig gul. Data som ändå dyker upp
  // vinner alltid (maskinen kanske började sända).
  const skotareEjOrsak = egenExternOrsak
    || (opts?.skotareSanderEjFiler ? 'sänder inte filer' as const : null);
  // Extern skördare -> skördare förväntas ej (grå), spegelbild av extern
  // skotning. risskotning/klippning gäller rena skotarjobb där aggregatet
  // sitter på skotaren.
  const skordareEjOrsak = harExternSkordning(obj) ? 'extern skördare' as const
    : obj?.risskotning === true ? 'risskotning' as const
    : obj?.klippning === true ? 'klippning' as const
    : null;
  return {
    skordare: harSkordarfiler ? 'data' : (skordareEjOrsak ? 'forvantas_ej' : 'saknas'),
    skotare: harSkotarfiler ? 'data' : (skotareEjOrsak ? 'forvantas_ej' : 'saknas'),
    skotareEjOrsak,
    skordareEjOrsak,
    // Oväntad = data trots att maskinslaget inte förväntas. Gäller INTE
    // sander_filer-flaggan — där är ny data goda nyheter, ingen flagga.
    ovantadSkordardata: harSkordarfiler && harExternSkordning(obj),
    ovantadSkotardata: harSkotarfiler && egenExternOrsak !== null,
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
  const [maskinInfo, setMaskinInfo] = useState<Map<string, MaskinInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const KOL = 'objekt_id, maskin_id, filnamn, datum';
        const [tid, prod, lass, sortiment, maskinRes, meta, hprRes, dimRes] = await Promise.all([
          hamtaAlla('fakt_tid', KOL),
          hamtaAlla('fakt_produktion', KOL),
          hamtaAlla('fakt_lass', KOL),
          hamtaAlla('fakt_sortiment', KOL),
          supabase.from('dim_maskin').select('*'),
          hamtaAlla('meta_importerade_filer', 'filnamn, importerad_tid'),
          supabase.from('hpr_filer').select('objekt_nyckel, filnamn, fil_datum'),
          supabase.from('dim_objekt').select('objekt_id, vo_nummer'),
        ]);
        if (maskinRes.error) throw new Error('Kunde inte läsa dim_maskin: ' + maskinRes.error.message);
        if (hprRes.error) throw new Error('Kunde inte läsa hpr_filer: ' + hprRes.error.message);
        if (dimRes.error) throw new Error('Kunde inte läsa dim_objekt: ' + dimRes.error.message);

        const maskinMap = new Map<string, MaskinInfo>();
        (maskinRes.data || []).forEach((m: any) =>
          maskinMap.set(m.maskin_id, {
            modell: m.modell || null,
            typ: typAvMaskin(m.maskin_typ),
            sanderFiler: m.sander_filer !== false,
          }));

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

        // hpr_filer som extra filkälla: HPR-snapshots som saknar fakta-spår
        // (t.ex. fristående import_hpr.py-jobb). VO ur objekt_nyckel
        // "maskin:vo" -> raden vars objekt_id ÄR maskinens nummer först
        // (kopplad syskonrad), annars första vo_nummer-träffen. Samma
        // filnamn som redan finns via fakta dedupas av filnamn-nyckeln.
        const perObjektId = new Map<string, string>(); // objekt_id -> objekt_id (existens)
        const perVo = new Map<string, string>(); // vo_nummer -> första objekt_id
        (dimRes.data || []).forEach((d: any) => {
          if (d.objekt_id) perObjektId.set(String(d.objekt_id), String(d.objekt_id));
          if (d.vo_nummer && !perVo.has(String(d.vo_nummer))) perVo.set(String(d.vo_nummer), String(d.objekt_id));
        });
        (hprRes.data || []).forEach((h: any) => {
          const nyckel = String(h.objekt_nyckel || '');
          const i = nyckel.indexOf(':');
          if (i <= 0 || !h.filnamn) return;
          const maskinId = nyckel.slice(0, i);
          const vo = nyckel.slice(i + 1);
          const objektId = perObjektId.get(vo) || perVo.get(vo);
          if (!objektId) return; // okopplat jobb — hanteras av larmsektionen
          laggTill({
            objekt_id: objektId,
            maskin_id: maskinId,
            filnamn: h.filnamn,
            datum: h.fil_datum ? String(h.fil_datum).slice(0, 10) : null,
          });
        });

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
              filnamnLista: Array.from(m.filer.keys()),
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
        setMaskinInfo(maskinMap);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('fel');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { status, perObjekt, maskinInfo };
}
