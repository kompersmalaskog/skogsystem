// Noteringarna på rundvyns karta: features, lager och riktningen på en pil. Rent — kartan själv (RundKarta) lägger till dem.
//
// LAGRENS ID börjar på ek-n- (noteringar) och ek-r- (ritningen medan man ritar). ALDRIG ek-p-: det prefixet är kontrollpunkterna, som kartan
// frågar efter vid ett tryck. Noteringarna frågas efter för sig (noteringLagerIdn), och ritningen går aldrig att trycka på.
//
// ORDNINGEN: linjer, punkter och pilspetsar ligger ovanpå planens vägar och hyttspåren (8a) men under kontrollpunkternas nummer — en rättelse
// ska ligga över det uppmätta, inte dölja vilken punkt det gäller. Etiketterna ligger överst: de ska kunna läsas.

import { mittpunktPaLinje, type Feature } from './egenkontrollkarta';
import type { Notering, NoteringAvsikt } from './egenkontrollNotering';
import { NOTERING_FARG, NOTERING_KANT, noteringBildId, noteringPilBildId } from './egenkontrollNoteringBild';
import { zoomKurva } from './kartstil';

export const NOTERING_KALLA = 'ek-noteringar';
export const RITNING_KALLA = 'ek-ritning';

const AVSIKTER: NoteringAvsikt[] = ['blev', 'skulle'];

/** Pilspetsens vinkel, grader medsols från norr: riktningen på sista delsträckan. null = ingen riktning (en enda punkt, eller två på samma plats). */
export function pilVinkelGrader(koord: [number, number][]): number | null {
  if (koord.length < 2) return null;
  for (let i = koord.length - 1; i >= 1; i--) {
    const [lng1, lat1] = koord[i - 1];
    const [lng2, lat2] = koord[i];
    const dx = (lng2 - lng1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    const dy = lat2 - lat1;
    if (dx === 0 && dy === 0) continue;
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }
  return null;
}

/**
 * Kartnoteringarna som features. En punkt: en punkt + etiketten på den. En linje: linjen + etiketten mitt på den. En pil: som en linje + en
 * pilspets i slutet. Alla bär kind='notering' och noteringens id, så ett tryck på vilken del som helst väljer noteringen.
 * Fotonoteringar (9b) hör inte hit.
 */
export function noteringFeatures(lista: Notering[]): Feature[] {
  const ut: Feature[] = [];
  for (const n of lista) {
    if (n.underlag !== 'karta' || n.koordinater.length === 0) continue;
    const bas = { kind: 'notering', id: n.id, avsikt: n.avsikt };
    if (n.typ === 'punkt') {
      ut.push({ type: 'Feature', properties: { ...bas, form: 'punkt' }, geometry: { type: 'Point', coordinates: n.koordinater[0] } });
    } else {
      ut.push({ type: 'Feature', properties: { ...bas, form: 'linje' }, geometry: { type: 'LineString', coordinates: n.koordinater } });
      const v = n.pil ? pilVinkelGrader(n.koordinater) : null;
      if (v !== null) {
        ut.push({ type: 'Feature', properties: { ...bas, form: 'pilspets', vinkel: v }, geometry: { type: 'Point', coordinates: n.koordinater[n.koordinater.length - 1] } });
      }
    }
    const plats = n.typ === 'punkt' ? n.koordinater[0] : mittpunktPaLinje(n.koordinater);
    if (plats) {
      ut.push({
        type: 'Feature',
        properties: { ...bas, form: 'etikett', bild: noteringBildId(n.etikett, n.avsikt) },
        geometry: { type: 'Point', coordinates: plats },
      });
    }
  }
  return ut;
}

/** Ritningen medan den pågår: linjen genom trycken (om minst två) och en punkt per tryck. */
export function ritningFeatures(tryck: [number, number][]): Feature[] {
  const ut: Feature[] = tryck.map((c, i) => ({
    type: 'Feature', properties: { form: 'tryck', senaste: i === tryck.length - 1 }, geometry: { type: 'Point', coordinates: c },
  }));
  if (tryck.length >= 2) ut.unshift({ type: 'Feature', properties: { form: 'linje' }, geometry: { type: 'LineString', coordinates: tryck } });
  return ut;
}

const LINJE_BREDD = zoomKurva([[10, 2], [14, 3], [18, 4]]);
const KANT_BREDD = zoomKurva([[10, 4.5], [14, 6], [18, 7.5]]);
const STRECK: number[] = [2, 1.5];

/** Lagren som tänds och släcks med "Noteringar" i lagermenyn — linjerna, punkterna och pilspetsarna. */
export function noteringLinjeLager(): any[] {
  const lager: any[] = [];
  for (const avsikt of AVSIKTER) {
    const filter = ['all', ['==', ['get', 'form'], 'linje'], ['==', ['get', 'avsikt'], avsikt]];
    const skulle = avsikt === 'skulle';
    lager.push({
      id: `ek-n-linje-kant-${avsikt}`, type: 'line', source: NOTERING_KALLA, filter,
      layout: { 'line-join': 'round', 'line-cap': 'butt' },
      // Kanten är alltid heldragen: den streckade linjen ligger ovanpå och visar sina hål mot kanten, inte mot flygfotot.
      paint: { 'line-color': NOTERING_KANT, 'line-width': KANT_BREDD, 'line-opacity': 0.9 },
    });
    lager.push({
      id: `ek-n-linje-${avsikt}`, type: 'line', source: NOTERING_KALLA, filter,
      layout: { 'line-join': 'round', 'line-cap': skulle ? 'butt' : 'round' },
      paint: {
        'line-color': NOTERING_FARG[avsikt], 'line-width': LINJE_BREDD,
        ...(skulle ? { 'line-dasharray': STRECK } : {}),
      },
    });
  }
  for (const avsikt of AVSIKTER) {
    const skulle = avsikt === 'skulle';
    lager.push({
      id: `ek-n-punkt-${avsikt}`, type: 'circle', source: NOTERING_KALLA,
      filter: ['all', ['==', ['get', 'form'], 'punkt'], ['==', ['get', 'avsikt'], avsikt]],
      paint: {
        // blev = fylld punkt, skulle = ring: formen skiljer, färgen förstärker bara.
        'circle-radius': 7,
        'circle-color': skulle ? NOTERING_FARG.skulle : NOTERING_FARG.blev,
        'circle-opacity': skulle ? 0 : 1,
        'circle-stroke-color': skulle ? NOTERING_FARG.skulle : NOTERING_KANT,
        'circle-stroke-width': skulle ? 3.5 : 2,
        'circle-pitch-alignment': 'viewport',
      },
    });
  }
  lager.push({
    id: 'ek-n-pilspets', type: 'symbol', source: NOTERING_KALLA,
    filter: ['==', ['get', 'form'], 'pilspets'],
    layout: {
      'icon-image': ['concat', 'ek-notering-pil:', ['get', 'avsikt']],
      'icon-rotate': ['get', 'vinkel'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1,
    },
  });
  return lager;
}

/** Etiketterna: överst, alltid ritade (få och korta; en etikett som MapLibre döljer vore en notering man inte ser). */
export function noteringEtikettLager(): any[] {
  return [{
    id: 'ek-n-etikett', type: 'symbol', source: NOTERING_KALLA,
    filter: ['==', ['get', 'form'], 'etikett'],
    layout: {
      'icon-image': ['get', 'bild'], 'icon-anchor': 'bottom-left', 'icon-offset': [8, -8],
      'icon-allow-overlap': true, 'icon-ignore-placement': true,
    },
  }];
}

export function noteringLagerIdn(): string[] {
  return [...noteringLinjeLager(), ...noteringEtikettLager()].map((l) => l.id as string);
}

/** Ritningen medan man ritar: en vit linje med mörk kant och en punkt per tryck (senaste större). Inte tryckbar. */
export function ritningLager(): any[] {
  return [
    {
      id: 'ek-r-linje-kant', type: 'line', source: RITNING_KALLA, filter: ['==', ['get', 'form'], 'linje'],
      layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': NOTERING_KANT, 'line-width': KANT_BREDD, 'line-opacity': 0.9 },
    },
    {
      id: 'ek-r-linje', type: 'line', source: RITNING_KALLA, filter: ['==', ['get', 'form'], 'linje'],
      layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': NOTERING_FARG.blev, 'line-width': LINJE_BREDD },
    },
    {
      id: 'ek-r-tryck', type: 'circle', source: RITNING_KALLA, filter: ['==', ['get', 'form'], 'tryck'],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'senaste'], true], 8, 5.5], 'circle-color': NOTERING_FARG.blev,
        'circle-stroke-color': NOTERING_KANT, 'circle-stroke-width': 2, 'circle-pitch-alignment': 'viewport',
      },
    },
  ];
}

export function ritningLagerIdn(): string[] {
  return ritningLager().map((l) => l.id as string);
}

/** Bilderna kartan behöver för en lista: etikettens id → [text, avsikt] (en per unik text), plus pilspetsarnas id. */
export function noteringBilder(lista: Notering[]): { etiketter: { id: string; etikett: string; avsikt: NoteringAvsikt }[]; pilar: { id: string; avsikt: NoteringAvsikt }[] } {
  const sett = new Map<string, { id: string; etikett: string; avsikt: NoteringAvsikt }>();
  for (const n of lista) {
    if (n.underlag !== 'karta') continue;
    const id = noteringBildId(n.etikett, n.avsikt);
    if (!sett.has(id)) sett.set(id, { id, etikett: n.etikett, avsikt: n.avsikt });
  }
  return { etiketter: Array.from(sett.values()), pilar: AVSIKTER.map((avsikt) => ({ id: noteringPilBildId(avsikt), avsikt })) };
}
