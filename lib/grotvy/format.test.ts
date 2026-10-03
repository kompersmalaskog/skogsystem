import { describe, it, expect } from 'vitest';
import {
  idagLokal, dagAv, dagarMellan, dagarSedan, kortDatum, tusental,
  avverkatText, senastText, skordatText, grotSchablonText, avstandText, kmText, arealText, SAKNAR_OBJEKT_TEXT,
} from './format';

const NBSP = '\u00A0';

describe('idagLokal', () => {
  it('ger lokal kalenderdag med nollfyllning', () => {
    expect(idagLokal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(idagLokal(new Date(2026, 9, 2, 0, 1))).toBe('2026-10-02');
  });
});

describe('dagAv', () => {
  it('klipper ISO-tid till datumet och avvisar skräp', () => {
    expect(dagAv('2026-10-02T14:45:27Z')).toBe('2026-10-02');
    expect(dagAv('2026-10-02')).toBe('2026-10-02');
    expect(dagAv('i går')).toBeNull();
    expect(dagAv(null)).toBeNull();
    expect(dagAv('')).toBeNull();
  });
});

describe('dagarMellan / dagarSedan', () => {
  it('räknar hela kalenderdagar', () => {
    expect(dagarMellan('2026-08-23', '2026-10-02')).toBe(40);
    expect(dagarSedan('2026-10-02', '2026-10-02')).toBe(0);
    expect(dagarSedan('2026-10-03', '2026-10-02')).toBe(-1);
  });
  it('sommartidsbyte ger aldrig 39 eller 41 dagar', () => {
    expect(dagarMellan('2026-03-28', '2026-03-30')).toBe(2); // vårens byte 29 mars
    expect(dagarMellan('2026-10-24', '2026-10-26')).toBe(2); // höstens byte 25 okt
  });
  it('ogiltigt datum → null', () => {
    expect(dagarSedan(null, '2026-10-02')).toBeNull();
    expect(dagarSedan('skräp', '2026-10-02')).toBeNull();
  });
});

describe('kortDatum', () => {
  it('"3 okt" utan punkt, oberoende av ICU', () => {
    expect(kortDatum('2026-10-03', '2026-10-02')).toBe('3 okt');
    expect(kortDatum('2026-01-09', '2026-10-02')).toBe('9 jan');
    expect(kortDatum('2026-05-01', '2026-10-02')).toBe('1 maj');
  });
  it('annat år än idag tas med', () => {
    expect(kortDatum('2025-12-17', '2026-10-02')).toBe('17 dec 2025');
  });
  it('utanAr: aldrig året', () => {
    expect(kortDatum('2025-12-17', '2026-10-02', true)).toBe('17 dec');
    expect(kortDatum('2026-12-17', '2026-10-02', true)).toBe('17 dec');
  });
  it('ogiltigt → tom sträng', () => {
    expect(kortDatum(null, '2026-10-02')).toBe('');
    expect(kortDatum('x', '2026-10-02')).toBe('');
  });
});

describe('tusental', () => {
  it('hårt mellanslag, avrundat', () => {
    expect(tusental(1240)).toBe(`1${NBSP}240`);
    expect(tusental(25853.4)).toBe(`25${NBSP}853`);
    expect(tusental(999)).toBe('999');
    expect(tusental(999.5)).toBe(`1${NBSP}000`);
    expect(tusental(0)).toBe('0');
    expect(tusental(1234567)).toBe(`1${NBSP}234${NBSP}567`);
  });
});

describe('avverkatText', () => {
  it('datum + dagar', () => {
    expect(avverkatText('2026-08-23', '2026-10-02')).toBe('avverkat 23 aug · 40 dgr');
  });
  it('året tas inte med inom ett år — "N dgr" bär åldern — men väl från ett år och uppåt', () => {
    expect(avverkatText('2025-12-12', '2026-10-02')).toBe('avverkat 12 dec · 294 dgr');
    expect(avverkatText('2025-10-03', '2026-10-02')).toBe('avverkat 3 okt · 364 dgr');
    expect(avverkatText('2025-10-02', '2026-10-02')).toBe('avverkat 2 okt 2025 · 365 dgr');
    expect(avverkatText('2024-05-01', '2026-10-02')).toBe('avverkat 1 maj 2024 · 884 dgr');
  });
  it('saknat datum säger det i stället för att gissa', () => {
    expect(avverkatText(null, '2026-10-02')).toBe('avverkningsdatum saknas');
    expect(avverkatText('skräp', '2026-10-02')).toBe('avverkningsdatum saknas');
  });
});

describe('senastText', () => {
  const idag = '2026-10-02';
  it('kommande datum + skäl', () => {
    expect(senastText('2026-10-03', 'markberedning', idag)).toBe('senast 3 okt · markberedning');
  });
  it('utan skäl', () => {
    expect(senastText('2026-10-03', null, idag)).toBe('senast 3 okt');
  });
  it('idag är inte försenat — igår är det', () => {
    expect(senastText('2026-10-02', 'plantering', idag)).toBe('senast 2 okt · plantering');
    expect(senastText('2026-10-01', 'plantering', idag)).toBe('senast 1 okt · plantering (försenat)');
    expect(senastText('2026-09-15', null, idag)).toBe('senast 15 sep (försenat)');
  });
  it('inget datum → tom', () => {
    expect(senastText(null, 'annat', idag)).toBe('');
  });
});

describe('volym- och avståndstexter', () => {
  it('skördat och schablon märks som vad de är', () => {
    expect(skordatText(1240.4)).toBe(`skördat 1${NBSP}240 m³`);
    expect(grotSchablonText(434)).toBe('≈ 434 m³ GROT (schablon)');
  });
  it('avstånd: heltal km, okänt = "–"', () => {
    expect(avstandText(10.6, 'Rössmåla')).toBe('11 km från Rössmåla');
    expect(avstandText(null, 'Rössmåla')).toBe('–');
    expect(avstandText(undefined, 'Rössmåla')).toBe('–');
    expect(avstandText(11, null)).toBe('–');
    expect(avstandText(0, 'Rössmåla')).toBe('<1 km från Rössmåla');
  });
  it('kmText: 0 betyder under en kilometer, aldrig "0 km"', () => {
    expect(kmText(0)).toBe('<1');
    expect(kmText(1)).toBe('1');
    expect(kmText(11.4)).toBe('11');
    expect(kmText(11.6)).toBe('12');
  });
  it('arealText: en decimal, decimalkomma, tomt när det saknas', () => {
    expect(arealText(4.2)).toBe('4,2 ha');
    expect(arealText(12)).toBe('12 ha');
    expect(arealText(7.25)).toBe('7,3 ha');
    expect(arealText(0)).toBe('');
    expect(arealText(null)).toBe('');
    expect(arealText(NaN)).toBe('');
  });
  it('texten för objekt som saknas i planeringen är EN konstant', () => {
    expect(SAKNAR_OBJEKT_TEXT).toBe('saknar objekt i planeringen');
  });
});
