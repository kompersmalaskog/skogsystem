import { describe, it, expect } from 'vitest';
import { koaGrotPaminnelser, GROT_MOTTAGARE_EPOST, DEDUP_MIGRATION } from './paminnelse-ko';
import { PAMINNELSE_TYP } from './paminnelse';

const IDAG = '2026-10-04';
const NU = new Date('2026-10-04T05:00:00.000Z');
const dagPlus = (n: number) => new Date(Date.UTC(2026, 9, 4 + n)).toISOString().slice(0, 10);

type Data = {
  dim?: any[]; prod?: any[]; objekt?: any[]; medarbetare?: any[] | null; medarbetareFel?: string;
  kofinns?: string[]; dedupLasFel?: string; upsertFel?: string;
};
interface Anrop { tabell: string; metod: string; args: any[] }

// Falsk supabase-klient: bara de frågor hamtaGrotRaw + producenten ställer. Filtren ignoreras (datat ges färdigfiltrerat), men varje
// anrop loggas så testet kan se EXAKT vad som frågades och vad som skrevs.
function falskSb(d: Data) {
  const anrop: Anrop[] = [];
  const upserts: { rader: any[]; opts: any }[] = [];
  class Q {
    op: 'select' | 'upsert' = 'select'; rader: any[] = [];
    constructor(public tabell: string) {}
    private logga(metod: string, args: any[]) { anrop.push({ tabell: this.tabell, metod, args }); return this; }
    select(...a: any[]) { return this.logga('select', a); }
    eq(...a: any[]) { return this.logga('eq', a); }
    in(...a: any[]) { return this.logga('in', a); }
    order(...a: any[]) { return this.logga('order', a); }
    upsert(rader: any[], opts: any) { this.op = 'upsert'; this.rader = rader; upserts.push({ rader, opts }); return this.logga('upsert', [rader, opts]); }
    range() { return this.svar(); }
    then(res: any, rej: any) { return this.svar().then(res, rej); }
    private svar(): Promise<{ data: any; error: any }> {
      const ok = (data: any) => Promise.resolve({ data, error: null });
      switch (this.tabell) {
        case 'dim_objekt': return ok(d.dim ?? []);
        case 'grot_koppling': return ok([]);
        case 'vy_uppf_prod_per_objekt': return ok(d.prod ?? []);
        case 'objekt': return ok(d.objekt ?? []);
        case 'medarbetare': return d.medarbetareFel ? Promise.resolve({ data: null, error: { message: d.medarbetareFel } }) : ok(d.medarbetare ?? []);
        case 'notis_kö': {
          if (this.op === 'upsert') {
            if (d.upsertFel) return Promise.resolve({ data: null, error: { message: d.upsertFel } });
            return ok(this.rader.filter((r) => (d.kofinns ?? []).indexOf(r.dedup_nyckel) < 0).map((r) => ({ dedup_nyckel: r.dedup_nyckel })));
          }
          if (d.dedupLasFel) return Promise.resolve({ data: null, error: { message: d.dedupLasFel } });
          return ok((d.kofinns ?? []).map((n) => ({ dedup_nyckel: n })));
        }
        default: return ok([]);
      }
    }
  }
  return { sb: { from: (t: string) => new Q(t) }, anrop, upserts };
}

const dimRad = (id: string, over: any = {}) => ({
  objekt_id: id, object_name: `Trakt ${id}`, vo_nummer: id, areal_ha: 4, latitude: 56.5, longitude: 14.7, huvudtyp: 'Slutavverkning', atgard: 'Slutavverkning',
  grot_anpassad: true, grot_hamtad: null, grot_senast: null, exkludera: false, risskotning: false, skordning_avslutad: '2026-08-01', skotning_avslutad: null, ...over,
});
const prodRad = (id: string) => ({ objekt_id: id, volym_m3sub: 100, sista_datum: '2026-08-20' });
const martin = { id: 'm-martin', namn: 'Martin Lindqvist', epost: GROT_MOTTAGARE_EPOST[0], aktiv: true };

// Två trakter med påminnelse idag: 'a' om 7 dagar (dålig bärighet i planeringen), 'b' om 2 dagar. 'c' har inget datum.
const grund = (over: Partial<Data> = {}): Data => ({
  dim: [dimRad('a', { grot_senast: dagPlus(7) }), dimRad('b', { grot_senast: dagPlus(2) }), dimRad('c')],
  prod: ['a', 'b', 'c'].map(prodRad),
  objekt: [{ id: 'oa', vo_nummer: 'a', namn: 'Objekt a', typ: 'slutavverkning', status: 'avslutat', atgard: null, areal: null, lat: null, lng: null, dim_objekt_id: null, barighet: 'dalig' }],
  medarbetare: [martin],
  ...over,
});

describe('mottagaren — bara Martin', () => {
  it('konstanten är exakt hans e-post, och bara den ställs som fråga mot medarbetare', async () => {
    expect(GROT_MOTTAGARE_EPOST).toEqual(['martin.lindqvist@kompersmalaskog.com']);
    const { sb, anrop } = falskSb(grund());
    await koaGrotPaminnelser(sb, { idag: IDAG, dry: true });
    const fraga = anrop.find((a) => a.tabell === 'medarbetare' && a.metod === 'in')!;
    expect(fraga.args).toEqual(['epost', ['martin.lindqvist@kompersmalaskog.com']]);
  });
});

describe('torrkörning (dry) — räknar allt, skriver inget', () => {
  it('visar kandidaterna och mottagaren, men anropar aldrig upsert', async () => {
    const { sb, upserts } = falskSb(grund());
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: true, nu: NU });
    expect(r.ok).toBe(true);
    expect(r.dry).toBe(true);
    expect(r.listan).toBe(3);
    expect(r.medDatum).toBe(2);
    expect(r.mottagare).toEqual([{ id: 'm-martin', namn: 'Martin Lindqvist' }]);
    expect(r.kandidater.map((k) => [k.namn, k.tidpunkt, k.dagarKvar, k.markBegransning]).sort()).toEqual([
      ['Trakt a', 7, 7, 'dålig bärighet'], ['Trakt b', 2, 2, null],
    ]);
    expect(r.koade).toEqual([]);
    expect(upserts).toHaveLength(0);
  });
  it('visar vad som redan ligger i kön', async () => {
    const { sb } = falskSb(grund({ kofinns: [`a|${dagPlus(7)}|7`] }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: true });
    expect(r.redanKoade).toEqual([`a|${dagPlus(7)}|7`]);
  });
  it('en saknad dedup-kolumn syns som anmärkning med migrationens namn (inget fel — torrkörningen skriver inget)', async () => {
    const { sb } = falskSb(grund({ dedupLasFel: 'column notis_kö.dedup_nyckel does not exist' }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: true });
    expect(r.ok).toBe(true);
    expect(r.anmarkningar.join(' ')).toContain(DEDUP_MIGRATION);
  });
});

describe('skarp körning — köar en rad per påminnelse och mottagare', () => {
  it('upsert med rätt rader och on conflict do nothing på (typ, mottagare_id, dedup_nyckel)', async () => {
    const { sb, upserts } = falskSb(grund());
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false, nu: NU });
    expect(r.ok).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opts).toEqual({ onConflict: 'typ,mottagare_id,dedup_nyckel', ignoreDuplicates: true });
    const rader = upserts[0].rader.slice().sort((x, y) => String(x.dedup_nyckel).localeCompare(String(y.dedup_nyckel)));
    expect(rader).toEqual([
      { mottagare_id: 'm-martin', typ: PAMINNELSE_TYP, skickas_at: '2026-10-04T05:00:00.000Z', dedup_nyckel: `a|${dagPlus(7)}|7`,
        payload: { namn: 'Trakt a', senast: dagPlus(7), dagar_fore: 7, mark_begransning: 'dålig bärighet' } },
      { mottagare_id: 'm-martin', typ: PAMINNELSE_TYP, skickas_at: '2026-10-04T05:00:00.000Z', dedup_nyckel: `b|${dagPlus(2)}|2`,
        payload: { namn: 'Trakt b', senast: dagPlus(2), dagar_fore: 2, mark_begransning: null } },
    ]);
    expect(r.koade.sort()).toEqual([`a|${dagPlus(7)}|7`, `b|${dagPlus(2)}|2`]);
    expect(r.redanKoade).toEqual([]);
  });
  it('en tidpunkt som redan är köad hoppas över (en gång per tidpunkt), resten köas', async () => {
    const { sb } = falskSb(grund({ kofinns: [`a|${dagPlus(7)}|7`] }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false, nu: NU });
    expect(r.ok).toBe(true);
    expect(r.koade).toEqual([`b|${dagPlus(2)}|2`]);
    expect(r.redanKoade).toEqual([`a|${dagPlus(7)}|7`]);
  });
  it('allt redan köat → inget nytt, inget fel', async () => {
    const { sb } = falskSb(grund({ kofinns: [`a|${dagPlus(7)}|7`, `b|${dagPlus(2)}|2`] }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
    expect(r.ok).toBe(true);
    expect(r.koade).toEqual([]);
    expect(r.redanKoade).toHaveLength(2);
  });
  it('inget som gäller idag → ett sant tomt svar, ingen skrivning', async () => {
    const { sb, upserts } = falskSb(grund({ dim: [dimRad('a', { grot_senast: dagPlus(30) }), dimRad('c')] }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
    expect(r.ok).toBe(true);
    expect(r.kandidater).toEqual([]);
    expect(upserts).toHaveLength(0);
  });
});

describe('larm ska larma — fel är ok:false med klartext, aldrig ett tyst "inget att göra"', () => {
  it('kolumnen dedup_nyckel saknas (migrationen inte körd) → fel som pekar på migrationen', async () => {
    const { sb } = falskSb(grund({ upsertFel: 'column "dedup_nyckel" of relation "notis_kö" does not exist' }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain(DEDUP_MIGRATION);
    expect(r.koade).toEqual([]);
  });
  it('annat skrivfel → ok:false med databasens meddelande', async () => {
    const { sb } = falskSb(grund({ upsertFel: 'permission denied for table notis_kö' }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('permission denied');
  });
  it('ingen aktiv mottagare → ok:false, och inget köas (även om det finns påminnelser)', async () => {
    for (const medarbetare of [[], [{ ...martin, aktiv: false }]]) {
      const { sb, upserts } = falskSb(grund({ medarbetare }));
      const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
      expect(r.ok).toBe(false);
      expect(r.fel).toContain('martin.lindqvist@kompersmalaskog.com');
      expect(upserts).toHaveLength(0);
    }
  });
  it('mottagaren går inte att läsa → ok:false', async () => {
    const { sb } = falskSb(grund({ medarbetareFel: 'timeout' }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('timeout');
  });
  it('tomt GROT-underlag (en tyst tom läsning) → ok:false, inget köas', async () => {
    const { sb, upserts } = falskSb(grund({ dim: [], prod: [] }));
    const r = await koaGrotPaminnelser(sb, { idag: IDAG, dry: false });
    expect(r.ok).toBe(false);
    expect(r.fel).toMatch(/underlaget är tomt/);
    expect(upserts).toHaveLength(0);
  });
});
