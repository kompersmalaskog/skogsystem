import { describe, it, expect } from 'vitest';
import { arCertifierat, tolkaAreal, kravAntal, miljoKrav, raknaMiljo, kravStatus, arPrick, prickarSynliga, PRICK_DIAMETER_PX } from './miljokrav';

describe('arCertifierat — objekt.cert är fri text, prod har sex värden', () => {
  it('FSC / PEFC / "FSC PEFC" = certifierat', () => {
    for (const c of ['FSC', 'PEFC', 'FSC PEFC', 'fsc', ' Pefc ', 'FSC, PEFC']) expect(arCertifierat(c)).toBe(true);
  });
  it('"Ej certifierad", "None", "Not known", tomt och null = inte certifierat (aldrig ett gissat krav)', () => {
    for (const c of ['Ej certifierad', 'None', 'Not known', '', '   ', null, undefined]) expect(arCertifierat(c as any)).toBe(false);
  });
  it('ett ord som bara innehåller bokstäverna ("FSCX") räknas inte', () => {
    expect(arCertifierat('FSCX')).toBe(false);
  });
});

describe('tolkaAreal', () => {
  it('tal, text med komma och punkt', () => {
    expect(tolkaAreal(3.64)).toBe(3.64);
    expect(tolkaAreal('3,64')).toBe(3.64);
    expect(tolkaAreal(' 5.24 ')).toBe(5.24);
  });
  it('ogiltigt/noll/negativt → null', () => {
    for (const v of [null, undefined, '', 'abc', 0, '0', -2, NaN]) expect(tolkaAreal(v)).toBeNull();
  });
});

describe('krav — 3 högstubbar/ha och 10 evighetsträd/ha, avrundat UPPÅT, bara certifierat', () => {
  it('KODBEVIS: Östra-Höka 3,64 ha → 11 högstubbar och 37 evighetsträd', () => {
    const k = miljoKrav(3.64, 'FSC PEFC');
    expect(k.hogstubbar).toBe(11);      // ceil(10,92)
    expect(k.evighetstrad).toBe(37);    // ceil(36,4)
    expect(k.certifierat).toBe(true);
    expect(k.arealHa).toBe(3.64);
  });
  it('avrundning uppåt, aldrig neråt', () => {
    expect(kravAntal(0.1, 3)).toBe(1);     // 0,3 → 1
    expect(kravAntal(5.24, 3)).toBe(16);   // 15,72 → 16
    expect(kravAntal(5.24, 10)).toBe(53);  // 52,4 → 53
  });
  it('flyttalsbrus ger inte ett för högt krav: 1,2 ha × 10 = 12 (inte 13), 0,7 × 10 = 7', () => {
    expect(kravAntal(1.2, 10)).toBe(12);
    expect(kravAntal(0.7, 10)).toBe(7);
    expect(kravAntal(1.1, 3)).toBe(4);     // 3,3000000000000003 → 4 (riktigt uppåt)
    expect(kravAntal(2, 3)).toBe(6);       // exakt
  });
  it('ej certifierat → inget krav (bara antal), även med areal', () => {
    for (const cert of ['None', 'Ej certifierad', 'Not known', null]) {
      const k = miljoKrav(3.64, cert);
      expect(k.certifierat).toBe(false);
      expect(k.hogstubbar).toBeNull();
      expect(k.evighetstrad).toBeNull();
    }
  });
  it('areal saknas → inget krav, även när certifierat', () => {
    const k = miljoKrav(null, 'FSC');
    expect(k.certifierat).toBe(true);
    expect(k.hogstubbar).toBeNull();
    expect(k.evighetstrad).toBeNull();
  });
});

describe('raknaMiljo — alla markeringar på objektet, oavsett vem som satte dem', () => {
  it('högstubbar och evighetsträd (+ naturhörna) summeras med antal, saknat antal = 1', () => {
    const r = raknaMiljo([
      { type: 'highstump' }, { type: 'highstump', antal: 3 },
      { type: 'eternitytree' }, { type: 'eternitytree', antal: 2 }, { type: 'naturecorner', antal: 5 },
      { type: 'landing' }, { type: 'warning' }, {},
    ]);
    expect(r).toEqual({ hogstubbar: 4, evighetstrad: 8 });
  });
  it('tom/saknad lista → 0', () => {
    expect(raknaMiljo([])).toEqual({ hogstubbar: 0, evighetstrad: 0 });
    expect(raknaMiljo(null)).toEqual({ hogstubbar: 0, evighetstrad: 0 });
  });
  it('orimligt antal (0, negativt, NaN) räknas som 1 — en satt markering försvinner aldrig ur räkningen', () => {
    expect(raknaMiljo([{ type: 'highstump', antal: 0 }, { type: 'highstump', antal: -3 }, { type: 'highstump', antal: NaN }]).hogstubbar).toBe(3);
  });
});

describe('kravStatus — "efter" i förhållande till avverkad andel', () => {
  it('KODBEVIS: efter vid 50 % avverkat och 2 av 11', () => {
    expect(kravStatus(2, 11, 0.5)).toBe('efter');
  });
  it('i fas vid exakt det antal som borde finnas: 50 % av 11 → floor(5,5) = 5', () => {
    expect(kravStatus(4, 11, 0.5)).toBe('efter');
    expect(kravStatus(5, 11, 0.5)).toBe('ok');
    expect(kravStatus(6, 11, 0.5)).toBe('ok');
  });
  it('början av objektet: inte orange förrän minst en hel markering borde finnas (3 % av 11 = 0,33)', () => {
    expect(kravStatus(0, 11, 0)).toBe('ok');
    expect(kravStatus(0, 11, 0.03)).toBe('ok');
    expect(kravStatus(0, 11, 0.1)).toBe('efter');   // 1,1 → 1 borde finnas
  });
  it('uppfyllt (bock) när antal ≥ krav, oavsett avverkad andel', () => {
    expect(kravStatus(11, 11, 0.2)).toBe('uppfyllt');
    expect(kravStatus(14, 11, 0.9)).toBe('uppfyllt');
  });
  it('inget krav → "ingen" (bara antalet visas)', () => {
    expect(kravStatus(4, null, 0.8)).toBe('ingen');
  });
  it('okänd andel dömer aldrig — ok i stället för ett falskt "efter"', () => {
    expect(kravStatus(0, 11, null)).toBe('ok');
    expect(kravStatus(0, 11, NaN)).toBe('ok');
  });
  it('andel utanför 0–1 klampas (en avverkad yta kan inte vara >100 %)', () => {
    expect(kravStatus(10, 11, 1.4)).toBe(kravStatus(10, 11, 1));   // klampas till 1 → borde 11
    expect(kravStatus(10, 11, 1.4)).toBe('efter');
    expect(kravStatus(0, 11, -0.5)).toBe('ok');                    // klampas till 0 → borde 0
  });
  it('evighetsträd: 12 av 37 vid 60 % → borde 22 → efter (mockupens värden)', () => {
    expect(kravStatus(12, 37, 0.6)).toBe('efter');
  });
});

describe('prickar i körvyn', () => {
  it('högstubbe och evighetsträd är prickar; naturhörnan och övriga symboler är det inte', () => {
    expect(arPrick('highstump')).toBe(true);
    expect(arPrick('eternitytree')).toBe(true);
    for (const t of ['naturecorner', 'landing', 'warning', 'culturestump', '', null, undefined]) expect(arPrick(t as any)).toBe(false);
  });
  it('lagret är PÅ som standard (saknad nyckel) och döljs bara av ett uttryckligt false', () => {
    expect(prickarSynliga({})).toBe(true);
    expect(prickarSynliga(null)).toBe(true);
    expect(prickarSynliga({ miljoPrickar: true })).toBe(true);
    expect(prickarSynliga({ miljoPrickar: false })).toBe(false);
  });
  it('ca 6 px', () => { expect(PRICK_DIAMETER_PX).toBe(6); });
});
