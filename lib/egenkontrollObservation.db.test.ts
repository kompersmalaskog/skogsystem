import { describe, expect, it, vi } from 'vitest';
import { andraObservation, hamtaRunda, skapaObservation, taBortObservation } from './egenkontroll';

// Skrivningarna mot en fejkad klient. Den spelar in varje kedja ({tabell, ops}) och later testet avgora svaret,
// sa att det som kontrolleras ar VAD som skrivs, i vilken ordning och mot vilken rad - inte att supabase-js funkar.

type Kedja = { tabell: string; ops: [string, ...any[]][] };
type Svar = { data: any; error: any };

function fejk(svar: (k: Kedja) => Svar) {
  const kedjor: Kedja[] = [];
  const raderadeFiler: { bucket: string; sokvagar: string[] }[] = [];
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
    storage: {
      from: (bucket: string) => ({
        remove: async (sokvagar: string[]) => { raderadeFiler.push({ bucket, sokvagar }); return { error: null }; },
      }),
    },
  };
  return { klient, kedjor, raderadeFiler };
}

const op = (k: Kedja, namn: string) => k.ops.find((o) => o[0] === namn);
const harOp = (k: Kedja, namn: string, ...args: any[]) =>
  k.ops.some((o) => o[0] === namn && args.every((a, i) => o[i + 1] === a));

const PAGAENDE = { data: { status: 'pagaende' }, error: null };
const KLAR = { data: { status: 'klar' }, error: null };
const ok = { data: null, error: null };

const gilt = {
  id: '11111111-1111-4111-8111-111111111111',
  egenkontrollId: 'runda-1',
  ton: 'bra' as const,
  typ: 'korspar' as const,
  kommentar: '  Fint lagt  ',
  lat: 56.1234,
  lng: 14.5678,
  harFoto: false,
};

/** Svarar som en databas som skrev raden: ekar insert-nyttolasten tillbaka. */
function databasSomSkriver(rundstatus = PAGAENDE) {
  return (k: Kedja): Svar => {
    if (k.tabell === 'egenkontroll') return rundstatus;
    const ins = op(k, 'insert');
    if (ins) return { data: { ...ins[1] }, error: null };
    const upd = op(k, 'update');
    if (upd) return { data: { id: 'x', kalla: 'observation', ...upd[1] }, error: null };
    return ok;
  };
}

describe('skapaObservation', () => {
  it('skriver EN rad som ar en observation: del och kalla observation, ordning 0, tonen som status, typen, position', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver());
    const rad = await skapaObservation(gilt, { klient });

    const skrivning = kedjor.find((k) => k.tabell === 'egenkontroll_punkt')!;
    const nyttpload = op(skrivning, 'insert')![1];
    expect(nyttpload).toMatchObject({
      id: gilt.id,
      egenkontroll_id: 'runda-1',
      ordning: 0,
      del: 'observation',
      kalla: 'observation',
      rubrik: 'Observation',
      status: 'bra',
      avvikelse_typ: 'korspar',
      kommentar: 'Fint lagt', // trimmad - tomt blir null, aldrig mellanslag
      lat: 56.1234,
      lng: 14.5678,
    });
    expect(typeof nyttpload.besvarad).toBe('string');
    expect(nyttpload.markering_id).toBeUndefined(); // CHECK: en observation har ingen markering
    expect(rad.status).toBe('bra');
  });

  it('en tom kommentar blir null', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver());
    await skapaObservation({ ...gilt, kommentar: '   ' }, { klient });
    expect(op(kedjor.find((k) => k.tabell === 'egenkontroll_punkt')!, 'insert')![1].kommentar).toBeNull();
  });

  it('KLAR RUNDA: avvisas fore skrivningen, med ett begripligt besked - raden skrivs aldrig', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver(KLAR));
    await expect(skapaObservation(gilt, { klient })).rejects.toThrow('Rundan är avslutad och går inte att ändra.');
    expect(kedjor.some((k) => k.tabell === 'egenkontroll_punkt')).toBe(false);
  });

  it('KLAR RUNDA, andra lagret: triggern nekar anda - databasens fel blir en uppmaning, inget ravt check_violation', async () => {
    const { klient } = fejk((k) => {
      if (k.tabell === 'egenkontroll') return PAGAENDE; // klienten hann inte se att rundan blev klar
      return { data: null, error: { message: 'Egenkontrollen ar avslutad och kan inte andras' } };
    });
    await expect(skapaObservation(gilt, { klient })).rejects.toThrow('Rundan är avslutad och går inte att ändra.');
  });

  it('en runda som inte gar att lasa ar ett fel - aldrig "oppen"', async () => {
    const { klient, kedjor } = fejk((k) => (k.tabell === 'egenkontroll' ? { data: null, error: { message: 'nat nere' } } : ok));
    await expect(skapaObservation(gilt, { klient })).rejects.toThrow(/Kunde inte läsa rundan: nat nere/);
    expect(kedjor.some((k) => k.tabell === 'egenkontroll_punkt')).toBe(false);
  });

  it('AVVIKELSE UTAN FOTO: avvisas innan nagot skrivs eller lases', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver());
    await expect(skapaObservation({ ...gilt, ton: 'avvikelse', harFoto: false }, { klient })).rejects.toThrow('En avvikelse behöver ett foto.');
    expect(kedjor).toHaveLength(0);
    // ... med foto gar den igenom
    const { klient: k2 } = fejk(databasSomSkriver());
    await expect(skapaObservation({ ...gilt, ton: 'avvikelse', harFoto: true }, { klient: k2 })).resolves.toMatchObject({ status: 'avvikelse' });
  });

  it('POSITION SAKNAS: avvisas innan nagot skrivs - aldrig en observation utan plats', async () => {
    for (const [lat, lng] of [[NaN, 14], [56, NaN], [0, 0], [91, 14]] as const) {
      const { klient, kedjor } = fejk(databasSomSkriver());
      await expect(skapaObservation({ ...gilt, lat, lng }, { klient })).rejects.toThrow('Positionen saknas');
      expect(kedjor).toHaveLength(0);
    }
  });

  it('okand ton eller typ avvisas', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver());
    await expect(skapaObservation({ ...gilt, ton: 'godkant' as any }, { klient })).rejects.toThrow(/Välj om det är bra/);
    await expect(skapaObservation({ ...gilt, typ: 'hansyn_skadad' as any }, { klient })).rejects.toThrow('Välj vad det gäller.');
    expect(kedjor).toHaveLength(0);
  });

  it('LAS TILLBAKA VARDET: kommer en annan ton tillbaka an den som skickades ar det ett fel', async () => {
    const { klient } = fejk((k) => {
      if (k.tabell === 'egenkontroll') return PAGAENDE;
      const ins = op(k, 'insert')!;
      return { data: { ...ins[1], status: 'battre' }, error: null };
    });
    await expect(skapaObservation(gilt, { klient })).rejects.toThrow('Observationen sparades inte som väntat. Ladda om sidan.');
  });

  it('en rad som inte gar att lasa tillbaka ar ett fel, inte en tyst lyckad sparning', async () => {
    const { klient } = fejk((k) => (k.tabell === 'egenkontroll' ? PAGAENDE : ok));
    await expect(skapaObservation(gilt, { klient })).rejects.toThrow(/kunde inte läsas tillbaka/);
  });

  it('CHECK observation_ar_komplett blir en uppmaning', async () => {
    const { klient } = fejk((k) =>
      k.tabell === 'egenkontroll' ? PAGAENDE : { data: null, error: { message: 'violates check constraint "observation_ar_komplett"' } });
    await expect(skapaObservation(gilt, { klient })).rejects.toThrow('Observationen behöver ton, typ och position');
  });

  it('SESSIONEN KRAVS, med ett eget fel - och inget skrivs', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({
      supabase: {
        auth: { getUser: async () => ({ data: { user: null } }) },
        from: () => { throw new Error('klienten far inte anvandas utan session'); },
      },
    }));
    const { skapaObservation: skapa } = await import('./egenkontroll');
    await expect(skapa(gilt)).rejects.toThrow('Du är inte inloggad längre. Logga in igen — ingenting har sparats.');
    vi.doUnmock('./supabase');
  });
});

describe('andraObservation - UPDATE, aldrig upsert, och bara pa en observation', () => {
  it('uppdaterar ton, typ och kommentar - och INGET annat (inte position, inte del, inte kalla)', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver());
    await andraObservation('o1', { ton: 'battre', typ: 'stubbhojd', kommentar: 'For hog', antalFoton: 0 }, { klient });

    const k = kedjor.filter((x) => x.tabell === 'egenkontroll_punkt').find((x) => op(x, 'update'))!;
    expect(Object.keys(op(k, 'update')![1]).sort()).toEqual(['avvikelse_typ', 'kommentar', 'status']);
    expect(op(k, 'upsert')).toBeUndefined();
    expect(op(k, 'insert')).toBeUndefined();
    expect(harOp(k, 'eq', 'id', 'o1')).toBe(true);
    // En planpunkts id kan aldrig skrivas om hit: raden maste vara en observation.
    expect(harOp(k, 'eq', 'kalla', 'observation')).toBe(true);
  });

  it('en andring till Avvikelse kraver foto - aven om raden redan finns', async () => {
    const { klient, kedjor } = fejk(databasSomSkriver());
    await expect(andraObservation('o1', { ton: 'avvikelse', typ: 'korspar', antalFoton: 0 }, { klient })).rejects.toThrow('En avvikelse behöver ett foto.');
    expect(kedjor).toHaveLength(0);
    await expect(andraObservation('o1', { ton: 'avvikelse', typ: 'korspar', antalFoton: 1 }, { klient })).resolves.toBeDefined();
  });

  it('en klar runda ar last - triggerns fel blir en uppmaning', async () => {
    const { klient } = fejk((k) => {
      if (k.tabell === 'egenkontroll') return KLAR;
      return { data: { egenkontroll: { status: 'klar' } }, error: null };
    });
    await expect(andraObservation('o1', { ton: 'bra', typ: 'korspar', antalFoton: 0 }, { klient })).rejects.toThrow('Rundan är avslutad och går inte att ändra.');
  });

  it('0 traffade rader (borttagen eller en planpunkt) ar ett fel - ingen tyst lyckad andring', async () => {
    const { klient } = fejk((k) => (op(k, 'update') ? ok : { data: { egenkontroll: { status: 'pagaende' } }, error: null }));
    await expect(andraObservation('o1', { ton: 'bra', typ: 'korspar', antalFoton: 0 }, { klient })).rejects.toThrow(/hittades inte/);
  });

  it('SESSIONEN KRAVS', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
    const { andraObservation: andra } = await import('./egenkontroll');
    await expect(andra('o1', { ton: 'bra', typ: 'korspar', antalFoton: 0 })).rejects.toThrow('Du är inte inloggad längre');
    vi.doUnmock('./supabase');
  });
});

describe('taBortObservation', () => {
  function raderingsdatabas(rundstatus = PAGAENDE, raderade: any[] = [{ id: 'o1' }]) {
    return (k: Kedja): Svar => {
      if (k.tabell === 'egenkontroll') return rundstatus;
      if (k.tabell === 'egenkontroll_foto') return { data: [{ sokvag: 'runda-1/o1-1.jpg' }, { sokvag: 'runda-1/o1-2.jpg' }], error: null };
      if (op(k, 'delete')) return { data: raderade, error: null };
      return { data: { egenkontroll: { status: 'pagaende' } }, error: null };
    };
  }

  it('raderar BARA en observation (kalla), och tar bort filerna efter raden', async () => {
    const { klient, kedjor, raderadeFiler } = fejk(raderingsdatabas());
    await taBortObservation('o1', { klient });
    const del = kedjor.find((k) => op(k, 'delete'))!;
    expect(del.tabell).toBe('egenkontroll_punkt');
    expect(harOp(del, 'eq', 'id', 'o1')).toBe(true);
    expect(harOp(del, 'eq', 'kalla', 'observation')).toBe(true);
    expect(raderadeFiler).toEqual([{ bucket: 'egenkontroll-foto', sokvagar: ['runda-1/o1-1.jpg', 'runda-1/o1-2.jpg'] }]);
  });

  it('0 raderade rader ar ett fel - inte en tyst lyckad borttagning', async () => {
    const { klient, raderadeFiler } = fejk(raderingsdatabas(PAGAENDE, []));
    await expect(taBortObservation('o1', { klient })).rejects.toThrow(/hittades inte/);
    expect(raderadeFiler).toHaveLength(0); // filerna rors inte nar raden inte togs bort
  });

  it('en klar runda: triggerns DELETE-las blir en uppmaning, och filerna rors inte', async () => {
    const { klient, raderadeFiler } = fejk((k) => {
      if (op(k, 'delete')) return { data: null, error: { message: 'Egenkontrollen ar avslutad och kan inte andras' } };
      if (k.tabell === 'egenkontroll_foto') return { data: [{ sokvag: 'a.jpg' }], error: null };
      return { data: { egenkontroll: { status: 'pagaende' } }, error: null };
    });
    await expect(taBortObservation('o1', { klient })).rejects.toThrow('Rundan är avslutad och går inte att ändra.');
    expect(raderadeFiler).toHaveLength(0);
  });

  it('SESSIONEN KRAVS', async () => {
    vi.resetModules();
    vi.doMock('./supabase', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
    const { taBortObservation: taBort } = await import('./egenkontroll');
    await expect(taBort('o1')).rejects.toThrow('Du är inte inloggad längre');
    vi.doUnmock('./supabase');
  });
});

describe('hamtaRunda delar vid kallan', () => {
  const punktRad = (id: string, kalla: string, over: Record<string, any> = {}) => ({
    id, egenkontroll_id: 'r1', ordning: 1, del: kalla === 'observation' ? 'observation' : 'plan', kalla, status: null,
    besvarad: null, ...over,
  });

  it('observationerna kommer i RundVy.observationer och ALDRIG i punkter - hur manga de an ar', async () => {
    const { klient } = fejk((k) => {
      if (k.tabell === 'objekt') return { data: { id: 'ob', namn: 'Ravemåla', status: 'avslutat', vo_nummer: '1', lat: 56, lng: 14, kartbild_url: null, kartbild_bounds: null }, error: null };
      if (k.tabell === 'egenkontroll') return { data: [{ id: 'r1', status: 'pagaende', startad: '2026-10-17T08:00:00Z' }], error: null };
      return {
        data: [
          punktRad('p1', 'markering'),
          punktRad('o2', 'observation', { status: 'bra', besvarad: '2026-10-17T10:00:00Z' }),
          punktRad('o1', 'observation', { status: 'avvikelse', besvarad: '2026-10-17T09:00:00Z' }),
          punktRad('p2', 'fast', { del: 'utforande' }),
        ],
        error: null,
      };
    });
    const vy = await hamtaRunda('ob', { klient });
    expect(vy.punkter.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(vy.observationer.map((p) => p.id)).toEqual(['o1', 'o2']);
    // N av M: "kvar" raknas ur punkter - en observation (alltid besvarad) har aldrig kunnat vara med.
    expect(vy.punkter.every((p) => p.kalla !== 'observation')).toBe(true);
  });

  it('en objekt utan runda har tomma listor for bada', async () => {
    const { klient } = fejk((k) => {
      if (k.tabell === 'objekt') return { data: { id: 'ob', namn: 'X', status: 'avslutat', vo_nummer: '1', lat: 56, lng: 14, kartbild_url: null, kartbild_bounds: null }, error: null };
      return { data: [], error: null };
    });
    const vy = await hamtaRunda('ob', { klient });
    expect(vy.punkter).toEqual([]);
    expect(vy.observationer).toEqual([]);
  });
});
