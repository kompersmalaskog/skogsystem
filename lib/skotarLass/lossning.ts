// Lossningsdetektorn: ser ur GPS-fixarna när skotaren lossar vid ett avlägg. Ren funktion — inga timers, inga beroenden.
//
// Principen (Martin 2026-10-20, efter Daniels Mölleryd): vad maskinen GÖR, inte bara var den är.
//   • En LOSSNING = maskinen står still (under 3 min har den inte rört sig mer än STILLA_UTBREDNING_M) i minst STILLA_S (3 min) inom zonen runt ett avlägg
//     (AVLAGG.RADIE_M, 50 m: en avläggshög ligger längs vägen och är 80–90 m lång, så en liten radie runt punkten missar ändarna).
//     Passage, vändning och att plocka rent står aldrig 3 min i följd och ger ingen lossning.
//   • Lossningen är ÖPPEN tills maskinen lämnat zonen (LAMNAT_S utanför). Då kommer ett slut-event med hur länge den stått still — det är
//     då lasset går till väntelistan om föraren inte svarat. Appen vet att han lossar, aldrig VAD — ingenting bekräftas av sig självt.
//   • CYKEL: ingen NY lossning tidigare än CYKEL_S (15 min) efter att förra tog slut. Står maskinen still igen inom den tiden är det samma lossning /
//     plocka rent (upprepning) — utom vid ett ANNAT avlägg, då är det samma last på ett andra avlägg (ny_del).
//   • "Nytt avlägg här?": långt stopp utanför alla avlägg, bort från skördarens spår och från förra lossningen.
//
// Matas med VARJE fix (inte hyttspåret: spåret släpper medvetet punkter som ligger nära varandra, och stillastående är precis det vi mäter).
import { avstand } from './geo';
import { AVLAGG, traffaAvlagg, type AvlaggTraff } from './avlagg';
import type { Avlagg, LatLng } from './typer';

export const LOSSNING = {
  /** Stilla så här länge inom zonen = lossning. */
  STILLA_S: 180,
  /** "Stilla" = under hela STILLA_S har maskinen inte rört sig mer än så här (rutan fixarna spänner upp). 10 m från ett fast ankare var för snävt: verklig GPS-drift
   *  + omplacering längs högen gjorde att Daniels 15-minuters lossning aldrig stod "still" (Mölleryd 2026-10-20). */
  STILLA_UTBREDNING_M: 25,
  /** Stilla-tiden räknas medan maskinen rört sig högst PAUS_UTBREDNING_M under senaste PAUS_S, alltså under ca 1 km/h. */
  PAUS_S: 60,
  PAUS_UTBREDNING_M: 15,
  /** Utanför zonen så här länge = maskinen har lämnat avlägget och lossningen är slut. */
  LAMNAT_S: 20,
  /** …eller: maskinen har rört sig (mer än PAUS_UTBREDNING_M per PAUS_S) så här länge i sträck = den har kört iväg och lossningen är slut. På en liten trakt lastar
   *  skotaren också inom zonen (Mölleryd: allt inom 62 m från avlägget), så att lämna zonen räcker inte för att se att en cykel gått. */
  RORELSE_SLUT_S: 60,
  /** Ingen ny lossning tidigare än så här efter att förra tog slut. Elefanten kör 28–46 min per lass (Opti, start till start), men i Mölleryd kom Daniels äkta
   *  lass 3 bara 13–14 min efter att förra lossningen tagit slut (kort väg) — 15 min hade slängt det. */
  CYKEL_S: 600,
  /** "Nytt avlägg här?" kräver ett långt stopp utanför alla avlägg… */
  NYTT_AVLAGG_STILLA_S: 90,
  /** …en bit från skördarens spår (lastning sker på stickvägen)… */
  NYTT_AVLAGG_FRAN_SPAR_M: 25,
  /** …och en bit från förra lossningen. */
  NYTT_AVLAGG_FRAN_FORRA_M: 150,
  /** En fråga som avvisats ställs inte igen inom så här långt. */
  FRAGA_SPARR_M: 60,
  /** Glapp i fixarna längre än så → stillastående räknas om från nästa fix (vi vet inte vad som hänt). */
  MAX_GLAPP_S: 90,
} as const;

export interface DetektorFix extends LatLng { ts: number }

export interface SenasteLossning { lat: number; lng: number; ts: number; avlaggId: string | null }

/** Lossningen som pågår just nu (maskinen står eller har stått i zonen och har inte lämnat den). */
export interface OppenLossning {
  /** Där och när stillastående började. */
  ts: number;
  lat: number;
  lng: number;
  avlaggId: string | null;
  /** Sammanlagd tid maskinen stått still (under ca 1 km/h) inne i zonen sedan lossningen började. */
  stillaS: number;
  /** Senaste fix inne i zonen. */
  sistInnanfor: number;
  /** Senaste gången maskinen stod still (under ca 1 km/h) inne i zonen = när lossningen "tog slut" om den lämnar. */
  sistStilla: number;
  /** Sedan när maskinen rört sig i sträck (null = står still). */
  rorelseSedan: number | null;
  /** Första fixen utanför zonen i den pågående utgången, eller null medan maskinen är kvar. */
  utanforSedan: number | null;
  /** Föraren tryckte "Lossa här" — då räknas trycket som bekräftelsen, ingen stilla-tid krävs. */
  manuell: boolean;
}

export interface DetektorState {
  /** De senaste STILLA_S sekundernas fixar (ett glidande fönster). Töms vid glapp i fixarna. */
  fonster: DetektorFix[];
  sistaTs: number | null;
  lossningUtlost: boolean;
  fragaUtlost: boolean;
  senaste: SenasteLossning | null;
  oppen: OppenLossning | null;
  /** När och var förra lossningen tog slut (cykelregeln räknar från ts). */
  slut: { ts: number; avlaggId: string | null } | null;
  avvisadeFragor: LatLng[];
}

/** `senaste` = förra lossningen (för en omladdning mitt i en cykel): den räknas då som just avslutad, så att ett stillastående vid samma avlägg inte blir ett nytt lass. */
export const nyDetektor = (senaste: SenasteLossning | null = null): DetektorState => ({
  fonster: [], sistaTs: null, lossningUtlost: false, fragaUtlost: false,
  senaste, oppen: null, slut: senaste ? { ts: senaste.ts, avlaggId: senaste.avlaggId } : null, avvisadeFragor: [],
});

export type LossningsTyp = 'nytt_lass' | 'ny_del' | 'upprepning';

export interface SlutHandelse {
  typ: 'lossning_slut';
  /** Tiden maskinen lämnade zonen. */
  ts: number;
  /** Tiden lossningen började (= lassets lossadTid). */
  lassTs: number;
  /** Hur länge maskinen stod still sammanlagt. */
  stillaS: number;
  manuell: boolean;
  avlaggId: string | null;
}

export type Handelse =
  | { typ: 'lossning'; lossning: LossningsTyp; ts: number; lat: number; lng: number; traff: AvlaggTraff }
  | { typ: 'nytt_avlagg_fraga'; ts: number; lat: number; lng: number }
  | SlutHandelse;

export interface DetektorKontext {
  avlagg: readonly Avlagg[];
  /** Avstånd (m) från fixen till närmaste skördarspår. undefined = okänt → "Nytt avlägg här?" ställs inte. */
  avstandTillSpar?: number;
}

const centrumFor = (o: OppenLossning, avlagg: readonly Avlagg[]): LatLng =>
  (o.avlaggId ? avlagg.find((a) => a.id === o.avlaggId) : null) ?? o;

/** Rutan (diagonalen, m) som fixarna spänner upp. */
function utbredning(fixar: readonly DetektorFix[]): number {
  if (fixar.length < 2) return 0;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const f of fixar) { minLat = Math.min(minLat, f.lat); maxLat = Math.max(maxLat, f.lat); minLng = Math.min(minLng, f.lng); maxLng = Math.max(maxLng, f.lng); }
  return avstand({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng });
}

/** Fixarna från och med `fran` (ms). */
const sedan = (fonster: readonly DetektorFix[], fran: number): DetektorFix[] => fonster.filter((f) => f.ts >= fran);

/** Ett steg: nästa tillstånd och högst en händelse. */
export function stegaDetektor(s: DetektorState, fix: DetektorFix, ctx: DetektorKontext): { state: DetektorState; handelse: Handelse | null } {
  let st: DetektorState = { ...s, avvisadeFragor: s.avvisadeFragor };
  const glapp = s.sistaTs != null && (fix.ts - s.sistaTs) / 1000 > LOSSNING.MAX_GLAPP_S;
  const dtS = s.sistaTs != null ? Math.max(0, (fix.ts - s.sistaTs) / 1000) : 0;
  st.sistaTs = fix.ts;

  // Fönstret: de senaste STILLA_S sekunderna (en fix per sekund räcker; pulsen var 2:a sekund ger fler). Ett glapp i fixarna nollar det — vi vet inte vad som hänt.
  const prev = glapp ? [] : st.fonster;
  const fonster = sedan([...prev, { lat: fix.lat, lng: fix.lng, ts: fix.ts }], fix.ts - LOSSNING.STILLA_S * 1000);
  st = { ...st, fonster };
  const spannS = (fix.ts - fonster[0].ts) / 1000;
  const pausFonster = sedan(fonster, fix.ts - LOSSNING.PAUS_S * 1000);
  const stillaNu = (fix.ts - pausFonster[0].ts) / 1000 >= LOSSNING.PAUS_S - 5 && utbredning(pausFonster) <= LOSSNING.PAUS_UTBREDNING_M;

  // 1) Öppen lossning: räkna stilla-tiden medan maskinen står i zonen. Lossningen tar slut när maskinen lämnat zonen (LAMNAT_S utanför)
  //    eller kört iväg (rört sig RORELSE_SLUT_S i sträck).
  if (st.oppen) {
    const o = st.oppen;
    const inne = avstand(fix, centrumFor(o, ctx.avlagg)) <= AVLAGG.RADIE_M;
    let ny: OppenLossning = { ...o };
    if (inne) { ny.sistInnanfor = fix.ts; ny.utanforSedan = null; } else if (o.utanforSedan == null) ny.utanforSedan = fix.ts;
    if (stillaNu) {
      ny.rorelseSedan = null;
      if (inne) { ny.stillaS = o.stillaS + Math.min(dtS, 5); ny.sistStilla = fix.ts; }
    } else if (o.rorelseSedan == null) ny.rorelseSedan = fix.ts;
    const lamnat = !inne && ny.utanforSedan != null && (fix.ts - ny.utanforSedan) / 1000 >= LOSSNING.LAMNAT_S;
    const kortIvag = ny.rorelseSedan != null && (fix.ts - ny.rorelseSedan) / 1000 >= LOSSNING.RORELSE_SLUT_S;
    if (lamnat || kortIvag) {
      return {
        state: { ...st, oppen: null, slut: { ts: ny.sistStilla, avlaggId: ny.avlaggId } },
        handelse: { typ: 'lossning_slut', ts: fix.ts, lassTs: ny.ts, stillaS: ny.stillaS, manuell: ny.manuell, avlaggId: ny.avlaggId },
      };
    }
    return { state: { ...st, oppen: ny }, handelse: null };
  }

  const traff = traffaAvlagg(fix, ctx.avlagg);
  const still = spannS >= LOSSNING.STILLA_S - 2 && utbredning(fonster) <= LOSSNING.STILLA_UTBREDNING_M;
  // En lossning (eller en upprepning) utlöses en gång per stillastående: flaggan nollställs först när maskinen rört sig mer än rutan.
  if (!still && (st.lossningUtlost || st.fragaUtlost) && utbredning(fonster) > LOSSNING.STILLA_UTBREDNING_M) st = { ...st, lossningUtlost: false, fragaUtlost: false };

  // 2) Lossning: stilla i 3 min inom zonen, och ingen lossning pågår redan.
  if (traff.narmaste && still && !st.lossningUtlost) {
    const start = fonster[0].ts;
    const iCykel = !!st.slut && start < st.slut.ts + LOSSNING.CYKEL_S * 1000;
    let lossning: LossningsTyp = 'nytt_lass';
    if (iCykel) lossning = st.senaste?.avlaggId === traff.narmaste.id ? 'upprepning' : 'ny_del';
    if (lossning === 'upprepning') {
      return { state: { ...st, lossningUtlost: true }, handelse: { typ: 'lossning', lossning, ts: start, lat: fix.lat, lng: fix.lng, traff } };
    }
    return {
      state: {
        ...st, lossningUtlost: true,
        senaste: { lat: fix.lat, lng: fix.lng, ts: start, avlaggId: traff.narmaste.id },
        oppen: { ts: start, lat: fix.lat, lng: fix.lng, avlaggId: traff.narmaste.id, stillaS: LOSSNING.STILLA_S, sistInnanfor: fix.ts, sistStilla: fix.ts, rorelseSedan: null, utanforSedan: null, manuell: false },
      },
      handelse: { typ: 'lossning', lossning, ts: start, lat: fix.lat, lng: fix.lng, traff },
    };
  }

  // 3) "Nytt avlägg här?" — långt stopp utanför alla avlägg, bort från skördarens spår och från förra lossningen.
  if (!traff.narmaste && !st.fragaUtlost && ctx.avstandTillSpar != null && ctx.avstandTillSpar >= LOSSNING.NYTT_AVLAGG_FRAN_SPAR_M) {
    const f90 = sedan(fonster, fix.ts - LOSSNING.NYTT_AVLAGG_STILLA_S * 1000);
    if ((fix.ts - f90[0].ts) / 1000 >= LOSSNING.NYTT_AVLAGG_STILLA_S - 2 && utbredning(f90) <= LOSSNING.PAUS_UTBREDNING_M
        && (!st.senaste || avstand(fix, st.senaste) >= LOSSNING.NYTT_AVLAGG_FRAN_FORRA_M)
        && !st.avvisadeFragor.some((p) => avstand(p, fix) <= LOSSNING.FRAGA_SPARR_M)) {
      return { state: { ...st, fragaUtlost: true }, handelse: { typ: 'nytt_avlagg_fraga', ts: f90[0].ts, lat: fix.lat, lng: fix.lng } };
    }
  }

  return { state: st, handelse: null };
}

/** Föraren valde ett annat avlägg än det närmaste: nästa jämförelse ("samma avlägg igen?") och zonen ska gå mot det valda. */
export function sattSenasteAvlagg(s: DetektorState, avlaggId: string | null): DetektorState {
  return {
    ...s,
    senaste: s.senaste ? { ...s.senaste, avlaggId } : s.senaste,
    oppen: s.oppen ? { ...s.oppen, avlaggId } : s.oppen,
    slut: s.slut ? { ...s.slut, avlaggId } : s.slut,
  };
}

/** Föraren svarade Nej på "Nytt avlägg här?" — fråga inte om samma plats igen. */
export function avvisaFraga(s: DetektorState, plats: LatLng): DetektorState {
  return { ...s, avvisadeFragor: [...s.avvisadeFragor, { lat: plats.lat, lng: plats.lng }] };
}

/** Föraren skapade ett nytt avlägg på platsen (Ja): lossningen börjar där (nytt lass, eller del 2 om förra lossningen just tog slut). */
export function lossningVidNyttAvlagg(s: DetektorState, plats: DetektorFix, avlaggId: string): { state: DetektorState; lossning: LossningsTyp } {
  const iCykel = !!s.slut && plats.ts < s.slut.ts + LOSSNING.CYKEL_S * 1000;
  const lossning: LossningsTyp = iCykel ? 'ny_del' : 'nytt_lass';
  return {
    state: {
      ...s, lossningUtlost: true,
      senaste: { lat: plats.lat, lng: plats.lng, ts: plats.ts, avlaggId },
      oppen: { ts: plats.ts, lat: plats.lat, lng: plats.lng, avlaggId, stillaS: 0, sistInnanfor: plats.ts, sistStilla: plats.ts, rorelseSedan: null, utanforSedan: null, manuell: false },
    },
    lossning,
  };
}

/** "Lossa här": föraren trycker. Alltid ett nytt lass vid avlägget (reservknappen för när upptäckten missar — cykelregeln gäller inte), och lossningen räknas som öppen. */
export function lossningManuell(s: DetektorState, plats: DetektorFix, avlaggId: string): DetektorState {
  return {
    ...s, lossningUtlost: true,
    senaste: { lat: plats.lat, lng: plats.lng, ts: plats.ts, avlaggId },
    oppen: { ts: plats.ts, lat: plats.lat, lng: plats.lng, avlaggId, stillaS: 0, sistInnanfor: plats.ts, sistStilla: plats.ts, rorelseSedan: null, utanforSedan: null, manuell: true },
  };
}

/** Provkörning i testläget: maskinen "kör ut ur zonen" — samma slut som när den lämnat avlägget på riktigt. */
export function slutaOppenLossning(s: DetektorState, ts: number, stillaS: number): { state: DetektorState; handelse: SlutHandelse | null } {
  const o = s.oppen;
  if (!o) return { state: s, handelse: null };
  return {
    state: { ...s, oppen: null, slut: { ts: o.sistStilla, avlaggId: o.avlaggId } },
    handelse: { typ: 'lossning_slut', ts, lassTs: o.ts, stillaS: Math.max(o.stillaS, stillaS), manuell: o.manuell, avlaggId: o.avlaggId },
  };
}
