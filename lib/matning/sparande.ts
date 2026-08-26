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
// EN MÄTNING, INTE EN PER PUNKT
// Synken körs efter varje punkt. Skapade den en ny matningsrad varje gång blev
// tio punkter i samma trakt till tio mätningar med en punkt var, och
// sammanfattningen hade sagt "medel över 1 punkt" utan spridning — alltså
// exakt det den finns till för att visa. Därför bär den pågående mätningen
// sitt matning_id så fort raden skapats, och synken återanvänder det.
//
// VERIFIERAT SPARANDE
// En Supabase-skrivning som träffar noll rader svarar 200 med tom lista. Att
// bara kolla `error` är därför inte att kontrollera att något sparades — det
// är att kontrollera att inget kraschade. Varje insert nedan begär tillbaka
// raden med .select() och verifierar att den kom, och för träden att ANTALET
// stämmer. Utan det kan halva varvet försvinna tyst.
//
// OMFÖRSÖK FÅR INTE DUBBLERA
// Går punktraden igenom men träden inte, ligger en punkt med noll träd kvar i
// databasen — en punkt med grundyta 0 som drar ned medlet. Därför sparas
// punkt_id lokalt så fort raden finns, och omförsöket skriver träden till
// SAMMA rad (efter att ha rensat eventuella halva träd) i stället för att
// skapa en andra. Databasen har dessutom unique(matning_id, punkt_nummer) som
// sista spärr.
//
// OBJEKT_UUID
// Här lagras `objekt.id` (uuid), alltså raden i objekt-tabellen — samma
// nyckel som punktlottningen och planering_markeringar använder.
//
// Kolumnen heter objekt_uuid och INTE objekt_id, med flit. I dim_objekt,
// fakt_produktion och detalj_stam betyder objekt_id en textnyckel av typen
// '11219961'. Hade den här hetat likadant vore
//   join dim_objekt d on d.objekt_id = m.objekt_id
// en fråga som ger noll rader — och noll rader ser ut som "ingen mätning
// gjord", inte som ett fel. Namnet är skyddet; en kommentar räcker inte.

import { supabase } from '../supabase';
import {
  lasPagaende,
  osynkadeAntal,
  rensaPagaende,
  sparaPagaende,
  type MattPunkt,
  type MattTrad,
  type PagaendeMatning,
} from './lager';

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
    matning_id: null,
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

/** Avslutar traktbesöket. Rensar bara när allt ligger i databasen — annars
 *  vore det att kasta mätdata för att någon tryckte fel. */
export function avslutaMatning(m: PagaendeMatning | null): boolean {
  if (m && osynkadeAntal(m) > 0) return false;
  rensaPagaende();
  return true;
}

// ---------------------------------------------------------------------------
// Synk
// ---------------------------------------------------------------------------

async function skapaMatningsrad(m: PagaendeMatning, utforare: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('matning')
    .insert({
      objekt_uuid: m.objekt_id,
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

async function skrivTrad(punktId: string, trad: MattTrad[], omforsok: boolean): Promise<void> {
  // Vid omförsök kan halva varvet redan ligga där. Rensa först — träden skrivs
  // i en batch, så att ta bort och skriva om är exakt, inte destruktivt.
  if (omforsok) {
    const { error } = await supabase.from('matning_trad').delete().eq('punkt_id', punktId);
    if (error) throw new Error(`matning_trad (rensa): ${error.message}`);
  }
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

export type SynkResultat = {
  synkade: number;
  kvar: number;
  fel: string | null;
  /** Mätningen som den ser ut efteråt — med matning_id och synkade punkter. */
  matning: PagaendeMatning;
};

/**
 * Synkar den pågående mätningen till databasen.
 *
 * Skriver bara det som inte redan ligger där, och sparar lokalt efter VARJE
 * delsteg. Bryts synken mitt i — täckningen försvinner bakom en kulle — går
 * nästa försök vidare där det tog slut i stället för att börja om och
 * dubbelskriva.
 *
 * Returnerar hur det gick, aldrig ett tyst misslyckande: vyn ska kunna säga
 * "3 punkter väntar på täckning" i stället för att se sparad ut.
 */
export async function synka(
  m: PagaendeMatning,
  utforare: string | null,
): Promise<SynkResultat> {
  const attSkriva = m.punkter.filter((p) => !p.synkad);
  if (attSkriva.length === 0) return { synkade: 0, kvar: 0, fel: null, matning: m };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synkade: 0, kvar: attSkriva.length, fel: 'Ingen täckning', matning: m };
  }

  // Arbetskopian skrivs till localStorage efter varje delsteg, så framsteg
  // överlever att appen dör mitt i.
  let aktuell: PagaendeMatning = { ...m, punkter: [...m.punkter] };
  const spara = () => { sparaPagaende(aktuell); };
  let synkade = 0;

  try {
    let matningId = aktuell.matning_id;
    if (!matningId) {
      matningId = await skapaMatningsrad(aktuell, utforare);
      aktuell = { ...aktuell, matning_id: matningId };
      spara();  // FÖRE punkterna: annars skapas en andra matningsrad vid krasch
    }

    for (let i = 0; i < aktuell.punkter.length; i++) {
      const p = aktuell.punkter[i];
      if (p.synkad) continue;

      const omforsok = !!p.punkt_id;
      const punktId = p.punkt_id ?? (await skrivPunkt(matningId, p));
      if (!omforsok) {
        // Punktraden finns nu. Spara id:t INNAN träden skrivs — går de fel ska
        // omförsöket hitta samma rad, inte skapa en till.
        aktuell.punkter[i] = { ...p, punkt_id: punktId };
        spara();
      }

      await skrivTrad(punktId, p.trad, omforsok);
      aktuell.punkter[i] = { ...aktuell.punkter[i], synkad: true };
      spara();
      synkade++;
    }

    aktuell = { ...aktuell, synkad: true };
    spara();
    return { synkade, kvar: 0, fel: null, matning: aktuell };
  } catch (e) {
    spara();
    return {
      synkade,
      kvar: osynkadeAntal(aktuell),
      fel: e instanceof Error ? e.message : 'Okänt fel vid synk',
      matning: aktuell,
    };
  }
}

/** Mätning som ligger kvar lokalt från ett tidigare pass, om någon gör det. */
export function osynkadMatning(): PagaendeMatning | null {
  const m = lasPagaende();
  return m && m.punkter.length > 0 ? m : null;
}
