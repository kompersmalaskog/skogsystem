import { describe, it, expect } from 'vitest';
import { parseUrsprung, parseArbetsform, tolkaAvtalsform, tolkaAtgard } from './avtalsform';
import { parseTraktdirektivText } from './td-parser';
import { parseObjektInfo } from './objektinfo';
import { tdText } from './__fixtures__/td-text';

describe('Ursprung -> avtalsform (läses ur TD-sidhuvudet, gissas aldrig)', () => {
  it('Rotpost -> Rp (Skälviken)', () => {
    expect(parseUrsprung(tdText({ ursprung: 'Rotpost' }))).toBe('Rotpost');
    expect(tolkaAvtalsform(tdText({ ursprung: 'Rotpost' }))).toEqual({ avtalsform: 'Rp', varning: null });
  });
  it('Avverkningsuppdrag -> Au', () => {
    expect(tolkaAvtalsform(tdText({ ursprung: 'Avverkningsuppdrag' }))).toEqual({ avtalsform: 'Au', varning: null });
  });
  it('versaler/blanksteg spelar ingen roll, förkortningarna Rp/Au är samma sak', () => {
    expect(tolkaAvtalsform(tdText({ ursprung: 'ROTPOST' })).avtalsform).toBe('Rp');
    expect(tolkaAvtalsform(tdText({ ursprung: 'Rp' })).avtalsform).toBe('Rp');
    expect(tolkaAvtalsform(tdText({ ursprung: 'AU' })).avtalsform).toBe('Au');
  });
  it('fungerar även utan kontraktsnummer i kolumnen', () => {
    expect(tolkaAvtalsform(tdText({ ursprung: 'Rotpost', kontrakt: '' })).avtalsform).toBe('Rp');
  });
  it('okänt värde -> tomt + varning med den råa texten (inget Au, ingen gissning)', () => {
    const r = tolkaAvtalsform(tdText({ ursprung: 'Egen skog' }));
    expect(r.avtalsform).toBeNull();
    expect(r.varning).toContain('"Egen skog"');
  });
  it('filen har ingen Ursprung-kolumn alls -> tomt + varning (inte Au)', () => {
    const r = tolkaAvtalsform(tdText({ ursprung: null }));
    expect(r.avtalsform).toBeNull();
    expect(r.varning).toMatch(/inget "Ursprung"|Ursprung/);
  });
  it('tom text -> tomt + varning', () => {
    expect(tolkaAvtalsform('').avtalsform).toBeNull();
    expect(tolkaAvtalsform('').varning).not.toBeNull();
  });
  it('rubrikraden finns men värdet saknas -> varning som citerar vad som står', () => {
    const r = tolkaAvtalsform('Traktnr Kontraktsnr Ursprung Datum 887818 972548 (anges vid fakturering) 2026-09-01');
    expect(r.avtalsform).toBeNull();
    expect(r.varning).toContain('Ursprung');
  });
  it('"Ursprung: Rotpost" med kolon läses också (om sidhuvudet ser annorlunda ut)', () => {
    expect(tolkaAvtalsform('Allmänt\nUrsprung: Rotpost\nVirkesorder 11161397').avtalsform).toBe('Rp');
  });
});

describe('Arbetsform -> åtgärd (kolumnrubrik; värdet står på raden UNDER, bara känt åtgärdsord)', () => {
  const cases: Array<[string, string | null]> = [
    ['Första gallring', 'Första gallring'],
    ['Andra gallring', 'Andra gallring'],
    ['Gallring', 'Gallring'],
    ['Lövgallring', 'Lövgallring'],
    ['Föryngringsavverkning', 'Föryngring'],
    ['föryngringsavverkning', 'Föryngring'],
    ['Slutavverkning', null],          // säger typ, inte åtgärd
    ['Gallringsskog', null],           // hela ord: inte "gallring"
    ['Röjning', null],
    ['', null],                        // rubrikraden finns, raden under saknar värde
  ];
  it.each(cases)('raden under rubriken slutar på "%s" -> %s', (arbetsform, forvantat) => {
    expect(tolkaAtgard(tdText({ arbetsform })).atgard).toBe(forvantat);
  });

  it('den riktiga radformen: rubrikrad "…ArbetsformLKF SKS-anmält:" + "JOHANNISHUS 1:2 FSC PEFC 108101 Föryngringsavverkning"', () => {
    const text = [
      'Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält:',
      'JOHANNISHUS 1:2 FSC PEFC 108101 Föryngringsavverkning',
    ].join('\n');
    expect(parseArbetsform(text)).toBe('JOHANNISHUS 1:2 FSC PEFC 108101 Föryngringsavverkning');
    expect(tolkaAtgard(text)).toEqual({ atgard: 'Föryngring', varning: null });
  });
  it('texten direkt efter etiketten ("LKF SKS-anmält:") är nästa rubrik och tolkas aldrig som värde', () => {
    const t = tolkaAtgard('Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält:\nJOHANNISHUS 1:2 FSC PEFC 108101 Gallring');
    expect(t.atgard).toBe('Gallring');
    const utan = tolkaAtgard('Fastighetsbeteckning Cert ArbetsformLKF SKS-anmält:\nJOHANNISHUS 1:2 FSC PEFC 108101');
    expect(utan.atgard).toBeNull();
    expect(utan.varning).toContain('"JOHANNISHUS 1:2 FSC PEFC 108101"');
    expect(utan.varning).not.toContain('SKS-anmält');
  });
  it('längsta åtgärdsordet gäller: "Första gallring" är inte "Gallring"', () => {
    expect(tolkaAtgard('Cert Arbetsform\nFSC 1 Första gallring').atgard).toBe('Första gallring');
    expect(tolkaAtgard('Cert Arbetsform\nFSC 1 Lövgallring').atgard).toBe('Lövgallring');
  });
  it('okänd rad -> tomt + varning med råtexten', () => {
    const r = tolkaAtgard(tdText({ arbetsform: 'Röjning' }));
    expect(r.atgard).toBeNull();
    expect(r.varning).toContain('Röjning');
  });
  it('ingen Arbetsform-kolumn i filen -> tomt och ingen varning', () => {
    expect(tolkaAtgard(tdText({})).atgard).toBeNull();
    expect(tolkaAtgard(tdText({})).varning).toBeNull();
    expect(parseArbetsform(tdText({}))).toBeNull();
  });
  it('ett stycke som nämner "arbetsform" är ingen rubrikrad', () => {
    expect(tolkaAtgard('Vald arbetsform ska anpassas efter marken.\nGallring enligt plan').atgard).toBeNull();
  });
  it('Ursprung och Arbetsform i samma text läses oberoende av varandra', () => {
    const td = parseTraktdirektivText(tdText({ ursprung: 'Rotpost', arbetsform: 'Föryngringsavverkning' }));
    expect(td).toMatchObject({ avtalsform: 'Rp', atgard: 'Föryngring' });
  });
});

describe('parseTraktdirektivText bär avtalsform/åtgärd — och rör inte det parsern redan läste', () => {
  it('Skälviken: Rp, Föryngring, kontraktsnr fortfarande 972548, VO 11161397', () => {
    const td = parseTraktdirektivText(tdText({ ursprung: 'Rotpost', arbetsform: 'Föryngringsavverkning' }));
    expect(td).toMatchObject({ avtalsform: 'Rp', atgard: 'Föryngring', kontraktsnummer: '972548', vo_nummer: '11161397', typ: 'slutavverkning' });
    expect(td.tolkningsvarningar).toEqual([]);
  });
  it('fil utan Ursprung: avtalsform null + varning (inte Au)', () => {
    const td = parseTraktdirektivText(tdText({ ursprung: null }));
    expect(td.avtalsform).toBeNull();
    expect(td.tolkningsvarningar).toHaveLength(1);
  });
});

describe('Purpose i object-info', () => {
  const xml = (purpose: string) => `<?xml version="1.0"?><ObjectInfo><Purpose>${purpose}</Purpose></ObjectInfo>`;
  it('GROT-skotning blir typ grot', () => {
    const r = parseObjektInfo(xml('GROT-skotning'), null);
    expect(r.falt.typ).toBe('grot');
    expect(r.varningar).toEqual([]);
  });
  it('Slutavverkning och Gallring som förut', () => {
    expect(parseObjektInfo(xml('Slutavverkning'), null).falt.typ).toBe('slutavverkning');
    expect(parseObjektInfo(xml('Gallring'), null).falt.typ).toBe('gallring');
  });
  it('Övrig Avverkning är okänt: ingen typ, en varning', () => {
    const r = parseObjektInfo(xml('Övrig Avverkning'), null);
    expect(r.falt.typ).toBeUndefined();
    expect(r.varningar.join(' ')).toContain('Övrig Avverkning');
  });
  it('Purpose bär aldrig åtgärd', () => {
    expect((parseObjektInfo(xml('Gallring'), null).falt as any).atgard).toBeUndefined();
  });
});
