import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { antalFaror, brandRadText, byggOmGrupper, dagText, listText, omGrupp, omNamn, typRadText, type MiljoIn } from './omTrakten';
import type { KartMarkering } from './objektKort';

const M = (o: Partial<KartMarkering> & { id: string }): KartMarkering => ({ slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', comment: '', lat: null, lng: null, skapad: null, ordning: 0, ...o });
const bv = (o: Partial<KartMarkering> & { id: string }) => M({ slag: 'linje', typ: 'mainRoad', namn: 'Basväg', ...o });

describe('grupper: Faror · Från Vida · Hänsyn · Vägar · Övrigt', () => {
  it('faror och vägar som förut; naturvård OCH kultur hör ihop under Hänsyn; resten är Övrigt', () => {
    const g = (slag: any, typ: string) => omGrupp({ slag, typ });
    for (const t of ['warning', 'powerline', 'windfall']) expect(g('symbol', t)).toBe('faror');
    expect(g('zon', 'noentry')).toBe('faror');
    for (const t of ['highstump', 'eternitytree', 'naturecorner', 'culturemonument', 'culturestump']) expect(g('symbol', t)).toBe('hansyn');
    for (const t of ['nature', 'stonewall']) expect(g('linje', t)).toBe('hansyn');
    for (const t of ['protected', 'culture', 'fornlamning']) expect(g('zon', t)).toBe('hansyn');
    for (const t of ['road', 'bridge', 'turningpoint', 'corduroy', 'trail']) expect(g('symbol', t)).toBe('vagar');
    for (const t of ['mainRoad', 'sideRoadRed', 'backRoadYellow']) expect(g('linje', t)).toBe('vagar');
    for (const t of ['manualfelling', 'landing', 'brashpile', 'wet', 'steep', 'felloutside']) expect(g('symbol', t)).toBe('ovrigt');
    expect(g('linje', 'ditch')).toBe('ovrigt');
    expect(g('zon', 'wet')).toBe('ovrigt');
  });

  it('ordningen är Faror, Hänsyn, Vägar, Övrigt; tomma grupper finns inte', () => {
    const ms = [M({ id: 'a', slag: 'symbol', typ: 'manualfelling', namn: 'Manuell fällning' }), bv({ id: 'b' }), M({ id: 'c', typ: 'warning', namn: 'Varning' }), M({ id: 'd', typ: 'culturemonument', namn: 'Kulturminne' })];
    expect(byggOmGrupper(ms, null, null).map((g) => g.grupp)).toEqual(['faror', 'hansyn', 'vagar', 'ovrigt']);
    expect(byggOmGrupper([bv({ id: 'b' })], null, null).map((g) => g.grupp)).toEqual(['vagar']);
    expect(byggOmGrupper([], null, null)).toEqual([]);
  });
});

describe('EN rad per typ', () => {
  const rader = (ms: KartMarkering[], miljo: MiljoIn[] | null = null, ytor: string[] = []) => byggOmGrupper(ms, null, miljo, ytor).flatMap((g) => g.rader);
  const text = (ms: KartMarkering[], miljo: MiljoIn[] | null = null, ytor: string[] = []) => rader(ms, miljo, ytor).map(typRadText);

  it('alla markeringar får en rad — med eller utan kommentar och foto: "Stenmur · 1 st", "Kulturminne · 1 st", "Manuell fällning · 2 st"', () => {
    expect(text([
      M({ id: '1', slag: 'linje', typ: 'stonewall', namn: 'Stenmur' }),
      M({ id: '2', typ: 'culturemonument', namn: 'Kulturminne', comment: 'Stenrös', photoPath: 'a.jpg' }),
      M({ id: '3', typ: 'manualfelling', namn: 'Manuell fällning' }), M({ id: '4', typ: 'manualfelling', namn: 'Manuell fällning', comment: 'Brant' }),
    ]).sort()).toEqual(['Kulturminne · 1 st', 'Manuell fällning · 2 st', 'Stenmur · 1 st']);
  });

  it('väg-symboler med kort kommentar får en rad per kommentar ("Röd väg · 3 st", "Gul väg · 2 st"), stor/liten bokstav och mellanslag spelar ingen roll', () => {
    const r = text([
      M({ id: '1', typ: 'road', namn: 'Väg', comment: 'Röd väg' }), M({ id: '2', typ: 'road', namn: 'Väg', comment: 'röd väg ' }), M({ id: '3', typ: 'road', namn: 'Väg', comment: 'Röd  väg' }),
      M({ id: '4', typ: 'road', namn: 'Väg', comment: 'Gul väg' }), M({ id: '5', typ: 'road', namn: 'Väg', comment: 'Gul väg' }),
    ]);
    expect(r).toEqual(['Röd väg · 3 st', 'Gul väg · 2 st']);
  });
  it('en väg-symbol med lång kommentar, med foto eller utan kommentar är bara "Väg"', () => {
    const r = text([M({ id: '1', typ: 'road', namn: 'Väg', comment: 'Är det smalt på vägen in här så akta' }), M({ id: '2', typ: 'road', namn: 'Väg' }), M({ id: '3', typ: 'road', namn: 'Väg', comment: 'Röd väg', photoPath: 'a.jpg' })]);
    expect(r).toEqual(['Väg · 3 st']);
  });

  it('basväg: antal och summerad längd — "Basväg · 3 st · 905 m"; saknas längden på någon står bara antalet (aldrig en för låg summa)', () => {
    expect(text([bv({ id: '1', langdM: 640 }), bv({ id: '2', langdM: 260 }), bv({ id: '3', langdM: 5 })])).toEqual(['Basväg · 3 st · 905 m']);
    expect(text([bv({ id: '1', langdM: 640 }), bv({ id: '2', langdM: null })])).toEqual(['Basväg · 2 st']);
  });
  it('basvägarna slås ihop till EN rad oavsett färg och kommentar, längst först i raden', () => {
    const [r] = rader([bv({ id: 'a', langdM: 100, farg: 'red', comment: 'Röd väg' }), bv({ id: 'b', langdM: 500 }), bv({ id: 'c', langdM: 300, farg: 'yellow' })]);
    expect(r.markeringar.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
  it('under Vägar står basvägen först, sedan flest först', () => {
    const g = byggOmGrupper([M({ id: '1', typ: 'road', namn: 'Väg', comment: 'Röd väg' }), M({ id: '2', typ: 'road', namn: 'Väg', comment: 'Röd väg' }), bv({ id: '3', langdM: 10 })], null, null).find((x) => x.grupp === 'vagar')!;
    expect(g.rader.map((r) => r.namn)).toEqual(['Basväg', 'Röd väg']);
  });

  it('högstubbar/evighetsträd: kravet utskrivet — "3 av 11 markerade"; uppfyllt "11 av 11 markerade" med uppfyllt-flagga; naturhörna räknas som evighetsträd', () => {
    const ms = [M({ id: 'h1' }), M({ id: 'e1', typ: 'eternitytree', namn: 'Evighetsträd' }), M({ id: 'n1', typ: 'naturecorner', namn: 'Naturhörna' })];
    const miljo: MiljoIn[] = [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 3, krav: 11, uppfyllt: false }, { id: 'evighetstrad', namn: 'Evighetsträd', antal: 11, krav: 11, uppfyllt: true }];
    const r = rader(ms, miljo);
    expect(r.map(typRadText)).toEqual(['Högstubbar · 3 av 11 markerade', 'Evighetsträd · 11 av 11 markerade']);
    expect(r.map((x) => x.miljo?.uppfyllt)).toEqual([false, true]);
    expect(r[1].markeringar.map((m) => m.id)).toEqual(['e1', 'n1']);   // naturhörnan ligger i evighetsträdens rad
  });
  it('utan krav (ej certifierat): antalet satta, med `antal` per symbol — "Högstubbar · 53 st" (inte 21 markeringar)', () => {
    const ms = [M({ id: 'h1', antal: 50 }), M({ id: 'h2', antal: 3 }), M({ id: 'h3' })];
    expect(text(ms, [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 54, krav: null, uppfyllt: false }])).toEqual(['Högstubbar · 54 st']);
    // och utan räknare alls (sökning): summan av antal i träffarna
    expect(text(ms, null)).toEqual(['Högstubbar · 54 st']);
  });
  it('certifierat men inget satt: raden finns ändå med "0 av 11 markerade"', () => {
    expect(text([], [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 0, krav: 11, uppfyllt: false }])).toEqual(['Högstubbar · 0 av 11 markerade']);
    expect(text([], [{ id: 'hogstubbar', namn: 'Högstubbar', antal: 0, krav: null, uppfyllt: false }])).toEqual([]);   // inget krav och inget satt: ingen rad
  });
  it('högstubbar och evighetsträd står först under Hänsyn', () => {
    const g = byggOmGrupper([M({ id: 'k', typ: 'culturemonument', namn: 'Kulturminne' }), M({ id: 'k2', typ: 'culturemonument', namn: 'Kulturminne' }), M({ id: 'h' })], null, null).find((x) => x.grupp === 'hansyn')!;
    expect(g.rader.map((r) => r.namn)).toEqual(['Högstubbar', 'Kulturminne']);
  });

  it('ytorna får rader på samma sätt: "Hänsynsytor · 2 st" under Hänsyn, traktdelar och egna områden under Övrigt', () => {
    const g = byggOmGrupper([], null, null, ['Hänsynsyta', 'Hänsynsyta', 'Traktdel', 'Eget område']);
    expect(g.find((x) => x.grupp === 'hansyn')!.rader.map(typRadText)).toEqual(['Hänsynsytor · 2 st']);
    expect(g.find((x) => x.grupp === 'ovrigt')!.rader.map(typRadText).sort()).toEqual(['Egna områden · 1 st', 'Traktdelar · 1 st']);
    expect(g[0].rader[0].ytaTyp).toBe('Hänsynsyta');
  });

  it('inom en rad: närmast först när man är på trakten, annars i skapad ordning', () => {
    const ms = [M({ id: 'a', lat: 56.401, lng: 14.7, skapad: 1 }), M({ id: 'b', lat: 56.4, lng: 14.7, skapad: 2 })];
    expect(rader(ms)[0].markeringar.map((m) => m.id)).toEqual(['a', 'b']);
    expect(byggOmGrupper(ms, { lat: 56.4, lng: 14.7 }, null)[0].rader[0].markeringar.map((m) => m.id)).toEqual(['b', 'a']);
  });
  it('rubrikens antal faror = markeringarna i gruppen Faror', () => {
    expect(antalFaror(byggOmGrupper([M({ id: '1', typ: 'warning', namn: 'Varning' }), M({ id: '2', typ: 'warning', namn: 'Varning' }), M({ id: '3', typ: 'powerline', namn: 'Kraftledning' })], null, null))).toBe(3);
    expect(antalFaror([])).toBe(0);
  });
});

describe('ritad hänsynszon heter Hänsynsyta', () => {
  it('raden, objektets titel och listens text — aldrig "Hänsyn" (som gruppen)', () => {
    const z = M({ id: 'z', slag: 'zon', typ: 'protected', namn: 'Hänsyn', comment: 'Bok' });
    const g = byggOmGrupper([z], null, null).find((x) => x.grupp === 'hansyn')!;
    expect(g.rader.map(typRadText)).toEqual(['Hänsynsyta · 1 st']);
    expect(listText(z)).toBe('Hänsynsyta · Bok');
    expect(omNamn(z)).toBe('Hänsynsyta');
    expect(omNamn(M({ id: 'w', slag: 'zon', typ: 'wet', namn: 'Blött' }))).toBe('Blött');
  });
});

describe('listen nertill', () => {
  it('basväg: "Basväg röd · 329 m"; annars namn · kommentar; utan kommentar bara namnet', () => {
    expect(listText(bv({ id: '1', farg: 'red', langdM: 329 }))).toBe('Basväg röd · 329 m');
    expect(listText(M({ id: '2', typ: 'culturemonument', namn: 'Kulturminne', comment: 'Stenrös \n vid vägen' }))).toBe('Kulturminne · Stenrös vid vägen');
    expect(listText(M({ id: '3' }))).toBe('Högstubbe');
  });
});

describe('brandrisk: bara när någon dag är 3 eller högre', () => {
  const IDAG = '2026-10-14';   // en onsdag
  const d = (datum: string, klass: number) => ({ datum, klass });
  it('dagens namn: idag, i morgon, annars veckodag', () => {
    expect(dagText('2026-10-14', IDAG)).toBe('idag');
    expect(dagText('2026-10-15', IDAG)).toBe('i morgon');
    expect(dagText('2026-10-16', IDAG)).toBe('fredag');
    expect(dagText('2026-10-18', IDAG)).toBe('söndag');
  });
  it('1–2 hela veckan: ingen rad', () => {
    expect(brandRadText([d('2026-10-14', 1), d('2026-10-15', 2), d('2026-10-16', 2)], IDAG)).toBeNull();
    expect(brandRadText([], IDAG)).toBeNull();
  });
  it('3 = vanlig text, "Brandrisk 3 på fredag"', () => {
    expect(brandRadText([d('2026-10-14', 2), d('2026-10-16', 3)], IDAG)).toEqual({ klass: 3, text: 'Brandrisk 3 på fredag', ton: 'neutral' });
  });
  it('4 = orange, 5 = röd; idag och i morgon utan "på"', () => {
    expect(brandRadText([d('2026-10-14', 4)], IDAG)).toEqual({ klass: 4, text: 'Brandrisk 4 idag', ton: 'orange' });
    expect(brandRadText([d('2026-10-14', 2), d('2026-10-15', 5)], IDAG)).toEqual({ klass: 5, text: 'Brandrisk 5 i morgon', ton: 'rod' });
  });
  it('5E (klass 6): "Brandrisk 5E på torsdag – inga band", röd', () => {
    expect(brandRadText([d('2026-10-14', 3), d('2026-10-15', 6)], IDAG)).toMatchObject({ klass: 6, ton: 'rod', text: 'Brandrisk 5E i morgon – inga band' });
    expect(brandRadText([d('2026-10-15', 6)], '2026-10-13')!.text).toBe('Brandrisk 5E på torsdag – inga band');
  });
  it('flera dagar: den högsta, och den första av lika höga', () => {
    expect(brandRadText([d('2026-10-14', 3), d('2026-10-15', 4), d('2026-10-16', 4), d('2026-10-17', 3)], IDAG)!.text).toBe('Brandrisk 4 i morgon');
  });
});

describe('vakt: gamla radformat får inte komma tillbaka', () => {
  const om = readFileSync(resolve(__dirname, '../components/planering/OmTrakten.tsx'), 'utf8');
  it('inga "Visa ›", ingen sammanfattningsrad, ingen "Utan kommentar", inga fem brandriskstreck', () => {
    expect(om).not.toMatch(/Visa ›|Visa hela|om-visa/);
    expect(om).not.toMatch(/Utan kommentar|om-utan-kommentar|om-samlad|samladText|antalPerTyp/);
    expect(readFileSync(resolve(__dirname, '../components/planering/BrandriskRad.tsx'), 'utf8')).not.toContain('info-brandrisk-dag');
  });
  it('objektKort.ts har inte kvar den gamla sammanslagningen', () => {
    const k = readFileSync(resolve(__dirname, './objektKort.ts'), 'utf8');
    for (const n of ['byggMarkeringsGrupper', 'samladText', 'antalPerTyp', 'arKortKommentar', 'visasIListan']) expect(k).not.toContain(n);
  });
});
