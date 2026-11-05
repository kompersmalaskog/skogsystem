import { describe, it, expect } from 'vitest';
import { forbered, godkandaRisker, statusOrd, faktaRad, strackaText, type PlanObjekt } from './plan';

// Prod 2026-11-05: Arvidstorp (Johannishus) och Lidhem Britteberg, fälten som de står i objekt-raden.
const arvidstorp: PlanObjekt = {
  id: 'a', namn: 'Arvidstorp RP J-Hus -25', status: 'planerad', typ: 'slutavverkning', areal: 4.1, volym: 628,
  barighet: 'medel', terrang: 'flackt', skotningsavstand: 'medel', transport_trailer_in: true,
  skotare_band: true, skotare_band_par: '1', skordare_manuell_fallning: true,
  markagare: 'Johannishus Godsförvaltning Ab', markagare_tel: '0457-123 45', markagare_ska_ha_ved: true,
  anteckningar: 'OBS! Flertalet träd stämplade utanför området. Se stämplingslängd.',
  sortiment: ['Gran timmer · Urshult', 'Kubb · Gran', 'Massa · Barr', 'Energi · Bränsleved'], cert: 'FSC PEFC',
  traktdirektiv_url: 'https://x/td.pdf', stamplingslangd_url: 'https://x/sl.pdf',
};
const lasta = { faror: [{ label: 'Kraftledning', kommentar: 'Kör inte under med kranen uppe' }], hansyn: [{ label: 'Evighetsträd', kommentar: null }] };

describe('statusOrd — läget i ett ord', () => {
  it('pågår / klar att köra / planeras fortfarande', () => {
    expect(statusOrd({ status: 'pagaende' }).text).toBe('Pågår');
    expect(statusOrd({ status: 'planerad' })).toEqual({ text: 'Klar att köra', klar: true });
    expect(statusOrd({ status: 'oplanerad' })).toEqual({ text: 'Planeras fortfarande', klar: false });
  });
});

describe('forbered — allt föraren måste veta, för sin roll', () => {
  it('skördaren: faror först, planerarens text ordagrant, manuell fällning — aldrig sortiment, inte skotarens band', () => {
    const f = forbered(arvidstorp, 'skordare', lasta);
    expect(f.faror.map((x) => x.label)).toEqual(['Kraftledning']);
    expect(f.planeraren).toBe('OBS! Flertalet träd stämplade utanför området. Se stämplingslängd.');
    const t = f.rader.map((r) => r.text);
    expect(t).toContain('Bärighet medel · flackt');
    expect(t).toContain('Manuell fällning');
    expect(t.some((x) => x.startsWith('Sortiment'))).toBe(false); // "det stämmer aldrig" (Martin 2026-11-05)
    expect(t).toContain('Certifierad: FSC, PEFC');
    expect(t).toContain('Hänsyn: Evighetsträd');
    expect(t.some((x) => x.startsWith('Band'))).toBe(false);
    expect(f.dokument.map((d) => d.namn)).toEqual(['Traktdirektiv', 'Stämplingslängd']);
    expect(f.markagare).toEqual({ namn: 'Johannishus Godsförvaltning Ab', telHref: 'tel:045712345' });
  });
  it('skotaren: band med antal par och skotningsavstånd — inte sortiment eller manuell fällning', () => {
    const t = forbered(arvidstorp, 'skotare', lasta).rader.map((r) => r.text);
    expect(t).toContain('Band behövs · 1 par');
    expect(t).toContain('Bärighet medel · flackt · medellångt skotningsavstånd');
    expect(t.some((x) => x.startsWith('Sortiment') || x.startsWith('Manuell'))).toBe(false);
  });
  it('det som inte är ifyllt står inte alls — aldrig en tom rad', () => {
    const f = forbered({ id: 'x', namn: 'Tom', status: 'oplanerad', cert: 'None' }, 'skordare', { faror: [], hansyn: [] });
    expect(f).toEqual({ faror: [], riskbedomd: false, farorOlasta: false, planeraren: null, rader: [], dokument: [], markagare: null });
  });
  it('dålig bärighet och trailer som inte kommer in är varningar', () => {
    const f = forbered({ id: 'x', namn: 'X', status: 'planerad', barighet: 'dalig', transport_trailer_in: false }, 'skotare', { faror: [], hansyn: [] });
    expect(f.rader).toEqual([{ text: 'Bärighet dålig', varning: true }, { text: 'Trailern kan inte köra in', varning: true }]);
  });
  it('faror som inte kunde läsas sägs — en tom lista är aldrig "inga faror"', () => {
    expect(forbered(arvidstorp, 'skordare', 'fel').farorOlasta).toBe(true);
  });
});

describe('fakta och sträcka', () => {
  it('faktaRad', () => expect(faktaRad(arvidstorp)).toBe('Slutavverkning · 4,1 ha · 628 m³'));
  it('sträckan är från förra trakten; okänd = ingen text', () => {
    expect(strackaText(43.6, 'Bondeskog')).toBe('44 km från Bondeskog');
    expect(strackaText(null, 'Bondeskog')).toBeNull();
  });
});

describe('godkandaRisker — det planeraren tryckt Stämmer på', () => {
  it('Arvidstorp (prod): risk och åtgärd i planerarens ord', () => {
    const rb = { godkand: { at: 'x', av: null, underlag: 'kraftledning=Kraftledning|Fäll aldrig mot ledningen. Faller ett träd på den – gå inte fram, ring 112.§motorsag=Motorsåg på trakten|Ingen motorsåg närmare maskinen än två trädlängder.' } };
    expect(godkandaRisker(rb)).toEqual([
      { risk: 'Kraftledning', atgard: 'Fäll aldrig mot ledningen. Faller ett träd på den – gå inte fram, ring 112.' },
      { risk: 'Motorsåg på trakten', atgard: 'Ingen motorsåg närmare maskinen än två trädlängder.' },
    ]);
  });
  it('ingen bedömning = null (aldrig "inga risker"); godkänd tom lista = []', () => {
    expect(godkandaRisker(null)).toBeNull();
    expect(godkandaRisker({ bort: [], egna: [], godkand: null })).toBeNull();
    expect(godkandaRisker({ godkand: { at: 'x', underlag: 'inga' } })).toEqual([]);
  });
});

describe('forbered — riskerna står först, en gång', () => {
  it('Kraftledning i både riskbedömningen och på kartan blir EN rad med åtgärd + kartans kommentar; övriga kartfaror följer', () => {
    const o = { ...arvidstorp, riskbedomning: { godkand: { at: 'x', underlag: 'kraftledning=Kraftledning|Fäll aldrig mot ledningen.§motorsag=Motorsåg på trakten|Två trädlängder.' } } };
    const f = forbered(o, 'skordare', { faror: [{ label: 'Kraftledning', kommentar: 'Kör inte under med kranen uppe' }, { label: 'Brant', kommentar: null }], hansyn: [] });
    expect(f.riskbedomd).toBe(true);
    expect(f.faror).toEqual([
      { label: 'Kraftledning', kommentar: 'Fäll aldrig mot ledningen.\nKör inte under med kranen uppe' },
      { label: 'Motorsåg på trakten', kommentar: 'Två trädlängder.' },
      { label: 'Brant', kommentar: null },
    ]);
  });
});
