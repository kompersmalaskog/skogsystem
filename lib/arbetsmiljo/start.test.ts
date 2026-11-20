import { describe, expect, it } from 'vitest';
import { ARBETSMILJO_START_AR, BORJAR_TEXT, arbetsmiljoIgang } from './start';
import { byggArshjul, arshjulRad } from './arshjul';
import { byggArshjulNotis, koaArshjulPaminnelse, AM_ARSHJUL } from './arshjulNotis';
import { byggRader, svar } from './oversikt';
import { hamtaArbetsmiljoRader } from './startsida';
import { MASKINTYPER, TOM, type Bedomning, type MaskinTyp } from './maskinRisk';

// Ingen mock här: det här är reglerna FÖRE start, med de riktiga datumen.
const NOV_2026 = new Date('2026-11-11T08:00:00Z'); // onsdag 09:00 svensk tid
const tomRisk = () => Object.fromEntries(MASKINTYPER.map(t => [t, { ...TOM, bort: [], egna: [] }])) as unknown as Record<MaskinTyp, Bedomning>;

describe('arbetsmiljön börjar 2027', () => {
  it('startar vid nyår i svensk tid, inte i UTC', () => {
    expect(ARBETSMILJO_START_AR).toBe(2027);
    expect(arbetsmiljoIgang(NOV_2026)).toBe(false);
    expect(arbetsmiljoIgang(new Date('2026-12-31T22:59:00Z'))).toBe(false); // 23:59 nyårsafton
    expect(arbetsmiljoIgang(new Date('2026-12-31T23:00:00Z'))).toBe(true); // 00:00 nyårsdagen
  });

  it('årshjulet säger inte att något är sent före start, men det som är gjort står kvar', () => {
    const rader = byggArshjul({ nu: NOV_2026, gjorda: [{ punkt: 'osa', gjordTid: '2026-03-10T08:00:00Z', anteckning: null }], ronder: [], risk: tomRisk() });
    expect(rader.some(r => r.attGora)).toBe(false);
    expect(rader.find(r => r.punkt.id === 'osa')!.under).toBe('Gjord 10 mars');
    expect(rader.find(r => r.punkt.id === 'skyddsrond')!.under).toBe(BORJAR_TEXT);
    expect(arshjulRad(rader, 2026)).toEqual({ titel: 'Året 2026', under: 'Börjar januari 2027', attGora: false });
  });

  it('i januari 2027 är riskbedömningen dags', () => {
    const rader = byggArshjul({ nu: new Date('2027-01-12T09:00:00Z'), gjorda: [], ronder: [], risk: tomRisk() });
    expect(rader.find(r => r.punkt.id === 'riskbedomning')).toMatchObject({ under: 'Dags nu', attGora: true });
    expect(rader.filter(r => r.attGora)).toHaveLength(1);
  });

  it('ingen påminnelse om årshjulet köas eller skickas före start, och databasen rörs inte', async () => {
    const anrop: string[] = [];
    const sb = { from: (t: string) => { anrop.push(t); throw new Error('ska inte läsas'); } } as never;
    expect(await koaArshjulPaminnelse(sb, NOV_2026)).toEqual({ ok: true, koade: 0, hoppade: 'arbetsmiljön börjar 2027' });
    expect(anrop).toEqual([]);
    const u = await byggArshjulNotis({ typ: AM_ARSHJUL }, async () => { throw new Error('ska inte läsas'); }, NOV_2026);
    expect(u).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — arbetsmiljön börjar 2027' });
  });

  it('Arbetsmiljö-sidan: bara åtgärderna räknas före start, resten står som information', () => {
    const r = byggRader({
      arAdmin: true, serArbetsledning: true, medarbetareId: 'm',
      maskinkoll: 1, atgarder: { antal: 1, stopp: 1 },
      skyddsrond: { typ: 'dags', senast: null },
      risk: { bedomningar: tomRisk(), kvitton: null, minTyp: null },
      arshjul: byggArshjul({ nu: NOV_2026, gjorda: [], ronder: [], risk: tomRisk() }),
      kemikalier: [{ id: 'k', namn: 'Olja', plats: null, sdbSokvag: null } as never],
    }, NOV_2026);
    expect(svar(r)).toEqual({ text: '1 sak behöver dig', ton: 'rod' });
    expect(r.filter(x => x.attGora).map(x => x.id)).toEqual(['atgarder']);
    expect(r.filter(x => x.id !== 'atgarder').every(x => !x.ton)).toBe(true);
    expect(r.find(x => x.id === 'skyddsrond')!.under).toBe('Ingen gjord än · en gång om året');
  });

  it('inga rader i startsidans Behöver dig före start, och databasen rörs inte', async () => {
    const sb = { from: () => { throw new Error('ska inte läsas'); } } as never;
    expect(await hamtaArbetsmiljoRader(sb, { id: 'm', roll: 'admin', maskin_id: null, skyddsombud: true }, NOV_2026)).toEqual([]);
  });
});
