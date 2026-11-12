import { describe, it, expect } from 'vitest';
import {
  RISK_TOM, aktuellaRisker, allvarliga, allvarligaForst, sattAllvarlig, aterstallForslag, borttagnaForslag, foreslaRisker, forarRisk, godkann, lasRiskbedomning, laggTillEgen,
  riskAntalText, riskLage, riskUnderlag, riskbedomningTillKolumn, taBortEgen, taBortForslag, type RiskForslagIndata,
} from './riskbedomning';
import { berakna } from './klarTrakt';
import { kvarSteg, STEG_ORDNING } from './klarSteg';

const tom: RiskForslagIndata = { markeringar: [], vidaKraftledning: false, terrang: null, barighet: null, manuellFallning: false };

describe('appens förslag', () => {
  it('inget känt = inga förslag', () => {
    expect(foreslaRisker(tom)).toEqual([]);
  });

  it('kraftledning ur Vidas underlag går före kartan som källa, och står en gång', () => {
    const r = foreslaRisker({ ...tom, vidaKraftledning: true, markeringar: [{ slag: 'symbol', typ: 'powerline' }, { slag: 'linje', typ: 'powerline' }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nyckel: 'kraftledning', kalla: 'vida' });
    expect(r[0].atgard).toContain('Fäll aldrig mot ledningen');
  });

  it('brant, blött och motorsåg ur förutsättningarna; alltid i katalogens ordning', () => {
    const r = foreslaRisker({ ...tom, terrang: 'brant', barighet: 'dalig', manuellFallning: true, markeringar: [{ slag: 'symbol', typ: 'huntingtower' }] });
    expect(r.map((x) => x.nyckel)).toEqual(['brant', 'blott', 'motorsag']);   // jakttorn föreslås inte (Martin 2026-11-12)
    expect(r.find((x) => x.nyckel === 'brant')!.kalla).toBe('forutsattningar');
  });

  it('ytor och symboler på kartan', () => {
    const r = foreslaRisker({ ...tom, markeringar: [{ slag: 'zon', typ: 'steep' }, { slag: 'zon', typ: 'noentry' }, { slag: 'symbol', typ: 'groundcable' }, { slag: 'symbol', typ: 'warning' }, { slag: 'zon', typ: 'wet' }] });
    expect(r.map((x) => x.nyckel)).toEqual(['markkabel', 'brant', 'blott', 'ej_framkomlig', 'varning']);
  });

  it('hänsyn och kultur är inga arbetsmiljörisker — de föreslås inte', () => {
    expect(foreslaRisker({ ...tom, markeringar: [{ slag: 'zon', typ: 'protected' }, { slag: 'symbol', typ: 'culturemonument' }, { slag: 'symbol', typ: 'eternitytree' }] })).toEqual([]);
  });
});

describe('planerarens beslut', () => {
  const forslag = foreslaRisker({ ...tom, vidaKraftledning: true, terrang: 'brant' });

  it('"Gäller inte" tar bort förslaget ur listan och lägger det bland borttagna; Ta tillbaka ångrar', () => {
    const rb = taBortForslag(RISK_TOM, 'brant');
    expect(aktuellaRisker(forslag, rb).map((r) => r.nyckel)).toEqual(['kraftledning']);
    expect(borttagnaForslag(forslag, rb).map((r) => r.nyckel)).toEqual(['brant']);
    expect(aktuellaRisker(forslag, aterstallForslag(rb, 'brant'))).toHaveLength(2);
  });

  it('egna risker läggs sist och kräver både risk och åtgärd', () => {
    expect(laggTillEgen(RISK_TOM, 'a', 'Allmän väg', ' ')).toBeNull();
    expect(laggTillEgen(RISK_TOM, 'a', '', 'Skylt')).toBeNull();
    const rb = laggTillEgen(RISK_TOM, 'a', ' Allmän väg ', 'Skylt när vi lastar')!;
    const lista = aktuellaRisker(forslag, rb);
    expect(lista[lista.length - 1]).toEqual({ nyckel: 'egen:a', risk: 'Allmän väg', atgard: 'Skylt när vi lastar', kalla: 'planerare', allvarlig: true });
    expect(aktuellaRisker(forslag, taBortEgen(rb, 'a'))).toHaveLength(2);
  });

  it('Stämmer gäller exakt listan: en ny risk på kartan gör den inte godkänd längre', () => {
    const lista = aktuellaRisker(forslag, RISK_TOM);
    const rb = godkann(RISK_TOM, lista, 'm1', '2026-11-01T10:00:00Z');
    expect(riskLage(lista, rb)).toBe('godkand');
    const nyLista = aktuellaRisker(foreslaRisker({ ...tom, vidaKraftledning: true, terrang: 'brant', manuellFallning: true }), rb);
    expect(riskLage(nyLista, rb)).toBe('kvar');
  });

  it('en tom lista går att godkänna ("Inga särskilda risker")', () => {
    const rb = godkann(RISK_TOM, [], 'm1', '2026-11-01T10:00:00Z');
    expect(riskLage([], rb)).toBe('godkand');
    expect(riskLage([], RISK_TOM)).toBe('kvar');
  });

  it('fingeravtrycket bryr sig inte om ordningen men om texten', () => {
    const a = aktuellaRisker(forslag, RISK_TOM);
    expect(riskUnderlag([...a].reverse())).toBe(riskUnderlag(a));
    expect(riskUnderlag([{ ...a[0], atgard: 'annat' }, a[1]])).not.toBe(riskUnderlag(a));
  });
});

describe('lagring', () => {
  it('tål skräp och sparar en tom bedömning som null', () => {
    expect(lasRiskbedomning(null)).toEqual({ bort: [], egna: [], mindre: [], godkand: null });
    expect(lasRiskbedomning({ bort: ['brant', 3], egna: [{ id: 'a', risk: 'x', atgard: 'y' }, { id: 1 }], godkand: { at: 'x' } }))
      .toEqual({ bort: ['brant'], egna: [{ id: 'a', risk: 'x', atgard: 'y' }], mindre: [], godkand: null });
    expect(riskbedomningTillKolumn(RISK_TOM)).toBeNull();
  });

  it('det som sparas läses tillbaka likadant', () => {
    const rb = godkann(laggTillEgen(taBortForslag(RISK_TOM, 'brant'), 'a', 'Väg', 'Skylt')!, [], 'm1', '2026-11-01T10:00:00Z');
    expect(lasRiskbedomning(JSON.parse(JSON.stringify(riskbedomningTillKolumn(rb))))).toEqual(rb);
  });
});

describe('föraren', () => {
  const lista = foreslaRisker({ ...tom, vidaKraftledning: true });
  it('ingen bedömning gjord = ingen lista', () => {
    expect(forarRisk(lista, RISK_TOM, [])).toEqual({ risker: null, underlag: null, last: false });
  });
  it('läst gäller bara exakt den listan', () => {
    const rb = godkann(RISK_TOM, lista, 'm1', '2026-11-01T10:00:00Z');
    const u = riskUnderlag(lista);
    expect(forarRisk(lista, rb, [u]).last).toBe(true);
    const ny = foreslaRisker({ ...tom, vidaKraftledning: true, terrang: 'brant' });
    expect(forarRisk(ny, rb, [u]).last).toBe(false);
    expect(forarRisk(ny, rb, [u]).risker).toHaveLength(2);
  });
  it('antalet i ord', () => {
    expect(riskAntalText(0)).toBe('Inga särskilda risker');
    expect(riskAntalText(1)).toBe('1 risk');
    expect(riskAntalText(3)).toBe('3 risker');
  });
});

describe('Klar med trakten?', () => {
  it('Risker är ett steg mellan Har du … och Prognos, och räknas som kvar tills det godkänts', () => {
    expect(STEG_ORDNING.indexOf('risker')).toBe(STEG_ORDNING.indexOf('harDu') + 1);
    const bas: any = {
      avlaggAntal: 1, basvagTexter: [], basvagForvantad: false, basvagKravs: null, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'kort',
      skordare: { maskinId: 'A', utforare: null, externNamn: '' }, skotare: { maskinId: 'B', utforare: null, externNamn: '' },
      prognos: { skordareTimmar: 1, skotareTimmar: 1, volym: 1, medelstam: 1, areal: 1, bandSkordare: null, bandSkotare: null, breddat: false, skotningsavstand: 'kort', barighet: 'bra', terrang: 'flackt', basvagKravs: null, basvagTimmar: null, skordare: { maskinId: 'A', utforare: null, externNamn: '' }, skotare: { maskinId: 'B', utforare: null, externNamn: '' } },
      prognosGodkandUnderlag: null, harDu: {},
    };
    const utan = berakna(bas);
    const med = berakna({ ...bas, risker: { antal: 2, kvar: true } });
    expect(med.antalKvar).toBe(utan.antalKvar + 1);
    expect(kvarSteg(med)).toContain('risker');
    const klar = berakna({ ...bas, risker: { antal: 2, kvar: false } });
    expect(kvarSteg(klar)).not.toContain('risker');
    expect(klar.poster.find((p) => p.id === 'risker')!.varde).toBe('2 risker');
  });
});

describe('allvarlig eller mindre allvarlig (AFS 2023:1 11 §)', () => {
  const i: RiskForslagIndata = { markeringar: [{ slag: 'symbol', typ: 'powerline' }, { slag: 'symbol', typ: 'groundcable' }], vidaKraftledning: false, terrang: null, barighet: null, manuellFallning: false };
  const forslag = foreslaRisker(i);

  it('allt är allvarligt från början, och fingeravtrycket är detsamma som före ändringen', () => {
    const lista = aktuellaRisker(forslag, RISK_TOM);
    expect(lista.every((r) => r.allvarlig)).toBe(true);
    expect(riskUnderlag(lista)).not.toContain('mindre');
  });

  it('mindre allvarlig ändrar listan och gör ett godkännande ogiltigt; tillbaka till allvarlig gör det giltigt igen', () => {
    const godk = godkann(RISK_TOM, aktuellaRisker(forslag, RISK_TOM), 'm', '2026-11-05');
    const mindre = sattAllvarlig(godk, 'markkabel', false);
    const lista = aktuellaRisker(forslag, mindre);
    expect(lista.find((r) => r.nyckel === 'markkabel')?.allvarlig).toBe(false);
    expect(riskLage(lista, mindre)).toBe('kvar');
    const tillbaka = sattAllvarlig(mindre, 'markkabel', true);
    expect(riskLage(aktuellaRisker(forslag, tillbaka), tillbaka)).toBe('godkand');
  });

  it('bara de allvarliga i hytten, allvarliga först i listan', () => {
    const rb = sattAllvarlig(RISK_TOM, 'kraftledning', false);
    const lista = aktuellaRisker(forslag, rb);
    expect(allvarliga(lista).map((r) => r.nyckel)).toEqual(['markkabel']);
    expect(allvarligaForst(lista).map((r) => r.nyckel)).toEqual(['markkabel', 'kraftledning']);
  });

  it('sparas och läses tillbaka; utan mindre sparas samma form som förut', () => {
    const rb = sattAllvarlig(RISK_TOM, 'markkabel', false);
    expect(lasRiskbedomning(riskbedomningTillKolumn(rb))).toEqual(rb);
    const utan = taBortForslag(RISK_TOM, 'brant');
    expect(riskbedomningTillKolumn(utan)).toEqual({ bort: ['brant'], egna: [], godkand: null });
  });

  it('en borttagen egen risk tar med sig sitt allvar', () => {
    const rb = sattAllvarlig(laggTillEgen(RISK_TOM, 'a', 'Väg', 'Skylt')!, 'egen:a', false);
    expect(taBortEgen(rb, 'a').mindre).toEqual([]);
  });
});
