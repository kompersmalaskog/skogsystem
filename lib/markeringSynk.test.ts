import { describe, it, expect } from 'vitest';
import {
  andradTid, markeringNyckel, sammanfoga, skapaMarkeringSynk, skapaMinnesSynkLager, synkBackoffMs,
  type ServerInfo, type ServerRad, type SynkDeps, type VantandeMarkering,
} from './markeringSynk';

const OBJ = 'objekt-1';
const mk = (id: number | string, extra: Record<string, any> = {}) => ({ id, type: 'wet', isMarker: true, x: 1, y: 2, comment: '', ...extra });
const rad = (id: number | string, extra: Record<string, any> = {}): ServerRad => ({ marker_id: String(id), data: mk(id, extra) });
const vant = (id: number | string, o: Partial<VantandeMarkering> & { data?: any } = {}): VantandeMarkering => ({
  nyckel: markeringNyckel(OBJ, id), objektId: OBJ, markerId: String(id), op: 'upsert', typ: 'symbol',
  data: o.op === 'delete' ? null : { ...mk(id), andradTs: o.andrad ?? 100, ...(o.data ?? {}) }, andrad: 100, forsok: 0, nastaForsok: 0, ...o,
});

// ── En låtsasserver + nät som kan slås av ────────────────────────────────────────────────────────────────────────────
function fake(o: { lager?: ReturnType<typeof skapaMinnesSynkLager>; klocka?: { t: number } } = {}) {
  const lager = o.lager ?? skapaMinnesSynkLager();
  const klocka = o.klocka ?? { t: 1_000 };
  const server = new Map<string, any>();                       // marker_id → data (objekt-1)
  const sv = { online: true, anrop: { upsert: 0, delete: 0, info: 0 }, synkade: [] as string[][], krockar: [] as any[], forandringar: 0 };
  const deps: SynkDeps = {
    lager, nu: () => klocka.t,
    lasInfo: async (_o, ids) => {
      sv.anrop.info++;
      if (!sv.online) return null;
      const m = new Map<string, ServerInfo>();
      for (const id of ids) if (server.has(id)) m.set(id, { andradTs: andradTid(server.get(id)), photoPath: server.get(id).photoPath ?? null, photoTs: server.get(id).photoTs ?? null });
      return m;
    },
    skrivUpsert: async (rader) => { sv.anrop.upsert++; if (!sv.online) return false; for (const r of rader) server.set(r.marker_id, r.data); return true; },
    skrivDelete: async (_o, id) => { sv.anrop.delete++; if (!sv.online) return false; server.delete(id); return true; },
    paForandring: () => { sv.forandringar++; },
    paSynkad: (r) => { sv.synkade.push(r.markerIds); },
    paKrock: (k) => { sv.krockar.push(k); },
  };
  return { lager, klocka, server, sv, deps, ko: skapaMarkeringSynk(deps) };
}
const serverRader = (server: Map<string, any>): ServerRad[] => Array.from(server.entries()).map(([id, data]) => ({ marker_id: id, data }));

describe('sammanfoga — serverns rader + lokala väntande ändringar ovanpå', () => {
  it('serverns rader utan väntande ändringar kommer ut orörda och i ordning', () => {
    const r = sammanfoga([rad(1), rad(2)], []);
    expect(r.markers.map((m) => m.id)).toEqual([1, 2]);
    expect(r.krockar).toEqual([]);
  });
  it('en NY lokal markering som servern inte har ligger kvar (hämtningen tar inte bort den) — Martins fall', () => {
    const r = sammanfoga([rad(1)], [vant(99)]);
    expect(r.markers.map((m) => m.id)).toEqual([1, 99]);
  });
  it('utan täckning och utan sparad serverbild: bara de lokala syns', () => {
    expect(sammanfoga([], [vant(5), vant(6)]).markers.map((m) => m.id)).toEqual([5, 6]);
  });
  it('en lokal ändring ersätter serverns version av samma markering', () => {
    const r = sammanfoga([rad(1, { comment: 'server' })], [vant(1, { andrad: 200, data: { comment: 'lokal' } })]);
    expect(r.markers.length).toBe(1);
    expect(r.markers[0].comment).toBe('lokal');
    expect(r.krockar.map((k) => k.typ)).toEqual(['lokal_nyare']);
  });
  it('en väntande RADERING tar bort markeringen ur resultatet även om servern ännu har den — den återuppstår aldrig', () => {
    const r = sammanfoga([rad(1), rad(2)], [vant(1, { op: 'delete' })]);
    expect(r.markers.map((m) => m.id)).toEqual([2]);
  });
  it('KROCK: servern har en NYARE version (annan enhet) → senaste ändring vinner, serverns behålls, den lokala släpps och loggas', () => {
    const r = sammanfoga([{ marker_id: '1', data: mk(1, { comment: 'annan enhet', andradTs: 500 }) }], [vant(1, { andrad: 300, data: { comment: 'min' } })]);
    expect(r.markers[0].comment).toBe('annan enhet');
    expect(r.ersatta).toEqual([markeringNyckel(OBJ, 1)]);
    expect(r.krockar[0]).toMatchObject({ typ: 'server_nyare', lokal: 300, server: 500 });
  });
  it('serverrad utan andradTs (skriven före synken) räknas som äldst: lokal ändring vinner', () => {
    expect(andradTid(mk(1))).toBe(0);
    expect(sammanfoga([rad(1, { comment: 'gammal' })], [vant(1, { andrad: 10, data: { comment: 'ny' } })]).markers[0].comment).toBe('ny');
  });
  it('raderad lokalt trots nyare serverändring: raderingen vinner (borttagningar återuppstår aldrig) och krocken loggas', () => {
    const r = sammanfoga([{ marker_id: '1', data: mk(1, { andradTs: 900 }) }], [vant(1, { op: 'delete', andrad: 100 })]);
    expect(r.markers).toEqual([]);
    expect(r.krockar[0].typ).toBe('raderad_lokalt_efter_serverandring');
  });
  it('nya lokala markeringar läggs sist i ändringsordning', () => {
    const r = sammanfoga([rad(1)], [vant(8, { andrad: 300 }), vant(7, { andrad: 200 })]);
    expect(r.markers.map((m) => m.id)).toEqual([1, 7, 8]);
  });
});

describe('kön — lokalt först, sedan servern, aldrig kasta', () => {
  it('laggUpsert sparar LOKALT innan servern rörs: ingenting går ut förrän kön körs, och markeringen får andradTs', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    expect(f.sv.anrop).toEqual({ upsert: 0, delete: 0, info: 0 });
    const v = await f.lager.get(markeringNyckel(OBJ, 1));
    expect(v!.op).toBe('upsert');
    expect(v!.data!.andradTs).toBe(1_000);
  });
  it('utan täckning: försöket misslyckas, markeringen ligger kvar, försök räknas upp och väntetiden växer — kastar aldrig', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    await expect(f.ko.kor(true)).resolves.toBeUndefined();
    let v = (await f.lager.get(markeringNyckel(OBJ, 1)))!;
    expect(v.forsok).toBe(1);
    expect(v.nastaForsok).toBe(1_000 + synkBackoffMs(1));
    await f.ko.kor(true);
    v = (await f.lager.get(markeringNyckel(OBJ, 1)))!;
    expect(v.forsok).toBe(2);
    expect(v.nastaForsok).toBe(1_000 + synkBackoffMs(2));
    expect(synkBackoffMs(1)).toBeLessThan(synkBackoffMs(2));
    expect(synkBackoffMs(30)).toBe(2 * 60_000);
  });
  it('nätet tillbaka: markeringen skickas, tas ur lagret och meddelas som synkad', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1, { comment: 'hej' }), 'symbol');
    await f.ko.kor(true);
    f.sv.online = true;
    await f.ko.kor(true);
    expect(f.server.get('1').comment).toBe('hej');
    expect(await f.lager.alla()).toEqual([]);
    expect(f.sv.synkade).toEqual([['1']]);
  });
  it('utan tvinga hoppar kön över poster vars väntetid inte gått ut', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    await f.ko.kor(true);
    f.sv.online = true;
    await f.ko.kor(false);
    expect(f.server.has('1')).toBe(false);
    f.klocka.t += synkBackoffMs(1) + 1;
    await f.ko.kor(false);
    expect(f.server.has('1')).toBe(true);
  });
  it('en ändring som görs MEDAN den förra skickas tas inte bort av kvitteringen — den nyare skickas nästa varv', async () => {
    const f = fake();
    const orig = f.deps.skrivUpsert;
    let gjort = false;
    f.deps.skrivUpsert = async (r) => { if (!gjort) { gjort = true; await f.ko.laggUpsert(OBJ, mk(1, { comment: 'nyare' }), 'symbol'); } return orig(r); };
    await f.ko.laggUpsert(OBJ, mk(1, { comment: 'första' }), 'symbol');
    await f.ko.kor(true);
    expect((await f.lager.get(markeringNyckel(OBJ, 1)))!.data!.comment).toBe('nyare');
    await f.ko.kor(true);
    expect(f.server.get('1').comment).toBe('nyare');
    expect(await f.lager.alla()).toEqual([]);
  });
  it('två ändringar i samma millisekund får olika stämpel (kvittering av den förra tar inte den senare)', async () => {
    const f = fake();
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    const a = (await f.lager.get(markeringNyckel(OBJ, 1)))!.andrad;
    await f.ko.laggUpsert(OBJ, mk(1, { comment: 'x' }), 'symbol');
    const b = (await f.lager.get(markeringNyckel(OBJ, 1)))!.andrad;
    expect(b).toBeGreaterThan(a);
  });
  it('en radering ersätter en väntande ändring (EN post per markering) och skickas som DELETE — ingen upsert som kan återuppliva den', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    await f.ko.laggDelete(OBJ, '1');
    expect((await f.lager.alla()).map((v) => v.op)).toEqual(['delete']);
    f.sv.online = true;
    f.server.set('1', mk(1));
    await f.ko.kor(true);
    expect(f.server.has('1')).toBe(false);
    expect(f.sv.anrop.upsert).toBe(0);
    expect(await f.lager.alla()).toEqual([]);
  });
  it('en radering utan täckning ligger kvar som grav och försöker igen', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggDelete(OBJ, '1');
    await f.ko.kor(true);
    expect((await f.lager.alla())[0]).toMatchObject({ op: 'delete', forsok: 1 });
    f.sv.online = true;
    await f.ko.kor(true);
    expect(await f.lager.alla()).toEqual([]);
  });
  it('KROCK vid sändning: servern har en nyare version → vår släpps (inte skriven), krocken loggas', async () => {
    const f = fake();
    f.server.set('1', mk(1, { comment: 'annan enhet', andradTs: 9_000 }));
    await f.ko.laggUpsert(OBJ, mk(1, { comment: 'min' }), 'symbol');   // andradTs 1000
    await f.ko.kor(true);
    expect(f.server.get('1').comment).toBe('annan enhet');
    expect(f.sv.anrop.upsert).toBe(0);
    expect(f.sv.krockar[0]).toMatchObject({ typ: 'server_nyare', lokal: 1_000, server: 9_000 });
    expect(await f.lager.alla()).toEqual([]);
  });
  it('en äldre lokal version skriver aldrig bort ett foto som fotokön hunnit koppla på raden', async () => {
    const f = fake();
    f.server.set('1', mk(1, { photoPath: 'o/1.jpg', photoTs: 777 }));    // serverns rad har inget andradTs → äldre än vår
    await f.ko.laggUpsert(OBJ, mk(1, { comment: 'text' }), 'symbol');
    await f.ko.kor(true);
    expect(f.server.get('1')).toMatchObject({ comment: 'text', photoPath: 'o/1.jpg', photoTs: 777 });
  });
  it('krockkontrollen blockerar aldrig sparningen: går serverns tider inte att läsa efter två försök skickas ändringen ändå', async () => {
    const f = fake();
    f.deps.lasInfo = async () => null;                        // t.ex. en select som servern inte förstår — men skrivningen fungerar
    const ko = skapaMarkeringSynk(f.deps);
    await ko.laggUpsert(OBJ, mk(1), 'symbol');
    await ko.kor(true); await ko.kor(true);
    expect(f.server.has('1')).toBe(false);                    // två första varven: räknas som misslyckade
    await ko.kor(true);
    expect(f.server.has('1')).toBe(true);                     // tredje: skickas utan kontroll
    expect(await f.lager.alla()).toEqual([]);
  });
  it('om serverns tider inte går att läsa (nätfel) skrivs inget och försöket räknas upp', async () => {
    const f = fake();
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    f.sv.online = false;
    await f.ko.kor(true);
    expect(f.sv.anrop.upsert).toBe(0);
    expect((await f.lager.get(markeringNyckel(OBJ, 1)))!.forsok).toBe(1);
  });
  it('flera markeringar i samma objekt går i ETT upsert-anrop', async () => {
    const f = fake();
    for (const id of [1, 2, 3, 4, 5]) await f.ko.laggUpsert(OBJ, mk(id), 'symbol');
    await f.ko.kor(true);
    expect(f.sv.anrop.upsert).toBe(1);
    expect(Array.from(f.server.keys()).sort()).toEqual(['1', '2', '3', '4', '5']);
  });
  it('ett varv i taget: två samtidiga körningar delar samma varv', async () => {
    const f = fake();
    await f.ko.laggUpsert(OBJ, mk(1), 'symbol');
    await Promise.all([f.ko.kor(true), f.ko.kor(true)]);
    expect(f.sv.anrop.upsert).toBe(1);
  });
  it('kastar aldrig: ett undantag i skrivningen blir ett räknat försök', async () => {
    const f = fake();
    f.deps.skrivUpsert = async () => { throw new Error('nätet dog'); };
    const ko = skapaMarkeringSynk(f.deps);
    await ko.laggUpsert(OBJ, mk(1), 'symbol');
    await expect(ko.kor(true)).resolves.toBeUndefined();
    expect((await f.lager.get(markeringNyckel(OBJ, 1)))!.forsok).toBe(1);
  });
});

describe('Martins fall och stängd app', () => {
  it('flygplansläge → symbol → nät på → hämtning: symbolen LIGGER KVAR och synkas (och en annan enhet ser den)', async () => {
    const f = fake();
    f.server.set('10', mk(10));                                   // fanns redan på servern
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1792073279866), 'symbol');      // satt i flygplansläge
    await f.ko.kor(true);                                          // försök utan nät: misslyckas
    // nätet kommer tillbaka: sidan hämtar — FÖRE hämtningen körs kön
    f.sv.online = true;
    await f.ko.kor(true);
    const efterHamtning = sammanfoga(serverRader(f.server), await f.ko.vantande(OBJ));
    expect(efterHamtning.markers.map((m) => m.id).sort()).toEqual([10, 1792073279866]);
    // annan enhet läser servern:
    expect(f.server.has('1792073279866')).toBe(true);
  });
  it('även när kön INTE hunnit skicka före hämtningen ligger symbolen kvar i det som visas (sammanfogningen skyddar)', async () => {
    const f = fake();
    f.sv.online = false;
    await f.ko.laggUpsert(OBJ, mk(1792073279866), 'symbol');
    const visas = sammanfoga([rad(10)], await f.ko.vantande(OBJ)).markers;     // servern (utan symbolen) hämtades, kön fick inte iväg den
    expect(visas.map((m) => m.id)).toEqual([10, 1792073279866]);
  });
  it('5 markeringar i flygplansläge → appen stängs helt → öppnas (ny kö över samma lager) → de syns → nät på → synkas', async () => {
    const lager = skapaMinnesSynkLager();
    const a = fake({ lager });
    a.sv.online = false;
    for (const id of [1, 2, 3, 4, 5]) await a.ko.laggUpsert(OBJ, mk(id), 'symbol');
    await a.ko.kor(true);
    // — appen stängs: allt i minnet är borta, lagret (IndexedDB) består —
    const b = fake({ lager });
    const synliga = sammanfoga([], await b.ko.vantande(OBJ)).markers;
    expect(synliga.map((m) => m.id)).toEqual([1, 2, 3, 4, 5]);
    b.sv.online = true;
    await b.ko.kor(true);
    expect(Array.from(b.server.keys()).sort()).toEqual(['1', '2', '3', '4', '5']);
    expect(await lager.alla()).toEqual([]);
  });
  it('en radering som gjorts utan täckning återuppstår inte när servern hämtas medan den väntar', async () => {
    const f = fake();
    f.server.set('1', mk(1));
    f.sv.online = false;
    await f.ko.laggDelete(OBJ, '1');
    const visas = sammanfoga(serverRader(f.server), await f.ko.vantande(OBJ)).markers;
    expect(visas).toEqual([]);
    f.sv.online = true;
    await f.ko.kor(true);
    expect(f.server.has('1')).toBe(false);
  });
});

// Den GAMLA sidans logik, återskapad (page.tsx går inte att montera i test): bevisar vad som hände med Martins symbol.
describe('orsaken, återskapad: den gamla sidan tappade symbolen', () => {
  it('gamla flödet (markerad som sparad före upserten; misslyckad upsert loggas bara; refetch ersätter minnet) → symbolen försvinner', async () => {
    const server = new Map<string, any>([['10', mk(10)]]);
    let online = false;
    let minne: any[] = [mk(10)];
    const persistedIds = new Set(['10']);
    const snapshot = new Map<string, string>([['10', JSON.stringify(mk(10))]]);
    const upsert = async (m: any) => { if (!online) return false; server.set(String(m.id), m); return true; };
    // 1) symbolen sätts offline: create-effekten markerar den som sparad INNAN upserten, upserten misslyckas och loggas bara
    const ny = mk(1792073279866);
    minne = [...minne, ny];
    persistedIds.add(String(ny.id)); snapshot.set(String(ny.id), JSON.stringify(ny));
    expect(await upsert(ny)).toBe(false);
    // 2) den debouncade synken skriver bara "dirty" — men symbolen ser REN ut, så den försöker aldrig igen
    const dirty = minne.filter((m) => snapshot.get(String(m.id)) !== JSON.stringify(m));
    expect(dirty).toEqual([]);
    // 3) nätet kommer tillbaka → refetch ERSÄTTER minnet med serverns rader
    online = true;
    minne = Array.from(server.values());
    expect(minne.map((m) => m.id)).toEqual([10]);   // symbolen är borta, och inget finns kvar att skicka
  });
});
