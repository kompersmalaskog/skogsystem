import { describe, it, expect } from 'vitest';
import { inlagtSumma, lageText, bestalltSumma, rubrikTal, visadVolym } from './tackning';
import { saknas, tillstandId, TILLSTAND_TEXT } from './tillstand';
import { byggForslag, kommandeManader, stegaManad, manadEtikett } from './manad';
import { bekraftadRad, certText, geometriSammanfattning as geo, tolkaVarningar, traktkartor } from './filenGav';

// Facit: prod oktober 2026 (verifierat mot databasen 2026-10-19).
const GALLRING = [{ volym: 146 }, { volym: 100 }, { volym: 88 }];
const SLUT = [{ volym: 3495 }, { volym: 1734 }, { volym: 1005 }];

describe('täckning', () => {
  it('gallring 334 / 1 000 — 666 kvar', () => {
    const inlagt = inlagtSumma(GALLRING);
    expect(inlagt).toBe(334);
    expect(rubrikTal(inlagt, bestalltSumma([{ volym: 1000 }]))).toBe('334 / 1 000');
    expect(lageText(inlagt, 1000)).toEqual({ text: '666 m³fub kvar till beställningen', fylld: false });
  });
  it('slutavverkning 6 234 / 5 000 — fylld, 1 234 över (det avslutade Bågskyttebanan räknas)', () => {
    const inlagt = inlagtSumma(SLUT);
    expect(inlagt).toBe(6234);
    expect(lageText(inlagt, 5000)).toEqual({ text: 'Beställningen fylld · 1 234 över', fylld: true });
  });
  it('exakt lika är fylld utan "över"; ingen beställning säger det', () => {
    expect(lageText(1000, 1000)).toEqual({ text: 'Beställningen fylld', fylld: true });
    expect(lageText(5, null).text).toBe('Ingen beställning inlagd');
    expect(rubrikTal(5, null)).toBe('5 / –');
  });
  it('summan är summan av det som visas: varje objekt avrundas först', () => {
    // Råsumman 10,4 + 10,4 + 10,4 = 31,2 → 31; avrundat först 10 + 10 + 10 = 30. Listan visar 10, 10, 10.
    expect(inlagtSumma([{ volym: 10.4 }, { volym: 10.4 }, { volym: 10.4 }])).toBe(30);
    expect(visadVolym(null)).toBe(0);
  });
});

describe('tillstånd', () => {
  it('klartext, aldrig bara färg', () => {
    expect(TILLSTAND_TEXT[tillstandId('oplanerad')]).toBe('Väntar på planering');
    expect(TILLSTAND_TEXT[tillstandId('planerad')]).toBe('Planerad');
    expect(TILLSTAND_TEXT[tillstandId('pagaende')]).toBe('Igång');
    expect(TILLSTAND_TEXT[tillstandId('skotning')]).toBe('Igång');
    expect(TILLSTAND_TEXT[tillstandId('avslutat')]).toBe('Klar');
    expect(TILLSTAND_TEXT[tillstandId('klar')]).toBe('Klar'); // gammal data
    expect(TILLSTAND_TEXT[tillstandId(null)]).toBe('Status saknas'); // gissar inte "väntar"
  });
  const osaker = ['"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.'];
  it('saknas: bara det som går att åtgärda, aldrig på klara objekt', () => {
    const mollerud = { typ: 'slutavverkning', status: 'oplanerad', volym: 1005, traktdirektiv_url: 'td.pdf', stamplingslangd_url: null, import_varningar: [] };
    expect(saknas(mollerud)).toEqual(['saknar stämplingslängd']);
    expect(saknas({ ...mollerud, stamplingslangd_url: 'sl.pdf', import_varningar: osaker })).toEqual(['stämplingslängd osäker']);
    expect(saknas({ ...mollerud, status: 'avslutat' })).toEqual([]);
    expect(saknas({ ...mollerud, typ: 'gallring' })).toEqual([]);
    expect(saknas({ ...mollerud, volym: null, traktdirektiv_url: null })).toEqual(['saknar volym', 'saknar traktdirektiv', 'saknar stämplingslängd']);
  });
});

describe('förslaget för kommande månader', () => {
  it('oktober 2026 → november 2026 … december 2027 (14 st)', () => {
    const m = kommandeManader({ ar: 2026, manad: 10 });
    expect(m).toHaveLength(14);
    expect(manadEtikett(m[0])).toBe('November 2026');
    expect(manadEtikett(m[13])).toBe('December 2027');
  });
  it('december går över årsskiftet', () => {
    expect(stegaManad({ ar: 2026, manad: 12 }, 1)).toEqual({ ar: 2027, manad: 1 });
    expect(stegaManad({ ar: 2026, manad: 1 }, -1)).toEqual({ ar: 2025, manad: 12 });
    expect(kommandeManader({ ar: 2026, manad: 12 })).toHaveLength(12);
  });
  it('månad som redan har en beställning är inte förvald och rörs inte', () => {
    const f = byggForslag({ ar: 2026, manad: 10 }, new Map([['2026-11', { gallring: 500 }]]));
    expect(f[0].redan).toEqual({ gallring: 500 });
    expect(f[0].vald).toBe(false);
    expect(f[1].vald).toBe(true);
  });
});

// Skälviken (883966), ur prod: de nio featuresens attribut.
const SKALVIKEN = {
  features: [
    ...[3112.50097656, 406.545654297, 1024.9777832, 2161.19848633, 1611.84179688].map(a => ({ properties: { _typ: 'hänsynsyta', FLBESKR: 'Grova lövträd F', 'SHAPE.STAr': String(a) } })),
    { properties: { _typ: 'linje', FLBESKR: 'Kraftledning', 'SHAPE.STLe': '731.434741655' } },
    { properties: { _typ: 'linje', FLBESKR: 'Basväg', 'SHAPE.STLe': '204.848339109' } },
    { properties: { _typ: 'punkt', FLBESKR: 'Larmkoordinat' } },
    { properties: { _typ: 'punkt', FLBESKR: 'Virkesavlägg' } },
    { properties: { _typ: 'traktgräns', FLBESKR: 'Föryngringsavv. utan fröt', 'SHAPE.STAr': '72883.2075195' } },
  ],
};

describe('geometrin — Skälviken', () => {
  const g = geo(SKALVIKEN)!;
  it('5 hänsynsytor 0,83 ha "Grova lövträd F"', () => {
    expect(g.hansyn).toMatchObject({ antal: 5, beskrivningar: ['Grova lövträd F'] });
    expect(g.hansyn!.ha.toFixed(2)).toBe('0.83');
  });
  it('basväg 205 m, kraftledning är en fara och räknas inte som väg', () => {
    expect(g.basvag).toEqual({ antal: 1, meter: 205 });
    expect(g.faror).toEqual([{ namn: 'Kraftledning', meter: 731 }]);
  });
  it('larmkoordinaten är inget avlägg, virkesavlägget är det', () => {
    expect(g.avlagg).toBe(1);
  });
  it('ingen geometri alls är null, inte en tom sammanfattning', () => {
    expect(geo(null)).toBeNull();
    expect(geo({})).toBeNull();
  });
});

describe('import_varningar → det osäkra', () => {
  const v = [
    'OGI ForestOwner: URBAN EK (urban.ek@vida.se) — VIDA-kontakt, ej lagrad som markägare.',
    '"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.',
    'PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.',
    'Okänt lagernamn "SV_FASTIGHET" — importeras som typ \'okänt\'.',
  ];
  it('sorterar osäkert, bekräftat och övrigt — och tappar inget', () => {
    const t = tolkaVarningar(v);
    expect(t.osakert.map(o => [o.slag, o.fil])).toEqual([['stamplingslangd', 'Skälviken.pdf'], ['okand_pdf', 'Mölleryd.pdf']]);
    expect(t.ovriga).toHaveLength(2);
    expect(t.osakert.length + t.ovriga.length).toBe(v.length);
  });
  it('en bekräftad rad tolkas som bekräftad, inte som osäker', () => {
    const t = tolkaVarningar([bekraftadRad('Skälviken.pdf')]);
    expect(t.osakert).toEqual([]);
    expect(t.bekraftade).toEqual(['Skälviken.pdf']);
  });
  it('tål null och skräp', () => {
    expect(tolkaVarningar(null).osakert).toEqual([]);
    expect(tolkaVarningar([1, null, {}]).ovriga).toEqual([]);
  });
});

describe('dokument och certifiering', () => {
  it('ett blad via traktkarta_url eller flera via traktkartor', () => {
    expect(traktkartor({ traktkartor: null, traktkarta_url: '883966_traktkarta.pdf' })).toHaveLength(1);
    expect(traktkartor({ traktkartor: [{ namn: 'b', path: 'b', ordning: 2 }, { namn: 'a', path: 'a', ordning: 1 }], traktkarta_url: 'x' }).map(k => k.path)).toEqual(['a', 'b']);
    expect(traktkartor({ traktkartor: null, traktkarta_url: null })).toEqual([]);
  });
  it('cert: sex värden i prod', () => {
    expect(certText('FSC PEFC')).toBe('FSC PEFC');
    expect(certText('None')).toBe('Ej certifierad');
    expect(certText('Not known')).toBe('Inte känt');
    expect(certText(null)).toBe('Saknas i filen');
  });
});
