import { describe, expect, it } from 'vitest';
import { FULLT_UT_AR, fulltUt } from './fulltUt';
import { byggStickprovNotis } from './egenkontrollStickprovNotis';
import { byggGodkannNotis } from './lastbil/godkannNotis';
import { koaGodkannPaminnelse } from './lastbil/godkannKo';
import { arbetsmiljoIgang } from './arbetsmiljo/start';

// Ingen mock här: det här är reglerna FÖRE 2027, med de riktiga datumen.
const MAN_NOV = new Date('2026-11-16T09:00:00Z'); // måndag 10:00 svensk tid
const ska = () => { throw new Error('ska inte läsas'); };

describe('appen används fullt ut från 2027', () => {
  it('startar vid nyår i svensk tid, och arbetsmiljön följer samma år', () => {
    expect(FULLT_UT_AR).toBe(2027);
    expect(fulltUt(new Date('2026-12-31T22:59:00Z'))).toBe(false);
    expect(fulltUt(new Date('2026-12-31T23:00:00Z'))).toBe(true);
    expect(fulltUt(Date.parse('2027-03-01T10:00:00Z'))).toBe(true);
    expect(arbetsmiljoIgang(MAN_NOV)).toBe(false);
  });

  it('månadens stickprov skickas inte före 2027, och raden läses inte', async () => {
    const u = await byggStickprovNotis({ typ: 'egenkontroll_stickprov', payload: { manad: '2026-12-01' } }, ska as never, Date.parse('2026-12-01T08:00:00Z'));
    expect(u).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — appen används fullt ut från 2027' });
  });

  it('måndagspåminnelsen om flyttar köas inte och skickas inte före 2027', async () => {
    const sb = { from: ska } as never;
    expect(await koaGodkannPaminnelse(sb, MAN_NOV)).toEqual({ ok: true, vantar: 0, koade: 0 });
    expect(await byggGodkannNotis({}, ska as never, MAN_NOV.getTime())).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — appen används fullt ut från 2027' });
  });
});
