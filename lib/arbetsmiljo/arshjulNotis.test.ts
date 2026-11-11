import { describe, it, expect, vi } from 'vitest';
import {
  AM_ARSHJUL, arshjulDedup, arshjulText, byggArshjulNotis, dagsAttKoa, koaArshjulPaminnelse, svenskVeckodagTimme,
} from './arshjulNotis';
import { byggArshjul, type Rad } from './arshjul';

// Reglerna här gäller när arbetsmiljön har börjat (lib/arbetsmiljo/start.ts). Före start: start.test.ts.
vi.mock('@/lib/arbetsmiljo/start', async (orig) => ({ ...(await orig<typeof import('@/lib/arbetsmiljo/start')>()), arbetsmiljoIgang: () => true }));


// Onsdag 11 november 2026, 09:00 svensk tid (vintertid, UTC+1).
const ONS_09 = new Date('2026-11-11T08:00:00Z');

function rader(nu: Date, gjorda: Parameters<typeof byggArshjul>[0]['gjorda'] = []): Rad[] {
  // Inga ronder och ingen godkänd riskbedömning: båda är sena i november.
  const tom = { bort: [], egna: [], mindre: [], godkandUnderlag: null, godkandTid: null, godkandAv: null } as any;
  const risk = { skordare: tom, skotare: tom, lastbil: tom, motorsag: tom, kemikalier: tom } as any;
  return byggArshjul({ nu, gjorda, ronder: [], risk });
}

describe('när påminnelsen får köas', () => {
  it('vardag från 08:00 svensk tid, aldrig helg eller före 08', () => {
    expect(dagsAttKoa(ONS_09)).toBe(true);
    expect(dagsAttKoa(new Date('2026-11-11T06:59:00Z'))).toBe(false); // 07:59
    expect(dagsAttKoa(new Date('2026-11-11T07:00:00Z'))).toBe(true); // 08:00
    expect(dagsAttKoa(new Date('2026-11-14T10:00:00Z'))).toBe(false); // lördag
    expect(dagsAttKoa(new Date('2026-11-15T10:00:00Z'))).toBe(false); // söndag
  });
  it('räknar sommartid rätt (08:00 svensk = 06:00 UTC i juni)', () => {
    expect(svenskVeckodagTimme(new Date('2026-06-10T06:00:00Z'))).toEqual({ veckodag: 3, timme: 8 });
    expect(dagsAttKoa(new Date('2026-06-10T05:59:00Z'))).toBe(false);
  });
  it('en gång i månaden: nyckeln är år och svensk månad', () => {
    expect(arshjulDedup(ONS_09)).toBe('arshjul:2026-11');
    expect(arshjulDedup(new Date('2026-11-30T23:30:00Z'))).toBe('arshjul:2026-12'); // 00:30 svensk tid 1 dec
  });
});

describe('texten', () => {
  it('flera att göra: antal i rubriken, de två första med namn, resten som "och N till"', () => {
    const t = arshjulText(rader(ONS_09), ONS_09)!;
    expect(t.title).toBe('Årshjulet: 7 saker att göra');
    expect(t.body).toBe('Riskbedömning – skulle gjorts i januari · Arbetsplatsträff, våren – skulle gjorts i mars · och 5 till');
  });
  it('en sak kvar: den står i rubriken, "dags nu" när det är dess månad', () => {
    const allt = ['apt_var', 'osa', 'kemikalier', 'apt_host'].map(p => ({ punkt: p as any, gjordTid: '2026-05-01T08:00:00Z', anteckning: null }));
    const r = rader(ONS_09, allt).map(x => (x.punkt.id === 'riskbedomning' || x.punkt.id === 'skyddsrond')
      ? { ...x, gjordTid: '2026-10-01T08:00:00Z', attGora: false } : x);
    const t = arshjulText(r, ONS_09)!;
    expect(t).toEqual({ title: 'Årshjulet: Hur gick året?', body: 'Hur gick året? – dags nu' });
  });
  it('inget att göra → ingen text (ingen push)', () => {
    expect(arshjulText(rader(new Date('2026-01-15T09:00:00Z')).map(x => ({ ...x, attGora: false })), ONS_09)).toBeNull();
  });
});

describe('utskicket byggs färskt', () => {
  it('skickar med länk till årshjulet', async () => {
    const u = await byggArshjulNotis({ typ: AM_ARSHJUL, skapad_at: ONS_09.toISOString() }, async () => rader(ONS_09), ONS_09);
    expect(u.typ).toBe('skicka');
    if (u.typ === 'skicka') expect(u.meddelande.url).toBe('/arbetsmiljo?ar=1');
  });
  it('läsfel → uppskjuts, aldrig "inget att göra"', async () => {
    expect((await byggArshjulNotis({ typ: AM_ARSHJUL }, async () => null, ONS_09)).typ).toBe('uppskjut');
  });
  it('allt gjort sedan köningen → skickas inte', async () => {
    const u = await byggArshjulNotis({ typ: AM_ARSHJUL }, async () => rader(ONS_09).map(x => ({ ...x, attGora: false })), ONS_09);
    expect(u).toEqual({ typ: 'hoppa_over', orsak: 'Ej skickad — inget att göra i årshjulet' });
  });
  it('köad för mer än ett dygn sedan → skickas aldrig', async () => {
    const hamta = vi.fn(async () => rader(ONS_09));
    const u = await byggArshjulNotis({ typ: AM_ARSHJUL, skapad_at: '2026-11-09T08:00:00Z' }, hamta, ONS_09);
    expect(u.typ).toBe('hoppa_over');
    expect(hamta).not.toHaveBeenCalled();
  });
});

// En liten databas i minnet: bara det producenten frågar efter.
function fakeDb(o: { koad?: boolean; medarbetare?: any[]; lasFel?: boolean }) {
  const anrop: string[] = [];
  const upserts: any[] = [];
  const svar = (data: any, error: any = null) => ({ data, error });
  const fran = (t: string) => {
    anrop.push(t);
    const q: any = {
      select: () => q, eq: () => q, limit: () => q, order: () => q,
      then: (res: any) => res(
        t === 'notis_kö' ? svar(o.koad ? [{ id: 1 }] : [])
          : t === 'medarbetare' ? svar(o.medarbetare ?? [])
          : t === 'am_arshjul_gjort' ? svar([], o.lasFel ? { message: 'nej' } : null)
          : t === 'am_riskbedomning' ? svar([])
          : svar([]),
      ),
      upsert: (r: any[]) => { upserts.push(...r); return { select: async () => svar(r.map(x => ({ dedup_nyckel: x.dedup_nyckel }))) }; },
    };
    return q;
  };
  return { sb: { from: fran } as any, anrop, upserts };
}

describe('producenten', () => {
  const folk = [
    { id: 'martin', aktiv: true, roll: 'admin', skyddsombud: false },
    { id: 'stefan', aktiv: true, roll: 'forare', skyddsombud: true },
    { id: 'oskar', aktiv: true, roll: 'forare', skyddsombud: false },
    { id: 'gammal', aktiv: false, roll: 'admin', skyddsombud: false },
  ];
  it('köar en rad per aktiv admin och skyddsombud, aldrig förare eller inaktiva', async () => {
    const db = fakeDb({ medarbetare: folk });
    const r = await koaArshjulPaminnelse(db.sb, ONS_09);
    expect(r).toEqual({ ok: true, koade: 2 });
    expect(db.upserts.map(x => x.mottagare_id).sort()).toEqual(['martin', 'stefan']);
    expect(db.upserts.every(x => x.typ === AM_ARSHJUL && x.skickas_at === 'infinity' && x.dedup_nyckel === 'arshjul:2026-11')).toBe(true);
  });
  it('redan köad denna månad → läser inte årshjulet alls', async () => {
    const db = fakeDb({ koad: true, medarbetare: folk });
    expect((await koaArshjulPaminnelse(db.sb, ONS_09)).koade).toBe(0);
    expect(db.anrop).toEqual(['notis_kö']);
  });
  it('helg → rör inte databasen', async () => {
    const db = fakeDb({ medarbetare: folk });
    await koaArshjulPaminnelse(db.sb, new Date('2026-11-14T10:00:00Z'));
    expect(db.anrop).toEqual([]);
  });
  it('årshjulet går inte att läsa → fel, ingenting köas', async () => {
    const db = fakeDb({ medarbetare: folk, lasFel: true });
    const r = await koaArshjulPaminnelse(db.sb, ONS_09);
    expect(r.ok).toBe(false);
    expect(db.upserts).toHaveLength(0);
  });
});
