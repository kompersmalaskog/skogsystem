/**
 * Besök till MASKINEN som push (lib/hytt/maskinPush). Bevisar:
 *  • notisen går till prenumerationer med maskin_id = en maskin som hör till objektet – aldrig till förarens telefon (maskin_id null) eller en annan maskin,
 *  • det spelar ingen roll vem som är inloggad i maskinen (prenumerationens medarbetare_id är irrelevant),
 *  • notisen är SAMMA som sidan skapar lokalt (samma tag/data) och bär PRENUMERATIONENS maskin – det Uppfattat kvitterar för,
 *  • döda prenumerationer städas, ett läsfel säger sig (ingen tyst tomhet).
 */
import { describe, expect, it } from 'vitest';
import { fakeSb } from '@/lib/besok/fakeSb.testStod';
import { besokPush, skickaBesokTillMaskiner } from './maskinPush';
import { besokNotis } from './notiser';

const NU = new Date('2026-10-26T09:00:00Z');
const OBJ = '00000000-0000-4000-8000-0000000000aa';
const BESOK = { id: '11111111-1111-4111-8111-111111111111', objekt_id: OBJ, namn: 'Anna Svensson', besokstid: new Date(NU.getTime() + 30 * 60000).toISOString() };

const dim = [
  { maskin_id: 'A130743', visningsnamn: 'Elefant 26', maskin_typ: 'Forwarder' },
  { maskin_id: 'GRANNE', visningsnamn: 'Granne', maskin_typ: 'Harvester' },
];
const sub = (id: string, maskin_id: string | null, medarbetare_id: string) => ({ id, subscription: { endpoint: `https://push/${id}` }, maskin_id, medarbetare_id });
const tabeller = (subs: any[]) => ({
  objekt: [{ id: OBJ, namn: 'Skälviken', skordare_maskin_id: null, skotare_maskin_id: 'A130743' }],
  hyttspar: [], dim_maskin: dim, push_subscriptions: subs,
});

describe('besök → maskinens prenumerationer', () => {
  it('Elefantens dator (anmäld under Daniel) får notisen; förarens telefon och en annan maskin får ingenting', async () => {
    const sb = fakeSb(tabeller([sub('dator', 'A130743', 'daniel'), sub('telefon', null, 'oskar'), sub('annan', 'GRANNE', 'max')]));
    const skickat: { endpoint: string; payload: any }[] = [];
    const r = await skickaBesokTillMaskiner(sb, async (s, p) => { skickat.push({ endpoint: (s as any).endpoint, payload: JSON.parse(p) }); }, BESOK, NU);
    expect(r).toMatchObject({ ok: true, maskiner: 1, prenumerationer: 1, skickade: 1 });
    expect(skickat.map((x) => x.endpoint)).toEqual(['https://push/dator']);
  });

  it('annan förare inloggad i maskinen: samma maskin-prenumeration får notisen oavsett medarbetare_id', async () => {
    for (const medarbetare of ['daniel', 'oskar', 'max']) {
      const sb = fakeSb(tabeller([sub('dator', 'A130743', medarbetare)]));
      const skickat: string[] = [];
      await skickaBesokTillMaskiner(sb, async (s) => { skickat.push((s as any).endpoint); }, BESOK, NU);
      expect(skickat).toEqual(['https://push/dator']);
    }
  });

  it('två datorer på samma maskin (t.ex. en iPad och Ponsse-datorn) får var sin notis', async () => {
    const sb = fakeSb(tabeller([sub('dator', 'A130743', 'daniel'), sub('ipad', 'A130743', 'martin')]));
    const r = await skickaBesokTillMaskiner(sb, async () => undefined, BESOK, NU);
    expect(r.skickade).toBe(2);
  });

  it('notisen är den sidan skapar lokalt (samma tag och data) – med prenumerationens maskin, så Uppfattat kvitterar för rätt maskin', async () => {
    const sb = fakeSb(tabeller([sub('dator', 'A130743', 'daniel')]));
    let payload: any = null;
    await skickaBesokTillMaskiner(sb, async (_s, p) => { payload = JSON.parse(p); }, BESOK, NU);
    const lokal = besokNotis({ id: BESOK.id, namn: BESOK.namn, besokstid: BESOK.besokstid }, { trakt: 'Skälviken', maskinId: 'A130743', test: false, url: '/planering', nu: NU, paminnelse: false });
    expect(payload.hyttNotis).toEqual(JSON.parse(JSON.stringify(lokal)));
    expect(payload.hyttNotis.tag).toBe(`besok-${BESOK.id}`);
    expect(payload.hyttNotis.data).toMatchObject({ hytt: true, typ: 'besok', besokId: BESOK.id, maskinId: 'A130743' });
    expect(payload.hyttNotis.knappar.map((k: any) => k.action)).toEqual(['uppfattat', 'visa']);
  });

  it('ingen personuppgift i pushen: inget telefonnummer, ingen förare, inget medarbetar-id', async () => {
    const sb = fakeSb(tabeller([sub('dator', 'A130743', 'daniel-secret-id')]));
    let rå = '';
    await skickaBesokTillMaskiner(sb, async (_s, p) => { rå = p; }, { ...BESOK, telefon: '0701234567' } as any, NU);
    expect(rå).not.toContain('0701234567');
    expect(rå).not.toContain('daniel-secret-id');
  });

  it('en prenumeration som är död (410) tas bort; en som kastar annat lämnas', async () => {
    const t = tabeller([sub('dod', 'A130743', 'a'), sub('nat', 'A130743', 'b')]);
    const raderade: string[] = [];
    const sb = fakeSb(t);
    const orig = sb.from.bind(sb);
    sb.from = (tabell: string) => {
      const b = orig(tabell);
      if (tabell === 'push_subscriptions') b.delete = () => ({ in: async (_k: string, ids: string[]) => { raderade.push(...ids); return { error: null }; } });
      return b;
    };
    const r = await skickaBesokTillMaskiner(sb, async (s) => {
      if ((s as any).endpoint.endsWith('dod')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      throw new Error('nät');
    }, BESOK, NU);
    expect(raderade).toEqual(['dod']);
    expect(r).toMatchObject({ ok: true, prenumerationer: 2, skickade: 0 });
  });

  it('inga maskiner på objektet → ingen push och inget fel; läsfel → fel som sägs (ingen tyst tomhet)', async () => {
    const tom = fakeSb({ objekt: [{ id: OBJ, skordare_maskin_id: null, skotare_maskin_id: null }], hyttspar: [], dim_maskin: dim, push_subscriptions: [sub('dator', 'A130743', 'd')] });
    expect(await skickaBesokTillMaskiner(tom, async () => { throw new Error('ska inte anropas'); }, BESOK, NU)).toMatchObject({ ok: true, maskiner: 0, skickade: 0 });
    const fel = fakeSb(tabeller([]), {}, { fel: { push_subscriptions: 'column "maskin_id" does not exist' } });
    const r = await skickaBesokTillMaskiner(fel, async () => undefined, BESOK, NU);
    expect(r.ok).toBe(false);
    expect(r.fel).toContain('maskin_id');
    const hyttsparFel = fakeSb(tabeller([]), {}, { fel: { hyttspar: 'nät' } });
    expect((await skickaBesokTillMaskiner(hyttsparFel, async () => undefined, BESOK, NU)).ok).toBe(false);
  });
});

describe('besokPush', () => {
  it('är besöksnotisen utan påminnelse, för den maskin prenumerationen tillhör', () => {
    const p = besokPush({ id: 'b', namn: 'Anna', besokstid: NU.toISOString() }, { trakt: 'Skälviken', maskinId: 'A130743', nu: NU });
    expect(p.hyttNotis.typ).toBe('besok');
    expect(p.hyttNotis.renotify).toBe(false);
    expect(p.hyttNotis.data.maskinId).toBe('A130743');
    expect(p.hyttNotis.text).toContain('Skälviken');
    expect(p.hyttNotis.data.test).toBe(false);   // en riktig server-push är aldrig ett testläge
  });
});
