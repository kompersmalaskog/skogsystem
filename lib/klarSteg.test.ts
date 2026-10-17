// Stegen i "Klar med trakten?" (GÖRA-läget): vilka som är kvar och i vilken ordning "Gå igenom" tar dem.
import { describe, it, expect } from 'vitest';
import { berakna, type HarDuSvar, type KlarIndata, type PrognosIndata, type UtforareVal } from './klarTrakt';
import { STEG_NAMN, STEG_ORDNING, genomgangSteg, kvarSteg } from './klarSteg';

const INGEN: UtforareVal = { maskinId: null, utforare: null, externNamn: '' };
const EGEN = (id: string): UtforareVal => ({ maskinId: id, utforare: null, externNamn: '' });
const FRAGOR: HarDuSvar = Object.fromEntries(['gransar', 'naturvarden', 'kulturlamningar', 'ledningar', 'snitslat', 'avlagg_hugga'].map((id) => [id, { svar: 'ja', av: 'm1', at: 'T' }])) as HarDuSvar;

function prognos(o: Partial<PrognosIndata> = {}): PrognosIndata {
  return { skordareTimmar: null, skotareTimmar: null, volym: 1800, medelstam: 0.72, areal: 3.6, bandSkordare: null, bandSkotare: null, breddat: false, skotningsavstand: null, barighet: null, terrang: null, basvagKravs: false, basvagTimmar: null, skordare: INGEN, skotare: INGEN, ...o };
}
function status(o: Partial<KlarIndata> = {}, p: Partial<PrognosIndata> = {}) {
  const pg = prognos({ barighet: o.barighet ?? null, terrang: o.terrang ?? null, skotningsavstand: o.skotningsavstand ?? null, skordare: o.skordare ?? INGEN, skotare: o.skotare ?? INGEN, ...p });
  return berakna({
    avlaggAntal: 0, basvagTexter: [], basvagForvantad: false, basvagKravs: false, barighet: null, terrang: null, skotningsavstand: null, skordare: INGEN, skotare: INGEN,
    prognos: pg, prognosGodkandUnderlag: null, harDu: {}, ...o,
  });
}

describe('kvarSteg', () => {
  it('en ny trakt: avlägg · förutsättningar · maskiner · har du · prognos — och antalet är exakt antalKvar', () => {
    const s = status();
    expect(kvarSteg(s)).toEqual(['avlagg', 'forutsattningar', 'maskiner', 'harDu', 'prognos']);
    expect(kvarSteg(s).length).toBe(s.antalKvar);
  });
  it('ett klart område försvinner; Maskiner är kvar tills BÅDA rollerna är valda', () => {
    const delvis = status({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101') });
    expect(kvarSteg(delvis)).toEqual(['maskiner', 'harDu', 'prognos']);
    const bada = status({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101'), skotare: EGEN('A110148') });
    expect(kvarSteg(bada)).toEqual(['harDu', 'prognos']);
  });
  it('Förutsättningar är kvar så länge något av de tre fälten saknas', () => {
    expect(kvarSteg(status({ avlaggAntal: 1, barighet: 'bra' }))).toContain('forutsattningar');
    expect(kvarSteg(status({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel' }))).not.toContain('forutsattningar');
  });
  it('medelstam saknas är ett eget steg (prognosen blockeras inte av det); basväg Vida har men som inte är ritad likaså', () => {
    expect(kvarSteg(status({}, { medelstam: null }))).toContain('medelstam');
    expect(kvarSteg(status({ basvagForvantad: true }))).toContain('basvag');
    expect(kvarSteg(status({ basvagForvantad: true, basvagTexter: ['Röd · 640 m'] }))).not.toContain('basvag');
  });
  it('allt klart: inga steg kvar', () => {
    const klart = status({ avlaggAntal: 1, barighet: 'bra', terrang: 'flackt', skotningsavstand: 'medel', skordare: EGEN('R64101'), skotare: EGEN('A110148'), harDu: FRAGOR, prognosGodkandUnderlag: null }, { skordareTimmar: 41, skotareTimmar: 36 });
    expect(kvarSteg(klart)).toEqual(['prognos']);              // prognosen är inte godkänd än
  });
  it('stegen kommer alltid i STEG_ORDNING, och Markägare & övrigt är aldrig "kvar" (den räknas aldrig)', () => {
    const ordning = kvarSteg(status({}, { medelstam: null }));
    expect(ordning).toEqual(STEG_ORDNING.filter((s) => ordning.includes(s)));
    expect(ordning).not.toContain('ovrigt');
    expect(ordning).not.toContain('sammanfattning');
  });
});

describe('genomgangSteg', () => {
  it('det som var kvar vid start + sist sammanfattningen', () => {
    expect(genomgangSteg(['forutsattningar', 'harDu'], false)).toEqual(['forutsattningar', 'harDu', 'sammanfattning']);
  });
  it('ett steg försvinner inte mitt i genomgången för att man just fyllt i det (listan är den från start)', () => {
    expect(genomgangSteg(['avlagg', 'maskiner'], false)).toEqual(['avlagg', 'maskiner', 'sammanfattning']);
  });
  it('prognosen läggs till om den är kvar NU (något tidigare i genomgången ändrade underlaget), aldrig dubbelt, alltid före sammanfattningen', () => {
    expect(genomgangSteg(['forutsattningar'], true)).toEqual(['forutsattningar', 'prognos', 'sammanfattning']);
    expect(genomgangSteg(['prognos'], true)).toEqual(['prognos', 'sammanfattning']);
  });
  it('tom start: bara sammanfattningen', () => {
    expect(genomgangSteg([], false)).toEqual(['sammanfattning']);
  });
});

describe('STEG_NAMN', () => {
  it('varje steg har ett namn på svenska', () => {
    for (const id of [...STEG_ORDNING, 'ovrigt'] as const) expect(STEG_NAMN[id].length, id).toBeGreaterThan(0);
    expect(STEG_NAMN.harDu).toBe('Har du …');
    expect(STEG_NAMN.ovrigt).toBe('Markägare & övrigt');
  });
});
