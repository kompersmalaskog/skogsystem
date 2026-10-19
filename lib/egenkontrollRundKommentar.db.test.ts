import { describe, expect, it } from 'vitest';
import { sparaRundKommentar } from './egenkontroll';

// Skrivningen mot en fejkad klient (samma monster som egenkontrollObservation.db.test.ts): det som kontrolleras ar VAD som
// skrivs, mot vilken rad och under vilket villkor - inte att supabase-js fungerar.

type Kedja = { tabell: string; ops: [string, ...any[]][] };
type Svar = { data: any; error: any };

function fejk(svar: (k: Kedja) => Svar) {
  const kedjor: Kedja[] = [];
  const klient: any = {
    from(tabell: string) {
      const k: Kedja = { tabell, ops: [] };
      kedjor.push(k);
      const b: any = new Proxy({}, {
        get(_t, op: string) {
          if (op === 'then') return (res: any, rej: any) => Promise.resolve(svar(k)).then(res, rej);
          return (...args: any[]) => { k.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  return { klient, kedjor };
}

const op = (k: Kedja, namn: string) => k.ops.find((o) => o[0] === namn);
const harOp = (k: Kedja, namn: string, ...args: any[]) => k.ops.some((o) => o[0] === namn && args.every((a, i) => o[i + 1] === a));
const PAGAENDE = { data: { status: 'pagaende' }, error: null };

describe('sparaRundKommentar', () => {
  it('skriver trimmad text mot rundans rad, bara om rundan fortfarande ar pagaende, och laser tillbaka', async () => {
    const { klient, kedjor } = fejk((k) => (op(k, 'update') ? { data: { id: 'r1', status: 'pagaende', kommentar: 'Stenmuren ar paverkad' }, error: null } : PAGAENDE));
    const r = await sparaRundKommentar('r1', '  Stenmuren ar paverkad  ', { klient });
    expect(r.kommentar).toBe('Stenmuren ar paverkad');
    const skriv = kedjor.find((k) => op(k, 'update'))!;
    expect(skriv.tabell).toBe('egenkontroll');
    expect(op(skriv, 'update')![1]).toEqual({ kommentar: 'Stenmuren ar paverkad' });
    expect(harOp(skriv, 'eq', 'id', 'r1')).toBe(true);
    // TABELLEN HAR INGEN LASTRIGGER: villkoret i UPDATE:n ar det som hindrar en skrivning pa en runda som avslutats under tiden.
    expect(harOp(skriv, 'eq', 'status', 'pagaende')).toBe(true);
  });

  it('tom text eller bara blanksteg lagras som NULL - ingen kommentar', async () => {
    for (const tom of ['', '   \n ', null]) {
      const { klient, kedjor } = fejk((k) => (op(k, 'update') ? { data: { status: 'pagaende', kommentar: null }, error: null } : PAGAENDE));
      await sparaRundKommentar('r1', tom, { klient });
      expect(op(kedjor.find((k) => op(k, 'update'))!, 'update')![1]).toEqual({ kommentar: null });
    }
  });

  it('en klar runda skrivs INTE - besked fore skrivning, ingen update', async () => {
    const { klient, kedjor } = fejk(() => ({ data: { status: 'klar' }, error: null }));
    await expect(sparaRundKommentar('r1', 'text', { klient })).rejects.toThrow('avslutad');
    expect(kedjor.some((k) => op(k, 'update'))).toBe(false);
  });

  it('noll rader tillbaka (rundan avslutades mellan kontrollen och skrivningen) ar ett FEL, aldrig "sparat"', async () => {
    const { klient } = fejk((k) => (op(k, 'update') ? { data: null, error: null } : PAGAENDE));
    await expect(sparaRundKommentar('r1', 'text', { klient })).rejects.toThrow('inte');
  });

  it('ett databasfel kastas med sin text; ett varde som inte stammer vid tillbakalasningen kastas', async () => {
    const fel = fejk((k) => (op(k, 'update') ? { data: null, error: { message: 'boom' } } : PAGAENDE));
    await expect(sparaRundKommentar('r1', 'text', { klient: fel.klient })).rejects.toThrow('boom');
    const annat = fejk((k) => (op(k, 'update') ? { data: { status: 'pagaende', kommentar: 'nagot annat' }, error: null } : PAGAENDE));
    await expect(sparaRundKommentar('r1', 'text', { klient: annat.klient })).rejects.toThrow('som väntat');
  });

  it('ett lasfel pa rundan stoppar skrivningen (ett lasfel ar aldrig "oppen")', async () => {
    const { klient, kedjor } = fejk(() => ({ data: null, error: { message: 'nat' } }));
    await expect(sparaRundKommentar('r1', 'text', { klient })).rejects.toThrow('nat');
    expect(kedjor.some((k) => op(k, 'update'))).toBe(false);
  });
});
