// SMS till markägaren — ren logik (Node-importerbar, testas i sms.test.ts). Appen skickar ALDRIG något: knappen är en sms:-länk
// som öppnar telefonens egen sms-app med färdig text. Föraren läser, ändrar om hen vill, och trycker själv på skicka.
//
// Texten är beställd ord för ord (Martin 2026-10-06). Tre variabler: förnamnet (den inloggade), maskinen (den vars ark man kom
// från — "maskinen" när objektet öppnats direkt från kartan) och objektets namn (utan VO-nummer och årssuffix när det går).

import { telNummer } from './objekt-info';

export type MaskinOrd = 'skördaren' | 'skotaren' | 'maskinen';

/** Maskinen som ordet i texten: skördare → "skördaren", skotare → "skotaren", ingen maskin vald → "maskinen". */
export function maskinOrd(typ: 'skordare' | 'skotare' | null | undefined): MaskinOrd {
  return typ === 'skotare' ? 'skotaren' : typ === 'skordare' ? 'skördaren' : 'maskinen';
}

/** Förnamnet ur medarbetare.namn: första ordet ("Anna-Lisa Svensson" → "Anna-Lisa"); "Svensson, Anna" → "Anna". Tomt → null. */
export function forstaNamn(namn: string | null | undefined): string | null {
  const s = (namn ?? '').trim();
  if (!s) return null;
  const ord = (s.indexOf(',') >= 0 ? s.slice(s.indexOf(',') + 1) : s).trim().split(/\s+/)[0] ?? '';
  return ord.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, '') || null;
}

/** Objektets namn som en markägare vill läsa det: utan VO-/kontraktsnummer och utan årssuffix ("… A-A -25" → "… A-A").
 *  Allt annat lämnas som det är — "om det går att städa snyggt, annars som det är": blir resultatet tomt returneras originalet. */
export function rensaObjektnamn(namn: string | null | undefined, voNummer?: string | null): string {
  const original = (namn ?? '').replace(/\s+/g, ' ').trim();
  const vo = (voNummer ?? '').trim().toLowerCase();
  const utanRam = (t: string) => t.replace(/^[([]+|[)\],.:;]+$/g, '');
  const arVoOrd = (t: string) => /^VO(?:-?nr\.?|-?nummer)?:?$/i.test(t);
  // Ett nummer att ta bort: objektets eget vo_nummer, ett VO-prefix med nummer ("VO11251460"), eller ett långt rent tal (≥ 5 siffror —
  // aldrig ett år, aldrig en fastighetsbeteckning som 1:23).
  const arNummer = (t: string) => { const r = utanRam(t); return (vo.length >= 3 && r.toLowerCase() === vo) || /^VO[-:]?\d{3,}$/i.test(r) || /^\d{5,}$/.test(r); };
  const ut: string[] = [];
  for (const t of original.split(' ')) {
    if (arNummer(t)) { if (ut.length && arVoOrd(ut[ut.length - 1])) ut.pop(); continue; }
    ut.push(t);
  }
  // Årssuffixet "-25" / "- 25" / "-2025" sist i namnet (2024–2029). Andra tal efter ett bindestreck ("5-10", "-20") är inga år.
  const rent = ut.join(' ').replace(/\s*-\s*(?:202[4-9]|2[4-9])$/, '').replace(/^[\s,:;-]+|[\s,:;-]+$/g, '');
  return rent || original;
}

/** Hela texten. Utan känt förnamn (ska inte hända — alla medarbetare har ett namn) skriver den som företaget i stället för med en tom plats. */
export function smsText(a: { fornamn: string | null; maskin: MaskinOrd; objektnamn: string }): string {
  const vem = a.fornamn ? `${a.fornamn} här från Kompersmåla Skog` : 'Det här är Kompersmåla Skog';
  return `Hej! ${vem}. Vi kommer med ${a.maskin} till ${a.objektnamn} i morgon. Undrar du något, ring mig på det här numret. Vill du komma ut och titta? Hör av dig först, så möts vi på säkert avstånd från maskinen. Hälsningar ${a.fornamn ?? 'Kompersmåla Skog'}`;
}

/** iPhone/iPod/iPad — även en iPad som utger sig för att vara en Mac (iPadOS 13+: "Macintosh" + pekskärm). */
export function arIos(userAgent: string, maxTouchPoints: number = 0): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** sms:-länken: numret + förifylld text, URL-kodad (åäö, mellanslag, frågetecken, & och # kodas — annars klipps texten av).
 *  Skiljetecknet före body skiljer: iOS vill ha "&", Android "?". Inget nummer → ingen länk (knappen visas inte). */
export function smsHref(tel: string | null | undefined, text: string, ios: boolean): string | null {
  const nummer = telNummer(tel);
  return nummer ? `sms:${nummer}${ios ? '&' : '?'}body=${encodeURIComponent(text)}` : null;
}
