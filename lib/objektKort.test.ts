import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  objektRad, kortKnappar, faktaBrickor, extraBrickor, tillForaren, behoverLasAllt, sammanfattaMarkeringar, markeringsRad, antalPerTyp, namnMedAntal,
  sorteraMarkeringar, filtreraMarkeringar, avstandText, distM, byggMerGrupper, femDagar, gpsNu, type KartMarkering, type MerIn,
} from './objektKort';

const M = (o: Partial<KartMarkering> & { id: string }): KartMarkering => ({ slag: 'symbol', typ: 'highstump', namn: 'Högstubbe', comment: '', lat: null, lng: null, skapad: null, ordning: 0, ...o });

describe('raden under namnet: typ · avtalsform · cert', () => {
  it('alla tre', () => expect(objektRad({ typ: 'Slutavverkning', avtalsform: 'Rp', cert: 'FSC PEFC' })).toBe('Slutavverkning · Rp · FSC PEFC'));
  it('tomma delar utelämnas — inga tomma streck', () => {
    expect(objektRad({ typ: 'Slutavverkning', avtalsform: '', cert: null })).toBe('Slutavverkning');
    expect(objektRad({ typ: 'Gallring', avtalsform: null, cert: 'FSC' })).toBe('Gallring · FSC');
  });
  it('avtalsform finns bara på slutavverkning, även om fältet råkar vara satt på en gallring', () => {
    expect(objektRad({ typ: 'Gallring', avtalsform: 'Rp', cert: 'FSC', arSlutavverkning: false })).toBe('Gallring · FSC');
  });
  it('"None" och "Not known" är inget certifikat', () => {
    expect(objektRad({ typ: 'Gallring', cert: 'None' })).toBe('Gallring');
    expect(objektRad({ typ: 'Gallring', cert: 'Not known' })).toBe('Gallring');
    expect(objektRad({ typ: 'Gallring', cert: 'Ej certifierad' })).toBe('Gallring · Ej certifierad');
  });
});

describe('knapprad efter roll', () => {
  const ids = (k: ReturnType<typeof kortKnappar>) => k.map((x) => x.id);
  it('planerare: Kör hit · Mer — Inför maskin visas inte förrän den finns', () => {
    expect(ids(kortKnappar({ roll: 'planerare', harKoordinat: true, korvyAktiv: false, maskinSlag: null }))).toEqual(['kor-hit', 'mer']);
  });
  it('planerare utan koordinat: bara Mer (ingen Kör hit att trycka på)', () => {
    expect(ids(kortKnappar({ roll: 'planerare', harKoordinat: false, korvyAktiv: false, maskinSlag: null }))).toEqual(['mer']);
  });
  it('förare på skotare: Körvy · Skotning · Utkört · Mer', () => {
    expect(ids(kortKnappar({ roll: 'forare', harKoordinat: true, korvyAktiv: false, maskinSlag: 'skotare' }))).toEqual(['korvy', 'skotning', 'utkort', 'mer']);
  });
  it('förare utan känd maskin: samma fyra', () => {
    expect(ids(kortKnappar({ roll: 'forare', harKoordinat: true, korvyAktiv: false, maskinSlag: null }))).toEqual(['korvy', 'skotning', 'utkort', 'mer']);
  });
  it('skördarförare har ingen skotning att öppna eller markera utkört: Körvy · Mer', () => {
    expect(ids(kortKnappar({ roll: 'forare', harKoordinat: true, korvyAktiv: false, maskinSlag: 'skordare' }))).toEqual(['korvy', 'mer']);
  });
  it('körvyn redan igång: ingen Körvy-knapp (Avsluta körvy ligger i Mer)', () => {
    expect(ids(kortKnappar({ roll: 'forare', harKoordinat: true, korvyAktiv: true, maskinSlag: 'skotare' }))).toEqual(['skotning', 'utkort', 'mer']);
  });
  it('Kör hit finns aldrig för förare', () => {
    expect(ids(kortKnappar({ roll: 'forare', harKoordinat: true, korvyAktiv: false, maskinSlag: 'skotare' }))).not.toContain('kor-hit');
  });
});

describe('faktabrickor: bara det som har värde', () => {
  it('ha, m³ och GROT', () => {
    expect(faktaBrickor({ areal: '3,6', volym: '950', grot: true }).map((b) => b.varde)).toEqual(['3,6 ha', '950 m³', 'GROT ja']);
  });
  it('GROT nej visas (ja/nej), okänd GROT (null) gör det inte', () => {
    expect(faktaBrickor({ grot: false }).map((b) => b.varde)).toEqual(['GROT nej']);
    expect(faktaBrickor({ grot: null })).toEqual([]);
  });
  it('0, tomt och null ger ingen bricka', () => {
    expect(faktaBrickor({ areal: 0, volym: '', medelstam: null })).toEqual([]);
  });
  it('medelstam visas när den finns', () => {
    expect(faktaBrickor({ medelstam: 0.12 }).map((b) => b.varde)).toEqual(['0,12 m³']);
  });
  it('tusental och decimaler på svenska', () => {
    expect(faktaBrickor({ areal: 12.456, volym: 12500 }).map((b) => b.varde)).toEqual(['12,46 ha', '12\u00a0500 m³']);
  });
  it('bärighet, terräng och basväg lever kvar i uppdraget', () => {
    expect(extraBrickor({ barighet: 'Dålig', terrang: '', basvag: '1,2 km' }).map((b) => b.id)).toEqual(['barighet', 'basvag']);
  });
});

describe('Till föraren', () => {
  it('planerarens förardirektiv, Vida och planerarens egen text — var och en med avsändare, tomma utelämnas', () => {
    const r = tillForaren({ forardirektiv: ' Kör rakt ', vida: 'Spara 10 träd/ha', anteckningar: '' });
    expect(r).toEqual([
      { id: 'forardirektiv', avsandare: 'Planerare', text: 'Kör rakt' },
      { id: 'vida', avsandare: 'Vida', text: 'Spara 10 träd/ha' },
    ]);
  });
  it('allt tomt → ingen post (kortet visar inget tomt block)', () => expect(tillForaren({})).toEqual([]));
  it('"Läs allt" när texten inte ryms på tre rader', () => {
    expect(behoverLasAllt('Kort text')).toBe(false);
    expect(behoverLasAllt('x'.repeat(200))).toBe(true);
    expect(behoverLasAllt('a\nb\nc\nd')).toBe(true);
    expect(behoverLasAllt('a\nb\nc')).toBe(false);
  });
});

describe('På trakten: antal och text', () => {
  const lista = [
    M({ id: '1', comment: 'Lutande tall, akta' }),
    M({ id: '2' }), M({ id: '3' }),
    M({ id: '4', typ: 'landing', namn: 'Avlägg' }),
    M({ id: '5', typ: 'landing', namn: 'Avlägg', photoPath: 'a/b.jpg' }),
  ];
  it('"N markeringar · M med text" — foto räknas som innehåll', () => {
    const s = sammanfattaMarkeringar(lista);
    expect(s).toEqual({ antal: 5, medText: 2 });
    expect(markeringsRad(s)).toBe('5 markeringar · 2 med text');
  });
  it('utan text: bara antalet, och singular vid 1', () => {
    expect(markeringsRad({ antal: 1, medText: 0 })).toBe('1 markering');
    expect(markeringsRad({ antal: 4, medText: 0 })).toBe('4 markeringar');
  });
  it('utan kommentar: antal per typ — "2 högstubbar · 1 avlägg", flest först', () => {
    expect(antalPerTyp(lista)).toBe('2 högstubbar · 1 avlägg');
  });
  it('okänd typ använder visningsnamnet; linjer har egna namn', () => {
    expect(namnMedAntal('symbol', 'okand', 'Konstig', 3)).toBe('3 konstig');
    expect(namnMedAntal('linje', 'sideRoadRed', 'x', 2)).toBe('2 röda stickvägar');
  });
});

describe('Om trakten: sortering, sök, avstånd', () => {
  const pos = { lat: 56.0, lng: 14.0 };
  const nara = M({ id: 'a', comment: 'nära', lat: 56.0005, lng: 14.0, skapad: 300, ordning: 2 });
  const langt = M({ id: 'b', comment: 'långt', lat: 56.01, lng: 14.0, skapad: 100, ordning: 0 });
  const utanPos = M({ id: 'c', comment: 'ingenstans', lat: null, lng: null, skapad: 200, ordning: 1 });
  it('närmast först när GPS finns, markeringar utan position sist', () => {
    expect(sorteraMarkeringar([langt, utanPos, nara], pos).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('utan GPS: i ordning de skapades (tidsstämpel, annars läsordning)', () => {
    expect(sorteraMarkeringar([nara, langt, utanPos], null).map((m) => m.id)).toEqual(['b', 'c', 'a']);
    const utanTid = [M({ id: 'x', ordning: 1 }), M({ id: 'y', ordning: 0 })];
    expect(sorteraMarkeringar(utanTid, null).map((m) => m.id)).toEqual(['y', 'x']);
  });
  it('avstånd räknas bara med GPS', () => {
    expect(sorteraMarkeringar([nara], null)[0].avstandM).toBeNull();
    expect(sorteraMarkeringar([nara], pos)[0].avstandM).toBeCloseTo(distM(pos, { lat: 56.0005, lng: 14.0 }), 5);
  });
  it('avståndstext: meter avrundat till 5, km med decimalkomma', () => {
    expect(avstandText(87)).toBe('85 m');
    expect(avstandText(2)).toBe('5 m');
    expect(avstandText(1340)).toBe('1,3 km');
  });
  it('sök träffar kommentar och symbolnamn, oberoende av versaler', () => {
    const lst = [M({ id: '1', comment: 'Blött vid bäcken', namn: 'Högstubbe' }), M({ id: '2', comment: '', namn: 'Avlägg', typ: 'landing' })];
    expect(filtreraMarkeringar(lst, 'BÄCK').map((m) => m.id)).toEqual(['1']);
    expect(filtreraMarkeringar(lst, 'avl').map((m) => m.id)).toEqual(['2']);
    expect(filtreraMarkeringar(lst, '  ').length).toBe(2);
    expect(filtreraMarkeringar(lst, 'finns inte')).toEqual([]);
  });
});

describe('Mer', () => {
  const fn = () => vi.fn();
  const go = (): MerIn['go'] => ({
    skordarKorvy: fn(), skotarKorvy: fn(), avslutaKorvy: fn(), vaxlaBaskarta: fn(), gps: fn(), data: fn(), andrasSpar: fn(),
    skotning: fn(), markeraUtkort: fn(), genomgang: fn(), checklista: fn(), vagdata: fn(), trakt: fn(), lager: fn(), installningar: fn(), gpsKalla: fn(), forslag: fn(),
  });
  const bas = (o: Partial<MerIn> = {}): MerIn => ({ roll: 'planerare', arAdmin: true, korvyAktiv: false, maskinlage: false, skotningFinnsSomKnapp: false, status: 'planerad', tillTrakt: true, vagdata: { varde: '3 vägar', misslyckad: false, kanKora: true }, go: go(), ...o });
  const id = (r: ReturnType<typeof byggMerGrupper>, g: string) => r.grupper.find((x) => x.id === g)?.rader.map((x) => x.id) ?? null;

  it('planerare (admin): körvyerna, föraren, planeraren, övrigt — och inga Byt objekt, Brandrisk, Gallring, Inställningar, Förslag', () => {
    const r = bas();
    const m = byggMerGrupper(r);
    expect(m.grupper.map((g) => g.id)).toEqual(['korvy', 'foraren', 'planeraren', 'ovrigt']);
    expect(id(m, 'korvy')).toEqual(['skordarkorvy', 'skotarkorvy']);
    expect(id(m, 'foraren')).toEqual(['skotning', 'markera-utkort', 'genomgang']);
    expect(id(m, 'ovrigt')).toEqual(['checklista', 'vagdata', 'trakt']);
    const alla = m.grupper.flatMap((g) => g.rader.map((x) => x.etikett.toLowerCase())).join('|');
    for (const bort of ['byt objekt', 'brandrisk', 'gallring', 'inställningar', 'förslag']) expect(alla).not.toContain(bort);
  });
  it('Briefing och Kvittera markeringar är ETT val: Genomgång & kvittering', () => {
    const etiketter = byggMerGrupper(bas()).grupper.flatMap((g) => g.rader.map((x) => x.etikett));
    expect(etiketter).toContain('Genomgång & kvittering');
    expect(etiketter).not.toContain('Briefing');
    expect(etiketter).not.toContain('Kvittera markeringar');
  });
  it('förare: ingen Körvy-grupp (knappen ligger på kortet), ingen dubblett av Skotning, ingen Planeraren-grupp', () => {
    const m = byggMerGrupper(bas({ roll: 'forare', arAdmin: false, skotningFinnsSomKnapp: true }));
    expect(m.grupper.map((g) => g.id)).toEqual(['foraren', 'ovrigt']);
    expect(id(m, 'foraren')).toEqual(['markera-utkort', 'genomgang']);
    expect(m.planerarenBlock).toBe(false);
  });
  it('körvy igång: all kontroll bor i Mer — baskarta, GPS, kartdata, spår, Avsluta körvy (röd) — samt Lager, Inställningar, GPS-källa och Förslag', () => {
    const m = byggMerGrupper(bas({ roll: 'forare', arAdmin: false, korvyAktiv: true, skotningFinnsSomKnapp: true,
      korvy: { basKartaText: 'Baskarta: Karta → Topokarta', gpsText: 'GPS: ok', gpsProblem: false, dataText: 'Kartdata: nu', andrasSparText: 'Uppdatera skotarens spår' } }));
    expect(id(m, 'korvy')).toEqual(['baskarta', 'gps', 'kartdata', 'andras-spar', 'avsluta-korvy']);
    expect(m.grupper.find((g) => g.id === 'korvy')!.rader.at(-1)!.farlig).toBe(true);
    expect(id(m, 'ovrigt')).toEqual(['checklista', 'vagdata', 'trakt', 'lager', 'installningar', 'gps-kalla', 'forslag']);
  });
  it('maskindator (hem leder till objektlistan): Inställningar och Förslag får inte försvinna — startsidan nås inte', () => {
    const m = byggMerGrupper(bas({ roll: 'forare', arAdmin: false, maskinlage: true, skotningFinnsSomKnapp: true }));
    expect(id(m, 'ovrigt')).toEqual(expect.arrayContaining(['installningar', 'forslag']));
  });
  it('vanlig planering (telefon/dator): Inställningar och Förslag ligger på startsidan, inte här', () => {
    const m = byggMerGrupper(bas());
    expect(id(m, 'ovrigt')).not.toContain('installningar');
    expect(id(m, 'ovrigt')).not.toContain('forslag');
  });
  it('Avsluta objekt: bara när objektet är pågående', () => {
    expect(byggMerGrupper(bas({ status: 'pagaende' })).avslutaObjekt).toBe(true);
    expect(byggMerGrupper(bas({ status: 'planerad' })).avslutaObjekt).toBe(false);
    expect(byggMerGrupper(bas({ status: 'avslutat' })).avslutaObjekt).toBe(false);
  });
  it('Vägdata visar statusen och är bara tryckbar för planeraren; röd när den misslyckats', () => {
    const rad = byggMerGrupper(bas({ vagdata: { varde: 'Kunde inte hämtas', misslyckad: true, kanKora: false } })).grupper.find((g) => g.id === 'ovrigt')!.rader.find((r) => r.id === 'vagdata')!;
    expect(rad.under).toBe('Kunde inte hämtas');
    expect(rad.farlig).toBe(true);
  });
  it('en rad ropar rätt handling', () => {
    const c = bas();
    const m = byggMerGrupper(c);
    m.grupper.find((g) => g.id === 'foraren')!.rader.find((r) => r.id === 'genomgang')!.onTryck();
    expect(c.go.genomgang).toHaveBeenCalledTimes(1);
    expect(c.go.markeraUtkort).not.toHaveBeenCalled();
  });
});

describe('brandrisk: fem dagar', () => {
  const dagar = Array.from({ length: 6 }, (_, i) => ({ date: `2026-10-0${i + 1}`, dayName: ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][i], fwiIndex: i + 1 }));
  it('idag först, högst fem', () => {
    expect(femDagar(dagar, '2026-10-01').map((d) => d.dag)).toEqual(['Mån', 'Tis', 'Ons', 'Tor', 'Fre']);
  });
  it('om idag inte är först i listan roteras den som veckolistan i panelen gör', () => {
    expect(femDagar(dagar, '2026-10-03').map((d) => d.dag)).toEqual(['Ons', 'Tor', 'Fre', 'Lör', 'Mån']);
  });
  it('tom data → inga dagar (ingen gissad risk)', () => {
    expect(femDagar([], '2026-10-01')).toEqual([]);
    expect(femDagar(null, '2026-10-01')).toEqual([]);
  });
});

describe('positionen till kortet och Om trakten (PR 766: ⓘ kraschade på currentPosition.coords)', () => {
  // Sidans currentPosition är { lat, lon } — den har INGEN .coords. Komponenterna får { lat, lng }.
  it('{ lat, lon } → { lat, lng }', () => {
    expect(gpsNu({ korvyAktiv: false, korvyPos: null, position: { lat: 56.4, lon: 14.7 } })).toEqual({ lat: 56.4, lng: 14.7 });
  });
  it('ingen position → null (aldrig en krasch, aldrig en gissad plats)', () => {
    expect(gpsNu({ korvyAktiv: false, korvyPos: null, position: null })).toBeNull();
    expect(gpsNu({ korvyAktiv: true, korvyPos: null, position: null })).toBeNull();
  });
  it('körvyns position går först, men bara när körvyn är igång', () => {
    const k = { lat: 56.5, lon: 14.8 }, p = { lat: 56.4, lon: 14.7 };
    expect(gpsNu({ korvyAktiv: true, korvyPos: k, position: p })).toEqual({ lat: 56.5, lng: 14.8 });
    expect(gpsNu({ korvyAktiv: false, korvyPos: k, position: p })).toEqual({ lat: 56.4, lng: 14.7 });
  });
  it('ett ogiltigt tal (NaN) ger ingen position', () => {
    expect(gpsNu({ korvyAktiv: false, korvyPos: null, position: { lat: NaN, lon: 14.7 } })).toBeNull();
  });
  it('sidan läser aldrig .coords ur currentPosition och går via gpsNu (typen är { lat, lon }, inte GeolocationPosition)', () => {
    const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
    expect(page).not.toMatch(/currentPosition\.coords/);
    expect(page).toContain('useState<{ lat: number; lon: number } | null>(null);   // {lat, lon}');
    expect(page).not.toContain('setCurrentPosition({ lat: fix.lat, lon: fix.lng } as any)');
    expect(page).toContain('gpsNu({ korvyAktiv: korvyActive, korvyPos: korvyEffectivePos, position: currentPosition })');
    expect(page).toContain('pos: gpsNuPos,');
  });
});
