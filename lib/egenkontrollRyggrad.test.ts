import { describe, expect, it } from 'vitest';
import {
  byggUtforanderader, hamtaVantande, kompletteraRunda, saknadeUtforandepunkter, utforandeKatalog,
} from './egenkontroll';

// Ryggraden: utforandepunkterna ar desamma varje gang. Skrivningarna mot en fejkad klient (samma monster som egenkontrollObservation.db.test.ts):
// det som kontrolleras ar VAD som skrivs, under vilket villkor och i vilken ordning.

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
const insatta = (kedjor: Kedja[]) => kedjor.filter((k) => op(k, 'insert')).map((k) => op(k, 'insert')![1] as any[]);

const SLUT = utforandeKatalog('slutavverkning').map((m) => m.slug);
const GALL = utforandeKatalog('gallring').map((m) => m.slug);
const NIO = SLUT.slice(0, 9);   // en runda skapad fore naturhansyn_utforande och grotuttag

const punktRad = (ordning: number, del: string, slug: string | null) => ({ ordning, del, punkt_typ: slug });
const planOchUtf = (slugs: string[], plan = 3) => [
  ...Array.from({ length: plan }, (_, i) => punktRad(i + 1, 'plan', 'mainRoad')),
  ...slugs.map((s, i) => punktRad(plan + 1 + i, 'utforande', s)),
];

/** Rundan och dess punkter; insert-svaret styrs av `insertSvar` (en lista, ett svar per anrop). */
function runda(status: string, typ: 'slutavverkning' | 'gallring', punkter: ReturnType<typeof punktRad>[], insertSvar: any[] = [{ error: null }]) {
  let insert = 0;
  return fejk((k) => {
    if (k.tabell === 'egenkontroll') return { data: { id: 'r1', status, objekt_typ: typ }, error: null };
    if (op(k, 'insert')) return insertSvar[Math.min(insert++, insertSvar.length - 1)];
    return { data: punkter, error: null };
  });
}

describe('saknadeUtforandepunkter - ren, katalogens ordning', () => {
  it('en runda skapad fore de tva sista punkterna saknar exakt dem, i katalogens ordning', () => {
    expect(saknadeUtforandepunkter('slutavverkning', NIO).map((m) => m.slug)).toEqual(['naturhansyn_utforande', 'grotuttag']);
    expect(saknadeUtforandepunkter('gallring', GALL.slice(0, 8)).map((m) => m.slug)).toEqual(['naturhansyn_utforande', 'grotuttag']);
  });
  it('en runda utan utforande saknar alla (11 pa slutavverkning, 10 pa gallring); en full runda saknar inget', () => {
    expect(saknadeUtforandepunkter('slutavverkning', [])).toHaveLength(11);
    expect(saknadeUtforandepunkter('gallring', [])).toHaveLength(10);
    expect(saknadeUtforandepunkter('slutavverkning', SLUT)).toEqual([]);
  });
  it('en okand slug i rundan raknas inte och paverkar inget; null och undefined hoppas over', () => {
    expect(saknadeUtforandepunkter('slutavverkning', [...SLUT, 'gammal_punkt', null, undefined])).toEqual([]);
  });
  it('typen styr katalogen: gallringens punkter saknas pa en slutavverkning och tvartom', () => {
    expect(saknadeUtforandepunkter('slutavverkning', GALL).map((m) => m.slug)).toContain('frotrad_eller_skarm');
    expect(saknadeUtforandepunkter('gallring', SLUT).map((m) => m.slug)).toContain('val_av_stammar');
  });
});

describe('kompletteraRunda', () => {
  it('lagger till exakt de saknade punkterna, additivt, med ordning max+1.. och SAMMA rad som vid generering', async () => {
    const { klient, kedjor } = runda('pagaende', 'slutavverkning', [...planOchUtf(NIO), punktRad(13, 'matning', 'stubbehandling')]);
    const r = await kompletteraRunda('r1', { klient });
    expect(r.tillagda).toEqual(['naturhansyn_utforande', 'grotuttag']);
    const [rader] = insatta(kedjor);
    expect(rader.map((x) => [x.punkt_typ, x.ordning])).toEqual([['naturhansyn_utforande', 14], ['grotuttag', 15]]);
    // EN KALLA: samma rad som en ny runda far - bara egenkontroll_id och ordning tillkommer.
    const katalogRader = byggUtforanderader('slutavverkning').filter((x) => x.punkt_typ === 'grotuttag');
    const { egenkontroll_id, ordning, ...utanId } = rader[1];
    expect(utanId).toEqual(katalogRader[0]);
    expect(egenkontroll_id).toBe('r1');
    expect(ordning).toBe(15);
  });

  it('ordningen ar MAX+1, inte radantalet: en runda med luckor i ordningen far inte en kollision', async () => {
    const luckor = [punktRad(1, 'plan', 'mainRoad'), punktRad(5, 'plan', 'mainRoad'), ...NIO.map((s, i) => punktRad(20 + i, 'utforande', s))]; // hogst 28, 11 rader
    const { klient, kedjor } = runda('pagaende', 'slutavverkning', luckor);
    await kompletteraRunda('r1', { klient });
    expect(insatta(kedjor)[0].map((x) => x.ordning)).toEqual([29, 30]);
  });

  it('bara del=utforande raknas som "finns": en planpunkt med samma slug ger inte en utforandepunkt', async () => {
    const { klient, kedjor } = runda('pagaende', 'slutavverkning', [...planOchUtf(NIO), punktRad(13, 'plan', 'grotuttag')]);
    const r = await kompletteraRunda('r1', { klient });
    expect(r.tillagda).toEqual(['naturhansyn_utforande', 'grotuttag']);
    expect(insatta(kedjor)).toHaveLength(1);
  });

  it('en runda utan utforande far alla elva, och ordningen fortsatter efter planpunkterna', async () => {
    const { klient, kedjor } = runda('pagaende', 'slutavverkning', Array.from({ length: 13 }, (_, i) => punktRad(i + 1, 'plan', 'mainRoad')));
    const r = await kompletteraRunda('r1', { klient });
    expect(r.tillagda).toEqual(SLUT);
    const [rader] = insatta(kedjor);
    expect(rader.map((x) => x.ordning)).toEqual(Array.from({ length: 11 }, (_, i) => 14 + i));
    expect(rader.every((x) => x.del === 'utforande' && x.kalla === 'fast' && x.status === null && x.grupp === null)).toBe(true);
  });

  it('en KLAR runda ror vi aldrig - inga punkter lases, inget skrivs', async () => {
    const { klient, kedjor } = runda('klar', 'slutavverkning', planOchUtf(NIO));
    const r = await kompletteraRunda('r1', { klient });
    expect(r.tillagda).toEqual([]);
    expect(insatta(kedjor)).toEqual([]);
    expect(kedjor.some((k) => k.tabell === 'egenkontroll_punkt')).toBe(false);
  });

  it('en full pagaende runda: inget skrivs', async () => {
    const { klient, kedjor } = runda('pagaende', 'slutavverkning', planOchUtf(SLUT));
    expect((await kompletteraRunda('r1', { klient })).tillagda).toEqual([]);
    expect(insatta(kedjor)).toEqual([]);
  });

  it('observationer raknas inte: punkterna lases UTAN dem, sa deras ordning 0 aldrig paverkar max', async () => {
    const { klient, kedjor } = runda('pagaende', 'slutavverkning', planOchUtf(NIO));
    await kompletteraRunda('r1', { klient });
    const lasning = kedjor.find((k) => k.tabell === 'egenkontroll_punkt' && !op(k, 'insert'))!;
    expect(lasning.ops.some((o) => o[0] === 'neq' && o[1] === 'kalla' && o[2] === 'observation')).toBe(true);
  });

  it('23505 (en annan enhet hann fore): LAS OM - och ar det redan gjort sa ar det inget fel och inget skrivs en gang till', async () => {
    let lasningar = 0;
    const { klient, kedjor } = fejk((k) => {
      if (k.tabell === 'egenkontroll') return { data: { id: 'r1', status: 'pagaende', objekt_typ: 'slutavverkning' }, error: null };
      if (op(k, 'insert')) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      lasningar += 1;
      return { data: planOchUtf(lasningar === 1 ? NIO : SLUT), error: null };   // andra lasningen: den andra enheten har lagt till dem
    });
    const r = await kompletteraRunda('r1', { klient });
    expect(r.tillagda).toEqual([]);
    expect(insatta(kedjor)).toHaveLength(1);   // bara det forsta forsoket
    expect(lasningar).toBe(2);
  });

  it('23505 med nagot som fortfarande saknas: nytt forsok med FRISK max, hogst tre varv, sedan ett begripligt fel', async () => {
    const { klient, kedjor } = fejk((k) => {
      if (k.tabell === 'egenkontroll') return { data: { id: 'r1', status: 'pagaende', objekt_typ: 'slutavverkning' }, error: null };
      if (op(k, 'insert')) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      return { data: planOchUtf(NIO), error: null };
    });
    await expect(kompletteraRunda('r1', { klient })).rejects.toThrow('någon annan ändrade rundan');
    expect(insatta(kedjor)).toHaveLength(3);
  });

  it('rundan avslutades mellan kontrollen och skrivningen (databasens las, 23514): inget fel, inget tillagt', async () => {
    const { klient } = runda('pagaende', 'slutavverkning', planOchUtf(NIO), [{ data: null, error: { code: '23514', message: 'Egenkontrollen ar avslutad' } }]);
    expect((await kompletteraRunda('r1', { klient })).tillagda).toEqual([]);
  });

  it('ett lasfel eller ett annat skrivfel KASTAS med sin text - anroparen oppnar da rundan som forut och sager att punkter saknas', async () => {
    const a = fejk((k) => (k.tabell === 'egenkontroll' ? { data: null, error: { message: 'nat' } } : { data: [], error: null }));
    await expect(kompletteraRunda('r1', { klient: a.klient })).rejects.toThrow('nat');
    const b = runda('pagaende', 'slutavverkning', planOchUtf(NIO), [{ data: null, error: { code: '42501', message: 'ratt saknas' } }]);
    await expect(kompletteraRunda('r1', { klient: b.klient })).rejects.toThrow('ratt saknas');
    const c = fejk((k) => (k.tabell === 'egenkontroll' ? { data: null, error: null } : { data: [], error: null }));
    await expect(kompletteraRunda('r1', { klient: c.klient })).rejects.toThrow('hittades inte');
  });

  it('gallring: 10 punkter i katalogen, de tva sista saknas pa en gammal runda', async () => {
    const { klient } = runda('pagaende', 'gallring', planOchUtf(GALL.slice(0, 8)));
    expect((await kompletteraRunda('r1', { klient })).tillagda).toEqual(['naturhansyn_utforande', 'grotuttag']);
  });
});

describe('hamtaVantande - listan raknar med det rundan KOMMER att fa, utan att skriva', () => {
  const objekt = [
    { id: 'o1', namn: 'Ulfsnas', avslutad_timestamp: '2026-08-01T00:00:00Z', faktisk_slut: null },
    { id: 'o2', namn: 'Raveboda', avslutad_timestamp: '2026-08-02T00:00:00Z', faktisk_slut: null },
    { id: 'o3', namn: 'Full', avslutad_timestamp: '2026-08-03T00:00:00Z', faktisk_slut: null },
  ];
  const rundor = [
    { id: 'r1', objekt_id: 'o1', objekt_typ: 'slutavverkning', status: 'pagaende', startad: '2026-08-28T07:00:00Z', klar: null },
    { id: 'r2', objekt_id: 'o2', objekt_typ: 'slutavverkning', status: 'klar', startad: '2026-08-20T07:00:00Z', klar: '2026-08-20T10:00:00Z' },
    { id: 'r3', objekt_id: 'o3', objekt_typ: 'gallring', status: 'pagaende', startad: '2026-10-19T07:00:00Z', klar: null },
  ];
  const pkt = (egenkontroll_id: string, slug: string, status: string | null = null) => ({ egenkontroll_id, status, del: 'utforande', punkt_typ: slug });
  const punkter = [
    ...NIO.map((s) => pkt('r1', s, 'bra')),            // pagaende, 9 av 11: saknar 2
    ...NIO.map((s) => pkt('r2', s, 'bra')),            // KLAR, 9: raknas som 9, aldrig fyllas pa
    ...GALL.map((s) => pkt('r3', s)),                  // full gallring
  ];
  const { klient, kedjor } = fejk((k) => {
    if (k.tabell === 'objekt') return { data: objekt, error: null };
    if (k.tabell === 'egenkontroll') return { data: rundor, error: null };
    return { data: punkter, error: null };
  });

  it('pagaende runda: saknade ingar i antalPunkter och sags i antalSaknade; klar runda: 9 av 9, aldrig fler', async () => {
    const o = await hamtaVantande({ klient });
    const rad = (id: string) => o.rader.find((r) => r.objekt_id === id)!;
    expect(rad('o1')).toMatchObject({ antalPunkter: 11, antalSaknade: 2, antalBesvarade: 9 });
    expect(rad('o2')).toMatchObject({ antalPunkter: 9, antalSaknade: 0, antalBesvarade: 9 });
    expect(rad('o3')).toMatchObject({ antalPunkter: 10, antalSaknade: 0 });
  });

  it('INGA SKRIVNINGAR: listan laser bara', () => {
    expect(kedjor.some((k) => k.ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o[0])))).toBe(false);
  });
});
