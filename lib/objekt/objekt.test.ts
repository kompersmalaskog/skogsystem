import { describe, it, expect } from 'vitest';
import { inlagtSumma, lageText, bestalltSumma, rubrikTal, visadVolym } from './tackning';
import { saknas, tillstandId, TILLSTAND_TEXT } from './tillstand';
import { byggForslag, kommandeManader, stegaManad, manadEtikett } from './manad';
import { certText, fragor, geometriSammanfattning as geo, noterat, traktkartor } from './filenGav';

// Facit: prod oktober 2026 (verifierat mot databasen 2026-10-19).
const GALLRING = [{ volym: 146 }, { volym: 100 }, { volym: 88 }];
const SLUT = [{ volym: 3495 }, { volym: 1734 }, { volym: 1005 }];

describe('täckning', () => {
  it('gallring 334 / 1 000 — 666 kvar', () => {
    const inlagt = inlagtSumma(GALLRING);
    expect(inlagt).toBe(334);
    expect(rubrikTal(inlagt, bestalltSumma([{ volym: 1000 }]))).toBe('334 / 1 000 m³fub');
    expect(lageText(inlagt, 1000)).toEqual({ text: '666 m³fub kvar till beställningen', fylld: false, lage: 'kvar' });
  });
  it('slutavverkning 6 234 / 5 000 — fylld, 1 234 över (det avslutade Bågskyttebanan räknas)', () => {
    const inlagt = inlagtSumma(SLUT);
    expect(inlagt).toBe(6234);
    expect(lageText(inlagt, 5000)).toEqual({ text: 'Beställningen fylld · 1 234 m³fub över', fylld: true, lage: 'over' });
  });
  it('exakt lika är fylld utan "över"; ingen beställning säger det', () => {
    expect(lageText(1000, 1000)).toEqual({ text: 'Beställningen fylld', fylld: true, lage: 'fylld' });
    expect(lageText(5, null).text).toBe('Ingen beställning inlagd');
    expect(rubrikTal(5, null)).toBe('5 / – m³fub');
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
  const OKAND = ['PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.'];
  const bas = { typ: 'slutavverkning', status: 'oplanerad', volym: 1005, kalla: 'envz', traktdirektiv_url: 'td.pdf', import_varningar: [] as unknown };
  it('saknas: bara det som kräver en hand, aldrig på klara objekt', () => {
    expect(saknas(bas)).toEqual([]);
    expect(saknas({ ...bas, import_varningar: OKAND })).toEqual(['1 fråga']);
    expect(saknas({ ...bas, status: 'avslutat', import_varningar: OKAND })).toEqual([]);
    expect(saknas({ ...bas, volym: null, traktdirektiv_url: null })).toEqual(['saknar volym', 'saknar traktdirektiv']);
  });
  it('stämplingslängd flaggas ALDRIG som saknad (4 av 42 slutavverkningar har en — normaltillståndet)', () => {
    expect(saknas({ ...bas }).join()).not.toMatch(/stämplingslängd/);
    expect(saknas({ ...bas, typ: 'gallring' }).join()).not.toMatch(/stämplingslängd/);
  });
  it('GROT och objekt lagda för hand/via Starta jobb nagas inte för volym och traktdirektiv', () => {
    expect(saknas({ ...bas, typ: 'grot', volym: null, traktdirektiv_url: null, kalla: 'starta-jobb' })).toEqual([]);
    expect(saknas({ ...bas, traktdirektiv_url: null, kalla: 'manuell' })).toEqual([]);
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

describe('frågor ur import_varningar', () => {
  const v = [
    'OGI ForestOwner: URBAN EK (urban.ek@vida.se) — VIDA-kontakt, ej lagrad som markägare.',
    '"Skälviken.pdf" tolkad som stämplingslängd via Info — OSÄKER, bekräfta i UI:t.',
    'PDF utan känt suffix: "Mölleryd.pdf" — sparad som övrigt dokument.',
    'Okänt lagernamn "SV_FASTIGHET" — importeras som typ \'okänt\'.',
  ];
  const dok = { stamplingslangd_url: 'sl.pdf', ovriga_dokument: [{ namn: 'Mölleryd.pdf', path: '886465_ovrigt_0.pdf' }] };
  it('bara det som kräver en människa blir en fråga; Skälviken och Mölleryd är SAMMA fråga', () => {
    const f = fragor(v, dok);
    expect(f.map(q => [q.fil, q.nannderStamplingslangd])).toEqual([['Skälviken.pdf', true], ['Mölleryd.pdf', false]]);
    expect(f[0].path).toBe('sl.pdf');
    expect(f[1].path).toBe('886465_ovrigt_0.pdf');
  });
  it('noterat visas hopfällt, utveckling visas aldrig', () => {
    expect(noterat(v)).toEqual([v[0]]);
    expect(noterat(v).join()).not.toMatch(/Okänt lagernamn/);
  });
  it('tål null, skräp och nya objektrader', () => {
    expect(fragor(null, dok)).toEqual([]);
    expect(fragor([1, null, {}], dok)).toEqual([]);
    expect(fragor([{ nyckel: 'okand_pdf:A.pdf', sort: 'fraga', text: 'x', fil: 'A.pdf' }], dok)).toHaveLength(1);
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
