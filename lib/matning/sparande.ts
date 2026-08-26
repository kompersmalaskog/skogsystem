// Mätvyns sparande — lokalt först, databasen sedan.
//
// ORDNINGEN ÄR HELA POÄNGEN. Varje punkt skrivs till localStorage i samma
// ögonblick varvet sluts, INNAN något nätanrop försöks. Ingen täckning i
// skogen betyder inte att mätningen får gå förlorad; den ligger kvar och
// synkas när täckning finns.
//
// En punkt som ligger osynkad är inte ett fel — det är det normala läget
// halva arbetsdagen. Men den ska SYNAS som osynkad, aldrig se ut som sparad.
//
// VERIFIERAT SPARANDE
// En Supabase-skrivning som träffar noll rader svarar 200 med tom lista. Att
// bara kolla `error` är därför inte att kontrollera att något sparades — det
// är att kontrollera att inget kraschade. Varje insert nedan begär tillbaka
// raden med .select() och verifierar att den kom, och för träden att ANTALET
// stämmer. Utan det kan halva varvet försvinna tyst.
//
// OBJEKT_ID
// Här lagras `objekt.id` (uuid), alltså raden i objekt-tabellen — samma
// nyckel som punktlottningen och planering_markeringar använder. Kolumnen
// heter objekt_id och är text, vilket krockar med appens vanligare betydelse
// (dim_objekt.objekt_id). Går man vidare härifrån: joina till objekt på id,
// och därifrån till vo_nummer om uttaget ska jämföras.

import { supabase } from '../supabase';
import {
  lasPagaende,
  rensaPagaende,
  sparaPagaende,
  type MattPunkt,
  type MattTrad,
  type PagaendeMatning,
} from './lager';

export type SparResultat =
  | { status: 'sparad'; matning_id: string; punkt_id: string }
  | { status: 'lokalt'; skal: string };

/** Lokalt id tills raden finns i databasen. */
function lokaltId(): string {
  return `lokal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Startar en mätning lokalt. Databasraden skapas vid första synken — en
 *  mätning utan punkter är inget att spara. */
export function startaMatning(
  objektId: string,
  relaskopFaktor: number,
  synfaltGrader: number,
  enhet: string | null,
): PagaendeMatning {
  const m: PagaendeMatning = {
    lokal_id: lokaltId(),
    objekt_id: objektId,
    datum: new Date().toISOString().slice(0, 10),
    relaskop_faktor: relaskopFaktor,
    synfalt_grader: synfaltGrader,
    enhet,
    punkter: [],
    synkad: false,
  };
  sparaPagaende(m);
  return m;
}

/** Lägger punkten till den pågående mätningen och skriver den lokalt DIREKT. */
export function laggTillPunkt(m: PagaendeMatning, punkt: MattPunkt): PagaendeMatning {
  const nytt: PagaendeMatning = { ...m, punkter: [...m.punkter, punkt], synkad: false };
  sparaPagaende(nytt);
  return nytt;
}

// ---------------------------------------------------------------------------
// Synk
// ---------------------------------------------------------------------------

async function skapaMatningsrad(m: PagaendeMatning, utforare: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('matning')
    .insert({
      objekt_id: m.objekt_id,
      datum: m.datum,
      utforare,
      relaskop_faktor: m.relaskop_faktor,
      synfalt_grader: m.synfalt_grader,
      enhet: m.enhet,
    })
    .select('id')
    .single();
  if (error) throw new Error(`matning: ${error.message}`);
  if (!data?.id) throw new Error('matning: inga rader skrevs');
  return data.id as string;
}

async function skrivPunkt(matningId: string, p: MattPunkt): Promise<string> {
  const { data, error } = await supabase
    .from('matning_punkt')
    .insert({
      matning_id: matningId,
      punkt_nummer: p.punkt_nummer,
      lat: p.lat,
      lng: p.lng,
      matt_lat: p.matt_lat,
      matt_lng: p.matt_lng,
      gps_noggrannhet_m: p.gps_noggrannhet_m,
      varv_grader: p.varv_grader,
      matt_tid: p.matt_tid,
    })
    .select('id')
    .single();
  if (error) throw new Error(`matning_punkt ${p.punkt_nummer}: ${error.message}`);
  if (!data?.id) throw new Error(`matning_punkt ${p.punkt_nummer}: inga rader skrevs`);
  return data.id as string;
}

async function skrivTrad(punktId: string, trad: MattTrad[]): Promise<void> {
  if (trad.length === 0) return;
  const { data, error } = await supabase
    .from('matning_trad')
    .insert(
      trad.map((t) => ({
        punkt_id: punktId,
        tradslag: t.tradslag,
        baring: t.baring,
        hojdvinkel: t.hojdvinkel,
        ordning: t.ordning,
      })),
    )
    .select('id');
  if (error) throw new Error(`matning_trad: ${error.message}`);
  // ANTALET måste stämma. Ett halvt varv som sparats tyst är värre än ett
  // synligt fel — grundytan blir för låg och ingen har anledning att tvivla.
  if ((data?.length ?? 0) !== trad.length) {
    throw new Error(`matning_trad: ${data?.length ?? 0} av ${trad.length} träd skrevs`);
  }
}

/**
 * Synkar den pågående mätningen till databasen.
 *
 * Allt eller inget per punkt: en punkt vars träd inte gick att skriva lämnas
 * kvar lokalt i sin helhet, så nästa försök skriver om den från början i
 * stället för att lägga till hälften en gång till.
 *
 * Returnerar hur det gick, aldrig ett tyst misslyckande — vyn ska kunna säga
 * "3 punkter väntar på täckning" i stället för att se sparad ut.
 */
export async function synka(
  m: PagaendeMatning,
  utforare: string | null,
): Promise<{ synkade: number; kvar: number; fel: string | null }> {
  if (m.punkter.length === 0) return { synkade: 0, kvar: 0, fel: null };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synkade: 0, kvar: m.punkter.length, fel: 'Ingen täckning' };
  }

  try {
    const matningId = await skapaMatningsrad(m, utforare);
    let synkade = 0;
    for (const p of m.punkter) {
      const punktId = await skrivPunkt(matningId, p);
      await skrivTrad(punktId, p.trad);
      synkade++;
    }
    rensaPagaende();
    return { synkade, kvar: 0, fel: null };
  } catch (e) {
    // Mätningen ligger kvar lokalt. Nästa försök gör om hela synken.
    return {
      synkade: 0,
      kvar: m.punkter.length,
      fel: e instanceof Error ? e.message : 'Okänt fel vid synk',
    };
  }
}

/** Osynkad mätning från ett tidigare pass, om någon ligger kvar. */
export function osynkadMatning(): PagaendeMatning | null {
  const m = lasPagaende();
  return m && m.punkter.length > 0 ? m : null;
}
