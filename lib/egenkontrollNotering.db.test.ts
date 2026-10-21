import { describe, expect, it } from 'vitest';
import { andraNotering, hamtaNoteringar, skapaNotering, taBortNotering } from './egenkontroll';
import { klamEtikett } from './egenkontrollNotering';

// Skrivningarna mot en fejkad klient (samma monster som egenkontrollObservation.db.test.ts): det som kontrolleras ar VAD som skrivs,
// i vilken ordning och mot vilken rad - inte att supabase-js fungerar. Det RIKTIGA laset (klar runda -> 23514) provas mot en riktig
// Postgres i supabase/tests/egenkontroll_notering_lokal/test.sql.

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
const skriver = (kedjor: Kedja[]) => kedjor.filter((k) => k.tabell === 'egenkontroll_notering' && (op(k, 'insert') || op(k, 'update') || op(k, 'delete')));

const PAGAENDE = { data: { status: 'pagaende' }, error: null };
const KLAR = { data: { status: 'klar' }, error: null };

const rad = (over: Record<string, unknown> = {}) => ({
  id: 'n1', egenkontroll_id: 'r1', underlag: 'karta', foto_id: null, typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev',
  koordinater: [[14.5, 56.1]], etikett_dx: null, etikett_dy: null, skapad: '2026-10-21T08:00:00Z', andrad: '2026-10-21T08:00:00Z', ...over,
});

/** En databas som skriver: ekar insert/update tillbaka, delete ger en rad, och rundstatus styrs av testet. */
function databas(rundstatus: { data: any; error: any } = PAGAENDE, bas = rad()) {
  return (k: Kedja): Svar => {
    if (k.tabell === 'egenkontroll') return rundstatus;
    const ins = op(k, 'insert');
    if (ins) return { data: { ...bas, ...ins[1] }, error: null };
    const upd = op(k, 'update');
    if (upd) return { data: { ...bas, ...upd[1] }, error: null };
    if (op(k, 'delete')) return { data: [{ id: 'n1' }], error: null };
    const sel = op(k, 'select');
    if (sel && String(sel[1]).includes('egenkontroll:egenkontroll_id')) return { data: { egenkontroll: rundstatus.data }, error: null };
    return { data: [bas], error: null };
  };
}

const gilt = { id: 'n1', egenkontrollId: 'r1', verktyg: 'punkt' as const, etikett: '  Stenmur  ', avsikt: 'blev' as const, koordinater: [[14.5, 56.1]] as [number, number][] };

describe('skapaNotering', () => {
  it('kollar att rundan ar oppen, skriver exakt det som ritats och laser tillbaka', async () => {
    const { klient, kedjor } = fejk(databas());
    const n = await skapaNotering(gilt, { klient });
    expect(n.etikett).toBe('Stenmur');
    const skriv = skriver(kedjor);
    expect(skriv).toHaveLength(1);
    expect(op(skriv[0], 'insert')![1]).toEqual({
      id: 'n1', egenkontroll_id: 'r1', underlag: 'karta', typ: 'punkt', pil: false, etikett: 'Stenmur', avsikt: 'blev', koordinater: [[14.5, 56.1]],
    });
    // runda-kontrollen kommer FORE skrivningen
    expect(kedjor.findIndex((k) => k.tabell === 'egenkontroll')).toBeLessThan(kedjor.findIndex((k) => op(k, 'insert')));
  });

  it('pil = linje med pil, och linjens punkter sparas exakt som de ritades', async () => {
    const { klient, kedjor } = fejk(databas(PAGAENDE, rad({ typ: 'linje', pil: true })));
    await skapaNotering({ ...gilt, verktyg: 'pil', avsikt: 'skulle', koordinater: [[14.5, 56.1], [14.51, 56.11], [14.52, 56.1]] }, { klient });
    const ins = op(skriver(kedjor)[0], 'insert')![1];
    expect(ins).toMatchObject({ typ: 'linje', pil: true, avsikt: 'skulle', koordinater: [[14.5, 56.1], [14.51, 56.11], [14.52, 56.1]] });
  });

  it('en klar runda: ingenting skrivs, och beskedet sager varfor', async () => {
    const { klient, kedjor } = fejk(databas(KLAR));
    await expect(skapaNotering(gilt, { klient })).rejects.toThrow('Rundan är avslutad');
    expect(skriver(kedjor)).toHaveLength(0);
  });

  it('tom text, fel antal punkter eller okand avsikt nar aldrig databasen', async () => {
    for (const fel of [
      { ...gilt, etikett: '   ' },
      { ...gilt, verktyg: 'linje' as const },
      { ...gilt, avsikt: 'kanske' as any },
      { ...gilt, koordinater: [[14.5, 95]] as [number, number][] },
      { ...gilt, etikett: 'a'.repeat(281) },
    ]) {
      const { klient, kedjor } = fejk(databas());
      await expect(skapaNotering(fel, { klient })).rejects.toThrow();
      expect(kedjor).toHaveLength(0);
    }
  });

  it('samma id igen (svaret kom aldrig fram) ar samma notering, inte en andra', async () => {
    let forsta = true;
    const { klient } = fejk((k) => {
      if (k.tabell === 'egenkontroll') return PAGAENDE;
      if (op(k, 'insert')) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      forsta = false;
      return { data: rad(), error: null };
    });
    const n = await skapaNotering(gilt, { klient });
    expect(n.id).toBe('n1');
    expect(forsta).toBe(false);
  });
});

describe('andraNotering', () => {
  it('ny text och avsikt: UPDATE med trimmad text, mot raden, och inget annat andras', async () => {
    const { klient, kedjor } = fejk(databas());
    const n = await andraNotering('n1', { etikett: '  Basvägen skulle gått här.  ', avsikt: 'skulle' }, { klient });
    expect(n?.etikett).toBe('Basvägen skulle gått här.');
    const skriv = skriver(kedjor);
    expect(skriv).toHaveLength(1);
    expect(op(skriv[0], 'update')![1]).toEqual({ etikett: 'Basvägen skulle gått här.', avsikt: 'skulle' });
    expect(harOp(skriv[0], 'eq', 'id', 'n1')).toBe(true);
  });

  it('TOM TEXT ar en DELETE, aldrig en UPDATE (databasen avvisar en tom etikett med 23514)', async () => {
    for (const tom of ['', '   ', '\n']) {
      const { klient, kedjor } = fejk(databas());
      const r = await andraNotering('n1', { etikett: tom, avsikt: 'blev' }, { klient });
      expect(r).toBeNull();
      const skriv = skriver(kedjor);
      expect(skriv).toHaveLength(1);
      expect(op(skriv[0], 'delete')).toBeTruthy();
      expect(op(skriv[0], 'update')).toBeUndefined();
      expect(harOp(skriv[0], 'eq', 'id', 'n1')).toBe(true);
    }
  });

  it('forskjutningen KLAMS vid sparningen med samma funktion som renderar - det sparade ar det som visas', async () => {
    const f = { u: 0.9, v: 0.5, bildHojd: 4 / 3, dx: 1.5, dy: 0, ruta: { bredd: 0.4, hojd: 0.08 } };
    const forvantat = klamEtikett(f);
    expect(forvantat.dx).not.toBe(1.5); // sjalva poangen: ra vardet hade sparats utan klamningen
    const { klient, kedjor } = fejk(databas(PAGAENDE, rad({ underlag: 'foto' })));
    await andraNotering('n1', { etikett: 'Infart', avsikt: 'blev', forskjutning: f }, { klient });
    const upd = op(skriver(kedjor)[0], 'update')![1];
    expect(upd.etikett_dx).toBe(forvantat.dx);
    expect(upd.etikett_dy).toBe(forvantat.dy);
  });

  it('en klar runda: ingen UPDATE och ingen DELETE', async () => {
    for (const tom of ['Ny text', '']) {
      const { klient, kedjor } = fejk(databas(KLAR));
      await expect(andraNotering('n1', { etikett: tom, avsikt: 'blev' }, { klient })).rejects.toThrow('Rundan är avslutad');
      expect(skriver(kedjor)).toHaveLength(0);
    }
  });

  it('en rad som inte finns ar ett fel, aldrig en lyckad andring', async () => {
    const { klient } = fejk((k) => {
      if (op(k, 'update')) return { data: null, error: null };
      return { data: { egenkontroll: { status: 'pagaende' } }, error: null };
    });
    await expect(andraNotering('n1', { etikett: 'x', avsikt: 'blev' }, { klient })).rejects.toThrow('hittades inte');
  });
});

describe('taBortNotering', () => {
  it('kraver att EN rad forsvann', async () => {
    const { klient } = fejk((k) => (op(k, 'delete') ? { data: [], error: null } : { data: { egenkontroll: { status: 'pagaende' } }, error: null }));
    await expect(taBortNotering('n1', { klient })).rejects.toThrow('hittades inte');
  });
});

describe('hamtaNoteringar', () => {
  it('laser rundans noteringar i stabil ordning', async () => {
    const { klient, kedjor } = fejk(() => ({ data: [rad(), rad({ id: 'n2', typ: 'linje', koordinater: [[14.5, 56.1], [14.6, 56.2]] })], error: null }));
    const lista = await hamtaNoteringar('r1', { klient });
    expect(lista.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(kedjor[0].tabell).toBe('egenkontroll_notering');
    expect(harOp(kedjor[0], 'eq', 'egenkontroll_id', 'r1')).toBe(true);
    expect(kedjor[0].ops.filter((o) => o[0] === 'order').map((o) => o[1])).toEqual(['skapad', 'id']);
  });
  it('ett lasfel ar ett fel, aldrig "inga noteringar"', async () => {
    const { klient } = fejk(() => ({ data: null, error: { message: 'nat' } }));
    await expect(hamtaNoteringar('r1', { klient })).rejects.toThrow('Kunde inte läsa noteringarna');
  });
  it('koordinater som inte ar par av tal kastar i stallet for att tyst hoppas over', async () => {
    const { klient } = fejk(() => ({ data: [rad({ koordinater: 'trasigt' })], error: null }));
    await expect(hamtaNoteringar('r1', { klient })).rejects.toThrow('koordinater');
  });
});
