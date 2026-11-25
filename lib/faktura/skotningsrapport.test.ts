// Skotningsrapporten — det Martin skickar till Vidas inköpare.
//
// Rapportens hela värde ligger i att den säger SANT och att talen är desamma
// som fakturans. Testerna vaktar tre saker:
//
//   1. Rapporten räknar inget eget pris — kronorna och avståndet kommer in.
//   2. Alla fyra måtten står där, med det fakturerade märkt.
//   3. Ett saknat tal sägs rakt ut, aldrig som en nolla eller en gissning.
//
// FACIT är Skälviken i prod 2026-11-25: 414 m ut, 739 halva cykeln, 660 efter
// vändpunkten, 250 vid avlägget; 12 kr/m³fub på 1 746,35 m³fub = 20 956 kr.
import { describe, it, expect } from 'vitest';
import {
  KARTA_FORKLARING, kallaMening, luckaRad, mattRader, periodText, prisRader,
  skotningsrapport, svarRad, type SkotningsrapportIndata,
} from './skotningsrapport';
import type { CykelSammanstallning } from './lassCykel';

/** toLocaleString('sv-SE') ger hårt mellanslag som tusenavskiljare. */
const txt = (s: string | null | undefined) => s?.replace(/[\u00a0\u202f]/g, ' ') ?? s;

const SKALVIKEN_CYKEL: CykelSammanstallning = {
  lass: 85, medCykel: 70, volym: 1553, volymMedCykel: 1278,
  cykelM: 1477, enkelVagM: 738.6, hemMedLassM: 660, vidAvlaggetM: 250,
  ytterstM: 414.4,
  utan: { fonster_for_langt: 14, forsta_lasset: 1 },
};

const SKALVIKEN: SkotningsrapportIndata = {
  trakt: { namn: 'Skälviken RP J-Hus -25', voNummer: '11271860', kund: 'Vida', avtalsform: 'Rp' },
  skotare: ['Elefant 26'],
  period: { fran: '2026-11-03', till: '2026-11-18' },
  volymM3fub: 1746.35,
  avstandM: 414.4,
  handsatt: false,
  cykel: SKALVIKEN_CYKEL,
  pris: { grundavstandM: 200, krPer100m: 4, kronor: 20956.2 },
};

describe('svaret', () => {
  it('avståndet, enkel väg, stort', () => {
    expect(svarRad(SKALVIKEN).svar).toBe('Skotningsavståndet var 414 m enkel väg.');
    expect(svarRad(SKALVIKEN).ton).toBeUndefined();
  });

  it('saknas avståndet sägs det — aldrig 0 m', () => {
    const r = svarRad({ ...SKALVIKEN, avstandM: null });
    expect(r.svar).toContain('inte mätt');
    expect(r.svar).not.toContain('0 m');
    expect(r.ton).toBe('dampad');
  });
});

describe('var talet kommer ifrån', () => {
  it('mätt: lassen, täckningen och volymen bakom', () => {
    const m = txt(kallaMening(SKALVIKEN))!;
    expect(m).toContain('70 av 85 lass');
    expect(m).toContain('1 278 m³fub av 1 746 m³fub');
    expect(m).toContain('73 % av traktens volym');
  });

  it('handsatt sägs som handsatt, med lassens mätning bredvid', () => {
    const m = txt(kallaMening({ ...SKALVIKEN, handsatt: true, avstandM: 450 }))!;
    expect(m).toContain('satt för hand');
    expect(m).toContain('414 m');
  });

  it('inget avstånd: säger varför, inte "0"', () => {
    expect(kallaMening({ ...SKALVIKEN, avstandM: null })).toContain('inget av dem har ett mätt körspår');
    expect(kallaMening({ ...SKALVIKEN, avstandM: null, cykel: null })).toContain('inga lass med körspår');
  });
});

describe('samma körning, fyra mått', () => {
  it('det fakturerade står FÖRST och är märkt', () => {
    const r = mattRader(SKALVIKEN_CYKEL);
    expect(r.map(x => [x.titel, txt(x.status)])).toEqual([
      ['Ut till virket', '414 m · fakturerat'],
      ['Halva cykeln', '739 m'],
      ['Efter vändpunkten', '660 m'],
      ['Vid avlägget', '250 m'],
    ]);
    expect(r[0].ton).toBe('bra');
  });

  it('ÄRLIGHETEN: rapporten visar att vi tagit det lägsta transportmåttet', () => {
    const r = mattRader(SKALVIKEN_CYKEL);
    // Halva cykeln (739) är nästan dubbelt — står kvar, med skälet.
    expect(r[1].text).toContain('betald i kubikpriset');
    // Landningsarbetet sägs ligga utanför det vi fakturerar.
    expect(r[3].text).toContain('Inte skotning');
  });

  it('en del som inte gick att mäta får ingen rad', () => {
    const r = mattRader({ ...SKALVIKEN_CYKEL, hemMedLassM: null, vidAvlaggetM: null });
    expect(r.map(x => x.titel)).toEqual(['Ut till virket', 'Halva cykeln']);
  });

  it('inga app-lass ger inga mått — inte fyra nollor', () => {
    expect(mattRader(null)).toEqual([]);
    expect(mattRader({ ...SKALVIKEN_CYKEL, enkelVagM: null })).toEqual([]);
  });
});

describe('luckan', () => {
  it('säger hur många som mättes och varför de andra inte gjorde det', () => {
    const r = txt(luckaRad(SKALVIKEN_CYKEL))!;
    expect(r).toContain('70 av 85');
    expect(r).toContain('14 lass');
    expect(r).toContain('3 timmar');
    // Ett omätt lass drar inte ner snittet (regeln sedan 2026-11-25).
    expect(r).toContain('drar inte ner snittet');
    expect(r).not.toContain('0 kr');
  });

  it('allt mätt ger ingen rad', () => {
    expect(luckaRad({ ...SKALVIKEN_CYKEL, utan: {} })).toBeNull();
    expect(luckaRad(null)).toBeNull();
  });
});

describe('priset', () => {
  it('kronorna kommer IN, räknas inte här — och kr/m³fub följer av dem', () => {
    const r = prisRader(SKALVIKEN);
    expect(txt(r[0].text)).toContain('200 m ingår');
    expect(txt(r[0].text)).toContain('4,00 kr');
    // 20 956,2 / 1 746,35 = 12,00
    expect(txt(r[1].text)).toContain('12,00 kr per m³fub');
    expect(txt(r[1].status)).toBe('20 956 kr');
  });

  it('utan prislista påstås inget villkor', () => {
    const r = prisRader({ ...SKALVIKEN, pris: { grundavstandM: null, krPer100m: null, kronor: 0 } });
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('0 kr');
  });

  it('utan volym räknas ingen kr/m³fub fram', () => {
    const r = prisRader({ ...SKALVIKEN, volymM3fub: 0 });
    expect(txt(r[1].text)).toContain('inte känd');
    expect(r[1].text).not.toContain('Infinity');
    expect(r[1].text).not.toContain('NaN');
  });
});

describe('perioden', () => {
  it('två dagar blir ett spann, en dag blir en dag', () => {
    expect(periodText({ fran: '2026-11-03', till: '2026-11-18' })).toBe('3 november 2026 – 18 november 2026');
    expect(periodText({ fran: '2026-11-03', till: '2026-11-03' })).toBe('3 november 2026');
    expect(periodText(null)).toBeNull();
  });
});

describe('hela dokumentet', () => {
  it('fakta, svar och avsnitt i ordning', () => {
    const dok = skotningsrapport(SKALVIKEN);
    expect(dok.titel).toBe('Skotningsrapport');
    expect(dok.filnamn).toBe('skotningsrapport-11271860');
    expect(dok.fakta.map(f => f.etikett)).toEqual(['Trakt', 'VO-nummer', 'Kund', 'Skotat', 'Skotare', 'Volym']);
    expect(txt(dok.svar)).toContain('414 m');
    expect(dok.sektioner.map(s => s.rubrik)).toEqual(['Samma körning, fyra mått', 'Vad det ger']);
  });

  it('noten säger HUR det mäts — rapporten påstår aldrig ett tal utan källa', () => {
    const dok = skotningsrapport(SKALVIKEN);
    expect(dok.not).toContain('GPS');
    expect(dok.not).toContain('viktat på lassens volym');
    expect(dok.not).toContain('Kompersmåla Skog');
  });

  // Hittat 2026-11-25 när render-testet körde den riktiga PDF:en: med ett
  // handsatt avstånd stod "Ut till virket 414 m · fakturerat" medan fakturan
  // vilade på 450, källmeningen saknades helt och noten sa "Mätt ur GPS:en".
  // En inköpare hade läst fel tal som priset. Det får inte komma tillbaka.
  it('HANDSATT: det handsatta talet är det fakturerade, och det SÄGS', () => {
    const dok = skotningsrapport({ ...SKALVIKEN, handsatt: true, avstandM: 450 });
    const matt = dok.sektioner[0].rader;
    // Det handsatta står först och är det enda som är märkt fakturerat.
    expect([matt[0].titel, txt(matt[0].status)]).toEqual(['Satt för hand', '450 m · fakturerat']);
    expect(matt.filter(r => (r.status ?? '').includes('fakturerat'))).toHaveLength(1);
    expect(txt(matt[1].status)).toBe('414 m'); // mätt, men inte fakturerat
    // ... och raden påstår INTE att tillägget räknas på den.
    expect(matt[1].text).not.toContain('räknas tillägget på');
    // Och "mätta ur körspåret" står en gång, inte i både rubrik och rad.
    expect(matt[0].text).not.toContain('Måtten nedan');
    // Källan står i dokumentet, inte bara i en funktion ingen anropar.
    expect(dok.sektioner[0].under).toContain('satt för hand');
    // Och noten påstår inte att talet är mätt.
    expect(dok.not).toContain('satt för hand');
    expect(dok.not).not.toMatch(/^Mätt ur GPS/);
  });

  it('MÄTT: källmeningen står i dokumentet även där', () => {
    const dok = skotningsrapport(SKALVIKEN);
    expect(txt(dok.sektioner[0].under)).toContain('70 av 85 lass');
    expect(dok.sektioner[0].rader.filter(r => (r.status ?? '').includes('fakturerat'))).toHaveLength(1);
  });

  it('en trakt utan app-lass får bara prisavsnittet, aldrig tomma mått', () => {
    const dok = skotningsrapport({ ...SKALVIKEN, cykel: null, handsatt: true, avstandM: 450 });
    expect(dok.sektioner.map(s => s.rubrik)).toEqual(['Vad det ger']);
    // Utan måttsektion har källmeningen ingen annan plats — den ska stå ändå.
    expect(dok.sektioner[0].under).toContain('satt för hand');
    expect(dok.svar).toContain('450 m');
  });

  it('utan kund och utan skotare står de raderna inte', () => {
    const dok = skotningsrapport({
      ...SKALVIKEN,
      trakt: { ...SKALVIKEN.trakt, kund: null },
      skotare: [], period: null,
    });
    expect(dok.fakta.map(f => f.etikett)).toEqual(['Trakt', 'VO-nummer', 'Volym']);
  });

  it('teckenförklaringen står i ord — färg är aldrig ensam bärare', () => {
    expect(KARTA_FORKLARING).toContain('streckad');
    expect(KARTA_FORKLARING).toContain('Norr är uppåt');
  });
});

describe('FACIT: rapporten säger samma tal som fakturan', () => {
  it('Skälviken: 414 m, 12 kr/m³fub, 20 956 kr', () => {
    const dok = skotningsrapport(SKALVIKEN);
    const text = txt(JSON.stringify(dok))!;
    expect(text).toContain('414 m');
    expect(text).toContain('20 956 kr');
    expect(text).toContain('12,00 kr per m³fub');
    // Och halva cykeln står som jämförelse, inte som pris.
    expect(text).toContain('739 m');
    expect(text).not.toContain('41 9');
  });
});
