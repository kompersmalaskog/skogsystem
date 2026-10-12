// LÖPANDE AVSTÄMNING: står maskinen i ett ANNAT objekts traktgräns än det som är öppet?
//
// Regel (Martin, efter Oskars fältfel i Rottne 2026-10-07): en FÄRSK, GILTIG fix inne i ett annat objekts traktgräns ska ALLTID leda till byte (eller
// bekräftelsekortet) inom en minut, oavsett vad enheten minns. Förut gjordes avstämningen EN gång mot första fixen (A4) och stängdes sedan av — en
// tom/felande kandidatladdning, eller att första utvärderingen råkade ske mot fel underlag, gjorde att maskinen stod kvar på fel objekt resten av dagen
// (377 hyttspårspunkter på Älmehult medan maskinen stod i Trestensdal).
//
// Nu körs beslutet på VARJE fix. Rent beslut — inga sidoeffekter, ingen klocka (anroparen ger `nu`), testbart mot Oskars riktiga punkter.
//
//   • står maskinen INNE i det öppna objektets traktgräns → ingenting (det är rätt objekt, även om ett annat överlappar)
//   • annars: vilket kandidatobjekt innehåller positionen? (valjObjektForPosition: tilldelat → status → typ → minsta yta)
//   • samma annat objekt måste vara träff under AVSTAMNING_HALL_MS och AVSTAMNING_MIN_FIXAR fixar i följd — annars är det GPS-fladder vid en gräns
//   • tilldelat denna maskin → 'byt' (planerarens uttryckliga instruktion; tyst byte med notis)
//   • ej tilldelat → 'fraga' (bekräftelsekortet: systemet föreslår, föraren godkänner). Redan frågat om just det objektet denna session → 'inget'
//     (ett nej ska aldrig bli en ny fråga var tionde sekund, och ett avböjt kort ska aldrig överstyras tyst)

import { arTilldelad, objektTraffPunkt, valjObjektForPosition, type ObjektForVal } from './objektPlats';

/** Samma annat objekt ska vara träff så här länge innan vi frågar/byter. 10 s + 1 Hz-fixar = besked ≈ 11 s, långt under minuten. */
export const AVSTAMNING_HALL_MS = 10_000;
/** …och under minst så här många fixar (skydd mot en enstaka avvikande fix). */
export const AVSTAMNING_MIN_FIXAR = 3;

export interface AvstamningsMinne {
  annatId: string | null;   // objektet positionen ligger i (≠ öppet objekt)
  sedanMs: number | null;   // när det blev träff första gången i en obruten följd
  antal: number;            // antal fixar i följd
}
export const NYTT_AVSTAMNINGSMINNE: AvstamningsMinne = { annatId: null, sedanMs: null, antal: 0 };

export type AvstamningsAtgard = 'inget' | 'fraga' | 'byt';
export type AvstamningsSkal = 'inget-oppet-objekt' | 'inne-i-oppet-objekt' | 'ingen-traff' | 'redan-fragat' | 'vantar' | 'tilldelad' | 'fraga';

export function stegaAvstamning(a: {
  minne: AvstamningsMinne;
  nu: number;                                   // ms (valfri klocka, bara skillnader används)
  pos: { lat: number; lng: number };            // en FÄRSK, GILTIG fix — anroparen skickar aldrig sparad/gammal position hit
  oppetObjektId: string | null;
  maskinId: string;
  kandidater: ObjektForVal[];                   // planerade/pågående objekt med geometri (lib/objektKandidater)
  redanFragat: (objektId: string) => boolean;
}): { minne: AvstamningsMinne; atgard: AvstamningsAtgard; traff: ObjektForVal | null; skal: AvstamningsSkal } {
  const nollat = (skal: AvstamningsSkal) => ({ minne: NYTT_AVSTAMNINGSMINNE, atgard: 'inget' as const, traff: null, skal });
  if (!a.oppetObjektId) return nollat('inget-oppet-objekt');
  const oppet = a.kandidater.find((o) => o.id === a.oppetObjektId);
  // "Inne i" = innanför traktgränsen, eller (objekt utan gräns, t.ex. ett jobb från Starta jobb) inom 300 m från dess punkt.
  if (oppet && objektTraffPunkt(oppet, a.pos.lat, a.pos.lng)) return nollat('inne-i-oppet-objekt');
  // Det öppna objektet kan inte bli träff här: innehöll det punkten hade vi returnerat ovan.
  const traff = valjObjektForPosition({ lat: a.pos.lat, lng: a.pos.lng, maskinId: a.maskinId, objekt: a.kandidater }).traff;
  if (!traff) return nollat('ingen-traff');

  const samma = a.minne.annatId === traff.id;
  const minne: AvstamningsMinne = samma
    ? { annatId: traff.id, sedanMs: a.minne.sedanMs ?? a.nu, antal: a.minne.antal + 1 }
    : { annatId: traff.id, sedanMs: a.nu, antal: 1 };
  const tilldelad = arTilldelad(traff, a.maskinId);
  if (!tilldelad && a.redanFragat(traff.id)) return { minne, atgard: 'inget', traff, skal: 'redan-fragat' };
  if (a.nu - (minne.sedanMs ?? a.nu) < AVSTAMNING_HALL_MS || minne.antal < AVSTAMNING_MIN_FIXAR) return { minne, atgard: 'inget', traff, skal: 'vantar' };
  return tilldelad
    ? { minne, atgard: 'byt', traff, skal: 'tilldelad' }
    : { minne, atgard: 'fraga', traff, skal: 'fraga' };
}
