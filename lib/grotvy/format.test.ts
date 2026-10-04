import { describe, it, expect } from 'vitest';
import {
  idagLokal, idagStockholm, dagAv, dagarMellan, dagarSedan, kortDatum, tusental,
  avverkatText, senastText, skordatText, grotSchablonText, avstandText, kmText, arealText, SAKNAR_OBJEKT_TEXT,
  FORSENAD_TEXT, DALIG_BARIGHET_TEXT, markBegransningText, grotChipText, arRimligtSenast,
} from './format';

const NBSP = '\u00A0';

describe('idagLokal', () => {
  it('ger lokal kalenderdag med nollfyllning', () => {
    expect(idagLokal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(idagLokal(new Date(2026, 9, 2, 0, 1))).toBe('2026-10-02');
  });
});

describe('idagStockholm — svensk kalenderdag oavsett serverns tidszon', () => {
  it('natten kring midnatt UTC: svensk tid ligger före (sommartid +2, vintertid +1)', () => {
    expect(idagStockholm(new Date('2026-10-03T21:59:00Z'))).toBe('2026-10-03'); // 23:59 svensk sommartid
    expect(idagStockholm(new Date('2026-10-03T22:01:00Z'))).toBe('2026-10-04'); // 00:01 svensk sommartid
    expect(idagStockholm(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31'); // 23:59 svensk vintertid
    expect(idagStockholm(new Date('2026-12-31T23:01:00Z'))).toBe('2027-01-01'); // 00:01 svensk vintertid
  });
  it('cron-tiden 05:00 UTC är samma svenska dag sommar som vinter', () => {
    expect(idagStockholm(new Date('2026-07-15T05:00:00Z'))).toBe('2026-07-15');
    expect(idagStockholm(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15');
  });
  it('nollfyllning och rimlig form', () => {
    expect(idagStockholm(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
    expect(idagStockholm()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
  it('datumet och inget annat — skälet visas ingenstans i v2', () => {
    expect(senastText('2026-10-03', idag)).toBe('senast 3 okt');
    expect(senastText('2026-10-02', idag)).toBe('senast 2 okt');
  });
  it('ett passerat datum står som datum — "försenad" är ett eget ord som vyn sätter i rött, inte en del av texten', () => {
    expect(senastText('2026-10-01', idag)).toBe('senast 1 okt');
    expect(senastText('2026-09-15', idag)).toBe('senast 15 sep');
    expect(FORSENAD_TEXT).toBe('försenad');
  });
  it('annat år än idag tas med', () => {
    expect(senastText('2027-01-09', idag)).toBe('senast 9 jan 2027');
  });
  it('inget datum → tom', () => {
    expect(senastText(null, idag)).toBe('');
    expect(senastText('skräp', idag)).toBe('');
  });
});

describe('markBegransningText — planeringens markvillkor, bara en begränsning', () => {
  it('bara dålig bärighet är en begränsning och visas; bra, medel, tomt och okänt visas inte', () => {
    expect(markBegransningText('dalig')).toBe('dålig bärighet');
    expect(DALIG_BARIGHET_TEXT).toBe('dålig bärighet');
    expect(markBegransningText('medel')).toBe('');
    expect(markBegransningText('bra')).toBe('');
    expect(markBegransningText(null)).toBe('');
    expect(markBegransningText(undefined)).toBe('');
    expect(markBegransningText('Dalig')).toBe('');
    expect(markBegransningText('dålig')).toBe('');
  });
});

describe('grotChipText', () => {
  it('antalet, och "N snart" bara när något är snart', () => {
    expect(grotChipText(28, 0)).toBe('GROT · 28');
    expect(grotChipText(28, 2)).toBe('GROT · 28 · 2 snart');
    expect(grotChipText(1, 1)).toBe('GROT · 1 · 1 snart');
  });
});

describe('arRimligtSenast — vad datumväljaren får spara', () => {
  it('riktiga datum 2000–2100 går', () => {
    expect(arRimligtSenast('2026-10-14')).toBe(true);
    expect(arRimligtSenast('2000-01-01')).toBe(true);
    expect(arRimligtSenast('2100-12-31')).toBe(true);
    expect(arRimligtSenast('2028-02-29')).toBe(true); // skottår
  });
  it('halvskrivet (tomt, år 0002) och orimligt sparas inte', () => {
    expect(arRimligtSenast('')).toBe(false);
    expect(arRimligtSenast(null)).toBe(false);
    expect(arRimligtSenast(undefined)).toBe(false);
    expect(arRimligtSenast('0002-10-14')).toBe(false);
    expect(arRimligtSenast('1999-12-31')).toBe(false);
    expect(arRimligtSenast('2101-01-01')).toBe(false);
  });
  it('inte ett kalenderdatum, eller inte exakt YYYY-MM-DD, sparas inte', () => {
    expect(arRimligtSenast('2026-02-30')).toBe(false);
    expect(arRimligtSenast('2027-02-29')).toBe(false);
    expect(arRimligtSenast('2026-13-01')).toBe(false);
    expect(arRimligtSenast('2026-10-14T00:00:00')).toBe(false); // ISO-tid är inte datumväljarens värde
    expect(arRimligtSenast('14 okt')).toBe(false);
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
