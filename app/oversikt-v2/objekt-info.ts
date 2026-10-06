// Det objekt-arket i /oversikt-v2 visar om ett objekt, som ren logik (Node-importerbar, testas i objekt-info.test.ts):
// planerarens faror och hänsyn MED kommentar, bärighet och markägarens telefon. Allt kommer ur planeringen — här läses det bara.

import { classifyMarkering, markeringSub, SUB_LABEL, prettifySub } from '../oversikt/markeringar';

/** En fara eller hänsyn: namnet (Kraftledning, Fornlämning …) och planerarens beskrivning (data.comment) om den finns. */
export interface Varning { label: string; kommentar: string | null }
export interface ObjWarn { faror: Varning[]; hansyn: Varning[] }
export interface MarkeringRow { objekt_id: string | null; typ: string | null; data: any }

const sv = (a: string, b: string) => a.localeCompare(b, 'sv');

/** planering_markeringar → faror och hänsyn per objekt, ALLA (inte bara första), var och en med planerarens kommentar.
 *  Övriga markeringar (vägar, avlägg …) hör inte hit. Samma namn med samma kommentar slås ihop; samma namn med OLIKA
 *  kommentarer är olika faror och visas var för sig. Sorterat så att listan inte byter ordning mellan laddningar
 *  (raderna kommer utan ORDER BY). */
export function byggVarningar(rows: MarkeringRow[]): Record<string, ObjWarn> {
  const byObj: Record<string, ObjWarn> = {};
  const sedda = new Set<string>();
  for (const m of rows) {
    if (!m.objekt_id) continue;
    const niva = classifyMarkering(m.data);
    if (niva !== 'fara' && niva !== 'hansyn') continue;
    const sub = markeringSub(m.data);
    const label = sub ? (SUB_LABEL[sub] || prettifySub(sub)) : 'Markering';
    const c = m.data?.comment;
    const kommentar = typeof c === 'string' && c.trim() ? c.trim() : null;
    const nyckel = `${m.objekt_id}|${niva}|${label}|${kommentar ?? ''}`;
    if (sedda.has(nyckel)) continue;
    sedda.add(nyckel);
    (byObj[m.objekt_id] ||= { faror: [], hansyn: [] })[niva === 'fara' ? 'faror' : 'hansyn'].push({ label, kommentar });
  }
  for (const w of Object.values(byObj)) {
    const ordna = (a: Varning, b: Varning) => sv(a.label, b.label) || sv(a.kommentar ?? '', b.kommentar ?? '');
    w.faror.sort(ordna); w.hansyn.sort(ordna);
  }
  return byObj;
}

/** objekt.barighet (sätts i planeringen: bra · medel · dalig) som ord för raden "Bärighet". Okänt värde visas som det står;
 *  tomt → null (raden visar '–'). `begransning` = dålig bärighet, den enda som är en begränsning. */
export function barighetText(barighet: string | null | undefined): { text: string; begransning: boolean } | null {
  const b = (barighet ?? '').trim();
  if (!b) return null;
  const k = b.toLowerCase();
  if (k === 'bra' || k === 'god') return { text: 'Bra', begransning: false };
  if (k === 'medel' || k === 'normal') return { text: 'Medel', begransning: false };
  if (k === 'dalig' || k === 'dålig') return { text: 'Dålig', begransning: true };
  return { text: b.charAt(0).toUpperCase() + b.slice(1), begransning: false };
}

/** Markägarens telefonnummer rensat för tel: och sms: — bara siffror och ett inledande + (mellanslag och bindestreck stör vissa
 *  telefoner). Tar FÖRSTA nummer-liknande biten: ett andra nummer eller text efter ett / , ; lämnas, så att
 *  "070-123 45 67 / 0478-123 45" aldrig blir ett hopskarvat nummer. "+46 (0)70 …" tappar den överflödiga (0). Färre än 6 siffror
 *  ("Ring Anders", "-", "17") ger null — hellre ingen knapp än en som ringer eller skickar fel. */
export function telNummer(tel: string | null | undefined): string | null {
  const m = (tel ?? '').match(/\+?\d[\d\s().-]*/);
  if (!m) return null;
  const bit = m[0].replace(/^(\+\d{1,3})\s*\(0\)/, '$1');
  const nummer = (bit.charAt(0) === '+' ? '+' : '') + bit.replace(/\D/g, '');
  return nummer.replace(/\D/g, '').length >= 6 ? nummer : null;
}

/** Markägarens telefonnummer som tel:-länk (null → ingen Ring-knapp). */
export function telHref(tel: string | null | undefined): string | null {
  const nummer = telNummer(tel);
  return nummer ? `tel:${nummer}` : null;
}
