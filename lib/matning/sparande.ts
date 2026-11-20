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
// EN LÖPANDE MÄTNING PER TRAKT
// Mäts det under körning återkommer Martin till samma trakt pass efter pass.
// Varje pass fick INTE bli en egen mätning: då jämför beskedet bara mot dagens
// punkter, och sammanfattningen visar ett pass i stället för trakten. Därför
// letas traktens öppna mätning upp (`avslutad is null`) och återupptas. Den
// stängs när han trycker Avsluta trakten, och först då börjar en ny.
//
// FAKTORN FÅR INTE BLANDAS
// Grundytan räknas i databasen som antal träd gånger MÄTNINGENS relaskop_faktor.
// Har Martin kalibrerat om till en annan faktor sedan förra passet skulle hans
// nya punkter tyst räknas med den gamla — ett fel som inte syns på siffran,
// det bara förskjuter den. Därför återupptas en mätning bara när faktorn
// stämmer; annars börjar en ny, och vyn säger varför — se faktorKrock.
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
import { tidigareGrundytor } from './sammanfattning';
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

export type OppenMatning = {
  id: string;
  relaskop_faktor: number;
  hogsta_punkt: number;
};

/**
 * Varför en mätning inte återupptogs måste gå att skilja från att det inte
 * fanns någon. En faktorkrock betyder att trakten HAR tidigare punkter som nu
 * hänger i en annan mätning — det ska sägas, inte tigas bort. Återges bara
 * "ingen" börjar en ny mätning tyst och sammanfattningen visar hälften av
 * trakten utan att någon vet om det.
 */
export type OppenResultat =
  | { status: 'ingen' }
  | { status: 'oppen'; matning: OppenMatning }
  | { status: 'faktor_krock'; faktor: number };

/** Högsta punktnummer som redan ligger i mätningen. 0 om den är tom. */
async function hogstaPunktIDb(matningId: string): Promise<number> {
  const { data, error } = await supabase
    .from('matning_punkt')
    .select('punkt_nummer')
    .eq('matning_id', matningId)
    .order('punkt_nummer', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return 0;
  return (data.punkt_nummer as number) ?? 0;
}

/**
 * Traktens öppna mätning, om den finns och går att återuppta.
 *
 * `avslutad is null` är vad som gör en mätning löpande. Faktorn måste stämma —
 * se filhuvudet; en återupptagen mätning med fel faktor räknar nya punkter med
 * den gamla utan att någon ser det.
 *
 * Returnerar null både när ingen finns och när nätet är nere. Anroparen börjar
 * då en ny lokalt, och synken gör om uppslaget när täckning finns — så en
 * mätning som startats offline ändå hittar hem till rätt rad.
 */
export async function oppenMatning(
  objektUuid: string,
  relaskopFaktor: number,
): Promise<OppenResultat> {
  const { data, error } = await supabase
    .from('matning')
    .select('id, relaskop_faktor')
    .eq('objekt_uuid', objektUuid)
    .is('avslutad', null)
    .order('datum', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { status: 'ingen' };
  const faktor = Number(data.relaskop_faktor);
  if (faktor !== relaskopFaktor) return { status: 'faktor_krock', faktor };
  const id = data.id as string;
  return {
    status: 'oppen',
    matning: { id, relaskop_faktor: faktor, hogsta_punkt: await hogstaPunktIDb(id) },
  };
}

/** Startar en mätning lokalt. Databasraden skapas vid första synken — en
 *  mätning utan punkter är inget att spara. */
export function startaMatning(
  objektId: string,
  objektNamn: string,
  relaskopFaktor: number,
  synfaltGrader: number,
  enhet: string | null,
): PagaendeMatning {
  const m: PagaendeMatning = {
    lokal_id: lokaltId(),
    matning_id: null,
    objekt_id: objektId,
    objekt_namn: objektNamn,
    datum: new Date().toISOString().slice(0, 10),
    relaskop_faktor: relaskopFaktor,
    synfalt_grader: synfaltGrader,
    enhet,
    db_hogsta_punkt: 0,
    tidigare_grundytor: [],
    punkter: [],
    synkad: false,
  };
  sparaPagaende(m);
  return m;
}

/**
 * Öppnar trakten: återupptar den löpande mätningen om det finns en, annars
 * startar en ny.
 *
 * Utan täckning blir det alltid en ny lokal mätning med `matning_id: null` —
 * och det är avsiktligt. Synken gör om uppslaget och adopterar traktens öppna
 * rad i stället för att skapa en andra. Se `synka`.
 */
export async function oppnaTrakt(
  objektId: string,
  objektNamn: string,
  relaskopFaktor: number,
  synfaltGrader: number,
  enhet: string | null,
): Promise<{ matning: PagaendeMatning; aterupptagen: boolean; faktorKrock: number | null }> {
  const m = startaMatning(objektId, objektNamn, relaskopFaktor, synfaltGrader, enhet);
  let r: OppenResultat = { status: 'ingen' };
  try {
    r = await oppenMatning(objektId, relaskopFaktor);
  } catch {
    /* ingen täckning — synken gör om uppslaget */
  }
  if (r.status === 'faktor_krock') {
    return { matning: m, aterupptagen: false, faktorKrock: r.faktor };
  }
  if (r.status === 'ingen') return { matning: m, aterupptagen: false, faktorKrock: null };

  let tidigare: number[] = [];
  try {
    tidigare = await tidigareGrundytor(r.matning.id);
  } catch {
    /* utan täckning blir jämförelsen sessionens egna punkter — inte fel, bara mindre */
  }
  const nytt: PagaendeMatning = {
    ...m,
    matning_id: r.matning.id,
    db_hogsta_punkt: r.matning.hogsta_punkt,
    tidigare_grundytor: tidigare,
  };
  sparaPagaende(nytt);
  return { matning: nytt, aterupptagen: true, faktorKrock: null };
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

/**
 * Ger osynkade punkter nummer som inte krockar med dem som redan ligger inne.
 *
 * Mäter Martin utan täckning börjar numreringen lokalt på 1, medan databasen
 * redan kan ha punkt 1-7 från förra passet. Skrevs de som de är skulle
 * unique(matning_id, punkt_nummer) avvisa dem — och utan den spärren hade två
 * olika punkter hetat "punkt 1" i samma mätning. Numret är bara en ordning, så
 * det är rätt sak att räkna om; mätvärdet rörs inte.
 */
export function renumreraOsynkade(punkter: MattPunkt[], hogstaIDb: number): MattPunkt[] {
  let nasta = punkter.reduce((h, p) => (p.synkad ? Math.max(h, p.punkt_nummer) : h), hogstaIDb) + 1;
  return punkter.map((p) => {
    if (p.synkad) return p;
    if (p.punkt_nummer >= nasta) { nasta = p.punkt_nummer + 1; return p; }
    const nytt = { ...p, punkt_nummer: nasta };
    nasta += 1;
    return nytt;
  });
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
      // Mätningen startades utan täckning. Innan en ny rad skapas: har trakten
      // redan en öppen mätning? Annars vore varje offline-pass en egen mätning,
      // och hela poängen med en löpande per trakt vore borta.
      const r = await oppenMatning(aktuell.objekt_id, aktuell.relaskop_faktor);
      const oppen = r.status === 'oppen' ? r.matning : null;
      matningId = oppen?.id ?? (await skapaMatningsrad(aktuell, utforare));
      aktuell = {
        ...aktuell,
        matning_id: matningId,
        db_hogsta_punkt: oppen?.hogsta_punkt ?? 0,
        tidigare_grundytor: oppen ? await tidigareGrundytor(oppen.id) : [],
        punkter: renumreraOsynkade(aktuell.punkter, oppen?.hogsta_punkt ?? 0),
      };
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

export type AvslutResultat =
  | { status: 'avslutad' }
  | { status: 'osynkat'; kvar: number }
  | { status: 'fel'; meddelande: string };

/**
 * Avslutar trakten: stänger den löpande mätningen i databasen och släpper den
 * lokalt.
 *
 * Stängningen är vad som gör att NÄSTA besök börjar en ny mätning. Skrivs den
 * inte fortsätter trakten samla punkter i all framtid, och en gallring i höst
 * blandas med en mätning från i våras.
 *
 * Rensar bara lokalt när allt ligger i databasen — annars vore det att kasta
 * mätdata för att någon tryckte fel.
 */
export async function avslutaMatning(m: PagaendeMatning | null): Promise<AvslutResultat> {
  if (!m) { rensaPagaende(); return { status: 'avslutad' }; }
  const kvar = osynkadeAntal(m);
  if (kvar > 0) return { status: 'osynkat', kvar };

  if (m.matning_id) {
    const { data, error } = await supabase
      .from('matning')
      .update({ avslutad: new Date().toISOString() })
      .eq('id', m.matning_id)
      .select('id');
    if (error) return { status: 'fel', meddelande: error.message };
    // Radräkning bevisar inte att rätt värde landade, men noll rader bevisar
    // att inget gjorde det — och då får den inte se avslutad ut.
    if ((data?.length ?? 0) === 0) {
      return { status: 'fel', meddelande: 'Mätningen kunde inte stängas — ingen rad träffades.' };
    }
  }
  rensaPagaende();
  return { status: 'avslutad' };
}

/** Mätning som ligger kvar lokalt från ett tidigare pass, om någon gör det. */
export function osynkadMatning(): PagaendeMatning | null {
  const m = lasPagaende();
  return m && m.punkter.length > 0 ? m : null;
}
