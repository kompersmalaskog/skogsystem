import { describe, expect, it, vi } from 'vitest';
import { byggRader, startsidaAntal, svar, type Indata } from './oversikt';
import { MASKINTYPER, TOM, lista, underlag, type Bedomning, type MaskinTyp } from './maskinRisk';
import { byggPunkter, type Rond } from './skyddsrond';

// Reglerna här gäller när arbetsmiljön har börjat (lib/arbetsmiljo/start.ts). Före start: start.test.ts.
vi.mock('@/lib/arbetsmiljo/start', async (orig) => ({ ...(await orig<typeof import('@/lib/arbetsmiljo/start')>()), arbetsmiljoIgang: () => true }));


const NU = new Date('2026-11-03T10:00:00Z');
const tomma = () => Object.fromEntries(MASKINTYPER.map(t => [t, { ...TOM, bort: [], egna: [] }])) as unknown as Record<MaskinTyp, Bedomning>;
const godkand = (t: MaskinTyp, b: Bedomning): Bedomning => ({ ...b, godkandUnderlag: underlag(lista(t, b)), godkandTid: '2026-11-02T10:00:00Z', godkandAv: 'm' });
const allaGodkanda = () => { const b = tomma(); for (const t of MASKINTYPER) b[t] = godkand(t, b[t]); return b; };
const punkter = byggPunkter([{ id: 'P', namn: 'Giant' }]);
const klarRond: Rond = { id: 'r', punkter, deltagare: 'Martin', startad: '2026-11-02T08:00:00Z', klar: '2026-11-02T11:00:00Z', svar: [] };

const admin = (over: Partial<Indata> = {}): Indata => ({
  arAdmin: true, serArbetsledning: true, medarbetareId: 'm',
  maskinkoll: 0, atgarder: { antal: 0, stopp: 0 },
  skyddsrond: { typ: 'ok', senast: klarRond, nasta: '2027-11-02T11:00:00Z' },
  risk: { bedomningar: allaGodkanda(), kvitton: null, minTyp: null },
  ...over,
});
const forare = (over: Partial<Indata> = {}): Indata => ({
  arAdmin: false, serArbetsledning: false, medarbetareId: 'f',
  maskinkoll: 0, atgarder: null, skyddsrond: null,
  risk: { bedomningar: allaGodkanda(), kvitton: [], minTyp: 'skotare' },
  intro: { antal: 5, antalKlara: 5, klar: [], klarTid: '2026-11-01T10:00:00Z' } as never,
  ...over,
});
const rad = (d: Indata, id: string) => byggRader(d, NU).find(r => r.id === id)!;

describe('arbetsmiljöns översikt', () => {
  it('admin med allt klart: "Allt är i ordning", alla delar i fast ordning', () => {
    const r = byggRader(admin(), NU);
    expect(r.map(x => x.id)).toEqual(['atgarder', 'skyddsrond', 'riskbedomning', 'maskinkoll', 'rapportera', 'introduktion']);
    expect(svar(r)).toEqual({ text: 'Allt är i ordning' });
    expect(rad(admin(), 'skyddsrond').under).toBe('Gjord 2 nov · nästa om ett år');
    expect(rad(admin(), 'riskbedomning').under).toBe('Alla är godkända');
  });

  it('räknar det som behöver dig; ett stopp gör svaret rött', () => {
    const b = tomma(); b.skordare = godkand('skordare', b.skordare);
    const d = admin({ atgarder: { antal: 3, stopp: 1 }, skyddsrond: { typ: 'dags', senast: null }, risk: { bedomningar: b, kvitton: null, minTyp: null } });
    const r = byggRader(d, NU);
    expect(svar(r)).toEqual({ text: '3 saker behöver dig', ton: 'rod' });
    expect(rad(d, 'atgarder')).toMatchObject({ under: '1 maskin ska stå tills det är lagat', ton: 'rod' });
    expect(rad(d, 'skyddsrond').under).toBe('Ingen gjord än · en gång om året');
    expect(rad(d, 'riskbedomning').under).toBe('1 av 5 godkända');
  });

  it('ett läsfel säger det och svaret påstår aldrig "i ordning"', () => {
    const d = admin({ atgarder: null });
    expect(rad(d, 'atgarder')).toMatchObject({ under: 'Kunde inte läsas just nu', fel: true, attGora: false });
    expect(svar(byggRader(d, NU)).text).toBe('Allt kunde inte läsas');
  });

  it('föraren ser inte Åtgärder och Skyddsrond; ska läsa riskerna för sin maskin', () => {
    const d = forare({ maskinkoll: 1 });
    expect(byggRader(d, NU).map(x => x.id)).toEqual(['riskbedomning', 'maskinkoll', 'rapportera', 'introduktion']);
    expect(rad(d, 'riskbedomning').under).toBe('Läs riskerna för skotaren och oljor och kemikalier');
    expect(rad(d, 'maskinkoll').under).toBe('Dags för månadens koll · ca 1 min');
    expect(svar(byggRader(d, NU))).toEqual({ text: '2 saker behöver dig', ton: 'orange' });
  });

  it('föraren: inte godkänd risk är inget att göra, läst visar datum', () => {
    const b = tomma();
    expect(rad(forare({ risk: { bedomningar: b, kvitton: [], minTyp: 'skotare' } }), 'riskbedomning')).toMatchObject({ under: 'Riskerna för skotaren är inte klara än', attGora: false });
    const g = allaGodkanda();
    const kvitto = { medarbetareId: 'f', maskintyp: 'skotare' as const, underlag: underlag(lista('skotare', g.skotare)), tid: '2026-11-03T07:00:00Z' };
    const kem = { medarbetareId: 'f', maskintyp: 'kemikalier' as const, underlag: underlag(lista('kemikalier', g.kemikalier)), tid: '2026-11-02T07:00:00Z' };
    expect(rad(forare({ risk: { bedomningar: g, kvitton: [kvitto], minTyp: 'skotare' } }), 'riskbedomning').under).toBe('Läs riskerna för oljor och kemikalier');
    expect(rad(forare({ risk: { bedomningar: g, kvitton: [kvitto, kem], minTyp: 'skotare' } }), 'riskbedomning').under).toBe('Läst 3 nov');
  });

  it('skyddsombudet (förare) ser också Åtgärder och Skyddsrond', () => {
    const d = forare({ serArbetsledning: true, atgarder: { antal: 0, stopp: 0 }, skyddsrond: { typ: 'ok', senast: klarRond, nasta: '' } });
    expect(byggRader(d, NU).map(x => x.id).slice(0, 2)).toEqual(['atgarder', 'skyddsrond']);
  });

  it('startsidans märke räknar samma saker som svaret', () => {
    expect(startsidaAntal({ maskinkoll: 1, atgarder: 3, rader: 1, introduktion: true })).toBe(4);
    expect(startsidaAntal({ maskinkoll: 0, atgarder: 0, rader: 0, introduktion: false })).toBeNull();
    expect(startsidaAntal({ maskinkoll: null, atgarder: null, rader: 0, introduktion: false })).toBeNull();
  });
});
